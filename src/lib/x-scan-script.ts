import { isValidHandle, normalizeHandle } from "@/lib/utils";
import type { ProfileSnapshot } from "@/lib/types";

/**
 * 生存確認スクリプト（SearchTimeline 方式・2026-09 v4 実測に基づく）
 *
 * 旧 v1.1 API（users/lookup・users/show）は消滅。主経路はまとめ検索：
 *   1. XMLHttpRequest をフックして SearchTimeline の応答全文を読む
 *      （window.fetch は効かない。Xの通信は全て XHR）
 *   2. pushState + popstate で X 自身にまとめ検索させる（署名は X が付け、再生不可）
 *   3. 20人/組。出た人→生存、出なかった人→飽和（20件満杯）なら保留で組み直し、
 *      飽和なしなら休眠確定（since の前日 0:00 を仮の最終投稿に付ける）
 *   4. 枠は 50回/15分。1検索=1枠。消費したら rl.resetAt を送って止まる
 *
 * 数えるのはタイムラインのエントリ直下の Tweet のみ。RT は実行者に帰属させ、
 * retweeted_status_result / quoted_status_result の入れ子は数えない。
 */
const SCAN = `(() => {
  const TARGETS = __TARGETS__;
  const handles = [];
  const seen = {};
  TARGETS.forEach((h) => {
    const v = String(h || "").replace(/^@/, "");
    const k = v.toLowerCase();
    if (v && !seen[k] && /^[A-Za-z0-9_]{1,15}$/.test(v)) {
      seen[k] = 1;
      handles.push(v);
    }
  });
  if (handles.length === 0) {
    alert("フォロー棚: 調べる人がいません。");
    return;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cookie = (n) => {
    const m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  };
  const loggedIn =
    !!cookie("ct0") ||
    /(?:^|; )twid=/.test(document.cookie) ||
    !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Profile_Link"]');
  if (!loggedIn) {
    alert("Xにログインしてから、検索結果ページでこのコードを実行してください。");
    return;
  }
  if (!/\\/search/.test(location.pathname)) {
    alert("フォロー棚: https://x.com/search?q=from%3AX&src=typed_query&f=live を開いてから貼ってください。");
    return;
  }
  const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const sinceMs = Date.parse(since + "T00:00:00Z");
  const dormantLp = sinceMs - 1;
  if (!confirm("フォロー棚: " + handles.length + "人を20人ずつまとめ検索で調べます。検索枠（50回/15分）を消費します。よろしいですか？")) return;

  let done = 0;
  let round = 0;
  let rl = { remaining: null, limit: null, resetAt: null };
  const send = (type, profiles, checked, rlNow) => {
    const payload = {
      source: "follow-tana",
      type: type,
      op: "Scan",
      round: round,
      since: since,
      checked: checked || [],
      count: done,
      expected: handles.length,
      rl: rlNow || rl,
      profiles: profiles || [],
    };
    try { if (window.opener) window.opener.postMessage(payload, "*"); } catch (e) {}
    document.title = "確認 " + done + "/" + handles.length + "人 " + (rlNow && rlNow.remaining != null ? "枠" + rlNow.remaining : "");
    return payload;
  };

  const twDate = (s) => {
    const t = Date.parse(s || "");
    return Number.isFinite(t) ? t : null;
  };

  // ---- XHR フック：SearchTimeline 応答を全文で記録。cursor 付き（自動2ページ目）は送らない ----
  const captured = [];
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send, XH = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ft = { url: String(url || ""), headers: {} };
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this.__ft) this.__ft.headers[String(k).toLowerCase()] = String(v);
    return XH.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    const ft = this.__ft;
    if (ft && /\\/SearchTimeline/.test(ft.url)) {
      let vars = {};
      try { vars = JSON.parse(new URL(ft.url, location.origin).searchParams.get("variables") || "{}"); } catch (e) {}
      if (vars.cursor) {
        // 自動の2ページ目は枠の節約のため送らない（カーソル追尾はしない設計）
        document.title = "確認 " + done + "/" + handles.length + "人 2ページ目を止めました";
        return;
      }
      const xhr = this;
      xhr.addEventListener("load", () => {
        const rl = {
          remaining: Number(xhr.getResponseHeader("x-rate-limit-remaining")),
          limit: Number(xhr.getResponseHeader("x-rate-limit-limit")),
          resetAt: (Number(xhr.getResponseHeader("x-rate-limit-reset")) || 0) * 1000,
        };
        if (Number.isFinite(rl.remaining) && Number.isFinite(rl.limit)) rl = rl;
        let j = null;
        try { j = JSON.parse(xhr.responseText); } catch (e) {}
        captured.push({ rawQuery: String(vars.rawQuery || ""), status: xhr.status, rl: rl, json: j });
      });
    }
    return XS.apply(this, arguments);
  };
  const restore = () => { XMLHttpRequest.prototype.open = XO; XMLHttpRequest.prototype.send = XS; XMLHttpRequest.prototype.setRequestHeader = XH; };

  // ---- 応答JSONから「エントリ直下のTweet」だけを集める（RT・引用の入れ子は数えない） ----
  const tweetsOf = (json) => {
    const out = [];
    const readTweet = (result) => {
      if (!result || typeof result !== "object") return;
      const legacy = result.legacy;
      if (!legacy || !legacy.created_at) return;
      let sn = "";
      let name = "";
      let av = "";
      let id = "";
      try {
        const ur = result.core && result.core.user_results && result.core.user_results.result;
        sn = (ur.core && ur.core.screen_name) || (ur.legacy && ur.legacy.screen_name) || "";
        name = (ur.core && ur.core.name) || (ur.legacy && ur.legacy.name) || "";
        av = String((ur.legacy && ur.legacy.profile_image_url_https) || "").replace("_normal", "_bigger");
        id = String(ur.rest_id || "");
      } catch (e) {}
      out.push({ sn, at: legacy.created_at, text: String(legacy.full_text || "").slice(0, 180), name, av, id });
    };
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      const content = n.content;
      if (content && content.entryType === "TimelineTimelineItem" && content.itemContent) {
        const r = content.itemContent.tweet_results && content.itemContent.tweet_results.result;
        readTweet(r && (r.tweet || r));
        return;
      }
      if (content && content.entryType === "TimelineTimelineModule" && Array.isArray(content.items)) {
        content.items.forEach((it) => {
          const r = it && it.item && it.item.itemContent && it.item.itemContent.tweet_results && it.item.itemContent.tweet_results.result;
          readTweet(r && (r.tweet || r));
        });
        return;
      }
      Object.values(n).forEach(walk);
    };
    try {
      const instr = json.data.search_by_raw_query.search_timeline.timeline.instructions;
      for (const ins of instr) {
        if (ins.type === "TimelineAddEntries" && Array.isArray(ins.entries)) ins.entries.forEach(walk);
      }
    } catch (e) {}
    return out;
  };

  const summarize = (group, tweets) => {
    const bySn = {};
    for (const t of tweets) {
      const k = String(t.sn).toLowerCase();
      if (!k) continue;
      if (!bySn[k] || Date.parse(t.at) > Date.parse(bySn[k].at)) bySn[k] = t;
    }
    const found = group.filter((h) => bySn[h.toLowerCase()]);
    const missing = group.filter((h) => !bySn[h.toLowerCase()]);
    return { bySn, found, missing, saturated: tweets.length >= 20 };
  };

  const pageSearch = async (group) => {
    const q = "(" + group.map((n) => "from:" + n).join(" OR ") + ") since:" + since + " include:nativeretweets";
    const capBefore = captured.length;
    const t0 = Date.now();
    history.pushState({}, "", "/search?q=" + encodeURIComponent(q) + "&src=typed_query&f=live");
    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    let got = null;
    for (let i = 0; i < 40 && !got; i++) {
      await sleep(300);
      got = captured.slice(capBefore).find((c) => c.rawQuery === q);
    }
    if (!got) await sleep(1500);
    return got || null;
  };

  const rowOfTweet = (t) => ({
    h: t.sn,
    id: t.id || "",
    n: t.name || "",
    av: t.av || "",
    lp: twDate(t.at),
    lt: t.text || "",
  });

  (async () => {
    // 対象順は呼び出し側（デスク）が addedAt 降順で並べて渡す。組に分ける。
    let queue = handles.slice();
    const GROUP = 20;
    let framesUsed = 0;
    let dormant = 0;
    let alive = 0;
    let timeoutGroups = 0;
    while (queue.length > 0) {
      if (rl.remaining != null && rl.remaining <= 0) {
        // 枠を使い切ったら待機に入る。進捗は全部デスクに保存済み。
        send("interval", [], [], rl);
        const waitMs = rl.resetAt && rl.resetAt > Date.now() ? rl.resetAt - Date.now() + 1000 : 60 * 1000;
        // タブが裏だと setTimeout は最大1回/分に絞られる。それでも待ちは続く。
        const t0 = Date.now();
        while (Date.now() - t0 < waitMs) await sleep(5000);
        rl = { remaining: null, limit: null, resetAt: null };
        framesUsed = 0;
      }
      const group = queue.slice(0, GROUP);
      queue = queue.slice(GROUP);
      round += 1;
      await sleep(0);
      const cap = await pageSearch(group);
      framesUsed += 1;
      if (!cap || cap.status !== 200 || !cap.json) {
        // 通信が通らなかった組は保留に戻す（枠を消した場合もあるので即座に返さない）
        queue = group.concat(queue);
        timeoutGroups += 1;
        if (timeoutGroups >= 3) {
          send("interval", [], group, rl);
          alert("フォロー棚: 検索が3回続けて失敗しました。枠が回復してから、もう一度コードを貼ってください。ここまでの進捗は保存済みです。");
          send("done", []);
          restore();
          return;
        }
        continue;
      }
      const rlNow = cap.rl;
      if (Number.isFinite(rlNow.remaining)) rl = rlNow;
      const s = summarize(group, tweetsOf(cap.json));
      const profiles = [];
      for (const h of s.found) {
        const t = s.bySn[h.toLowerCase()];
        profiles.push(rowOfTweet(t));
        alive += 1;
      }
      if (!s.saturated) {
        // 飽和なし＝出なかった人は1年間投稿なしで確定
        for (const h of s.missing) {
          profiles.push({ h: h, lp: dormantLp, lt: "1年以上投稿なし（検索で確認）" });
          dormant += 1;
        }
      } else {
        // 飽和＝判定保留。次の組として組み直して再検索（カーソル追尾はしない）
        queue = s.missing.concat(queue);
      }
      done += group.length;
      send("progress", profiles, group, rl);
      await sleep(3000);
    }
    send("done", []);
    restore();
    alert(
      "フォロー棚: " + handles.length + "人を調べました。生存 " + alive + "人・休眠確定 " + dormant + "人。" +
      "飽和で保留になった人は次回また調べます。元のタブに戻ってください。"
    );
  })();
})();`;

export type ScanRow = {
  h?: string;
  id?: string;
  n?: string;
  bio?: string;
  av?: string;
  fl?: number;
  fg?: number;
  tc?: number;
  vf?: boolean;
  k?: boolean;
  j?: number | null;
  lp?: number | null;
  lt?: string;
  miss?: boolean;
  gone?: boolean;
};

export function scanRowToSnapshot(row: ScanRow): ProfileSnapshot | null {
  const handle = normalizeHandle(String(row.h || ""));
  if (!isValidHandle(handle)) return null;
  if (row.miss && !row.gone) return null;
  if (row.gone || row.miss) {
    return {
      handle,
      userId: "",
      name: "",
      bio: "",
      avatarUrl: "",
      followers: 0,
      following: 0,
      tweetCount: 0,
      verified: false,
      protected: false,
      website: "",
      location: "",
      joinedAt: null,
      lastPostAt: null,
      lastPostText: "",
      lookupFailed: true,
    };
  }
  return {
    handle,
    userId: String(row.id || ""),
    name: String(row.n || ""),
    bio: String(row.bio || ""),
    avatarUrl: String(row.av || ""),
    followers: Number(row.fl || 0) || 0,
    following: Number(row.fg || 0) || 0,
    tweetCount: Number(row.tc || 0) || 0,
    verified: Boolean(row.vf),
    protected: Boolean(row.k),
    website: "",
    location: "",
    joinedAt: typeof row.j === "number" && Number.isFinite(row.j) ? row.j : null,
    lastPostAt: typeof row.lp === "number" && Number.isFinite(row.lp) ? row.lp : null,
    lastPostText: String(row.lt || ""),
    lookupFailed: false,
  };
}

export function parseScanProfiles(raw: unknown): ProfileSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileSnapshot[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const snap = scanRowToSnapshot(row as ScanRow);
    if (snap) out.push(snap);
  }
  return out;
}

export function buildScanScript(handles: string[]): string {
  const payload = JSON.stringify(
    handles.map((h) => h.replace(/^@/, "")).filter((h) => /^[A-Za-z0-9_]{1,15}$/.test(h)),
  );
  return SCAN.split("__TARGETS__").join(payload);
}
