import { create } from 'zustand'
import type { Session, Message, Workspace, Config, FileChange, ToolCall, GitInfo, ChangedFile } from './shared/types'

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

interface ChangesPanelState {
  open: boolean
  files: ChangedFile[]
  selectedFile: string | null
  userClosed: boolean
  diffContent: string | null  // Raw git diff string or null
  diffType: 'git' | 'tool' | null  // Source of the diff
}

// WHY: pendingOperations tracks async operations that lack UI feedback — used by
// ChatPane header to show "Refreshing...", "Renaming..." etc. instead of stale status
type PendingOperation = 'refreshWorkspaces' | 'regenerateTitle' | 'refreshGitInfo'

interface Store {
  // Pending operations tracking
  pendingOperations: Set<PendingOperation>
  startOperation: (op: PendingOperation) => void
  endOperation: (op: PendingOperation) => void

  // Theme
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void

  // Sidebar
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => Promise<void>

  // Changes panel sizing
  setChangesPanelWidth: (width: number) => Promise<void>
  setChangesFileListHeight: (height: number) => Promise<void>

  // Diff word wrap
  toggleDiffWordWrap: () => Promise<void>

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
  markSessionUnread: (id: string) => Promise<void>
  regenerateTitle: (id: string) => Promise<string | null>
  abortSession: () => Promise<void>
  navigateToPreviousSession: () => void
  navigateToNextSession: () => void

  // Git info per session
  sessionGitInfo: Record<string, GitInfo>
  loadGitInfo: (sessionId: string, workspacePath: string) => Promise<void>
  getGitInfoForSession: (sessionId: string | null) => GitInfo | null

  // Changes panel
  changesPanel: ChangesPanelState
  loadChangedFiles: (sessionId: string) => Promise<void>
  selectChangedFile: (filePath: string) => Promise<void>
  openChangesPanel: () => Promise<void>
  closeChangesPanel: () => void
  resetUserClosed: () => void

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

function rendererDebug(category: string, message: string, data?: unknown): void {
  window.accrew?.debug?.log(category, message, data)
}

export const useStore = create<Store>((set, get) => ({
  // Pending operations tracking
  pendingOperations: new Set<PendingOperation>(),
  startOperation: (op) => set((state) => {
    const newOps = new Set(state.pendingOperations)
    newOps.add(op)
    return { pendingOperations: newOps }
  }),
  endOperation: (op) => set((state) => {
    const newOps = new Set(state.pendingOperations)
    newOps.delete(op)
    return { pendingOperations: newOps }
  }),

  // Theme
  theme: 'light',
  setTheme: (theme) => set({ theme }),

  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarWidth: async (width) => {
    await get().updateConfig({ sidebarWidth: width })
  },

  // Changes panel sizing
  setChangesPanelWidth: async (width) => {
    await get().updateConfig({ changesPanelWidth: width })
  },
  setChangesFileListHeight: async (height) => {
    await get().updateConfig({ changesFileListHeight: height })
  },

  // Diff word wrap
  toggleDiffWordWrap: async () => {
    const current = get().config?.diffWordWrap ?? false
    await get().updateConfig({ diffWordWrap: !current })
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
    set({ 
      activeSessionId: id, 
      messages: [], 
      selectedDiff: null,
      changesPanel: { open: false, files: [], selectedFile: null, userClosed: false, diffContent: null, diffType: null }
    })
    await window.accrew.session.setViewed(id)
    if (id) {
      await get().loadMessages(id)
      await window.accrew.session.markRead(id)
      
      // Load git info for this session's workspace
      const session = get().sessions.find(s => s.id === id)
      if (session?.workspacePath) {
        await get().loadGitInfo(id, session.workspacePath)
      }
      
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
    
    // Load git info for newly created session
    if (session.workspacePath) {
      await get().loadGitInfo(sessionId, session.workspacePath)
    }
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
  markSessionUnread: async (id) => {
    const session = await window.accrew.session.markUnread(id)
    set((state) => ({
      sessions: state.sessions.map(s => s.id === id ? session : s)
    }))
  },
  regenerateTitle: async (id) => {
    get().startOperation('regenerateTitle')
    try {
      return await window.accrew.session.regenerateTitle(id)
    } finally {
      get().endOperation('regenerateTitle')
    }
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
  // WHY: Navigation by recency, not list order — users expect Cmd+[ to go to "previous" (older)
  // session and Cmd+] to go to "next" (newer). Sessions sorted by updatedAt descending.
  navigateToPreviousSession: () => {
    const { sessions, activeSessionId } = get()
    const recentSessions = sessions.filter(s => s.status !== 'archived').sort((a, b) => b.updatedAt - a.updatedAt)
    if (recentSessions.length === 0) return
    if (!activeSessionId) {
      get().setActiveSession(recentSessions[0].id)
      return
    }
    const currentIndex = recentSessions.findIndex(s => s.id === activeSessionId)
    const nextIndex = currentIndex + 1
    if (nextIndex < recentSessions.length) {
      get().setActiveSession(recentSessions[nextIndex].id)
    }
  },
  navigateToNextSession: () => {
    const { sessions, activeSessionId } = get()
    const recentSessions = sessions.filter(s => s.status !== 'archived').sort((a, b) => b.updatedAt - a.updatedAt)
    if (recentSessions.length === 0) return
    if (!activeSessionId) {
      get().setActiveSession(recentSessions[0].id)
      return
    }
    const currentIndex = recentSessions.findIndex(s => s.id === activeSessionId)
    const prevIndex = currentIndex - 1
    if (prevIndex >= 0) {
      get().setActiveSession(recentSessions[prevIndex].id)
    }
  },

  // Git info per session
  // WHY: Using plain object instead of Map for Zustand reactivity — Map.get() doesn't
  // trigger re-renders when internal contents change, only when reference changes
  sessionGitInfo: {} as Record<string, GitInfo>,
  loadGitInfo: async (sessionId, workspacePath) => {
    get().startOperation('refreshGitInfo')
    try {
      const isRepo = await window.accrew.git.isRepo(workspacePath)
      const branch = isRepo ? await window.accrew.git.branch(workspacePath) : null
      const status = isRepo ? await window.accrew.git.status(workspacePath) : []
      const hasChanges = status.length > 0
      set((state) => ({
        sessionGitInfo: { ...state.sessionGitInfo, [sessionId]: { isRepo, branch, hasChanges } }
      }))
    } finally {
      get().endOperation('refreshGitInfo')
    }
  },
  getGitInfoForSession: (sessionId) => {
    if (!sessionId) return null
    return get().sessionGitInfo[sessionId] || null
  },

  // Changes panel
  changesPanel: {
    open: false,
    files: [],
    selectedFile: null,
    userClosed: false,
    diffContent: null,
    diffType: null
  },
  loadChangedFiles: async (sessionId) => {
    const { sessions, streamingStates, changesPanel } = get()
    const session = sessions.find(s => s.id === sessionId)
    if (!session?.workspacePath) return

    const gitInfo = get().sessionGitInfo[sessionId]
    let files: ChangedFile[] = []
    
    if (gitInfo?.isRepo) {
      // Git repo: use git status
      const gitFiles = await window.accrew.git.status(session.workspacePath)
      files = gitFiles.map(f => ({
        path: f.path,
        status: f.status === 'A' ? 'created' 
              : f.status === 'D' ? 'deleted'
              : f.status === '?' ? 'untracked'
              : 'modified'
      }))
      
      // Update hasChanges in gitInfo
      set((state) => ({
        sessionGitInfo: {
          ...state.sessionGitInfo,
          [sessionId]: { ...state.sessionGitInfo[sessionId], hasChanges: files.length > 0 }
        }
      }))
    } else {
      // Non-git: collect file changes from messages and current streaming state
      // WHY: After agent:done, streamingState is cleared but fileChanges are saved to messages in DB.
      // Must check both sources to show all changes across the session.
      const { messages } = get()
      const sessionMessages = messages.filter(m => m.sessionId === sessionId && m.role === 'assistant')
      const workspacePath = session.workspacePath || ''
      
      // Collect from completed messages
      const fileMap = new Map<string, ChangedFile>()
      for (const msg of sessionMessages) {
        if (msg.fileChanges) {
          for (const fc of msg.fileChanges) {
            // WHY: Make path relative to workspace for cleaner display
            const relativePath = fc.path.startsWith(workspacePath) 
              ? fc.path.slice(workspacePath.length).replace(/^\//, '')
              : fc.path
            fileMap.set(relativePath, {
              path: relativePath,
              status: fc.type === 'created' ? 'created'
                    : fc.type === 'deleted' ? 'deleted'
                    : 'modified'
            })
          }
        }
      }
      
      // Also check current streaming state (for in-flight changes)
      const streaming = streamingStates.get(sessionId)
      if (streaming?.fileChanges) {
        for (const fc of streaming.fileChanges) {
          const relativePath = fc.path.startsWith(workspacePath)
            ? fc.path.slice(workspacePath.length).replace(/^\//, '')
            : fc.path
          fileMap.set(relativePath, {
            path: relativePath,
            status: fc.type === 'created' ? 'created'
                  : fc.type === 'deleted' ? 'deleted'
                  : 'modified'
          })
        }
      }
      
      files = Array.from(fileMap.values())
    }

    // WHY: Clear selection if selected file no longer in list — prevents stale diff showing
    const selectedStillExists = files.some(f => f.path === changesPanel.selectedFile)
    set((state) => ({
      changesPanel: {
        ...state.changesPanel,
        files,
        selectedFile: selectedStillExists ? state.changesPanel.selectedFile : null,
        diffContent: selectedStillExists ? state.changesPanel.diffContent : null,
        diffType: selectedStillExists ? state.changesPanel.diffType : null
      }
    }))
  },
  selectChangedFile: async (filePath) => {
    const { activeSessionId, sessions, sessionGitInfo, messages } = get()
    if (!activeSessionId) return
    
    const session = sessions.find(s => s.id === activeSessionId)
    if (!session?.workspacePath) return

    const gitInfo = sessionGitInfo[activeSessionId]
    
    set((state) => ({
      changesPanel: { ...state.changesPanel, selectedFile: filePath, diffContent: null, diffType: null }
    }))

    if (gitInfo?.isRepo) {
      // Git repo: get raw git diff
      const diff = await window.accrew.git.diff(session.workspacePath, filePath)
      set((state) => ({
        changesPanel: { ...state.changesPanel, diffContent: diff, diffType: 'git' }
      }))
    } else {
      // Non-git: find file change in messages to get diff content
      // WHY: For tool-tracked changes, oldContent/newContent are stored with each FileChange in DB
      const sessionMessages = messages.filter(m => m.sessionId === activeSessionId && m.role === 'assistant')
      const workspacePath = session.workspacePath || ''
      
      // Find the most recent change for this file
      let foundChange = null
      for (let i = sessionMessages.length - 1; i >= 0; i--) {
        const msg = sessionMessages[i]
        if (msg.fileChanges) {
          for (const fc of msg.fileChanges) {
            const relativePath = fc.path.startsWith(workspacePath)
              ? fc.path.slice(workspacePath.length).replace(/^\//, '')
              : fc.path
            if (relativePath === filePath) {
              foundChange = fc
              break
            }
          }
          if (foundChange) break
        }
      }
      
      if (foundChange) {
        // Set the diff data for the ChangesPanel to use via selectedDiff
        set({
          selectedDiff: {
            sessionId: activeSessionId,
            messageId: '',
            filePath: filePath,
            oldContent: foundChange.oldContent || '',
            newContent: foundChange.newContent || '',
            changeType: foundChange.type
          }
        })
        set((state) => ({
          changesPanel: { ...state.changesPanel, diffType: 'tool' }
        }))
      }
    }
  },
  openChangesPanel: async () => {
    set((state) => ({
      changesPanel: { ...state.changesPanel, open: true }
    }))
    // Load files when opening panel
    const { activeSessionId } = get()
    if (activeSessionId) {
      await get().loadChangedFiles(activeSessionId)
    }
  },
  closeChangesPanel: () => set((state) => ({
    changesPanel: { ...state.changesPanel, open: false, userClosed: true }
  })),
  resetUserClosed: () => set((state) => ({
    changesPanel: { ...state.changesPanel, userClosed: false }
  })),

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
    get().startOperation('refreshWorkspaces')
    try {
      const workspaces = await window.accrew.workspace.list()
      set({ workspaces })
    } finally {
      get().endOperation('refreshWorkspaces')
    }
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
        
        rendererDebug('store', 'agent:done', { sessionId })
        
        // Remove from streaming sessions and streaming states
        const newStreamingSessions = new Set(get().streamingSessions)
        newStreamingSessions.delete(sessionId)
        const newStreamingStates = new Map(get().streamingStates)
        newStreamingStates.delete(sessionId)
        set({ streamingStates: newStreamingStates, streamingSessions: newStreamingSessions })
        
        // WHY: Database is the single source of truth for completed messages.
        // Instead of constructing the message here, just reload from DB.
        // This eliminates race conditions and duplicate message bugs.
        const { activeSessionId, sessions } = get()
        if (activeSessionId === sessionId) {
          await get().loadMessages(sessionId)
          
          // Refresh git info to update branch indicator (hasChanges)
          const session = sessions.find(s => s.id === sessionId)
          if (session?.workspacePath) {
            await get().loadGitInfo(sessionId, session.workspacePath)
          }
        }
      })
    )

    unsubscribers.push(
      window.accrew.on.agentError(({ sessionId, error }) => {
        console.error(`Agent error in session ${sessionId}:`, error)
        rendererDebug('store', 'agent:error', { sessionId, error })
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

    // WHY: Cmd+R menu item triggers workspace refresh for newly created workspaces (e.g., git worktree)
    // Also refreshes git info (branch name, hasChanges) for the active session
    unsubscribers.push(
      window.accrew.on.workspaceRefresh(async () => {
        get().loadWorkspaces()
        const { activeSessionId, sessions } = get()
        const session = sessions.find(s => s.id === activeSessionId)
        if (session?.workspacePath) {
          await get().loadGitInfo(activeSessionId!, session.workspacePath)
        }
      })
    )

    // Cmd+Shift+T menu item regenerates active session title
    unsubscribers.push(
      window.accrew.on.regenerateTitleMenu(async () => {
        const { activeSessionId } = get()
        if (activeSessionId) {
          await get().regenerateTitle(activeSessionId)
        }
      })
    )

    // View > Toggle Word Wrap menu item
    unsubscribers.push(
      window.accrew.on.toggleDiffWordWrap(() => {
        get().toggleDiffWordWrap()
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
