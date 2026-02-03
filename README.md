# Accrew

AI Agent Command Center — control local coding agents across multiple projects from one place.

![Accrew](https://via.placeholder.com/800x450?text=Accrew+Screenshot)

## Features

- **Unified Command Center** — Interact with AI agents across all your projects
- **Smart Workspace Routing** — `@workspace` mentions or natural language detection
- **Auto-creates Projects** — "Create a new React app" generates a fresh workspace
- **Session Management** — All conversations persisted and searchable
- **Rich Agent Output** — View thinking, tool calls, and responses
- **Inline Diff Viewer** — See file changes with `@pierre/diffs`
- **Light/Dark Mode** — Follows system preferences

## Quick Start

```bash
# Install dependencies
npm install

# Rebuild native modules for Electron
npm run postinstall

# Start development server
npm run dev

# Build for production
npm run build
```

## Requirements

- Node.js 18+
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) installed
- GitHub Copilot subscription

## Configuration

Settings stored in `~/.accrew/config.json`:

```json
{
  "workspaceFolder": "/path/to/your/projects",
  "diffFont": "JetBrains Mono",
  "diffFontSize": 13
}
```

## Usage

### Direct workspace targeting
```
@my-project fix the failing tests
```

### Natural language routing
```
what's the status of the todo app?
```
(Automatically routes to matching workspace)

### Create new projects
```
create a new Next.js app with auth
```
(Creates workspace with random name like `bold-fox-123`)

## Tech Stack

- **Frontend**: React 19, Tailwind CSS, Zustand
- **Backend**: Electron, SQLite (better-sqlite3)
- **Agent**: GitHub Copilot SDK with Claude Opus 4.5
- **Diff Viewer**: @pierre/diffs

## Development

```bash
# Run in development with hot reload
npm run dev

# Type check
npx tsc --noEmit

# Lint
npm run lint
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Agent Pool  │  │  SQLite DB  │  │  File Watcher   │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│         │               │                  │            │
│         └───────────────┼──────────────────┘            │
│                         │ IPC                           │
├─────────────────────────┼───────────────────────────────┤
│                    Electron Renderer                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  Sidebar    │  │  Chat Pane  │  │   Diff Pane     │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## License

MIT
