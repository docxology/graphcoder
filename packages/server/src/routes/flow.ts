import { Router } from 'express'
import type { Request, Response } from 'express'
import { graphService } from '../codegraph/service.js'
import { discoverEntryPoints, traceFlow, traceFlowReverse, detectConvergence } from '@graphcoder/core'
import type { FlowTracerConfig } from '@graphcoder/core'

const router = Router()

function requireProject(res: Response): boolean {
  if (!graphService.isOpen()) {
    res.status(503).json({ error: 'No project open' })
    return false
  }
  return true
}

router.get('/graph/entry-points', (_req: Request, res: Response) => {
  if (!requireProject(res)) return

  try {
    const { nodes, edges } = graphService.getAllNodesAndEdges()
    const entryPoints = discoverEntryPoints(nodes, edges)
    res.json({ entryPoints })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to discover entry points' })
  }
})

router.post('/graph/trace-flow', (req: Request, res: Response) => {
  if (!requireProject(res)) return

  const { nodeId, config } = req.body as { nodeId?: string; config?: Partial<FlowTracerConfig> }
  if (!nodeId || typeof nodeId !== 'string') {
    res.status(400).json({ error: 'nodeId is required' })
    return
  }

  try {
    const { nodes, edges } = graphService.getAllNodesAndEdges()
    const flow = traceFlow(nodeId, nodes, edges, config)
    res.json({ flow })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to trace flow' })
  }
})

router.post('/graph/trace-flow-reverse', (req: Request, res: Response) => {
  if (!requireProject(res)) return

  const { nodeId, config } = req.body as { nodeId?: string; config?: Partial<FlowTracerConfig> }
  if (!nodeId || typeof nodeId !== 'string') {
    res.status(400).json({ error: 'nodeId is required' })
    return
  }

  try {
    const { nodes, edges } = graphService.getAllNodesAndEdges()
    const flows = traceFlowReverse(nodeId, nodes, edges, config)
    res.json({ flows })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to trace reverse flow' })
  }
})

router.post('/graph/convergence', (req: Request, res: Response) => {
  if (!requireProject(res)) return

  const { flowNodeIds, minFlowCount } = req.body as { flowNodeIds?: string[][]; minFlowCount?: number }
  if (!Array.isArray(flowNodeIds)) {
    res.status(400).json({ error: 'flowNodeIds (array of arrays) is required' })
    return
  }

  try {
    const { nodes } = graphService.getAllNodesAndEdges()
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))
    const pseudoFlows = flowNodeIds.map((ids) => ({
      entryNodeId: ids[0] ?? '',
      nodes: ids.map((id) => nodeMap.get(id)).filter((n): n is NonNullable<typeof n> => n !== undefined),
      edges: [],
      branches: []
    }))
    const convergence = detectConvergence(pseudoFlows, minFlowCount ?? 2)
    const result = [...convergence.entries()].map(([nodeId, count]) => ({ nodeId, count }))
    res.json({ convergence: result })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to detect convergence' })
  }
})

export default router
