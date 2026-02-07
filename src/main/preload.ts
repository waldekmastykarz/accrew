import { contextBridge, ipcRenderer, shell } from 'electron'
import type { Session, Message, Workspace, Config, WorkspaceMatch, FileChange, ToolCall } from './types.js'

export type AccrewAPI = typeof api

const api = {
  // Shell operations
  shell: {
    // WHY: Open links in default system browser instead of inside Electron app
    openExternal: (url: string) => shell.openExternal(url),
  },
  // Session operations
  session: {
    create: (workspace: string | undefined, prompt: string, sessionId: string) => 
      ipcRenderer.invoke('session:create', { workspace, prompt, sessionId }) as Promise<Session>,
    send: (sessionId: string, content: string) => 
      ipcRenderer.invoke('session:send', { sessionId, content }) as Promise<void>,
    abort: (sessionId: string) =>
      ipcRenderer.invoke('session:abort', { sessionId }) as Promise<void>,
    list: () => 
      ipcRenderer.invoke('session:list') as Promise<Session[]>,
    get: (sessionId: string) => 
      ipcRenderer.invoke('session:get', { sessionId }) as Promise<{ session: Session; messages: Message[] }>,
    delete: (sessionId: string) => 
      ipcRenderer.invoke('session:delete', { sessionId }) as Promise<void>,
    markRead: (sessionId: string) => 
      ipcRenderer.invoke('session:mark-read', { sessionId }) as Promise<void>,
    setViewed: (sessionId: string | null) =>
      ipcRenderer.invoke('session:set-viewed', { sessionId }) as Promise<void>,
    archive: (sessionId: string) =>
      ipcRenderer.invoke('session:archive', { sessionId }) as Promise<Session>,
    unarchive: (sessionId: string) =>
      ipcRenderer.invoke('session:unarchive', { sessionId }) as Promise<Session>,
    regenerateTitle: (sessionId: string) =>
      ipcRenderer.invoke('session:regenerate-title', { sessionId }) as Promise<string | null>,
  },

  // Workspace operations
  workspace: {
    list: () => 
      ipcRenderer.invoke('workspace:list') as Promise<Workspace[]>,
    match: (prompt: string) => 
      ipcRenderer.invoke('workspace:match', { prompt }) as Promise<WorkspaceMatch>,
  },

  // Config operations
  config: {
    get: () => 
      ipcRenderer.invoke('config:get') as Promise<Config>,
    set: (config: Partial<Config>) => 
      ipcRenderer.invoke('config:set', config) as Promise<Config>,
  },

  // Models operations
  models: {
    list: () =>
      ipcRenderer.invoke('models:list') as Promise<{ id: string; name?: string }[]>,
  },

  // File operations
  file: {
    getDiff: (sessionId: string, messageId: string, filePath: string) =>
      ipcRenderer.invoke('file:get-diff', { sessionId, messageId, filePath }) as Promise<{ oldContent: string; newContent: string }>,
  },

  // Theme
  theme: {
    get: () => 
      ipcRenderer.invoke('theme:get') as Promise<'light' | 'dark'>,
  },

  // Event listeners
  on: {
    agentThinking: (callback: (data: { sessionId: string; content: string }) => void) => {
      const listener = (_: unknown, data: { sessionId: string; content: string }) => callback(data)
      ipcRenderer.on('agent:thinking', listener)
      return () => ipcRenderer.removeListener('agent:thinking', listener)
    },
    agentToolCall: (callback: (data: { sessionId: string; toolCall: ToolCall }) => void) => {
      const listener = (_: unknown, data: { sessionId: string; toolCall: ToolCall }) => callback(data)
      ipcRenderer.on('agent:tool-call', listener)
      return () => ipcRenderer.removeListener('agent:tool-call', listener)
    },
    agentToolResult: (callback: (data: { sessionId: string; toolCallId: string; result: unknown }) => void) => {
      const listener = (_: unknown, data: { sessionId: string; toolCallId: string; result: unknown }) => callback(data)
      ipcRenderer.on('agent:tool-result', listener)
      return () => ipcRenderer.removeListener('agent:tool-result', listener)
    },
    agentResponse: (callback: (data: { sessionId: string; content: string }) => void) => {
      const listener = (_: unknown, data: { sessionId: string; content: string }) => callback(data)
      ipcRenderer.on('agent:response', listener)
      return () => ipcRenderer.removeListener('agent:response', listener)
    },
    agentFileChange: (callback: (data: { sessionId: string; change: FileChange }) => void) => {
      const listener = (_: unknown, data: { sessionId: string; change: FileChange }) => callback(data)
      ipcRenderer.on('agent:file-change', listener)
      return () => ipcRenderer.removeListener('agent:file-change', listener)
    },
    agentDone: (callback: (data: { sessionId: string }) => void) => {
      const listener = (_: unknown, data: { sessionId: string }) => callback(data)
      ipcRenderer.on('agent:done', listener)
      return () => ipcRenderer.removeListener('agent:done', listener)
    },
    agentError: (callback: (data: { sessionId: string; error: string }) => void) => {
      const listener = (_: unknown, data: { sessionId: string; error: string }) => callback(data)
      ipcRenderer.on('agent:error', listener)
      return () => ipcRenderer.removeListener('agent:error', listener)
    },
    sessionTitleUpdated: (callback: (data: { sessionId: string; title: string }) => void) => {
      const listener = (_: unknown, data: { sessionId: string; title: string }) => callback(data)
      ipcRenderer.on('session:title-updated', listener)
      return () => ipcRenderer.removeListener('session:title-updated', listener)
    },
    sessionUpdated: (callback: (data: { session: Session }) => void) => {
      const listener = (_: unknown, data: { session: Session }) => callback(data)
      ipcRenderer.on('session:updated', listener)
      return () => ipcRenderer.removeListener('session:updated', listener)
    },
    themeChanged: (callback: (theme: 'light' | 'dark') => void) => {
      const listener = (_: unknown, theme: 'light' | 'dark') => callback(theme)
      ipcRenderer.on('theme:changed', listener)
      return () => ipcRenderer.removeListener('theme:changed', listener)
    },
    workspaceRefresh: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('workspace:refresh', listener)
      return () => ipcRenderer.removeListener('workspace:refresh', listener)
    },
    regenerateTitleMenu: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('session:regenerate-title-menu', listener)
      return () => ipcRenderer.removeListener('session:regenerate-title-menu', listener)
    },
  },
}

contextBridge.exposeInMainWorld('accrew', api)
