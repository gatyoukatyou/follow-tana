import { describe, expect, it } from "vitest";
import {
  DAILY_UNFOLLOW_QUOTA,
  applyVerdicts,
  demoRound,
  demoSchedule,
  dormantPlaceholderLp,
  emptyStats,
  formatCountdown,
  intervalMsLeft,
  isSweep,
  judgeRound,
  quotaProgress,
  quotaReached,
  sinceStartMs,
} from "@/lib/arena";

describe("judgeRound", () => {
  it("lp が since 以降なら生存", () => {
    const r = judgeRound({
      round: 1,
      since: "2025-09-19",
      checked: ["alice"],
      profiles: [{ h: "alice", lp: sinceStartMs("2025-09-19")! + 1 }],
    });
    expect(r.rows).toEqual([{ handle: "alice", verdict: "survived" }]);
    expect(r.pending).toEqual([]);
  });

  it("lp が since より前なら脱落", () => {
    const r = judgeRound({
      round: 1,
      since: "2025-09-19",
      checked: ["bob"],
      profiles: [{ h: "bob", lp: sinceStartMs("2025-09-19")! - 1 }],
    });
    expect(r.rows).toEqual([{ handle: "bob", verdict: "fell" }]);
  });

  it("gone は消失", () => {
    const r = judgeRound({ round: 1, since: "2025-09-19", checked: ["carol"], profiles: [{ h: "carol", gone: true }] });
    expect(r.rows[0]!.verdict).toBe("vanished");
  });

  it("checked にいて profiles にいない人は保留", () => {
    const r = judgeRound({ round: 1, since: "2025-09-19", checked: ["dave"], profiles: [] });
    expect(r.rows).toEqual([]);
    expect(r.pending).toEqual(["dave"]);
  });

  it("miss だけ（gone 無し）は保留", () => {
    const r = judgeRound({ round: 1, since: "2025-09-19", checked: ["eve"], profiles: [{ h: "eve", miss: true }] });
    expect(r.pending).toEqual(["eve"]);
  });

  it("大文字小文字を同一視する", () => {
    const r = judgeRound({ round: 1, since: "2025-09-19", checked: ["Alice"], profiles: [{ h: "ALICE", lp: 1 }] });
    expect(r.rows[0]!.verdict).toBe("fell");
  });

  it("検索に出なかった人に疑似 lp を付けても脱落になる", () => {
    const lp = dormantPlaceholderLp("2025-09-19");
    expect(lp).toBe(sinceStartMs("2025-09-19")! - 1);
    const r = judgeRound({ round: 1, since: "2025-09-19", checked: ["frank"], profiles: [{ h: "frank", lp: lp! }] });
    expect(r.rows[0]!.verdict).toBe("fell");
  });
});

describe("applyVerdicts / quota", () => {
  it("脱落連続でコンボが伸び、生存で切れる", () => {
    let s = emptyStats();
    s = applyVerdicts(s, judgeRound({ round: 1, since: "2025-09-19", checked: ["a", "b"], profiles: [{ h: "a", lp: 1 }, { h: "b", lp: 1 }] }));
    expect(s.combo).toBe(2);
    s = applyVerdicts(s, judgeRound({ round: 2, since: "2025-09-19", checked: ["c", "d"], profiles: [{ h: "c", lp: Date.now() }, { h: "d", lp: 1 }] }));
    expect(s.combo).toBe(1);
    expect(s.bestCombo).toBe(2);
    expect(s.fell).toBe(3);
    expect(s.survived).toBe(1);
  });

  it("ノルマ400に達したら達成", () => {
    let s = emptyStats();
    const many = Array.from({ length: 20 }, (_, i) => `u${i}`);
    const profiles = many.map((h) => ({ h, lp: 1 }));
    for (let i = 0; i < 20; i++) {
      s = applyVerdicts(s, judgeRound({ round: i + 1, since: "2025-09-19", checked: many, profiles }));
    }
    expect(s.fell).toBe(400);
    expect(quotaReached(s)).toBe(true);
    expect(quotaProgress(s)).toBe(1);
  });

  it("ノルマ未達の進捗は割合", () => {
    const s = applyVerdicts(emptyStats(), judgeRound({ round: 1, since: "2025-09-19", checked: ["a"], profiles: [{ h: "a", lp: 1 }] }));
    expect(quotaProgress(s)).toBe(1 / DAILY_UNFOLLOW_QUOTA);
  });
});

describe("isSweep", () => {
  it("1ラウンド全員脱落で true", () => {
    const r = judgeRound({ round: 1, since: "2025-09-19", checked: ["a", "b"], profiles: [{ h: "a", lp: 1 }, { h: "b", lp: 2 }] });
    expect(isSweep(r)).toBe(true);
  });

  it("生存が混ざれば false", () => {
    const r = judgeRound({ round: 1, since: "2025-09-19", checked: ["a", "b"], profiles: [{ h: "a", lp: 1 }, { h: "b", lp: Date.now() }] });
    expect(isSweep(r)).toBe(false);
  });
});

describe("countdown", () => {
  it("reset までの残りをミリ秒で返す", () => {
    const now = Date.now();
    expect(intervalMsLeft(Math.floor(now / 1000) + 60, now)).toBeGreaterThan(59_000);
    expect(intervalMsLeft(Math.floor(now / 1000) - 5, now)).toBe(0);
    expect(intervalMsLeft(null, now)).toBeNull();
  });

  it("M:SS 表示", () => {
    expect(formatCountdown(754_000)).toBe("12:34");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-1)).toBe("0:00");
    expect(formatCountdown(null)).toBe("0:00");
  });
});

describe("demo", () => {
  it("デモ1ラウンドが判定として成立する", () => {
    const input = demoRound({ round: 1, since: "2025-09-19", survived: 2, fell: 3, vanished: 1, pending: 1 });
    const r = judgeRound(input);
    const by = { survived: 0, fell: 0, vanished: 0 };
    for (const row of r.rows) by[row.verdict] += 1;
    expect(by.survived).toBe(2);
    expect(by.fell).toBe(3);
    expect(by.vanished).toBe(1);
    expect(r.pending).toHaveLength(1);
  });

  it("8ラウンド分の台本がある", () => {
    expect(demoSchedule()).toHaveLength(6);
    expect(demoSchedule()[0]!.round).toBe(1);
  });
});

describe("quota 定数", () => {
  it("1日の解除上限は400", () => {
    expect(DAILY_UNFOLLOW_QUOTA).toBe(400);
  });
});
