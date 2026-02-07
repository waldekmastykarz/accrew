import { useState, useCallback, useRef, useEffect } from 'react'
import { MultiFileDiff, PatchDiff } from '@pierre/diffs/react'
import { useStore } from '../store'
import { X, RefreshCw, FilePlus, FileX, FileEdit, FileQuestion, File } from 'lucide-react'
import type { ChangedFile } from '../shared/types'

const MIN_FILE_LIST_HEIGHT = 80
const MAX_FILE_LIST_HEIGHT = 400

function FileStatusIcon({ status }: { status: ChangedFile['status'] }) {
  switch (status) {
    case 'created':
      return <FilePlus className="w-3 h-3 text-green-500" />
    case 'modified':
      return <FileEdit className="w-3 h-3 text-yellow-500" />
    case 'deleted':
      return <FileX className="w-3 h-3 text-red-500" />
    case 'untracked':
      return <FileQuestion className="w-3 h-3 text-blue-500" />
    default:
      return <File className="w-3 h-3 text-muted-foreground" />
  }
}

function statusLabel(status: ChangedFile['status']): string {
  switch (status) {
    case 'created': return 'A'
    case 'modified': return 'M'
    case 'deleted': return 'D'
    case 'untracked': return '?'
    default: return ''
  }
}

export function ChangesPanel() {
  const { 
    changesPanel, 
    closeChangesPanel, 
    selectChangedFile,
    loadChangedFiles,
    activeSessionId,
    theme,
    selectedDiff,  // Fallback for non-git tool diffs
    config,
    setChangesFileListHeight
  } = useStore()

  const { open, files, selectedFile, diffContent, diffType } = changesPanel
  const [refreshing, setRefreshing] = useState(false)
  
  // File list height resize state
  const [isDragging, setIsDragging] = useState(false)
  const [localHeight, setLocalHeight] = useState(config?.changesFileListHeight ?? 200)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  // Sync local height with config
  useEffect(() => {
    if (config?.changesFileListHeight) {
      setLocalHeight(config.changesFileListHeight)
    }
  }, [config?.changesFileListHeight])

  const handleDragMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragRef.current = { startY: e.clientY, startHeight: localHeight }
  }, [localHeight])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const delta = e.clientY - dragRef.current.startY
      const newHeight = Math.min(MAX_FILE_LIST_HEIGHT, Math.max(MIN_FILE_LIST_HEIGHT, dragRef.current.startHeight + delta))
      setLocalHeight(newHeight)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setChangesFileListHeight(localHeight)
      dragRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, localHeight, setChangesFileListHeight])

  if (!open) return null

  const handleRefresh = async () => {
    if (activeSessionId) {
      setRefreshing(true)
      await loadChangedFiles(activeSessionId)
      setRefreshing(false)
    }
  }

  const handleFileClick = async (filePath: string) => {
    await selectChangedFile(filePath)
  }

  // For non-git diffs, use the selectedDiff from the store
  const toolDiffData = diffType === 'tool' && selectedDiff ? {
    oldFile: { name: selectedFile?.split('/').pop() || '', contents: selectedDiff.oldContent || '' },
    newFile: { name: selectedFile?.split('/').pop() || '', contents: selectedDiff.newContent || '' }
  } : null

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Header — min-h-[61px] matches ChatPane header height for visual consistency */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 drag-region min-h-[61px]">
        <span className="text-sm font-medium no-drag">
          Changes {files.length > 0 && `(${files.length})`}
        </span>
        <div className="flex items-center gap-1 no-drag">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="relative z-[60] p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh (⌘⇧R)"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={closeChangesPanel}
            className="relative z-[60] p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Close (⌘\)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* File list */}
      {files.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground text-sm">
          No changes
        </div>
      ) : (
        <div className="relative">
          <div 
            className="overflow-y-auto"
            style={{ height: localHeight }}
          >
            {files.map((file) => (
              <button
                key={file.path}
                onClick={() => handleFileClick(file.path)}
                className={`w-full flex items-center gap-1.5 px-3 py-1 hover:bg-muted/50 transition-colors text-left ${
                  selectedFile === file.path ? 'bg-muted' : ''
                }`}
              >
                <FileStatusIcon status={file.status} />
                <span className="text-xs truncate flex-1 min-w-0">
                  {file.path}
                </span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {statusLabel(file.status)}
                </span>
              </button>
          ))}
          </div>
          {/* Resize handle for file list height */}
          <div
            className="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-primary/20 active:bg-primary/30 border-b border-border"
            onMouseDown={handleDragMouseDown}
          />
        </div>
      )}

      {/* Diff viewer */}
      <div className="flex-1 overflow-auto">
        {!selectedFile ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            Select a file to view changes
          </div>
        ) : diffType === 'git' && diffContent ? (
          <PatchDiff
            patch={diffContent}
            options={{
              theme: { dark: 'pierre-dark', light: 'pierre-light' },
              themeType: theme,
              diffStyle: 'unified',
              expandUnchanged: false,
            }}
          />
        ) : diffType === 'tool' && toolDiffData ? (
          <MultiFileDiff
            oldFile={toolDiffData.oldFile}
            newFile={toolDiffData.newFile}
            options={{
              theme: { dark: 'pierre-dark', light: 'pierre-light' },
              themeType: theme,
              diffStyle: 'unified',
              disableFileHeader: true,
              expandUnchanged: false,
            }}
          />
        ) : (
          <div className="p-4 text-center text-muted-foreground text-sm">
            Loading diff...
          </div>
        )}
      </div>
    </div>
  )
}
