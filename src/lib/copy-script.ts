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
    "自動コピーできませんでした。選択中のコードを command + C（Windowsは Ctrl + C）でコピーしてください。",
  );
  return false;
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
