import { useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { useStore } from '../store'
import { MessageBubble } from './MessageBubble'
import { StreamingMessage } from './StreamingMessage'
import { PromptInput, PromptInputHandle } from './PromptInput'
import { ConversationNav } from './ConversationNav'
import { Circle, GitBranch, FileDiff } from 'lucide-react'

export interface ChatPaneHandle {
  focusInput: () => void
  scrollToBottom: () => void
}

export const ChatPane = forwardRef<ChatPaneHandle>(function ChatPane(_, ref) {
  const { 
    messages, 
    activeSessionId, 
    sessions,
    sendMessage,
    createSession,
    streamingStates,
    streamingSessions,
    sessionGitInfo,
    changesPanel,
    openChangesPanel,
    closeChangesPanel,
    pendingOperations
  } = useStore()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const promptInputRef = useRef<PromptInputHandle>(null)
  const wasStreamingRef = useRef<boolean>(false)
  const hasScrolledToStreamingRef = useRef<boolean>(false)
  const activeSession = sessions.find(s => s.id === activeSessionId)
  const gitInfo = activeSessionId ? sessionGitInfo[activeSessionId] : null

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    focusInput: () => promptInputRef.current?.focus(),
    scrollToBottom: () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }), [])

  // Get streaming state for the current session - directly from Map for content display
  const currentStreaming = activeSessionId ? streamingStates.get(activeSessionId) || null : null
  // Use streamingSessions (Set) for boolean check - more reliable reactivity than Map.has()
  const isStreamingThisSession = activeSessionId ? streamingSessions.has(activeSessionId) : false

  // WHY: Scroll to start of response when streaming begins — user wants to see the beginning
  // of the response, not the bottom. Only scrolls once per streaming session to avoid
  // disrupting manual scrolling while the user reads the response.
  useEffect(() => {
    if (currentStreaming && !hasScrolledToStreamingRef.current) {
      const el = scrollContainerRef.current?.querySelector('[data-message-id="streaming"]')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        hasScrolledToStreamingRef.current = true
      }
    }
    if (!currentStreaming) {
      hasScrolledToStreamingRef.current = false
    }
  }, [currentStreaming])

  // WHY: Scroll to the start of the last message when new messages arrive — keeps the
  // beginning of the response visible instead of scrolling past it to the bottom.
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1]
      const el = scrollContainerRef.current?.querySelector(`[data-message-id="${lastMsg.id}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
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

  /* WHY: Filter out last assistant message when streaming — StreamingMessage handles
      the in-progress response. Without this, navigating away and back during streaming
      shows the message twice (once from DB, once from streaming state) */
  const filteredMessages = useMemo(() =>
    currentStreaming
      ? messages.filter((m, i, arr) => !(m.role === 'assistant' && i === arr.length - 1))
      : messages
  , [messages, currentStreaming])

  // WHY: Priority order for status display — streaming takes precedence over pending ops,
  // pending ops over session status. Shows most relevant state to user.
  const getStatusDisplay = () => {
    if (currentStreaming) return { color: 'text-violet-500 fill-violet-500', label: 'Working', animate: true }
    if (pendingOperations.has('regenerateTitle')) return { color: 'text-blue-500 fill-blue-500', label: 'Renaming...', animate: true }
    if (pendingOperations.has('refreshWorkspaces')) return { color: 'text-blue-500 fill-blue-500', label: 'Refreshing...', animate: true }
    if (pendingOperations.has('refreshGitInfo')) return { color: 'text-blue-500 fill-blue-500', label: 'Syncing...', animate: true }
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
                            title={gitInfo.hasChanges ? 'View pending changes (⌘\\)' : 'Toggle changes panel (⌘\\)'}
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
                            title={changesPanel.files.length > 0 ? 'View file changes (⌘\\)' : 'Toggle changes panel (⌘\\)'}
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
      <div className="flex-1 min-h-0 relative">
        <div ref={scrollContainerRef} className="h-full overflow-y-auto overflow-x-hidden flex flex-col w-full">
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
                {filteredMessages.map((message) => (
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
        {/* WHY: ConversationNav is outside the scroll container — it overlays the right edge
            and stays visible while messages scroll underneath, acting like a scrollbar
            enhancement for quick navigation between conversation turns */}
        {!isEmptyState && (
          <ConversationNav
            messages={filteredMessages}
            isStreaming={isStreamingThisSession}
            scrollContainerRef={scrollContainerRef}
          />
        )}
      </div>
    </div>
  )
})
