# Headless e2e tests

End-to-end tests that drive the real Dashboard UI through a live OpenCode server
over the Chrome DevTools Protocol (CDP). No external dependencies — the harness
uses Node 24's built-in `fetch` and `WebSocket`.

## Layout

| File | Covers |
|---|---|
| `cdp.mjs` | CDP client + helpers (navigate, eval, wait, React-safe input) |
| `lib.mjs` | result collector + opencode API helpers (scratch sessions) |
| `structural.test.mjs` | routing, connection banner, sidebar groups, markdown, tool cards, autoscroll, Todos/Files panels, Server modal, mobile |
| `lifecycle.test.mjs` | directory picker → create → rename → delete |
| `bench.test.mjs` | first-render, SSE connect, session-switch, modal-open timings |
| `model.test.mjs` | real streaming, error-state, permission + question prompts (slow) |
| `run.mjs` | orchestrator |

## Prerequisites

All three must be running and reachable before the suite runs:

1. **opencode server** — `opencode serve` (default `http://localhost:4096`)
2. **Vite dev server** — `npm run dev` (default `http://localhost:5173`)
3. **Headless Chromium with CDP** on port 9222:

   ```sh
   chromium --headless --remote-debugging-port=9222 --user-data-dir=/tmp/e2e-profile
   ```

   (use the `chrome` / `google-chrome` binary that is available on your system)

Override any endpoint with env vars: `CDP_HOST`, `CDP_PORT`, `APP_URL`, `API_URL`, `SHOT_DIR`.

## Run

```sh
npm run test:e2e            # structural + lifecycle + bench (fast, no model needed)
npm run test:e2e:model      # adds model-backed checks (needs a working model)
```

or directly: `node e2e/run.mjs [--with-model]`.

The suite exits non-zero if any check fails. Screenshots (best-effort, only in
failure/verification runs) are written to `e2e/shots/` (git-ignored).

## Model-backed checks

`model.test.mjs` drives a live model, so it is slow and only runs with
`--with-model`. It creates and deletes its own scratch sessions. Configure the
models via env:

| Var | Default | Purpose |
|---|---|---|
| `E2E_MODEL_WORK` | `local-big/qwen3.8-27b` | a reachable model that streams |
| `E2E_MODEL_DOWN` | `local-small/gpt-oss-20b` | an unreachable model (error-state test) |
| `E2E_AGENT` | `code-reviewer` | agent that requests a bash permission |
