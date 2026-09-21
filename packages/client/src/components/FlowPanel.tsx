import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { state, removeFlow, clearFlows } from '../state/store.js'

export const FlowPanel: Component = () => {
  return (
    <Show when={state.viewMode === 'flow' && state.tracedFlows.length > 0}>
      <div
        class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-3 py-1.5 flex items-center gap-2 overflow-x-auto"
        data-testid="flow-panel"
      >
        <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">Flows:</span>
        <For each={state.tracedFlows}>
          {(flow, i) => {
            const entryNode = flow.nodes.find((n) => n.id === flow.entryNodeId)
            const label = entryNode?.name ?? flow.entryNodeId
            return (
              <span
                class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full
                bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex-shrink-0"
              >
                <span class="font-mono truncate max-w-32">{label}</span>
                <span class="text-gray-400">({flow.nodes.length})</span>
                <button
                  class="ml-0.5 text-blue-400 hover:text-red-500 transition-colors"
                  onClick={() => removeFlow(i())}
                  title="Remove this flow"
                >
                  ✕
                </button>
              </span>
            )
          }}
        </For>
        <button
          class="text-xs text-gray-400 hover:text-red-500 ml-auto flex-shrink-0 transition-colors"
          onClick={clearFlows}
          title="Clear all flows"
        >
          Clear all
        </button>
      </div>
    </Show>
  )
}
