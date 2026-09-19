import { describe, expect, it } from "vitest";
import {
  ARENA_COMBO_MIN,
  ARENA_PIT_CAP,
  applyScanMessage,
  classifyRow,
  countdownMs,
  formatCountdown,
  initialArenaState,
  judgeRound,
  normalizeResetAt,
  parseArenaMessage,
  quotaProgress,
  sinceToMs,
  type ScanArenaMessage,
} from "@/lib/arena";

const SINCE = "2025-09-18";
const SINCE_MS = Date.parse("2025-09-18T00:00:00Z");
const DAY = 86_400_000;

function handles(n: number, prefix = "tana_t"): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
}

function progress(
  round: number,
  checked: string[],
  profiles: ScanArenaMessage["profiles"],
  rl: ScanArenaMessage["rl"] = { remaining: 50 - round, limit: 50, resetAt: 1_000_000 },
): ScanArenaMessage {
  return { type: "progress", round, checked, since: SINCE, profiles, rl };
}

describe("sinceToMs / normalizeResetAt", () => {
  it("since は UTC 0:00 にする", () => {
    expect(sinceToMs(SINCE)).toBe(SINCE_MS);
    expect(sinceToMs("2025/09/18")).toBeNull();
    expect(sinceToMs(null)).toBeNull();
  });

  it("reset は秒でも ms でも受ける", () => {
    expect(normalizeResetAt(1_789_775_405)).toBe(1_789_775_405_000);
    expect(normalizeResetAt("1789775405")).toBe(1_789_775_405_000);
    expect(normalizeResetAt(1_789_775_405_000)).toBe(1_789_775_405_000);
    expect(normalizeResetAt(0)).toBeNull();
    expect(normalizeResetAt("x")).toBeNull();
  });
});

describe("classifyRow", () => {
  it("since 以降の投稿は生存、前は脱落", () => {
    expect(classifyRow({ h: "a", lp: SINCE_MS + DAY }, SINCE_MS)).toBe("alive");
    expect(classifyRow({ h: "a", lp: SINCE_MS }, SINCE_MS)).toBe("alive");
    expect(classifyRow({ h: "a", lp: SINCE_MS - DAY }, SINCE_MS)).toBe("dormant");
  });

  it("消えた人は消失、行が無い・miss・lp 無しは判定保留", () => {
    expect(classifyRow({ h: "a", gone: true }, SINCE_MS)).toBe("gone");
    expect(classifyRow(undefined, SINCE_MS)).toBe("pending");
    expect(classifyRow({ h: "a", miss: true }, SINCE_MS)).toBe("pending");
    expect(classifyRow({ h: "a", k: true, lp: null }, SINCE_MS)).toBe("pending");
  });

  it("since が無ければ lp があるだけで生存扱い（日付比較ができない）", () => {
    expect(classifyRow({ h: "a", lp: 1 }, null)).toBe("alive");
  });
});

describe("judgeRound", () => {
  it("checked の順で駒を作り、ハンドルは大文字小文字を無視して突き合わせる", () => {
    const { figures, counts } = judgeRound(
      ["Alice", "bob", "carol", "dave"],
      [
        { h: "alice", lp: SINCE_MS + DAY },
        { h: "BOB", lp: SINCE_MS - DAY },
        { h: "carol", gone: true },
      ],
      SINCE,
    );
    expect(figures.map((f) => f.status)).toEqual(["alive", "dormant", "gone", "pending"]);
    expect(counts).toEqual({ alive: 1, dormant: 1, gone: 1, pending: 1 });
  });

  it("checked の重複と不正なハンドルは落とす", () => {
    const { figures } = judgeRound(["alice", "@alice", "bad handle", ""], [], SINCE);
    expect(figures.map((f) => f.handle)).toEqual(["alice"]);
  });
});

describe("parseArenaMessage", () => {
  it("生存確認の message だけ受ける", () => {
    expect(parseArenaMessage(null)).toBeNull();
    expect(
      parseArenaMessage({ source: "other", op: "Scan", type: "progress", checked: [] }),
    ).toBeNull();
    expect(
      parseArenaMessage({ source: "follow-tana", op: "Following", type: "progress", checked: [] }),
    ).toBeNull();
    expect(parseArenaMessage({ source: "follow-tana", op: "Scan", type: "progress" })).toBeNull();
    expect(
      parseArenaMessage({ source: "follow-tana", op: "Scan", type: "weird", checked: [] }),
    ).toBeNull();
  });

  it("round / since / rl を正規化する", () => {
    const m = parseArenaMessage({
      source: "follow-tana",
      op: "Scan",
      type: "progress",
      round: "3",
      checked: ["@Alice", "bob", "bob"],
      since: SINCE,
      profiles: [{ h: "alice", lp: 1 }, null, "junk"],
      rl: { remaining: "38", limit: 50, resetAt: 1_789_775_405 },
    });
    expect(m).not.toBeNull();
    expect(m?.round).toBe(3);
    expect(m?.checked).toEqual(["Alice", "bob"]);
    expect(m?.since).toBe(SINCE);
    expect(m?.profiles).toHaveLength(1);
    expect(m?.rl).toEqual({ remaining: 38, limit: 50, resetAt: 1_789_775_405_000 });
  });

  it("since が変な形なら null、rl が欠けていれば null", () => {
    const m = parseArenaMessage({
      source: "follow-tana",
      op: "Scan",
      type: "interval",
      checked: [],
      since: "昨日",
      rl: { remaining: 0 },
    });
    expect(m?.since).toBeNull();
    expect(m?.rl).toBeNull();
    expect(m?.round).toBe(0);
  });
});

describe("applyScanMessage", () => {
  it("1ラウンドで舞台・合計・ピットが更新される", () => {
    const s0 = initialArenaState();
    const checked = handles(20);
    const profiles = [
      ...checked.slice(0, 5).map((h) => ({ h, lp: SINCE_MS + DAY })),
      ...checked.slice(5, 17).map((h) => ({ h, lp: SINCE_MS - DAY })),
      { h: checked[17], gone: true },
    ];
    const s1 = applyScanMessage(s0, progress(1, checked, profiles), 123);
    expect(s1.phase).toBe("running");
    expect(s1.round).toBe(1);
    expect(s1.since).toBe(SINCE);
    expect(s1.stage).toHaveLength(20);
    expect(s1.lastRound).toEqual({ alive: 5, dormant: 12, gone: 1, pending: 2 });
    expect(s1.totals).toEqual({ checked: 20, alive: 5, dormant: 12, gone: 1, pending: 2 });
    expect(s1.pit).toHaveLength(12);
    expect(s1.pit[0]).toBe(checked[16]); // 新しい順
    expect(s1.combo).toBe(1);
    expect(s1.bestDormant).toBe(12);
    expect(s1.banner).toBeNull();
    expect(s1.rl?.remaining).toBe(49);
    expect(s1.updatedAt).toBe(123);
  });

  it("round が無ければ連番で進む", () => {
    const s1 = applyScanMessage(initialArenaState(), progress(0, handles(3), []));
    const s2 = applyScanMessage(s1, progress(0, handles(3, "tana_u"), []));
    expect(s2.round).toBe(2);
  });

  it("全員脱落で「全滅」バナー", () => {
    const checked = handles(20);
    const s1 = applyScanMessage(
      initialArenaState(),
      progress(
        1,
        checked,
        checked.map((h) => ({ h, lp: SINCE_MS - DAY })),
      ),
    );
    expect(s1.banner).toEqual({ kind: "wipeout", round: 1 });
  });

  it("消失も含めて全員いなくなれば全滅、少人数の組では全滅にしない", () => {
    const checked = handles(20);
    const s1 = applyScanMessage(
      initialArenaState(),
      progress(1, checked, [
        ...checked.slice(0, 19).map((h) => ({ h, lp: SINCE_MS - DAY })),
        { h: checked[19], gone: true },
      ]),
    );
    expect(s1.banner?.kind).toBe("wipeout");
    const small = handles(5);
    const s2 = applyScanMessage(
      initialArenaState(),
      progress(
        1,
        small,
        small.map((h) => ({ h, lp: SINCE_MS - DAY })),
      ),
    );
    expect(s2.banner).toBeNull();
  });

  it("脱落が続くとコンボ、途切れると0に戻る", () => {
    const many = (round: number) => {
      const c = handles(20, `tana_c${round}_`);
      return progress(
        round,
        c,
        c.slice(0, ARENA_COMBO_MIN).map((h) => ({ h, lp: SINCE_MS - DAY })),
      );
    };
    const few = (round: number) => {
      const c = handles(20, `tana_f${round}_`);
      return progress(
        round,
        c,
        c.slice(0, 2).map((h) => ({ h, lp: SINCE_MS - DAY })),
      );
    };
    let s = applyScanMessage(initialArenaState(), many(1));
    expect(s.combo).toBe(1);
    expect(s.banner).toBeNull();
    s = applyScanMessage(s, many(2));
    expect(s.combo).toBe(2);
    expect(s.banner).toEqual({ kind: "combo", round: 2 });
    s = applyScanMessage(s, few(3));
    expect(s.combo).toBe(0);
    expect(s.banner).toBeNull();
  });

  it("ノルマ到達で一度だけ「ノルマ」バナー、全滅より優先", () => {
    let s = initialArenaState(30);
    const wipe = (round: number) => {
      const c = handles(20, `tana_q${round}_`);
      return progress(
        round,
        c,
        c.map((h) => ({ h, lp: SINCE_MS - DAY })),
      );
    };
    s = applyScanMessage(s, wipe(1), 10);
    expect(s.banner?.kind).toBe("wipeout");
    expect(s.quotaReachedAt).toBeNull();
    s = applyScanMessage(s, wipe(2), 20);
    expect(s.banner).toEqual({ kind: "quota", round: 2 });
    expect(s.quotaReachedAt).toBe(20);
    s = applyScanMessage(s, wipe(3), 30);
    expect(s.banner?.kind).toBe("wipeout");
    expect(s.quotaReachedAt).toBe(20);
    expect(quotaProgress(s)).toEqual({ done: 60, quota: 30, ratio: 1 });
  });

  it("ノルマは脱落＋消失で数える", () => {
    const c = handles(20);
    let s = initialArenaState(25);
    s = applyScanMessage(
      s,
      progress(1, c, [
        ...c.slice(0, 15).map((h) => ({ h, lp: SINCE_MS - DAY })),
        ...c.slice(15, 20).map((h) => ({ h, gone: true })),
      ]),
      1,
    );
    expect(quotaProgress(s)).toEqual({ done: 20, quota: 25, ratio: 0.8 });
    expect(s.quotaReachedAt).toBeNull();
    const d = handles(20, "tana_d");
    s = applyScanMessage(
      s,
      progress(
        2,
        d,
        d.slice(0, 5).map((h) => ({ h, lp: SINCE_MS - DAY })),
      ),
      2,
    );
    expect(quotaProgress(s).done).toBe(25);
    expect(s.banner).toEqual({ kind: "quota", round: 2 });
    expect(s.quotaReachedAt).toBe(2);
  });

  it("ピットは上限で切る", () => {
    let s = initialArenaState();
    for (let r = 1; r <= 10; r++) {
      const c = handles(20, `tana_p${r}_`);
      s = applyScanMessage(
        s,
        progress(
          r,
          c,
          c.map((h) => ({ h, lp: SINCE_MS - DAY })),
        ),
      );
    }
    expect(s.totals.dormant).toBe(200);
    expect(s.pit).toHaveLength(ARENA_PIT_CAP);
    expect(s.pit[0]).toBe("tana_p10_20");
  });

  it("interval / done は舞台を残したまま局面だけ変える", () => {
    const checked = handles(20);
    let s = applyScanMessage(
      initialArenaState(),
      progress(
        1,
        checked,
        checked.map((h) => ({ h, lp: SINCE_MS - DAY })),
      ),
    );
    s = applyScanMessage(
      s,
      {
        type: "interval",
        round: 1,
        checked: [],
        since: null,
        profiles: [],
        rl: { remaining: 0, limit: 50, resetAt: 5000 },
      },
      100,
    );
    expect(s.phase).toBe("interval");
    expect(s.stage).toHaveLength(20);
    expect(s.since).toBe(SINCE);
    expect(s.banner).toBeNull();
    expect(s.rl).toEqual({ remaining: 0, limit: 50, resetAt: 5000 });
    expect(countdownMs(s.rl, 2000)).toBe(3000);
    s = applyScanMessage(s, progress(2, handles(20, "tana_v"), []));
    expect(s.phase).toBe("running");
    s = applyScanMessage(s, {
      type: "done",
      round: 2,
      checked: [],
      since: null,
      profiles: [],
      rl: null,
    });
    expect(s.phase).toBe("done");
    expect(s.rl?.remaining).toBe(48);
  });

  it("人のいない progress は心拍として枠だけ更新する", () => {
    const s = applyScanMessage(
      initialArenaState(),
      progress(0, [], [], { remaining: 10, limit: 50, resetAt: 1 }),
    );
    expect(s.phase).toBe("running");
    expect(s.round).toBe(0);
    expect(s.rl?.remaining).toBe(10);
  });
});

describe("countdown", () => {
  it("残り時間を mm:ss にする", () => {
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(754_000)).toBe("12:34");
    expect(formatCountdown(59_400)).toBe("01:00");
    expect(countdownMs(null)).toBe(0);
    expect(countdownMs({ remaining: 0, limit: 50, resetAt: 100 }, 200)).toBe(0);
  });
});
