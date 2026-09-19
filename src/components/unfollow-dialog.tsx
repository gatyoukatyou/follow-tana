"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { LoaderCircle, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ownerListUrl } from "@/lib/owner";
import { isAllowedXBridgeOrigin } from "@/hooks/use-x-bridge";
import { useRoster } from "@/lib/roster-store";
import { copyConsoleScript, downloadConsoleScript, openXListTab } from "@/lib/copy-script";
import { buildUnfollowScript } from "@/lib/x-unfollow-script";
import type { Person } from "@/lib/types";
import { cn } from "@/lib/utils";

const SAFE_BATCH = 60;

export function UnfollowDialog({
  open,
  onOpenChange,
  people,
  ownerHandle,
  onNeedOwner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: Person[];
  ownerHandle: string;
  onNeedOwner: () => void;
}) {
  const setPull = useRoster((s) => s.setPull);
  const pull = useRoster((s) => s.pull);
  const [cap, setCap] = useState(true);
  const [scriptOpen, setScriptOpen] = useState(false);
  const scriptRef = useRef<HTMLTextAreaElement>(null);
  const doneSet = useMemo(() => new Set<string>(), []);
  const failSet = useMemo(() => new Set<string>(), []);
  const [, forceTick] = useState(0);

  const targets = useMemo(() => {
    const self = ownerHandle.toLowerCase();
    const list = people.filter((p) => p.handle.toLowerCase() !== self);
    return cap && list.length > SAFE_BATCH ? list.slice(0, SAFE_BATCH) : list;
  }, [people, cap, ownerHandle]);

  const script = useMemo(
    () => buildUnfollowScript(
      targets.map((p) => ({ handle: p.handle, userId: p.userId })),
      ownerHandle,
    ),
    [targets, ownerHandle],
  );

  useEffect(() => {
    // Xタブの解除進捗（postMessage）を聞いて、リストの行を落としていく。
    // use-x-bridge とは独立に同じ message を聞き、名簿側の処理は変えない。
    function onMsg(e: MessageEvent) {
      if (!isAllowedXBridgeOrigin(e.origin, window.location.origin)) return;
      const d = e.data as {
        source?: string;
        op?: string;
        type?: string;
        handles?: unknown;
        fail?: unknown;
      };
      if (!d || d.source !== "follow-tana" || d.op !== "Unfollow") return;
      let changed = false;
      if (Array.isArray(d.handles)) {
        for (const h of d.handles) {
          const k = String(h).replace(/^@/, "").toLowerCase();
          if (k && !doneSet.has(k)) {
            doneSet.add(k);
            changed = true;
          }
        }
      }
      if (Array.isArray(d.fail)) {
        for (const h of d.fail) {
          const k = String(h).replace(/^@/, "").toLowerCase();
          if (k && !failSet.has(k)) {
            failSet.add(k);
            changed = true;
          }
        }
      }
      if (changed) forceTick((n) => n + 1);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [doneSet, failSet]);

  useEffect(() => {
    if (open) {
      setScriptOpen(false);
      setCap(people.length > SAFE_BATCH);
      doneSet.clear();
      failSet.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- セットは実体不変（useMemo固定）。開き直し時のクリアのみ
  }, [open, people.length]);

  useEffect(() => {
    if (!scriptOpen) return;
    const el = scriptRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [scriptOpen, script]);

  function copyScript(): Promise<boolean> {
    return copyConsoleScript(script, scriptRef.current, "外すコードをコピーしました");
  }

  function openX() {
    openXListTab(ownerListUrl(ownerHandle, "following"));
  }

  function start() {
    if (!ownerHandle) {
      toast.message("先に使うXアカウントを設定してください");
      onNeedOwner();
      return;
    }
    if (targets.length === 0) {
      toast.error("外す人がいません");
      return;
    }
    if (pull.status === "waiting" || pull.status === "running") {
      if (pull.kind !== "unfollow") {
        toast.message("Xとのやり取りの最中です。終わってから外す操作を始めてください");
        return;
      }
    }
    flushSync(() => {
      setPull({ status: "waiting", kind: "unfollow", count: 0 });
      setScriptOpen(true);
    });
    void copyScript();
    openX();
  }

  const running = pull.kind === "unfollow" && (pull.status === "waiting" || pull.status === "running");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Xでまとめて外す</DialogTitle>
          <DialogDescription>
            選択した {people.length.toLocaleString("ja-JP")} 人のうち{" "}
            {targets.length.toLocaleString("ja-JP")}{" "}
            人を、ログイン中のXでフォロー解除します。成功した人は棚からも消えます。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <ul className="max-h-28 overflow-y-auto rounded-md bg-secondary px-3 py-2 font-mono text-[12px] text-foreground">
            {targets.map((p) => {
              const doneRow = doneSet.has(p.handle.toLowerCase());
              const failedRow = failSet.has(p.handle.toLowerCase());
              return (
                <li
                  key={p.handle}
                  className={cn(
                    "transition-all duration-700 ease-out",
                    doneRow && "text-muted-foreground/40 line-through decoration-destructive/60",
                    failedRow && "text-amber-300",
                  )}
                >
                  @{p.handle}
                  {doneRow ? "  — 外した" : ""}
                  {failedRow ? "  — 見つからず" : ""}
                </li>
              );
            })}
            {targets.length === 0 && pull.status === "running" ? (
              <li className="text-muted-foreground">すべて処理しました</li>
            ) : null}
          </ul>
          {people.length > SAFE_BATCH ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={cap}
                onChange={(e) => {
                  if (!e.target.checked && people.length > SAFE_BATCH) {
                    const ok = confirm(
                      `${people.length}人まとめて外します。短時間の大量解除はXに止められる可能性があります。本当に制限を外しますか？`,
                    );
                    if (!ok) return;
                  }
                  setCap(e.target.checked);
                }}
                className="size-4 accent-foreground"
              />
              一度に {SAFE_BATCH} 人まで（Xの制限対策）
            </label>
          ) : (
            <p className="text-[12px] text-pretty text-muted-foreground">
              1人あたり約2秒です。短時間に外しすぎるとXが止めます。1日の目安は約400人です。
            </p>
          )}

          <Button onClick={() => start()} disabled={running || targets.length === 0}>
            {running ? <LoaderCircle className="size-4 animate-spin" /> : <UserMinus className="size-4" />}
            コードをコピーしてXを開く
          </Button>

          {pull.kind === "unfollow" && pull.status !== "idle" ? (
            <p className="text-sm tabular-nums text-slate">
              {pull.status === "waiting"
                ? "Xのタブでコードを貼ると、外した人数がここに増えます。"
                : pull.status === "running"
                  ? `外しています ${pull.count.toLocaleString("ja-JP")}人`
                  : `${pull.count.toLocaleString("ja-JP")}人を外しました`}
            </p>
          ) : null}

          {scriptOpen ? (
            <>
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-pretty text-foreground/90">
                <li>開いたXがフォロー一覧か確認します。</li>
                <li>F12 → コンソールの一番下に、command + V（Windowsは Ctrl + V）で貼って Enter。</li>
                <li>確認ダイアログで OK。タブタイトルが「外し ○人」と増えます。</li>
                <li>終わったらこの画面に戻ると、棚から消えています。</li>
              </ol>
              <Button type="button" size="sm" variant="secondary" onClick={() => void copyScript()}>
                コードを再コピー
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => downloadConsoleScript("follow-tana-unfollow.js", script)}
              >
                ファイルで保存
              </Button>
              <textarea
                ref={scriptRef}
                readOnly
                value={script}
                onFocus={(e) => e.currentTarget.select()}
                className="max-h-40 min-h-24 w-full resize-y rounded-md bg-secondary p-2 font-mono text-[11px] text-foreground"
                aria-label="フォロー解除コード"
              />
            </>
          ) : null}

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