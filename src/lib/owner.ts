import { isValidHandle, normalizeHandle } from "@/lib/utils";

const KEY = "follow-tana-owner";
const listeners = new Set<() => void>();

function read(): string {
  try {
    if (typeof localStorage === "undefined") return "";
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function emit() {
  for (const fn of listeners) fn();
}

export function getOwnerHandle(): string {
  return read();
}

export function setOwnerHandle(raw: string): boolean {
  const handle = normalizeHandle(raw);
  if (!isValidHandle(handle)) return false;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, handle);
  } catch {
    /* ignore */
  }
  emit();
  return true;
}

export function subscribeOwner(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function ownerListUrl(handle: string, kind: "following" | "followers"): string {
  return `https://x.com/${handle}/${kind}`;
}
