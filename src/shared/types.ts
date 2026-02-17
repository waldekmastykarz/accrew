// Shared types between main and renderer

export interface Session {
  id: string
  title: string
  workspace: string | null // null = system agent
  workspacePath: string | null
  logo: string | null // base64 or path
  createdAt: number
  updatedAt: number
  hasUnread: boolean
  status: 'active' | 'completed' | 'error' | 'archived'
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  result?: unknown
  status: 'pending' | 'running' | 'completed' | 'error'
}

export interface FileChange {
  path: string
  type: 'created' | 'modified' | 'deleted'
  oldContent?: string
  newContent?: string
}

export interface GitFileStatus {
  path: string
  status: 'A' | 'M' | 'D' | '?'
}

export interface GitInfo {
  isRepo: boolean
  branch: string | null
  hasChanges: boolean
}

export interface ChangedFile {
  path: string
  status: 'created' | 'modified' | 'deleted' | 'untracked'
}

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
  toolCalls?: ToolCall[]
  fileChanges?: FileChange[]
  createdAt: number
}

export interface Workspace {
  name: string
  displayName: string // Qualified name when duplicates exist (e.g., "parent/name")
  path: string
  logo: string | null
  readme?: string
  copilotInstructions?: string
}

export interface Config {
  workspaceFolder: string
  workspaceDepth: number
  diffFont: string
  diffFontSize: number
  diffWordWrap: boolean
  sidebarWidth: number
  changesPanelWidth: number
  changesFileListHeight: number
  model: string
  debug: boolean
}

export interface WorkspaceMatch {
  workspace: Workspace | null
  confidence: number
  reason: string
}

// IPC Channel types
export type IpcChannels = {
  // Main -> Renderer
  'agent:thinking': { sessionId: string; content: string }
  'agent:tool-call': { sessionId: string; toolCall: ToolCall }
  'agent:tool-result': { sessionId: string; toolCallId: string; result: unknown }
  'agent:response': { sessionId: string; content: string }
  'agent:file-change': { sessionId: string; change: FileChange }
  'agent:done': { sessionId: string }
  'agent:error': { sessionId: string; error: string }
  'session:title-updated': { sessionId: string; title: string }
  'session:updated': { session: Session }
  
  // Renderer -> Main (invoke)
  'session:create': { workspace?: string; prompt: string }
  'session:send': { sessionId: string; content: string }
  'session:list': void
  'session:get': { sessionId: string }
  'session:delete': { sessionId: string }
  'session:mark-read': { sessionId: string }
  'session:mark-unread': { sessionId: string }
  'workspace:list': void
  'workspace:match': { prompt: string }
  'config:get': void
  'config:set': Partial<Config>
  'file:get-diff': { sessionId: string; messageId: string; filePath: string }
}
