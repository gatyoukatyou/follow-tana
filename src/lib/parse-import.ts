import { isValidHandle, normalizeHandle } from "@/lib/utils";

const HANDLE_TOKEN = /(?:^|[\s,;<>()[\]"'`])@([A-Za-z0-9_]{1,15})\b/g;
const PROFILE_URL =
  /(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/(?:intent\/user\?screen_name=)?@?([A-Za-z0-9_]{1,15})(?=[/?#\s]|$)/gi;

function pushUnique(out: string[], seen: Set<string>, handle: string) {
  const clean = normalizeHandle(handle);
  if (!isValidHandle(clean)) return;
  const key = clean.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push(clean);
}

function fromJson(raw: string, out: string[], seen: Set<string>): boolean {
  try {
    const data = JSON.parse(raw) as unknown;
    const walk = (node: unknown) => {
      if (typeof node === "string") {
        const n = normalizeHandle(node);
        if (isValidHandle(n)) pushUnique(out, seen, n);
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (node && typeof node === "object") {
        const rec = node as Record<string, unknown>;
        for (const key of ["handle", "username", "screen_name", "screenName", "userName"]) {
          if (typeof rec[key] === "string") pushUnique(out, seen, rec[key] as string);
        }
        Object.values(rec).forEach(walk);
      }
    };
    walk(data);
    return true;
  } catch {
    return false;
  }
}

function fromCsv(raw: string, out: string[], seen: Set<string>) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return;
  const header = lines[0]!.split(/[, \t]/).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
  const idx = header.findIndex((h) =>
    ["handle", "username", "screen_name", "screenname", "user", "account"].includes(h),
  );
  if (idx < 0) return;
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const cell = cols[idx];
    if (cell) pushUnique(out, seen, cell);
  }
}

export function looksLikeTwitterArchive(raw: string): boolean {
  return /YTD\.following|window\.YTD|"accountId"\s*:/.test(raw) && !/@[A-Za-z0-9_]/.test(raw);
}

export function parseImport(raw: string): { handles: string[]; archiveWithoutHandles: boolean } {
  const text = raw.trim();
  const out: string[] = [];
  const seen = new Set<string>();
  if (!text) return { handles: out, archiveWithoutHandles: false };

  const archiveWithoutHandles = looksLikeTwitterArchive(text);

  if (text.startsWith("{") || text.startsWith("[")) {
    fromJson(text, out, seen);
    if (out.length) return { handles: out, archiveWithoutHandles: false };
  }

  fromCsv(text, out, seen);

  HANDLE_TOKEN.lastIndex = 0;
  PROFILE_URL.lastIndex = 0;

  for (const match of text.matchAll(PROFILE_URL)) {
    const handle = match[1];
    if (handle && !["i", "intent", "home", "explore", "search", "settings"].includes(handle.toLowerCase())) {
      pushUnique(out, seen, handle);
    }
  }

  for (const match of text.matchAll(HANDLE_TOKEN)) {
    if (match[1]) pushUnique(out, seen, match[1]);
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^@/, "");
    if (isValidHandle(trimmed)) pushUnique(out, seen, trimmed);
  }

  return { handles: out, archiveWithoutHandles: archiveWithoutHandles && out.length === 0 };
}

export function buildXSearchUrl(handles: string[], keyword: string): string {
  const unique = [...new Set(handles.map((h) => normalizeHandle(h)).filter(isValidHandle))];
  const capped = unique.slice(0, 18);
  const from = capped.map((h) => `from:${h}`).join(" OR ");
  const q = keyword.trim() ? `(${from}) ${keyword.trim()}` : `(${from})`;
  return `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live`;
}

export const X_SEARCH_HANDLE_CAP = 18;
