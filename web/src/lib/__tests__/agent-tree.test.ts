import { describe, it, expect } from '@jest/globals'

import {
  buildAgentTree,
  generateMermaidDiagram,
  generateNodeDataMap,
  type AgentLookupResult,
  type AgentTreeData,
  type AgentTreeNode,
} from '../agent-tree'

describe('buildAgentTree', () => {
  const createMockLookup = (
    agents: Record<string, AgentLookupResult | null>,
  ) => {
    return async (
      publisher: string,
      agentId: string,
      version: string,
    ): Promise<AgentLookupResult | null> => {
      const key = `${publisher}/${agentId}@${version}`
      return agents[key] ?? null
    }
  }

  it('builds a tree with no spawnable agents', async () => {
    const tree = await buildAgentTree({
      rootPublisher: 'levelcode',
      rootAgentId: 'base',
      rootVersion: '1.0.0',
      rootDisplayName: 'Base Agent',
      rootSpawnerPrompt: 'A base agent',
      rootSpawnableAgents: [],
      lookupAgent: createMockLookup({}),
    })

    expect(tree.root.fullId).toBe('levelcode/base@1.0.0')
    expect(tree.root.displayName).toBe('Base Agent')
    expect(tree.root.children).toHaveLength(0)
    expect(tree.totalAgents).toBe(1)
    expect(tree.maxDepth).toBe(0)
    expect(tree.hasCycles).toBe(false)
  })

  it('builds a tree with single level of children', async () => {
    const mockAgents: Record<string, AgentLookupResult> = {
      'levelcode/file-picker@0.1.0': {
        displayName: 'File Picker',
        spawnerPrompt: 'Picks files',
        spawnableAgents: [],
        isAvailable: true,
      },
      'levelcode/code-searcher@0.2.0': {
        displayName: 'Code Searcher',
        spawnerPrompt: 'Searches code',
        spawnableAgents: [],
        isAvailable: true,
      },
    }

    const tree = await buildAgentTree({
      rootPublisher: 'levelcode',
      rootAgentId: 'orchestrator',
      rootVersion: '1.0.0',
      rootDisplayName: 'Orchestrator',
      rootSpawnerPrompt: null,
      rootSpawnableAgents: [
        'levelcode/file-picker@0.1.0',
        'levelcode/code-searcher@0.2.0',
      ],
      lookupAgent: createMockLookup(mockAgents),
    })

    expect(tree.root.children).toHaveLength(2)
    expect(tree.root.children[0].displayName).toBe('File Picker')
    expect(tree.root.children[1].displayName).toBe('Code Searcher')
    expect(tree.totalAgents).toBe(3)
    expect(tree.maxDepth).toBe(1)
    expect(tree.hasCycles).toBe(false)
  })

  it('builds a nested tree with multiple levels', async () => {
    const mockAgents: Record<string, AgentLookupResult> = {
      'levelcode/level1@1.0.0': {
        displayName: 'Level 1',
        spawnerPrompt: null,
        spawnableAgents: ['levelcode/level2@1.0.0'],
        isAvailable: true,
      },
      'levelcode/level2@1.0.0': {
        displayName: 'Level 2',
        spawnerPrompt: null,
        spawnableAgents: ['levelcode/level3@1.0.0'],
        isAvailable: true,
      },
      'levelcode/level3@1.0.0': {
        displayName: 'Level 3',
        spawnerPrompt: null,
        spawnableAgents: [],
        isAvailable: true,
      },
    }

    const tree = await buildAgentTree({
      rootPublisher: 'levelcode',
      rootAgentId: 'root',
      rootVersion: '1.0.0',
      rootDisplayName: 'Root',
      rootSpawnerPrompt: null,
      rootSpawnableAgents: ['levelcode/level1@1.0.0'],
      lookupAgent: createMockLookup(mockAgents),
    })

    expect(tree.root.children).toHaveLength(1)
    expect(tree.root.children[0].children).toHaveLength(1)
    expect(tree.root.children[0].children[0].children).toHaveLength(1)
    expect(tree.root.children[0].children[0].children[0].displayName).toBe(
      'Level 3',
    )
    expect(tree.totalAgents).toBe(4)
    expect(tree.maxDepth).toBe(3)
  })

  it('detects cycles and marks cyclic nodes', async () => {
    const mockAgents: Record<string, AgentLookupResult> = {
      'levelcode/agent-a@1.0.0': {
        displayName: 'Agent A',
        spawnerPrompt: null,
        spawnableAgents: ['levelcode/agent-b@1.0.0'],
        isAvailable: true,
      },
      'levelcode/agent-b@1.0.0': {
        displayName: 'Agent B',
        spawnerPrompt: null,
        // This creates a cycle back to the root
        spawnableAgents: ['levelcode/root@1.0.0'],
        isAvailable: true,
      },
    }

    const tree = await buildAgentTree({
      rootPublisher: 'levelcode',
      rootAgentId: 'root',
      rootVersion: '1.0.0',
      rootDisplayName: 'Root',
      rootSpawnerPrompt: null,
      rootSpawnableAgents: ['levelcode/agent-a@1.0.0'],
      lookupAgent: createMockLookup(mockAgents),
    })

    expect(tree.hasCycles).toBe(true)
    // The cyclic reference to root should be marked as cyclic
    const cyclicNode = tree.root.children[0].children[0].children[0]
    expect(cyclicNode.isCyclic).toBe(true)
    expect(cyclicNode.fullId).toBe('levelcode/root@1.0.0')
  })

  it('respects maxDepth limit', async () => {
    const mockAgents: Record<string, AgentLookupResult> = {
      'levelcode/deep1@1.0.0': {
        displayName: 'Deep 1',
        spawnerPrompt: null,
        spawnableAgents: ['levelcode/deep2@1.0.0'],
        isAvailable: true,
      },
      'levelcode/deep2@1.0.0': {
        displayName: 'Deep 2',
        spawnerPrompt: null,
        spawnableAgents: ['levelcode/deep3@1.0.0'],
        isAvailable: true,
      },
      'levelcode/deep3@1.0.0': {
        displayName: 'Deep 3',
        spawnerPrompt: null,
        spawnableAgents: [],
        isAvailable: true,
      },
    }

    const tree = await buildAgentTree({
      rootPublisher: 'levelcode',
      rootAgentId: 'root',
      rootVersion: '1.0.0',
      rootDisplayName: 'Root',
      rootSpawnerPrompt: null,
      rootSpawnableAgents: ['levelcode/deep1@1.0.0'],
      lookupAgent: createMockLookup(mockAgents),
      maxDepth: 2,
    })

    // With maxDepth 2, we should only have root -> deep1 -> deep2
    // deep2's children should not be fetched
    expect(tree.root.children[0].displayName).toBe('Deep 1')
    expect(tree.root.children[0].children[0].displayName).toBe('Deep 2')
    expect(tree.root.children[0].children[0].children).toHaveLength(0)
    expect(tree.maxDepth).toBe(2)
  })

  it('handles unavailable agents', async () => {
    const mockAgents: Record<string, AgentLookupResult | null> = {
      'levelcode/available@1.0.0': {
        displayName: 'Available',
        spawnerPrompt: null,
        spawnableAgents: [],
        isAvailable: true,
      },
      'levelcode/missing@1.0.0': null, // Not found
    }

    const tree = await buildAgentTree({
      rootPublisher: 'levelcode',
      rootAgentId: 'root',
      rootVersion: '1.0.0',
      rootDisplayName: 'Root',
      rootSpawnerPrompt: null,
      rootSpawnableAgents: [
        'levelcode/available@1.0.0',
        'levelcode/missing@1.0.0',
      ],
      lookupAgent: createMockLookup(mockAgents),
    })

    expect(tree.root.children).toHaveLength(2)
    expect(tree.root.children[0].isAvailable).toBe(true)
    expect(tree.root.children[1].isAvailable).toBe(false)
    expect(tree.root.children[1].displayName).toBe('missing') // Falls back to agentId
  })

  it('parses various agent ID formats', async () => {
    const mockAgents: Record<string, AgentLookupResult> = {
      'levelcode/with-version@2.0.0': {
        displayName: 'With Version',
        spawnerPrompt: null,
        spawnableAgents: [],
        isAvailable: true,
      },
      'other-pub/cross-publisher@1.0.0': {
        displayName: 'Cross Publisher',
        spawnerPrompt: null,
        spawnableAgents: [],
        isAvailable: true,
      },
    }

    const tree = await buildAgentTree({
      rootPublisher: 'levelcode',
      rootAgentId: 'root',
      rootVersion: '1.0.0',
      rootDisplayName: 'Root',
      rootSpawnerPrompt: null,
      rootSpawnableAgents: [
        'levelcode/with-version@2.0.0',
        'other-pub/cross-publisher@1.0.0',
      ],
      lookupAgent: createMockLookup(mockAgents),
    })

    expect(tree.root.children).toHaveLength(2)
    expect(tree.root.children[0].publisher).toBe('levelcode')
    expect(tree.root.children[0].version).toBe('2.0.0')
    expect(tree.root.children[1].publisher).toBe('other-pub')
    expect(tree.root.children[1].version).toBe('1.0.0')
  })
})

describe('generateMermaidDiagram', () => {
  const createSimpleTree = (
    overrides: Partial<AgentTreeNode> = {},
  ): AgentTreeData => ({
    root: {
      fullId: 'levelcode/root@1.0.0',
      agentId: 'root',
      publisher: 'levelcode',
      version: '1.0.0',
      displayName: 'Root Agent',
      spawnerPrompt: null,
      isAvailable: true,
      children: [],
      isCyclic: false,
      ...overrides,
    },
    totalAgents: 1,
    maxDepth: 0,
    hasCycles: false,
  })

  it('generates valid flowchart structure', () => {
    const tree = createSimpleTree()
    const diagram = generateMermaidDiagram(tree)

    expect(diagram).toContain('flowchart LR')
    expect(diagram).toContain('classDef root')
    expect(diagram).toContain('classDef default')
    expect(diagram).toContain('classDef cyclic')
    expect(diagram).toContain('classDef unavailable')
  })

  it('applies root styling to root node', () => {
    const tree = createSimpleTree()
    const diagram = generateMermaidDiagram(tree)

    expect(diagram).toContain(':::root')
  })

  it('applies cyclic styling to cyclic nodes', () => {
    const tree = createSimpleTree({
      children: [
        {
          fullId: 'levelcode/cyclic@1.0.0',
          agentId: 'cyclic',
          publisher: 'levelcode',
          version: '1.0.0',
          displayName: 'Cyclic Node',
          spawnerPrompt: null,
          isAvailable: false,
          children: [],
          isCyclic: true,
        },
      ],
    })
    tree.hasCycles = true

    const diagram = generateMermaidDiagram(tree)

    expect(diagram).toContain(':::cyclic')
  })

  it('applies unavailable styling to unavailable nodes', () => {
    const tree = createSimpleTree({
      children: [
        {
          fullId: 'levelcode/missing@1.0.0',
          agentId: 'missing',
          publisher: 'levelcode',
          version: '1.0.0',
          displayName: 'Missing Node',
          spawnerPrompt: null,
          isAvailable: false,
          children: [],
          isCyclic: false,
        },
      ],
    })

    const diagram = generateMermaidDiagram(tree)

    expect(diagram).toContain(':::unavailable')
  })

  it('generates connections between parent and child nodes', () => {
    const tree = createSimpleTree({
      children: [
        {
          fullId: 'levelcode/child@1.0.0',
          agentId: 'child',
          publisher: 'levelcode',
          version: '1.0.0',
          displayName: 'Child',
          spawnerPrompt: null,
          isAvailable: true,
          children: [],
          isCyclic: false,
        },
      ],
    })

    const diagram = generateMermaidDiagram(tree)

    expect(diagram).toContain('levelcode_root_1_0_0 --> levelcode_child_1_0_0')
  })

  it('escapes special characters in node labels', () => {
    const tree = createSimpleTree({
      displayName: 'Agent with "quotes" and <brackets>',
    })

    const diagram = generateMermaidDiagram(tree)

    // Should escape quotes
    expect(diagram).toContain("'quotes'")
    // Should escape angle brackets
    expect(diagram).toContain('&lt;')
    expect(diagram).toContain('&gt;')
  })

  it('includes version in node labels when present', () => {
    const tree = createSimpleTree({
      version: '2.5.0',
      displayName: 'Versioned',
    })

    const diagram = generateMermaidDiagram(tree)

    expect(diagram).toContain('v2.5.0')
  })

  it('sanitizes IDs for Mermaid compatibility', () => {
    const tree = createSimpleTree({
      fullId: 'pub/agent@1.2.3',
    })

    const diagram = generateMermaidDiagram(tree)

    // Special chars should be replaced with underscores
    expect(diagram).toContain('pub_agent_1_2_3')
    expect(diagram).not.toContain('pub/agent@1.2.3[')
  })
})

describe('generateNodeDataMap', () => {
  const createSimpleTree = (): AgentTreeData => ({
    root: {
      fullId: 'levelcode/root@1.0.0',
      agentId: 'root',
      publisher: 'levelcode',
      version: '1.0.0',
      displayName: 'Root Agent',
      spawnerPrompt: 'Root prompt',
      isAvailable: true,
      children: [
        {
          fullId: 'levelcode/child-a@1.0.0',
          agentId: 'child-a',
          publisher: 'levelcode',
          version: '1.0.0',
          displayName: 'Child A',
          spawnerPrompt: 'Child A prompt',
          isAvailable: true,
          children: [],
          isCyclic: false,
        },
        {
          fullId: 'levelcode/child-b@2.0.0',
          agentId: 'child-b',
          publisher: 'levelcode',
          version: '2.0.0',
          displayName: 'Child B',
          spawnerPrompt: null,
          isAvailable: false,
          children: [],
          isCyclic: false,
        },
      ],
      isCyclic: false,
    },
    totalAgents: 3,
    maxDepth: 1,
    hasCycles: false,
  })

  it('creates map entries for all nodes', () => {
    const tree = createSimpleTree()
    const nodeMap = generateNodeDataMap(tree)

    expect(nodeMap.size).toBe(3)
    expect(nodeMap.has('levelcode_root_1_0_0')).toBe(true)
    expect(nodeMap.has('levelcode_child-a_1_0_0')).toBe(true)
    expect(nodeMap.has('levelcode_child-b_2_0_0')).toBe(true)
  })

  it('includes correct node data', () => {
    const tree = createSimpleTree()
    const nodeMap = generateNodeDataMap(tree)

    const rootNode = nodeMap.get('levelcode_root_1_0_0')
    expect(rootNode).toBeDefined()
    expect(rootNode?.displayName).toBe('Root Agent')
    expect(rootNode?.spawnerPrompt).toBe('Root prompt')
    expect(rootNode?.isAvailable).toBe(true)
    expect(rootNode?.childCount).toBe(2)
  })

  it('tracks child count correctly', () => {
    const tree = createSimpleTree()
    const nodeMap = generateNodeDataMap(tree)

    const rootNode = nodeMap.get('levelcode_root_1_0_0')
    const childNode = nodeMap.get('levelcode_child-a_1_0_0')

    expect(rootNode?.childCount).toBe(2)
    expect(childNode?.childCount).toBe(0)
  })

  it('preserves all properties from tree nodes', () => {
    const tree = createSimpleTree()
    const nodeMap = generateNodeDataMap(tree)

    const childB = nodeMap.get('levelcode_child-b_2_0_0')
    expect(childB?.fullId).toBe('levelcode/child-b@2.0.0')
    expect(childB?.agentId).toBe('child-b')
    expect(childB?.publisher).toBe('levelcode')
    expect(childB?.version).toBe('2.0.0')
    expect(childB?.isAvailable).toBe(false)
    expect(childB?.isCyclic).toBe(false)
  })

  it('handles cyclic nodes without infinite loop', () => {
    const cyclicChild: AgentTreeNode = {
      fullId: 'levelcode/cyclic@1.0.0',
      agentId: 'cyclic',
      publisher: 'levelcode',
      version: '1.0.0',
      displayName: 'Cyclic',
      spawnerPrompt: null,
      isAvailable: false,
      children: [],
      isCyclic: true,
    }

    const tree: AgentTreeData = {
      root: {
        fullId: 'levelcode/root@1.0.0',
        agentId: 'root',
        publisher: 'levelcode',
        version: '1.0.0',
        displayName: 'Root',
        spawnerPrompt: null,
        isAvailable: true,
        children: [cyclicChild],
        isCyclic: false,
      },
      totalAgents: 2,
      maxDepth: 1,
      hasCycles: true,
    }

    // Should not hang or throw
    const nodeMap = generateNodeDataMap(tree)
    expect(nodeMap.size).toBe(2)
    expect(nodeMap.get('levelcode_cyclic_1_0_0')?.isCyclic).toBe(true)
  })

  it('deduplicates nodes that appear multiple times', () => {
    // Simulate a diamond dependency pattern
    const sharedChild: AgentTreeNode = {
      fullId: 'levelcode/shared@1.0.0',
      agentId: 'shared',
      publisher: 'levelcode',
      version: '1.0.0',
      displayName: 'Shared',
      spawnerPrompt: null,
      isAvailable: true,
      children: [],
      isCyclic: false,
    }

    const tree: AgentTreeData = {
      root: {
        fullId: 'levelcode/root@1.0.0',
        agentId: 'root',
        publisher: 'levelcode',
        version: '1.0.0',
        displayName: 'Root',
        spawnerPrompt: null,
        isAvailable: true,
        children: [
          {
            fullId: 'levelcode/branch-a@1.0.0',
            agentId: 'branch-a',
            publisher: 'levelcode',
            version: '1.0.0',
            displayName: 'Branch A',
            spawnerPrompt: null,
            isAvailable: true,
            children: [sharedChild],
            isCyclic: false,
          },
          {
            fullId: 'levelcode/branch-b@1.0.0',
            agentId: 'branch-b',
            publisher: 'levelcode',
            version: '1.0.0',
            displayName: 'Branch B',
            spawnerPrompt: null,
            isAvailable: true,
            children: [sharedChild], // Same reference
            isCyclic: false,
          },
        ],
        isCyclic: false,
      },
      totalAgents: 4,
      maxDepth: 2,
      hasCycles: false,
    }

    const nodeMap = generateNodeDataMap(tree)
    // Should only have 4 unique entries, not 5
    expect(nodeMap.size).toBe(4)
  })
})
