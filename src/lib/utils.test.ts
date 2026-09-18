// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText, normalizeHandle } from "@/lib/utils";

describe("normalizeHandle", () => {
  it("末尾のカンマを落とす", () => {
    expect(normalizeHandle("alice,")).toBe("alice");
  });

  it("全角＠を外す", () => {
    expect(normalizeHandle("＠bob")).toBe("bob");
  });

  it("URLスキームのコロンは削らない", () => {
    expect(normalizeHandle("https://x.com/bob")).toBe("https:");
  });
});

describe("copyText", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("Clipboard APIが沈黙してもタイムアウトでfalseを返す", async () => {
    vi.useFakeTimers();
    // jsdom の execCommand は未実装（失敗扱い）＋ writeText は永遠に沈黙
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(() => new Promise(() => {})) },
      configurable: true,
    });
    const pending = copyText("hello");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toBe(false);
    // @ts-expect-error jsdom default has no clipboard; restore the absence
    delete navigator.clipboard;
  });
});
