# OpenCode Dash

A web dashboard for the [opencode](https://opencode.ai) server with a built-in
kanban board. Chat with opencode sessions in the browser and manage the board
agents work from — one place.

It is a Vite + React 19 + TypeScript single-page app built on two sibling
packages:

- **react-opencode** — reactive hooks over the opencode server (sessions,
  streaming messages, tools, permissions, questions, todos, file/VCS state).
- **react-backdash** — reactive hooks over the **backdash** kanban + event-stream
  backend.

Both talk to their server over REST for actions and SSE for live updates, so the
UI never needs to poll or reload.

## Features

- **Sessions** — list, create in a chosen directory, rename, delete; live titles
  and busy status.
- **Chat** — streaming text and reasoning, tool cards (pending/running/completed/
  error with expandable input/output), subagent cards, markdown + GFM tables,
  autoscroll, stop.
- **Approvals** — inline permission prompts (once / always / reject) and
  interactive question prompts (options + free-text answer).
- **Composer** — model and agent pickers, send, stop.
- **Panels** — Todos (the linked board task's checklist when the session has one,
  else the session's own), file changes / diff, and a Server panel showing MCP
  servers and configured plugins.
- **Kanban** — multiple boards, columns (with queue semantics), tasks with
  priority / estimate / assignee / due date / tags / dependencies / todo
  checklists, drag-and-drop move, claim and release.
- **Auth** — backdash bearer token; first registered account becomes admin.
- **UI** — dark and light themes, responsive/mobile layout with edge-swipe
  navigation.

## Stack

Vite 8, React 19, TypeScript, SCSS modules, `react-router-dom` 7,
`react-markdown` + `remark-gfm`/`remark-breaks`, `react-virtuoso`.

## Quick start

```sh
npm install
npm run dev          # http://localhost:5173
```

The dev server reads no proxy config; the app calls the two servers directly
(cross-origin, which backdash allows by default for local development). Start
both backends first:

```sh
# opencode server (default :4096)
opencode serve

# kanban backend (from ../backdash, default :3000)
(cd ../backdash && npm run start:dev)
```

Then open the app and register the first account — it becomes the admin.

## Configuration

Read at build/dev time via Vite env vars (`.env` or the shell):

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_OPENCODE_URL` | `http://127.0.0.1:4096` | opencode server base URL |
| `VITE_BACKDASH_URL` | `http://127.0.0.1:3000` | backdash base URL |

Both default to the IPv4 literal `127.0.0.1` rather than `localhost`, because
headless Chromium (used by the e2e suite) resolves `localhost` to IPv6 first and
hangs on the cross-origin fetch.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc -b` typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm run format` | Prettier (tabs) |
| `npm run test:e2e` | Headless e2e suites (see below) |
| `npm run test:e2e:model` | Adds model-backed checks (needs a working model) |

## Layout

```
src/
  app.tsx                 # providers + routes
  server.ts               # opencode HTTP helpers + URL/plugin helpers
  auth.ts                 # backdash auth (register/login, token storage)
  components/             # sidebar, chat, panels, modals, kanban widgets
  pages/
    home-page/            # session list
    session-page/         # chat view
    boards-page/          # board list
    board-page/           # kanban board
    settings-page/        # account + service-account admin
  hooks/                  # theme, edge-swipe, message windowing
  styles/                 # theme tokens + base
e2e/                      # headless CDP test suites
```

`AGENTS.md` at the workspace root documents how to work across the subprojects.

## E2E tests

Headless suite in `e2e/`, driven over the Chrome DevTools Protocol with no
external deps (Node 24 `fetch` + `WebSocket`). See `e2e/README.md` for details.

```sh
npm run test:e2e              # structural + lifecycle + subagent + refresh + bench + boards + tasks + mobile-swipe + dropdown
npm run test:e2e:model        # also runs model-backed checks (needs a working model)
```

Suites run independently: `e2e/run.mjs` wraps each in `runSuite`, so a crashing
suite records a failure instead of aborting the rest.

Prereqs (all must be running):

| Service | Default | Needed by |
| --- | --- | --- |
| opencode server (`opencode serve`) | `:4096` | all suites |
| Vite dev server (`npm run dev`) | `:5173` | all suites |
| Headless Chromium with CDP | `:9222` | all suites |
| backdash server | `:3000` | boards + tasks suites (skipped when unreachable) |

Override with `API_URL`, `APP_URL`, `BOARD_URL`, `CDP_HOST`, `CDP_PORT`,
`SHOT_DIR` (screenshot dir), and the `E2E_MODEL_*` vars for model-backed checks.

## Related

- `../backdash` — kanban + event-stream API this app consumes.
- `../react-backdash` — kanban client the board UI is built on.
- `../react-opencode` — opencode client the chat UI is built on.
