import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { buildCollectorScript } from "@/lib/x-collector-script";

describe("buildCollectorScript", () => {
  it("フォロー取込のあと最終投稿も調べる", () => {
    const s = buildCollectorScript("following");
    expect(s).toContain("Following");
    expect(s).toContain("users/lookup.json");
    expect(s).toContain('stage: "scan"');
    expect(s).toContain('OP === "Following"');
  });

  it("フォロワー取込は相互判定だけで最終投稿は調べない", () => {
    const s = buildCollectorScript("followers");
    expect(s).toContain("Followers");
    expect(s).toContain('OP === "Following"');
  });

  it("一括全滅時は個別取得に切り替える", () => {
    const s = buildCollectorScript("following");
    expect(s).toContain("consecutiveGone");
    expect(s).toContain("bulkDead");
  });

  it("生成コードは構文として壊れていない", () => {
    expect(() => new Script(buildCollectorScript("following"))).not.toThrow();
    expect(() => new Script(buildCollectorScript("followers"))).not.toThrow();
  });
});
