import { state } from './core.js'

/**
 * Push the current projectRoot, diff range, PR stack refs, and flow state
 * into the browser URL as query params, without triggering a navigation.
 *
 * Tracked params:
 *   - `project`  — absolute path of the open project
 *   - `base`     — base commit hash for a temporal diff
 *   - `target`   — target commit hash for a temporal diff
 *   - `prBase`   — base ref for the PR stack
 *   - `prTip`    — tip ref for the PR stack
 *   - `view`     — 'flow' or omitted (graph is default)
 *   - `flows`    — comma-separated entry node IDs of traced flows
 */
export function syncUrlParams(): void {
  const params = new URLSearchParams()
  if (state.projectRoot) params.set('project', state.projectRoot)
  if (state.baseRef) params.set('base', state.baseRef)
  if (state.targetRef) params.set('target', state.targetRef)
  if (state.prStack.baseRef) params.set('prBase', state.prStack.baseRef)
  if (state.prStack.tipRef) params.set('prTip', state.prStack.tipRef)
  if (state.viewMode === 'flow') params.set('view', 'flow')
  const flowIds = state.tracedFlows.map((f) => f.entryNodeId)
  if (flowIds.length > 0) params.set('flows', flowIds.join(','))
  const qs = params.toString()
  history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
}
