# GraphCoder

Bidirectional architectural flow & mutation platform. Ingests any codebase into a deterministic structural graph, overlays Git history as a temporal dimension, and synthesises graph mutations back into real code changes.

Think of it as a two-way mirror between your code and a live, queryable architecture model — not a static diagram, but an active workspace where you can explore, diff, and eventually edit the structure directly.

## What it does today

- **Graph explorer** — full-project call graph, file grouping, contract surface grouping, node/edge kind filtering, symbol search, focus mode
- **Flow tracing** — entry point discovery, forward/reverse call-path walk, convergence detection. Flows-first UX with progressive canvas build-up
- **Node inspector** — Monaco editor with syntax-highlighted code preview, Cmd/Ctrl+click symbol navigation, back/forward history
- **Diff overlay** — capture a structural snapshot then keep coding; the canvas shows a live ring-diff of adds, removes, moves, and modifications against the baseline
- **Annotations** — draw-to-annotate with user-defined kinds, AI-powered suggestions, undo/redo
- **HTTP bridge** — synthetic `calls` edges across the HTTP boundary: `fetch()` calls in client code link directly to their matching Express route handlers
- **PR stack** — branch-aware PR discovery, temporal diff overlay, scope filtering
- **CLI + MCP** — `graphcoder check`, `graphcoder digest`, `graphcoder import-prs` available as both CLI commands and MCP tools

## Architecture

```
packages/
  core/    — shared types, ArchDiff v2, semantic identity, flow tracer, annotations
  server/  — Express 5 API + CodeGraph + WebSocket + HTTP bridge analyser
  client/  — SolidJS + ELK layout + Three.js WebGL canvas + Monaco editor
  cli/     — standalone CLI for CI and agent use
  mcp/     — MCP server wrapping CLI commands as tools
```

Server at `:3357`, client at `:3356`. Start both with `pnpm dev`.

## Phase progress

| Phase | Status  | What                                                                      |
| ----- | ------- | ------------------------------------------------------------------------- |
| 0     | ✅ Done | Read-only graph explorer, ELK layout, canvas, E2E tests                   |
| 1     | ✅ Done | ArchDiff v2, semantic identity, diff computation, overlay UI              |
| 2     | ✅ Done | Temporal mapper — Git history → per-commit diffs via worktrees            |
| 3     | ✅ Done | Annotation surface — draw-to-annotate, user-defined kinds, AI proposals   |
| 3c    | ✅ Done | Consumer tooling — CLI, MCP server, PR stack UI                           |
| 3d    | ✅ Done | Flow tracing — entry points, call-path walk, Monaco inspector, navigation |
| 4     | Planned | Projections + constraints (sketch changes, enforce rules, measure reach)  |
| 5     | Planned | Prospective state engine (projections → CoW graph forks, validation)      |
| 6     | Planned | Code synthesis engine (ArchDiff → file changes → commit)                  |
| 7     | Planned | AI agent MCP interface (agents create annotations + projections)          |

## Quick start

```bash
pnpm install
pnpm dev
# open http://localhost:3356
# enter a project path → graph loads
```

Requires Node 22.5+ (built-in SQLite for CodeGraph).
