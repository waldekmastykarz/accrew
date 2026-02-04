import { useStore } from '../store'
import { cn, formatRelativeTime, truncate } from '../lib/utils'
import { 
  Plus, 
  Settings, 
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Trash2,
  Archive,
  ArchiveRestore,
  Circle,
  AlertTriangle,
  Folder,
  Filter,
  X
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export function Sidebar() {
  const { 
    sessions, 
    activeSessionId, 
    streamingSessions,
    setActiveSession, 
    deleteSession,
    archiveSession,
    unarchiveSession,
    setSettingsOpen
  } = useStore()

  const [archiveExpanded, setArchiveExpanded] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (filterOpen && filterInputRef.current) {
      filterInputRef.current.focus()
    }
  }, [filterOpen])

  const filterSession = (session: typeof sessions[0]) => {
    if (!filterText) return true
    const search = filterText.toLowerCase()
    const titleMatch = session.title.toLowerCase().includes(search)
    const workspaceMatch = session.workspace?.toLowerCase().includes(search) ?? false
    return titleMatch || workspaceMatch
  }

  const handleDeleteClick = (sessionId: string) => {
    setDeleteConfirmId(sessionId)
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirmId) {
      deleteSession(deleteConfirmId)
      setDeleteConfirmId(null)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteConfirmId(null)
  }

  const sessionToDelete = sessions.find(s => s.id === deleteConfirmId)

  const recentSessions = sessions.filter(s => s.status !== 'archived' && filterSession(s))
  const archivedSessions = sessions.filter(s => s.status === 'archived' && filterSession(s))

  return (
    <div className="h-full flex flex-col bg-sidebar pt-14">
      {/* New session button */}
      <div className="px-3 py-3">
        <button
          onClick={() => setActiveSession(null)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 hover:bg-accent/50 text-foreground transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New session
        </button>
      </div>

      {/* Sessions header */}
      <div className="flex items-center justify-between px-4 py-2">
        {filterOpen ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              ref={filterInputRef}
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter sessions..."
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 outline-none"
            />
            <button
              onClick={() => {
                setFilterOpen(false)
                setFilterText('')
              }}
              className="p-0.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            <span className="text-xs font-medium text-muted-foreground">Sessions</span>
            <button
              onClick={() => setFilterOpen(true)}
              className="p-0.5 rounded hover:bg-accent/50 text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              <Filter className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">
            <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-40" />
            <p className="text-xs">No sessions yet</p>
          </div>
        ) : recentSessions.length === 0 && archivedSessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">
            <Filter className="w-6 h-6 mx-auto mb-2 opacity-40" />
            <p className="text-xs">No matching sessions</p>
          </div>
        ) : (
          <>
            {/* Recent sessions */}
            <div className="space-y-0.5 px-2">
              {recentSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  isStreaming={streamingSessions.has(session.id)}
                  onSelect={() => setActiveSession(session.id)}
                  onDelete={() => handleDeleteClick(session.id)}
                  onArchive={() => archiveSession(session.id)}
                />
              ))}
            </div>

            {/* Archive section */}
            {archivedSessions.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setArchiveExpanded(!archiveExpanded)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {archiveExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  <Archive className="w-3 h-3" />
                  <span>Archive</span>
                  <span className="ml-auto text-xs opacity-60">{archivedSessions.length}</span>
                </button>
                {archiveExpanded && (
                  <div className="space-y-0.5 px-2">
                    {archivedSessions.map((session) => (
                      <SessionItem
                        key={session.id}
                        session={session}
                        isActive={session.id === activeSessionId}
                        isStreaming={false}
                        isArchived
                        onSelect={() => setActiveSession(session.id)}
                        onDelete={() => handleDeleteClick(session.id)}
                        onUnarchive={() => unarchiveSession(session.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border/50 p-2">
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors text-sm"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50" 
            onClick={handleDeleteCancel}
          />
          <div className="relative bg-card border border-border rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground">Delete session?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  "{truncate(sessionToDelete?.title || 'This session', 40)}" will be permanently deleted. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={handleDeleteCancel}
                className="px-3 py-1.5 text-sm font-medium rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface SessionItemProps {
  session: {
    id: string
    title: string
    workspace: string | null
    updatedAt: number
    hasUnread: boolean
    status: 'active' | 'completed' | 'error' | 'archived'
  }
  isActive: boolean
  isStreaming: boolean
  isArchived?: boolean
  onSelect: () => void
  onDelete: () => void
  onArchive?: () => void
  onUnarchive?: () => void
}

function SessionItem({ session, isActive, isStreaming, isArchived, onSelect, onDelete, onArchive, onUnarchive }: SessionItemProps) {
  // Show status indicator: streaming (purple pulse) > unread (blue dot) > error (red) > nothing
  const getStatusIndicator = () => {
    if (isStreaming) {
      return <Circle className="w-2 h-2 text-violet-500 fill-violet-500 animate-pulse flex-shrink-0" />
    }
    if (session.status === 'error') {
      return <Circle className="w-2 h-2 text-red-500 fill-red-500 flex-shrink-0" />
    }
    if (session.hasUnread && !isActive) {
      return <Circle className="w-2 h-2 text-blue-500 fill-blue-500 flex-shrink-0" />
    }
    return null
  }

  return (
    <div
      className={cn(
        'group flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
        isActive ? 'bg-accent' : 'hover:bg-accent/50',
        isArchived && 'opacity-60'
      )}
      onClick={onSelect}
    >
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {getStatusIndicator()}
          <span className={cn(
            'text-sm font-medium truncate',
            session.hasUnread || isActive ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {session.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
          {session.workspace && (
            <>
              <Folder className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{session.workspace}</span>
              <span>·</span>
            </>
          )}
          <span className="whitespace-nowrap">{formatRelativeTime(session.updatedAt)}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 pt-0.5">
        {isArchived ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onUnarchive?.()
            }}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
            title="Restore from archive"
          >
            <ArchiveRestore className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onArchive?.()
            }}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
            title="Archive session"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
          title="Delete session"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
