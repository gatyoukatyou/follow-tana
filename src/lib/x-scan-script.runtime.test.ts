import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildScanScript, scanTargetHandles } from "@/lib/x-scan-script";

/**
 * 生成した生存確認コードを jsdom で実際に走らせる。
 * X の役は「popstate を受けたら SearchTimeline を XHR で発行して応答する」偽物で演じる。
 * 文字列の含有チェックでは拾えない実行時エラー（const 再代入など）を捕まえるためのテスト。
 */

type ResHeaders = Record<string, string>;

class FakeXHR extends EventTarget {
  static sent: FakeXHR[] = [];
  url = "";
  method = "";
  reqHeaders: Record<string, string> = {};
  status = 0;
  responseText = "";
  private resHeaders: ResHeaders = {};
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.reqHeaders[k] = v;
  }
  send() {
    FakeXHR.sent.push(this);
  }
  getResponseHeader(k: string): string | null {
    return this.resHeaders[k.toLowerCase()] ?? null;
  }
  respond(status: number, body: unknown, headers: ResHeaders) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.resHeaders = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    this.dispatchEvent(new Event("load"));
  }
}

const SINCE_MS = Date.parse(
  new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10) + "T00:00:00Z",
);

function tweetEntry(
  sn: string,
  daysAgo: number,
  i: number,
  nested?: { rt?: string; quote?: string },
) {
  const legacy: Record<string, unknown> = {
    created_at: new Date(Date.now() - daysAgo * 864e5).toUTCString(),
    full_text: `post ${i}`,
  };
  const user = (name: string) => ({
    rest_id: `id-${name}`,
    core: { screen_name: name, name: `名前 ${name}` },
    legacy: { profile_image_url_https: "https://pbs.twimg.com/x_normal.jpg" },
  });
  const tweetOf = (name: string) => ({
    legacy: { ...legacy },
    core: { user_results: { result: user(name) } },
  });
  const result: Record<string, unknown> = { ...tweetOf(sn) };
  if (nested?.rt)
    (result.legacy as Record<string, unknown>).retweeted_status_result = {
      result: tweetOf(nested.rt),
    };
  if (nested?.quote) result.quoted_status_result = { result: tweetOf(nested.quote) };
  return {
    entryId: `tweet-${i}`,
    content: { entryType: "TimelineTimelineItem", itemContent: { tweet_results: { result } } },
  };
}

function searchResponse(entries: unknown[]) {
  return {
    data: {
      search_by_raw_query: {
        search_timeline: { timeline: { instructions: [{ type: "TimelineAddEntries", entries }] } },
      },
    },
  };
}

function searchUrl(rawQuery: string, cursor?: string) {
  const vars: Record<string, unknown> = { rawQuery, count: cursor ? 40 : 20, product: "Latest" };
  if (cursor) vars.cursor = cursor;
  return `https://x.com/i/api/graphql/abc123/SearchTimeline?variables=${encodeURIComponent(JSON.stringify(vars))}`;
}

/** 偽の X：検索ページへ SPA 遷移されたら、決められた台本で応答する */
function fakeX(
  script: (q: string, n: number) => { entries: unknown[]; remaining: number; alsoCursor?: boolean },
) {
  let n = 0;
  const onPop = () => {
    const q = new URLSearchParams(window.location.search).get("q") ?? "";
    n += 1;
    const plan = script(q, n);
    setTimeout(() => {
      const x = new XMLHttpRequest() as unknown as FakeXHR;
      x.open("GET", searchUrl(q));
      x.setRequestHeader("x-client-transaction-id", "signed-by-x");
      x.send();
      x.respond(200, searchResponse(plan.entries), {
        "x-rate-limit-limit": "50",
        "x-rate-limit-remaining": String(plan.remaining),
        "x-rate-limit-reset": "1789775405",
      });
      if (plan.alsoCursor) {
        const c = new XMLHttpRequest() as unknown as FakeXHR;
        c.open("GET", searchUrl(q, "CURSOR"));
        c.send();
      }
    }, 10);
  };
  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}

function messages(postMessage: ReturnType<typeof vi.fn>) {
  return postMessage.mock.calls.map((c) => c[0] as Record<string, unknown>);
}

describe("生存確認コードの実行（jsdom）", () => {
  const postMessage = vi.fn();
  let detachX: () => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    FakeXHR.sent = [];
    postMessage.mockReset();
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    vi.stubGlobal("confirm", () => true);
    vi.stubGlobal("alert", () => {});
    Object.defineProperty(window, "opener", { value: { postMessage }, configurable: true });
    document.cookie = "ct0=abc";
    window.history.replaceState({}, "", "/search?q=from%3AX&src=typed_query&f=live");
  });

  afterEach(() => {
    detachX();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("1組を検索し、出た人は生存・出なかった人は休眠として送る（飽和なし）", async () => {
    const handles = Array.from({ length: 20 }, (_, i) => `tana_${String(i + 1).padStart(2, "0")}`);
    detachX = fakeX(() => ({
      entries: [
        tweetEntry("tana_01", 3, 1),
        tweetEntry("tana_02", 40, 2, { rt: "tana_03" }), // RT：実行者 tana_02 に帰属、tana_03 は数えない
        tweetEntry("tana_04", 200, 3, { quote: "tana_05" }), // 引用元 tana_05 は数えない
      ],
      remaining: 49,
      alsoCursor: true,
    }));
    new Function(buildScanScript(handles))();
    await vi.advanceTimersByTimeAsync(10_000);

    const progress = messages(postMessage).filter((m) => m.type === "progress");
    expect(progress).toHaveLength(1);
    const m = progress[0];
    expect(m.source).toBe("follow-tana");
    expect(m.op).toBe("Scan");
    expect(m.round).toBe(1);
    expect(m.checked).toEqual(handles);
    expect(m.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m.rl).toEqual({ remaining: 49, limit: 50, resetAt: 1_789_775_405_000 });
    const profiles = m.profiles as { h: string; lp: number; lt: string }[];
    expect(profiles).toHaveLength(20);
    const alive = profiles
      .filter((p) => p.lp >= SINCE_MS)
      .map((p) => p.h)
      .sort();
    expect(alive).toEqual(["tana_01", "tana_02", "tana_04"]);
    const dormant = profiles.filter((p) => p.lp < SINCE_MS);
    expect(dormant).toHaveLength(17);
    expect(dormant.map((p) => p.h)).toContain("tana_03");
    expect(dormant.map((p) => p.h)).toContain("tana_05");
    expect(dormant.every((p) => p.lt === "1年以上投稿なし（検索で確認）")).toBe(true);
    expect(m.count).toBe(20);
    // 自動の2ページ目（cursor 付き）は X に送らない
    expect(FakeXHR.sent.some((x) => /CURSOR/.test(x.url))).toBe(false);
    expect(messages(postMessage).at(-1)?.type).toBe("done");
  });

  it("飽和した組は出なかった人を次の組に組み直し、枠ゼロで interval を送る", async () => {
    const handles = Array.from({ length: 25 }, (_, i) => `tana_${String(i + 1).padStart(2, "0")}`);
    const seenQueries: string[] = [];
    detachX = fakeX((q, n) => {
      seenQueries.push(q);
      if (n === 1) {
        // 20件すべて tana_01 の投稿＝飽和。残り19人は保留
        return {
          entries: Array.from({ length: 20 }, (_, i) => tweetEntry("tana_01", i + 1, i)),
          remaining: 1,
        };
      }
      if (n === 2) {
        // 組み直し：保留19人＋新規1人。応答なし＝全員休眠。ここで枠ゼロ
        return { entries: [], remaining: 0 };
      }
      // 枠が戻った後の最後の4人
      return { entries: [tweetEntry("tana_25", 5, 0)], remaining: 49 };
    });
    new Function(buildScanScript(handles))();
    await vi.advanceTimersByTimeAsync(20_000);

    let ms = messages(postMessage);
    const p1 = ms.find((m) => m.type === "progress" && m.round === 1)!;
    expect((p1.profiles as unknown[]).length).toBe(1); // 飽和：休眠は確定しない
    const p2 = ms.find((m) => m.type === "progress" && m.round === 2)!;
    expect(p2.checked).toHaveLength(20);
    expect((p2.checked as string[]).slice(0, 19)).toEqual(handles.slice(1, 20)); // 保留が先頭に戻る
    expect((p2.profiles as unknown[]).length).toBe(20);
    expect(ms.some((m) => m.type === "interval")).toBe(true);
    expect(ms.at(-1)?.type).toBe("interval");
    expect(seenQueries[1]).not.toContain("from:tana_01"); // 出た人は次の組に入らない

    // 枠の回復（resetAt は過去の時刻なので 60 秒待ち）
    await vi.advanceTimersByTimeAsync(70_000);
    ms = messages(postMessage);
    const p3 = ms.find((m) => m.type === "progress" && m.round === 3)!;
    expect(p3.checked).toEqual(handles.slice(21));
    expect(ms.at(-1)?.type).toBe("done");
  });

  it("検索ページ以外では動かない", () => {
    window.history.replaceState({}, "", "/home");
    new Function(buildScanScript(["tana_01"]))();
    expect(postMessage).not.toHaveBeenCalled();
  });
});

describe("scanTargetHandles", () => {
  it("昔フォローした人（addedAt が大きい）から並べる", () => {
    expect(
      scanTargetHandles([
        { handle: "newest", addedAt: 100 },
        { handle: "oldest", addedAt: 102 },
        { handle: "middle", addedAt: 101 },
      ]),
    ).toEqual(["oldest", "middle", "newest"]);
  });
});
