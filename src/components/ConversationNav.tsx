import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { Message } from '../shared/types'
import { STREAMING_MESSAGE_ID } from '../shared/types'

interface ConversationNavProps {
  messages: Message[]
  isStreaming: boolean
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
}

// WHY: Always-visible timeline — only user messages (instructions) get dots, connected by
// a single thin line. No markers for responses. User prompts are the natural bookmarks
// ("where did I ask about X?"), and the gap between dots implicitly shows how long each
// response was. Always visible for orientation; dots clickable for navigation.
export function ConversationNav({ messages, isStreaming, scrollContainerRef }: ConversationNavProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [positions, setPositions] = useState<Map<string, number>>(new Map())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const rafRef = useRef<number>(0)

  // WHY: Only user messages get dots — assistant messages still tracked for position
  // calculation and active-state detection (so the line knows where to end).
  const userMessages = useMemo(() => messages.filter(m => m.role === 'user'), [messages])
  const allNavMessages = useMemo(() => messages.filter(m => m.role === 'user' || m.role === 'assistant'), [messages])

  // WHY: Calculate marker positions proportionally — each marker's top% = message element's
  // offset / scrollHeight. ResizeObserver catches content growth (streaming), new messages,
  // and window resizes. Debounced with rAF to avoid layout thrashing during rapid streaming.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const recalculate = () => {
      const { scrollHeight } = container
      if (scrollHeight === 0) return

      const newPositions = new Map<string, number>()
      const containerRect = container.getBoundingClientRect()
      const els = container.querySelectorAll('[data-message-id]')
      els.forEach(el => {
        const id = el.getAttribute('data-message-id')
        if (id) {
          const elRect = el.getBoundingClientRect()
          const offsetTop = elRect.top - containerRect.top + container.scrollTop
          newPositions.set(id, (offsetTop / scrollHeight) * 100)
        }
      })
      setPositions(newPositions)
    }

    const debouncedRecalculate = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(recalculate)
    }

    const resizeObserver = new ResizeObserver(debouncedRecalculate)
    resizeObserver.observe(container)
    recalculate()

    return () => {
      resizeObserver.disconnect()
      cancelAnimationFrame(rafRef.current)
    }
  }, [allNavMessages.length, isStreaming, scrollContainerRef])

  // WHY: IntersectionObserver tracks all messages (not just user) so the active state
  // reflects what's currently visible. When an assistant response is on screen, the
  // nearest preceding user dot highlights.
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
  }, [allNavMessages.length, isStreaming, scrollContainerRef])

  // WHY: messageId is always a UUID from SQLite or STREAMING_MESSAGE_ID — safe for querySelector.
  // WHY: Manual scrollTo with -24px offset instead of scrollIntoView — scrollIntoView
  // pins the element flush to the top edge, which feels cramped. The offset gives
  // breathing room so you see a bit of the previous context above.
  const scrollTo = useCallback((messageId: string) => {
    const container = scrollContainerRef.current
    const el = container?.querySelector(`[data-message-id="${messageId}"]`)
    if (el && container) {
      const elRect = el.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const scrollTop = container.scrollTop + (elRect.top - containerRect.top) - 24
      container.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' })
    }
  }, [scrollContainerRef])

  if (userMessages.length < 2 && !isStreaming) return null

  const getTooltip = (msg: Message): string => {
    const text = msg.content
    const truncated = text.slice(0, 80)
    return truncated + (text.length > 80 ? '…' : '')
  }

  // WHY: Resolve active dot — if the visible message is an assistant response,
  // highlight its preceding user dot instead. This way the dot always represents
  // the turn you're currently reading.
  const getActiveDotId = (): string | null => {
    if (!activeId) return null
    const activeMsg = allNavMessages.find(m => m.id === activeId)
    if (!activeMsg) return null
    if (activeMsg.role === 'user') return activeMsg.id
    // Find the user message that precedes this assistant response
    const idx = allNavMessages.indexOf(activeMsg)
    for (let i = idx - 1; i >= 0; i--) {
      if (allNavMessages[i].role === 'user') return allNavMessages[i].id
    }
    return null
  }
  const activeDotId = getActiveDotId()

  // WHY: Dot positions for the connecting line — line runs from first to last user dot.
  // Using SVG for the line so it can be a clean 1px stroke without box-model headaches.
  const dotPositions = userMessages
    .map(m => positions.get(m.id))
    .filter((p): p is number => p !== undefined)

  // WHY: Line and dots use bg-border — a fully opaque solid color from the theme.
  // Never use opacity modifiers (like /30) here — semi-transparent dots let the
  // line bleed through, creating a visible overlap artifact.
  const solidColor = 'bg-border'

  return (
    // WHY: right-6 (24px) gives breathing room from window edge / sidebar.
    // Messages use pr-16 (64px), so there's ~24px clear air between text and nav.
    <div className="absolute right-6 top-0 bottom-0 z-20 w-4">
      {/* Connecting line — solid, same color as dots */}
      {dotPositions.length >= 2 && (
        <div
          className={`absolute left-[7.5px] w-px ${solidColor}`}
          style={{
            top: `${dotPositions[0]}%`,
            bottom: `${100 - dotPositions[dotPositions.length - 1]}%`
          }}
        />
      )}

      {/* User message dots — solid, same color as line */}
      {userMessages.map(msg => {
        const pos = positions.get(msg.id)
        if (pos === undefined) return null
        const isActive = activeDotId === msg.id

        return (
          <button
            key={msg.id}
            onClick={() => scrollTo(msg.id)}
            className={`absolute pointer-events-auto cursor-pointer rounded-full transition-all duration-200 ${solidColor} ${
              isActive
                ? 'w-2.5 h-2.5 left-[3px]'
                : 'w-1.5 h-1.5 left-[5px] hover:scale-150'
            }`}
            style={{ top: `${pos}%`, transform: 'translateY(-50%)' }}
            title={getTooltip(msg)}
          />
        )
      })}

      {/* Streaming indicator — subtle pulsing dot */}
      {isStreaming && (() => {
        const pos = positions.get(STREAMING_MESSAGE_ID)
        if (pos === undefined) return null
        return (
          <div
            className="absolute left-[4px] w-2 h-2 rounded-full bg-violet-500/50 animate-pulse"
            style={{ top: `${pos}%`, transform: 'translateY(-50%)' }}
            title="Streaming…"
          />
        )
      })()}
    </div>
  )
}
