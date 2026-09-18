/**
 * ○×落とし穴アリーナ — 純ロジック。
 *
 * 生存確認スクリプトの postMessage（op:"Scan"）を表示層で読み、ラウンド判定・
 * コンボ・今日のノルマ・インターバル残り時間に変換する。React に依存しない。
 *
 * 判定はデスク側で行う（x-scan-script との契約）:
 *   - gone:true                        → 消失
 *   - lp が since 以降                 → 生存
 *   - lp が since より前               → 脱落
 *   - checked にいて profiles にいない → 保留（飽和で取れず。次回持ち越し）
 */
import type { ScanRow } from "@/lib/x-scan-script";

export type Verdict = "survived" | "fell" | "vanished" | "pending";

export type ArenaJudgeInput = {
  round: number;
  since: string;
  checked: string[];
  profiles: ScanRow[];
};

export type ArenaJudgeResult = {
  round: number;
  /** 判定が付いた人（pending は含まない） */
  rows: { handle: string; verdict: Exclude<Verdict, "pending"> }[];
  /** 保留したハンドル */
  pending: string[];
};

/** since（"YYYY-MM-DD"）を epoch ms の「その日の0時」に直す */
export function sinceStartMs(since: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(since);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

/** 検索で出なかった人に付ける疑似 lp：since の前日 0:00 */
export function dormantPlaceholderLp(since: string): number | null {
  const start = sinceStartMs(since);
  return start == null ? null : start - 1;
}

function verdictOf(row: ScanRow, sinceMs: number): Exclude<Verdict, "pending"> {
  if (row.gone) return "vanished";
  if (row.lp != null && row.lp >= sinceMs) return "survived";
  return "fell";
}

function rowLp(row: ScanRow, sinceMs: number): number {
  return row.lp == null ? sinceMs - 1 : row.lp;
}

/**
 * 1ラウンド分のスキャン結果を判定に変える。
 * judged に無い人（checked だが profiles 無し）は pending。
 */
export function judgeRound(input: ArenaJudgeInput): ArenaJudgeResult {
  const sinceMs = sinceStartMs(input.since) ?? 0;
  const byHandle = new Map<string, ScanRow>();
  for (const row of input.profiles) {
    if (!row || typeof row !== "object") continue;
    const h = String(row.h || "").replace(/^@/, "").toLowerCase();
    if (h && !byHandle.has(h)) byHandle.set(h, row);
  }
  const rows: ArenaJudgeResult["rows"] = [];
  const pending: string[] = [];
  for (const handle of input.checked) {
    const key = handle.toLowerCase();
    const row = byHandle.get(key);
    if (!row) {
      pending.push(handle);
      continue;
    }
    if (row.miss && !row.gone) {
      pending.push(handle);
      continue;
    }
    rows.push({ handle, verdict: verdictOf(row, sinceMs) });
  }
  return { round: input.round, rows, pending };
}

/** 投稿が「取れた人」の判定に使う。lp 無し（検索に出なかった）は呼び出し側が付ける */
export function rowToPlaceholder(row: ScanRow, since: string): ScanRow {
  if (row.lp != null) return row;
  return { ...row, lp: dormantPlaceholderLp(since), lt: "1年以上投稿なし（検索で確認）" };
}

// ---- 進行統計 ----

export type ArenaStats = {
  survived: number;
  fell: number;
  vanished: number;
  pending: number;
  combo: number;
  bestCombo: number;
  quota: number;
  dailyGoal: number;
};

export const DAILY_UNFOLLOW_QUOTA = 400;

export function emptyStats(dailyGoal = DAILY_UNFOLLOW_QUOTA): ArenaStats {
  return { survived: 0, fell: 0, vanished: 0, pending: 0, combo: 0, bestCombo: 0, quota: 0, dailyGoal };
}

/**
 * 判定結果を統計に反映する。脱落が連続するとコンボが伸びる。
 * 生存・消失はコンボを切る。quota は脱落と消失の合計（外し候補の蓄積）。
 */
export function applyVerdicts(stats: ArenaStats, result: ArenaJudgeResult): ArenaStats {
  const next = { ...stats, pending: stats.pending + result.pending.length };
  for (const { verdict } of result.rows) {
    if (verdict === "fell") {
      next.fell += 1;
      next.combo += 1;
      next.bestCombo = Math.max(next.bestCombo, next.combo);
      next.quota += 1;
    } else {
      next.combo = 0;
      if (verdict === "survived") next.survived += 1;
      else next.vanished += 1;
    }
  }
  next.bestCombo = Math.max(next.bestCombo, next.combo);
  return next;
}

/** 1ラウンド全員脱落 */
export function isSweep(result: ArenaJudgeResult): boolean {
  return result.rows.length > 0 && result.rows.every((r) => r.verdict === "fell");
}

export function quotaProgress(stats: ArenaStats): number {
  if (stats.dailyGoal <= 0) return 1;
  return Math.min(1, stats.quota / stats.dailyGoal);
}

export function quotaReached(stats: ArenaStats): boolean {
  return stats.quota >= stats.dailyGoal;
}

// ---- インターバル・カウントダウン ----

/** x-rate-limit-reset（epoch 秒）と現在時刻から残りミリ秒 */
export function intervalMsLeft(resetAtEpochSec: number | null, nowMs: number): number | null {
  if (resetAtEpochSec == null || !Number.isFinite(resetAtEpochSec)) return null;
  return Math.max(0, resetAtEpochSec * 1000 - nowMs);
}

/** 残り時間の "M:SS" 表示。負は 0:00 */
export function formatCountdown(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "0:00";
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---- デモ再生（UI実装を待たずに見た目を確認するための疑似ラウンド列） ----

export type DemoRoundSpec = {
  round: number;
  since: string;
  survived: number;
  fell: number;
  vanished: number;
  pending: number;
};

/** 偽の ScanRow 列を作る。頭文字だけで表示する前提なので名前は h から作る */
export function demoRound(spec: DemoRoundSpec, seedHandles?: string[]): ArenaJudgeInput {
  const total = spec.survived + spec.fell + spec.vanished + spec.pending;
  const handles =
    seedHandles && seedHandles.length >= total
      ? seedHandles.slice(0, total)
      : Array.from({ length: total }, (_, i) => `demo${spec.round}_${i}`);
  const sinceMs = sinceStartMs(spec.since) ?? 0;
  const profiles: ScanRow[] = [];
  let cursor = 0;
  for (let i = 0; i < spec.survived && cursor < handles.length; i++, cursor++) {
    profiles.push({ h: handles[cursor], lp: sinceMs + 30 * 24 * 3600 * 1000, lt: "デモ: 最近の投稿" });
  }
  for (let i = 0; i < spec.fell && cursor < handles.length; i++, cursor++) {
    profiles.push({ h: handles[cursor], gone: false, lp: sinceMs - 24 * 3600 * 1000 });
  }
  for (let i = 0; i < spec.vanished && cursor < handles.length; i++, cursor++) {
    profiles.push({ h: handles[cursor], gone: true });
  }
  const checked = handles.map((h) => h);
  return { round: spec.round, since: spec.since, checked, profiles };
}

/** 休眠率5割想定の8ラウンド分デモ */
export function demoSchedule(since = "2025-09-19"): DemoRoundSpec[] {
  const shapes = [
    { survived: 7, fell: 11, vanished: 1, pending: 1 },
    { survived: 5, fell: 12, vanished: 3, pending: 0 },
    { survived: 9, fell: 9, vanished: 2, pending: 0 },
    { survived: 4, fell: 14, vanished: 2, pending: 0 },
    { survived: 12, fell: 6, vanished: 2, pending: 0 },
    { survived: 3, fell: 16, vanished: 1, pending: 0 },
  ];
  return shapes.map((s, i) => ({ round: i + 1, since, ...s }));
}
