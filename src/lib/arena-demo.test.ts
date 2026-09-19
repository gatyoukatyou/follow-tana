import { describe, expect, it, vi } from "vitest";
import { applyScanMessage, initialArenaState } from "@/lib/arena";
import { createDemoRounds, demoHandle, playDemo, seededRandom } from "@/lib/arena-demo";

describe("createDemoRounds", () => {
  it("同じ seed なら同じ台本", () => {
    const a = createDemoRounds({ rounds: 5, seed: 7 });
    const b = createDemoRounds({ rounds: 5, seed: 7 });
    expect(a).toEqual(b);
    expect(createDemoRounds({ rounds: 5, seed: 8 })).not.toEqual(a);
  });

  it("架空の tana_* だけを使い、最後に interval を送る", () => {
    const script = createDemoRounds({ rounds: 4 });
    expect(script).toHaveLength(5);
    expect(script.slice(0, 4).every((m) => m.type === "progress" && m.checked.length === 20)).toBe(
      true,
    );
    expect(script.at(-1)?.type).toBe("interval");
    const all = script.flatMap((m) => [...m.checked, ...m.profiles.map((p) => String(p.h))]);
    expect(all.every((h) => h.startsWith("tana_"))).toBe(true);
    expect(demoHandle(3, 0)).toBe("tana_r03_01");
  });

  it("3ラウンド目は全滅、脱落率は序盤ほど高い", () => {
    const script = createDemoRounds({ rounds: 50, seed: 1 });
    let s = initialArenaState();
    const dormantByRound: number[] = [];
    for (const m of script) {
      s = applyScanMessage(s, m);
      if (m.type === "progress") dormantByRound.push(s.lastRound.dormant);
    }
    expect(dormantByRound[2]).toBe(20);
    const early = dormantByRound.slice(0, 10).reduce((a, b) => a + b, 0);
    const late = dormantByRound.slice(-10).reduce((a, b) => a + b, 0);
    expect(early).toBeGreaterThan(late);
    expect(s.phase).toBe("interval");
    expect(s.totals.checked).toBe(1000);
    expect(s.totals.dormant).toBeGreaterThan(400); // ノルマ到達の見せ場が出る
    expect(s.quotaReachedAt).not.toBeNull();
  });

  it("乱数は 0 以上 1 未満", () => {
    const r = seededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("playDemo", () => {
  it("一定間隔で流し、止められる", () => {
    vi.useFakeTimers();
    try {
      const got: number[] = [];
      const onEnd = vi.fn();
      const stop = playDemo((m) => got.push(m.round), { rounds: 3, intervalMs: 100, onEnd });
      expect(got).toEqual([1]);
      vi.advanceTimersByTime(100);
      expect(got).toEqual([1, 2]);
      stop();
      vi.advanceTimersByTime(1000);
      expect(got).toEqual([1, 2]);
      expect(onEnd).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("最後まで流すと onEnd を呼ぶ", () => {
    vi.useFakeTimers();
    try {
      const got: string[] = [];
      const onEnd = vi.fn();
      playDemo((m) => got.push(m.type), { rounds: 2, intervalMs: 50, onEnd });
      vi.advanceTimersByTime(500);
      expect(got).toEqual(["progress", "progress", "interval"]);
      expect(onEnd).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
