import { describe, expect, it } from "vitest";
import { isAllowedXBridgeOrigin, parseXBridgeHandles } from "@/hooks/use-x-bridge";

describe("isAllowedXBridgeOrigin", () => {
  it("allows x.com, twitter.com, and the app origin", () => {
    expect(isAllowedXBridgeOrigin("https://x.com", "http://localhost:8080")).toBe(true);
    expect(isAllowedXBridgeOrigin("https://twitter.com", "http://localhost:8080")).toBe(true);
    expect(isAllowedXBridgeOrigin("http://localhost:8080", "http://localhost:8080")).toBe(true);
  });

  it("rejects other origins", () => {
    expect(isAllowedXBridgeOrigin("https://evil.example", "http://localhost:8080")).toBe(false);
    expect(isAllowedXBridgeOrigin("https://x.com.evil.example", "http://localhost:8080")).toBe(false);
    expect(isAllowedXBridgeOrigin("", "http://localhost:8080")).toBe(false);
  });
});

describe("parseXBridgeHandles", () => {
  it("normalizes, drops invalid, and uniques", () => {
    expect(parseXBridgeHandles(["@Alice", "alice", "bob", "bob", "bad handle", ""])).toEqual([
      "Alice",
      "alice",
      "bob",
    ]);
  });

  it("drops profile URLs (normalizeHandle splits on /)", () => {
    expect(parseXBridgeHandles(["https://x.com/bob"])).toEqual([]);
  });

  it("returns empty for non-arrays", () => {
    expect(parseXBridgeHandles(undefined)).toEqual([]);
    expect(parseXBridgeHandles("alice")).toEqual([]);
  });
});
