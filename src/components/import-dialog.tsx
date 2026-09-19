"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Bookmark, LoaderCircle, Radio } from "lucide-react";
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
import { copyConsoleScript, downloadConsoleScript, openXListTab } from "@/lib/copy-script";
import { countToScan, scanEtaLabel } from "@/lib/filter-sort";
import { ownerListUrl } from "@/lib/owner";
import { parseImport } from "@/lib/parse-import";
import { parseRosterDump } from "@/lib/roster-backup";
import { useRoster } from "@/lib/roster-store";
import { buildCollectorScript, collectorBookmarklet } from "@/lib/x-collector-script";

const LIVE_PARSE_MAX = 20_000;

function yieldUi() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 50);
  });
}

function noticeUnknowns() {
  const unknown = countToScan(useRoster.getState().people, []);
  if (unknown <= 0) return;
  toast.message(
    `最終投稿はまだ未確認です。デスクの「生存確認」を押してください（${unknown.toLocaleString("ja-JP")}人・${scanEtaLabel(unknown)}）。待っているだけでは進みません。`,
    { duration: 12_000 },
  );
}

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
  const [busyLabel, setBusyLabel] = useState("名簿を読み込んでいます…");
  const [kind, setKind] = useState<"following" | "followers">(defaultKind);
  const [scriptOpen, setScriptOpen] = useState(false);
  const scriptRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const large = raw.length > LIVE_PARSE_MAX;
  const parsed = useMemo(
    () => (large ? { handles: [] as string[], archiveWithoutHandles: false } : parseImport(raw)),
    [large, raw],
  );
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

  async function runBusy(label: string, work: () => Promise<void>) {
    flushSync(() => {
      setBusyLabel(label);
      setBusy(true);
    });
    await yieldUi();
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }

  async function applyHandles(handles: string[]) {
    if (handles.length === 0) {
      toast.error("ハンドルが見つかりません");
      return;
    }
    if (kind === "followers") {
      const n = markFollowers(handles, { reconcile: true });
      toast.success(`フォロワー一覧で照合し、名簿中の ${n} 人を相互として更新しました。外れた人は一方に戻しています。`);
      setRaw("");
      onOpenChange(false);
      return;
    }
    const added = addHandles(handles, "import");
    toast.success(
      `${handles.length.toLocaleString("ja-JP")}人を読み込み、${added.toLocaleString("ja-JP")}人を追加しました。読み込みは完了です。`,
    );
    noticeUnknowns();
    setRaw("");
    onOpenChange(false);
  }

  async function ingestText(text: string) {
    const dump = parseRosterDump(text);
    if (dump && dump.length > 0) {
      const n = ingestRoster(dump);
      toast.success(`控えを取り込み、${n.toLocaleString("ja-JP")} 人を新規・更新しました。棚にだけある人は残ります。`);
      noticeUnknowns();
      setRaw("");
      onOpenChange(false);
      return;
    }
    const next = parseImport(text);
    if (next.archiveWithoutHandles) {
      toast.error(
        "XのデータアーカイブはユーザーIDのみで、ハンドルが含まれていません。上の「Xから一括で取る」を使ってください。",
      );
      return;
    }
    await applyHandles(next.handles);
  }

  async function onFile(file: File) {
    await runBusy("ファイルを読んでいます…", async () => {
      const text = await file.text();
      setBusyLabel("名簿を組み立てています…");
      await yieldUi();
      await ingestText(text);
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function copyScript(): Promise<boolean> {
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
    void copyScript();
    openFollowingTab();
  }

  async function submit() {
    await runBusy("名簿を読み込んでいます…", async () => {
      await ingestText(raw);
    });
  }

  const listUrl = ownerHandle ? ownerListUrl(ownerHandle, kind) : "";
  const pulling = pull.status === "waiting" || pull.status === "running";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {busy ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-card/90 px-6 text-center">
            <LoaderCircle className="size-7 animate-spin text-slate" />
            <p className="text-sm font-medium">{busyLabel}</p>
            <p className="text-[12px] text-pretty text-muted-foreground">
              人数が多いと数分かかることがあります。完了すると案内が出ます。終わるまでこのまま待ってください。
            </p>
          </div>
        ) : null}
        <DialogHeader>
          <DialogTitle>名簿を取り込む</DialogTitle>
          <DialogDescription>
            {kind === "following"
              ? "Xから一括で取るか、書き出したJSONの控えを戻します。取込は名簿だけ。最終投稿は取込後にデスクの「生存確認」（まとめ検索方式）で調べます。人数が多いと数分かかります。"
              : "Xのフォロワー一覧でコードを貼り、棚の人と照合して相互を付けます。"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={kind === "following" ? "default" : "secondary"}
              onClick={() => setKind("following")}
              disabled={busy}
            >
              フォロー中
            </Button>
            <Button
              type="button"
              size="sm"
              variant={kind === "followers" ? "default" : "secondary"}
              onClick={() => setKind("followers")}
              disabled={busy}
            >
              フォロワー（相互判定）
            </Button>
          </div>

          <Button onClick={() => startBulk()} disabled={pulling || busy}>
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
                そのあとタイトルが「確認 ○人」に変わり、最終投稿を調べます。
                <span className="text-foreground"> 完了までXのタブは前面のままにしてください。切り替えると止まります。</span>
                途中で止まったら同じコードをもう一度貼ってください。
              </li>
            </ol>
          ) : null}

          {scriptOpen ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => void copyScript()}>
                  コードを再コピー
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => downloadConsoleScript(`follow-tana-${kind}.js`, script)}
                >
                  ファイルで保存
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
            <span className="text-[11px] text-muted-foreground">またはJSON</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Label htmlFor="import-text">JSONまたはハンドル一覧</Label>
          <Textarea
            id="import-text"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={"書き出した follow-tana.json"}
            className="min-h-28 font-mono text-sm"
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setRaw("")} disabled={!raw || busy}>
              JSONをクリア
            </Button>
            <label className="text-xs text-muted-foreground">
              ファイル
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.csv,.json,.js"
                className="mt-1 block w-full text-xs file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-foreground"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
            </label>
          </div>
          <p className="text-sm tabular-nums text-muted-foreground">
            {large
              ? "大きいファイルです。棚に入れるを押すと読み込みます。完了すると案内が出ます。"
              : `検出: ${parsed.handles.length}人${parsed.archiveWithoutHandles ? " · アーカイブ形式のためハンドルがありません" : ""}`}
          </p>
          <p className="text-[12px] text-pretty text-muted-foreground">
            JSONを戻しても、最終投稿の確認は始まりません。入れ終わったらデスクの「生存確認」を押してください。
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
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
