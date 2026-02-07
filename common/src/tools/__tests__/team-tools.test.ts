import { describe, it, expect } from 'bun:test'

import { teamCreateParams } from '../params/tool/team-create'
import { teamDeleteParams } from '../params/tool/team-delete'
import { sendMessageParams } from '../params/tool/send-message'
import { taskCreateParams } from '../params/tool/task-create'
import { taskGetParams } from '../params/tool/task-get'
import { taskUpdateParams } from '../params/tool/task-update'
import { taskListParams } from '../params/tool/task-list'

describe('team tool schemas', () => {
  describe('teamCreateParams', () => {
    it('should have the correct tool name', () => {
      expect(teamCreateParams.toolName).toBe('team_create')
    })

    it('should not end agent step', () => {
      expect(teamCreateParams.endsAgentStep).toBe(false)
    })

    it('should have a non-empty description', () => {
      expect(teamCreateParams.description.length).toBeGreaterThan(0)
    })

    it('should validate valid input', () => {
      const result = teamCreateParams.inputSchema.safeParse({
        team_name: 'test-team',
        description: 'Test description',
        agent_type: 'coordinator',
      })
      expect(result.success).toBe(true)
    })

    it('should validate input with only required fields', () => {
      const result = teamCreateParams.inputSchema.safeParse({
        team_name: 'test-team',
      })
      expect(result.success).toBe(true)
    })

    it('should reject input without team_name', () => {
      const result = teamCreateParams.inputSchema.safeParse({
        description: 'No name',
      })
      expect(result.success).toBe(false)
    })

    it('should have an output schema', () => {
      expect(teamCreateParams.outputSchema).toBeDefined()
    })
  })

  describe('teamDeleteParams', () => {
    it('should have the correct tool name', () => {
      expect(teamDeleteParams.toolName).toBe('team_delete')
    })

    it('should not end agent step', () => {
      expect(teamDeleteParams.endsAgentStep).toBe(false)
    })

    it('should validate empty input', () => {
      const result = teamDeleteParams.inputSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('should have a non-empty description', () => {
      expect(teamDeleteParams.description.length).toBeGreaterThan(0)
    })
  })

  describe('sendMessageParams', () => {
    it('should have the correct tool name', () => {
      expect(sendMessageParams.toolName).toBe('send_message')
    })

    it('should not end agent step', () => {
      expect(sendMessageParams.endsAgentStep).toBe(false)
    })

    it('should validate a direct message input', () => {
      const result = sendMessageParams.inputSchema.safeParse({
        type: 'message',
        recipient: 'researcher',
        content: 'Hello',
        summary: 'Greeting',
      })
      expect(result.success).toBe(true)
    })

    it('should validate a broadcast input', () => {
      const result = sendMessageParams.inputSchema.safeParse({
        type: 'broadcast',
        content: 'Important announcement',
        summary: 'Announcement',
      })
      expect(result.success).toBe(true)
    })

    it('should validate a shutdown_request input', () => {
      const result = sendMessageParams.inputSchema.safeParse({
        type: 'shutdown_request',
        recipient: 'agent-1',
        content: 'Task done',
      })
      expect(result.success).toBe(true)
    })

    it('should validate a shutdown_response input', () => {
      const result = sendMessageParams.inputSchema.safeParse({
        type: 'shutdown_response',
        request_id: 'req-1',
        approve: true,
      })
      expect(result.success).toBe(true)
    })

    it('should validate a plan_approval_response input', () => {
      const result = sendMessageParams.inputSchema.safeParse({
        type: 'plan_approval_response',
        request_id: 'req-2',
        recipient: 'researcher',
        approve: false,
        content: 'Needs more detail',
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid message type', () => {
      const result = sendMessageParams.inputSchema.safeParse({
        type: 'invalid_type',
        content: 'test',
      })
      expect(result.success).toBe(false)
    })

    it('should reject missing type field', () => {
      const result = sendMessageParams.inputSchema.safeParse({
        content: 'No type',
      })
      expect(result.success).toBe(false)
    })

    it('should accept all valid type enum values', () => {
      const validTypes = [
        'message',
        'broadcast',
        'shutdown_request',
        'shutdown_response',
        'plan_approval_response',
      ]
      for (const type of validTypes) {
        const result = sendMessageParams.inputSchema.safeParse({ type })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('taskCreateParams', () => {
    it('should have the correct tool name', () => {
      expect(taskCreateParams.toolName).toBe('task_create')
    })

    it('should not end agent step', () => {
      expect(taskCreateParams.endsAgentStep).toBe(false)
    })

    it('should validate valid input', () => {
      const result = taskCreateParams.inputSchema.safeParse({
        subject: 'Fix bug',
        description: 'Fix the auth bug in login flow',
        activeForm: 'Fixing bug',
      })
      expect(result.success).toBe(true)
    })

    it('should validate input with only required fields', () => {
      const result = taskCreateParams.inputSchema.safeParse({
        subject: 'Fix bug',
        description: 'Description here',
      })
      expect(result.success).toBe(true)
    })

    it('should reject input without subject', () => {
      const result = taskCreateParams.inputSchema.safeParse({
        description: 'No subject',
      })
      expect(result.success).toBe(false)
    })

    it('should reject input without description', () => {
      const result = taskCreateParams.inputSchema.safeParse({
        subject: 'No description',
      })
      expect(result.success).toBe(false)
    })

    it('should accept metadata as a record', () => {
      const result = taskCreateParams.inputSchema.safeParse({
        subject: 'Task with metadata',
        description: 'Description',
        metadata: { priority: 'high', tags: ['bug', 'auth'] },
      })
      expect(result.success).toBe(true)
    })
  })

  describe('taskGetParams', () => {
    it('should have the correct tool name', () => {
      expect(taskGetParams.toolName).toBe('task_get')
    })

    it('should not end agent step', () => {
      expect(taskGetParams.endsAgentStep).toBe(false)
    })

    it('should validate valid input', () => {
      const result = taskGetParams.inputSchema.safeParse({
        taskId: '1',
      })
      expect(result.success).toBe(true)
    })

    it('should reject input without taskId', () => {
      const result = taskGetParams.inputSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })

  describe('taskUpdateParams', () => {
    it('should have the correct tool name', () => {
      expect(taskUpdateParams.toolName).toBe('task_update')
    })

    it('should not end agent step', () => {
      expect(taskUpdateParams.endsAgentStep).toBe(false)
    })

    it('should validate status update', () => {
      const result = taskUpdateParams.inputSchema.safeParse({
        taskId: '1',
        status: 'in_progress',
      })
      expect(result.success).toBe(true)
    })

    it('should validate subject update', () => {
      const result = taskUpdateParams.inputSchema.safeParse({
        taskId: '1',
        subject: 'New subject',
      })
      expect(result.success).toBe(true)
    })

    it('should validate owner assignment', () => {
      const result = taskUpdateParams.inputSchema.safeParse({
        taskId: '1',
        owner: 'developer-1',
      })
      expect(result.success).toBe(true)
    })

    it('should validate addBlocks and addBlockedBy', () => {
      const result = taskUpdateParams.inputSchema.safeParse({
        taskId: '1',
        addBlocks: ['2', '3'],
        addBlockedBy: ['4'],
      })
      expect(result.success).toBe(true)
    })

    it('should validate metadata merge', () => {
      const result = taskUpdateParams.inputSchema.safeParse({
        taskId: '1',
        metadata: { key: 'value', removeMe: null },
      })
      expect(result.success).toBe(true)
    })

    it('should reject input without taskId', () => {
      const result = taskUpdateParams.inputSchema.safeParse({
        status: 'completed',
      })
      expect(result.success).toBe(false)
    })

    it('should validate with only taskId (no updates)', () => {
      const result = taskUpdateParams.inputSchema.safeParse({
        taskId: '1',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('taskListParams', () => {
    it('should have the correct tool name', () => {
      expect(taskListParams.toolName).toBe('task_list')
    })

    it('should not end agent step', () => {
      expect(taskListParams.endsAgentStep).toBe(false)
    })

    it('should validate empty input', () => {
      const result = taskListParams.inputSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('should have a non-empty description', () => {
      expect(taskListParams.description.length).toBeGreaterThan(0)
    })
  })

  describe('all tool params consistency', () => {
    const allParams = [
      teamCreateParams,
      teamDeleteParams,
      sendMessageParams,
      taskCreateParams,
      taskGetParams,
      taskUpdateParams,
      taskListParams,
    ]

    it('should all have unique tool names', () => {
      const names = allParams.map((p) => p.toolName)
      const unique = new Set(names)
      expect(unique.size).toBe(allParams.length)
    })

    it('should all have non-empty descriptions', () => {
      for (const params of allParams) {
        expect(params.description.length).toBeGreaterThan(0)
      }
    })

    it('should all have input schemas that accept objects', () => {
      for (const params of allParams) {
        const result = params.inputSchema.safeParse({})
        // Some will fail validation (required fields), but it should not throw
        expect(typeof result.success).toBe('boolean')
      }
    })

    it('should none end agent step', () => {
      for (const params of allParams) {
        expect(params.endsAgentStep).toBe(false)
      }
    })

    it('should all have output schemas', () => {
      for (const params of allParams) {
        expect(params.outputSchema).toBeDefined()
      }
    })
  })
})
