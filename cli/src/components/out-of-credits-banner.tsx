import React from 'react'

// Track credits restored state globally so keyboard handler can access it
// Standalone mode: always report credits as restored
export const areCreditsRestored = () => true

/**
 * Out of credits banner component.
 * Standalone mode: always returns null (never shown).
 */
export const OutOfCreditsBanner = () => {
  return null
}
