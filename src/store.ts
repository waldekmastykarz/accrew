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

  // Streaming state per session (keyed by sessionId)
  streamingStates: Map<string, StreamingState>
  getStreamingForSession: (sessionId: string | null) => StreamingState | null
  setStreamingForSession: (sessionId: string, state: StreamingState | null) => void
  appendThinkingForSession: (sessionId: string, content: string) => void
  appendContentForSession: (sessionId: string, content: string) => void
  addToolCallForSession: (sessionId: string, toolCall: ToolCall) => void
  updateToolCallForSession: (sessionId: string, toolCallId: string, result: unknown) => void
  addFileChangeForSession: (sessionId: string, change: FileChange) => void

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

// WHY: Guard against duplicate listener registration — HMR and React strict mode
// can call setupEventListeners multiple times. Without this guard, events fire
// multiple times causing duplicate messages and cross-session contamination
let listenersSetup = false
let cleanupFn: (() => void) | null = null

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
    // WHY: Must clear messages FIRST before any async calls — otherwise old messages
    // flash briefly during the IPC roundtrip. Clear immediately, then load new ones.
    set({ activeSessionId: id, messages: [], selectedDiff: null })
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
    
    set((state) => {
      const newStreamingStates = new Map(state.streamingStates)
      newStreamingStates.set(sessionId, { thinking: '', content: '', toolCalls: [], fileChanges: [] })
      return {
        activeSessionId: sessionId,
        messages: [userMessage],
        streamingStates: newStreamingStates,
        streamingSessions: new Set([...state.streamingSessions, sessionId])
      }
    })
    
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
    const { activeSessionId, streamingStates } = get()
    if (!activeSessionId || !streamingStates.has(activeSessionId)) return
    
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
      const newStreamingStates = new Map(get().streamingStates)
      newStreamingStates.delete(activeSessionId)
      set({ 
        streamingStates: newStreamingStates, 
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
    set((state) => {
      const newStreamingStates = new Map(state.streamingStates)
      newStreamingStates.set(activeSessionId, { thinking: '', content: '', toolCalls: [], fileChanges: [] })
      return {
        messages: [...state.messages, userMessage],
        streamingStates: newStreamingStates,
        streamingSessions: new Set([...state.streamingSessions, activeSessionId])
      }
    })

    await window.accrew.session.send(activeSessionId, content)
  },

  // WHY: streamingStates is a Map keyed by sessionId — parallel sessions each need
  // their own streaming state. A single `streaming` object gets overwritten when
  // creating a new session, causing cross-session content leaking
  streamingStates: new Map<string, StreamingState>(),
  getStreamingForSession: (sessionId) => {
    if (!sessionId) return null
    return get().streamingStates.get(sessionId) || null
  },
  setStreamingForSession: (sessionId, state) => set((s) => {
    const newStates = new Map(s.streamingStates)
    if (state) {
      newStates.set(sessionId, state)
    } else {
      newStates.delete(sessionId)
    }
    return { streamingStates: newStates }
  }),
  appendThinkingForSession: (sessionId, content) => set((state) => {
    const current = state.streamingStates.get(sessionId)
    if (!current) return state
    const newStates = new Map(state.streamingStates)
    newStates.set(sessionId, { ...current, thinking: current.thinking + content })
    return { streamingStates: newStates }
  }),
  appendContentForSession: (sessionId, content) => set((state) => {
    const current = state.streamingStates.get(sessionId)
    if (!current) return state
    const newStates = new Map(state.streamingStates)
    newStates.set(sessionId, { ...current, content: current.content + content })
    return { streamingStates: newStates }
  }),
  addToolCallForSession: (sessionId, toolCall) => set((state) => {
    const current = state.streamingStates.get(sessionId)
    if (!current) return state
    const newStates = new Map(state.streamingStates)
    newStates.set(sessionId, { ...current, toolCalls: [...current.toolCalls, toolCall] })
    return { streamingStates: newStates }
  }),
  updateToolCallForSession: (sessionId, toolCallId, result) => set((state) => {
    const current = state.streamingStates.get(sessionId)
    if (!current) return state
    const newStates = new Map(state.streamingStates)
    newStates.set(sessionId, {
      ...current,
      toolCalls: current.toolCalls.map(tc =>
        tc.id === toolCallId ? { ...tc, result, status: 'completed' as const } : tc
      )
    })
    return { streamingStates: newStates }
  }),
  addFileChangeForSession: (sessionId, change) => set((state) => {
    const current = state.streamingStates.get(sessionId)
    if (!current) return state
    const newStates = new Map(state.streamingStates)
    newStates.set(sessionId, { ...current, fileChanges: [...current.fileChanges, change] })
    return { streamingStates: newStates }
  }),

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
    // Prevent duplicate registration
    if (listenersSetup && cleanupFn) {
      return cleanupFn
    }
    
    const unsubscribers: (() => void)[] = []

    unsubscribers.push(
      window.accrew.on.agentThinking(({ sessionId, content }) => {
        if (get().aborting) return
        // Accumulate for this session if it has streaming state
        if (get().streamingStates.has(sessionId)) {
          get().appendThinkingForSession(sessionId, content)
        }
      })
    )

    unsubscribers.push(
      window.accrew.on.agentToolCall(({ sessionId, toolCall }) => {
        if (get().aborting) return
        if (get().streamingStates.has(sessionId)) {
          get().addToolCallForSession(sessionId, toolCall)
        }
      })
    )

    unsubscribers.push(
      window.accrew.on.agentToolResult(({ sessionId, toolCallId, result }) => {
        if (get().aborting) return
        if (get().streamingStates.has(sessionId)) {
          get().updateToolCallForSession(sessionId, toolCallId, result)
        }
      })
    )

    unsubscribers.push(
      window.accrew.on.agentResponse(({ sessionId, content }) => {
        if (get().aborting) return
        if (get().streamingStates.has(sessionId)) {
          get().appendContentForSession(sessionId, content)
        }
      })
    )

    unsubscribers.push(
      window.accrew.on.agentFileChange(({ sessionId, change }) => {
        if (get().aborting) return
        if (get().streamingStates.has(sessionId)) {
          get().addFileChangeForSession(sessionId, change)
        }
      })
    )

    unsubscribers.push(
      window.accrew.on.agentDone(async ({ sessionId }) => {
        // Skip if we're aborting - the abort handler will clean up
        if (get().aborting) return
        
        // Remove from streaming sessions and streaming states
        const newStreamingSessions = new Set(get().streamingSessions)
        newStreamingSessions.delete(sessionId)
        const newStreamingStates = new Map(get().streamingStates)
        newStreamingStates.delete(sessionId)
        set({ streamingStates: newStreamingStates, streamingSessions: newStreamingSessions })
        
        // WHY: Database is the single source of truth for completed messages.
        // Instead of constructing the message here, just reload from DB.
        // This eliminates race conditions and duplicate message bugs.
        const { activeSessionId } = get()
        if (activeSessionId === sessionId) {
          await get().loadMessages(sessionId)
        }
      })
    )

    unsubscribers.push(
      window.accrew.on.agentError(({ sessionId, error }) => {
        console.error(`Agent error in session ${sessionId}:`, error)
        const newStreamingSessions = new Set(get().streamingSessions)
        newStreamingSessions.delete(sessionId)
        const newStreamingStates = new Map(get().streamingStates)
        newStreamingStates.delete(sessionId)
        set({ streamingStates: newStreamingStates, streamingSessions: newStreamingSessions })
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

    listenersSetup = true
    cleanupFn = () => {
      unsubscribers.forEach(unsub => unsub())
      listenersSetup = false
      cleanupFn = null
    }
    
    return cleanupFn
  }
}))
