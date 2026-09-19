import { isValidHandle, normalizeHandle } from "@/lib/utils";
import type { ScanRow } from "@/lib/x-scan-script";

/**
 * ゲーム表示（○×落とし穴）の純ロジック。
 *
 * 生存確認スクリプトが postMessage で送る { source:"follow-tana", op:"Scan" } に
 * 次の項目が入っていることを前提にする（use-x-bridge とは独立に同じ message を聞く）。
 *
 *   type:    "progress" | "interval" | "done"
 *   round:   1始まりのラウンド番号（検索1回 = 1ラウンド）
 *   checked: このラウンドで調べたハンドル
 *   since:   検索に使った since 日付 "YYYY-MM-DD"
 *   profiles: ScanRow[]（gone:true = 消失 / lp >= since = 生存 / lp < since = 脱落）
 *   rl:      { remaining, limit, resetAt }  resetAt は epoch ms（秒で来ても受ける）
 *
 * checked にいて profiles にいない人は「判定保留」（飽和で取れず、次の組へ持ち越し）。
 */

export const ARENA_ROUND_SIZE = 20;
/** 1日の解除目安（README の約400人）をゲームの「ノルマ」にする。脱落＋消失（外し候補の蓄積）で数える */
export const ARENA_QUOTA = 400;
/** ピットに残す駒の上限（DOM を軽く保つ） */
export const ARENA_PIT_CAP = 120;
/** 1ラウンドでこの人数以上が脱落するとコンボが続く */
export const ARENA_COMBO_MIN = 10;

export type FigureStatus = "waiting" | "alive" | "dormant" | "gone" | "pending";
export type ArenaFigure = { handle: string; status: FigureStatus };
export type ArenaPhase = "idle" | "running" | "interval" | "done";
export type ArenaRateLimit = { remaining: number; limit: number; resetAt: number };
export type ArenaBannerKind = "wipeout" | "combo" | "quota";
export type ArenaBanner = { kind: ArenaBannerKind; round: number } | null;
export type RoundCounts = { alive: number; dormant: number; gone: number; pending: number };

export type ScanArenaMessage = {
  type: "progress" | "interval" | "done";
  round: number;
  checked: string[];
  since: string | null;
  profiles: ScanRow[];
  rl: ArenaRateLimit | null;
};

export type ArenaState = {
  phase: ArenaPhase;
  round: number;
  since: string | null;
  stage: ArenaFigure[];
  /** 脱落した人（新しい順、上限 ARENA_PIT_CAP） */
  pit: string[];
  totals: RoundCounts & { checked: number };
  lastRound: RoundCounts;
  combo: number;
  bestDormant: number;
  banner: ArenaBanner;
  rl: ArenaRateLimit | null;
  quota: number;
  quotaReachedAt: number | null;
  updatedAt: number | null;
};

const ZERO_COUNTS: RoundCounts = { alive: 0, dormant: 0, gone: 0, pending: 0 };

export function initialArenaState(quota = ARENA_QUOTA): ArenaState {
  return {
    phase: "idle",
    round: 0,
    since: null,
    stage: [],
    pit: [],
    totals: { ...ZERO_COUNTS, checked: 0 },
    lastRound: { ...ZERO_COUNTS },
    combo: 0,
    bestDormant: 0,
    banner: null,
    quota,
    quotaReachedAt: null,
    rl: null,
    updatedAt: null,
  };
}

const SINCE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** since "YYYY-MM-DD" を UTC 0:00 の epoch ms にする。不正なら null */
export function sinceToMs(since: string | null | undefined): number | null {
  if (!since || !SINCE_RE.test(since)) return null;
  const t = Date.parse(`${since}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** x-rate-limit-reset は秒で来ることがある。1e12 未満なら秒とみなして ms にする */
export function normalizeResetAt(v: unknown): number | null {
  const n = toNumber(v);
  if (n == null || n <= 0) return null;
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
}

export function parseArenaRateLimit(raw: unknown): ArenaRateLimit | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { remaining?: unknown; limit?: unknown; resetAt?: unknown; reset?: unknown };
  const remaining = toNumber(r.remaining);
  const limit = toNumber(r.limit);
  const resetAt = normalizeResetAt(r.resetAt ?? r.reset);
  if (remaining == null || limit == null || resetAt == null) return null;
  return { remaining: Math.max(0, remaining), limit: Math.max(0, limit), resetAt };
}

function uniqueHandles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    const h = normalizeHandle(String(v ?? ""));
    if (!isValidHandle(h)) continue;
    const k = h.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}

/**
 * postMessage の data をゲーム用メッセージにする。
 * 生存確認以外（取込・解除）や、round/checked を持たない古い形式は null。
 */
export function parseArenaMessage(data: unknown): ScanArenaMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.source !== "follow-tana" || d.op !== "Scan") return null;
  const type = d.type;
  if (type !== "progress" && type !== "interval" && type !== "done") return null;
  if (!Array.isArray(d.checked)) return null;
  const round = toNumber(d.round);
  const since = typeof d.since === "string" && SINCE_RE.test(d.since) ? d.since : null;
  return {
    type,
    round: round != null && round > 0 ? Math.floor(round) : 0,
    checked: uniqueHandles(d.checked),
    since,
    profiles: Array.isArray(d.profiles)
      ? (d.profiles.filter((p) => p && typeof p === "object") as ScanRow[])
      : [],
    rl: parseArenaRateLimit(d.rl),
  };
}

/** 1行の判定。since が無いときは日付の比較ができないので lp があれば生存扱い */
export function classifyRow(row: ScanRow | undefined, sinceMs: number | null): FigureStatus {
  if (!row) return "pending";
  if (row.gone) return "gone";
  if (row.miss) return "pending";
  if (typeof row.lp === "number" && Number.isFinite(row.lp)) {
    if (sinceMs == null) return "alive";
    return row.lp >= sinceMs ? "alive" : "dormant";
  }
  return "pending";
}

export function judgeRound(
  checked: string[],
  profiles: ScanRow[],
  since: string | null,
): { figures: ArenaFigure[]; counts: RoundCounts } {
  const sinceMs = sinceToMs(since);
  const byKey = new Map<string, ScanRow>();
  for (const row of profiles) {
    const h = normalizeHandle(String(row?.h ?? ""));
    if (isValidHandle(h)) byKey.set(h.toLowerCase(), row);
  }
  const counts: RoundCounts = { ...ZERO_COUNTS };
  const figures = uniqueHandles(checked).map((handle) => {
    const status = classifyRow(byKey.get(handle.toLowerCase()), sinceMs);
    if (status !== "waiting") counts[status] += 1;
    return { handle, status };
  });
  return { figures, counts };
}

function bannerFor(
  prev: ArenaState,
  counts: RoundCounts,
  roundSize: number,
  round: number,
  candidates: number,
): { banner: ArenaBanner; combo: number; quotaReached: boolean } {
  const combo = counts.dormant >= ARENA_COMBO_MIN ? prev.combo + 1 : 0;
  const quotaReached = prev.quotaReachedAt == null && prev.quota > 0 && candidates >= prev.quota;
  if (quotaReached) return { banner: { kind: "quota", round }, combo, quotaReached };
  const wipeout = roundSize >= ARENA_ROUND_SIZE / 2 && counts.dormant + counts.gone === roundSize;
  if (wipeout) return { banner: { kind: "wipeout", round }, combo, quotaReached };
  if (combo >= 2) return { banner: { kind: "combo", round }, combo, quotaReached };
  return { banner: null, combo, quotaReached };
}

export function applyScanMessage(
  state: ArenaState,
  msg: ScanArenaMessage,
  now: number = Date.now(),
): ArenaState {
  const rl = msg.rl ?? state.rl;
  const since = msg.since ?? state.since;
  if (msg.type === "done") {
    return { ...state, phase: "done", rl, since, banner: null, updatedAt: now };
  }
  if (msg.type === "interval") {
    return { ...state, phase: "interval", rl, since, banner: null, updatedAt: now };
  }
  if (msg.checked.length === 0) {
    // 進捗の心拍だけ（人がいない）
    return { ...state, phase: "running", rl, since, updatedAt: now };
  }
  const round = msg.round > 0 ? msg.round : state.round + 1;
  const { figures, counts } = judgeRound(msg.checked, msg.profiles, since);
  const totals = {
    checked: state.totals.checked + figures.length,
    alive: state.totals.alive + counts.alive,
    dormant: state.totals.dormant + counts.dormant,
    gone: state.totals.gone + counts.gone,
    pending: state.totals.pending + counts.pending,
  };
  const dropped = figures.filter((f) => f.status === "dormant").map((f) => f.handle);
  const { banner, combo, quotaReached } = bannerFor(
    state,
    counts,
    figures.length,
    round,
    totals.dormant + totals.gone,
  );
  return {
    ...state,
    phase: "running",
    round,
    since,
    stage: figures,
    pit: [...dropped.reverse(), ...state.pit].slice(0, ARENA_PIT_CAP),
    totals,
    lastRound: counts,
    combo,
    bestDormant: Math.max(state.bestDormant, counts.dormant),
    banner,
    rl,
    quotaReachedAt: quotaReached ? now : state.quotaReachedAt,
    updatedAt: now,
  };
}

/** 次の枠までの残り。resetAt が無い／過ぎているときは 0 */
export function countdownMs(rl: ArenaRateLimit | null, now: number = Date.now()): number {
  if (!rl) return 0;
  return Math.max(0, rl.resetAt - now);
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** ノルマの進み。脱落＋消失＝外し候補として積み上がった人数 */
export function quotaProgress(state: ArenaState): { done: number; quota: number; ratio: number } {
  const quota = Math.max(0, state.quota);
  const done = state.totals.dormant + state.totals.gone;
  return { done, quota, ratio: quota === 0 ? 1 : Math.min(1, done / quota) };
}

/** 1ラウンドあたりの脱落人数の平均（見せ場の目安に使う） */
export function dormantPerRound(state: ArenaState): number {
  if (state.round === 0) return 0;
  return state.totals.dormant / state.round;
}
