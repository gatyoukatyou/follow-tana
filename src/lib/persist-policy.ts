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
  // 増加は常に通す（初期取込を妨げない）
  if (input.nextN >= input.liteN) return false;
  if (input.liteN <= LITE_GUARD_MIN) return false;
  if (input.nextN <= STARTER_MAX) return true;
  // 半分以下への急減は意図しない消失とみなして拒否する
  return input.nextN < input.liteN * 0.5;
}

export type HydrateSource = "main" | "lite" | "none";

/**
 * 読み出し元を決める。
 * mainAt === 0 は本バージョン以前に保存された時刻なしデータを意味する。
 * 時刻付きの控えがあれば、古い本体へのダウングレードを避けるため控えを優先する。
 */
export function pickHydrateSource(input: {
  hasMain: boolean;
  mainAt: number;
  hasLite: boolean;
  liteAt: number;
}): HydrateSource {
  if (input.hasMain && input.hasLite) {
    if (input.mainAt === 0 && input.liteAt === 0) return "main";
    if (input.mainAt === 0) return "lite";
    return input.mainAt >= input.liteAt ? "main" : "lite";
  }
  if (input.hasLite) return "lite";
  if (input.hasMain) return "main";
  return "none";
}
