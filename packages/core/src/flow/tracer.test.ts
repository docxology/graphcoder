import { describe, expect, it } from 'vitest'
import type { GraphNode, GraphEdge } from '../index.js'
import { discoverEntryPoints } from './entry-points.js'
import { traceFlow, traceFlowReverse, detectConvergence } from './tracer.js'

function node(
  id: string,
  kind: GraphNode['kind'],
  opts: Partial<Pick<GraphNode, 'name' | 'filePath' | 'qualifiedName' | 'isExported' | 'decorators'>> = {}
): GraphNode {
  return {
    id,
    kind,
    name: opts.name ?? id,
    qualifiedName: opts.qualifiedName ?? id,
    filePath: opts.filePath ?? `src/${id}.ts`,
    language: 'typescript',
    startLine: 1,
    endLine: 10,
    startColumn: 0,
    endColumn: 0,
    isExported: opts.isExported ?? false,
    decorators: opts.decorators ?? [],
    updatedAt: 0
  }
}

function edge(source: string, target: string, kind: GraphEdge['kind'] = 'calls'): GraphEdge {
  return { source, target, kind }
}

// ── Entry point discovery ────────────────────────────────────────────────────

describe('discoverEntryPoints', () => {
  it('finds route nodes', () => {
    const nodes = [node('r1', 'route', { name: '/api/users' }), node('f1', 'function')]
    const eps = discoverEntryPoints(nodes, [])
    expect(eps).toHaveLength(1)
    expect(eps[0]!.type).toBe('route')
    expect(eps[0]!.label).toBe('/api/users')
  })

  it('finds component nodes', () => {
    const nodes = [node('c1', 'component', { name: 'UserList' })]
    const eps = discoverEntryPoints(nodes, [])
    expect(eps).toHaveLength(1)
    expect(eps[0]!.type).toBe('component')
    expect(eps[0]!.label).toBe('<UserList>')
  })

  it('finds exported functions from index files', () => {
    const nodes = [node('e1', 'function', { name: 'setup', filePath: 'src/index.ts', isExported: true })]
    const eps = discoverEntryPoints(nodes, [])
    expect(eps).toHaveLength(1)
    expect(eps[0]!.type).toBe('export')
  })

  it('finds handler-convention functions with zero callers', () => {
    const nodes = [node('h1', 'function', { name: 'handleClick' })]
    const eps = discoverEntryPoints(nodes, [])
    expect(eps).toHaveLength(1)
    expect(eps[0]!.type).toBe('handler')
  })

  it('excludes handler-convention functions that have callers', () => {
    const nodes = [node('h1', 'function', { name: 'handleClick' }), node('caller', 'function')]
    const edges = [edge('caller', 'h1')]
    const eps = discoverEntryPoints(nodes, edges)
    expect(eps).toHaveLength(0)
  })

  it('sorts results by type priority: route > component > export > handler', () => {
    const nodes = [
      node('h1', 'function', { name: 'handleSubmit' }),
      node('r1', 'route', { name: '/login' }),
      node('c1', 'component', { name: 'App' }),
      node('e1', 'function', { name: 'init', filePath: 'src/index.ts', isExported: true })
    ]
    const eps = discoverEntryPoints(nodes, [])
    expect(eps.map((e) => e.type)).toEqual(['route', 'component', 'export', 'handler'])
  })

  it('includes route decorator in label when present', () => {
    const nodes = [node('r1', 'route', { name: '/users', decorators: ['GET'] })]
    const eps = discoverEntryPoints(nodes, [])
    expect(eps[0]!.label).toBe('GET /users')
  })
})

// ── Forward tracing ──────────────────────────────────────────────────────────

describe('traceFlow', () => {
  it('walks forward along calls edges', () => {
    const nodes = [node('a', 'function'), node('b', 'function'), node('c', 'function')]
    const edges = [edge('a', 'b'), edge('b', 'c')]
    const flow = traceFlow('a', nodes, edges)
    expect(flow.entryNodeId).toBe('a')
    expect(flow.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
    expect(flow.edges).toHaveLength(2)
  })

  it('walks forward along references edges', () => {
    const nodes = [node('a', 'function'), node('b', 'variable')]
    const edges = [edge('a', 'b', 'references')]
    const flow = traceFlow('a', nodes, edges)
    expect(flow.nodes).toHaveLength(2)
  })

  it('ignores non-walk edge kinds', () => {
    const nodes = [node('a', 'function'), node('b', 'function')]
    const edges = [edge('a', 'b', 'contains')]
    const flow = traceFlow('a', nodes, edges)
    expect(flow.nodes).toHaveLength(1)
  })

  it('respects maxDepth', () => {
    const nodes = [node('a', 'function'), node('b', 'function'), node('c', 'function'), node('d', 'function')]
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')]
    const flow = traceFlow('a', nodes, edges, { maxDepth: 2 })
    expect(flow.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('handles cycles without infinite recursion', () => {
    const nodes = [node('a', 'function'), node('b', 'function')]
    const edges = [edge('a', 'b'), edge('b', 'a')]
    const flow = traceFlow('a', nodes, edges)
    expect(flow.nodes).toHaveLength(2)
    expect(flow.edges).toHaveLength(2)
  })

  it('records branches when a node has multiple outgoing edges', () => {
    const nodes = [node('a', 'function'), node('b', 'function'), node('c', 'function')]
    const edges = [edge('a', 'b'), edge('a', 'c')]
    const flow = traceFlow('a', nodes, edges)
    expect(flow.branches).toHaveLength(1)
    expect(flow.branches[0]!.fromNodeId).toBe('a')
    expect(flow.branches[0]!.paths.map((p) => p[0]).sort()).toEqual(['b', 'c'])
  })

  it('filters noise nodes by kind', () => {
    const nodes = [node('a', 'function'), node('imp', 'import'), node('b', 'function')]
    const edges = [edge('a', 'imp'), edge('a', 'b')]
    const flow = traceFlow('a', nodes, edges)
    expect(flow.nodes.find((n) => n.id === 'imp')).toBeUndefined()
    expect(flow.nodes.find((n) => n.id === 'b')).toBeDefined()
  })

  it('filters noise nodes by exclude pattern', () => {
    const nodes = [
      node('a', 'function', { filePath: 'src/main.ts' }),
      node('b', 'function', { filePath: 'node_modules/lodash/index.js' })
    ]
    const edges = [edge('a', 'b')]
    const flow = traceFlow('a', nodes, edges, {
      noiseFilter: { excludePatterns: ['node_modules/**'], excludeKinds: [], minFanIn: 0 }
    })
    expect(flow.nodes).toHaveLength(1)
  })

  it('filters noise nodes by minFanIn', () => {
    const nodes = [node('a', 'function'), node('hub', 'function'), node('c1', 'function'), node('c2', 'function')]
    const edges = [edge('a', 'hub'), edge('c1', 'hub'), edge('c2', 'hub')]
    const flow = traceFlow('a', nodes, edges, {
      noiseFilter: { excludePatterns: [], excludeKinds: [], minFanIn: 3 }
    })
    expect(flow.nodes.find((n) => n.id === 'hub')).toBeUndefined()
  })

  it('returns just the start node when it has no outgoing walk edges', () => {
    const nodes = [node('a', 'function')]
    const flow = traceFlow('a', nodes, [])
    expect(flow.nodes).toHaveLength(1)
    expect(flow.edges).toHaveLength(0)
    expect(flow.branches).toHaveLength(0)
  })

  it('includes direct callers of the entry point', () => {
    const nodes = [node('caller', 'function'), node('route', 'route'), node('handler', 'function')]
    const edges = [edge('caller', 'route'), edge('route', 'handler')]
    const flow = traceFlow('route', nodes, edges)
    expect(flow.nodes.map((n) => n.id).sort()).toEqual(['caller', 'handler', 'route'])
    expect(flow.edges).toHaveLength(2)
  })

  it('does not recursively trace callers of callers', () => {
    const nodes = [
      node('grandparent', 'function'),
      node('parent', 'function'),
      node('entry', 'route'),
      node('child', 'function')
    ]
    const edges = [edge('grandparent', 'parent'), edge('parent', 'entry'), edge('entry', 'child')]
    const flow = traceFlow('entry', nodes, edges)
    const ids = flow.nodes.map((n) => n.id).sort()
    expect(ids).toContain('parent')
    expect(ids).toContain('child')
    expect(ids).not.toContain('grandparent')
  })
})

// ── Reverse tracing ──────────────────────────────────────────────────────────

describe('traceFlowReverse', () => {
  it('walks backward along calls edges', () => {
    const nodes = [node('a', 'function'), node('b', 'function'), node('c', 'function')]
    const edges = [edge('a', 'b'), edge('b', 'c')]
    const flows = traceFlowReverse('c', nodes, edges)
    expect(flows).toHaveLength(1)
    expect(flows[0]!.entryNodeId).toBe('a')
    expect(flows[0]!.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('produces multiple flows for multiple callers', () => {
    const nodes = [node('a', 'function'), node('b', 'function'), node('c', 'function')]
    const edges = [edge('a', 'c'), edge('b', 'c')]
    const flows = traceFlowReverse('c', nodes, edges)
    expect(flows).toHaveLength(2)
    const entryIds = flows.map((f) => f.entryNodeId).sort()
    expect(entryIds).toEqual(['a', 'b'])
  })

  it('handles cycles in backward walk', () => {
    const nodes = [node('a', 'function'), node('b', 'function')]
    const edges = [edge('a', 'b'), edge('b', 'a')]
    const flows = traceFlowReverse('b', nodes, edges)
    expect(flows.length).toBeGreaterThan(0)
    for (const flow of flows) {
      const ids = flow.nodes.map((n) => n.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

// ── Convergence detection ────────────────────────────────────────────────────

describe('detectConvergence', () => {
  it('finds nodes appearing in 2+ flows', () => {
    const shared = node('shared', 'function')
    const flows = [
      { entryNodeId: 'a', nodes: [node('a', 'function'), shared], edges: [], branches: [] },
      { entryNodeId: 'b', nodes: [node('b', 'function'), shared], edges: [], branches: [] }
    ]
    const convergence = detectConvergence(flows)
    expect(convergence.get('shared')).toBe(2)
    expect(convergence.has('a')).toBe(false)
    expect(convergence.has('b')).toBe(false)
  })

  it('respects custom minFlowCount', () => {
    const shared = node('shared', 'function')
    const flows = [
      { entryNodeId: 'a', nodes: [node('a', 'function'), shared], edges: [], branches: [] },
      { entryNodeId: 'b', nodes: [node('b', 'function'), shared], edges: [], branches: [] }
    ]
    const convergence = detectConvergence(flows, 3)
    expect(convergence.size).toBe(0)
  })

  it('returns empty map when no convergence exists', () => {
    const flows = [
      { entryNodeId: 'a', nodes: [node('a', 'function')], edges: [], branches: [] },
      { entryNodeId: 'b', nodes: [node('b', 'function')], edges: [], branches: [] }
    ]
    const convergence = detectConvergence(flows)
    expect(convergence.size).toBe(0)
  })

  it('counts a node only once per flow even if duplicated within that flow', () => {
    const dup = node('dup', 'function')
    const flows = [
      { entryNodeId: 'a', nodes: [node('a', 'function'), dup, dup], edges: [], branches: [] },
      { entryNodeId: 'b', nodes: [node('b', 'function'), dup], edges: [], branches: [] }
    ]
    const convergence = detectConvergence(flows)
    expect(convergence.get('dup')).toBe(2)
  })
})
