import { z } from 'zod'

export const teamRoleSchema = z.enum([
  'coordinator',
  'cto',
  'vp-engineering',
  'director',
  'fellow',
  'distinguished-engineer',
  'principal-engineer',
  'senior-staff-engineer',
  'staff-engineer',
  'manager',
  'sub-manager',
  'senior-engineer',
  'super-senior',
  'mid-level-engineer',
  'junior-engineer',
  'researcher',
  'scientist',
  'designer',
  'product-lead',
  'tester',
  'reviewer',
  'intern',
  'apprentice',
])

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
  name: z.string(),
  role: teamRoleSchema,
  agentType: z.string(),
  model: z.string(),
  joinedAt: z.number(),
  status: z.enum(['active', 'idle', 'completed', 'failed']),
  currentTaskId: z.string().optional(),
  cwd: z.string(),
})

export const teamConfigSchema = z.object({
  name: z.string(),
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
  id: z.string(),
  subject: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']),
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
