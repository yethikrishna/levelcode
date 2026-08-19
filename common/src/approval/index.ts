/**
 * Approval & diff-preview gate for tool execution governance.
 *
 * The DiffApprovalGate controls whether tool execution proceeds automatically,
 * pauses for user approval, or is blocked based on the active permission profile.
 *
 * @packageDocumentation
 */
export {
  DiffApprovalGate,
  getDiffApprovalGate,
  resetDiffApprovalGate,
} from './diff-gate'
export type {
  ApprovalRequest,
  ApprovalCallback,
  ApprovalResult,
} from './diff-gate'
