import { describe, it, expect } from 'bun:test'

import {
  teamRoleSchema,
  devPhaseSchema,
  teamMemberSchema,
  teamConfigSchema,
  teamTaskSchema,
  teamProtocolMessageSchema,
} from '../team-config-schemas'

describe('team-config-schemas', () => {
  describe('teamRoleSchema', () => {
    const allRoles = [
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
    ]

    it('should validate all 23 roles', () => {
      expect(allRoles).toHaveLength(23)
      // Verify the schema itself has exactly 23 options
      expect(teamRoleSchema.options).toHaveLength(23)
    })

    for (const role of allRoles) {
      it(`should accept role "${role}"`, () => {
        const result = teamRoleSchema.safeParse(role)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBe(role)
        }
      })
    }

    it('should reject invalid roles', () => {
      const invalidRoles = ['admin', 'superuser', 'CEO', 'engineer', '', 'COORDINATOR', 'Manager']
      for (const role of invalidRoles) {
        const result = teamRoleSchema.safeParse(role)
        expect(result.success).toBe(false)
      }
    })

    it('should reject non-string values', () => {
      expect(teamRoleSchema.safeParse(42).success).toBe(false)
      expect(teamRoleSchema.safeParse(null).success).toBe(false)
      expect(teamRoleSchema.safeParse(undefined).success).toBe(false)
      expect(teamRoleSchema.safeParse({}).success).toBe(false)
    })
  })

  describe('devPhaseSchema', () => {
    const allPhases = ['planning', 'pre-alpha', 'alpha', 'beta', 'production', 'mature']

    it('should validate all 6 phases', () => {
      expect(allPhases).toHaveLength(6)
      expect(devPhaseSchema.options).toHaveLength(6)
    })

    for (const phase of allPhases) {
      it(`should accept phase "${phase}"`, () => {
        const result = devPhaseSchema.safeParse(phase)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBe(phase)
        }
      })
    }

    it('should reject invalid phases', () => {
      const invalidPhases = ['dev', 'staging', 'release', 'ga', '', 'BETA', 'Alpha']
      for (const phase of invalidPhases) {
        const result = devPhaseSchema.safeParse(phase)
        expect(result.success).toBe(false)
      }
    })
  })

  describe('teamMemberSchema', () => {
    const validMember = {
      agentId: 'agent-001',
      name: 'Alice',
      role: 'senior-engineer' as const,
      agentType: 'claude',
      model: 'claude-opus-4-6',
      joinedAt: 1700000000,
      status: 'active' as const,
      cwd: '/home/project',
    }

    it('should validate a complete member', () => {
      const result = teamMemberSchema.safeParse(validMember)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.agentId).toBe('agent-001')
        expect(result.data.name).toBe('Alice')
        expect(result.data.role).toBe('senior-engineer')
        expect(result.data.status).toBe('active')
      }
    })

    it('should accept all valid status values', () => {
      const statuses = ['active', 'idle', 'completed', 'failed'] as const
      for (const status of statuses) {
        const result = teamMemberSchema.safeParse({ ...validMember, status })
        expect(result.success).toBe(true)
      }
    })

    it('should accept optional currentTaskId', () => {
      const withTask = { ...validMember, currentTaskId: 'task-42' }
      const result = teamMemberSchema.safeParse(withTask)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.currentTaskId).toBe('task-42')
      }
    })

    it('should validate without optional currentTaskId', () => {
      const result = teamMemberSchema.safeParse(validMember)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.currentTaskId).toBeUndefined()
      }
    })

    it('should reject missing required fields', () => {
      const requiredFields = ['agentId', 'name', 'role', 'agentType', 'model', 'joinedAt', 'status', 'cwd']
      for (const field of requiredFields) {
        const incomplete = { ...validMember }
        delete (incomplete as Record<string, unknown>)[field]
        const result = teamMemberSchema.safeParse(incomplete)
        expect(result.success).toBe(false)
      }
    })

    it('should reject invalid status', () => {
      const result = teamMemberSchema.safeParse({ ...validMember, status: 'running' })
      expect(result.success).toBe(false)
    })

    it('should reject invalid role', () => {
      const result = teamMemberSchema.safeParse({ ...validMember, role: 'boss' })
      expect(result.success).toBe(false)
    })

    it('should reject wrong types for fields', () => {
      expect(teamMemberSchema.safeParse({ ...validMember, joinedAt: '2024-01-01' }).success).toBe(false)
      expect(teamMemberSchema.safeParse({ ...validMember, agentId: 123 }).success).toBe(false)
      expect(teamMemberSchema.safeParse({ ...validMember, name: null }).success).toBe(false)
    })
  })

  describe('teamConfigSchema', () => {
    const validMember = {
      agentId: 'agent-001',
      name: 'Alice',
      role: 'senior-engineer' as const,
      agentType: 'claude',
      model: 'claude-opus-4-6',
      joinedAt: 1700000000,
      status: 'active' as const,
      cwd: '/home/project',
    }

    const validConfig = {
      name: 'my-team',
      description: 'A test team',
      createdAt: 1700000000,
      leadAgentId: 'agent-001',
      phase: 'alpha' as const,
      members: [validMember],
      settings: {
        maxMembers: 10,
        autoAssign: true,
      },
    }

    it('should validate a full config', () => {
      const result = teamConfigSchema.safeParse(validConfig)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('my-team')
        expect(result.data.phase).toBe('alpha')
        expect(result.data.members).toHaveLength(1)
        expect(result.data.settings.maxMembers).toBe(10)
        expect(result.data.settings.autoAssign).toBe(true)
      }
    })

    it('should validate config with empty members array', () => {
      const result = teamConfigSchema.safeParse({ ...validConfig, members: [] })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.members).toHaveLength(0)
      }
    })

    it('should validate config with multiple members', () => {
      const secondMember = {
        ...validMember,
        agentId: 'agent-002',
        name: 'Bob',
        role: 'junior-engineer' as const,
      }
      const result = teamConfigSchema.safeParse({
        ...validConfig,
        members: [validMember, secondMember],
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.members).toHaveLength(2)
      }
    })

    it('should reject missing required fields', () => {
      const requiredFields = ['name', 'description', 'createdAt', 'leadAgentId', 'phase', 'members', 'settings']
      for (const field of requiredFields) {
        const incomplete = { ...validConfig }
        delete (incomplete as Record<string, unknown>)[field]
        const result = teamConfigSchema.safeParse(incomplete)
        expect(result.success).toBe(false)
      }
    })

    it('should reject invalid phase in config', () => {
      const result = teamConfigSchema.safeParse({ ...validConfig, phase: 'staging' })
      expect(result.success).toBe(false)
    })

    it('should reject missing settings fields', () => {
      expect(teamConfigSchema.safeParse({ ...validConfig, settings: { maxMembers: 10 } }).success).toBe(false)
      expect(teamConfigSchema.safeParse({ ...validConfig, settings: { autoAssign: true } }).success).toBe(false)
      expect(teamConfigSchema.safeParse({ ...validConfig, settings: {} }).success).toBe(false)
    })

    it('should reject invalid member within members array', () => {
      const invalidMember = { ...validMember, role: 'boss' }
      const result = teamConfigSchema.safeParse({
        ...validConfig,
        members: [invalidMember],
      })
      expect(result.success).toBe(false)
    })
  })

  describe('teamTaskSchema', () => {
    const validTask = {
      id: 'task-001',
      subject: 'Fix authentication bug',
      description: 'The login flow fails when using SSO',
      status: 'pending' as const,
      blockedBy: [],
      blocks: [],
      phase: 'beta' as const,
      createdAt: 1700000000,
      updatedAt: 1700000000,
    }

    it('should validate a task with all required fields', () => {
      const result = teamTaskSchema.safeParse(validTask)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe('task-001')
        expect(result.data.subject).toBe('Fix authentication bug')
        expect(result.data.status).toBe('pending')
        expect(result.data.phase).toBe('beta')
        expect(result.data.blockedBy).toHaveLength(0)
        expect(result.data.blocks).toHaveLength(0)
      }
    })

    it('should accept all valid status values', () => {
      const statuses = ['pending', 'in_progress', 'completed', 'blocked'] as const
      for (const status of statuses) {
        const result = teamTaskSchema.safeParse({ ...validTask, status })
        expect(result.success).toBe(true)
      }
    })

    it('should handle optional owner field', () => {
      const withOwner = { ...validTask, owner: 'agent-001' }
      const result = teamTaskSchema.safeParse(withOwner)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.owner).toBe('agent-001')
      }

      const withoutOwner = teamTaskSchema.safeParse(validTask)
      expect(withoutOwner.success).toBe(true)
      if (withoutOwner.success) {
        expect(withoutOwner.data.owner).toBeUndefined()
      }
    })

    it('should handle optional activeForm field', () => {
      const withActiveForm = { ...validTask, activeForm: 'Fixing authentication bug' }
      const result = teamTaskSchema.safeParse(withActiveForm)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.activeForm).toBe('Fixing authentication bug')
      }

      const withoutActiveForm = teamTaskSchema.safeParse(validTask)
      expect(withoutActiveForm.success).toBe(true)
      if (withoutActiveForm.success) {
        expect(withoutActiveForm.data.activeForm).toBeUndefined()
      }
    })

    it('should handle optional metadata field', () => {
      const withMetadata = {
        ...validTask,
        metadata: { priority: 'high', complexity: 3, tags: ['auth', 'sso'] },
      }
      const result = teamTaskSchema.safeParse(withMetadata)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata).toBeDefined()
        expect(result.data.metadata!.priority).toBe('high')
      }
    })

    it('should validate tasks with non-empty blockedBy and blocks', () => {
      const taskWithDeps = {
        ...validTask,
        blockedBy: ['task-000'],
        blocks: ['task-002', 'task-003'],
      }
      const result = teamTaskSchema.safeParse(taskWithDeps)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.blockedBy).toEqual(['task-000'])
        expect(result.data.blocks).toEqual(['task-002', 'task-003'])
      }
    })

    it('should reject missing required fields', () => {
      const requiredFields = ['id', 'subject', 'description', 'status', 'blockedBy', 'blocks', 'phase', 'createdAt', 'updatedAt']
      for (const field of requiredFields) {
        const incomplete = { ...validTask }
        delete (incomplete as Record<string, unknown>)[field]
        const result = teamTaskSchema.safeParse(incomplete)
        expect(result.success).toBe(false)
      }
    })

    it('should reject invalid status', () => {
      const result = teamTaskSchema.safeParse({ ...validTask, status: 'cancelled' })
      expect(result.success).toBe(false)
    })

    it('should reject invalid phase', () => {
      const result = teamTaskSchema.safeParse({ ...validTask, phase: 'staging' })
      expect(result.success).toBe(false)
    })

    it('should reject wrong types for fields', () => {
      expect(teamTaskSchema.safeParse({ ...validTask, id: 42 }).success).toBe(false)
      expect(teamTaskSchema.safeParse({ ...validTask, createdAt: '2024-01-01' }).success).toBe(false)
      expect(teamTaskSchema.safeParse({ ...validTask, blockedBy: 'task-000' }).success).toBe(false)
    })
  })

  describe('teamProtocolMessageSchema', () => {
    it('should validate an idle_notification message', () => {
      const result = teamProtocolMessageSchema.safeParse({
        type: 'idle_notification',
        from: 'agent-1',
        timestamp: '2024-01-01T00:00:00Z',
      })
      expect(result.success).toBe(true)
    })

    it('should validate a task_completed message', () => {
      const result = teamProtocolMessageSchema.safeParse({
        type: 'task_completed',
        from: 'agent-1',
        taskId: '1',
        taskSubject: 'Fix bug',
        timestamp: '2024-01-01T00:00:00Z',
      })
      expect(result.success).toBe(true)
    })

    it('should reject unknown message types', () => {
      const result = teamProtocolMessageSchema.safeParse({
        type: 'unknown_type',
        from: 'agent-1',
        timestamp: '2024-01-01T00:00:00Z',
      })
      expect(result.success).toBe(false)
    })

    it('should reject messages missing required fields for their type', () => {
      const result = teamProtocolMessageSchema.safeParse({
        type: 'task_completed',
        from: 'agent-1',
        // missing taskId and taskSubject
        timestamp: '2024-01-01T00:00:00Z',
      })
      expect(result.success).toBe(false)
    })
  })
})
