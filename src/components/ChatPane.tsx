import { useRef, useEffect } from 'react'
import { useStore } from '../store'
import { MessageBubble } from './MessageBubble'
import { StreamingMessage } from './StreamingMessage'
import { PromptInput, PromptInputHandle } from './PromptInput'
import { Circle } from 'lucide-react'

export function ChatPane() {
  const { 
    messages, 
    streaming, 
    activeSessionId, 
    sessions,
    sidebarCollapsed,
    sendMessage,
    createSession
  } = useStore()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const promptInputRef = useRef<PromptInputHandle>(null)
  const wasStreamingRef = useRef<boolean>(false)
  const activeSession = sessions.find(s => s.id === activeSessionId)

  // Auto-scroll to bottom (instant for streaming, smooth otherwise)
  useEffect(() => {
    if (streaming) {
      // Instant scroll during streaming to avoid lag
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [streaming?.content, streaming?.thinking, streaming?.toolCalls.length])

  useEffect(() => {
    // Smooth scroll when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Focus input when streaming ends
  useEffect(() => {
    if (wasStreamingRef.current && !streaming) {
      requestAnimationFrame(() => {
        promptInputRef.current?.focus()
      })
    }
    wasStreamingRef.current = !!streaming
  }, [streaming])

  const handleSend = async (content: string, workspace?: string) => {
    if (activeSessionId) {
      await sendMessage(content)
    } else {
      await createSession(workspace, content)
    }
  }

  const isEmptyState = messages.length === 0 && !streaming && !activeSessionId

  const getStatusDisplay = () => {
    if (streaming) return { color: 'text-violet-500 fill-violet-500', label: 'Working', animate: true }
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
                    <p className="text-xs text-muted-foreground truncate">
                      {activeSession.workspace}
                    </p>
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
              <PromptInput ref={promptInputRef} onSend={handleSend} disabled={!!streaming} centered />
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 py-6 px-8">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {streaming && <StreamingMessage streaming={streaming} />}
              <div ref={messagesEndRef} className="h-1" />
            </div>
            {/* Input at bottom when there's content */}
            <div className="border-t border-border/50 p-6 flex-shrink-0">
              <PromptInput ref={promptInputRef} onSend={handleSend} disabled={!!streaming} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
