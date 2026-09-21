import type { Component } from 'solid-js'
import { createSignal, For, Show, createMemo } from 'solid-js'
import { state, loadEntryPoints, traceFromEntryPoint } from '../state/store.js'
import type { EntryPoint } from '@graphcoder/core'

const TYPE_LABELS: Record<EntryPoint['type'], string> = {
  route: 'Routes',
  component: 'Components',
  export: 'Exports',
  handler: 'Handlers'
}

const TYPE_ICONS: Record<EntryPoint['type'], string> = {
  route: '⟶',
  component: '◇',
  export: '↗',
  handler: '⚡'
}

export const EntryPointPicker: Component = () => {
  const [filter, setFilter] = createSignal('')

  const grouped = createMemo(() => {
    const q = filter().toLowerCase()
    const filtered = q
      ? state.entryPoints.filter(
          (ep) => ep.label.toLowerCase().includes(q) || ep.node.filePath.toLowerCase().includes(q)
        )
      : state.entryPoints
    const groups = new Map<EntryPoint['type'], EntryPoint[]>()
    for (const ep of filtered) {
      const list = groups.get(ep.type)
      if (list) list.push(ep)
      else groups.set(ep.type, [ep])
    }
    return groups
  })

  const handleTrace = (ep: EntryPoint) => {
    void traceFromEntryPoint(ep.node.id)
  }

  return (
    <div
      class="flex flex-col items-center justify-center h-full p-8 text-center select-none"
      data-testid="entry-point-picker"
    >
      <div class="max-w-lg w-full">
        <h2 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Trace a flow</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Pick an entry point to trace how the code responds to a user action.
        </p>

        <Show when={!state.isLoadingEntryPoints && state.entryPoints.length > 0}>
          <input
            type="text"
            placeholder="Filter entry points…"
            class="w-full mb-3 px-3 py-2 text-sm rounded border
              border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-800
              text-gray-900 dark:text-white
              placeholder-gray-400 dark:placeholder-gray-500
              focus:outline-none focus:border-blue-500"
            value={filter()}
            onInput={(e) => setFilter(e.currentTarget.value)}
            data-testid="entry-point-filter"
          />
        </Show>

        <Show when={state.isLoadingEntryPoints}>
          <p class="text-sm text-gray-400 animate-pulse">Discovering entry points…</p>
        </Show>

        <Show when={state.flowError}>
          <p class="text-sm text-red-500 mb-2">{state.flowError}</p>
        </Show>

        <Show when={!state.isLoadingEntryPoints && state.entryPoints.length === 0 && state.projectRoot}>
          <button
            class="px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => void loadEntryPoints()}
          >
            Discover entry points
          </button>
        </Show>

        <div class="max-h-[60vh] overflow-y-auto text-left space-y-3">
          <For each={[...grouped().entries()]}>
            {([type, entries]) => (
              <div>
                <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 px-1">
                  {TYPE_ICONS[type]} {TYPE_LABELS[type]} ({entries.length})
                </h3>
                <div class="space-y-0.5">
                  <For each={entries}>
                    {(ep) => (
                      <button
                        class="w-full text-left px-3 py-1.5 text-sm rounded
                          hover:bg-blue-50 dark:hover:bg-blue-900/30
                          text-gray-700 dark:text-gray-300
                          transition-colors group"
                        onClick={() => handleTrace(ep)}
                        title={ep.node.filePath}
                        disabled={state.isTracing}
                      >
                        <span class="font-mono text-blue-600 dark:text-blue-400 group-hover:underline">{ep.label}</span>
                        <span class="text-xs text-gray-400 dark:text-gray-500 ml-2 truncate">{ep.node.filePath}</span>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
