import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import {
  createTeam,
  sendMessage,
  readInbox,
  clearInbox,
  getTeamsDir,
} from '../team-fs'

import type { TeamConfig } from '../../types/team-config'
import type {
  TeamMessage,
  BroadcastMessage,
  ShutdownRequest,
  ShutdownApproved,
  ShutdownRejected,
  PlanApprovalRequest,
  PlanApprovalResponse,
  TeamProtocolMessage,
  IdleNotification,
  TaskCompletedMessage,
} from '../../types/team-protocol'

// ---------------------------------------------------------------------------
// Test isolation: redirect HOME so team-fs writes to a temp dir
// ---------------------------------------------------------------------------

let tmpDir: string
let origHome: string | undefined
let origUserProfile: string | undefined

function makeTeamConfig(overrides?: Partial<TeamConfig>): TeamConfig {
  return {
    name: 'msg-team',
    description: 'Messaging test team',
    createdAt: Date.now(),
    leadAgentId: 'lead-001',
    phase: 'planning',
    members: [
      {
        agentId: 'lead-001',
        name: 'team-lead',
        role: 'coordinator',
        agentType: 'coordinator',
        model: 'test-model',
        joinedAt: Date.now(),
        status: 'active',
        cwd: '/tmp',
      },
      {
        agentId: 'dev-001',
        name: 'developer',
        role: 'senior-engineer',
        agentType: 'senior-engineer',
        model: 'test-model',
        joinedAt: Date.now(),
        status: 'active',
        cwd: '/tmp',
      },
      {
        agentId: 'dev-002',
        name: 'developer-2',
        role: 'junior-engineer',
        agentType: 'junior-engineer',
        model: 'test-model',
        joinedAt: Date.now(),
        status: 'active',
        cwd: '/tmp',
      },
      {
        agentId: 'tester-001',
        name: 'tester',
        role: 'tester',
        agentType: 'tester',
        model: 'test-model',
        joinedAt: Date.now(),
        status: 'active',
        cwd: '/tmp',
      },
    ],
    settings: { maxMembers: 20, autoAssign: true },
    ...overrides,
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-messaging-test-'))
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDirectMessage(overrides?: Partial<TeamMessage>): TeamMessage {
  return {
    type: 'message',
    from: 'team-lead',
    to: 'developer',
    text: 'Hello developer',
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

function makeBroadcast(overrides?: Partial<BroadcastMessage>): BroadcastMessage {
  return {
    type: 'broadcast',
    from: 'team-lead',
    text: 'Attention everyone',
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('team-messaging', () => {
  // =========================================================================
  // 1. sendMessage delivers to correct inbox file
  // =========================================================================
  describe('sendMessage delivers to correct inbox file', () => {
    it('should write to the named agent inbox file', async () => {
      createTeam(makeTeamConfig())
      const msg = makeDirectMessage()
      await sendMessage('msg-team', 'developer', msg)

      const inboxPath = path.join(getTeamsDir(), 'msg-team', 'inboxes', 'developer.json')
      expect(fs.existsSync(inboxPath)).toBe(true)

      const raw = fs.readFileSync(inboxPath, 'utf-8')
      const parsed = JSON.parse(raw) as TeamProtocolMessage[]
      expect(parsed).toHaveLength(1)
      expect((parsed[0] as TeamMessage).text).toBe('Hello developer')
    })

    it('should deliver to different agents independently', async () => {
      createTeam(makeTeamConfig())

      await sendMessage('msg-team', 'developer', makeDirectMessage({ to: 'developer', text: 'msg for dev' }))
      await sendMessage('msg-team', 'tester', makeDirectMessage({ to: 'tester', text: 'msg for tester' }))

      const devInbox = readInbox('msg-team', 'developer')
      const testerInbox = readInbox('msg-team', 'tester')

      expect(devInbox).toHaveLength(1)
      expect(testerInbox).toHaveLength(1)
      expect((devInbox[0] as TeamMessage).text).toBe('msg for dev')
      expect((testerInbox[0] as TeamMessage).text).toBe('msg for tester')
    })

    it('should create inbox directory automatically if it does not exist', async () => {
      // Do not call createTeam -- sendMessage should handle missing dirs
      const msg = makeDirectMessage()
      await sendMessage('auto-team', 'some-agent', msg)

      const inbox = readInbox('auto-team', 'some-agent')
      expect(inbox).toHaveLength(1)
    })
  })

  // =========================================================================
  // 2. Multiple messages append correctly (not overwrite)
  // =========================================================================
  describe('multiple messages append correctly', () => {
    it('should append three sequential messages without overwriting earlier ones', async () => {
      createTeam(makeTeamConfig())

      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'first' }))
      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'second' }))
      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'third' }))

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(3)
      expect((inbox[0] as TeamMessage).text).toBe('first')
      expect((inbox[1] as TeamMessage).text).toBe('second')
      expect((inbox[2] as TeamMessage).text).toBe('third')
    })

    it('should preserve messages from different senders', async () => {
      createTeam(makeTeamConfig())

      await sendMessage('msg-team', 'developer', makeDirectMessage({ from: 'team-lead', text: 'from lead' }))
      await sendMessage('msg-team', 'developer', makeDirectMessage({ from: 'tester', text: 'from tester' }))

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(2)
      expect((inbox[0] as TeamMessage).from).toBe('team-lead')
      expect((inbox[1] as TeamMessage).from).toBe('tester')
    })

    it('should preserve mixed message types in order', async () => {
      createTeam(makeTeamConfig())

      const dm = makeDirectMessage({ text: 'direct msg' })
      const bc = makeBroadcast({ text: 'broadcast msg' })
      const idle: IdleNotification = {
        type: 'idle_notification',
        from: 'developer',
        timestamp: new Date().toISOString(),
      }

      await sendMessage('msg-team', 'team-lead', dm)
      await sendMessage('msg-team', 'team-lead', bc)
      await sendMessage('msg-team', 'team-lead', idle)

      const inbox = readInbox('msg-team', 'team-lead')
      expect(inbox).toHaveLength(3)
      expect(inbox[0]!.type).toBe('message')
      expect(inbox[1]!.type).toBe('broadcast')
      expect(inbox[2]!.type).toBe('idle_notification')
    })
  })

  // =========================================================================
  // 3. readInbox returns all messages in order
  // =========================================================================
  describe('readInbox returns all messages in order', () => {
    it('should return an empty array for a non-existent inbox', () => {
      const inbox = readInbox('msg-team', 'ghost-agent')
      expect(inbox).toEqual([])
    })

    it('should return messages in insertion order', async () => {
      createTeam(makeTeamConfig())

      for (let i = 1; i <= 5; i++) {
        await sendMessage('msg-team', 'developer', makeDirectMessage({ text: `message-${i}` }))
      }

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(5)
      for (let i = 0; i < 5; i++) {
        expect((inbox[i] as TeamMessage).text).toBe(`message-${i + 1}`)
      }
    })

    it('should not mutate the inbox file when reading', async () => {
      createTeam(makeTeamConfig())
      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'persistent' }))

      // Read twice -- both should return the same result
      const first = readInbox('msg-team', 'developer')
      const second = readInbox('msg-team', 'developer')
      expect(first).toEqual(second)
      expect(first).toHaveLength(1)
    })
  })

  // =========================================================================
  // 4. clearInbox empties the inbox
  // =========================================================================
  describe('clearInbox empties the inbox', () => {
    it('should remove all messages from an agent inbox', async () => {
      createTeam(makeTeamConfig())
      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'msg1' }))
      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'msg2' }))
      expect(readInbox('msg-team', 'developer')).toHaveLength(2)

      clearInbox('msg-team', 'developer')

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toEqual([])
    })

    it('should leave other agent inboxes untouched', async () => {
      createTeam(makeTeamConfig())
      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'dev msg' }))
      await sendMessage('msg-team', 'tester', makeDirectMessage({ to: 'tester', text: 'tester msg' }))

      clearInbox('msg-team', 'developer')

      expect(readInbox('msg-team', 'developer')).toEqual([])
      expect(readInbox('msg-team', 'tester')).toHaveLength(1)
    })

    it('should be a no-op when inbox does not exist', () => {
      expect(() => clearInbox('msg-team', 'nonexistent-agent')).not.toThrow()
    })

    it('should allow new messages after clearing', async () => {
      createTeam(makeTeamConfig())
      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'before-clear' }))
      clearInbox('msg-team', 'developer')

      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'after-clear' }))

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(1)
      expect((inbox[0] as TeamMessage).text).toBe('after-clear')
    })
  })

  // =========================================================================
  // 5. Broadcasting sends to all members except sender
  // =========================================================================
  describe('broadcasting sends to all members except sender', () => {
    it('should deliver a broadcast to every member except the sender', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const broadcast = makeBroadcast({ from: 'team-lead' })

      // Simulate what the system does for a broadcast: send to all members except sender
      const recipients = config.members
        .filter((m) => m.name !== 'team-lead')
        .map((m) => m.name)

      for (const recipient of recipients) {
        await sendMessage('msg-team', recipient, broadcast)
      }

      // Sender should have an empty inbox
      const senderInbox = readInbox('msg-team', 'team-lead')
      expect(senderInbox).toEqual([])

      // All other members should have received the broadcast
      for (const recipient of recipients) {
        const inbox = readInbox('msg-team', recipient)
        expect(inbox).toHaveLength(1)
        expect(inbox[0]!.type).toBe('broadcast')
        expect((inbox[0] as BroadcastMessage).text).toBe('Attention everyone')
      }
    })

    it('should handle broadcast to a single-member team (no recipients)', () => {
      const config = makeTeamConfig({
        members: [
          {
            agentId: 'solo-001',
            name: 'solo-agent',
            role: 'coordinator',
            agentType: 'coordinator',
            model: 'test-model',
            joinedAt: Date.now(),
            status: 'active',
            cwd: '/tmp',
          },
        ],
      })
      createTeam(config)

      const broadcast = makeBroadcast({ from: 'solo-agent' })

      // No one else to send to
      const recipients = config.members.filter((m) => m.name !== 'solo-agent')
      expect(recipients).toHaveLength(0)

      const inbox = readInbox('msg-team', 'solo-agent')
      expect(inbox).toEqual([])
    })

    it('should deliver the same content to all broadcast recipients', async () => {
      createTeam(makeTeamConfig())

      const broadcast = makeBroadcast({
        from: 'team-lead',
        text: 'Sprint retrospective at 3pm',
        summary: 'Retro reminder',
      })

      const otherMembers = ['developer', 'developer-2', 'tester']
      for (const member of otherMembers) {
        await sendMessage('msg-team', member, broadcast)
      }

      for (const member of otherMembers) {
        const inbox = readInbox('msg-team', member)
        expect(inbox).toHaveLength(1)
        const msg = inbox[0] as BroadcastMessage
        expect(msg.text).toBe('Sprint retrospective at 3pm')
        expect(msg.summary).toBe('Retro reminder')
        expect(msg.from).toBe('team-lead')
      }
    })
  })

  // =========================================================================
  // 6. Shutdown request/response flow
  // =========================================================================
  describe('shutdown request/response flow', () => {
    it('should deliver a shutdown request to the target agent', async () => {
      createTeam(makeTeamConfig())

      const req: ShutdownRequest = {
        type: 'shutdown_request',
        requestId: 'shutdown-001',
        from: 'team-lead',
        reason: 'Task complete, wrapping up',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'developer', req)

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(1)
      expect(inbox[0]!.type).toBe('shutdown_request')
      const received = inbox[0] as ShutdownRequest
      expect(received.requestId).toBe('shutdown-001')
      expect(received.from).toBe('team-lead')
      expect(received.reason).toBe('Task complete, wrapping up')
    })

    it('should deliver a shutdown approval response back to the requester', async () => {
      createTeam(makeTeamConfig())

      const approval: ShutdownApproved = {
        type: 'shutdown_approved',
        requestId: 'shutdown-001',
        from: 'developer',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'team-lead', approval)

      const inbox = readInbox('msg-team', 'team-lead')
      expect(inbox).toHaveLength(1)
      expect(inbox[0]!.type).toBe('shutdown_approved')
      const received = inbox[0] as ShutdownApproved
      expect(received.requestId).toBe('shutdown-001')
      expect(received.from).toBe('developer')
    })

    it('should deliver a shutdown rejection response back to the requester', async () => {
      createTeam(makeTeamConfig())

      const rejection: ShutdownRejected = {
        type: 'shutdown_rejected',
        requestId: 'shutdown-001',
        from: 'developer',
        reason: 'Still working on task #3',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'team-lead', rejection)

      const inbox = readInbox('msg-team', 'team-lead')
      expect(inbox).toHaveLength(1)
      expect(inbox[0]!.type).toBe('shutdown_rejected')
      const received = inbox[0] as ShutdownRejected
      expect(received.requestId).toBe('shutdown-001')
      expect(received.reason).toBe('Still working on task #3')
    })

    it('should handle full shutdown request -> approved round trip', async () => {
      createTeam(makeTeamConfig())

      // Lead sends shutdown request to developer
      const req: ShutdownRequest = {
        type: 'shutdown_request',
        requestId: 'sd-round-trip',
        from: 'team-lead',
        reason: 'Session ending',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'developer', req)

      // Developer reads the request
      const devInbox = readInbox('msg-team', 'developer')
      expect(devInbox).toHaveLength(1)
      expect(devInbox[0]!.type).toBe('shutdown_request')

      // Developer sends back approval
      const approval: ShutdownApproved = {
        type: 'shutdown_approved',
        requestId: 'sd-round-trip',
        from: 'developer',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'team-lead', approval)

      // Lead reads the approval
      const leadInbox = readInbox('msg-team', 'team-lead')
      expect(leadInbox).toHaveLength(1)
      expect(leadInbox[0]!.type).toBe('shutdown_approved')
      expect((leadInbox[0] as ShutdownApproved).requestId).toBe('sd-round-trip')
    })

    it('should handle full shutdown request -> rejected round trip', async () => {
      createTeam(makeTeamConfig())

      const req: ShutdownRequest = {
        type: 'shutdown_request',
        requestId: 'sd-reject-trip',
        from: 'team-lead',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'developer', req)

      const rejection: ShutdownRejected = {
        type: 'shutdown_rejected',
        requestId: 'sd-reject-trip',
        from: 'developer',
        reason: 'Need 5 more minutes',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'team-lead', rejection)

      const leadInbox = readInbox('msg-team', 'team-lead')
      expect(leadInbox).toHaveLength(1)
      expect(leadInbox[0]!.type).toBe('shutdown_rejected')
      expect((leadInbox[0] as ShutdownRejected).reason).toBe('Need 5 more minutes')
    })
  })

  // =========================================================================
  // 7. Plan approval request/response flow
  // =========================================================================
  describe('plan approval request/response flow', () => {
    it('should deliver a plan approval request to the lead', async () => {
      createTeam(makeTeamConfig())

      const req: PlanApprovalRequest = {
        type: 'plan_approval_request',
        requestId: 'plan-001',
        from: 'developer',
        planContent: '## Plan\n1. Refactor auth module\n2. Add tests\n3. Deploy',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'team-lead', req)

      const inbox = readInbox('msg-team', 'team-lead')
      expect(inbox).toHaveLength(1)
      expect(inbox[0]!.type).toBe('plan_approval_request')
      const received = inbox[0] as PlanApprovalRequest
      expect(received.requestId).toBe('plan-001')
      expect(received.from).toBe('developer')
      expect(received.planContent).toContain('Refactor auth module')
    })

    it('should deliver an approval response back to the requester', async () => {
      createTeam(makeTeamConfig())

      const resp: PlanApprovalResponse = {
        type: 'plan_approval_response',
        requestId: 'plan-001',
        approved: true,
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'developer', resp)

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(1)
      const received = inbox[0] as PlanApprovalResponse
      expect(received.approved).toBe(true)
      expect(received.requestId).toBe('plan-001')
    })

    it('should deliver a rejection with feedback', async () => {
      createTeam(makeTeamConfig())

      const resp: PlanApprovalResponse = {
        type: 'plan_approval_response',
        requestId: 'plan-002',
        approved: false,
        feedback: 'Please add error handling for the API calls',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'developer', resp)

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(1)
      const received = inbox[0] as PlanApprovalResponse
      expect(received.approved).toBe(false)
      expect(received.feedback).toBe('Please add error handling for the API calls')
    })

    it('should handle full plan request -> approved round trip', async () => {
      createTeam(makeTeamConfig())

      // Developer submits plan
      const req: PlanApprovalRequest = {
        type: 'plan_approval_request',
        requestId: 'plan-rt-001',
        from: 'developer',
        planContent: 'Step 1: Read code. Step 2: Write code.',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'team-lead', req)

      // Lead reads it
      const leadInbox = readInbox('msg-team', 'team-lead')
      expect(leadInbox).toHaveLength(1)
      expect((leadInbox[0] as PlanApprovalRequest).planContent).toContain('Read code')

      // Lead approves
      const approval: PlanApprovalResponse = {
        type: 'plan_approval_response',
        requestId: 'plan-rt-001',
        approved: true,
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'developer', approval)

      // Developer reads approval
      const devInbox = readInbox('msg-team', 'developer')
      expect(devInbox).toHaveLength(1)
      expect((devInbox[0] as PlanApprovalResponse).approved).toBe(true)
    })

    it('should handle full plan request -> rejected with feedback round trip', async () => {
      createTeam(makeTeamConfig())

      const req: PlanApprovalRequest = {
        type: 'plan_approval_request',
        requestId: 'plan-rt-002',
        from: 'developer-2',
        planContent: 'I will just yolo deploy.',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'team-lead', req)

      const rejection: PlanApprovalResponse = {
        type: 'plan_approval_response',
        requestId: 'plan-rt-002',
        approved: false,
        feedback: 'Please add a testing step before deploy',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'developer-2', rejection)

      const dev2Inbox = readInbox('msg-team', 'developer-2')
      expect(dev2Inbox).toHaveLength(1)
      expect((dev2Inbox[0] as PlanApprovalResponse).approved).toBe(false)
      expect((dev2Inbox[0] as PlanApprovalResponse).feedback).toBe(
        'Please add a testing step before deploy',
      )
    })
  })

  // =========================================================================
  // 8. Message formatting (message-formatter.ts)
  // =========================================================================
  describe('message formatting', () => {
    let formatTeamMessage: (msg: TeamProtocolMessage) => string
    let formatInboxMessages: (msgs: TeamProtocolMessage[]) => string | null

    beforeEach(async () => {
      try {
        const mod = await import(
          '../../../../packages/agent-runtime/src/message-formatter'
        )
        formatTeamMessage = mod.formatTeamMessage
        formatInboxMessages = mod.formatInboxMessages
      } catch {
        // Fallback stubs if cross-package import fails
        formatTeamMessage = () => ''
        formatInboxMessages = () => null
      }
    })

    it('should format a direct message with XML tags', () => {
      const msg = makeDirectMessage({ from: 'alice', to: 'bob', text: 'Hi Bob' })
      const out = formatTeamMessage(msg)
      expect(out).toContain('<teammate-message')
      expect(out).toContain('from="alice"')
      expect(out).toContain('to="bob"')
      expect(out).toContain('Hi Bob')
      expect(out).toContain('</teammate-message>')
    })

    it('should format a broadcast message with XML tags', () => {
      const msg = makeBroadcast({ from: 'alice', text: 'Hello all' })
      const out = formatTeamMessage(msg)
      expect(out).toContain('<teammate-broadcast')
      expect(out).toContain('from="alice"')
      expect(out).toContain('Hello all')
      expect(out).toContain('</teammate-broadcast>')
    })

    it('should include summary when present', () => {
      const msg = makeDirectMessage({ summary: 'Quick update' })
      const out = formatTeamMessage(msg)
      expect(out).toContain('Summary: Quick update')
    })

    it('should format a shutdown request with instructions', () => {
      const req: ShutdownRequest = {
        type: 'shutdown_request',
        requestId: 'sd-fmt',
        from: 'lead',
        reason: 'Session ending',
        timestamp: new Date().toISOString(),
      }
      const out = formatTeamMessage(req)
      expect(out).toContain('<shutdown-request')
      expect(out).toContain('requestId="sd-fmt"')
      expect(out).toContain('Reason: Session ending')
      expect(out).toContain('shutdown_response')
      expect(out).toContain('</shutdown-request>')
    })

    it('should format a shutdown approval', () => {
      const msg: ShutdownApproved = {
        type: 'shutdown_approved',
        requestId: 'sd-appr',
        from: 'dev',
        timestamp: new Date().toISOString(),
      }
      const out = formatTeamMessage(msg)
      expect(out).toContain('<shutdown-approved')
      expect(out).toContain('was approved')
      expect(out).toContain('</shutdown-approved>')
    })

    it('should format a shutdown rejection', () => {
      const msg: ShutdownRejected = {
        type: 'shutdown_rejected',
        requestId: 'sd-rej',
        from: 'dev',
        reason: 'Busy',
        timestamp: new Date().toISOString(),
      }
      const out = formatTeamMessage(msg)
      expect(out).toContain('<shutdown-rejected')
      expect(out).toContain('was rejected')
      expect(out).toContain('Reason: Busy')
      expect(out).toContain('</shutdown-rejected>')
    })

    it('should format a plan approval request', () => {
      const msg: PlanApprovalRequest = {
        type: 'plan_approval_request',
        requestId: 'plan-fmt',
        from: 'dev',
        planContent: 'Step 1\nStep 2',
        timestamp: new Date().toISOString(),
      }
      const out = formatTeamMessage(msg)
      expect(out).toContain('<plan-approval-request')
      expect(out).toContain('Step 1')
      expect(out).toContain('Step 2')
      expect(out).toContain('plan_approval_response')
      expect(out).toContain('</plan-approval-request>')
    })

    it('should format a plan approval response (approved)', () => {
      const msg: PlanApprovalResponse = {
        type: 'plan_approval_response',
        requestId: 'plan-appr',
        approved: true,
        timestamp: new Date().toISOString(),
      }
      const out = formatTeamMessage(msg)
      expect(out).toContain('<plan-approval-response')
      expect(out).toContain('approved')
      expect(out).toContain('proceed with implementation')
      expect(out).toContain('</plan-approval-response>')
    })

    it('should format a plan approval response (rejected with feedback)', () => {
      const msg: PlanApprovalResponse = {
        type: 'plan_approval_response',
        requestId: 'plan-rej',
        approved: false,
        feedback: 'Add error handling',
        timestamp: new Date().toISOString(),
      }
      const out = formatTeamMessage(msg)
      expect(out).toContain('<plan-approval-response')
      expect(out).toContain('rejected')
      expect(out).toContain('Feedback: Add error handling')
    })

    it('should format a task_completed message', () => {
      const msg: TaskCompletedMessage = {
        type: 'task_completed',
        from: 'dev',
        taskId: 'task-99',
        taskSubject: 'Build API',
        timestamp: new Date().toISOString(),
      }
      const out = formatTeamMessage(msg)
      expect(out).toContain('<task-completed')
      expect(out).toContain('Build API')
      expect(out).toContain('task-99')
      expect(out).toContain('</task-completed>')
    })

    it('should format an idle notification', () => {
      const msg: IdleNotification = {
        type: 'idle_notification',
        from: 'dev',
        timestamp: new Date().toISOString(),
        summary: 'Done with tests',
        completedTaskId: 'task-50',
      }
      const out = formatTeamMessage(msg)
      expect(out).toContain('<idle-notification')
      expect(out).toContain('idle and available')
      expect(out).toContain('Summary: Done with tests')
      expect(out).toContain('Completed task ID: task-50')
      expect(out).toContain('</idle-notification>')
    })

    it('formatInboxMessages should return null for empty array', () => {
      const result = formatInboxMessages([])
      expect(result).toBeNull()
    })

    it('formatInboxMessages should wrap multiple messages in a container tag', () => {
      const messages: TeamProtocolMessage[] = [
        makeDirectMessage({ text: 'Hello' }),
        makeBroadcast({ text: 'World' }),
      ]
      const result = formatInboxMessages(messages)
      expect(result).not.toBeNull()
      expect(result!).toContain('<teammate-messages>')
      expect(result!).toContain('</teammate-messages>')
      expect(result!).toContain('2 new messages')
      expect(result!).toContain('Hello')
      expect(result!).toContain('World')
    })

    it('formatInboxMessages should use singular form for one message', () => {
      const messages: TeamProtocolMessage[] = [makeDirectMessage({ text: 'Only one' })]
      const result = formatInboxMessages(messages)
      expect(result).not.toBeNull()
      expect(result!).toContain('1 new message')
      expect(result!).not.toContain('1 new messages')
    })
  })

  // =========================================================================
  // 9. Inbox isolation between agents
  // =========================================================================
  describe('inbox isolation between agents', () => {
    it('agent A cannot see agent B messages and vice versa', async () => {
      createTeam(makeTeamConfig())

      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'dev-only' }))
      await sendMessage('msg-team', 'tester', makeDirectMessage({ to: 'tester', text: 'tester-only' }))

      const devInbox = readInbox('msg-team', 'developer')
      const testerInbox = readInbox('msg-team', 'tester')

      expect(devInbox).toHaveLength(1)
      expect((devInbox[0] as TeamMessage).text).toBe('dev-only')

      expect(testerInbox).toHaveLength(1)
      expect((testerInbox[0] as TeamMessage).text).toBe('tester-only')
    })

    it('clearing one inbox does not affect another', async () => {
      createTeam(makeTeamConfig())

      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'dev msg' }))
      await sendMessage('msg-team', 'tester', makeDirectMessage({ to: 'tester', text: 'tester msg' }))
      await sendMessage('msg-team', 'developer-2', makeDirectMessage({ to: 'developer-2', text: 'dev2 msg' }))

      clearInbox('msg-team', 'developer')

      expect(readInbox('msg-team', 'developer')).toEqual([])
      expect(readInbox('msg-team', 'tester')).toHaveLength(1)
      expect(readInbox('msg-team', 'developer-2')).toHaveLength(1)
    })

    it('inboxes across different teams are isolated', async () => {
      const team1 = makeTeamConfig({ name: 'team-alpha' })
      const team2 = makeTeamConfig({ name: 'team-beta' })
      createTeam(team1)
      createTeam(team2)

      await sendMessage('team-alpha', 'developer', makeDirectMessage({ text: 'alpha msg' }))
      await sendMessage('team-beta', 'developer', makeDirectMessage({ text: 'beta msg' }))

      const alphaInbox = readInbox('team-alpha', 'developer')
      const betaInbox = readInbox('team-beta', 'developer')

      expect(alphaInbox).toHaveLength(1)
      expect((alphaInbox[0] as TeamMessage).text).toBe('alpha msg')
      expect(betaInbox).toHaveLength(1)
      expect((betaInbox[0] as TeamMessage).text).toBe('beta msg')
    })

    it('each agent has a separate inbox file on disk', async () => {
      createTeam(makeTeamConfig())

      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'a' }))
      await sendMessage('msg-team', 'tester', makeDirectMessage({ to: 'tester', text: 'b' }))

      const inboxDir = path.join(getTeamsDir(), 'msg-team', 'inboxes')
      const files = fs.readdirSync(inboxDir).sort()

      expect(files).toContain('developer.json')
      expect(files).toContain('tester.json')

      // Verify file contents are independent
      const devContent = JSON.parse(fs.readFileSync(path.join(inboxDir, 'developer.json'), 'utf-8'))
      const testerContent = JSON.parse(fs.readFileSync(path.join(inboxDir, 'tester.json'), 'utf-8'))
      expect(devContent).toHaveLength(1)
      expect(testerContent).toHaveLength(1)
      expect(devContent[0].text).toBe('a')
      expect(testerContent[0].text).toBe('b')
    })
  })

  // =========================================================================
  // 10. Large message handling
  // =========================================================================
  describe('large message handling', () => {
    it('should handle a message with a very long text string (10KB)', async () => {
      createTeam(makeTeamConfig())

      const longText = 'x'.repeat(10_000)
      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: longText }))

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(1)
      expect((inbox[0] as TeamMessage).text).toBe(longText)
      expect((inbox[0] as TeamMessage).text.length).toBe(10_000)
    })

    it('should handle a message with a very long text string (100KB)', async () => {
      createTeam(makeTeamConfig())

      const longText = 'A'.repeat(100_000)
      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: longText }))

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(1)
      expect((inbox[0] as TeamMessage).text.length).toBe(100_000)
    })

    it('should handle a message with unicode and special characters', async () => {
      createTeam(makeTeamConfig())

      const specialText = 'Hello \u{1F600} \u{1F680} \u{2764}\nNew line\t\tTabs\n"quotes" & <xml> \\ backslash'
      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: specialText }))

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(1)
      expect((inbox[0] as TeamMessage).text).toBe(specialText)
    })

    it('should handle many messages in a single inbox (100 messages)', async () => {
      createTeam(makeTeamConfig())

      for (let i = 0; i < 100; i++) {
        await sendMessage('msg-team', 'developer', makeDirectMessage({ text: `message-${i}` }))
      }

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(100)

      // Verify ordering
      expect((inbox[0] as TeamMessage).text).toBe('message-0')
      expect((inbox[49] as TeamMessage).text).toBe('message-49')
      expect((inbox[99] as TeamMessage).text).toBe('message-99')
    })

    it('should handle a plan approval request with very long plan content', async () => {
      createTeam(makeTeamConfig())

      const longPlan = Array.from({ length: 500 }, (_, i) => `Step ${i + 1}: Do thing ${i + 1}`).join('\n')
      const req: PlanApprovalRequest = {
        type: 'plan_approval_request',
        requestId: 'long-plan-001',
        from: 'developer',
        planContent: longPlan,
        timestamp: new Date().toISOString(),
      }
      await sendMessage('msg-team', 'team-lead', req)

      const inbox = readInbox('msg-team', 'team-lead')
      expect(inbox).toHaveLength(1)
      const received = inbox[0] as PlanApprovalRequest
      expect(received.planContent).toBe(longPlan)
      expect(received.planContent.split('\n')).toHaveLength(500)
    })

    it('should handle an empty text message', async () => {
      createTeam(makeTeamConfig())

      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: '' }))

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(1)
      expect((inbox[0] as TeamMessage).text).toBe('')
    })
  })

  // =========================================================================
  // 11. Concurrent writes don't lose messages
  // =========================================================================
  describe('concurrent writes don\'t lose messages', () => {
    it('should not lose messages when sending rapidly in sequence', async () => {
      createTeam(makeTeamConfig())

      const total = 50
      for (let i = 0; i < total; i++) {
        await sendMessage('msg-team', 'developer', makeDirectMessage({ text: `rapid-${i}` }))
      }

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(total)
      for (let i = 0; i < total; i++) {
        expect((inbox[i] as TeamMessage).text).toBe(`rapid-${i}`)
      }
    })

    it('should not lose messages when multiple senders write to the same inbox sequentially', async () => {
      createTeam(makeTeamConfig())

      const senders = ['team-lead', 'developer-2', 'tester']
      const msgsPerSender = 10

      for (const sender of senders) {
        for (let i = 0; i < msgsPerSender; i++) {
          await sendMessage(
            'msg-team',
            'developer',
            makeDirectMessage({ from: sender, text: `${sender}-msg-${i}` }),
          )
        }
      }

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(senders.length * msgsPerSender)

      // Verify all messages from all senders are present
      for (const sender of senders) {
        const senderMsgs = inbox.filter(
          (m) => m.type === 'message' && (m as TeamMessage).from === sender,
        )
        expect(senderMsgs).toHaveLength(msgsPerSender)
      }
    })

    it('should handle interleaved send and read operations', async () => {
      createTeam(makeTeamConfig())

      // Send some messages
      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'batch-1-msg-1' }))
      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'batch-1-msg-2' }))

      // Read (should not consume)
      const afterBatch1 = readInbox('msg-team', 'developer')
      expect(afterBatch1).toHaveLength(2)

      // Send more messages
      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'batch-2-msg-1' }))

      // Read again -- should now see 3
      const afterBatch2 = readInbox('msg-team', 'developer')
      expect(afterBatch2).toHaveLength(3)

      // Clear and send new messages
      clearInbox('msg-team', 'developer')
      await sendMessage('msg-team', 'developer', makeDirectMessage({ text: 'batch-3-msg-1' }))

      const afterClear = readInbox('msg-team', 'developer')
      expect(afterClear).toHaveLength(1)
      expect((afterClear[0] as TeamMessage).text).toBe('batch-3-msg-1')
    })

    it('should handle parallel writes to different inboxes without cross-contamination', async () => {
      createTeam(makeTeamConfig())

      const agents = ['developer', 'developer-2', 'tester', 'team-lead']
      const msgsPerAgent = 20

      // Write to all agents (simulating parallel by interleaving)
      for (let i = 0; i < msgsPerAgent; i++) {
        for (const agent of agents) {
          await sendMessage(
            'msg-team',
            agent,
            makeDirectMessage({ to: agent, text: `${agent}-${i}` }),
          )
        }
      }

      // Each agent should have exactly their own messages
      for (const agent of agents) {
        const inbox = readInbox('msg-team', agent)
        expect(inbox).toHaveLength(msgsPerAgent)
        for (let i = 0; i < msgsPerAgent; i++) {
          expect((inbox[i] as TeamMessage).text).toBe(`${agent}-${i}`)
        }
      }
    })

    it('should not lose messages with truly concurrent writes via Promise.all', async () => {
      createTeam(makeTeamConfig())

      const concurrentCount = 20
      const promises = Array.from({ length: concurrentCount }, (_, i) =>
        sendMessage('msg-team', 'developer', makeDirectMessage({ text: `concurrent-${i}` })),
      )

      await Promise.all(promises)

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(concurrentCount)

      // All messages should be present (order may vary due to concurrency)
      const texts = inbox.map((m) => (m as TeamMessage).text).sort()
      const expected = Array.from({ length: concurrentCount }, (_, i) => `concurrent-${i}`).sort()
      expect(texts).toEqual(expected)
    })
  })

  // =========================================================================
  // Additional edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('should handle agent names with special characters', async () => {
      createTeam(makeTeamConfig())

      await sendMessage('msg-team', 'agent-with-dashes', makeDirectMessage({ text: 'dashes' }))
      await sendMessage('msg-team', 'agent_with_underscores', makeDirectMessage({ text: 'underscores' }))

      expect(readInbox('msg-team', 'agent-with-dashes')).toHaveLength(1)
      expect(readInbox('msg-team', 'agent_with_underscores')).toHaveLength(1)
    })

    it('should handle sending all protocol message types to one inbox', async () => {
      createTeam(makeTeamConfig())

      const messages: TeamProtocolMessage[] = [
        makeDirectMessage(),
        makeBroadcast(),
        {
          type: 'shutdown_request',
          requestId: 'sr-1',
          from: 'lead',
          timestamp: new Date().toISOString(),
        },
        {
          type: 'shutdown_approved',
          requestId: 'sr-1',
          from: 'dev',
          timestamp: new Date().toISOString(),
        },
        {
          type: 'shutdown_rejected',
          requestId: 'sr-2',
          from: 'dev',
          reason: 'busy',
          timestamp: new Date().toISOString(),
        },
        {
          type: 'plan_approval_request',
          requestId: 'pa-1',
          from: 'dev',
          planContent: 'my plan',
          timestamp: new Date().toISOString(),
        },
        {
          type: 'plan_approval_response',
          requestId: 'pa-1',
          approved: true,
          timestamp: new Date().toISOString(),
        },
        {
          type: 'task_completed',
          from: 'dev',
          taskId: 't-1',
          taskSubject: 'Done',
          timestamp: new Date().toISOString(),
        },
        {
          type: 'idle_notification',
          from: 'dev',
          timestamp: new Date().toISOString(),
        },
      ]

      for (const msg of messages) {
        await sendMessage('msg-team', 'developer', msg)
      }

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(9)

      // Verify each type is present
      const types = inbox.map((m) => m.type)
      expect(types).toContain('message')
      expect(types).toContain('broadcast')
      expect(types).toContain('shutdown_request')
      expect(types).toContain('shutdown_approved')
      expect(types).toContain('shutdown_rejected')
      expect(types).toContain('plan_approval_request')
      expect(types).toContain('plan_approval_response')
      expect(types).toContain('task_completed')
      expect(types).toContain('idle_notification')
    })

    it('should preserve timestamps exactly as provided', async () => {
      createTeam(makeTeamConfig())

      const timestamp = '2024-06-15T12:30:45.123Z'
      await sendMessage('msg-team', 'developer', makeDirectMessage({ timestamp }))

      const inbox = readInbox('msg-team', 'developer')
      expect(inbox).toHaveLength(1)
      expect(inbox[0]!.timestamp).toBe(timestamp)
    })

    it('should handle reading from a team with no inboxes directory', () => {
      // readInbox should return [] gracefully when the inbox dir does not exist
      const inbox = readInbox('totally-nonexistent-team', 'any-agent')
      expect(inbox).toEqual([])
    })
  })
})
