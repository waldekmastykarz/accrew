import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore } from '../store'
import type { Message, ToolCall, FileChange } from '../shared/types'
import { 
  Brain, 
  FilePlus,
  FileX,
  FileEdit,
  Terminal,
  Eye
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

      {/* File changes - prominent */}
      {message.fileChanges && message.fileChanges.length > 0 && (
        <FileChangesBlock 
          changes={message.fileChanges} 
          sessionId={message.sessionId}
          messageId={message.id}
        />
      )}

      {/* Response content */}
      {message.content && (
        <div className="prose prose-sm dark:prose-invert max-w-prose break-words mt-3 text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
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

function FileChangesBlock({ 
  changes, 
  sessionId, 
  messageId 
}: { 
  changes: FileChange[]
  sessionId: string
  messageId: string
}) {
  const { selectDiff } = useStore()

  const getIcon = (type: FileChange['type']) => {
    switch (type) {
      case 'created': return <FilePlus className="w-4 h-4 text-green-500" />
      case 'modified': return <FileEdit className="w-4 h-4 text-yellow-500" />
      case 'deleted': return <FileX className="w-4 h-4 text-red-500" />
    }
  }

  return (
    <div className="space-y-1 mb-3 no-drag">
      <p className="text-xs text-muted-foreground mb-2">Files changed</p>
      {changes.map((change, index) => (
        <button
          key={`${change.path}-${index}`}
          onClick={() => selectDiff(sessionId, messageId, change.path, change.type)}
          className="no-drag relative z-[60] flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted/50 transition-colors text-left group"
        >
          {getIcon(change.type)}
          <span className="font-mono text-xs truncate flex-1">
            {change.path.split('/').pop()}
          </span>
          <Eye className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      ))}
    </div>
  )
}
