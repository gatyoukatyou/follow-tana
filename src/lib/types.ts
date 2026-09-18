import { normalizeHandle } from "@/lib/utils";

export type PersonSource = "starter" | "import" | "manual";

export type Activity = "alive" | "dormant" | "dead" | "protected" | "unknown";
export type Relation = "mutual" | "oneway" | "unknown";

export const DORMANT_AFTER_MS = 365 * 24 * 60 * 60 * 1000;

export const ACTIVITY_LABEL: Record<Activity, string> = {
  alive: "生存",
  dormant: "休眠",
  dead: "停止",
  protected: "鍵",
  unknown: "未確認",
};

export const RELATION_LABEL: Record<Relation, string> = {
  mutual: "相互",
  oneway: "一方",
  unknown: "関係未確認",
};

export type Person = {
  handle: string;
  userId: string;
  name: string;
  bio: string;
  avatarUrl: string;
  followers: number;
  following: number;
  tweetCount: number;
  verified: boolean;
  protected: boolean;
  website: string;
  location: string;
  joinedAt: number | null;
  lastPostAt: number | null;
  lastPostText: string;
  lastCheckedAt: number | null;
  lookupFailed: boolean;
  followsYou: boolean | null;
  tags: string[];
  note: string;
  addedAt: number;
  enrichedAt: number | null;
  source: PersonSource;
  haystack: string;
};

export type ProfileSnapshot = {
  handle: string;
  userId: string;
  name: string;
  bio: string;
  avatarUrl: string;
  followers: number;
  following: number;
  tweetCount: number;
  verified: boolean;
  protected: boolean;
  website: string;
  location: string;
  joinedAt: number | null;
  lastPostAt: number | null;
  lastPostText: string;
  lookupFailed: boolean;
};

export type SortKey =
  | "last-asc"
  | "last-desc"
  | "followers-desc"
  | "followers-asc"
  | "name"
  | "handle"
  | "added-desc";

export type RosterFilters = {
  verifiedOnly: boolean;
  missingProfile: boolean;
  hasNote: boolean;
  tag: string | null;
  unfollowQueue: boolean;
  activity: Activity | "any";
  relation: Relation | "any";
};

export const EMPTY_FILTERS: RosterFilters = {
  verifiedOnly: false,
  missingProfile: false,
  hasNote: false,
  tag: null,
  unfollowQueue: false,
  activity: "any",
  relation: "any",
};

export function activityOf(p: Person): Activity {
  if (p.lookupFailed) return "dead";
  if (p.protected) return "protected";
  if (p.lastPostAt != null) {
    return Date.now() - p.lastPostAt >= DORMANT_AFTER_MS ? "dormant" : "alive";
  }
  return "unknown";
}

export function relationOf(p: Person): Relation {
  if (p.followsYou === true) return "mutual";
  if (p.followsYou === false) return "oneway";
  return "unknown";
}

export function isUnfollowCandidate(p: Person): boolean {
  const a = activityOf(p);
  return (a === "dormant" || a === "dead") && relationOf(p) === "oneway";
}

export function buildHaystack(
  p: Pick<
    Person,
    | "handle"
    | "name"
    | "bio"
    | "note"
    | "tags"
    | "location"
    | "lookupFailed"
    | "protected"
    | "lastPostAt"
    | "followsYou"
  >,
): string {
  const fake = {
    ...p,
    lookupFailed: p.lookupFailed,
    protected: p.protected,
    lastPostAt: p.lastPostAt,
    followsYou: p.followsYou,
  } as Person;
  return [
    p.handle,
    p.name,
    p.bio,
    p.note,
    p.location,
    ...p.tags,
    ACTIVITY_LABEL[activityOf(fake)],
    RELATION_LABEL[relationOf(fake)],
  ]
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();
}

const PERSON_DEFAULTS: Omit<Person, "handle" | "haystack" | "addedAt" | "source"> = {
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
  lastCheckedAt: null,
  lookupFailed: false,
  followsYou: null,
  tags: [],
  note: "",
  enrichedAt: null,
};

export function normalizePerson(raw: Partial<Person> & { handle: string }): Person {
  const merged: Person = {
    ...PERSON_DEFAULTS,
    ...raw,
    handle: raw.handle,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    addedAt: raw.addedAt ?? Date.now(),
    source: raw.source ?? "import",
    haystack: "",
  };
  return { ...merged, haystack: buildHaystack(merged) };
}

export function personFromSnapshot(
  snap: ProfileSnapshot,
  extra: Pick<Person, "tags" | "note" | "addedAt" | "source"> &
    Partial<Pick<Person, "followsYou" | "lastCheckedAt">>,
): Person {
  return normalizePerson({
    ...snap,
    ...extra,
    enrichedAt: Date.now(),
    lastCheckedAt: extra.lastCheckedAt ?? Date.now(),
  });
}

export function handleOnlyPerson(
  handle: string,
  source: PersonSource,
  addedAt = Date.now(),
  followsYou: boolean | null = null,
): Person {
  return normalizePerson({
    handle: normalizeHandle(handle),
    addedAt,
    source,
    followsYou,
  });
}
