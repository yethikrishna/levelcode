/**
 * Re-exports from consolidated block-utils (REFACTORING_PLAN 2.2)
 * All think tag logic lives in block-utils.ts
 */
export {
  THINK_OPEN_TAG,
  THINK_CLOSE_TAG,
  type ThinkSegment,
  getPartialTagLength,
  parseThinkTags,
} from './block-utils'
