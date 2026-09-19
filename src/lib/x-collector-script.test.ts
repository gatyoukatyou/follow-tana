import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { buildCollectorScript } from "@/lib/x-collector-script";

describe("buildCollectorScript", () => {
  it("フォロー取込はXHRフックとDOMの両方で名簿を集める", () => {
    const s = buildCollectorScript("following");
    expect(s).toContain("Following");
    expect(s).toContain("XMLHttpRequest");
    expect(s).toContain("UserCell");
    expect(s).toContain('op: OP');
  });

  it("最終投稿は取込コード内では調べず、デスクの生存確認へ一本化する", () => {
    const s = buildCollectorScript("following");
    // 旧v1.1 API（users/lookup・show）は消滅。スクリプトに残らない
    expect(s).not.toContain("users/lookup.json");
    expect(s).not.toContain("users/show.json");
    expect(s).toContain("生存確認");
  });

  it("フォロワー取込は相互判定だけで最終投稿は調べない", () => {
    const s = buildCollectorScript("followers");
    expect(s).toContain("Followers");
  });

  it("生成コードは構文として壊れていない", () => {
    expect(() => new Script(buildCollectorScript("following"))).not.toThrow();
    expect(() => new Script(buildCollectorScript("followers"))).not.toThrow();
  });
});
