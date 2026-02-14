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
npm run package      # Build macOS .dmg
npm run postinstall  # Rebuild native modules (better-sqlite3) for Electron
```

**Critical**: After `npm install`, always run `npm run postinstall` — `better-sqlite3` requires native rebuild for Electron's Node version. Without this, you'll get module version mismatch errors.

## Code Organization Patterns

### IPC Communication

All renderer↔main communication goes through `src/main/preload.cjs` which exposes `window.accrew`:

```typescript
// Renderer: invoke main process
const session = await window.accrew.session.create(workspace, prompt, sessionId)

// Renderer: subscribe to streaming events  
const unsub = window.accrew.on.agentResponse(({ sessionId, content }) => { ... })
```

IPC handlers defined in `src/main/index.ts` — search for `ipcMain.handle`.

### Session ID Race Condition Prevention

When creating sessions, generate the ID locally in the renderer **before** the IPC call to avoid race conditions with streaming events that arrive before the session response:

```typescript
const sessionId = crypto.randomUUID()
set({ activeSessionId: sessionId, streaming: { ... } })  // Set state FIRST
const session = await window.accrew.session.create(workspace, prompt, sessionId)
```

See `createSession()` in `src/store.ts` for the full pattern.

### Streaming State

Agent responses stream via IPC events. The store in `src/store.ts` manages streaming state **per session** using a Map:

```typescript
// WHY: streamingStates is a Map<sessionId, StreamingState> not a single object —
// multiple sessions can stream in parallel. A single `streaming` object gets
// overwritten when creating a new session, causing cross-session contamination.
streamingStates: Map<string, StreamingState>
```

Each `StreamingState` contains:
- `thinking` — accumulated thinking/reasoning
- `content` — accumulated response text  
- `toolCalls` — tool invocations with results
- `fileChanges` — file modifications

Components access the current session's streaming state via:
```typescript
const currentStreaming = activeSessionId ? streamingStates.get(activeSessionId) || null : null
```

### Streaming vs Database: Two Rendering Paths

**Critical architecture decision — understand this before touching streaming code:**

| Phase | Data Source | Component | Storage |
|-------|-------------|-----------|---------|
| In-flight | `streamingStates` Map | `StreamingMessage` | Memory only |
| Completed | `messages` array | `MessageBubble` | SQLite (source of truth) |

**These paths must never overlap.** If both render the same content, you get duplicates.

**The transition (agent:done):**
1. Main process saves message to SQLite
2. Renderer clears streaming state from Map
3. Renderer calls `loadMessages()` to reload from DB
4. `StreamingMessage` unmounts, `MessageBubble` renders

**ChatPane filtering:** While streaming, the last assistant message is filtered out of `messages.map()` to prevent overlap if user navigates away and back (which triggers `loadMessages` while streaming continues).

```typescript
// In ChatPane.tsx — prevents duplicate rendering during streaming
{(currentStreaming 
  ? messages.filter((m, i, arr) => !(m.role === 'assistant' && i === arr.length - 1))
  : messages
).map((message) => ...)}
```

### Types

Shared types live in `src/shared/types.ts` — single source of truth for `Session`, `Message`, `FileChange`, etc. Both processes import from here.

### Preload Script

**Must be CommonJS** (`.cjs`) — Electron requires it. Don't convert to ESM. Located at `src/main/preload.cjs`.

## Key Components

| File | Purpose |
|------|---------|
| `src/main/agent-manager.ts` | Session lifecycle, workspace routing, streaming coordination |
| `src/main/copilot-client.ts` | Wraps `@github/copilot-sdk`, normalizes SDK events to `StreamEvent`. Exports `getCopilotCliOptions()` which resolves the native platform binary (`copilot-darwin-arm64/copilot`) for spawning the CLI — see WHY comments |
| `src/main/database.ts` | SQLite via better-sqlite3, WAL mode, stores sessions/messages/file snapshots |
| `src/store.ts` | Zustand store, IPC event subscriptions, streaming state |
| `src/components/DiffPane.tsx` | Uses `@pierre/diffs/react` for diff rendering |

## Conventions

- **Models**: Default agent model is `claude-opus-4-5`, configurable via `~/.accrew/config.json`
- **Config**: Stored at `~/.accrew/config.json` (workspaceFolder, model, diffFont, diffFontSize, sidebarWidth)
- **Database**: Located at Electron's `userData` path (`~/Library/Application Support/accrew/accrew.db` on macOS)
- **Workspace routing**: `@workspace` explicit mention OR LLM-based prompt inference (see `matchWorkspace()` in agent-manager)

## Code Comments

This codebase uses `WHY:` comments to document non-obvious decisions. Before editing any file, follow the `edit-accrew-file` skill workflow.

## Common Tasks

### Adding a new IPC handler

1. Add type to `IpcChannels` in `src/shared/types.ts`
2. Add handler in `setupIpcHandlers()` in `src/main/index.ts`
3. Expose in `window.accrew` via `src/main/preload.cjs`
4. Add corresponding method to store in `src/store.ts`

### Adding a new streaming event type

1. Add to `StreamEvent` type in `src/main/copilot-client.ts`
2. Handle in `normalizeEvent()` method
3. Emit from `handleStreamEvent()` in `src/main/agent-manager.ts`
4. Add listener in preload + store's `setupEventListeners()`

## Debugging Tips

- Main process logs go to terminal (run `npm run dev`)
- Renderer DevTools open automatically in dev mode (`ACCREW_DEV=true`)
- SQLite database at `~/Library/Application Support/accrew/accrew.db` (macOS)
- If native module errors: `npm run postinstall` then restart
- Stream events debug: add `console.log` in `CopilotClient.normalizeEvent()`
- If agent opens a new Electron window instead of responding: the native binary (`@github/copilot-darwin-arm64/copilot`) isn't being resolved. Check `resolveCopilotCliPath()` in `copilot-client.ts` — it checks both top-level and nested `node_modules` paths, plus `app.asar.unpacked` for packaged builds.
