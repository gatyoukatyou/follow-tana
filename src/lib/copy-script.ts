import { toast } from "sonner";
import { copyText } from "@/lib/utils";

export async function copyConsoleScript(
  script: string,
  fromEl: HTMLTextAreaElement | HTMLInputElement | null,
  copiedLabel: string,
): Promise<boolean> {
  if (!script) {
    toast.error("コピーするコードがありません");
    return false;
  }
  if (await copyText(script)) {
    toast.success(copiedLabel);
    return true;
  }
  if (fromEl) {
    fromEl.focus();
    fromEl.select();
  }
  toast.message(
    "自動コピーできませんでした（プレビュー埋め込み等では制限されます）。選択中のコードを手でコピーするか、下の「ファイルで保存」を使ってください。",
    { duration: 8000 },
  );
  return false;
}

/** クリップボードが使えない環境向け：スクリプトを .js ファイルとして保存する */
export function downloadConsoleScript(filename: string, script: string): boolean {
  if (!script) {
    toast.error("保存するコードがありません");
    return false;
  }
  try {
    const blob = new Blob([script], { type: "text/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success("コードをファイルに保存しました。開いて全選択コピーしてください");
    return true;
  } catch {
    toast.error("ファイル保存もできませんでした");
    return false;
  }
}

export function openXListTab(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "opener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
