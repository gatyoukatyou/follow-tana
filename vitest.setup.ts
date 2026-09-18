// Node 26+ は --localstorage-file 無しだと素の localStorage が未定義になり、
// jsdom テストでも `localStorage.clear()` が落ちる。テストは常に使える
// インメモリ Web Storage を持つようにする。
const g = globalThis as Record<string, unknown>;

function hasWorkingStorage(): boolean {
  try {
    const ls = g["localStorage"] as Storage | undefined;
    return !!ls && typeof ls.getItem === "function" && typeof ls.setItem === "function";
  } catch {
    return false;
  }
}

if (!hasWorkingStorage()) {
  // Storage.prototype.setItem を spy するテストがあるため、
  // クラス＋プロトタイプ方式で実装する（素のオブジェクト不可）。
  class MemStorage implements Storage {
    private store = new Map<string, string>();
    getItem(k: string): string | null {
      return this.store.has(k) ? this.store.get(k)! : null;
    }
    setItem(k: string, v: string): void {
      this.store.set(k, String(v));
    }
    removeItem(k: string): void {
      this.store.delete(k);
    }
    clear(): void {
      this.store.clear();
    }
    key(i: number): string | null {
      return [...this.store.keys()][i] ?? null;
    }
    get length(): number {
      return this.store.size;
    }
  }
  Object.defineProperty(globalThis, "Storage", {
    value: MemStorage,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemStorage(),
    writable: true,
    configurable: true,
  });
}

if (typeof (globalThis as Record<string, unknown>)["Storage"] === "undefined") {
  (globalThis as Record<string, unknown>)["Storage"] = class Storage {};
}
