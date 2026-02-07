import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent, forwardRef, useImperativeHandle } from 'react'
import { useStore } from '../store'
import { cn } from '../lib/utils'
import { Send, Loader2, Square } from 'lucide-react'

interface PromptInputProps {
  onSend: (content: string, workspace?: string) => Promise<void>
  disabled?: boolean
  centered?: boolean
}

export interface PromptInputHandle {
  focus: () => void
}

export const PromptInput = forwardRef<PromptInputHandle, PromptInputProps>(function PromptInput({ onSend, disabled, centered }, ref) {
  const [value, setValue] = useState('')
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteIndex, setAutocompleteIndex] = useState(0)
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const [mentionFilter, setMentionFilter] = useState('')
  const [tabTrigger, setTabTrigger] = useState(false) // Track if autocomplete was triggered by Tab
  const [sending, setSending] = useState(false)
  
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const autocompleteRef = useRef<HTMLDivElement>(null)
  
  const { workspaces, activeSessionId, aborting, abortSession, streamingSessions } = useStore()
  // Use streamingSessions (Set) for boolean check - more reliable reactivity than Map.has()
  const isStreaming = activeSessionId ? streamingSessions.has(activeSessionId) : false

  // Expose focus method to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus()
    }
  }), [])

  // Memoize filtered workspaces
  const filteredWorkspaces = useMemo(() => 
    workspaces.filter(w =>
      w.name.toLowerCase().includes(mentionFilter.toLowerCase()) ||
      w.displayName.toLowerCase().includes(mentionFilter.toLowerCase())
    ).slice(0, 8), // Limit to 8 results for performance
    [workspaces, mentionFilter]
  )

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart
    setValue(newValue)

    // Check for @ trigger
    const beforeCursor = newValue.slice(0, cursorPos)
    const lastAtIndex = beforeCursor.lastIndexOf('@')
    
    if (lastAtIndex !== -1) {
      const afterAt = beforeCursor.slice(lastAtIndex + 1)
      const charBefore = lastAtIndex > 0 ? newValue[lastAtIndex - 1] : ' '
      if ((/\s/.test(charBefore) || lastAtIndex === 0) && !/\s/.test(afterAt)) {
        setMentionStart(lastAtIndex)
        setMentionFilter(afterAt)
        setShowAutocomplete(true)
        setAutocompleteIndex(0)
        return
      }
    }
    
    setShowAutocomplete(false)
    setMentionStart(null)
    setMentionFilter('')
  }, [])

  const selectWorkspace = useCallback((workspace: { name: string; displayName: string }) => {
    if (tabTrigger) {
      // Tab-triggered autocomplete: replace current word with @displayName
      const cursorPos = inputRef.current?.selectionStart || value.length
      const beforeCursor = value.slice(0, cursorPos)
      const afterCursor = value.slice(cursorPos)
      
      // Find start of current word (text being typed)
      const wordMatch = beforeCursor.match(/(\S*)$/)
      const wordStart = wordMatch ? cursorPos - wordMatch[1].length : cursorPos
      
      const before = value.slice(0, wordStart)
      const newValue = `${before}@${workspace.displayName} ${afterCursor}`.trim()
      
      setValue(newValue)
      setShowAutocomplete(false)
      setTabTrigger(false)
      setMentionFilter('')
      
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          const newCursorPos = wordStart + workspace.displayName.length + 2 // +2 for @ and space
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
        }
      })
    } else if (mentionStart !== null) {
      // @-triggered autocomplete: insert at cursor position where @ was typed
      const before = value.slice(0, mentionStart)
      const after = value.slice(mentionStart + 1 + mentionFilter.length)
      const newValue = `${before}@${workspace.displayName} ${after}`.trim()
      
      setValue(newValue)
      setShowAutocomplete(false)
      setMentionStart(null)
      setMentionFilter('')
      
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          const newCursorPos = mentionStart + workspace.displayName.length + 2 // +2 for @ and space
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
        }
      })
    }
  }, [mentionStart, mentionFilter, value, tabTrigger])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showAutocomplete && filteredWorkspaces.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setAutocompleteIndex(i => Math.min(i + 1, filteredWorkspaces.length - 1))
          return
        case 'ArrowUp':
          e.preventDefault()
          setAutocompleteIndex(i => Math.max(i - 1, 0))
          return
        case 'Enter':
          e.preventDefault()
          selectWorkspace(filteredWorkspaces[autocompleteIndex])
          return
        case 'Tab':
          e.preventDefault()
          // Tab completes only until the first `/` for progressive completion
          const selected = filteredWorkspaces[autocompleteIndex]
          const cursorPos = inputRef.current?.selectionStart || value.length
          const beforeCursor = value.slice(0, cursorPos)
          const afterCursor = value.slice(cursorPos)
          
          // Find what's already typed (after @ if present)
          const typedMatch = beforeCursor.match(/@?(\S*)$/)
          const alreadyTyped = typedMatch ? typedMatch[1] : ''
          const hasAtPrefix = typedMatch ? typedMatch[0].startsWith('@') : false
          const wordStart = cursorPos - (typedMatch ? typedMatch[0].length : 0)
          
          // Find the next segment to complete to
          const displayName = selected.displayName
          let completeTo = displayName
          
          // If there's a `/` after what's typed, complete only to that `/`
          if (alreadyTyped.length < displayName.length) {
            const slashIndex = displayName.indexOf('/', alreadyTyped.length)
            if (slashIndex !== -1) {
              completeTo = displayName.slice(0, slashIndex + 1)
            }
          }
          
          const prefix = hasAtPrefix ? '@' : '@'
          const before = value.slice(0, wordStart)
          
          // If we're completing the full name, add a space after
          const suffix = completeTo === displayName ? ' ' : ''
          const newValue = `${before}${prefix}${completeTo}${suffix}${afterCursor}`.trim()
          
          setValue(newValue)
          
          // If completed to full name, close autocomplete
          if (completeTo === displayName) {
            setShowAutocomplete(false)
            setTabTrigger(false)
            setMentionFilter('')
          } else {
            // Update filter to show refined results
            setMentionFilter(completeTo)
          }
          
          requestAnimationFrame(() => {
            if (inputRef.current) {
              inputRef.current.focus()
              const newCursorPos = wordStart + prefix.length + completeTo.length
              inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
            }
          })
          return
        case 'Escape':
          e.preventDefault()
          setShowAutocomplete(false)
          setTabTrigger(false)
          return
      }
    }

    // Tab key triggers autocomplete based on current word
    if (e.key === 'Tab' && !showAutocomplete && !e.shiftKey) {
      const cursorPos = inputRef.current?.selectionStart || value.length
      const beforeCursor = value.slice(0, cursorPos)
      
      // Get the current word being typed (may start with @)
      const wordMatch = beforeCursor.match(/@?(\S*)$/)
      const currentWord = wordMatch ? wordMatch[1] : ''
      
      // Filter workspaces by current word
      const matches = workspaces.filter(w =>
        w.name.toLowerCase().includes(currentWord.toLowerCase()) ||
        w.displayName.toLowerCase().includes(currentWord.toLowerCase())
      ).slice(0, 8)
      
      if (matches.length > 0) {
        e.preventDefault()
        setMentionFilter(currentWord)
        setShowAutocomplete(true)
        setAutocompleteIndex(0)
        setTabTrigger(true)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !showAutocomplete) {
      e.preventDefault()
      handleSubmit()
    }
  }, [showAutocomplete, filteredWorkspaces, autocompleteIndex, selectWorkspace, value, workspaces])

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim()
    if (!trimmed || disabled || sending || aborting) return

    const mentionMatch = trimmed.match(/^@(\S+)\s*(.*)$/)
    const workspace = mentionMatch ? mentionMatch[1] : undefined
    const prompt = mentionMatch ? (mentionMatch[2] || trimmed) : trimmed

    setSending(true)
    try {
      await onSend(prompt, workspace)
      setValue('')
    } finally {
      setSending(false)
    }
  }, [value, disabled, sending, aborting, onSend])

  // Stable textarea height - only grow, don't shrink while typing
  useEffect(() => {
    if (inputRef.current) {
      const el = inputRef.current
      const baseHeight = centered ? 56 : 44
      el.style.height = `${baseHeight}px`
      const scrollHeight = el.scrollHeight
      el.style.height = `${Math.min(scrollHeight, 200)}px`
    }
  }, [value, centered])

  // Autofocus when centered (empty state)
  useEffect(() => {
    if (centered && inputRef.current) {
      // Use requestAnimationFrame to ensure DOM is ready after state change
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [centered])

  // Scroll autocomplete selection into view
  useEffect(() => {
    if (showAutocomplete && autocompleteRef.current) {
      const selected = autocompleteRef.current.children[autocompleteIndex] as HTMLElement
      selected?.scrollIntoView({ block: 'nearest' })
    }
  }, [autocompleteIndex, showAutocomplete])

  const handleAbort = useCallback(async () => {
    await abortSession()
  }, [abortSession])

  const isDisabled = disabled || sending || aborting
  const canSend = value.trim() && !isDisabled && !isStreaming

  return (
    <div className="relative w-full">
      {/* Autocomplete dropdown */}
      {showAutocomplete && filteredWorkspaces.length > 0 && (
        <div
          ref={autocompleteRef}
          className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto z-10"
        >
          {filteredWorkspaces.map((workspace, index) => (
            <button
              key={workspace.path}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 text-left',
                index === autocompleteIndex ? 'bg-accent' : 'hover:bg-muted/50'
              )}
              onClick={() => selectWorkspace(workspace)}
              onMouseEnter={() => setAutocompleteIndex(index)}
            >
              <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                {workspace.name[0].toUpperCase()}
              </div>
              <span className="text-sm font-medium truncate">{workspace.displayName}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input container */}
      <div className={cn(
        "flex items-center gap-2 rounded-2xl border w-full transition-all",
        centered 
          ? "bg-card border-border shadow-lg shadow-black/5" 
          : "bg-muted/30 border-border/50",
        "focus-within:border-muted-foreground/50 focus-within:shadow-lg focus-within:shadow-black/10"
      )}>
        <textarea
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={aborting ? "Stopping..." : (centered ? "What would you like to do?" : "Reply...")}
          disabled={isDisabled}
          rows={1}
          className={cn(
            "flex-1 bg-transparent resize-none outline-none border-none focus:ring-0 focus:outline-none placeholder:text-muted-foreground/50 disabled:opacity-50",
            centered 
              ? "px-6 py-4 text-lg min-h-[56px]" 
              : "px-4 py-3 text-sm min-h-[44px]"
          )}
        />
        {isStreaming || aborting ? (
          <button
            onClick={handleAbort}
            disabled={aborting}
            className={cn(
              'rounded-xl flex-shrink-0 self-center',
              aborting 
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              centered ? 'p-3 mr-3' : 'p-2.5 mr-2'
            )}
            title={aborting ? "Stopping..." : "Stop generating (Esc)"}
          >
            {aborting ? (
              <Loader2 className={cn("animate-spin", centered ? "w-5 h-5" : "w-4 h-4")} />
            ) : (
              <Square className={cn(centered ? "w-5 h-5" : "w-4 h-4")} fill="currentColor" />
            )}
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!canSend}
            className={cn(
              'rounded-xl flex-shrink-0 self-center',
              centered ? 'p-3 mr-3' : 'p-2.5 mr-2',
              canSend
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-transparent text-muted-foreground/40'
            )}
          >
            {sending ? (
              <Loader2 className={cn("animate-spin", centered ? "w-5 h-5" : "w-4 h-4")} />
            ) : (
              <Send className={cn(centered ? "w-5 h-5" : "w-4 h-4")} />
            )}
          </button>
        )}
      </div>
    </div>
  )
})
