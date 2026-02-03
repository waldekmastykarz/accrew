# Accrew - AI Agent Instructions

## Architecture Overview

Electron desktop app with three-pane UI (sidebar → chat → diff viewer). **Two isolated processes communicate via IPC:**

- **Main process** (`src/main/`): Node.js runtime — agent orchestration, SQLite, file I/O
- **Renderer process** (`src/components/`): React UI — Zustand state, streaming displays

```
Main (Node)                         Renderer (React/Vite)
┌─────────────────────┐             ┌──────────────────────┐
│ AgentManager        │◄──IPC──────►│ Zustand store        │
│ CopilotClient       │             │ window.accrew API    │
│ Database (sqlite)   │             │ Components           │
└─────────────────────┘             └──────────────────────┘
```

## Build & Development

```bash
npm run dev          # Runs main (tsc --watch) + renderer (vite) concurrently
npm run build        # Build both: tsc + vite build
npm start            # Run built app (requires ACCREW_DEV=true for dev mode)
npm run postinstall  # Rebuild native modules (better-sqlite3) for Electron
```

**Key**: After `npm install`, always run `npm run postinstall` — `better-sqlite3` needs native rebuild for Electron's Node version.

## Code Organization Patterns

### IPC Communication

All renderer↔main communication goes through `src/main/preload.cjs` which exposes `window.accrew`:

```typescript
// Renderer: invoke main process
const session = await window.accrew.session.create(workspace, prompt, sessionId)

// Renderer: subscribe to streaming events  
const unsub = window.accrew.on.agentResponse(({ sessionId, content }) => { ... })
```

IPC handlers defined in [src/main/index.ts](src/main/index.ts) — search for `ipcMain.handle`.

### Streaming State

Agent responses stream via IPC events. The store in [src/store.ts](src/store.ts) manages streaming state:
- `streaming.thinking` — accumulated thinking/reasoning
- `streaming.content` — accumulated response text  
- `streaming.toolCalls` — tool invocations with results
- `streaming.fileChanges` — file modifications

When `agent:done` fires, streaming state converts to a persisted `Message`.

### Types

Shared types live in [src/shared/types.ts](src/shared/types.ts) — single source of truth for `Session`, `Message`, `FileChange`, etc. Both processes import from here.

### Preload Script

**Must be CommonJS** (`.cjs`) — Electron requires it. Don't convert to ESM. Located at [src/main/preload.cjs](src/main/preload.cjs).

## Key Components

| File | Purpose |
|------|---------|
| `src/main/agent-manager.ts` | Session lifecycle, workspace routing, streaming coordination |
| `src/main/copilot-client.ts` | Wraps `@github/copilot-sdk`, normalizes events to `StreamEvent` |
| `src/main/database.ts` | SQLite via better-sqlite3, WAL mode, stores sessions/messages/file snapshots |
| `src/store.ts` | Zustand store, IPC event subscriptions, streaming state |
| `src/components/DiffPane.tsx` | Uses `@pierre/diffs/react` for diff rendering |

## Conventions

- **Models**: Default agent model is `claude-opus-4-5`; matching uses `gpt-4o-mini` for speed
- **Config**: Stored at `~/.accrew/config.json` (workspaceFolder, diffFont, diffFontSize)
- **Database**: Located at Electron's `userData` path (`accrew.db`)
- **Workspace routing**: `@workspace` explicit mention OR LLM inference from prompt

## Common Tasks

### Adding a new IPC handler

1. Add type to `IpcChannels` in [src/shared/types.ts](src/shared/types.ts)
2. Add handler in `setupIpcHandlers()` in [src/main/index.ts](src/main/index.ts)
3. Expose in `window.accrew` via [src/main/preload.cjs](src/main/preload.cjs)
4. Add corresponding method to store in [src/store.ts](src/store.ts)

### Adding a new streaming event type

1. Add to `StreamEvent` type in [src/main/copilot-client.ts](src/main/copilot-client.ts)
2. Handle in `normalizeEvent()` method
3. Emit from `handleStreamEvent()` in [src/main/agent-manager.ts](src/main/agent-manager.ts)
4. Add listener in preload + store's `setupEventListeners()`

## Debugging Tips

- Main process logs go to terminal
- Renderer DevTools open automatically in dev mode (`ACCREW_DEV=true`)
- SQLite database at `~/Library/Application Support/accrew/accrew.db` (macOS)
- If native module errors: `npm run postinstall` then restart
