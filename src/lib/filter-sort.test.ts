import { describe, expect, it } from "vitest";
import {
  RECHECK_FAILED_AFTER_MS,
  applyFilters,
  countToScan,
  handlesToScan,
  queryTokens,
  scanEtaLabel,
  sortPeople,
} from "@/lib/filter-sort";
import { DORMANT_AFTER_MS, EMPTY_FILTERS, normalizePerson, type Person } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

function person(handle: string, over: Partial<Person> = {}): Person {
  return normalizePerson({ handle, ...over });
}

describe("sortPeople: last-asc", () => {
  it("停止 → 休眠 → 生存 → 未確認 の順に並ぶ", () => {
    const people = [
      person("unknown", { lastCheckedAt: now, lastPostAt: null }),
      person("alive", { lastPostAt: now - DAY }),
      person("dead", { lookupFailed: true }),
      person("dormant", { lastPostAt: now - DORMANT_AFTER_MS - DAY }),
    ];
    expect(sortPeople(people, "last-asc").map((p) => p.handle)).toEqual([
      "dead",
      "dormant",
      "alive",
      "unknown",
    ]);
  });
});

describe("sortPeople: last-desc", () => {
  it("生存 → 休眠 → 停止 の順に並び、未確認は末尾になる", () => {
    const people = [
      person("unknown", { lastCheckedAt: now, lastPostAt: null }),
      person("alive", { lastPostAt: now - DAY }),
      person("dead", { lookupFailed: true }),
      person("dormant", { lastPostAt: now - DORMANT_AFTER_MS - DAY }),
    ];
    expect(sortPeople(people, "last-desc").map((p) => p.handle)).toEqual([
      "alive",
      "dormant",
      "dead",
      "unknown",
    ]);
  });
});

describe("countToScan", () => {
  it("一度も確認していない人は対象", () => {
    expect(countToScan([person("a", { lastCheckedAt: null })], [])).toBe(1);
  });

  it("確認したが投稿が取れなかった人は対象", () => {
    expect(countToScan([person("a", { lastCheckedAt: now, lastPostAt: null })], [])).toBe(1);
  });

  it("投稿が取れている人は対象外", () => {
    expect(countToScan([person("a", { lastCheckedAt: now, lastPostAt: now - DAY })], [])).toBe(0);
  });

  it("鍵アカウントは対象外", () => {
    expect(countToScan([person("a", { lastCheckedAt: now, protected: true })], [])).toBe(0);
  });

  it("取得に失敗した直後は対象外", () => {
    const p = person("a", { lastCheckedAt: now - DAY, lookupFailed: true });
    expect(countToScan([p], [])).toBe(0);
  });

  it("取得に失敗した人も待機期間を過ぎれば対象に戻る", () => {
    const p = person("a", {
      lastCheckedAt: now - RECHECK_FAILED_AFTER_MS - DAY,
      lookupFailed: true,
    });
    expect(countToScan([p], [])).toBe(1);
  });

  it("鍵かつ取得失敗でも待機期間を過ぎれば対象に戻らない", () => {
    const p = person("a", {
      lastCheckedAt: now - RECHECK_FAILED_AFTER_MS - DAY,
      lookupFailed: true,
      protected: true,
    });
    expect(countToScan([p], [])).toBe(0);
  });

  it("選択がある場合は選択の中だけを数える", () => {
    const people = [person("a", { lastCheckedAt: null }), person("b", { lastCheckedAt: null })];
    expect(countToScan(people, ["a"])).toBe(1);
  });
});

describe("handlesToScan", () => {
  it("未確認を、投稿不明より先に処理する", () => {
    const people = [
      person("noPost", { lastCheckedAt: now, lastPostAt: null }),
      person("never", { lastCheckedAt: null }),
    ];
    expect(handlesToScan(people, [], 2)).toEqual(["never", "noPost"]);
  });

  it("再確認待ちの失敗者は最後に回す", () => {
    const people = [
      person("failed", {
        lastCheckedAt: now - RECHECK_FAILED_AFTER_MS - DAY,
        lookupFailed: true,
      }),
      person("never", { lastCheckedAt: null }),
    ];
    expect(handlesToScan(people, [], 1)).toEqual(["never"]);
  });

  it("上限を超えて返さない", () => {
    const people = Array.from({ length: 20 }, (_, i) => person(`u${i}`, { lastCheckedAt: null }));
    expect(handlesToScan(people, [], 6)).toHaveLength(6);
  });

  it("先頭が失敗済みでも、その後ろの未確認を取り続ける", () => {
    const people = [
      person("a", { lastCheckedAt: null }),
      person("b", { lastCheckedAt: null }),
      person("c", { lastCheckedAt: null }),
    ];
    expect(handlesToScan(people, [], 2, new Set(["a"]))).toEqual(["b", "c"]);
  });
});

describe("applyFilters", () => {
  const dormantOneway = person("target", {
    lastPostAt: now - DORMANT_AFTER_MS - DAY,
    followsYou: false,
  });
  const dormantUnknown = person("unsure", {
    lastPostAt: now - DORMANT_AFTER_MS - DAY,
    followsYou: null,
  });

  it("外し候補には関係未確認を含めない", () => {
    const out = applyFilters(
      [dormantOneway, dormantUnknown],
      { ...EMPTY_FILTERS, unfollowQueue: true },
      [],
    );
    expect(out.map((p) => p.handle)).toEqual(["target"]);
  });

  it("検索語は全トークンの一致を要求する", () => {
    const p = person("alice", { name: "Alice", note: "沖縄" });
    expect(applyFilters([p], EMPTY_FILTERS, queryTokens("alice 沖縄"))).toHaveLength(1);
    expect(applyFilters([p], EMPTY_FILTERS, queryTokens("alice 東京"))).toHaveLength(0);
  });

  it("先頭の @ を無視して検索する", () => {
    const p = person("alice");
    expect(applyFilters([p], EMPTY_FILTERS, queryTokens("@alice"))).toHaveLength(1);
  });
});

describe("scanEtaLabel", () => {
  it("人数に応じた目安を返す", () => {
    expect(scanEtaLabel(0)).toBe("");
    expect(scanEtaLabel(10)).toBe("1分〜数分");
    expect(scanEtaLabel(80)).toBe("15〜45分");
    expect(scanEtaLabel(400)).toBe("1〜3時間");
    expect(scanEtaLabel(1500)).toBe("3〜8時間");
    expect(scanEtaLabel(7547)).toBe("半日以上（時間をおいて分けて実行）");
  });
});
