import {
  LITE_KEY,
  liteWrittenAt,
  peopleCountFromLite,
  peopleCountFromPersistJson,
  persistJsonFromLite,
  writeLiteFromPersistJson,
} from "@/lib/roster-backup";
import { pickHydrateSource, shouldRejectSave } from "@/lib/persist-policy";

const DB_NAME = "follow-tana";
const STORE = "kv";
const DEBOUNCE_MS = 400;
const META_KEY = "follow-tana-at";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

const pending = new Map<string, { value: string; at: number }>();
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;
let persistEnabled = false;
let shrinkAllowed = false;

export function enableRosterPersist() {
  persistEnabled = true;
}

export function isRosterPersistEnabled() {
  return persistEnabled;
}

/** 意図した減員（削除・クリア・解除完了）の直前に呼ぶ。1 回の保存にのみ効く。 */
export function allowRosterShrink() {
  shrinkAllowed = true;
}

function readMetaAt(): number {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return 0;
    const at = (JSON.parse(raw) as { at?: number }).at;
    return typeof at === "number" && Number.isFinite(at) ? at : 0;
  } catch {
    return 0;
  }
}

function writeMetaAt(at: number) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ at }));
  } catch {
    /* ignore */
  }
}

async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending.size === 0) return flushing ?? Promise.resolve();
  const entries = [...pending.entries()];
  pending.clear();
  flushing = (async () => {
    let latest = 0;
    for (const [name, entry] of entries) {
      await withStore("readwrite", (s) => s.put(entry.value, name));
      if (entry.at > latest) latest = entry.at;
    }
    if (latest) writeMetaAt(latest);
  })();
  try {
    await flushing;
  } catch {
    for (const [name, entry] of entries) {
      if (!pending.has(name)) pending.set(name, entry);
    }
  } finally {
    flushing = null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    void flush();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
}

export const idbStorage = {
  async getItem(name: string): Promise<string | null> {
    const held = pending.get(name);
    if (held) return held.value;
    let idb: string | null = null;
    if (typeof indexedDB !== "undefined") {
      try {
        const value = await withStore("readonly", (s) => s.get(name));
        if (typeof value === "string") idb = value;
      } catch {
        /* fall through */
      }
    }
    let ls: string | null = null;
    let lite: string | null = null;
    try {
      ls = localStorage.getItem(name);
      lite = localStorage.getItem(LITE_KEY);
    } catch {
      /* ignore */
    }
    const main = idb ?? ls;
    const mainAt = readMetaAt();
    const liteAt = liteWrittenAt(lite);
    const source = pickHydrateSource({
      hasMain: Boolean(main),
      mainAt,
      hasLite: Boolean(lite),
      liteAt,
    });
    if (source === "main") return main;
    if (source === "lite" && lite) {
      const rebuilt = persistJsonFromLite(lite);
      if (rebuilt) return rebuilt;
    }
    return main;
  },
  async setItem(name: string, value: string): Promise<void> {
    if (!persistEnabled) return;
    const allow = shrinkAllowed;
    shrinkAllowed = false;
    const nextN = peopleCountFromPersistJson(value);
    let liteN = 0;
    try {
      liteN = peopleCountFromLite(localStorage.getItem(LITE_KEY));
    } catch {
      /* ignore */
    }
    if (shouldRejectSave({ nextN, liteN, allowShrink: allow })) return;
    const at = Date.now();
    writeLiteFromPersistJson(value, at);
    pending.set(name, { value, at });
    if (typeof indexedDB === "undefined") {
      writeMetaAt(at);
      return;
    }
    if (!timer) timer = setTimeout(() => void flush(), DEBOUNCE_MS);
  },
  async removeItem(name: string): Promise<void> {
    pending.delete(name);
    try {
      localStorage.removeItem(LITE_KEY);
      localStorage.removeItem(META_KEY);
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
    if (typeof indexedDB === "undefined") return;
    await withStore("readwrite", (s) => s.delete(name));
  },
};

export async function wipeRosterStorage(name = "follow-tana-v1") {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pending.clear();
  await idbStorage.removeItem(name);
}

export { flush as flushRosterStorage };
