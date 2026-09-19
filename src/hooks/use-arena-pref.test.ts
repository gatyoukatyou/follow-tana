import { beforeEach, describe, expect, it } from "vitest";
import { readArenaPref, writeArenaPref } from "@/hooks/use-arena-pref";

describe("arena pref", () => {
  beforeEach(() => localStorage.clear());

  it("既定はオフ、書けばオン、消せばオフ", () => {
    expect(readArenaPref()).toBe(false);
    writeArenaPref(true);
    expect(readArenaPref()).toBe(true);
    expect(localStorage.getItem("ft:arena")).toBe("1");
    writeArenaPref(false);
    expect(readArenaPref()).toBe(false);
    expect(localStorage.getItem("ft:arena")).toBeNull();
  });
});
