import type { EntryPoint, TracedFlow, GraphNode, GraphEdge } from '@graphcoder/core'
import { computeView } from '@graphcoder/core'
import type { ViewParams } from '@graphcoder/core'
import { state, setState } from './core.js'
import { sendViewRequest } from './project.js'
import { syncUrlParams } from './url.js'
import * as flowApi from '../api/flow.js'

export type ViewMode = 'flow' | 'graph'

export interface FlowState {
  viewMode: ViewMode
  entryPoints: EntryPoint[]
  isLoadingEntryPoints: boolean
  tracedFlows: TracedFlow[]
  convergence: Map<string, number>
  isTracing: boolean
  flowError: string | null
}

export const flowInitial: FlowState = {
  viewMode: 'graph',
  entryPoints: [],
  isLoadingEntryPoints: false,
  tracedFlows: [],
  convergence: new Map(),
  isTracing: false,
  flowError: null
}

export function setViewMode(mode: ViewMode): void {
  setState('viewMode', mode)
  if (mode === 'flow') {
    recomputeFlowView()
  } else {
    sendViewRequest({
      hiddenNodeKinds: state.hiddenNodeKinds,
      hiddenEdgeKinds: state.hiddenEdgeKinds,
      hiddenPaths: state.hiddenPaths,
      excludePatterns: state.excludePatterns,
      groupByFile: state.groupByFile,
      groupByClass: state.groupByClass,
      groupByContract: state.groupByContract,
      groupByPackage: state.groupByPackage,
      expandedGroups: state.expandedGroups,
      focusedNodeId: state.focusedNodeId,
      scopeFiles: state.scopeFiles
    })
  }
  syncUrlParams()
}

export async function loadEntryPoints(): Promise<void> {
  setState('isLoadingEntryPoints', true)
  setState('flowError', null)
  try {
    const entryPoints = await flowApi.fetchEntryPoints()
    setState('entryPoints', entryPoints)
  } catch (e) {
    setState('flowError', e instanceof Error ? e.message : 'Failed to load entry points')
  } finally {
    setState('isLoadingEntryPoints', false)
  }
}

export async function traceFromEntryPoint(nodeId: string): Promise<void> {
  if (state.tracedFlows.some((f) => f.entryNodeId === nodeId)) return
  setState('isTracing', true)
  setState('flowError', null)
  try {
    const flow = await flowApi.fetchTraceFlow(nodeId)
    setState('tracedFlows', (prev) => [...prev, flow])
    updateConvergence()
    recomputeFlowView()
    syncUrlParams()
  } catch (e) {
    setState('flowError', e instanceof Error ? e.message : 'Failed to trace flow')
  } finally {
    setState('isTracing', false)
  }
}

export async function traceReverse(nodeId: string): Promise<void> {
  setState('isTracing', true)
  setState('flowError', null)
  try {
    const flows = await flowApi.fetchTraceFlowReverse(nodeId)
    setState('tracedFlows', (prev) => [...prev, ...flows])
    updateConvergence()
    recomputeFlowView()
    syncUrlParams()
  } catch (e) {
    setState('flowError', e instanceof Error ? e.message : 'Failed to trace reverse flow')
  } finally {
    setState('isTracing', false)
  }
}

export function removeFlow(index: number): void {
  setState('tracedFlows', (prev) => prev.filter((_, i) => i !== index))
  updateConvergence()
  recomputeFlowView()
  syncUrlParams()
}

export function clearFlows(): void {
  setState('tracedFlows', [])
  setState('convergence', new Map())
  setState('viewNodes', [])
  setState('viewEdges', [])
  setState('viewGroups', [])
  syncUrlParams()
}

function updateConvergence(): void {
  const counts = new Map<string, number>()
  for (const flow of state.tracedFlows) {
    const seen = new Set<string>()
    for (const node of flow.nodes) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      counts.set(node.id, (counts.get(node.id) ?? 0) + 1)
    }
  }
  const convergent = new Map<string, number>()
  for (const [id, count] of counts) {
    if (count >= 2) convergent.set(id, count)
  }
  setState('convergence', convergent)
}

export function recomputeFlowView(): void {
  if (state.viewMode !== 'flow') return

  const nodeMap = new Map<string, GraphNode>()
  const edgeSet = new Set<string>()
  const edges: GraphEdge[] = []

  for (const flow of state.tracedFlows) {
    for (const node of flow.nodes) {
      nodeMap.set(node.id, node)
    }
    for (const edge of flow.edges) {
      const key = `${edge.source}\x00${edge.target}\x00${edge.kind}`
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push(edge)
      }
    }
  }

  const tracedNodes = [...nodeMap.values()]

  if (tracedNodes.length === 0) {
    setState('viewNodes', [])
    setState('viewEdges', [])
    setState('viewGroups', [])
    return
  }

  const fileByPath = new Map<string, GraphNode>()
  for (const fn of state.fileNodes) {
    fileByPath.set(fn.filePath, fn)
  }

  for (const node of tracedNodes) {
    const fileNode = fileByPath.get(node.filePath)
    if (!fileNode) continue
    if (!nodeMap.has(fileNode.id)) nodeMap.set(fileNode.id, fileNode)
    const key = `${fileNode.id}\x00${node.id}\x00contains`
    if (!edgeSet.has(key)) {
      edgeSet.add(key)
      edges.push({ source: fileNode.id, target: node.id, kind: 'contains' })
    }
  }

  const params: ViewParams = {
    hiddenNodeKinds: [],
    hiddenEdgeKinds: ['contains', 'exports'],
    hiddenPaths: [],
    excludePatterns: '',
    expandedGroups: tracedNodes.map((n) => n.filePath),
    groupByFile: true,
    groupByContract: false,
    groupByClass: false,
    groupByPackage: false,
    focusedNodeId: null,
    scopeFiles: []
  }

  const result = computeView([...nodeMap.values()], edges, params)
  setState('viewNodes', result.nodes)
  setState('viewEdges', result.edges)
  setState('viewGroups', result.groups)
}
