import type { GraphNode, GraphEdge } from '../index.js'
import type { EntryPoint } from './types.js'

const HANDLER_PREFIXES = ['handle', 'on']
const INDEX_BASENAMES = ['index', 'mod', '__init__', 'main', 'lib']

function baseName(filePath: string): string {
  const last = filePath.split('/').pop() ?? ''
  return last.replace(/\.[^.]+$/, '')
}

function matchesHandlerConvention(name: string): boolean {
  const lower = name.toLowerCase()
  return HANDLER_PREFIXES.some((p) => lower.startsWith(p))
}

function labelForNode(node: GraphNode): string {
  if (node.kind === 'route') {
    const method = node.decorators?.find((d) => /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(d))
    return method ? `${method.toUpperCase()} ${node.name}` : node.name
  }
  if (node.kind === 'component') return `<${node.name}>`
  return node.qualifiedName || node.name
}

export function discoverEntryPoints(nodes: GraphNode[], edges: GraphEdge[]): EntryPoint[] {
  const incomingCount = new Map<string, number>()
  for (const e of edges) {
    if (e.kind === 'calls' || e.kind === 'references') {
      incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1)
    }
  }

  const results: EntryPoint[] = []
  const seen = new Set<string>()

  for (const node of nodes) {
    if (seen.has(node.id)) continue

    if (node.kind === 'route') {
      seen.add(node.id)
      results.push({ node, type: 'route', label: labelForNode(node) })
      continue
    }

    if (node.kind === 'component') {
      seen.add(node.id)
      results.push({ node, type: 'component', label: labelForNode(node) })
      continue
    }

    if (
      (node.kind === 'function' || node.kind === 'method') &&
      node.isExported &&
      INDEX_BASENAMES.includes(baseName(node.filePath))
    ) {
      seen.add(node.id)
      results.push({ node, type: 'export', label: labelForNode(node) })
      continue
    }

    if (
      (node.kind === 'function' || node.kind === 'method') &&
      matchesHandlerConvention(node.name) &&
      (incomingCount.get(node.id) ?? 0) === 0
    ) {
      seen.add(node.id)
      results.push({ node, type: 'handler', label: labelForNode(node) })
      continue
    }
  }

  results.sort((a, b) => {
    const typeOrder = { route: 0, component: 1, export: 2, handler: 3 }
    const diff = typeOrder[a.type] - typeOrder[b.type]
    if (diff !== 0) return diff
    return a.label.localeCompare(b.label)
  })

  return results
}
