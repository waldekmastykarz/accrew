# Accrew - AI Agent Command Center

Local-first Electron app for controlling AI coding agents across multiple projects from one place.

## Core Concept

A unified command center for AI coding agents. Configure a workspace folder, then interact with agents running in any subfolder project via a single interface.

## Tech Stack

- **Framework**: Electron + React + Vite
- **UI**: Tailwind CSS + shadcn/ui (Linear/Screen Studio aesthetic)
- **Agent Backend**: `@github/copilot-sdk` (Node.js) with Claude Opus 4.5
- **Persistence**: SQLite
- **Diffs**: `@pierre/diffs` (https://diffs.com/)
- **Config**: `~/.accrew/config.json`

## Features

### Workspace Routing

1. **Explicit @-mention**: `@my-project fix the bug` → routes to `my-project` folder
2. **Implicit routing**: `fix the bug in the todo app` → LLM matches against:
   - Folder names
   - README.md content
   - `.github/copilot-instructions.md`
   - Routes to best match, or system agent if no match
3. **New project creation**: If prompt implies creating new project → create workspace with random GitHub-style name, switch context, continue with original prompt

### @-mention Autocomplete

- Triggered when user types `@`
- Shows list of available workspaces (subfolders)
- Filters as user types
- Keyboard navigable (↑↓ Enter Esc)
- Shows workspace icon/logo if available

### Sessions

- Each conversation is a "session"
- Sessions displayed in collapsible left sidebar
- Unread/pending sessions have visual indicator
- Session title auto-generated after first agent response
- Title updated throughout conversation to reflect current topic
- Session logo: search for `*logo*` image in repo, fall back to identicon

### Agent Interaction (Middle Pane)

Display for each agent turn:
- Thinking (collapsible)
- Tool calls with arguments and responses (collapsible)
- Final response (markdown rendered)
- File change buttons (created/modified/deleted files)

### Diff Viewer (Right Pane)

- Opens when clicking file change button
- Uses `@pierre/diffs` for rendering
- New files: all green (additions)
- Deleted files: all red (deletions)
- Modified files: proper diff view
- Configurable font

### Persistence

All session data persisted to SQLite:
- Session metadata (id, title, workspace, logo, created, updated)
- Messages (role, content, thinking, tool_calls, file_changes)
- File snapshots (for diff reconstruction)

### Concurrency

Multiple agent sessions can run in parallel.

### Appearance

- Light/dark mode following system preference
- Diff editor font configurable in settings
- Dev-friendly, productivity-focused UI

## Configuration

`~/.accrew/config.json`:
```json
{
  "workspaceFolder": "/Users/waldek/github",
  "diffFont": "JetBrains Mono",
  "diffFontSize": 13
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Agent Pool  │  │  SQLite DB  │  │  File Watcher   │  │
│  │ (SDK+JSONRPC│  │             │  │                 │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│         │               │                  │            │
│         └───────────────┼──────────────────┘            │
│                         │ IPC                           │
├─────────────────────────┼───────────────────────────────┤
│                    Electron Renderer                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  Sidebar    │  │  Chat Pane  │  │   Diff Pane     │  │
│  │  (sessions) │  │  (interact) │  │  (@pierre/diffs)│  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## IPC Events

Main → Renderer:
- `agent:thinking` - streaming thinking content
- `agent:tool-call` - tool invocation with args
- `agent:tool-result` - tool response
- `agent:response` - final response chunk
- `agent:file-change` - file created/modified/deleted
- `agent:done` - agent turn complete
- `session:title-updated` - new title generated

Renderer → Main:
- `session:create` - start new session
- `session:send` - send message to session
- `session:list` - get all sessions
- `session:get` - get session with messages
- `workspace:list` - get available workspaces
- `workspace:match` - LLM match prompt to workspace
- `config:get` / `config:set` - settings

## UI Inspiration

- Linear: clean, fast, keyboard-first
- Screen Studio: polished, professional, subtle animations
- Focus on developer productivity
- Minimal chrome, maximum content
