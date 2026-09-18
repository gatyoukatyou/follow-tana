import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createStarterPeople } from "@/data/starter";
import {
  allowRosterShrink,
  enableRosterPersist,
  flushRosterStorage,
  idbStorage,
} from "@/lib/idb-storage";
import {
  EMPTY_FILTERS,
  handleOnlyPerson,
  normalizePerson,
  type Person,
  type PersonSource,
  type ProfileSnapshot,
  type RosterFilters,
  type SortKey,
} from "@/lib/types";
import { normalizeHandle } from "@/lib/utils";

export type PullState = {
  status: "idle" | "waiting" | "running" | "done";
  kind: "following" | "followers" | "unfollow";
  count: number;
};

const IDLE_PULL: PullState = { status: "idle", kind: "following", count: 0 };

type RosterState = {
  people: Person[];
  selected: string[];
  query: string;
  sort: SortKey;
  filters: RosterFilters;
  bannerDismissed: boolean;
  seededOnce: boolean;
  followerHandles: string[];
  followersImported: boolean;
  pull: PullState;
  setQuery: (query: string) => void;
  setSort: (sort: SortKey) => void;
  setFilter: (patch: Partial<RosterFilters>) => void;
  toggleSelected: (handle: string) => void;
  selectVisible: (handles: string[]) => void;
  clearSelected: () => void;
  dismissBanner: () => void;
  ensureSeeded: () => void;
  addHandles: (handles: string[], source: PersonSource) => number;
  ingestRoster: (incoming: Person[]) => number;
  markFollowers: (handles: string[]) => number;
  mergeProfiles: (snaps: ProfileSnapshot[]) => number;
  updatePerson: (
    handle: string,
    patch: Partial<Pick<Person, "note" | "tags" | "followsYou">>,
  ) => void;
  addTag: (handles: string[], tag: string) => void;
  removePeople: (handles: string[]) => void;
  resetToStarter: () => void;
  clearRoster: () => void;
  setPull: (patch: Partial<PullState>) => void;
};

function keyOf(handle: string) {
  return normalizeHandle(handle).toLowerCase();
}

export const useRoster = create<RosterState>()(
  persist(
    (set, get) => ({
      people: createStarterPeople(),
      selected: [],
      query: "",
      sort: "last-asc",
      filters: { ...EMPTY_FILTERS },
      bannerDismissed: false,
      seededOnce: true,
      followerHandles: [],
      followersImported: false,
      pull: { ...IDLE_PULL },
      setQuery: (query) => set({ query }),
      setSort: (sort) => set({ sort }),
      setFilter: (patch) => set({ filters: { ...get().filters, ...patch } }),
      toggleSelected: (handle) => {
        const k = keyOf(handle);
        const selected = get().selected;
        set({
          selected: selected.includes(k) ? selected.filter((h) => h !== k) : [...selected, k],
        });
      },
      selectVisible: (handles) => set({ selected: handles.map(keyOf) }),
      clearSelected: () => set({ selected: [] }),
      dismissBanner: () => set({ bannerDismissed: true }),
      ensureSeeded: () => {
        const s = get();
        if (s.seededOnce || s.people.length > 0) {
          if (!s.seededOnce) set({ seededOnce: true });
          const onlyStarter =
            s.people.length > 0 &&
            s.people.every((p) => p.source === "starter") &&
            !s.people.some((p) => p.tags.includes("見本"));
          if (onlyStarter) {
            const extras = createStarterPeople().filter((p) => p.tags.includes("見本"));
            if (extras.length) set({ people: [...get().people, ...extras], seededOnce: true });
          }
          return;
        }
        set({ people: createStarterPeople(), seededOnce: true });
      },
      addHandles: (handles, source) => {
        const existing = new Set(get().people.map((p) => keyOf(p.handle)));
        const followers = new Set(get().followerHandles);
        const imported = get().followersImported;
        const added: Person[] = [];
        const now = Date.now();
        handles.forEach((h, i) => {
          const k = keyOf(h);
          if (existing.has(k)) return;
          existing.add(k);
          const followsYou = imported && followers.has(k) ? true : null;
          added.push(handleOnlyPerson(h, source, now + i, followsYou));
        });
        if (added.length) {
          const current = get().people;
          const largeImport = source === "import" && added.length >= 40;
          const base = largeImport ? current.filter((p) => p.source !== "starter") : current;
          set({ people: [...base, ...added] });
        }
        return added.length;
      },
      ingestRoster: (incoming) => {
        if (incoming.length === 0) return 0;
        const byKey = new Map(get().people.map((p) => [keyOf(p.handle), p]));
        for (const row of incoming) {
          const next = normalizePerson(row);
          const k = keyOf(next.handle);
          const old = byKey.get(k);
          if (!old) {
            byKey.set(k, next);
            continue;
          }
          const incomingFresh = (next.lastCheckedAt ?? 0) >= (old.lastCheckedAt ?? 0);
          byKey.set(
            k,
            incomingFresh
              ? normalizePerson({
                  ...old,
                  ...next,
                  followsYou: next.followsYou ?? old.followsYou,
                  tags: next.tags.length ? next.tags : old.tags,
                  note: next.note || old.note,
                  addedAt: old.addedAt,
                  source: old.source === "starter" ? next.source : old.source,
                })
              : old,
          );
        }
        set({ people: [...byKey.values()], seededOnce: true });
        return incoming.length;
      },
      markFollowers: (handles) => {
        const incoming = handles.map(keyOf);
        const all = new Set([...get().followerHandles, ...incoming]);
        const people = get().people.map((p) =>
          all.has(keyOf(p.handle))
            ? normalizePerson({ ...p, followsYou: true })
            : p,
        );
        set({
          followerHandles: [...all],
          followersImported: true,
          people,
        });
        return incoming.length;
      },
      mergeProfiles: (snaps) => {
        const byKey = new Map(snaps.map((s) => [keyOf(s.handle), s]));
        let n = 0;
        const now = Date.now();
        const people = get().people.map((p) => {
          const snap = byKey.get(keyOf(p.handle));
          if (!snap) return p;
          n += 1;
          return normalizePerson({
            ...p,
            ...snap,
            handle: snap.handle || p.handle,
            followsYou: p.followsYou,
            tags: p.tags,
            note: p.note,
            addedAt: p.addedAt,
            source: p.source,
            lastPostAt: snap.lastPostAt != null ? snap.lastPostAt : p.lastPostAt,
            lastPostText: snap.lastPostText || p.lastPostText,
            enrichedAt: snap.lookupFailed ? p.enrichedAt : now,
            lastCheckedAt: now,
          });
        });
        set({ people });
        return n;
      },
      updatePerson: (handle, patch) => {
        const k = keyOf(handle);
        set({
          people: get().people.map((p) =>
            keyOf(p.handle) === k ? normalizePerson({ ...p, ...patch }) : p,
          ),
        });
      },
      addTag: (handles, tag) => {
        const t = tag.trim();
        if (!t) return;
        const keys = new Set(handles.map(keyOf));
        set({
          people: get().people.map((p) => {
            if (!keys.has(keyOf(p.handle)) || p.tags.includes(t)) return p;
            return normalizePerson({ ...p, tags: [...p.tags, t] });
          }),
        });
      },
      removePeople: (handles) => {
        const keys = new Set(handles.map(keyOf));
        allowRosterShrink();
        set({
          people: get().people.filter((p) => !keys.has(keyOf(p.handle))),
          selected: get().selected.filter((h) => !keys.has(h)),
        });
      },
      resetToStarter: () =>
        set({
          people: createStarterPeople(),
          selected: [],
          query: "",
          sort: "last-asc",
          filters: { ...EMPTY_FILTERS },
          bannerDismissed: false,
          seededOnce: true,
          followerHandles: [],
          followersImported: false,
          pull: { ...IDLE_PULL },
        }),
      clearRoster: () => {
        allowRosterShrink();
        set({
          people: [],
          selected: [],
          query: "",
          filters: { ...EMPTY_FILTERS },
          seededOnce: true,
          followerHandles: [],
          followersImported: false,
          pull: { ...IDLE_PULL },
        });
      },
      setPull: (patch) => set({ pull: { ...get().pull, ...patch } }),
    }),
    {
      name: "follow-tana-v1",
      skipHydration: true,
      storage: createJSONStorage(() => idbStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<RosterState>;
        return {
          ...current,
          ...p,
          pull: current.pull,
          people: Array.isArray(p.people) ? p.people.map((x) => normalizePerson(x)) : current.people,
          filters: { ...EMPTY_FILTERS, ...(p.filters ?? {}) },
          followerHandles: Array.isArray(p.followerHandles) ? p.followerHandles : [],
          followersImported: Boolean(p.followersImported),
        };
      },
      partialize: (s) => ({
        people: s.people.map(({ haystack: _haystack, ...rest }) => rest),
        sort: s.sort,
        filters: s.filters,
        bannerDismissed: s.bannerDismissed,
        seededOnce: s.seededOnce,
        followerHandles: s.followerHandles,
        followersImported: s.followersImported,
      }),
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (error) return;
          enableRosterPersist();
          void flushRosterStorage();
          if (typeof navigator !== "undefined" && navigator.storage?.persist) {
            void navigator.storage.persist();
          }
        };
      },
    },
  ),
);
