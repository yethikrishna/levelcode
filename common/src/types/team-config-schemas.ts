import { z } from 'zod'

/** Accepts any string as a team role — agents can create custom roles freely */
export const teamRoleSchema = z.string().min(1)

export const devPhaseSchema = z.enum([
  'planning',
  'pre-alpha',
  'alpha',
  'beta',
  'production',
  'mature',
])

export const teamMemberSchema = z.object({
  agentId: z.string(),
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'Agent name may only contain letters, numbers, hyphens, and underscores'),
  role: teamRoleSchema,
  agentType: z.string(),
  model: z.string(),
  joinedAt: z.number(),
  status: z.enum(['active', 'idle', 'working', 'blocked', 'completed', 'failed']),
  currentTaskId: z.string().optional(),
  cwd: z.string(),
})

export const teamConfigSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Team name may only contain letters, numbers, hyphens, and underscores'),
  description: z.string(),
  createdAt: z.number(),
  leadAgentId: z.string(),
  phase: devPhaseSchema,
  members: z.array(teamMemberSchema),
  settings: z.object({
    maxMembers: z.number(),
    autoAssign: z.boolean(),
  }),
})

export const teamTaskSchema = z.object({
  id: z.string().regex(/^[0-9]+$/, 'Task ID must be numeric'),
  subject: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  owner: z.string().optional(),
  blockedBy: z.array(z.string()),
  blocks: z.array(z.string()),
  phase: devPhaseSchema,
  activeForm: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

// Protocol message schemas
const idleNotificationSchema = z.object({
  type: z.literal('idle_notification'),
  from: z.string(),
  timestamp: z.string(),
  summary: z.string().optional(),
  completedTaskId: z.string().optional(),
})

const taskCompletedMessageSchema = z.object({
  type: z.literal('task_completed'),
  from: z.string(),
  taskId: z.string(),
  taskSubject: z.string(),
  timestamp: z.string(),
})

const shutdownRequestSchema = z.object({
  type: z.literal('shutdown_request'),
  requestId: z.string(),
  from: z.string(),
  reason: z.string().optional(),
  timestamp: z.string(),
})

const shutdownApprovedSchema = z.object({
  type: z.literal('shutdown_approved'),
  requestId: z.string(),
  from: z.string(),
  timestamp: z.string(),
})

const shutdownRejectedSchema = z.object({
  type: z.literal('shutdown_rejected'),
  requestId: z.string(),
  from: z.string(),
  reason: z.string(),
  timestamp: z.string(),
})

const planApprovalRequestSchema = z.object({
  type: z.literal('plan_approval_request'),
  requestId: z.string(),
  from: z.string(),
  planContent: z.string(),
  timestamp: z.string(),
})

const planApprovalResponseSchema = z.object({
  type: z.literal('plan_approval_response'),
  requestId: z.string(),
  approved: z.boolean(),
  feedback: z.string().optional(),
  timestamp: z.string(),
})

const teamMessageSchema = z.object({
  type: z.literal('message'),
  from: z.string(),
  to: z.string(),
  text: z.string(),
  summary: z.string().optional(),
  timestamp: z.string(),
})

const broadcastMessageSchema = z.object({
  type: z.literal('broadcast'),
  from: z.string(),
  text: z.string(),
  summary: z.string().optional(),
  timestamp: z.string(),
})

export const teamProtocolMessageSchema = z.discriminatedUnion('type', [
  idleNotificationSchema,
  taskCompletedMessageSchema,
  shutdownRequestSchema,
  shutdownApprovedSchema,
  shutdownRejectedSchema,
  planApprovalRequestSchema,
  planApprovalResponseSchema,
  teamMessageSchema,
  broadcastMessageSchema,
])
