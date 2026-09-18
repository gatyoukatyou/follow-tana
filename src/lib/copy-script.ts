import { toast } from "sonner";
import { copyTextSync } from "@/lib/utils";

export function copyConsoleScript(
  script: string,
  fromEl: HTMLTextAreaElement | HTMLInputElement | null,
  copiedLabel: string,
): boolean {
  const ok = copyTextSync(script, fromEl);
  if (ok) {
    toast.success(copiedLabel);
    return true;
  }
  if (fromEl) {
    fromEl.focus();
    fromEl.select();
  }
  toast.message(
    "コードを選択しました。command + C（Windowsは Ctrl + C）でコピーしてください。",
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
