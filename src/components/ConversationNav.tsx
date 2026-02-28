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

  // WHY: Shape differentiation (Option C) — user messages are small rounded squares,
  // assistant responses are larger circles. Distinct shapes make roles immediately
  // distinguishable without needing icons or numbers.
  return (
    <div className="absolute right-4 top-0 bottom-0 z-20 flex items-center pointer-events-none">
      <div className="flex flex-col items-center pointer-events-auto rounded-full bg-background/60 backdrop-blur-sm px-1.5 py-2.5">
        {navMessages.map((msg, i) => (
          <div key={msg.id} className="flex flex-col items-center">
            {/* Line connector — wider gap between turns (assistant → user) */}
            {i > 0 && (
              <div className={`w-px ${
                msg.role === 'user' && navMessages[i - 1]?.role === 'assistant' ? 'h-4' : 'h-2'
              } bg-border/30`} />
            )}

            {msg.role === 'user' ? (
              <button
                onClick={() => scrollTo(msg.id)}
                className={`w-2 h-2 rounded-sm transition-all duration-200 hover:scale-150 ${
                  activeId === msg.id
                    ? 'bg-foreground shadow-[0_0_6px_rgba(255,255,255,0.3)]'
                    : 'bg-muted-foreground/60 hover:bg-muted-foreground'
                }`}
                title={`You: ${msg.content.slice(0, 60)}${msg.content.length > 60 ? '...' : ''}`}
              />
            ) : (
              <button
                onClick={() => scrollTo(msg.id)}
                className={`w-3 h-3 rounded-full transition-all duration-200 hover:scale-150 ${
                  activeId === msg.id
                    ? 'bg-foreground shadow-[0_0_8px_rgba(255,255,255,0.3)]'
                    : 'bg-muted-foreground/40 hover:bg-muted-foreground/70'
                }`}
                title="Response"
              />
            )}
          </div>
        ))}

        {/* Streaming dot — pulsing violet circle */}
        {isStreaming && (
          <>
            <div className="w-px h-2 bg-violet-500/30" />
            <button
              onClick={() => scrollTo('streaming')}
              className="w-3 h-3 rounded-full bg-violet-500 animate-pulse hover:scale-150 transition-transform shadow-[0_0_8px_rgba(139,92,246,0.5)]"
              title="Current response"
            />
          </>
        )}
      </div>
    </div>
  )
}
