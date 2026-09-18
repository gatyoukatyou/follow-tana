import { handleOnlyPerson, normalizePerson, type Person } from "@/lib/types";

export const LITE_KEY = "follow-tana-lite";
const LITE_BUDGET = 3_000_000;

type LiteTier = 0 | 1 | 2;

type LitePerson = {
  h: string;
  n?: string;
  lp?: number;
  lc?: number;
  f?: 1;
  k?: 1;
  y?: 0 | 1;
  tc?: number;
  fl?: number;
  vf?: 1;
  s?: Person["source"];
  a?: number;
  t?: string[];
  no?: string;
  lt?: string;
  av?: string;
  b?: string;
  id?: string;
  en?: number;
  w?: string;
  lo?: string;
  j?: number;
};

type LiteDump = {
  v: 1;
  at: number;
  fi?: boolean;
  fh?: string[];
  p: LitePerson[];
};

function compactPerson(p: Person, tier: LiteTier): LitePerson {
  const row: LitePerson = {
    h: p.handle,
    lp: p.lastPostAt ?? undefined,
    lc: p.lastCheckedAt ?? undefined,
    f: p.lookupFailed ? 1 : undefined,
    k: p.protected ? 1 : undefined,
    y: p.followsYou === true ? 1 : p.followsYou === false ? 0 : undefined,
    s: p.source !== "import" ? p.source : undefined,
    a: p.addedAt,
    t: p.tags.length ? p.tags : undefined,
    no: p.note || undefined,
    en: p.enrichedAt ?? undefined,
  };
  if (tier <= 1) {
    row.n = p.name || undefined;
    row.tc = p.tweetCount || undefined;
    row.fl = p.followers || undefined;
    row.vf = p.verified ? 1 : undefined;
    row.id = p.userId || undefined;
  }
  if (tier === 0) {
    row.av = p.avatarUrl || undefined;
    row.b = p.bio || undefined;
    row.lt = p.lastPostText || undefined;
    row.w = p.website || undefined;
    row.lo = p.location || undefined;
    row.j = p.joinedAt ?? undefined;
  }
  return row;
}

function inflatePerson(row: LitePerson): Person {
  const followsYou = row.y === 1 ? true : row.y === 0 ? false : null;
  return normalizePerson({
    ...handleOnlyPerson(row.h, row.s ?? "import", row.a ?? Date.now(), followsYou),
    name: row.n ?? "",
    lastPostAt: row.lp ?? null,
    lastCheckedAt: row.lc ?? null,
    lookupFailed: row.f === 1,
    protected: row.k === 1,
    tweetCount: row.tc ?? 0,
    followers: row.fl ?? 0,
    verified: row.vf === 1,
    tags: row.t ?? [],
    note: row.no ?? "",
    lastPostText: row.lt ?? "",
    avatarUrl: row.av ?? "",
    bio: row.b ?? "",
    userId: row.id ?? "",
    enrichedAt: row.en ?? null,
    website: row.w ?? "",
    location: row.lo ?? "",
    joinedAt: row.j ?? null,
  });
}

export function peopleCountFromPersistJson(raw: string | null): number {
  if (!raw) return 0;
  try {
    const wrap = JSON.parse(raw) as { state?: { people?: unknown[] }; people?: unknown[] };
    const people = wrap.state?.people ?? wrap.people;
    return Array.isArray(people) ? people.length : 0;
  } catch {
    return 0;
  }
}

export function peopleCountFromLite(raw: string | null): number {
  if (!raw) return 0;
  try {
    const dump = JSON.parse(raw) as LiteDump;
    return Array.isArray(dump.p) ? dump.p.length : 0;
  } catch {
    return 0;
  }
}

export function persistJsonFromLite(raw: string): string | null {
  try {
    const dump = JSON.parse(raw) as LiteDump;
    if (!Array.isArray(dump.p)) return null;
    const people = dump.p.map(inflatePerson);
    return JSON.stringify({
      state: {
        people,
        followerHandles: Array.isArray(dump.fh) ? dump.fh : [],
        followersImported: Boolean(dump.fi),
        seededOnce: true,
      },
      version: 0,
    });
  } catch {
    return null;
  }
}

export function writeLiteFromPersistJson(raw: string, at: number = Date.now()) {
  if (typeof localStorage === "undefined") return;
  let state: {
    people?: Person[];
    followerHandles?: string[];
    followersImported?: boolean;
  } | undefined;
  try {
    state = (JSON.parse(raw) as { state?: typeof state }).state;
  } catch {
    return;
  }
  const people = state?.people;
  if (!Array.isArray(people)) return;
  for (const tier of [0, 1, 2] as LiteTier[]) {
    const dump: LiteDump = {
      v: 1,
      at,
      fi: Boolean(state?.followersImported),
      fh: state?.followerHandles ?? [],
      p: people.map((p) => compactPerson(p, tier)),
    };
    const text = JSON.stringify(dump);
    if (tier < 2 && text.length > LITE_BUDGET) continue;
    try {
      localStorage.setItem(LITE_KEY, text);
      return;
    } catch {
      /* 次の段階へ */
    }
  }
}

export function liteWrittenAt(raw: string | null): number {
  if (!raw) return 0;
  try {
    const at = (JSON.parse(raw) as LiteDump).at;
    return typeof at === "number" && Number.isFinite(at) ? at : 0;
  } catch {
    return 0;
  }
}

export function parseRosterDump(raw: string): Person[] | null {
  const text = raw.trim();
  if (!text.startsWith("[") && !text.startsWith("{")) return null;
  try {
    const data = JSON.parse(text) as unknown;
    const arr = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { people?: unknown }).people)
        ? (data as { people: unknown[] }).people
        : data && typeof data === "object" && Array.isArray((data as { state?: { people?: unknown[] } }).state?.people)
          ? (data as { state: { people: unknown[] } }).state.people
          : null;
    if (!arr || arr.length === 0) return null;
    const rows = arr.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");
    if (rows.length === 0) return null;
    const rosterLike = rows.some(
      (r) =>
        "lastPostAt" in r ||
        "lastCheckedAt" in r ||
        "lookupFailed" in r ||
        "source" in r ||
        "h" in r ||
        "handle" in r,
    );
    if (!rosterLike) return null;
    return rows
      .map((r) => {
        if (typeof r.h === "string") return inflatePerson(r as LitePerson);
        if (typeof r.handle === "string") return normalizePerson(r as Partial<Person> & { handle: string });
        return null;
      })
      .filter((p): p is Person => Boolean(p));
  } catch {
    return null;
  }
}
