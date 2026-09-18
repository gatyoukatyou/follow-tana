import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { buildScanScript, parseScanProfiles } from "@/lib/x-scan-script";

describe("parseScanProfiles", () => {
  it("最終投稿ありを生存データにする", () => {
    const [p] = parseScanProfiles([
      { h: "alice", n: "Alice", lp: 1_700_000_000_000, lt: "hello", fl: 12, tc: 3 },
    ]);
    expect(p?.handle).toBe("alice");
    expect(p?.name).toBe("Alice");
    expect(p?.lastPostAt).toBe(1_700_000_000_000);
    expect(p?.lookupFailed).toBe(false);
  });

  it("応答に無い人は未確認のまま（停止にしない）", () => {
    expect(parseScanProfiles([{ h: "gone", miss: true }])).toEqual([]);
  });

  it("削除が確認できた人だけ停止にする", () => {
    const [p] = parseScanProfiles([{ h: "gone", gone: true }]);
    expect(p?.lookupFailed).toBe(true);
    expect(p?.lastPostAt).toBeNull();
  });

  it("鍵は鍵として残す", () => {
    const [p] = parseScanProfiles([{ h: "secret", k: true, lp: null }]);
    expect(p?.protected).toBe(true);
    expect(p?.lookupFailed).toBe(false);
  });
});

describe("buildScanScript", () => {
  it("調べるハンドルを埋め込む", () => {
    const s = buildScanScript(["@Alice", "bob"]);
    expect(s).toContain('"Alice"');
    expect(s).toContain('"bob"');
    expect(s).toContain('op: "Scan"');
  });

  it("一括全滅時は個別取得に切り替える", () => {
    const s = buildScanScript(["alice"]);
    expect(s).toContain("consecutiveGone");
    expect(s).toContain("bulkDead");
  });

  it("生成コードは構文として壊れていない", () => {
    expect(() => new Script(buildScanScript(["alice", "bob"]))).not.toThrow();
  });
});
