import { describe, expect, it } from "vitest";
import { pickHydrateSource, shouldRejectSave } from "@/lib/persist-policy";

describe("shouldRejectSave", () => {
  it("60 人のフォロー解除を保存する", () => {
    expect(shouldRejectSave({ nextN: 6940, liteN: 7000, allowShrink: false })).toBe(false);
  });

  it("21 人以上の削除も保存する", () => {
    expect(shouldRejectSave({ nextN: 79, liteN: 100, allowShrink: false })).toBe(false);
  });

  it("見本サイズへの転落は拒否する", () => {
    expect(shouldRejectSave({ nextN: 9, liteN: 7565, allowShrink: false })).toBe(true);
  });

  it("7000 人規模が 16 人への転落は拒否する", () => {
    expect(shouldRejectSave({ nextN: 16, liteN: 7000, allowShrink: false })).toBe(true);
  });

  it("意図した減員なら見本サイズでも通す", () => {
    expect(shouldRejectSave({ nextN: 9, liteN: 7565, allowShrink: true })).toBe(false);
  });

  it("名簿を空にできる", () => {
    expect(shouldRejectSave({ nextN: 0, liteN: 7000, allowShrink: true })).toBe(false);
  });

  it("小規模な名簿にはガードを効かせない", () => {
    expect(shouldRejectSave({ nextN: 3, liteN: 40, allowShrink: false })).toBe(false);
  });
});

describe("pickHydrateSource", () => {
  const base = { hasMain: true, mainAt: 0, hasLite: true, liteAt: 0 };

  it("移行期（本体に時刻が無い）は時刻付きの控えを採る", () => {
    expect(pickHydrateSource({ ...base, mainAt: 0, liteAt: 1_700_000_000_000 })).toBe("lite");
  });

  it("どちらも時刻が無ければ本体を採る", () => {
    expect(pickHydrateSource({ ...base, mainAt: 0, liteAt: 0 })).toBe("main");
  });

  it("同時刻なら本体を採る", () => {
    expect(pickHydrateSource({ ...base, mainAt: 1000, liteAt: 1000 })).toBe("main");
  });

  it("控えが新しければ控えを採る", () => {
    expect(pickHydrateSource({ ...base, mainAt: 1000, liteAt: 2000 })).toBe("lite");
  });

  it("本体が無ければ控えを採る", () => {
    expect(pickHydrateSource({ ...base, hasMain: false, liteAt: 1 })).toBe("lite");
  });

  it("どちらも無ければ none", () => {
    expect(pickHydrateSource({ hasMain: false, mainAt: 0, hasLite: false, liteAt: 0 })).toBe("none");
  });
});
