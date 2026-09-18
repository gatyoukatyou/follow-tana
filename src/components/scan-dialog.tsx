"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Activity, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copyConsoleScript, openXListTab } from "@/lib/copy-script";
import { scanEtaLabel } from "@/lib/filter-sort";
import { ownerListUrl } from "@/lib/owner";
import { useRoster } from "@/lib/roster-store";
import { buildScanScript } from "@/lib/x-scan-script";
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
  const scriptRef = useRef<HTMLTextAreaElement>(null);
  const handles = useMemo(() => people.map((p) => p.handle), [people]);
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
    openXListTab(ownerListUrl(ownerHandle, "following"));
  }

  const running = pull.kind === "scan" && (pull.status === "waiting" || pull.status === "running");
  const otherBusy =
    (pull.status === "waiting" || pull.status === "running") && pull.kind !== "scan";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>生存確認</DialogTitle>
          <DialogDescription>
            {people.length.toLocaleString("ja-JP")}{" "}
            人の最終投稿を、ログイン中のXで調べます。7,500人規模なら数分です。公開の検索より多く取れます。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-pretty text-muted-foreground">
            取込と同じ手順です。コードを貼ると、100人ずつ最終投稿を戻します。タブは前面のまま完了まで待ってください。
          </p>
          <Button onClick={() => start()} disabled={running || otherBusy || handles.length === 0}>
            {running ? <LoaderCircle className="size-4 animate-spin" /> : <Activity className="size-4" />}
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
          {scriptOpen ? (
            <>
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-pretty text-muted-foreground">
                <li>開いたXがフォロー一覧か確認します。</li>
                <li>F12 → コンソールの一番下に、command + V（Windowsは Ctrl + V）で貼って Enter。</li>
                <li>確認ダイアログで OK。タブタイトルが「確認 ○人」と増えます。</li>
                <li>終わったらこの画面に戻ると、未確認が生存・休眠・停止に分かれています。</li>
              </ol>
              <Button type="button" size="sm" variant="secondary" onClick={() => void copyScript()}>
                コードを再コピー
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
