import type { GraphNode, GraphEdge, NodeKind } from '../index.js'

export interface EntryPoint {
  node: GraphNode
  type: 'route' | 'component' | 'export' | 'handler'
  label: string
}

export interface TracedFlow {
  entryNodeId: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  branches: Branch[]
}

export interface Branch {
  fromNodeId: string
  paths: string[][]
}

export interface FlowTracerConfig {
  maxDepth: number
  noiseFilter: NoiseFilter
}

export interface NoiseFilter {
  excludePatterns: string[]
  excludeKinds: NodeKind[]
  minFanIn: number
}

export const DEFAULT_FLOW_CONFIG: FlowTracerConfig = {
  maxDepth: 20,
  noiseFilter: {
    excludePatterns: [],
    excludeKinds: ['import', 'export'],
    minFanIn: 10
  }
}
