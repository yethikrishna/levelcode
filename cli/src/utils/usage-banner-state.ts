export const HIGH_CREDITS_THRESHOLD = 1000
export const MEDIUM_CREDITS_THRESHOLD = 500
export const LOW_CREDITS_THRESHOLD = 100

export type BannerColorLevel = 'success' | 'warning' | 'error'

export type CreditTier = 'high' | 'medium' | 'low' | 'out'

export type ThresholdInfo = {
  tier: CreditTier
  colorLevel: BannerColorLevel
  threshold: number
}

/**
 * Gets comprehensive threshold information for a given credit balance.
 * This is the single source of truth for credit tier classification.
 */
export function getThresholdInfo(balance: number | null): ThresholdInfo {
  if (balance === null) {
    return {
      tier: 'medium',
      colorLevel: 'warning',
      threshold: MEDIUM_CREDITS_THRESHOLD,
    }
  }
  if (balance >= HIGH_CREDITS_THRESHOLD) {
    return {
      tier: 'high',
      colorLevel: 'success',
      threshold: HIGH_CREDITS_THRESHOLD,
    }
  }
  if (balance >= MEDIUM_CREDITS_THRESHOLD) {
    return {
      tier: 'medium',
      colorLevel: 'warning',
      threshold: MEDIUM_CREDITS_THRESHOLD,
    }
  }
  if (balance >= LOW_CREDITS_THRESHOLD) {
    return {
      tier: 'low',
      colorLevel: 'warning',
      threshold: LOW_CREDITS_THRESHOLD,
    }
  }
  return { tier: 'out', colorLevel: 'error', threshold: 0 }
}

/**
 * Determines the appropriate color level for the usage banner based on credit balance.
 *
 * Color mapping:
 * - success (green): >= 1000 credits
 * - warning (yellow): 100-999 credits OR balance is null/unknown
 * - error (red): < 100 credits
 *
 * @deprecated Use getThresholdInfo(balance).colorLevel instead
 */
export function getBannerColorLevel(balance: number | null): BannerColorLevel {
  return getThresholdInfo(balance).colorLevel
}

/**
 * Generates loading text for the usage banner while data is being fetched.
 */
export function generateLoadingBannerText(sessionCreditsUsed: number): string {
  return `Session usage: ${sessionCreditsUsed.toLocaleString()}. Loading credit balance...`
}

/**
 * Gets the threshold tier for a given balance.
 * Returns null if balance is above all thresholds.
 */
function getThresholdTier(balance: number): number | null {
  if (balance < LOW_CREDITS_THRESHOLD) return LOW_CREDITS_THRESHOLD
  if (balance < MEDIUM_CREDITS_THRESHOLD) return MEDIUM_CREDITS_THRESHOLD
  if (balance < HIGH_CREDITS_THRESHOLD) return HIGH_CREDITS_THRESHOLD
  return null
}

export interface AutoShowDecision {
  shouldShow: boolean
  newWarningThreshold: number | null
}

/**
 * Determines whether the usage banner should auto-show based on credit threshold crossings.
 * Standalone mode: never auto-show the banner (unlimited credits).
 */
export function shouldAutoShowBanner(
  _isChainInProgress: boolean,
  _hasAuthToken: boolean,
  _remainingBalance: number | null,
  _lastWarnedThreshold: number | null,
  _autoTopupEnabled: boolean = false,
): AutoShowDecision {
  return { shouldShow: false, newWarningThreshold: null }
}
