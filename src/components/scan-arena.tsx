"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ARENA_PIT_CAP,
  ARENA_ROUND_SIZE,
  countdownMs,
  formatCountdown,
  quotaProgress,
  type ArenaFigure,
  type ArenaState,
  type FigureStatus,
} from "@/lib/arena";
import { useArena } from "@/lib/arena-store";
import { cn } from "@/lib/utils";

/**
 * ○×落とし穴：生存確認の進みをラウンド制で見せる。
 * 状態は arena-store が持ち、ここは描くだけ。駒は頭文字のみ（名前は出さない）。
 */

const MARK: Record<FigureStatus, string> = {
  waiting: "",
  alive: "○",
  dormant: "×",
  gone: "…",
  pending: "?",
};

const LABEL: Record<FigureStatus, string> = {
  waiting: "判定待ち",
  alive: "生存（退場）",
  dormant: "脱落（休眠）",
  gone: "消失（凍結・削除）",
  pending: "判定保留（次の組へ）",
};

const FIGURE_CLASS: Record<FigureStatus, string> = {
  waiting: "bg-secondary text-muted-foreground arena-wobble",
  alive: "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/50 arena-hop",
  dormant: "bg-destructive/25 text-destructive arena-drop",
  gone: "bg-secondary text-muted-foreground/60 arena-poof",
  pending: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/50 arena-pulse",
};

function Figure({ figure }: { figure: ArenaFigure }) {
  const initial =
    figure.status === "waiting"
      ? "·"
      : figure.handle
          .replace(/^tana_/, "")
          .slice(0, 1)
          .toUpperCase() || "?";
  const showAvatar = Boolean(figure.av);
  return (
    <div
      className={cn(
        "relative flex size-7 items-center justify-center overflow-hidden rounded-full font-mono text-[10px] tabular-nums select-none",
        FIGURE_CLASS[figure.status],
      )}
      title={`@${figure.handle} — ${LABEL[figure.status]}`}
      aria-hidden
    >
      {showAvatar ? (
        <>
          <img
            src={figure.av}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
          <span className="absolute inset-0 rounded-full bg-foreground/5" />
        </>
      ) : null}
      <span className={cn(showAvatar && "drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]")}>{initial}</span>
      {MARK[figure.status] ? (
        <span className="absolute -top-1.5 -right-1 text-[11px] leading-none">
          {MARK[figure.status]}
        </span>
      ) : null}
    </div>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function bannerText(state: ArenaState): string | null {
  if (!state.banner) return null;
  switch (state.banner.kind) {
    case "quota":
      return `本日ノルマ達成！ ${state.quota.toLocaleString("ja-JP")}人`;
    case "wipeout":
      return `第${state.banner.round}ラウンド 全滅！`;
    case "combo":
      return `脱落コンボ ×${state.combo}`;
  }
}

export function ScanArena({ className }: { className?: string }) {
  const arena = useArena((s) => s.arena);
  const demo = useArena((s) => s.demo);
  const startDemo = useArena((s) => s.startDemo);
  const stopDemo = useArena((s) => s.stopDemo);
  const reset = useArena((s) => s.reset);
  const now = useNow(arena.phase === "interval");
  const quota = quotaProgress(arena);
  const banner = bannerText(arena);
  const stage: ArenaFigure[] =
    arena.stage.length > 0
      ? arena.stage
      : Array.from({ length: ARENA_ROUND_SIZE }, (_, i) => ({
          handle: `slot${i}`,
          status: "waiting" as const,
        }));
  const pitShown = arena.pit.slice(0, ARENA_PIT_CAP);
  const pitOverflow = Math.max(0, arena.totals.dormant - pitShown.length);
  const idle = arena.phase === "idle";

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-lg bg-secondary/60 p-3 shadow-[var(--shadow-border)]",
        className,
      )}
      aria-label="○×落とし穴"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {idle ? "○×落とし穴" : `第${arena.round.toLocaleString("ja-JP")}ラウンド`}
        </span>
        {arena.rl ? (
          <span className="tabular-nums">
            枠 {arena.rl.remaining}/{arena.rl.limit}
          </span>
        ) : null}
        {demo ? <span className="rounded-sm bg-accent px-1.5 py-0.5 text-[11px]">デモ</span> : null}
        <span className="ml-auto tabular-nums">
          ノルマ {quota.done.toLocaleString("ja-JP")} / {quota.quota.toLocaleString("ja-JP")}
        </span>
      </header>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-background" aria-hidden>
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            arena.quotaReachedAt != null ? "bg-emerald-400" : "bg-destructive",
          )}
          style={{ width: `${Math.round(quota.ratio * 100)}%` }}
        />
      </div>

      <div>
        {banner ? (
          <p
            key={`${arena.banner?.kind}-${arena.round}`}
            className="mb-1.5 flex justify-center animate-in fade-in zoom-in-95 duration-300"
          >
            <span className="rounded-md bg-foreground px-3 py-0.5 text-[12px] font-semibold text-background">
              {banner}
            </span>
          </p>
        ) : (
          <p className="mb-1.5 text-center text-[11px] text-muted-foreground">
            お題：<span className="text-foreground">1年以内に投稿した？</span>
          </p>
        )}
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10" aria-hidden>
          {stage.map((f) => (
            <Figure key={f.handle} figure={f} />
          ))}
        </div>
        <div className="mt-2 border-t border-dashed border-border" aria-hidden />
      </div>

      <p className="sr-only" aria-live="polite">
        {idle
          ? "まだ始まっていません"
          : `第${arena.round}ラウンド。生存${arena.lastRound.alive}、脱落${arena.lastRound.dormant}、消失${arena.lastRound.gone}、保留${arena.lastRound.pending}。合計で脱落${arena.totals.dormant}人。`}
      </p>

      <div className="flex items-end gap-3 text-[12px] text-muted-foreground">
        <div className="flex min-w-0 flex-1 flex-wrap content-start gap-[3px]" aria-hidden>
          {pitShown.map((h, i) => (
            <span
              key={`${h}-${i}`}
              className="size-2 rounded-full bg-destructive/70"
              title={`@${h}`}
            />
          ))}
          {pitOverflow > 0 ? (
            <span className="ml-1 tabular-nums">+{pitOverflow.toLocaleString("ja-JP")}</span>
          ) : null}
          {arena.totals.dormant === 0 ? <span>脱落ピット（ここに落ちてきます）</span> : null}
        </div>
        <dl className="flex shrink-0 gap-3 tabular-nums">
          <div className="text-right">
            <dt className="text-[10px]">脱落</dt>
            <dd className="text-lg leading-tight font-semibold text-foreground">
              {arena.totals.dormant.toLocaleString("ja-JP")}
            </dd>
          </div>
          <div className="text-right">
            <dt className="text-[10px]">生存</dt>
            <dd className="leading-tight text-foreground">
              {arena.totals.alive.toLocaleString("ja-JP")}
            </dd>
          </div>
          <div className="text-right">
            <dt className="text-[10px]">消失</dt>
            <dd className="leading-tight text-foreground">
              {arena.totals.gone.toLocaleString("ja-JP")}
            </dd>
          </div>
          <div className="text-right">
            <dt className="text-[10px]">保留</dt>
            <dd className="leading-tight text-foreground">
              {arena.totals.pending.toLocaleString("ja-JP")}
            </dd>
          </div>
        </dl>
      </div>

      {arena.phase === "interval" ? (
        <div className="flex flex-col items-center gap-1 rounded-md bg-background/70 p-3 text-center animate-in fade-in duration-300">
          <p className="text-[11px] text-muted-foreground">インターバル · 次のラウンドまで</p>
          <p className="font-mono text-3xl font-semibold tabular-nums text-foreground">
            {formatCountdown(countdownMs(arena.rl, now))}
          </p>
          <p className="text-[12px] text-foreground">脱落者の選別タイム</p>
          <p className="text-[11px] text-pretty text-muted-foreground">
            見つかった休眠は棚に入っています。この間に外す人を選べます。Xのタブは開いたままで、枠が戻ると自動で続きます。
          </p>
        </div>
      ) : null}

      {arena.phase === "done" ? (
        <div className="rounded-md bg-background/70 p-3 text-center text-[12px] animate-in fade-in duration-300">
          <p className="font-medium text-foreground">本日分 終了</p>
          <p className="text-muted-foreground">
            {arena.round}ラウンド · 脱落{arena.totals.dormant.toLocaleString("ja-JP")} · 生存
            {arena.totals.alive.toLocaleString("ja-JP")} · 消失
            {arena.totals.gone.toLocaleString("ja-JP")}
            {arena.quotaReachedAt != null ? " · ノルマ達成" : ""}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {idle ? (
          <p className="text-[11px] text-muted-foreground">
            コードを貼ると、ここに20人ずつ並びます。
          </p>
        ) : null}
        <div className="ml-auto flex gap-2">
          {demo ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => stopDemo()}>
              デモを止める
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={arena.phase === "running"}
              onClick={() => startDemo({ intervalMs: 700 })}
            >
              デモ再生
            </Button>
          )}
          {!idle && !demo ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => reset()}>
              リセット
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
