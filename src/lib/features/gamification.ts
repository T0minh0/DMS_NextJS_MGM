type FeatureEnv = Record<string, string | undefined>;

export const GAMIFICATION_MANAGER_VIEW = 'gamification';

const OFF_VALUES = new Set(['0', 'false', 'off', 'disabled', 'no']);

export function parseGamificationUiFlag(value: string | undefined) {
  if (!value) return true;
  return !OFF_VALUES.has(value.trim().toLowerCase());
}

export function isGamificationUiEnabled(env: FeatureEnv = process.env) {
  return parseGamificationUiFlag(
    env.NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION_UI ??
      env.NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION,
  );
}

export function isGamificationManagerView(searchParams: URLSearchParams) {
  return searchParams.get('view') === GAMIFICATION_MANAGER_VIEW;
}
