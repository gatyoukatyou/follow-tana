import { ARENA_ROUND_SIZE, sinceToMs, type ScanArenaMessage } from "@/lib/arena";
import type { ScanRow } from "@/lib/x-scan-script";

/**
 * デモ再生：生存確認スクリプトが送るはずのメッセージを、架空の tana_* だけで作る。
 * X も名簿も使わない。見た目の確認と、契約のサンプルを兼ねる。
 */

export type DemoOptions = {
  rounds?: number;
  seed?: number;
  since?: string;
  /** 0..1。昔フォローした人から調べる想定なので、序盤ほど高い */
  dormantRate?: (round: number, rounds: number) => number;
  limit?: number;
  startAt?: number;
};

/** 決定的な乱数（mulberry32）。同じ seed なら同じ台本になる */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function defaultDormantRate(round: number, rounds: number): number {
  // 序盤 0.75 → 終盤 0.3。3ラウンド目だけ全滅にして見せ場を作る
  if (round === 3) return 1;
  const t = rounds <= 1 ? 0 : (round - 1) / (rounds - 1);
  return 0.75 - 0.45 * t;
}

export function demoHandle(round: number, i: number): string {
  return `tana_r${String(round).padStart(2, "0")}_${String(i + 1).padStart(2, "0")}`;
}

export function createDemoRounds(opts: DemoOptions = {}): ScanArenaMessage[] {
  const rounds = Math.max(1, Math.floor(opts.rounds ?? 50));
  const rnd = seededRandom(opts.seed ?? 1);
  const since = opts.since ?? "2025-09-18";
  const sinceMs = sinceToMs(since) ?? Date.parse("2025-09-18T00:00:00Z");
  const limit = opts.limit ?? 50;
  const startAt = opts.startAt ?? Date.parse("2026-09-19T00:00:00Z");
  const resetAt = startAt + 15 * 60 * 1000;
  const rate = opts.dormantRate ?? defaultDormantRate;
  const out: ScanArenaMessage[] = [];
  for (let round = 1; round <= rounds; round++) {
    const checked: string[] = [];
    const profiles: ScanRow[] = [];
    const p = rate(round, rounds);
    for (let i = 0; i < ARENA_ROUND_SIZE; i++) {
      const h = demoHandle(round, i);
      checked.push(h);
      const r = rnd();
      if (r < p) {
        profiles.push({ h, lp: sinceMs - 86_400_000, lt: "1年以上投稿なし（検索で確認）" });
      } else if (r < p + 0.04) {
        profiles.push({ h, gone: true });
      } else if (r < p + 0.08) {
        // 飽和で取れなかった人：profiles に入れない＝判定保留
      } else {
        const daysAgo = Math.floor(rnd() * 360);
        profiles.push({ h, lp: sinceMs + (365 - daysAgo) * 86_400_000, lt: "見本の投稿" });
      }
    }
    out.push({
      type: "progress",
      round,
      checked,
      since,
      profiles,
      rl: { remaining: Math.max(0, limit - round), limit, resetAt },
    });
  }
  out.push({
    type: "interval",
    round: rounds,
    checked: [],
    since,
    profiles: [],
    rl: { remaining: 0, limit, resetAt },
  });
  return out;
}

/**
 * 台本を一定間隔で流す。戻り値で止められる。
 * 最後の interval の後は done を送らない（インターバル画面を見せるため）。
 */
export function playDemo(
  feed: (msg: ScanArenaMessage) => void,
  opts: DemoOptions & { intervalMs?: number; onEnd?: () => void } = {},
): () => void {
  const script = createDemoRounds(opts);
  const intervalMs = Math.max(0, opts.intervalMs ?? 400);
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    if (i >= script.length) {
      opts.onEnd?.();
      return;
    }
    feed(script[i]);
    i += 1;
    timer = setTimeout(tick, intervalMs);
  };
  tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
