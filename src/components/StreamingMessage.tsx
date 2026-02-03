import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ToolCall, FileChange } from '../shared/types'
import { 
  Brain, 
  Loader2,
  FilePlus,
  FileEdit,
  FileX,
  Eye,
  Circle
} from 'lucide-react'
import { useStore } from '../store'
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

      {/* File changes */}
      {streaming.fileChanges.length > 0 && (
        <StreamingFileChanges changes={streaming.fileChanges} />
      )}

      {/* Content */}
      {streaming.content && (
        <div className="prose prose-sm dark:prose-invert max-w-prose break-words mt-3 text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {streaming.content}
          </ReactMarkdown>
          <span className="animate-pulse text-muted-foreground">▌</span>
        </div>
      )}
    </div>
  )
}

function StreamingFileChanges({ changes }: { changes: FileChange[] }) {
  const { setDiffFromData } = useStore()
  
  const getIcon = (type: FileChange['type']) => {
    switch (type) {
      case 'created': return <FilePlus className="w-4 h-4 text-green-500" />
      case 'modified': return <FileEdit className="w-4 h-4 text-yellow-500" />
      case 'deleted': return <FileX className="w-4 h-4 text-red-500" />
    }
  }

  const handleViewDiff = (change: FileChange) => {
    setDiffFromData({
      filePath: change.path,
      oldContent: change.oldContent || '',
      newContent: change.newContent || '',
      changeType: change.type
    })
  }

  return (
    <div className="space-y-1 mb-3 no-drag">
      <p className="text-xs text-muted-foreground mb-2">Files changed</p>
      {changes.map((change, index) => (
        <button
          key={`${change.path}-${index}`}
          onClick={() => handleViewDiff(change)}
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
