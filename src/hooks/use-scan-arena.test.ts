import { describe, expect, it } from "vitest";
import { arenaMessageFromEvent } from "@/hooks/use-scan-arena";

const SELF = "http://localhost:8080";
const scan = {
  source: "follow-tana",
  op: "Scan",
  type: "progress",
  round: 1,
  checked: ["tana_a"],
  since: "2025-09-18",
  profiles: [],
};

describe("arenaMessageFromEvent", () => {
  it("x.com からの生存確認 message を受ける", () => {
    const m = arenaMessageFromEvent({ data: scan, origin: "https://x.com" }, SELF);
    expect(m?.round).toBe(1);
    expect(m?.checked).toEqual(["tana_a"]);
  });

  it("他の origin と、生存確認以外は捨てる", () => {
    expect(arenaMessageFromEvent({ data: scan, origin: "https://evil.example" }, SELF)).toBeNull();
    expect(
      arenaMessageFromEvent({ data: { ...scan, op: "Unfollow" }, origin: "https://x.com" }, SELF),
    ).toBeNull();
    expect(arenaMessageFromEvent({ data: "hello", origin: "https://x.com" }, SELF)).toBeNull();
  });
});
