import type { GraphNode, GraphEdge, NodeKind } from '../index.js'
import { globToRegex } from '../view.js'
import type { TracedFlow, Branch, FlowTracerConfig } from './types.js'
import { DEFAULT_FLOW_CONFIG } from './types.js'

type AdjMap = Map<string, GraphEdge[]>

function buildOutgoing(edges: GraphEdge[]): AdjMap {
  const m: AdjMap = new Map()
  for (const e of edges) {
    const list = m.get(e.source)
    if (list) list.push(e)
    else m.set(e.source, [e])
  }
  return m
}

function buildIncoming(edges: GraphEdge[]): AdjMap {
  const m: AdjMap = new Map()
  for (const e of edges) {
    const list = m.get(e.target)
    if (list) list.push(e)
    else m.set(e.target, [e])
  }
  return m
}

function buildFanIn(edges: GraphEdge[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const e of edges) {
    if (e.kind === 'calls' || e.kind === 'references') {
      counts.set(e.target, (counts.get(e.target) ?? 0) + 1)
    }
  }
  return counts
}

function buildNoiseSet(nodes: GraphNode[], edges: GraphEdge[], config: FlowTracerConfig): Set<string> {
  const noise = new Set<string>()
  const fanIn = buildFanIn(edges)
  const excludeKinds = new Set<NodeKind>(config.noiseFilter.excludeKinds)
  const patterns = config.noiseFilter.excludePatterns
    .map((p) => globToRegex(p))
    .filter((rx): rx is RegExp => rx !== null)

  for (const node of nodes) {
    if (excludeKinds.has(node.kind)) {
      noise.add(node.id)
      continue
    }
    if (patterns.some((rx) => rx.test(node.filePath))) {
      noise.add(node.id)
      continue
    }
    if (config.noiseFilter.minFanIn > 0 && (fanIn.get(node.id) ?? 0) >= config.noiseFilter.minFanIn) {
      noise.add(node.id)
      continue
    }
  }
  return noise
}

const WALK_EDGE_KINDS = new Set(['calls', 'references'])

export function traceFlow(
  startNodeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  config: Partial<FlowTracerConfig> = {}
): TracedFlow {
  const cfg: FlowTracerConfig = {
    maxDepth: config.maxDepth ?? DEFAULT_FLOW_CONFIG.maxDepth,
    noiseFilter: { ...DEFAULT_FLOW_CONFIG.noiseFilter, ...config.noiseFilter }
  }

  const nodeMap = new Map<string, GraphNode>(nodes.map((n) => [n.id, n]))
  const outgoing = buildOutgoing(edges.filter((e) => WALK_EDGE_KINDS.has(e.kind)))
  const noise = buildNoiseSet(nodes, edges, cfg)

  const visited = new Set<string>()
  const resultNodes = new Map<string, GraphNode>()
  const resultEdges: GraphEdge[] = []
  const branches: Branch[] = []

  function walk(nodeId: string, depth: number): void {
    if (depth > cfg.maxDepth) return
    if (visited.has(nodeId)) return
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) return
    resultNodes.set(nodeId, node)

    const outs = (outgoing.get(nodeId) ?? []).filter((e) => !noise.has(e.target) && nodeMap.has(e.target))

    if (outs.length > 1) {
      branches.push({
        fromNodeId: nodeId,
        paths: outs.map((e) => [e.target])
      })
    }

    for (const edge of outs) {
      resultEdges.push(edge)
      walk(edge.target, depth + 1)
    }
  }

  walk(startNodeId, 0)

  const incoming = buildIncoming(edges.filter((e) => WALK_EDGE_KINDS.has(e.kind)))
  for (const edge of incoming.get(startNodeId) ?? []) {
    if (noise.has(edge.source) || !nodeMap.has(edge.source)) continue
    if (resultNodes.has(edge.source)) continue
    resultNodes.set(edge.source, nodeMap.get(edge.source)!)
    resultEdges.push(edge)
  }

  return {
    entryNodeId: startNodeId,
    nodes: [...resultNodes.values()],
    edges: resultEdges,
    branches
  }
}

export function traceFlowReverse(
  targetNodeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  config: Partial<FlowTracerConfig> = {}
): TracedFlow[] {
  const cfg: FlowTracerConfig = {
    maxDepth: config.maxDepth ?? DEFAULT_FLOW_CONFIG.maxDepth,
    noiseFilter: { ...DEFAULT_FLOW_CONFIG.noiseFilter, ...config.noiseFilter }
  }

  const nodeMap = new Map<string, GraphNode>(nodes.map((n) => [n.id, n]))
  const incoming = buildIncoming(edges.filter((e) => WALK_EDGE_KINDS.has(e.kind)))
  const noise = buildNoiseSet(nodes, edges, cfg)

  const allPaths: { pathNodes: string[]; pathEdges: GraphEdge[] }[] = []

  function walkBack(nodeId: string, depth: number, path: string[], pathEdges: GraphEdge[]): void {
    if (depth > cfg.maxDepth) {
      allPaths.push({ pathNodes: [...path], pathEdges: [...pathEdges] })
      return
    }

    const ins = (incoming.get(nodeId) ?? []).filter(
      (e) => !noise.has(e.source) && nodeMap.has(e.source) && !path.includes(e.source)
    )

    if (ins.length === 0) {
      allPaths.push({ pathNodes: [...path], pathEdges: [...pathEdges] })
      return
    }

    for (const edge of ins) {
      path.push(edge.source)
      pathEdges.push(edge)
      walkBack(edge.source, depth + 1, path, pathEdges)
      path.pop()
      pathEdges.pop()
    }
  }

  walkBack(targetNodeId, 0, [targetNodeId], [])

  return allPaths.map((p) => {
    const reversed = [...p.pathNodes].reverse()
    const flowNodes = reversed.map((id) => nodeMap.get(id)!).filter(Boolean)
    return {
      entryNodeId: reversed[0]!,
      nodes: flowNodes,
      edges: p.pathEdges,
      branches: []
    }
  })
}

export function detectConvergence(flows: TracedFlow[], minFlowCount = 2): Map<string, number> {
  const counts = new Map<string, number>()
  for (const flow of flows) {
    const seen = new Set<string>()
    for (const node of flow.nodes) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      counts.set(node.id, (counts.get(node.id) ?? 0) + 1)
    }
  }

  const result = new Map<string, number>()
  for (const [id, count] of counts) {
    if (count >= minFlowCount) result.set(id, count)
  }
  return result
}
