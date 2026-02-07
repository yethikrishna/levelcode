import { describe, it, expect } from 'bun:test'

import type {
  IdleNotification,
  TaskCompletedMessage,
  ShutdownRequest,
  ShutdownApproved,
  ShutdownRejected,
  PlanApprovalRequest,
  PlanApprovalResponse,
  TeamMessage,
  BroadcastMessage,
  TeamProtocolMessage,
} from '../team-protocol'

// Type-level tests: these validate at compile time that the types are correctly defined.
// If any of these assignments fail to compile, the type definitions are broken.

describe('team-protocol types', () => {
  describe('IdleNotification', () => {
    it('should have required fields', () => {
      const msg: IdleNotification = {
        type: 'idle_notification',
        from: 'agent-1',
        timestamp: '2024-01-01T00:00:00Z',
      }
      expect(msg.type).toBe('idle_notification')
      expect(msg.from).toBe('agent-1')
      expect(msg.timestamp).toBe('2024-01-01T00:00:00Z')
    })

    it('should accept optional fields', () => {
      const msg: IdleNotification = {
        type: 'idle_notification',
        from: 'agent-1',
        timestamp: '2024-01-01T00:00:00Z',
        summary: 'Finished work',
        completedTaskId: 'task-42',
      }
      expect(msg.summary).toBe('Finished work')
      expect(msg.completedTaskId).toBe('task-42')
    })
  })

  describe('TaskCompletedMessage', () => {
    it('should have all required fields', () => {
      const msg: TaskCompletedMessage = {
        type: 'task_completed',
        from: 'agent-1',
        taskId: '1',
        taskSubject: 'Fix bug',
        timestamp: '2024-01-01T00:00:00Z',
      }
      expect(msg.type).toBe('task_completed')
      expect(msg.taskId).toBe('1')
      expect(msg.taskSubject).toBe('Fix bug')
    })
  })

  describe('ShutdownRequest', () => {
    it('should have required fields', () => {
      const msg: ShutdownRequest = {
        type: 'shutdown_request',
        requestId: 'req-1',
        from: 'leader',
        timestamp: '2024-01-01T00:00:00Z',
      }
      expect(msg.type).toBe('shutdown_request')
      expect(msg.requestId).toBe('req-1')
    })

    it('should accept optional reason', () => {
      const msg: ShutdownRequest = {
        type: 'shutdown_request',
        requestId: 'req-1',
        from: 'leader',
        reason: 'Task complete',
        timestamp: '2024-01-01T00:00:00Z',
      }
      expect(msg.reason).toBe('Task complete')
    })
  })

  describe('ShutdownApproved', () => {
    it('should have all required fields', () => {
      const msg: ShutdownApproved = {
        type: 'shutdown_approved',
        requestId: 'req-1',
        from: 'agent-1',
        timestamp: '2024-01-01T00:00:00Z',
      }
      expect(msg.type).toBe('shutdown_approved')
      expect(msg.requestId).toBe('req-1')
    })
  })

  describe('ShutdownRejected', () => {
    it('should have all required fields including reason', () => {
      const msg: ShutdownRejected = {
        type: 'shutdown_rejected',
        requestId: 'req-1',
        from: 'agent-1',
        reason: 'Still working on task',
        timestamp: '2024-01-01T00:00:00Z',
      }
      expect(msg.type).toBe('shutdown_rejected')
      expect(msg.reason).toBe('Still working on task')
    })
  })

  describe('PlanApprovalRequest', () => {
    it('should have all required fields', () => {
      const msg: PlanApprovalRequest = {
        type: 'plan_approval_request',
        requestId: 'req-2',
        from: 'researcher',
        planContent: 'Step 1: Research APIs\nStep 2: Implement',
        timestamp: '2024-01-01T00:00:00Z',
      }
      expect(msg.type).toBe('plan_approval_request')
      expect(msg.planContent).toContain('Research APIs')
    })
  })

  describe('PlanApprovalResponse', () => {
    it('should have all required fields when approved', () => {
      const msg: PlanApprovalResponse = {
        type: 'plan_approval_response',
        requestId: 'req-2',
        approved: true,
        timestamp: '2024-01-01T00:00:00Z',
      }
      expect(msg.type).toBe('plan_approval_response')
      expect(msg.approved).toBe(true)
    })

    it('should accept optional feedback', () => {
      const msg: PlanApprovalResponse = {
        type: 'plan_approval_response',
        requestId: 'req-2',
        approved: false,
        feedback: 'Please add error handling',
        timestamp: '2024-01-01T00:00:00Z',
      }
      expect(msg.feedback).toBe('Please add error handling')
      expect(msg.approved).toBe(false)
    })
  })

  describe('TeamMessage', () => {
    it('should have all required fields', () => {
      const msg: TeamMessage = {
        type: 'message',
        from: 'team-lead',
        to: 'developer',
        text: 'Please review the PR',
        timestamp: '2024-01-01T00:00:00Z',
      }
      expect(msg.type).toBe('message')
      expect(msg.from).toBe('team-lead')
      expect(msg.to).toBe('developer')
      expect(msg.text).toBe('Please review the PR')
    })

    it('should accept optional summary', () => {
      const msg: TeamMessage = {
        type: 'message',
        from: 'lead',
        to: 'dev',
        text: 'content',
        summary: 'PR review request',
        timestamp: '2024-01-01T00:00:00Z',
      }
      expect(msg.summary).toBe('PR review request')
    })
  })

  describe('BroadcastMessage', () => {
    it('should have all required fields', () => {
      const msg: BroadcastMessage = {
        type: 'broadcast',
        from: 'team-lead',
        text: 'Everyone stop, blocking issue found',
        timestamp: '2024-01-01T00:00:00Z',
      }
      expect(msg.type).toBe('broadcast')
      expect(msg.from).toBe('team-lead')
      expect(msg.text).toContain('blocking issue')
    })

    it('should accept optional summary', () => {
      const msg: BroadcastMessage = {
        type: 'broadcast',
        from: 'lead',
        text: 'content',
        summary: 'Important announcement',
        timestamp: '2024-01-01T00:00:00Z',
      }
      expect(msg.summary).toBe('Important announcement')
    })
  })

  describe('TeamProtocolMessage union', () => {
    it('should accept all message types', () => {
      const messages: TeamProtocolMessage[] = [
        {
          type: 'idle_notification',
          from: 'agent-1',
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          type: 'task_completed',
          from: 'agent-1',
          taskId: '1',
          taskSubject: 'Fix bug',
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          type: 'shutdown_request',
          requestId: 'req-1',
          from: 'leader',
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          type: 'shutdown_approved',
          requestId: 'req-1',
          from: 'agent-1',
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          type: 'shutdown_rejected',
          requestId: 'req-1',
          from: 'agent-1',
          reason: 'busy',
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          type: 'plan_approval_request',
          requestId: 'req-2',
          from: 'researcher',
          planContent: 'plan',
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          type: 'plan_approval_response',
          requestId: 'req-2',
          approved: true,
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          type: 'message',
          from: 'lead',
          to: 'dev',
          text: 'hello',
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          type: 'broadcast',
          from: 'lead',
          text: 'announcement',
          timestamp: '2024-01-01T00:00:00Z',
        },
      ]
      expect(messages).toHaveLength(9)
    })

    it('should be narrowable by type discriminant', () => {
      const msg: TeamProtocolMessage = {
        type: 'message',
        from: 'lead',
        to: 'dev',
        text: 'hello',
        timestamp: '2024-01-01T00:00:00Z',
      }

      if (msg.type === 'message') {
        // TypeScript narrows to TeamMessage here
        expect(msg.to).toBe('dev')
        expect(msg.text).toBe('hello')
      }

      const broadcast: TeamProtocolMessage = {
        type: 'broadcast',
        from: 'lead',
        text: 'announcement',
        timestamp: '2024-01-01T00:00:00Z',
      }

      if (broadcast.type === 'broadcast') {
        // TypeScript narrows to BroadcastMessage here
        expect(broadcast.text).toBe('announcement')
      }
    })

    it('should discriminate all type values correctly', () => {
      const typeValues = [
        'idle_notification',
        'task_completed',
        'shutdown_request',
        'shutdown_approved',
        'shutdown_rejected',
        'plan_approval_request',
        'plan_approval_response',
        'message',
        'broadcast',
      ]
      expect(typeValues).toHaveLength(9)

      // Verify each type string is unique
      const unique = new Set(typeValues)
      expect(unique.size).toBe(9)
    })
  })
})
