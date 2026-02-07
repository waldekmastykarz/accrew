import { useRef, useEffect } from 'react'
import { useStore } from '../store'
import { MessageBubble } from './MessageBubble'
import { StreamingMessage } from './StreamingMessage'
import { PromptInput, PromptInputHandle } from './PromptInput'
import { Circle, GitBranch, FileDiff } from 'lucide-react'

export function ChatPane() {
  const { 
    messages, 
    activeSessionId, 
    sessions,
    sidebarCollapsed,
    sendMessage,
    createSession,
    streamingStates,
    streamingSessions,
    sessionGitInfo,
    changesPanel,
    openChangesPanel,
    closeChangesPanel
  } = useStore()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const promptInputRef = useRef<PromptInputHandle>(null)
  const wasStreamingRef = useRef<boolean>(false)
  const activeSession = sessions.find(s => s.id === activeSessionId)
  const gitInfo = activeSessionId ? sessionGitInfo[activeSessionId] : null

  // Get streaming state for the current session - directly from Map for content display
  const currentStreaming = activeSessionId ? streamingStates.get(activeSessionId) || null : null
  // Use streamingSessions (Set) for boolean check - more reliable reactivity than Map.has()
  const isStreamingThisSession = activeSessionId ? streamingSessions.has(activeSessionId) : false

  // Auto-scroll to bottom (instant for streaming, smooth otherwise)
  useEffect(() => {
    if (currentStreaming) {
      // Instant scroll during streaming to avoid lag
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [currentStreaming?.content, currentStreaming?.thinking, currentStreaming?.toolCalls.length])

  useEffect(() => {
    // Smooth scroll when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Focus input when streaming ends
  useEffect(() => {
    if (wasStreamingRef.current && !currentStreaming) {
      requestAnimationFrame(() => {
        promptInputRef.current?.focus()
      })
    }
    wasStreamingRef.current = !!currentStreaming
  }, [currentStreaming])

  const handleSend = async (content: string, workspace?: string) => {
    if (activeSessionId) {
      await sendMessage(content)
    } else {
      await createSession(workspace, content)
    }
  }

  const isEmptyState = messages.length === 0 && !currentStreaming && !activeSessionId

  const getStatusDisplay = () => {
    if (currentStreaming) return { color: 'text-violet-500 fill-violet-500', label: 'Working', animate: true }
    if (activeSession?.status === 'active') return { color: 'text-green-500 fill-green-500', label: 'Ready', animate: false }
    if (activeSession?.status === 'error') return { color: 'text-red-500 fill-red-500', label: 'Error', animate: false }
    return { color: 'text-green-500 fill-green-500', label: 'Completed', animate: false }
  }

  return (
    <div className="h-full flex flex-col w-full">
      {/* Header - only show when there's a session */}
      {!isEmptyState && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 drag-region flex-shrink-0">
          <div className="flex-1 min-w-0 no-drag">
            {activeSession && (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-medium truncate">{activeSession.title}</h2>
                  {activeSession.workspace && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{activeSession.workspace}</span>
                      {gitInfo?.isRepo && gitInfo.branch ? (
                        <>
                          <span className="text-muted-foreground/50">·</span>
                          <button
                            onClick={() => changesPanel.open ? closeChangesPanel() : openChangesPanel()}
                            className={`flex items-center gap-1 hover:text-foreground transition-colors ${
                              gitInfo.hasChanges ? 'text-orange-500' : ''
                            }`}
                            title={gitInfo.hasChanges ? 'View pending changes' : 'Toggle changes panel'}
                          >
                            <GitBranch className="w-3 h-3" />
                            <span className="truncate">{gitInfo.branch}</span>
                          </button>
                        </>
                      ) : !gitInfo?.isRepo && (
                        <>
                          <span className="text-muted-foreground/50">·</span>
                          <button
                            onClick={() => changesPanel.open ? closeChangesPanel() : openChangesPanel()}
                            className={`flex items-center gap-1 hover:text-foreground transition-colors ${
                              changesPanel.files.length > 0 ? 'text-orange-500' : ''
                            }`}
                            title={changesPanel.files.length > 0 ? 'View file changes' : 'Toggle changes panel'}
                          >
                            <FileDiff className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Circle className={`w-2 h-2 ${getStatusDisplay().color} ${getStatusDisplay().animate ? 'animate-pulse' : ''}`} />
                  <span className="text-muted-foreground">{getStatusDisplay().label}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages or Empty State */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 flex flex-col w-full">
        {isEmptyState ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 w-full relative">
            <div className="w-full max-w-3xl">
              {/* WHY: key forces remount on session switch — without it, local value state
                  bleeds across sessions because React reuses the component instance */}
              <PromptInput key="new" ref={promptInputRef} onSend={handleSend} disabled={isStreamingThisSession} centered />
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 py-6 px-8">
              {/* WHY: Filter out last assistant message when streaming — StreamingMessage handles
                  the in-progress response. Without this, navigating away and back during streaming
                  shows the message twice (once from DB, once from streaming state) */}
              {(currentStreaming 
                ? messages.filter((m, i, arr) => !(m.role === 'assistant' && i === arr.length - 1))
                : messages
              ).map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {currentStreaming && <StreamingMessage streaming={currentStreaming} />}
              <div ref={messagesEndRef} className="h-1" />
            </div>
            {/* Input at bottom when there's content */}
            <div className="border-t border-border/50 p-6 flex-shrink-0">
              {/* WHY: key forces remount on session switch — without it, local value state
                  bleeds across sessions because React reuses the component instance */}
              <PromptInput key={activeSessionId} ref={promptInputRef} onSend={handleSend} disabled={isStreamingThisSession} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
