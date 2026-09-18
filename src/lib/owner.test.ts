// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getOwnerHandle, ownerListUrl, setOwnerHandle, subscribeOwner } from "@/lib/owner";

afterEach(() => {
  localStorage.clear();
});

describe("owner handle", () => {
  it("未設定は空文字", () => {
    expect(getOwnerHandle()).toBe("");
  });

  it("@ 付きを正規化して保存する", () => {
    expect(setOwnerHandle("@Alice_1")).toBe(true);
    expect(getOwnerHandle()).toBe("Alice_1");
  });

  it("不正なハンドルは保存しない", () => {
    setOwnerHandle("okuser");
    expect(setOwnerHandle("bad handle")).toBe(false);
    expect(setOwnerHandle("abcdefghijklmnop")).toBe(false);
    expect(getOwnerHandle()).toBe("okuser");
  });

  it("空文字は保存しない", () => {
    expect(setOwnerHandle("   ")).toBe(false);
    expect(getOwnerHandle()).toBe("");
  });

  it("購読者に変更を伝える", () => {
    let n = 0;
    const unsub = subscribeOwner(() => {
      n += 1;
    });
    setOwnerHandle("alice");
    expect(n).toBe(1);
    unsub();
    setOwnerHandle("bob");
    expect(n).toBe(1);
  });

  it("following / followers の URL を組む", () => {
    expect(ownerListUrl("alice", "following")).toBe("https://x.com/alice/following");
    expect(ownerListUrl("alice", "followers")).toBe("https://x.com/alice/followers");
  });

  it("localStorage が壊れても例外にしない", () => {
    const proto = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem");
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value() {
        throw new Error("QuotaExceededError");
      },
    });
    expect(() => setOwnerHandle("alice")).not.toThrow();
    if (proto) Object.defineProperty(Storage.prototype, "setItem", proto);
  });
});
