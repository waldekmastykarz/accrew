import { create } from 'zustand'
import type { Session, Message, Workspace, Config, FileChange, ToolCall } from './shared/types'

interface DiffSelection {
  sessionId: string
  messageId: string
  filePath: string
  oldContent: string
  newContent: string
  changeType: 'created' | 'modified' | 'deleted'
}

interface StreamingState {
  thinking: string
  content: string
  toolCalls: ToolCall[]
  fileChanges: FileChange[]
}

interface Store {
  // Theme
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void

  // Sidebar
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => Promise<void>

  // Sessions
  sessions: Session[]
  activeSessionId: string | null
  streamingSessions: Set<string>
  aborting: boolean
  loadSessions: () => Promise<void>
  setActiveSession: (id: string | null) => void
  createSession: (workspace: string | undefined, prompt: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  archiveSession: (id: string) => Promise<void>
  unarchiveSession: (id: string) => Promise<void>
  abortSession: () => Promise<void>

  // Messages
  messages: Message[]
  loadMessages: (sessionId: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>

  // Streaming state for active session
  streaming: StreamingState | null
  setStreaming: (state: StreamingState | null) => void
  appendThinking: (content: string) => void
  appendContent: (content: string) => void
  addToolCall: (toolCall: ToolCall) => void
  updateToolCall: (id: string, result: unknown) => void
  addFileChange: (change: FileChange) => void

  // Workspaces
  workspaces: Workspace[]
  loadWorkspaces: () => Promise<void>

  // Config
  config: Config | null
  loadConfig: () => Promise<void>
  updateConfig: (updates: Partial<Config>) => Promise<void>

  // Diff viewer
  selectedDiff: DiffSelection | null
  selectDiff: (sessionId: string, messageId: string, filePath: string, changeType: 'created' | 'modified' | 'deleted') => Promise<void>
  setDiffFromData: (data: { filePath: string; oldContent: string; newContent: string; changeType: 'created' | 'modified' | 'deleted' }) => void
  closeDiff: () => void

  // Settings dialog
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void

  // Event listeners
  setupEventListeners: () => () => void
}

export const useStore = create<Store>((set, get) => ({
  // Theme
  theme: 'light',
  setTheme: (theme) => set({ theme }),

  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarWidth: async (width) => {
    await get().updateConfig({ sidebarWidth: width })
  },

  // Sessions
  sessions: [],
  activeSessionId: null,
  streamingSessions: new Set<string>(),
  aborting: false,
  loadSessions: async () => {
    const sessions = await window.accrew.session.list()
    set({ sessions })
  },
  setActiveSession: async (id) => {
    set({ activeSessionId: id, streaming: null, selectedDiff: null })
    await window.accrew.session.setViewed(id)
    if (id) {
      await get().loadMessages(id)
      await window.accrew.session.markRead(id)
      // Update local state
      set((state) => ({
        sessions: state.sessions.map(s => 
          s.id === id ? { ...s, hasUnread: false } : s
        )
      }))
    } else {
      set({ messages: [] })
    }
  },
  createSession: async (workspace, prompt) => {
    // Generate session ID locally and set state BEFORE IPC to avoid race with streaming events
    const sessionId = crypto.randomUUID()
    
    // Create user message for the initial prompt
    const userMessage: Message = {
      id: crypto.randomUUID(),
      sessionId,
      role: 'user',
      content: prompt,
      createdAt: Date.now()
    }
    
    set((state) => ({
      activeSessionId: sessionId,
      messages: [userMessage],
      streaming: { thinking: '', content: '', toolCalls: [], fileChanges: [] },
      streamingSessions: new Set([...state.streamingSessions, sessionId])
    }))
    
    // Mark as viewed BEFORE creating session to prevent race with agent completion
    await window.accrew.session.setViewed(sessionId)
    
    const session = await window.accrew.session.create(workspace, prompt, sessionId)
    set((state) => ({
      sessions: [session, ...state.sessions]
    }))
  },
  deleteSession: async (id) => {
    await window.accrew.session.delete(id)
    set((state) => ({
      sessions: state.sessions.filter(s => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      messages: state.activeSessionId === id ? [] : state.messages
    }))
  },
  archiveSession: async (id) => {
    const session = await window.accrew.session.archive(id)
    set((state) => ({
      sessions: state.sessions.map(s => s.id === id ? session : s)
    }))
  },
  unarchiveSession: async (id) => {
    const session = await window.accrew.session.unarchive(id)
    set((state) => ({
      sessions: state.sessions.map(s => s.id === id ? session : s)
    }))
  },
  abortSession: async () => {
    const { activeSessionId, streaming } = get()
    if (!activeSessionId || !streaming) return
    
    // Set aborting state - disables input until abort completes
    set({ aborting: true })
    
    try {
      // Wait for abort to complete
      await window.accrew.session.abort(activeSessionId)
    } catch (err) {
      console.error('Error aborting session:', err)
    } finally {
      // Clear streaming and aborting state
      const newStreamingSessions = new Set(get().streamingSessions)
      newStreamingSessions.delete(activeSessionId)
      set({ 
        streaming: null, 
        streamingSessions: newStreamingSessions,
        aborting: false
      })
    }
  },

  // Messages
  messages: [],
  loadMessages: async (sessionId) => {
    const { messages } = await window.accrew.session.get(sessionId)
    set({ messages })
  },
  sendMessage: async (content) => {
    const { activeSessionId } = get()
    if (!activeSessionId) return

    // Add user message immediately
    const userMessage: Message = {
      id: crypto.randomUUID(),
      sessionId: activeSessionId,
      role: 'user',
      content,
      createdAt: Date.now()
    }
    set((state) => ({
      messages: [...state.messages, userMessage],
      streaming: { thinking: '', content: '', toolCalls: [], fileChanges: [] },
      streamingSessions: new Set([...state.streamingSessions, activeSessionId])
    }))

    await window.accrew.session.send(activeSessionId, content)
  },

  // Streaming
  streaming: null,
  setStreaming: (streaming) => set({ streaming }),
  appendThinking: (content) => set((state) => ({
    streaming: state.streaming 
      ? { ...state.streaming, thinking: state.streaming.thinking + content }
      : null
  })),
  appendContent: (content) => set((state) => ({
    streaming: state.streaming
      ? { ...state.streaming, content: state.streaming.content + content }
      : null
  })),
  addToolCall: (toolCall) => set((state) => ({
    streaming: state.streaming
      ? { ...state.streaming, toolCalls: [...state.streaming.toolCalls, toolCall] }
      : null
  })),
  updateToolCall: (id, result) => set((state) => ({
    streaming: state.streaming
      ? {
          ...state.streaming,
          toolCalls: state.streaming.toolCalls.map(tc =>
            tc.id === id ? { ...tc, result, status: 'completed' as const } : tc
          )
        }
      : null
  })),
  addFileChange: (change) => set((state) => ({
    streaming: state.streaming
      ? { ...state.streaming, fileChanges: [...state.streaming.fileChanges, change] }
      : null
  })),

  // Workspaces
  workspaces: [],
  loadWorkspaces: async () => {
    const workspaces = await window.accrew.workspace.list()
    set({ workspaces })
  },

  // Config
  config: null,
  loadConfig: async () => {
    const config = await window.accrew.config.get()
    set({ config })
  },
  updateConfig: async (updates) => {
    const config = await window.accrew.config.set(updates)
    set({ config })
    // Reload workspaces if folder or depth changed
    if (updates.workspaceFolder || updates.workspaceDepth !== undefined) {
      await get().loadWorkspaces()
    }
  },

  // Diff viewer
  selectedDiff: null,
  selectDiff: async (sessionId, messageId, filePath, changeType) => {
    const diff = await window.accrew.file.getDiff(sessionId, messageId, filePath)
    if (diff) {
      set({
        selectedDiff: {
          sessionId,
          messageId,
          filePath,
          oldContent: diff.oldContent,
          newContent: diff.newContent,
          changeType
        }
      })
    }
  },
  setDiffFromData: (data) => set({
    selectedDiff: {
      sessionId: '',
      messageId: '',
      filePath: data.filePath,
      oldContent: data.oldContent,
      newContent: data.newContent,
      changeType: data.changeType
    }
  }),
  closeDiff: () => set({ selectedDiff: null }),

  // Settings
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  // Event listeners
  setupEventListeners: () => {
    const unsubscribers: (() => void)[] = []

    unsubscribers.push(
      window.accrew.on.agentThinking(({ sessionId, content }) => {
        if (get().aborting) return
        if (get().activeSessionId === sessionId) {
          get().appendThinking(content)
        }
      })
    )

    unsubscribers.push(
      window.accrew.on.agentToolCall(({ sessionId, toolCall }) => {
        if (get().aborting) return
        if (get().activeSessionId === sessionId) {
          get().addToolCall(toolCall)
        }
      })
    )

    unsubscribers.push(
      window.accrew.on.agentToolResult(({ sessionId, toolCallId, result }) => {
        if (get().aborting) return
        if (get().activeSessionId === sessionId) {
          get().updateToolCall(toolCallId, result)
        }
      })
    )

    unsubscribers.push(
      window.accrew.on.agentResponse(({ sessionId, content }) => {
        if (get().aborting) return
        if (get().activeSessionId === sessionId) {
          get().appendContent(content)
        }
      })
    )

    unsubscribers.push(
      window.accrew.on.agentFileChange(({ sessionId, change }) => {
        if (get().aborting) return
        if (get().activeSessionId === sessionId) {
          get().addFileChange(change)
        }
      })
    )

    unsubscribers.push(
      window.accrew.on.agentDone(({ sessionId, messageId, thinking, content, toolCalls, fileChanges }) => {
        // Skip if we're aborting - the abort handler will clean up
        if (get().aborting) return
        
        // Remove from streaming sessions
        const newStreamingSessions = new Set(get().streamingSessions)
        newStreamingSessions.delete(sessionId)
        
        if (get().activeSessionId === sessionId) {
          // Use the message data from agent-manager (with correct messageId for database lookups)
          if (messageId) {
            const message: Message = {
              id: messageId,
              sessionId,
              role: 'assistant',
              content: content || '',
              thinking: thinking || undefined,
              toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
              fileChanges: fileChanges && fileChanges.length > 0 ? fileChanges : undefined,
              createdAt: Date.now()
            }
            set((state) => ({
              messages: [...state.messages, message],
              streaming: null,
              streamingSessions: newStreamingSessions
            }))
          } else {
            set({ streaming: null, streamingSessions: newStreamingSessions })
          }
        } else {
          set({ streamingSessions: newStreamingSessions })
        }
      })
    )

    unsubscribers.push(
      window.accrew.on.agentError(({ sessionId, error }) => {
        console.error(`Agent error in session ${sessionId}:`, error)
        const newStreamingSessions = new Set(get().streamingSessions)
        newStreamingSessions.delete(sessionId)
        set({ streaming: null, streamingSessions: newStreamingSessions })
      })
    )

    unsubscribers.push(
      window.accrew.on.sessionTitleUpdated(({ sessionId, title }) => {
        set((state) => ({
          sessions: state.sessions.map(s =>
            s.id === sessionId ? { ...s, title } : s
          )
        }))
      })
    )

    unsubscribers.push(
      window.accrew.on.sessionUpdated(({ session }) => {
        set((state) => ({
          sessions: state.sessions.map(s =>
            s.id === session.id 
              // Preserve hasUnread: false if we're currently viewing this session
              ? { ...session, hasUnread: state.activeSessionId === session.id ? false : session.hasUnread }
              : s
          )
        }))
      })
    )

    unsubscribers.push(
      window.accrew.on.themeChanged((theme) => {
        get().setTheme(theme)
      })
    )

    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }
}))
