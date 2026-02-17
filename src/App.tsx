import { useEffect, useCallback, useState, useRef } from 'react'
import { useStore } from './store'
import { Sidebar, SidebarHandle } from './components/Sidebar'
import { ChatPane, ChatPaneHandle } from './components/ChatPane'
import { ChangesPanel } from './components/ChangesPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { PanelLeft, PanelLeftClose } from 'lucide-react'

const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 400
const MIN_CHANGES_PANEL_WIDTH = 300
const MAX_CHANGES_PANEL_WIDTH = 800

export default function App() {
  const { 
    theme, 
    setTheme, 
    sidebarCollapsed,
    toggleSidebar,
    changesPanel,
    config,
    loadSessions,
    loadWorkspaces,
    loadConfig,
    setupEventListeners,
    setActiveSession,
    setSidebarWidth,
    setChangesPanelWidth,
    setSettingsOpen,
    openChangesPanel,
    closeChangesPanel,
    loadChangedFiles,
    activeSessionId,
    streamingSessions,
    abortSession,
    archiveSession,
    navigateToPreviousSession,
    navigateToNextSession,
    toggleDiffWordWrap
  } = useStore()

  // Refs for child component handles
  const sidebarRef = useRef<SidebarHandle>(null)
  const chatPaneRef = useRef<ChatPaneHandle>(null)

  // Sidebar resize state
  const [isSidebarDragging, setIsSidebarDragging] = useState(false)
  const [localSidebarWidth, setLocalSidebarWidth] = useState(config?.sidebarWidth ?? 256)
  const sidebarDragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  // Changes panel resize state
  const [isChangesPanelDragging, setIsChangesPanelDragging] = useState(false)
  const [localChangesPanelWidth, setLocalChangesPanelWidth] = useState(config?.changesPanelWidth ?? 500)
  const changesPanelDragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  // Sync local widths with config
  useEffect(() => {
    if (config?.sidebarWidth) {
      setLocalSidebarWidth(config.sidebarWidth)
    }
    if (config?.changesPanelWidth) {
      setLocalChangesPanelWidth(config.changesPanelWidth)
    }
  }, [config?.sidebarWidth, config?.changesPanelWidth])

  // Sidebar drag handlers
  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsSidebarDragging(true)
    sidebarDragRef.current = { startX: e.clientX, startWidth: localSidebarWidth }
  }, [localSidebarWidth])

  const handleSidebarMouseMove = useCallback((e: MouseEvent) => {
    if (!isSidebarDragging || !sidebarDragRef.current) return
    
    const delta = e.clientX - sidebarDragRef.current.startX
    const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, sidebarDragRef.current.startWidth + delta))
    setLocalSidebarWidth(newWidth)
  }, [isSidebarDragging])

  const handleSidebarMouseUp = useCallback(() => {
    if (isSidebarDragging) {
      setIsSidebarDragging(false)
      setSidebarWidth(localSidebarWidth)
      sidebarDragRef.current = null
    }
  }, [isSidebarDragging, localSidebarWidth, setSidebarWidth])

  // Changes panel drag handlers
  const handleChangesPanelMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsChangesPanelDragging(true)
    changesPanelDragRef.current = { startX: e.clientX, startWidth: localChangesPanelWidth }
  }, [localChangesPanelWidth])

  const handleChangesPanelMouseMove = useCallback((e: MouseEvent) => {
    if (!isChangesPanelDragging || !changesPanelDragRef.current) return
    
    // Note: negative delta because dragging left increases width
    const delta = changesPanelDragRef.current.startX - e.clientX
    const newWidth = Math.min(MAX_CHANGES_PANEL_WIDTH, Math.max(MIN_CHANGES_PANEL_WIDTH, changesPanelDragRef.current.startWidth + delta))
    setLocalChangesPanelWidth(newWidth)
  }, [isChangesPanelDragging])

  const handleChangesPanelMouseUp = useCallback(() => {
    if (isChangesPanelDragging) {
      setIsChangesPanelDragging(false)
      setChangesPanelWidth(localChangesPanelWidth)
      changesPanelDragRef.current = null
    }
  }, [isChangesPanelDragging, localChangesPanelWidth, setChangesPanelWidth])

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isStreaming = activeSessionId ? streamingSessions.has(activeSessionId) : false

    // Escape: Stop generating (only when streaming)
    if (e.key === 'Escape' && isStreaming) {
      e.preventDefault()
      abortSession()
      return
    }

    // Cmd+N: New session
    if (e.metaKey && e.key === 'n') {
      e.preventDefault()
      setActiveSession(null)
      return
    }

    // Cmd+B: Toggle sidebar
    if (e.metaKey && e.key === 'b') {
      e.preventDefault()
      toggleSidebar()
      return
    }

    // Cmd+\: Toggle changes panel
    if (e.metaKey && e.key === '\\') {
      e.preventDefault()
      if (changesPanel.open) {
        closeChangesPanel()
      } else {
        openChangesPanel()
      }
      return
    }

    // Cmd+,: Open settings
    if (e.metaKey && e.key === ',') {
      e.preventDefault()
      setSettingsOpen(true)
      return
    }

    // Cmd+]: Next session (more recent)
    if (e.metaKey && e.key === ']') {
      e.preventDefault()
      navigateToNextSession()
      return
    }

    // Cmd+[: Previous session (older)
    if (e.metaKey && e.key === '[') {
      e.preventDefault()
      navigateToPreviousSession()
      return
    }

    // Cmd+K: Focus sidebar filter
    if (e.metaKey && e.key === 'k') {
      e.preventDefault()
      if (sidebarCollapsed) toggleSidebar()
      sidebarRef.current?.focusFilter()
      return
    }

    // Cmd+Shift+A: Archive current session
    // WHY: ⌘+W conventionally closes tabs — using ⌘+Shift+A avoids accidental archives
    if (e.metaKey && e.shiftKey && e.key === 'a' && activeSessionId) {
      e.preventDefault()
      archiveSession(activeSessionId)
      return
    }

    // /: Focus prompt input (GitHub/Slack convention)
    // WHY: / is universal "quick search/focus" — only when not already in a text field
    if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault()
      chatPaneRef.current?.focusInput()
      return
    }

    // Cmd+J: Scroll to latest message
    if (e.metaKey && e.key === 'j') {
      e.preventDefault()
      chatPaneRef.current?.scrollToBottom()
      return
    }

    // Cmd+Shift+R: Refresh changes
    if (e.metaKey && e.shiftKey && e.key === 'r' && activeSessionId) {
      e.preventDefault()
      loadChangedFiles(activeSessionId)
      return
    }

    // Alt+Z: Toggle diff word wrap
    if (e.altKey && e.key === 'z') {
      e.preventDefault()
      toggleDiffWordWrap()
      return
    }
  }, [setActiveSession, toggleSidebar, changesPanel.open, closeChangesPanel, openChangesPanel, 
      setSettingsOpen, navigateToNextSession, navigateToPreviousSession, sidebarCollapsed,
      activeSessionId, archiveSession, loadChangedFiles, abortSession, streamingSessions,
      toggleDiffWordWrap])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (isSidebarDragging) {
      window.addEventListener('mousemove', handleSidebarMouseMove)
      window.addEventListener('mouseup', handleSidebarMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      return () => {
        window.removeEventListener('mousemove', handleSidebarMouseMove)
        window.removeEventListener('mouseup', handleSidebarMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isSidebarDragging, handleSidebarMouseMove, handleSidebarMouseUp])

  useEffect(() => {
    if (isChangesPanelDragging) {
      window.addEventListener('mousemove', handleChangesPanelMouseMove)
      window.addEventListener('mouseup', handleChangesPanelMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      return () => {
        window.removeEventListener('mousemove', handleChangesPanelMouseMove)
        window.removeEventListener('mouseup', handleChangesPanelMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isChangesPanelDragging, handleChangesPanelMouseMove, handleChangesPanelMouseUp])

  useEffect(() => {
    // Initialize theme
    window.accrew.theme.get().then(setTheme)
    
    // Load initial data
    loadSessions()
    loadWorkspaces()
    loadConfig()
    
    // Setup event listeners
    const cleanup = setupEventListeners()
    
    return cleanup
  }, [])

  useEffect(() => {
    // Apply theme class
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Title bar drag region */}
      <div className="fixed top-0 left-0 right-0 h-8 drag-region z-50" />
      
      {/* Sidebar toggle - fixed position next to traffic lights */}
      {/* WHY: trafficLightPosition { x:16, y:16 } = top-left of button area. Each light is
         12px wide, 20px center-to-center → green right edge at 68px. left-[80px] gives 12px
         gap from green light. top-[9px] vertically centers the button with traffic lights */}
      <button
        onClick={toggleSidebar}
        className="fixed top-[9px] left-[80px] z-[60] p-1.5 rounded-md hover:bg-accent/80 text-muted-foreground hover:text-foreground transition-colors no-drag"
        title={sidebarCollapsed ? 'Show sidebar (⌘B)' : 'Hide sidebar (⌘B)'}
      >
        {sidebarCollapsed ? (
          <PanelLeft className="w-4 h-4" />
        ) : (
          <PanelLeftClose className="w-4 h-4" />
        )}
      </button>
      
      {/* Sidebar */}
      <div 
        className={`flex-shrink-0 transition-sidebar border-r border-border/50 relative ${
          sidebarCollapsed ? 'w-0 opacity-0' : ''
        }`}
        style={sidebarCollapsed ? undefined : { width: localSidebarWidth }}
      >
        <Sidebar ref={sidebarRef} />
        {/* Resize handle */}
        {!sidebarCollapsed && (
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 active:bg-primary/30 z-10"
            onMouseDown={handleSidebarMouseDown}
          />
        )}
      </div>
      
      {/* Main chat area */}
      <div className="flex-1 min-w-0 w-full">
        <ChatPane ref={chatPaneRef} />
      </div>
      
      {/* Changes panel */}
      {changesPanel.open && (
        <div 
          className="flex-shrink-0 border-l border-border relative"
          style={{ width: localChangesPanelWidth }}
        >
          {/* Resize handle - on left side */}
          <div
            className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-primary/20 active:bg-primary/30 z-10"
            onMouseDown={handleChangesPanelMouseDown}
          />
          <ChangesPanel />
        </div>
      )}
      
      {/* Settings dialog */}
      <SettingsDialog />
    </div>
  )
}
