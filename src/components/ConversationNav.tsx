import { useState, useEffect, useCallback, useRef } from 'react'
import type { Message } from '../shared/types'

interface ConversationNavProps {
  messages: Message[]
  isStreaming: boolean
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
}

// WHY: Metro-line style navigation — vertical timeline with clickable dots for each message.
// Positioned as an overlay on the right side of the chat, outside the scroll container,
// so it stays visible while messages scroll underneath.
export function ConversationNav({ messages, isStreaming, scrollContainerRef }: ConversationNavProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Only user and assistant messages (skip system)
  const navMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant')

  // WHY: IntersectionObserver with top-biased rootMargin — tracks which message is at
  // the top of the viewport to highlight the corresponding nav dot. Without the bias,
  // multiple messages show as "active" simultaneously.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    observerRef.current?.disconnect()

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        if (visible.length > 0) {
          const id = visible[0].target.getAttribute('data-message-id')
          if (id) setActiveId(id)
        }
      },
      {
        root: container,
        rootMargin: '-5% 0px -65% 0px',
        threshold: 0.1
      }
    )

    const messageEls = container.querySelectorAll('[data-message-id]')
    messageEls.forEach(el => observer.observe(el))

    observerRef.current = observer
    return () => observer.disconnect()
  }, [navMessages.length, isStreaming, scrollContainerRef])

  const scrollTo = useCallback((messageId: string) => {
    const el = scrollContainerRef.current?.querySelector(`[data-message-id="${messageId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  if (navMessages.length < 2 && !isStreaming) return null

  return (
    <div className="absolute right-4 top-0 bottom-0 z-20 flex items-center pointer-events-none">
      <div className="flex flex-col items-center pointer-events-auto rounded-full bg-background/60 backdrop-blur-sm px-1 py-2">
        {navMessages.map((msg, i) => (
          <div key={msg.id} className="flex flex-col items-center">
            {/* Line connector — longer gap between turns (assistant → user) */}
            {i > 0 && (
              <div className={`w-px ${
                msg.role === 'user' && navMessages[i - 1]?.role === 'assistant' ? 'h-3' : 'h-1.5'
              } bg-border/40`} />
            )}

            <button
              onClick={() => scrollTo(msg.id)}
              className={`rounded-full transition-all duration-200 hover:scale-150 ${
                msg.role === 'user' ? 'w-1.5 h-1.5' : 'w-2 h-2'
              } ${
                activeId === msg.id
                  ? 'bg-foreground ring-2 ring-foreground/20'
                  : msg.role === 'user'
                    ? 'bg-muted-foreground/50 hover:bg-muted-foreground'
                    : 'bg-muted-foreground/30 hover:bg-muted-foreground/60'
              }`}
              title={msg.role === 'user'
                ? `You: ${msg.content.slice(0, 60)}${msg.content.length > 60 ? '...' : ''}`
                : 'Response'
              }
            />
          </div>
        ))}

        {/* Streaming dot */}
        {isStreaming && (
          <>
            <div className="w-px h-1.5 bg-violet-500/30" />
            <button
              onClick={() => scrollTo('streaming')}
              className="w-2 h-2 rounded-full bg-violet-500 animate-pulse hover:scale-150 transition-transform"
              title="Current response"
            />
          </>
        )}
      </div>
    </div>
  )
}
