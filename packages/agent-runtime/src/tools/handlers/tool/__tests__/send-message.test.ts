import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { handleSendMessage } from '../send-message'
import {
  createTeam,
  readInbox,
} from '@levelcode/common/utils/team-fs'

import type { TeamConfig } from '@levelcode/common/types/team-config'

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => noopLogger,
} as any

let tmpDir: string
let origHome: string | undefined
let origUserProfile: string | undefined

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'send-message-test-'))
  origHome = process.env.HOME
  origUserProfile = process.env.USERPROFILE
  process.env.HOME = tmpDir
  process.env.USERPROFILE = tmpDir
})

afterEach(() => {
  if (origHome !== undefined) {
    process.env.HOME = origHome
  } else {
    delete process.env.HOME
  }
  if (origUserProfile !== undefined) {
    process.env.USERPROFILE = origUserProfile
  } else {
    delete process.env.USERPROFILE
  }
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

function makeTeamConfig(): TeamConfig {
  return {
    name: 'test-team',
    description: 'A test team',
    createdAt: Date.now(),
    leadAgentId: 'lead-step-lead',
    phase: 'planning',
    members: [
      {
        agentId: 'lead-step-lead',
        name: 'team-lead',
        role: 'coordinator',
        agentType: 'coordinator',
        model: 'test-model',
        joinedAt: Date.now(),
        status: 'active',
        cwd: '/tmp',
      },
      {
        agentId: 'step-dev',
        name: 'developer',
        role: 'senior-engineer',
        agentType: 'senior-engineer',
        model: 'test-model',
        joinedAt: Date.now(),
        status: 'active',
        cwd: '/tmp',
      },
      {
        agentId: 'step-tester',
        name: 'tester',
        role: 'tester',
        agentType: 'tester',
        model: 'test-model',
        joinedAt: Date.now(),
        status: 'active',
        cwd: '/tmp',
      },
    ],
    settings: {
      maxMembers: 20,
      autoAssign: true,
    },
  }
}

function makeParams(
  input: Record<string, unknown>,
  agentStepId: string = 'step-lead',
) {
  return {
    previousToolCallFinished: Promise.resolve(),
    toolCall: {
      toolCallId: 'tc-msg-1',
      toolName: 'send_message' as const,
      input,
    },
    agentStepId,
    trackEvent: mock(() => {}),
    userId: 'test-user',
    logger: noopLogger,
  }
}

function getJsonValue(result: { output: any[] }): any {
  const output = result.output[0]
  return output?.type === 'json' ? output.value : null
}

describe('handleSendMessage', () => {
  describe('no team context', () => {
    it('should return error when no team found', async () => {
      const result = await handleSendMessage(
        makeParams({
          type: 'message',
          recipient: 'developer',
          content: 'hello',
          summary: 'greeting',
        }, 'unknown-step') as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('No team found for the current agent context')
    })
  })

  describe('type: message (DM)', () => {
    it('should deliver a direct message to a recipient', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'message',
          recipient: 'developer',
          content: 'Please review PR #42',
          summary: 'PR review request',
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('Message sent to "developer"')

      const inbox = readInbox('test-team', 'developer')
      expect(inbox).toHaveLength(1)
      expect(inbox[0]!.type).toBe('message')
      expect((inbox[0] as any).text).toBe('Please review PR #42')
      expect((inbox[0] as any).from).toBe('team-lead')
    })

    it('should error when recipient is missing', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'message',
          content: 'hello',
          summary: 'hi',
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('recipient')
    })

    it('should error when summary is missing', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'message',
          recipient: 'developer',
          content: 'hello',
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('summary')
    })

    it('should error when recipient is not a team member', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'message',
          recipient: 'nonexistent-member',
          content: 'hello',
          summary: 'hi',
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('not a member')
    })
  })

  describe('type: broadcast', () => {
    it('should send to all teammates except sender', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'broadcast',
          content: 'Meeting in 5 minutes',
          summary: 'meeting alert',
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('Broadcast sent to 2 teammate(s)')

      // developer and tester should each have the message
      const devInbox = readInbox('test-team', 'developer')
      expect(devInbox).toHaveLength(1)
      expect(devInbox[0]!.type).toBe('broadcast')

      const testerInbox = readInbox('test-team', 'tester')
      expect(testerInbox).toHaveLength(1)

      // team-lead (sender) should NOT have the message
      const leadInbox = readInbox('test-team', 'team-lead')
      expect(leadInbox).toHaveLength(0)
    })

    it('should error when summary is missing for broadcast', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'broadcast',
          content: 'hello all',
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('summary')
    })
  })

  describe('type: shutdown_request', () => {
    it('should send shutdown request to recipient', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'shutdown_request',
          recipient: 'developer',
          content: 'Task complete, wrapping up',
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('Shutdown request sent to "developer"')
      expect(val.message).toContain('requestId')

      const inbox = readInbox('test-team', 'developer')
      expect(inbox).toHaveLength(1)
      expect(inbox[0]!.type).toBe('shutdown_request')
      expect((inbox[0] as any).from).toBe('team-lead')
    })

    it('should error when recipient is missing', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'shutdown_request',
          content: 'done',
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('recipient')
    })

    it('should error when recipient is not a member', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'shutdown_request',
          recipient: 'ghost',
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('not a member')
    })
  })

  describe('type: shutdown_response', () => {
    it('should broadcast shutdown approved to all other members', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams(
          {
            type: 'shutdown_response',
            request_id: 'req-123',
            approve: true,
          },
          'step-dev',
        ) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('Shutdown approved')
      expect(val.message).toContain('req-123')

      // Response should go to all members except sender (developer)
      const leadInbox = readInbox('test-team', 'team-lead')
      expect(leadInbox).toHaveLength(1)
      expect(leadInbox[0]!.type).toBe('shutdown_approved')

      const testerInbox = readInbox('test-team', 'tester')
      expect(testerInbox).toHaveLength(1)

      const devInbox = readInbox('test-team', 'developer')
      expect(devInbox).toHaveLength(0)
    })

    it('should broadcast shutdown rejected to all other members', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams(
          {
            type: 'shutdown_response',
            request_id: 'req-456',
            approve: false,
            content: 'Still working on task #3',
          },
          'step-dev',
        ) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('Shutdown rejected')

      const leadInbox = readInbox('test-team', 'team-lead')
      expect(leadInbox).toHaveLength(1)
      expect(leadInbox[0]!.type).toBe('shutdown_rejected')
      expect((leadInbox[0] as any).reason).toBe('Still working on task #3')
    })

    it('should error when request_id is missing', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'shutdown_response',
          approve: true,
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('request_id')
    })

    it('should error when approve is missing', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'shutdown_response',
          request_id: 'req-789',
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('approve')
    })
  })

  describe('type: plan_approval_response', () => {
    it('should send plan approval to recipient', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'plan_approval_response',
          request_id: 'plan-req-1',
          recipient: 'developer',
          approve: true,
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('Plan approved')
      expect(val.message).toContain('developer')

      const inbox = readInbox('test-team', 'developer')
      expect(inbox).toHaveLength(1)
      expect(inbox[0]!.type).toBe('plan_approval_response')
      expect((inbox[0] as any).approved).toBe(true)
    })

    it('should send plan rejection with feedback', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'plan_approval_response',
          request_id: 'plan-req-2',
          recipient: 'developer',
          approve: false,
          content: 'Add error handling for API calls',
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('Plan rejected')

      const inbox = readInbox('test-team', 'developer')
      expect(inbox).toHaveLength(1)
      expect((inbox[0] as any).approved).toBe(false)
      expect((inbox[0] as any).feedback).toBe('Add error handling for API calls')
    })

    it('should error when request_id is missing', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'plan_approval_response',
          recipient: 'developer',
          approve: true,
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('request_id')
    })

    it('should error when recipient is missing', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'plan_approval_response',
          request_id: 'plan-req-3',
          approve: true,
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('recipient')
    })

    it('should error when approve is missing', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'plan_approval_response',
          request_id: 'plan-req-4',
          recipient: 'developer',
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('approve')
    })

    it('should error when recipient is not a member', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'plan_approval_response',
          request_id: 'plan-req-5',
          recipient: 'ghost',
          approve: true,
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('not a member')
    })
  })

  describe('unknown type', () => {
    it('should return error for unknown message type', async () => {
      createTeam(makeTeamConfig())

      const result = await handleSendMessage(
        makeParams({
          type: 'invalid_type',
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('Unknown message type')
    })
  })
})
