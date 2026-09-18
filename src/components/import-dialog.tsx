"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Bookmark, ClipboardPaste, LoaderCircle, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseImport } from "@/lib/parse-import";
import { parseRosterDump } from "@/lib/roster-backup";
import { ownerListUrl } from "@/lib/owner";
import { useRoster } from "@/lib/roster-store";
import { copyConsoleScript, openXListTab } from "@/lib/copy-script";
import { buildCollectorScript, collectorBookmarklet } from "@/lib/x-collector-script";

export function ImportDialog({
  open,
  onOpenChange,
  defaultKind = "following",
  ownerHandle,
  onNeedOwner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind?: "following" | "followers";
  ownerHandle: string;
  onNeedOwner: () => void;
}) {
  const addHandles = useRoster((s) => s.addHandles);
  const ingestRoster = useRoster((s) => s.ingestRoster);
  const markFollowers = useRoster((s) => s.markFollowers);
  const setPull = useRoster((s) => s.setPull);
  const pull = useRoster((s) => s.pull);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"following" | "followers">(defaultKind);
  const [scriptOpen, setScriptOpen] = useState(false);
  const scriptRef = useRef<HTMLTextAreaElement>(null);
  const parsed = parseImport(raw);
  const script = buildCollectorScript(kind);

  useEffect(() => {
    if (open) {
      setKind(defaultKind);
      setScriptOpen(false);
    }
  }, [open, defaultKind]);

  useEffect(() => {
    if (pull.status === "done" && pull.count > 0) {
      setScriptOpen(false);
    }
  }, [pull.status, pull.count]);

  useEffect(() => {
    if (!scriptOpen) return;
    const el = scriptRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [scriptOpen, script]);

  async function onFile(file: File) {
    const text = await file.text();
    setRaw(text);
  }

  function copyScript(): boolean {
    return copyConsoleScript(script, scriptRef.current, "取得コードをコピーしました");
  }

  function openFollowingTab() {
    openXListTab(ownerListUrl(ownerHandle, kind));
  }

  function startBulk() {
    if (!ownerHandle) {
      toast.message("先に使うXアカウントを設定してください");
      onNeedOwner();
      return;
    }
    flushSync(() => {
      setPull({ status: "waiting", kind, count: 0 });
      setScriptOpen(true);
    });
    copyScript();
    openFollowingTab();
  }

  async function fromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error("クリップボードが空です");
        return;
      }
      const next = parseImport(text);
      if (next.handles.length === 0) {
        setRaw(text);
        toast.error("ハンドルが見つかりません。テキストを確認してください。");
        return;
      }
      setRaw(text);
      await applyHandles(next.handles);
    } catch {
      toast.error("クリップボードを読めませんでした。枠に貼り付けてください。");
    }
  }

  async function applyHandles(handles: string[]) {
    if (handles.length === 0) {
      toast.error("ハンドルが見つかりません");
      return;
    }
    setBusy(true);
    try {
      if (kind === "followers") {
        const n = markFollowers(handles);
        toast.success(`フォロワー ${n} 人を照合し、相互を更新しました`);
        setRaw("");
        onOpenChange(false);
        return;
      }
      const added = addHandles(handles, "import");
      toast.success(`${handles.length}人を読み込み、${added}人を新規追加しました`);
      setRaw("");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const dump = parseRosterDump(raw);
    if (dump && dump.length > 0) {
      setBusy(true);
      try {
        const n = ingestRoster(dump);
        toast.success(`控えから ${n.toLocaleString("ja-JP")} 人を復元しました`);
        setRaw("");
        onOpenChange(false);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (parsed.archiveWithoutHandles) {
      toast.error(
        "XのデータアーカイブはユーザーIDのみで、ハンドルが含まれていません。上の「Xから一括で取る」を使ってください。",
      );
      return;
    }
    await applyHandles(parsed.handles);
  }

  const listUrl = ownerHandle ? ownerListUrl(ownerHandle, kind) : "";

  const pulling = pull.status === "waiting" || pull.status === "running";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>名簿を取り込む</DialogTitle>
          <DialogDescription>
            {kind === "following"
              ? "ログイン中のXのフォロー一覧でコードを貼るか、書き出したJSONの控えを戻します。"
              : "ログイン中のXのフォロワー一覧ページでコードを貼り、棚の人と照合して相互を付けます。"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={kind === "following" ? "default" : "secondary"}
              onClick={() => setKind("following")}
            >
              フォロー中
            </Button>
            <Button
              type="button"
              size="sm"
              variant={kind === "followers" ? "default" : "secondary"}
              onClick={() => setKind("followers")}
            >
              フォロワー（相互判定）
            </Button>
          </div>

          <Button onClick={() => startBulk()} disabled={pulling}>
            {pulling ? <LoaderCircle className="size-4 animate-spin" /> : <Radio className="size-4" />}
            Xから一括で取る
          </Button>

          {pull.status !== "idle" ? (
            <p className="text-sm tabular-nums text-slate">
              {pull.status === "waiting"
                ? "Xのタブでコードを実行すると、ここに人数が増えます。"
                : pull.status === "running"
                  ? `取得中 ${pull.count.toLocaleString("ja-JP")}人`
                  : `${pull.count.toLocaleString("ja-JP")}人を受け取りました`}
            </p>
          ) : null}

          {scriptOpen ? (
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-pretty text-muted-foreground">
              <li>
                開いたXのタブのアドレスが{" "}
                <span className="font-mono text-[12px] text-foreground">
                  /{ownerHandle}/{kind === "followers" ? "followers" : "following"}
                </span>{" "}
                になっているか確認します。ホームでは取れません。
              </li>
              <li>F12（Macは option + command + I）→ 「コンソール」。入力は一番下の行です。</li>
              <li>
                半角英数のまま、command + V（Windowsは Ctrl + V）でコードを貼って Enter。
                <span className="text-foreground"> allow pasting とは打たないでください。</span>
              </li>
              <li>
                貼った直後に黄色い警告だけが出たら、そのとき初めて{" "}
                <kbd className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[12px] text-foreground">
                  allow pasting
                </kbd>{" "}
                と打って Enter。そのあと「コードを再コピー」して、もう一度貼ります。
              </li>
              <li>
                SyntaxError と出たら、貼り付けはもう許可されています。コンソールを消してコードを貼ってください。
              </li>
              <li>
                タブのタイトルが「棚 人数/目安」と増え、プロフィールのフォロー数に近づくまで待ちます。
                <span className="text-foreground"> 完了までXのタブは前面のままにしてください。切り替えると止まります。</span>
                途中で止まったら同じコードをもう一度貼ってください。
              </li>
            </ol>
          ) : null}

          {scriptOpen ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => copyScript()}>
                  コードを再コピー
                </Button>
                <Button type="button" size="sm" variant="ghost" asChild>
                  <a href={listUrl} target="_blank" rel="opener">
                    {kind === "followers" ? "フォロワー一覧を開き直す" : "フォロー一覧を開き直す"}
                  </a>
                </Button>
              </div>
              <a
                href={collectorBookmarklet(kind)}
                onClick={(e) => e.preventDefault()}
                className="inline-flex h-9 items-center gap-2 self-start rounded-sm bg-secondary px-3 text-[13px] text-secondary-foreground shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
              >
                <Bookmark className="size-3.5" />
                ブックマークバーへドラッグ（コンソール不要）
              </a>
              <textarea
                ref={scriptRef}
                readOnly
                value={script}
                onFocus={(e) => e.currentTarget.select()}
                className="max-h-40 min-h-24 w-full resize-y rounded-md bg-secondary p-2 font-mono text-[11px] text-foreground"
                aria-label="取得コード"
              />
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground">または貼り付け</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Label htmlFor="import-text">テキスト</Label>
          <Textarea
            id="import-text"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={"書き出した follow-tana.json か、@handle のリスト"}
            className="min-h-28 font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => void fromClipboard()}>
              <ClipboardPaste className="size-3.5" />
              クリップボードから入れる
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRaw("")} disabled={!raw}>
              JSONをクリア
            </Button>
            <label className="text-xs text-muted-foreground">
              ファイル
              <input
                type="file"
                accept=".txt,.csv,.json,.js"
                className="mt-1 block w-full text-xs file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-foreground"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
            </label>
          </div>
          <p className="text-sm tabular-nums text-muted-foreground">
            検出: {parsed.handles.length}人
            {parsed.archiveWithoutHandles ? " · アーカイブ形式のためハンドルがありません" : ""}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              やめる
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {kind === "followers" ? "相互を更新" : "棚に入れる"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

