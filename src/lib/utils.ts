import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFollowers(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 10_000) {
    const man = n / 10_000;
    const digits = man >= 10 ? 0 : 1;
    return `${man.toFixed(digits)}万`;
  }
  return n.toLocaleString("ja-JP");
}

export function formatLastPost(
  ts: number | null,
  opts?: { lookupFailed?: boolean; protected?: boolean },
): string {
  if (opts?.protected && (ts == null || !Number.isFinite(ts))) return "鍵";
  if (ts == null || !Number.isFinite(ts)) return opts?.lookupFailed ? "停止" : "未確認";
  const days = (Date.now() - ts) / 86_400_000;
  if (days < 0.6) return "今日";
  if (days < 1.6) return "昨日";
  if (days < 14) return `${Math.floor(days)}日前`;
  if (days < 60) return `${Math.max(1, Math.floor(days / 7))}週前`;
  if (days < 365) return `${Math.max(1, Math.floor(days / 30))}ヶ月前`;
  const years = Math.max(1, Math.floor(days / 365));
  return `${years}年前`;
}

export function formatExactDate(ts: number | null): string {
  if (ts == null || !Number.isFinite(ts)) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(ts));
}

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").split(/[/?#]/)[0] ?? "";
}

export function isValidHandle(handle: string): boolean {
  return /^[A-Za-z0-9_]{1,15}$/.test(handle);
}

export function copyTextSync(text: string, fromEl?: HTMLTextAreaElement | HTMLInputElement | null): boolean {
  if (typeof document === "undefined" || !text) return false;
  if (fromEl) {
    fromEl.focus();
    fromEl.select();
    try {
      fromEl.setSelectionRange(0, fromEl.value.length);
    } catch {
      /* some inputs reject setSelectionRange */
    }
    try {
      if (document.execCommand("copy")) return true;
    } catch {
      /* try detached field */
    }
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:fixed;top:0;left:0;width:8px;height:8px;padding:0;border:0;outline:none;opacity:0.01;";
  document.body.appendChild(el);
  el.focus();
  el.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  el.remove();
  return ok;
}

export async function copyText(text: string, fromEl?: HTMLTextAreaElement | HTMLInputElement | null): Promise<boolean> {
  if (copyTextSync(text, fromEl)) return true;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
