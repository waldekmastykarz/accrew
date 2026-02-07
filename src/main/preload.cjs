const { contextBridge, ipcRenderer, shell } = require('electron')

const api = {
  // Shell operations
  shell: {
    // WHY: Open links in default system browser instead of inside Electron app
    openExternal: (url) => shell.openExternal(url),
  },
  // Session operations
  session: {
    create: (workspace, prompt, sessionId) => 
      ipcRenderer.invoke('session:create', { workspace, prompt, sessionId }),
    send: (sessionId, content) => 
      ipcRenderer.invoke('session:send', { sessionId, content }),
    abort: (sessionId) => 
      ipcRenderer.invoke('session:abort', { sessionId }),
    list: () => 
      ipcRenderer.invoke('session:list'),
    get: (sessionId) => 
      ipcRenderer.invoke('session:get', { sessionId }),
    delete: (sessionId) => 
      ipcRenderer.invoke('session:delete', { sessionId }),
    markRead: (sessionId) => 
      ipcRenderer.invoke('session:mark-read', { sessionId }),
    setViewed: (sessionId) => 
      ipcRenderer.invoke('session:set-viewed', { sessionId }),
    archive: (sessionId) => 
      ipcRenderer.invoke('session:archive', { sessionId }),
    unarchive: (sessionId) => 
      ipcRenderer.invoke('session:unarchive', { sessionId }),
    regenerateTitle: (sessionId) =>
      ipcRenderer.invoke('session:regenerate-title', { sessionId }),
  },

  // Workspace operations
  workspace: {
    list: () => 
      ipcRenderer.invoke('workspace:list'),
    match: (prompt) => 
      ipcRenderer.invoke('workspace:match', { prompt }),
  },

  // Config operations
  config: {
    get: () => 
      ipcRenderer.invoke('config:get'),
    set: (config) => 
      ipcRenderer.invoke('config:set', config),
  },

  // Models operations
  models: {
    list: () =>
      ipcRenderer.invoke('models:list'),
  },

  // File operations
  file: {
    getDiff: (sessionId, messageId, filePath) =>
      ipcRenderer.invoke('file:get-diff', { sessionId, messageId, filePath }),
  },

  // Git operations
  git: {
    isRepo: (path) =>
      ipcRenderer.invoke('git:is-repo', { path }),
    branch: (path) =>
      ipcRenderer.invoke('git:branch', { path }),
    status: (path) =>
      ipcRenderer.invoke('git:status', { path }),
    diff: (path, filePath) =>
      ipcRenderer.invoke('git:diff', { path, filePath }),
  },

  // Theme
  theme: {
    get: () => 
      ipcRenderer.invoke('theme:get'),
  },

  // Event listeners
  on: {
    agentThinking: (callback) => {
      const listener = (_, data) => callback(data)
      ipcRenderer.on('agent:thinking', listener)
      return () => ipcRenderer.removeListener('agent:thinking', listener)
    },
    agentToolCall: (callback) => {
      const listener = (_, data) => callback(data)
      ipcRenderer.on('agent:tool-call', listener)
      return () => ipcRenderer.removeListener('agent:tool-call', listener)
    },
    agentToolResult: (callback) => {
      const listener = (_, data) => callback(data)
      ipcRenderer.on('agent:tool-result', listener)
      return () => ipcRenderer.removeListener('agent:tool-result', listener)
    },
    agentResponse: (callback) => {
      const listener = (_, data) => callback(data)
      ipcRenderer.on('agent:response', listener)
      return () => ipcRenderer.removeListener('agent:response', listener)
    },
    agentFileChange: (callback) => {
      const listener = (_, data) => callback(data)
      ipcRenderer.on('agent:file-change', listener)
      return () => ipcRenderer.removeListener('agent:file-change', listener)
    },
    agentDone: (callback) => {
      const listener = (_, data) => callback(data)
      ipcRenderer.on('agent:done', listener)
      return () => ipcRenderer.removeListener('agent:done', listener)
    },
    agentError: (callback) => {
      const listener = (_, data) => callback(data)
      ipcRenderer.on('agent:error', listener)
      return () => ipcRenderer.removeListener('agent:error', listener)
    },
    sessionTitleUpdated: (callback) => {
      const listener = (_, data) => callback(data)
      ipcRenderer.on('session:title-updated', listener)
      return () => ipcRenderer.removeListener('session:title-updated', listener)
    },
    sessionUpdated: (callback) => {
      const listener = (_, data) => callback(data)
      ipcRenderer.on('session:updated', listener)
      return () => ipcRenderer.removeListener('session:updated', listener)
    },
    themeChanged: (callback) => {
      const listener = (_, theme) => callback(theme)
      ipcRenderer.on('theme:changed', listener)
      return () => ipcRenderer.removeListener('theme:changed', listener)
    },
  },
}

contextBridge.exposeInMainWorld('accrew', api)
