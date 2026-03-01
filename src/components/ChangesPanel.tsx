import { useState, useCallback, useRef, useEffect } from 'react'
import { MultiFileDiff, PatchDiff } from '@pierre/diffs/react'
import { useStore } from '../store'
import { X, RefreshCw, FilePlus, FileX, FileEdit, FileQuestion, File, Folder, FolderOpen, Maximize2, Minimize2, Files } from 'lucide-react'
import type { ChangedFile, FileTreeNode } from '../shared/types'

const MIN_FILE_LIST_HEIGHT = 80
const MAX_FILE_LIST_HEIGHT = 400
const DEFAULT_EXPANDED_DEPTH = 2

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

interface FileTreeItemProps {
  node: FileTreeNode
  depth: number
  selectedPath: string | null
  onFileClick: (path: string) => void
}

function FileTreeItem({ node, depth, selectedPath, onFileClick }: FileTreeItemProps) {
  const [open, setOpen] = useState(depth < DEFAULT_EXPANDED_DEPTH)

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-1 px-2 py-0.5 hover:bg-muted/50 transition-colors text-left"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {open
            ? <FolderOpen className="w-3 h-3 text-yellow-500 flex-shrink-0" />
            : <Folder className="w-3 h-3 text-yellow-500 flex-shrink-0" />
          }
          <span className="text-xs truncate text-foreground">{node.name}</span>
        </button>
        {open && node.children?.map(child => (
          <FileTreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onFileClick={onFileClick}
          />
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => onFileClick(node.path)}
      className={`w-full flex items-center gap-1 px-2 py-0.5 hover:bg-muted/50 transition-colors text-left ${
        selectedPath === node.path ? 'bg-muted' : ''
      }`}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      <File className="w-3 h-3 text-muted-foreground flex-shrink-0" />
      <span className="text-xs truncate">{node.name}</span>
    </button>
  )
}

export function ChangesPanel() {
  const { 
    changesPanel, 
    closeChangesPanel, 
    selectChangedFile,
    loadChangedFiles,
    activeSessionId,
    sessions,
    theme,
    selectedDiff,  // Fallback for non-git tool diffs
    config,
    setChangesFileListHeight,
    setChangesPanelView,
    selectAllFile,
    toggleChangesPanelExpanded
  } = useStore()

  const { open, files, selectedFile, diffContent, diffType, view, allFilesTree, selectedAllFilePath, allFileContent, expanded } = changesPanel
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

  const handleAllFileClick = async (filePath: string) => {
    const session = sessions.find(s => s.id === activeSessionId)
    if (!session?.workspacePath) return
    await selectAllFile(filePath, session.workspacePath)
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
        {/* View toggle tabs */}
        <div className="flex items-center gap-1 no-drag">
          <button
            onClick={() => setChangesPanelView('changes')}
            className={`text-sm px-2 py-0.5 rounded transition-colors ${
              view === 'changes'
                ? 'font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Changes {view === 'changes' && files.length > 0 && `(${files.length})`}
          </button>
          <span className="text-muted-foreground/40 text-sm">|</span>
          <button
            onClick={() => setChangesPanelView('all-files')}
            className={`flex items-center gap-1 text-sm px-2 py-0.5 rounded transition-colors ${
              view === 'all-files'
                ? 'font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Files className="w-3 h-3" />
            All Files
          </button>
        </div>
        <div className="flex items-center gap-1 no-drag">
          {view === 'changes' && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="relative z-[60] p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Refresh (⌘⇧R)"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
          {/* WHY: Expand/restore toggles the panel to cover the chat area for more reading space */}
          <button
            onClick={toggleChangesPanelExpanded}
            className="relative z-[60] p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={expanded ? 'Restore panel' : 'Expand panel'}
          >
            {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
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

      {view === 'changes' ? (
        <>
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
                  overflow: config?.diffWordWrap ? 'wrap' : 'scroll',
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
                  overflow: config?.diffWordWrap ? 'wrap' : 'scroll',
                }}
              />
            ) : diffType !== null ? (
              // WHY: diffType is set but content is empty — getDiff() resolved with null
              // (e.g. staged-only changes, submodules, binary files). Show "no changes"
              // instead of the infinite "Loading diff..." that previously appeared here.
              <div className="p-4 text-center text-muted-foreground text-sm">
                No changes to display
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground text-sm">
                Loading diff...
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* All Files tree */}
          <div className="relative flex-shrink-0">
            <div
              className="overflow-y-auto"
              style={{ height: localHeight }}
            >
              {allFilesTree === null ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Loading files...
                </div>
              ) : allFilesTree.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No files found
                </div>
              ) : (
                allFilesTree.map(node => (
                  <FileTreeItem
                    key={node.path}
                    node={node}
                    depth={0}
                    selectedPath={selectedAllFilePath}
                    onFileClick={handleAllFileClick}
                  />
                ))
              )}
            </div>
            {/* Resize handle for file list height */}
            <div
              className="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-primary/20 active:bg-primary/30 border-b border-border"
              onMouseDown={handleDragMouseDown}
            />
          </div>

          {/* File content viewer */}
          <div className="flex-1 overflow-auto">
            {!selectedAllFilePath ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                Select a file to view its contents
              </div>
            ) : allFileContent === null ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                Loading...
              </div>
            ) : (
              <pre
                className={`p-4 text-xs font-mono leading-relaxed ${
                  config?.diffWordWrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-auto'
                }`}
              >
                {allFileContent}
              </pre>
            )}
          </div>
        </>
      )}
    </div>
  )
}
