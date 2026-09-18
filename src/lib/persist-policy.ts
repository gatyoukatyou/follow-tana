/** 見本データ（9 人）への転落を拒否する上限 */
export const STARTER_MAX = 15;
/** これ以下の件数ではガードを効かせない（初期状態の増加を妨げないため） */
export const LITE_GUARD_MIN = 40;

/**
 * 保存を見送るべきかを判定する。
 * 意図した減員（削除・クリア・解除完了）は allowShrink で明示され、常に通る。
 * 拒否するのは、相応の規模の名簿が見本サイズまで転落した場合のみ。
 */
export function shouldRejectSave(input: {
  nextN: number;
  liteN: number;
  allowShrink: boolean;
}): boolean {
  if (input.allowShrink) return false;
  if (input.liteN <= LITE_GUARD_MIN) return false;
  return input.nextN <= STARTER_MAX;
}

export type HydrateSource = "main" | "lite" | "none";

/**
 * 読み出し元を決める。
 * mainAt === 0 は本バージョン以前に保存されたデータを意味し、
 * 控え（劣化コピー）より本体を優先する。
 */
export function pickHydrateSource(input: {
  hasMain: boolean;
  mainAt: number;
  hasLite: boolean;
  liteAt: number;
}): HydrateSource {
  if (input.hasMain && (input.mainAt === 0 || input.mainAt >= input.liteAt)) return "main";
  if (input.hasLite) return "lite";
  if (input.hasMain) return "main";
  return "none";
}
