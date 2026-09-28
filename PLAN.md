# OpenCode Dashboard — Plan

**Goal**: Web dashboard for the opencode server with core parity to the opencode desktop app, built on the existing Vite 8 + React 19 + TS scaffold.

## Stack

- **react-opencode** from `https://github.com/eyezahhhh/react-opencode` (not on npm — install via `npm i <github-url>`; its `prepare: tsup` step may fail since git deps don't install devDeps → fallback: clone to `../react-opencode`, build, depend via `"file:../react-opencode"`)
- **react-router-dom** (v7) for routing
- **sass** — plain `.scss` with nesting only; set `css.preprocessorOptions.scss.api: 'modern-compiler'` in vite.config
- **react-markdown** for message text rendering
- `.prettierrc` with `{"useTabs": true}` (+ `prettier` devDep, `format` script)

## Routes

| Route                 | View                                              |
| --------------------- | ------------------------------------------------- |
| `/`                   | Session list (redirects to latest session if any) |
| `/session/:sessionId` | Chat view                                         |

**Layout**: left sidebar (connection indicator, "New session", live session list with title + busy status) · main chat column (messages → composer) · right panel toggles: Todos / File changes.

## Features → lib API (core scope)

- **Sessions**: `useSessions()`, `createSession` / `renameSession` / `deleteSession`, `useSessionBusy`
- **Chat**: `useMessages(id)` → `useMessageParts(mid)`; render text (markdown), reasoning (collapsed), tool cards (name + pending/running/completed/error + expandable input/output), step/patch/file parts — all live-streaming
- **Composer**: `usePrompt(id)` → `prompt({parts, model?, agent?})` + `abort()`; model picker (`useProviders()`) + agent picker (`useAgents()`)
- **Approvals**: `usePermissions()` → `replyPermission(id, "once"|"always"|"reject")`; `useQuestions()` → `replyQuestion` / `rejectQuestion` — inline cards above composer
- **Todos**: `useTodos(id)` panel
- **File changes**: `useFileStatus()` list + `client.sessionDiff(id)` with simple `+/-` line coloring
- **Status**: `useConnected()` indicator in sidebar

## Key files

```
.prettierrc                  # {"useTabs": true}
src/main.tsx                 # + BrowserRouter
src/App.tsx                  # OpenCodeProvider + Routes
src/components/{Sidebar,SessionView,MessageList,MessageItem,ToolCard,PromptComposer,PermissionPrompts,QuestionPrompts,TodosPanel,FileDiffPanel}.tsx
src/styles/{tokens,base,layout,sidebar,chat,panels}.scss
```

## Verification

1. `npm run lint` + `npm run build` green
2. Manual smoke against `opencode serve`: create/rename/delete session, send prompt → watch streaming + tool cards, approve a permission, verify todos + file diff panel update live
3. Browser-level verification via chrome-devtools MCP: navigate routes, drive the UI, check console for errors
