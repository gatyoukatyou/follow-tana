/** 見本データ（9 人）への転落を拒否する上限 */
export const STARTER_MAX = 15;
/** これ以下の件数ではガードを効かせない（初期状態の増加を妨げないため） */
export const LITE_GUARD_MIN = 40;

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
