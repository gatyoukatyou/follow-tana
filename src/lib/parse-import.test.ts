import { describe, expect, it } from "vitest";
import { buildXSearchUrl, looksLikeTwitterArchive, parseImport } from "@/lib/parse-import";

describe("parseImport", () => {
  it("改行区切りのハンドルを読む", () => {
    expect(parseImport("@alice\n@bob").handles).toEqual(["alice", "bob"]);
  });

  it("@ が無い行も読む", () => {
    expect(parseImport("alice\nbob").handles).toEqual(["alice", "bob"]);
  });

  it("プロフィール URL からハンドルを取り出す", () => {
    expect(parseImport("https://x.com/alice\nhttps://twitter.com/bob").handles).toEqual([
      "alice",
      "bob",
    ]);
  });

  it("X の機能ページを人として拾わない", () => {
    expect(parseImport("https://x.com/home\nhttps://x.com/explore").handles).toEqual([]);
  });

  it("大文字小文字が違う同一ハンドルを 1 件にまとめる", () => {
    expect(parseImport("@Alice\n@alice").handles).toEqual(["Alice"]);
  });

  it("16 文字以上は無効として捨てる", () => {
    expect(parseImport("@abcdefghijklmnopq").handles).toEqual([]);
  });

  it("JSON のオブジェクト配列からハンドルを取り出す", () => {
    const raw = JSON.stringify([{ screen_name: "alice" }, { username: "bob" }]);
    expect(parseImport(raw).handles).toEqual(["alice", "bob"]);
  });

  it("ハンドルを含まないアーカイブを見分ける", () => {
    const raw = 'window.YTD.following.part0 = [ { "following" : { "accountId" : "12345" } } ]';
    const out = parseImport(raw);
    expect(out.handles).toEqual([]);
    expect(out.archiveWithoutHandles).toBe(true);
  });

  it("空入力を安全に扱う", () => {
    expect(parseImport("   ").handles).toEqual([]);
  });
});

describe("looksLikeTwitterArchive", () => {
  it("ハンドルを含むテキストはアーカイブとみなさない", () => {
    expect(looksLikeTwitterArchive('{"accountId":"1"} @alice')).toBe(false);
  });
});

describe("buildXSearchUrl", () => {
  it("from: 句を OR で結ぶ", () => {
    const url = buildXSearchUrl(["alice", "bob"], "沖縄");
    expect(decodeURIComponent(url)).toContain("(from:alice OR from:bob) 沖縄");
  });

  it("上限 18 人で打ち切る", () => {
    const many = Array.from({ length: 30 }, (_, i) => `u${i}`);
    const q = decodeURIComponent(buildXSearchUrl(many, ""));
    expect(q.split("from:").length - 1).toBe(18);
  });
});
