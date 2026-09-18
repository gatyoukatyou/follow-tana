// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { useRoster } from "@/lib/roster-store";
import { normalizePerson, type Person } from "@/lib/types";

function person(handle: string, over: Partial<Person> = {}): Person {
  return normalizePerson({ handle, source: "import", ...over });
}

function reset(people: Person[], extra: Partial<Parameters<typeof useRoster.setState>[0]> = {}) {
  useRoster.setState({
    people,
    selected: [],
    followerHandles: [],
    followersImported: false,
    seededOnce: true,
    ...extra,
  });
}

function byHandle(handle: string) {
  return useRoster.getState().people.find((p) => p.handle.toLowerCase() === handle)!;
}

beforeEach(() => reset([]));

describe("markFollowers", () => {
  it("フォロワー一覧にいる人を相互にする", () => {
    reset([person("alice", { followsYou: null })]);
    useRoster.getState().markFollowers(["alice"]);
    expect(byHandle("alice").followsYou).toBe(true);
  });

  it("一覧に出てこない人は関係未確認のままにする", () => {
    reset([person("alice", { followsYou: null }), person("bob", { followsYou: null })]);
    useRoster.getState().markFollowers(["alice"]);
    expect(byHandle("bob").followsYou).toBeNull();
  });

  it("既に一方通行と分かっている人はそのまま", () => {
    reset([person("bob", { followsYou: false })]);
    useRoster.getState().markFollowers(["alice"]);
    expect(byHandle("bob").followsYou).toBe(false);
  });

  it("大文字小文字の違いを同一視する", () => {
    reset([person("Alice", { followsYou: null })]);
    useRoster.getState().markFollowers(["@alice"]);
    expect(byHandle("alice").followsYou).toBe(true);
  });

  it("複数回の取込でフォロワー集合を足し合わせる", () => {
    reset([person("alice"), person("bob")]);
    useRoster.getState().markFollowers(["alice"]);
    useRoster.getState().markFollowers(["bob"]);
    expect(byHandle("alice").followsYou).toBe(true);
    expect(byHandle("bob").followsYou).toBe(true);
  });
});

describe("addHandles", () => {
  it("フォロワー照合済みでも、一覧に無い新規は関係未確認にする", () => {
    reset([], { followerHandles: ["alice"], followersImported: true });
    useRoster.getState().addHandles(["alice", "bob"], "import");
    expect(byHandle("alice").followsYou).toBe(true);
    expect(byHandle("bob").followsYou).toBeNull();
  });

  it("既存のハンドルを重複追加しない", () => {
    reset([person("alice")]);
    expect(useRoster.getState().addHandles(["alice", "Alice"], "import")).toBe(0);
    expect(useRoster.getState().people).toHaveLength(1);
  });

  it("@ 付きでも同じ人として追加する", () => {
    reset([]);
    expect(useRoster.getState().addHandles(["@Alice"], "import")).toBe(1);
    expect(byHandle("alice").handle).toBe("Alice");
  });

  it("本番取込では見本データを混ぜない", () => {
    reset([person("demo", { source: "starter" })]);
    const many = Array.from({ length: 40 }, (_, i) => `u${i}`);
    useRoster.getState().addHandles(many, "import");
    expect(useRoster.getState().people.some((p) => p.source === "starter")).toBe(false);
  });
});

describe("ingestRoster", () => {
  it("控えより現在の生存情報が新しければ現在を残す", () => {
    reset([person("alice", { lastCheckedAt: 2000, lastPostAt: 999 })]);
    useRoster.getState().ingestRoster([person("alice", { lastCheckedAt: 1000, lastPostAt: 111 })]);
    expect(byHandle("alice").lastPostAt).toBe(999);
  });

  it("控えの方が新しければ控えを採る", () => {
    reset([person("alice", { lastCheckedAt: 1000, lastPostAt: 111 })]);
    useRoster.getState().ingestRoster([person("alice", { lastCheckedAt: 2000, lastPostAt: 999 })]);
    expect(byHandle("alice").lastPostAt).toBe(999);
  });

  it("控えにしかいない人を追加する", () => {
    reset([person("alice")]);
    useRoster.getState().ingestRoster([person("bob")]);
    expect(useRoster.getState().people).toHaveLength(2);
  });

  it("追加日時は元の値を保つ", () => {
    reset([person("alice", { addedAt: 100, lastCheckedAt: 1000 })]);
    useRoster.getState().ingestRoster([person("alice", { addedAt: 999, lastCheckedAt: 2000 })]);
    expect(byHandle("alice").addedAt).toBe(100);
  });
});

describe("removePeople", () => {
  it("選択からも取り除く", () => {
    reset([person("alice"), person("bob")], { selected: ["alice", "bob"] });
    useRoster.getState().removePeople(["alice"]);
    expect(useRoster.getState().people).toHaveLength(1);
    expect(useRoster.getState().selected).toEqual(["bob"]);
  });
});
