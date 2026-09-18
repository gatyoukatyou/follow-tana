import { describe, expect, it } from "vitest";
import {
  DORMANT_AFTER_MS,
  activityOf,
  isUnfollowCandidate,
  normalizePerson,
  relationOf,
  type Person,
} from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;

function person(over: Partial<Person> = {}): Person {
  return normalizePerson({ handle: "someone", ...over });
}

describe("activityOf", () => {
  it("取得に失敗した人は停止", () => {
    expect(activityOf(person({ lookupFailed: true }))).toBe("dead");
  });

  it("鍵アカウントは鍵", () => {
    expect(activityOf(person({ protected: true }))).toBe("protected");
  });

  it("1 年を超えて投稿がなければ休眠", () => {
    expect(activityOf(person({ lastPostAt: Date.now() - DORMANT_AFTER_MS - DAY }))).toBe("dormant");
  });

  it("直近に投稿があれば生存", () => {
    expect(activityOf(person({ lastPostAt: Date.now() - DAY }))).toBe("alive");
  });

  it("投稿が分からなければ未確認", () => {
    expect(activityOf(person({ lastPostAt: null }))).toBe("unknown");
  });

  it("最終投稿があれば、調べ損ねフラグより生存を優先する", () => {
    expect(activityOf(person({ lookupFailed: true, lastPostAt: Date.now() - DAY }))).toBe("alive");
  });
});

describe("relationOf", () => {
  it.each([
    [true, "mutual"],
    [false, "oneway"],
    [null, "unknown"],
  ])("followsYou=%s は %s", (followsYou, expected) => {
    expect(relationOf(person({ followsYou: followsYou as boolean | null }))).toBe(expected);
  });
});

describe("isUnfollowCandidate", () => {
  const dormant = Date.now() - DORMANT_AFTER_MS - DAY;

  it("休眠かつ一方通行は候補", () => {
    expect(isUnfollowCandidate(person({ lastPostAt: dormant, followsYou: false }))).toBe(true);
  });

  it("停止かつ一方通行は候補", () => {
    expect(isUnfollowCandidate(person({ lookupFailed: true, followsYou: false }))).toBe(true);
  });

  it("休眠でも相互なら候補にしない", () => {
    expect(isUnfollowCandidate(person({ lastPostAt: dormant, followsYou: true }))).toBe(false);
  });

  it("関係が未確認なら候補にしない", () => {
    expect(isUnfollowCandidate(person({ lastPostAt: dormant, followsYou: null }))).toBe(false);
  });

  it("生存していれば一方通行でも候補にしない", () => {
    expect(isUnfollowCandidate(person({ lastPostAt: Date.now() - DAY, followsYou: false }))).toBe(false);
  });

  it("鍵アカウントは候補にしない", () => {
    expect(isUnfollowCandidate(person({ protected: true, followsYou: false }))).toBe(false);
  });
});

describe("buildHaystack", () => {
  it("活動状態と関係のラベルを検索対象に含める", () => {
    const p = person({ lastPostAt: Date.now() - DORMANT_AFTER_MS - DAY, followsYou: false });
    expect(p.haystack).toContain("休眠");
    expect(p.haystack).toContain("一方");
  });

  it("大文字小文字と全角を畳む", () => {
    expect(person({ handle: "SomeOne", name: "Ａｌｉｃｅ" }).haystack).toContain("alice");
  });
});
