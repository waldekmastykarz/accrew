import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message, ToolCall } from '../shared/types'
import { 
  Brain, 
  Terminal
} from 'lucide-react'
import { ToolRenderer } from './ToolRenderers'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="mb-4 flex items-start gap-2">
        <Terminal className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-sm font-medium">{message.content}</p>
      </div>
    )
  }

  return (
    <div className="mb-6 border-l-2 border-muted pl-4 ml-1 relative z-10">
      {/* Thinking - compact */}
      {message.thinking && (
        <ThinkingBlock content={message.thinking} />
      )}

      {/* Tool calls - inline compact list */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <ToolCallsList toolCalls={message.toolCalls} />
      )}

      {/* WHY: FileChangesBlock removed — changes now shown in ChangesPanel (right side)
          instead of inline at end of each message. Tool-level diffs are kept via ToolRenderer */}

      {/* Response content */}
      {message.content && (
        <div className="prose prose-sm dark:prose-invert max-w-prose break-words mt-3 text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // WHY: Open links in default system browser instead of inside Electron app
              a: ({ href, children }) => (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault()
                    if (href) window.accrew.shell.openExternal(href)
                  }}
                  className="text-blue-500 hover:underline cursor-pointer"
                >
                  {children}
                </a>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
}

function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  
  // Parse thinking into bullet points - split on newlines and filter empty
  const thoughts = content
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
  
  const maxCollapsed = 3
  const shouldCollapse = thoughts.length > maxCollapsed
  const displayThoughts = expanded ? thoughts : thoughts.slice(0, maxCollapsed)

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Brain className="w-3 h-3" />
        <span className="text-xs">Thinking</span>
      </div>
      <ul className="ml-5 space-y-0.5">
        {displayThoughts.map((thought, i) => (
          <li key={i} className="text-xs text-muted-foreground flex gap-2">
            <span className="text-muted-foreground/50">•</span>
            <span>{thought}</span>
          </li>
        ))}
      </ul>
      {shouldCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-5 mt-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? 'Show less' : `...+ ${thoughts.length - maxCollapsed} more`}
        </button>
      )}
    </div>
  )
}

function ToolCallsList({ toolCalls }: { toolCalls: ToolCall[] }) {
  return (
    <div className="mb-3 space-y-2">
      {toolCalls.map((tc) => (
        <ToolRenderer key={tc.id} toolCall={tc} />
      ))}
    </div>
  )
}
