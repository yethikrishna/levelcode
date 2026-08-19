/**
 * Policy-as-code engine for declarative governance rules.
 *
 * The PolicyEngine loads YAML/JSON policy files and evaluates tool calls
 * against them to produce allow/deny/requireApproval decisions.
 *
 * @packageDocumentation
 */
export {
  PolicyEngine,
  getPolicyEngine,
  resetPolicyEngine,
  createDefaultPolicyEngine,
  BUILT_IN_POLICIES,
} from './policy-engine'
export type {
  PolicyEffect,
  PolicyRule,
  PolicyDocument,
  PolicyResult,
  PolicyContext,
  BuiltInPolicyTemplate,
} from './policy-engine'
