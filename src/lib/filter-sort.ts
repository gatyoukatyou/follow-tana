import {
  activityOf,
  isUnfollowCandidate,
  relationOf,
  type Person,
  type RosterFilters,
  type SortKey,
} from "@/lib/types";

const collator = new Intl.Collator(["ja", "en"], { sensitivity: "base", numeric: true });

export function queryTokens(query: string): string[] {
  return query
    .normalize("NFKC")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^@/, ""))
    .filter(Boolean);
}

export function matchesQuery(person: Person, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  return tokens.every((t) => person.haystack.includes(t));
}

export function applyFilters(people: Person[], filters: RosterFilters, tokens: string[]): Person[] {
  return people.filter((p) => {
    if (!matchesQuery(p, tokens)) return false;
    if (filters.verifiedOnly && !p.verified) return false;
    if (filters.missingProfile && p.enrichedAt) return false;
    if (filters.hasNote && !p.note.trim()) return false;
    if (filters.tag && !p.tags.includes(filters.tag)) return false;
    if (filters.unfollowQueue && !isUnfollowCandidate(p)) return false;
    if (filters.activity !== "any" && activityOf(p) !== filters.activity) return false;
    if (filters.relation !== "any" && relationOf(p) !== filters.relation) return false;
    return true;
  });
}

function lastKey(p: Person): number {
  if (p.lastPostAt != null) return p.lastPostAt;
  if (p.lookupFailed) return Number.NEGATIVE_INFINITY;
  return Number.POSITIVE_INFINITY - 1;
}

export function sortPeople(people: Person[], sort: SortKey): Person[] {
  const copy = people.slice();
  copy.sort((a, b) => {
    switch (sort) {
      case "last-asc":
        return lastKey(a) - lastKey(b) || collator.compare(a.handle, b.handle);
      case "last-desc":
        return lastKey(b) - lastKey(a) || collator.compare(a.handle, b.handle);
      case "followers-desc":
        return b.followers - a.followers || collator.compare(a.handle, b.handle);
      case "followers-asc":
        return a.followers - b.followers || collator.compare(a.handle, b.handle);
      case "name":
        return collator.compare(a.name || a.handle, b.name || b.handle);
      case "handle":
        return collator.compare(a.handle, b.handle);
      case "added-desc":
        return b.addedAt - a.addedAt;
      default:
        return 0;
    }
  });
  return copy;
}

export function uniqueTags(people: Person[]): string[] {
  const set = new Set<string>();
  for (const p of people) for (const t of p.tags) set.add(t);
  return [...set].sort(collator.compare);
}

export function rosterStats(people: Person[]) {
  let dormant = 0;
  let dead = 0;
  let alive = 0;
  let mutual = 0;
  let oneway = 0;
  let queue = 0;
  let unknown = 0;
  let locked = 0;
  let unchecked = 0;
  for (const p of people) {
    const a = activityOf(p);
    const r = relationOf(p);
    if (a === "alive") alive += 1;
    if (a === "dormant") dormant += 1;
    if (a === "dead") dead += 1;
    if (a === "unknown") unknown += 1;
    if (a === "protected") locked += 1;
    if (r === "mutual") mutual += 1;
    if (r === "oneway") oneway += 1;
    if (isUnfollowCandidate(p)) queue += 1;
    if (p.lastCheckedAt == null) unchecked += 1;
  }
  return { alive, dormant, dead, mutual, oneway, queue, unknown, locked, unchecked, total: people.length };
}

export const SCAN_BATCH = 12;
/** 取得に失敗した人を再確認するまでの待機時間 */
export const RECHECK_FAILED_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const SCAN_RANK_SKIP = 99;

function scanRank(p: Person): number {
  if (p.lastCheckedAt == null) return 0;
  if (p.lastPostAt == null && !p.protected && !p.lookupFailed) return 1;
  if (p.lookupFailed && Date.now() - p.lastCheckedAt >= RECHECK_FAILED_AFTER_MS) return 2;
  return SCAN_RANK_SKIP;
}

function needsScan(p: Person): boolean {
  return scanRank(p) < SCAN_RANK_SKIP;
}

export function peopleToScan(people: Person[], selected: string[]): Person[] {
  const sel = new Set(selected.map((h) => h.toLowerCase()));
  const pool = selected.length > 0 ? people.filter((p) => sel.has(p.handle.toLowerCase())) : people;
  return pool.filter(needsScan);
}

export function handlesToScan(
  people: Person[],
  selected: string[],
  limit = SCAN_BATCH,
  skip?: Set<string>,
): string[] {
  const sel = new Set(selected.map((h) => h.toLowerCase()));
  const pool = selected.length > 0 ? people.filter((p) => sel.has(p.handle.toLowerCase())) : people;
  return pool
    .filter(needsScan)
    .filter((p) => !skip?.has(p.handle.toLowerCase()))
    .sort((a, b) => scanRank(a) - scanRank(b) || (a.lastCheckedAt ?? 0) - (b.lastCheckedAt ?? 0))
    .slice(0, limit)
    .map((p) => p.handle);
}

export function countToScan(people: Person[], selected: string[]): number {
  const sel = new Set(selected.map((h) => h.toLowerCase()));
  const pool = selected.length > 0 ? people.filter((p) => sel.has(p.handle.toLowerCase())) : people;
  let n = 0;
  for (const p of pool) if (needsScan(p)) n += 1;
  return n;
}

/** 生存確認の目安。1人あたり外部取得があるため、人数が多いと長くなる。 */
export function scanEtaLabel(n: number): string {
  if (n <= 0) return "";
  if (n <= 30) return "1分以内";
  if (n <= 120) return "数分";
  if (n <= 600) return "10〜20分";
  if (n <= 2500) return "30分前後";
  return "1時間前後";
}
