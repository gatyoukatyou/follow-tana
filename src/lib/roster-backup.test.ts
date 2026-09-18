// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LITE_KEY,
  liteWrittenAt,
  parseRosterDump,
  persistJsonFromLite,
  writeLiteFromPersistJson,
} from "@/lib/roster-backup";
import { normalizePerson, type Person } from "@/lib/types";

function person(handle: string, over: Partial<Person> = {}): Person {
  return normalizePerson({ handle, ...over });
}

function persistJson(people: Person[]) {
  return JSON.stringify({
    state: {
      people: people.map(({ haystack: _h, ...rest }) => rest),
      followerHandles: ["alice"],
      followersImported: true,
    },
    version: 0,
  });
}

function storedDump() {
  return JSON.parse(localStorage.getItem(LITE_KEY) ?? "{}") as {
    p: Record<string, unknown>[];
    fh?: string[];
    fi?: boolean;
  };
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("控えの往復", () => {
  it("利用者が入力した情報を保持する", () => {
    const p = person("alice", {
      tags: ["AI", "仕事"],
      note: "沖縄のイベントで会った",
      followsYou: true,
      lastPostAt: 1_700_000_000_000,
      addedAt: 1_600_000_000_000,
    });
    writeLiteFromPersistJson(persistJson([p]));
    const back = JSON.parse(persistJsonFromLite(localStorage.getItem(LITE_KEY)!)!) as {
      state: { people: Person[]; followersImported: boolean };
    };
    const [restored] = back.state.people;
    expect(restored!.tags).toEqual(["AI", "仕事"]);
    expect(restored!.note).toBe("沖縄のイベントで会った");
    expect(restored!.followsYou).toBe(true);
    expect(restored!.addedAt).toBe(1_600_000_000_000);
    expect(back.state.followersImported).toBe(true);
  });

  it("関係未確認を false に変えない", () => {
    writeLiteFromPersistJson(persistJson([person("alice", { followsYou: null })]));
    const back = JSON.parse(persistJsonFromLite(localStorage.getItem(LITE_KEY)!)!) as {
      state: { people: Person[] };
    };
    expect(back.state.people[0]!.followsYou).toBeNull();
  });

  it("プロフィールの全項目を保持する", () => {
    const p = person("alice", {
      website: "https://example.com",
      location: "Okinawa",
      joinedAt: 1_500_000_000_000,
      enrichedAt: 1_600_000_000_000,
    });
    writeLiteFromPersistJson(persistJson([p]));
    const back = JSON.parse(persistJsonFromLite(localStorage.getItem(LITE_KEY)!)!) as {
      state: { people: Person[] };
    };
    const restored = back.state.people[0]!;
    expect(restored.website).toBe("https://example.com");
    expect(restored.location).toBe("Okinawa");
    expect(restored.joinedAt).toBe(1_500_000_000_000);
    expect(restored.enrichedAt).toBe(1_600_000_000_000);
  });

  it("名簿を空にした状態も書ける", () => {
    writeLiteFromPersistJson(persistJson([person("alice")]));
    writeLiteFromPersistJson(persistJson([]));
    expect(storedDump().p).toEqual([]);
  });

  it("書き込み時刻を記録する", () => {
    writeLiteFromPersistJson(persistJson([person("alice")]), 1_700_000_000_000);
    expect(liteWrittenAt(localStorage.getItem(LITE_KEY))).toBe(1_700_000_000_000);
  });

  it("壊れた控えから時刻を読もうとしても例外にしない", () => {
    expect(liteWrittenAt("{ not json")).toBe(0);
    expect(liteWrittenAt(null)).toBe(0);
  });
});

describe("容量不足時の段階的縮退", () => {
  function failFirst(times: number) {
    const original = Storage.prototype.setItem;
    let attempts = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === LITE_KEY && attempts++ < times) throw new Error("QuotaExceededError");
      original.call(this, key, value);
    });
  }

  const rich = person("alice", {
    tags: ["AI"],
    note: "残すべきメモ",
    bio: "自己紹介",
    avatarUrl: "https://example.com/a.jpg",
    name: "Alice",
    followsYou: true,
  });

  it("1 段階目が入らなければ画像と自己紹介を落とす", () => {
    failFirst(1);
    writeLiteFromPersistJson(persistJson([rich]));
    const row = storedDump().p[0]!;
    expect(row.t).toEqual(["AI"]);
    expect(row.no).toBe("残すべきメモ");
    expect(row.n).toBe("Alice");
    expect(row.b).toBeUndefined();
    expect(row.av).toBeUndefined();
  });

  it("2 段階目も入らなければ表示名まで落とすが、タグとメモは残す", () => {
    failFirst(2);
    writeLiteFromPersistJson(persistJson([rich]));
    const row = storedDump().p[0]!;
    expect(row.h).toBe("alice");
    expect(row.t).toEqual(["AI"]);
    expect(row.no).toBe("残すべきメモ");
    expect(row.y).toBe(1);
    expect(row.n).toBeUndefined();
  });

  it("フォロワー集合と取込済みフラグはどの段階でも残す", () => {
    failFirst(2);
    writeLiteFromPersistJson(persistJson([rich]));
    expect(storedDump().fh).toEqual(["alice"]);
    expect(storedDump().fi).toBe(true);
  });

  it("すべて失敗しても例外を投げない", () => {
    failFirst(99);
    expect(() => writeLiteFromPersistJson(persistJson([rich]))).not.toThrow();
  });
});

describe("parseRosterDump", () => {
  it("書き出した配列を復元する", () => {
    const p = person("alice", { lastPostAt: 1_700_000_000_000, followsYou: true });
    const dump = parseRosterDump(JSON.stringify([{ ...p, haystack: undefined }]));
    expect(dump).toHaveLength(1);
    expect(dump![0]!.handle).toBe("alice");
    expect(dump![0]!.lastPostAt).toBe(1_700_000_000_000);
    expect(dump![0]!.followsYou).toBe(true);
  });

  it("handle だけの配列も名簿として扱う", () => {
    const dump = parseRosterDump(JSON.stringify([{ handle: "alice" }, { handle: "bob" }]));
    expect(dump?.map((p) => p.handle)).toEqual(["alice", "bob"]);
    expect(dump![0]!.lastPostAt).toBeNull();
  });

  it("JSONでないテキストは null", () => {
    expect(parseRosterDump("@alice @bob")).toBeNull();
  });
});
