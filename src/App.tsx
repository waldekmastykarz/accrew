import { useEffect, useCallback, useState, useRef } from 'react'
import { useStore } from './store'
import { Sidebar } from './components/Sidebar'
import { ChatPane } from './components/ChatPane'
import { DiffPane } from './components/DiffPane'
import { SettingsDialog } from './components/SettingsDialog'
import { PanelLeft, PanelLeftClose } from 'lucide-react'
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 400

export default function App() {
  const { 
    theme, 
    setTheme, 
    sidebarCollapsed,
    toggleSidebar,
    selectedDiff,
    config,
    loadSessions,
    loadWorkspaces,
    loadConfig,
    setupEventListeners,
    setActiveSession,
    setSidebarWidth
  } = useStore()

  const [isDragging, setIsDragging] = useState(false)
  const [localWidth, setLocalWidth] = useState(config?.sidebarWidth ?? 256)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  // Sync local width with config
  useEffect(() => {
    if (config?.sidebarWidth) {
      setLocalWidth(config.sidebarWidth)
    }
  }, [config?.sidebarWidth])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragRef.current = { startX: e.clientX, startWidth: localWidth }
  }, [localWidth])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragRef.current) return
    
    const delta = e.clientX - dragRef.current.startX
    const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, dragRef.current.startWidth + delta))
    setLocalWidth(newWidth)
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
      setSidebarWidth(localWidth)
      dragRef.current = null
    }
  }, [isDragging, localWidth, setSidebarWidth])

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Cmd+N: New session
    if (e.metaKey && e.key === 'n') {
      e.preventDefault()
      setActiveSession(null)
    }
  }, [setActiveSession])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

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
      <button
        onClick={toggleSidebar}
        className="fixed top-2.5 left-[74px] z-[60] p-1.5 rounded-md hover:bg-accent/80 text-muted-foreground hover:text-foreground transition-colors no-drag"
        title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
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
        style={sidebarCollapsed ? undefined : { width: localWidth }}
      >
        <Sidebar />
        {/* Resize handle */}
        {!sidebarCollapsed && (
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 active:bg-primary/30 z-10"
            onMouseDown={handleMouseDown}
          />
        )}
      </div>
      
      {/* Main chat area */}
      <div className="flex-1 min-w-0 w-full">
        <ChatPane />
      </div>
      
      {/* Diff pane */}
      {selectedDiff && (
        <div className="flex-shrink-0 w-[500px] border-l border-border">
          <DiffPane />
        </div>
      )}
      
      {/* Settings dialog */}
      <SettingsDialog />
    </div>
  )
}
