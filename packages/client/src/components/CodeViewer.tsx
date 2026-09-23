import type { Component } from 'solid-js'
import { createEffect, onCleanup, onMount } from 'solid-js'
import * as monaco from 'monaco-editor'

self.MonacoEnvironment = {
  getWorker(_workerId: string, _label: string) {
    return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), {
      type: 'module'
    })
  }
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mts: 'typescript',
  mjs: 'javascript',
  cts: 'typescript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  html: 'html',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  rb: 'ruby',
  sh: 'shell',
  bash: 'shell',
  sql: 'sql'
}

function langFromPath(filePath: string | undefined): string {
  if (!filePath) return 'plaintext'
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_LANG[ext] ?? 'plaintext'
}

export const CodeViewer: Component<{ code: string; filePath?: string }> = (props) => {
  let container!: HTMLDivElement
  let editor: monaco.editor.IStandaloneCodeEditor | undefined

  onMount(() => {
    editor = monaco.editor.create(container, {
      value: props.code,
      language: langFromPath(props.filePath),
      readOnly: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: 'off',
      folding: false,
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      scrollbar: { vertical: 'auto', horizontal: 'auto', verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      contextmenu: false,
      automaticLayout: true,
      padding: { top: 8, bottom: 8 },
      theme: document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs'
    })
  })

  createEffect(() => {
    const model = editor?.getModel()
    if (!model) return
    const lang = langFromPath(props.filePath)
    monaco.editor.setModelLanguage(model, lang)
    model.setValue(props.code)
  })

  createEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs')
  })

  onCleanup(() => editor?.dispose())

  return <div ref={container} class="w-full h-full" data-testid="code-preview" />
}
