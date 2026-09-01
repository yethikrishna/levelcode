import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { MAX_AGENT_STEPS_DEFAULT } from '@levelcode/common/constants/agents'

import { createAgentState } from '../tools/handlers/tool/spawn-agent-utils'

import type { AgentTemplate } from '@levelcode/common/types/agent-template'
import type { AgentState } from '@levelcode/common/types/session-state'

function template(): AgentTemplate {
  return {
    id: 'test-agent',
    displayName: 'Test Agent',
    spawnerPrompt: 'Test spawner prompt',
    model: 'test-model',
    inputSchema: {},
    outputMode: 'last_message',
    includeMessageHistory: false,
    inheritParentSystemPrompt: false,
    mcpServers: {},
    toolNames: [],
    spawnableAgents: [],
    systemPrompt: '',
    instructionsPrompt: '',
    stepPrompt: '',
  } as unknown as AgentTemplate
}

function parent(stepsRemaining: number): AgentState {
  return {
    agentId: 'parent',
    agentType: 'main-agent',
    agentContext: {},
    ancestorRunIds: [],
    subagents: [],
    childRunIds: [],
    messageHistory: [],
    stepsRemaining,
    creditsUsed: 0,
    directCreditsUsed: 0,
    output: undefined,
    parentId: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: 0,
  }
}

describe('createAgentState — subagent step budget', () => {
  test('child never exceeds the standard budget', () => {
    const child = createAgentState('test-agent', template(), parent(400), {})
    expect(child.stepsRemaining).toBe(MAX_AGENT_STEPS_DEFAULT)
  })

  test('child is clamped to a low-budget parent (effort=low swarm bound)', () => {
    const child = createAgentState('test-agent', template(), parent(30), {})
    expect(child.stepsRemaining).toBe(30)
  })

  test('a nearly-depleted parent cannot spawn a runaway child', () => {
    const child = createAgentState('test-agent', template(), parent(3), {})
    expect(child.stepsRemaining).toBe(3)
  })

  test('missing parent budget falls back to the standard budget', () => {
    const state = parent(30)
    delete (state as { stepsRemaining?: number }).stepsRemaining
    const child = createAgentState('test-agent', template(), state, {})
    expect(child.stepsRemaining).toBe(MAX_AGENT_STEPS_DEFAULT)
  })

  test('schema validation still accepts the spawned state shape', () => {
    const child = createAgentState('test-agent', template(), parent(10), {})
    expect(z.number().int().positive().safeParse(child.stepsRemaining).success).toBe(
      true,
    )
  })
})
