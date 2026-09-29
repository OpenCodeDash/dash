# OpenCode Dashboard — Test Report

Headless end-to-end test of the Dashboard UI driving a real OpenCode server.
Method: a small CDP (Chrome DevTools Protocol) harness over headless Chromium
connects to the Vite dev server, drives the UI via DOM selectors, and asserts
on rendered state. Model-backed features were exercised against a live local
model so real tokens streamed through the UI.

- Date: 2026-09-29
- Dash: `7ba0cf7` (Vite 8 + React 19 + TS + SCSS modules)
- react-opencode: `1fa260e`
- OpenCode server: v1.18.31 at `http://localhost:4096`
- Browser: headless Chromium via CDP on `:9222`

## Environment

| Backend | Model | Status |
|---|---|---|
| `local-big` (port 8080) | `qwen3.8-27b` (llama.cpp, RX 7900 XTX) | UP |
| `local-small` (port 8081) | `gpt-oss-20b` (RTX 4080) | DOWN |

The opencode default model is `local-small/gpt-oss-20b`, so prompts sent with
the default model fail in this environment. Selecting
`local-big/qwen3.8-27b` in the model dropdown makes prompts work.

## Feature results

| Feature / component | Result |
|---|---|
| Routing (home redirect, New session) | PASS |
| Connection banner | PASS |
| Sidebar groups + collapse + recency | PASS |
| Directory-picker: navigate + create session | PASS |
| New session live update (no reload) | PASS |
| Session rename (inline) | PASS |
| Session delete | PASS |
| Message list: markdown render | PASS |
| Message list: tool cards | PASS |
| Autoscroll on new content | PASS |
| Real token streaming (busy -> cursor -> reasoning -> idle) | PASS |
| Error-state rendering (down backend: graceful, no crash) | PASS |
| Prompt composer: model/agent select, submit, stop | PASS |
| Todos panel: populated render (13 todos, status + priority) | PASS |
| Files panel: mount, fetch, empty state, refresh | PASS |
| Permission prompts (allow once / always / reject) | PASS |
| Question prompts (options + custom answer + submit/reject) | PASS |
| Server panel (MCP + plugins tabs) | PASS |
| Mobile layout | PASS |

## Benchmarks

| Metric | Value |
|---|---|
| First session item rendered | 211 ms |
| Navigation DOMContentLoaded / load | 108 / 109 ms |
| SSE `/event` stream open | 149 ms |
| Session switch | 17 - 37 ms |
| Modal open | 79 - 86 ms |

All values healthy for a local dev build.

## Bugs found and fixed

- **react-opencode infinite fetch loop** in `useFileStatus` / `useMcp`: both
  hooks re-fetched on every store update, producing a burst of repeated HTTP
  requests and a slow UI. Fixed by scoping the refetch to the relevant session
  and guarding against redundant calls. Commit `1fa260e`, pushed to
  `origin/master`. The dash repo pins this revision in `package.json` /
  `package-lock.json`.

## Known limitations / non-bugs

- **Default model is down in this environment** (`local-small`, port 8081).
  This is an infrastructure issue, not an app bug. Use `local-big`.
- **File diff is live-scope**: opencode's `/file/status` and
  `/session/:id/diff` return empty for completed sessions, so the FileDiffPanel
  hunk renderer could not be exercised against historical data here. The
  component handles the data it is given correctly (empty state verified);
  hunk rendering (`normalizeDiff` + `DiffText`) is a pure function of that
  data.
- **Question prompts** are surfaced by the model calling the `question` tool;
  verified via a live model call rather than a forced API trigger.

## Reproducing the harness

Test scripts live in `/tmp/opencode/` (ephemeral, not committed):

| Script | Covers |
|---|---|
| `cdp.mjs` | CDP client (connect, `eval`, `newPage`, events) |
| `feature-test.mjs` | 23 structural/interaction checks |
| `lifecycle.mjs` | create / rename / delete session, live update |
| `stream-real.mjs` | real token streaming via `local-big` |
| `stream-error.mjs` | error-state rendering via down model |
| `perm-test.mjs` / `q-probe.mjs` | permission + question prompts |
| `bench.mjs` | render / SSE / switch / modal timings |
| `panels.mjs` | Todos + Files panel verification |

To run: start the OpenCode server and `npm run dev` (Vite on `:5173`), launch
headless Chromium with `--remote-debugging-port=9222`, then run the scripts
with the nodejs binary on `PATH`.
