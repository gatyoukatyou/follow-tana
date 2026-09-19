"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Activity, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { ScanArena } from "@/components/scan-arena";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useArenaPref } from "@/hooks/use-arena-pref";
import { copyConsoleScript, downloadConsoleScript, openXListTab } from "@/lib/copy-script";
import { scanEtaLabel } from "@/lib/filter-sort";
import { useRoster } from "@/lib/roster-store";
import { buildScanScript, scanTargetHandles } from "@/lib/x-scan-script";
import type { Person } from "@/lib/types";

export function ScanDialog({
  open,
  onOpenChange,
  people,
  ownerHandle,
  onNeedOwner,
  onLocalScan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: Person[];
  ownerHandle: string;
  onNeedOwner: () => void;
  onLocalScan: () => void;
}) {
  const setPull = useRoster((s) => s.setPull);
  const pull = useRoster((s) => s.pull);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [arenaOn, setArenaOn] = useArenaPref();
  const scriptRef = useRef<HTMLTextAreaElement>(null);
  const handles = useMemo(() => scanTargetHandles(people), [people]); // 昔フォローした人から
  const script = useMemo(() => buildScanScript(handles), [handles]);

  useEffect(() => {
    if (open) setScriptOpen(false);
  }, [open]);

  useEffect(() => {
    if (!scriptOpen) return;
    const el = scriptRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [scriptOpen, script]);

  function copyScript(): Promise<boolean> {
    return copyConsoleScript(script, scriptRef.current, "生存確認のコードをコピーしました");
  }

  function start() {
    if (!ownerHandle) {
      toast.message("先に使うXアカウントを設定してください");
      onNeedOwner();
      return;
    }
    if (pull.status === "waiting" || pull.status === "running") {
      if (pull.kind !== "scan") {
        toast.message("Xとのやり取りの最中です。終わってから生存確認を始めてください");
        return;
      }
    }
    if (handles.length === 0) {
      toast.error("確認する人がいません");
      return;
    }
    flushSync(() => {
      setPull({ status: "waiting", kind: "scan", count: 0 });
      setScriptOpen(true);
    });
    void copyScript();
    openXListTab("https://x.com/search?q=from%3AX&src=typed_query&f=live");
  }

  const running = pull.kind === "scan" && (pull.status === "waiting" || pull.status === "running");
  const otherBusy =
    (pull.status === "waiting" || pull.status === "running") && pull.kind !== "scan";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>生存確認（今日の外し候補を探す）</DialogTitle>
          <DialogDescription>
            {people.length.toLocaleString("ja-JP")}{" "}
            人を20人ずつまとめ検索で調べます。昔フォローした人から順に、検索枠（50回/15分）を使い切ると15分待ちます。枠は約3分で使い切ります。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-pretty text-muted-foreground">
            開くのは検索ページです。コードを貼ると20人ずつまとめ検索で調べ、見つかった休眠が随時棚に流れ込みます。待ち時間は外す人を選ぶ時間にしてください。
          </p>
          <Button onClick={() => start()} disabled={running || otherBusy || handles.length === 0}>
            {running ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Activity className="size-4" />
            )}
            コードをコピーしてXを開く
          </Button>
          {pull.kind === "scan" && pull.status !== "idle" ? (
            <p className="text-sm tabular-nums text-slate">
              {pull.status === "waiting"
                ? "Xのタブでコードを貼ると、ここに人数が増えます。"
                : pull.status === "running"
                  ? `調べています ${pull.count.toLocaleString("ja-JP")}人`
                  : `${pull.count.toLocaleString("ja-JP")}人を調べ終わりました`}
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox checked={arenaOn} onCheckedChange={setArenaOn} />
            ゲーム表示（○×落とし穴）で待つ
          </label>
          {arenaOn ? <ScanArena /> : null}
          {scriptOpen ? (
            <>
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-pretty text-muted-foreground">
                <li>開いたXが検索結果ページか確認します（フォロー一覧ではなく）。</li>
                <li>
                  F12 → コンソールの一番下に、command + V（Windowsは Ctrl + V）で貼って Enter。
                </li>
                <li>
                  確認ダイアログで
                  OK。枠（50回）を約3分で使い切ると15分待ちに入ります。途中で閉じても進捗は保存済み。
                </li>
                <li>
                  終わったらこの画面に戻ると、休眠が確定しています。飽和で保留になった人は次回また調べます。
                </li>
              </ol>
              <Button type="button" size="sm" variant="secondary" onClick={() => void copyScript()}>
                コードを再コピー
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => downloadConsoleScript("follow-tana-scan.js", script)}
              >
                ファイルで保存
              </Button>
              <textarea
                ref={scriptRef}
                readOnly
                value={script}
                onFocus={(e) => e.currentTarget.select()}
                className="max-h-40 min-h-24 w-full resize-y rounded-md bg-secondary p-2 font-mono text-[11px] text-foreground"
                aria-label="生存確認コード"
              />
            </>
          ) : null}
          <button
            type="button"
            className="self-start text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => {
              onOpenChange(false);
              onLocalScan();
            }}
          >
            この画面だけで調べる（遅い・{scanEtaLabel(people.length) || "時間がかかる"}）
          </button>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              閉じる
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
