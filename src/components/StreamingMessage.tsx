import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ToolCall, FileChange } from '../shared/types'
import { 
  Brain, 
  Loader2,
  Circle
} from 'lucide-react'
import { ToolRenderer } from './ToolRenderers'

interface StreamingState {
  thinking: string
  content: string
  toolCalls: ToolCall[]
  fileChanges: FileChange[]
}

interface StreamingMessageProps {
  streaming: StreamingState
}

export function StreamingMessage({ streaming }: StreamingMessageProps) {
  // Show thinking section even when empty (during initial "Working" phase)
  const showThinkingSection = !streaming.content || streaming.thinking

  // Parse thinking into bullet points
  const thoughts = streaming.thinking
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line.length > 0)

  return (
    <div className="mb-6 border-l-2 border-violet-500 pl-4 ml-1 relative z-10">
      {/* Activity header */}
      <div className="flex items-center gap-2 mb-3">
        <Circle className="w-3 h-3 fill-violet-500 text-violet-500 animate-pulse" />
        <span className="text-xs text-muted-foreground">Working</span>
      </div>

      {/* Thinking - as bullet points */}
      {showThinkingSection && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Thinking</span>
            {!streaming.content && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
          <ul className="ml-5 space-y-0.5 max-h-48 overflow-y-auto">
            {thoughts.length > 0 ? (
              thoughts.map((thought, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-muted-foreground/50">•</span>
                  <span>{thought}</span>
                </li>
              ))
            ) : (
              <li className="text-xs text-muted-foreground flex gap-2">
                <span className="text-muted-foreground/50">•</span>
                <span>Analyzing request...</span>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Tool calls - inline with specialized renderers */}
      {streaming.toolCalls.length > 0 && (
        <div className="mb-3 space-y-2">
          {streaming.toolCalls.map((tc) => (
            <ToolRenderer key={tc.id} toolCall={tc} isStreaming />
          ))}
        </div>
      )}

      {/* WHY: StreamingFileChanges removed — changes now shown in ChangesPanel (right side)
          instead of inline at end of each message. Tool-level diffs are kept via ToolRenderer */}

      {/* Content */}
      {streaming.content && (
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
            {streaming.content}
          </ReactMarkdown>
          <span className="animate-pulse text-muted-foreground">▌</span>
        </div>
      )}
    </div>
  )
}
