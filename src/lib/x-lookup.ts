import { createServerFn } from "@tanstack/react-start";
import { isValidHandle, normalizeHandle } from "@/lib/utils";
import type { ProfileSnapshot } from "@/lib/types";

type FxUser = {
  screen_name?: string;
  id?: string;
  name?: string;
  description?: string;
  avatar_url?: string;
  followers?: number;
  following?: number;
  tweets?: number;
  location?: string;
  joined?: string;
  protected?: boolean;
  website?: { url?: string };
  verification?: { verified?: boolean };
};

type FxResponse = { code?: number; user?: FxUser };
type FxStatus = {
  text?: string;
  created_at?: string;
  created_timestamp?: number;
};
type FxStatuses = { code?: number; results?: FxStatus[] };

export const LOOKUP_BATCH = 6;
const NITTER_HOSTS = ["https://nitter.netbub.com", "https://nitter.cz"];
const UA = "Mozilla/5.0 (compatible; FollowTana/1.0; +https://x.com)";

function parseTwitterDate(raw: string | number | undefined | null): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 1e12 ? Math.round(raw * 1000) : Math.round(raw);
  }
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : null;
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

async function fetchLastPost(handle: string): Promise<{ at: number; text: string } | null> {
  return firstNonNull([
    fetchFxStatuses(handle),
    ...NITTER_HOSTS.map((host) => fetchNitterRss(host, handle)),
  ]);
}

function firstNonNull<T>(jobs: Promise<T | null>[]): Promise<T | null> {
  return new Promise((resolve) => {
    let open = jobs.length;
    if (open === 0) {
      resolve(null);
      return;
    }
    let settled = false;
    for (const job of jobs) {
      void job.then(
        (value) => {
          if (value && !settled) {
            settled = true;
            resolve(value);
            return;
          }
          open -= 1;
          if (!settled && open === 0) resolve(null);
        },
        () => {
          open -= 1;
          if (!settled && open === 0) resolve(null);
        },
      );
    }
  });
}

async function fetchNitterRss(
  host: string,
  handle: string,
): Promise<{ at: number; text: string } | null> {
  try {
    const res = await fetch(`${host}/${encodeURIComponent(handle)}/rss`, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": UA },
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const xml = await res.text();
    const item = xml.split("<item>")[1];
    if (!item) return null;
    const pub = item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1];
    const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    const at = parseTwitterDate(pub ?? "");
    if (at) return { at, text: decodeXml(title).slice(0, 180) };
  } catch {
    /* dead mirror */
  }
  return null;
}

async function fetchFxStatuses(handle: string): Promise<{ at: number; text: string } | null> {
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(
        `https://api.fxtwitter.com/2/profile/${encodeURIComponent(handle)}/statuses?count=1`,
        {
          headers: { Accept: "application/json", "User-Agent": UA },
          signal: AbortSignal.timeout(7000),
          cache: "no-store",
        },
      );
      if (res.status === 429 || res.status >= 500) {
        if (i === 0) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        return null;
      }
      if (!res.ok) return null;
      const body = (await res.json()) as FxStatuses;
      const item = body.results?.[0];
      if (!item) return null;
      const at = parseTwitterDate(item.created_timestamp) ?? parseTwitterDate(item.created_at);
      if (!at) return null;
      return { at, text: (item.text ?? "").slice(0, 180) };
    } catch {
      if (i === 0) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
    }
  }
  return null;
}

function emptySnap(handle: string, lookupFailed: boolean): ProfileSnapshot {
  return {
    handle,
    userId: "",
    name: "",
    bio: "",
    avatarUrl: "",
    followers: 0,
    following: 0,
    tweetCount: 0,
    verified: false,
    protected: false,
    website: "",
    location: "",
    joinedAt: null,
    lastPostAt: null,
    lastPostText: "",
    lookupFailed,
  };
}

function toSnapshot(handle: string, user: FxUser, last: { at: number; text: string } | null): ProfileSnapshot {
  const avatar = (user.avatar_url ?? "").replace("_normal", "_bigger");
  const tweetCount = Number(user.tweets ?? 0) || 0;
  const joinedAt = parseTwitterDate(user.joined);
  let lastPostAt = last?.at ?? null;
  let lastPostText = last?.text ?? "";
  if (lastPostAt == null && tweetCount === 0) {
    lastPostAt = joinedAt;
    lastPostText = "投稿なし";
  }
  return {
    handle: user.screen_name || handle,
    userId: String(user.id ?? ""),
    name: user.name ?? "",
    bio: (user.description ?? "").slice(0, 400),
    avatarUrl: avatar,
    followers: Number(user.followers ?? 0) || 0,
    following: Number(user.following ?? 0) || 0,
    tweetCount,
    verified: Boolean(user.verification?.verified),
    protected: Boolean(user.protected),
    website: user.website?.url ?? "",
    location: user.location ?? "",
    joinedAt,
    lastPostAt,
    lastPostText,
    lookupFailed: false,
  };
}

async function fetchFxUser(handle: string): Promise<{ status: number; user: FxUser | null }> {
  let last = { status: 0, user: null as FxUser | null };
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(`https://api.fxtwitter.com/${encodeURIComponent(handle)}`, {
        headers: { Accept: "application/json", "User-Agent": UA },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (res.status === 404) return { status: 404, user: null };
      if (res.status === 429 || res.status >= 500) {
        last = { status: res.status, user: null };
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      if (!res.ok) return { status: res.status, user: null };
      const body = (await res.json()) as FxResponse;
      if (!body.user?.screen_name) return { status: body.code === 404 ? 404 : res.status, user: null };
      return { status: 200, user: body.user };
    } catch {
      last = { status: 0, user: null };
      if (i === 0) await new Promise((r) => setTimeout(r, 400));
    }
  }
  return last;
}

async function fetchProfile(handle: string): Promise<ProfileSnapshot> {
  const [fx, last] = await Promise.all([fetchFxUser(handle), fetchLastPost(handle)]);
  if (fx.status === 404) {
    if (last) {
      return { ...emptySnap(handle, false), lastPostAt: last.at, lastPostText: last.text };
    }
    return emptySnap(handle, false);
  }
  if (fx.user) return toSnapshot(handle, fx.user, fx.user.protected ? null : last);
  if (last) {
    return {
      ...emptySnap(handle, false),
      lastPostAt: last.at,
      lastPostText: last.text,
    };
  }
  return emptySnap(handle, fx.status === 404);
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export const lookupXProfiles = createServerFn({ method: "POST" })
  .validator((input: { handles: string[] }) => input)
  .handler(async ({ data }) => {
    const handles = [...new Set(data.handles.map(normalizeHandle).filter(isValidHandle))].slice(
      0,
      LOOKUP_BATCH,
    );
    if (handles.length === 0) {
      return { ok: true as const, profiles: [] as ProfileSnapshot[] };
    }
    const profiles = await mapPool(handles, 6, async (h) => {
      const snap = await fetchProfile(h);
      return { ...snap, handle: h };
    });
    return { ok: true as const, profiles };
  });
