import { useState } from 'react'
import { cn } from '../lib/utils'
import { MultiFileDiff } from '@pierre/diffs/react'
import { useStore } from '../store'
import type { ToolCall } from '../shared/types'
import {
  Terminal,
  FileText,
  Search,
  FileEdit,
  FilePlus,
  FileX,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle
} from 'lucide-react'

// Tool type detection
type ToolCategory = 'terminal' | 'edit' | 'create' | 'read' | 'search' | 'delete' | 'generic'

// Helper to convert result to string
function resultToString(result: unknown): string {
  if (typeof result === 'string') return result
  if (result === null || result === undefined) return ''
  return JSON.stringify(result, null, 2)
}

function categorizeToolCall(name: string): ToolCategory {
  const lower = name?.toLowerCase() || ''
  
  if (lower.includes('terminal') || lower.includes('bash') || lower.includes('shell') || lower === 'run_in_terminal') {
    return 'terminal'
  }
  if (lower.includes('replace') || lower.includes('str_replace') || lower === 'edit' || lower === 'edit_file') {
    return 'edit'
  }
  if (lower.includes('create') || lower.includes('write_file')) {
    return 'create'
  }
  if (lower === 'delete_file' || lower === 'delete') {
    return 'delete'
  }
  if (lower.includes('read_file') || lower.includes('read')) {
    return 'read'
  }
  if (lower.includes('search') || lower.includes('grep') || lower.includes('find')) {
    return 'search'
  }
  
  return 'generic'
}

// Collapsible output component
interface CollapsibleOutputProps {
  content: string
  maxLines?: number
  className?: string
}

function CollapsibleOutput({ content, maxLines = 3, className }: CollapsibleOutputProps) {
  const [expanded, setExpanded] = useState(false)
  const lines = content.split('\n')
  const shouldCollapse = lines.length > maxLines
  const displayContent = expanded ? content : lines.slice(0, maxLines).join('\n')
  const hiddenCount = lines.length - maxLines

  return (
    <div className={cn('font-mono text-xs', className)}>
      <pre className="whitespace-pre-wrap break-words text-muted-foreground bg-muted/30 rounded px-2 py-1.5 overflow-x-auto">
        {displayContent}
      </pre>
      {shouldCollapse && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-muted-foreground hover:text-foreground mt-1"
        >
          ...+ {hiddenCount} lines
        </button>
      )}
      {expanded && shouldCollapse && (
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-muted-foreground hover:text-foreground mt-1"
        >
          Show less
        </button>
      )}
    </div>
  )
}

// Status indicator
function StatusIndicator({ status, isStreaming }: { status: ToolCall['status'], isStreaming?: boolean }) {
  if (isStreaming && (status === 'running' || status === 'pending')) {
    return <Loader2 className="w-3 h-3 animate-spin text-violet-500" />
  }
  
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-3 h-3 text-green-500" />
    case 'error':
      return <XCircle className="w-3 h-3 text-red-500" />
    default:
      return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
  }
}

// Terminal tool renderer
function TerminalToolCall({ toolCall, isStreaming }: { toolCall: ToolCall, isStreaming?: boolean }) {
  const args = toolCall.arguments as Record<string, unknown>
  const command = args?.command as string || args?.cmd as string || ''
  const goal = args?.goal as string || args?.explanation as string || ''

  return (
    <div className="border-l-2 border-muted pl-3 py-1">
      <div className="flex items-center gap-2 mb-1">
        <StatusIndicator status={toolCall.status} isStreaming={isStreaming} />
        <Terminal className="w-3 h-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Terminal</span>
        {goal && <span className="text-xs text-muted-foreground italic">— {goal}</span>}
      </div>
      <code className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded">
        {command || toolCall.name}
      </code>
      {toolCall.result !== undefined && (
        <div className="mt-2">
          <CollapsibleOutput content={resultToString(toolCall.result)} />
        </div>
      )}
    </div>
  )
}

// Edit tool renderer with inline diff using @pierre/diffs
function EditToolCall({ toolCall, isStreaming }: { toolCall: ToolCall, isStreaming?: boolean }) {
  const [showDetails, setShowDetails] = useState(true)
  const { theme, config } = useStore()
  const args = toolCall.arguments as Record<string, unknown>
  const filePath = (args?.path || args?.filePath || args?.file_path || '') as string
  const fileName = filePath.split('/').pop() || filePath
  const oldStr = (args?.oldString || args?.old_str || args?.search || '') as string
  const newStr = (args?.newString || args?.new_str || args?.replace || args?.content || '') as string

  const oldFile = { name: fileName, contents: oldStr }
  const newFile = { name: fileName, contents: newStr }

  return (
    <div className="border-l-2 border-yellow-500/50 pl-3 py-1">
      {/* Tool name and args row */}
      <div className="flex items-center gap-2 mb-1 min-w-0">
        <StatusIndicator status={toolCall.status} isStreaming={isStreaming} />
        <span className="text-xs font-mono text-muted-foreground flex-shrink-0">{toolCall.name}</span>
        <code className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded text-muted-foreground truncate flex-1" title={filePath}>
          filePath={filePath}
        </code>
      </div>
      
      {/* Collapsible diff toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-2 w-full text-left min-w-0 mt-1"
      >
        <FileEdit className="w-3 h-3 text-yellow-500 flex-shrink-0" />
        <span className="text-xs font-mono truncate" title={filePath}>{fileName}</span>
        {showDetails ? <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" />}
      </button>
      
      {showDetails && oldStr && newStr && (
        <div className="mt-2 rounded overflow-hidden max-h-48 overflow-y-auto [&_[data-diffs-header]]:hidden">
          <MultiFileDiff
            oldFile={oldFile}
            newFile={newFile}
            options={{
              theme: { dark: 'pierre-dark', light: 'pierre-light' },
              themeType: theme,
              diffStyle: 'unified',
              disableFileHeader: true,
              expandUnchanged: false,
              overflow: config?.diffWordWrap ? 'wrap' : 'scroll',
            }}
          />
        </div>
      )}
    </div>
  )
}

// Create file tool renderer
function CreateToolCall({ toolCall, isStreaming }: { toolCall: ToolCall, isStreaming?: boolean }) {
  const [showContent, setShowContent] = useState(false)
  const args = toolCall.arguments as Record<string, unknown>
  const filePath = (args?.path || args?.filePath || args?.file_path || '') as string
  const fileName = filePath.split('/').pop() || filePath
  const content = (args?.content || '') as string
  const lineCount = content ? content.split('\n').length : 0

  return (
    <div className="border-l-2 border-green-500/50 pl-3 py-1">
      <button
        onClick={() => setShowContent(!showContent)}
        className="flex items-center gap-2 w-full text-left"
      >
        <StatusIndicator status={toolCall.status} isStreaming={isStreaming} />
        <FilePlus className="w-3 h-3 text-green-500" />
        <span className="text-xs font-mono truncate" title={filePath}>{fileName}</span>
        {lineCount > 0 && <span className="text-xs text-muted-foreground">{lineCount} lines</span>}
        {content && (showContent ? <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" />)}
      </button>
      
      {showContent && content && (
        <div className="mt-2">
          <CollapsibleOutput content={content} maxLines={5} />
        </div>
      )}
    </div>
  )
}

// Delete file tool renderer
function DeleteToolCall({ toolCall, isStreaming }: { toolCall: ToolCall, isStreaming?: boolean }) {
  const args = toolCall.arguments as Record<string, unknown>
  const filePath = (args?.path || args?.filePath || args?.file_path || '') as string
  const fileName = filePath.split('/').pop() || filePath

  return (
    <div className="border-l-2 border-red-500/50 pl-3 py-1">
      <div className="flex items-center gap-2">
        <StatusIndicator status={toolCall.status} isStreaming={isStreaming} />
        <FileX className="w-3 h-3 text-red-500" />
        <span className="text-xs font-mono truncate" title={filePath}>{fileName}</span>
        <span className="text-xs text-muted-foreground">{filePath}</span>
      </div>
    </div>
  )
}

// Read file tool renderer
function ReadToolCall({ toolCall, isStreaming }: { toolCall: ToolCall, isStreaming?: boolean }) {
  const args = toolCall.arguments as Record<string, unknown>
  const filePath = (args?.path || args?.filePath || args?.file_path || '') as string
  const fileName = filePath.split('/').pop() || filePath
  const offset = args?.offset as number | undefined
  const limit = args?.limit as number | undefined
  const lineInfo = offset || limit 
    ? `L${offset || 1}${limit ? `-${(offset || 1) + limit - 1}` : '+'}`
    : ''

  return (
    <div className="border-l-2 border-blue-500/50 pl-3 py-1">
      <div className="flex items-center gap-2 mb-1">
        <StatusIndicator status={toolCall.status} isStreaming={isStreaming} />
        <FileText className="w-3 h-3 text-blue-500" />
        <span className="text-xs font-mono truncate" title={filePath}>{fileName}</span>
        {lineInfo && <span className="text-xs text-muted-foreground">{lineInfo}</span>}
      </div>
      {toolCall.result !== undefined && (
        <CollapsibleOutput 
          content={resultToString(toolCall.result)} 
          maxLines={3}
        />
      )}
    </div>
  )
}

// Search tool renderer
function SearchToolCall({ toolCall, isStreaming }: { toolCall: ToolCall, isStreaming?: boolean }) {
  const args = toolCall.arguments as Record<string, unknown>
  const query = (args?.query || args?.pattern || args?.search || '') as string

  return (
    <div className="border-l-2 border-purple-500/50 pl-3 py-1">
      <div className="flex items-center gap-2 mb-1">
        <StatusIndicator status={toolCall.status} isStreaming={isStreaming} />
        <Search className="w-3 h-3 text-purple-500" />
        <span className="text-xs text-muted-foreground">Search</span>
        <code className="text-xs font-mono bg-muted/50 px-1 rounded">{query}</code>
      </div>
      {toolCall.result !== undefined && (
        <CollapsibleOutput 
          content={resultToString(toolCall.result)} 
          maxLines={5}
        />
      )}
    </div>
  )
}

// Format args compactly for inline display - no truncation, use CSS overflow
function formatArgsInline(args: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return ''
  
  const pairs = Object.entries(args)
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const val = typeof v === 'string' ? v : JSON.stringify(v)
      return `${k}=${val}`
    })
  
  return pairs.join(', ')
}

// Generic tool renderer (fallback) - shows inline with collapsible output
function GenericToolCall({ toolCall, isStreaming }: { toolCall: ToolCall, isStreaming?: boolean }) {
  const args = toolCall.arguments as Record<string, unknown>
  const argsDisplay = formatArgsInline(args)

  return (
    <div className="border-l-2 border-muted pl-3 py-1">
      <div className="flex items-center gap-2 mb-1 min-w-0">
        <StatusIndicator status={toolCall.status} isStreaming={isStreaming} />
        <span className="text-xs font-mono text-muted-foreground flex-shrink-0">{toolCall.name}</span>
        {argsDisplay && (
          <code className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded text-muted-foreground truncate flex-1" title={argsDisplay}>
            {argsDisplay}
          </code>
        )}
      </div>
      {toolCall.result !== undefined && (
        <CollapsibleOutput 
          content={resultToString(toolCall.result)} 
          maxLines={3}
        />
      )}
    </div>
  )
}

// Main export: renders the appropriate tool component
export interface ToolRendererProps {
  toolCall: ToolCall
  isStreaming?: boolean
}

export function ToolRenderer({ toolCall, isStreaming }: ToolRendererProps) {
  const category = categorizeToolCall(toolCall.name)
  
  switch (category) {
    case 'terminal':
      return <TerminalToolCall toolCall={toolCall} isStreaming={isStreaming} />
    case 'edit':
      return <EditToolCall toolCall={toolCall} isStreaming={isStreaming} />
    case 'create':
      return <CreateToolCall toolCall={toolCall} isStreaming={isStreaming} />
    case 'delete':
      return <DeleteToolCall toolCall={toolCall} isStreaming={isStreaming} />
    case 'read':
      return <ReadToolCall toolCall={toolCall} isStreaming={isStreaming} />
    case 'search':
      return <SearchToolCall toolCall={toolCall} isStreaming={isStreaming} />
    default:
      return <GenericToolCall toolCall={toolCall} isStreaming={isStreaming} />
  }
}

// Export category function for use elsewhere
export { categorizeToolCall, type ToolCategory }
