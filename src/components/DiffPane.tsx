import { MultiFileDiff } from '@pierre/diffs/react'
import { useStore } from '../store'
import { X, FilePlus, FileX, FileEdit } from 'lucide-react'

export function DiffPane() {
  const { selectedDiff, closeDiff, theme } = useStore()

  if (!selectedDiff) return null

  const fileName = selectedDiff.filePath.split('/').pop() || selectedDiff.filePath
  const hasContent = selectedDiff.oldContent || selectedDiff.newContent

  const oldFile = {
    name: fileName,
    contents: selectedDiff.oldContent || '',
  }

  const newFile = {
    name: fileName,
    contents: selectedDiff.newContent || '',
  }

  const getIcon = () => {
    switch (selectedDiff.changeType) {
      case 'created': return <FilePlus className="w-4 h-4 text-green-500" />
      case 'modified': return <FileEdit className="w-4 h-4 text-yellow-500" />
      case 'deleted': return <FileX className="w-4 h-4 text-red-500" />
    }
  }

  const getLabel = () => {
    switch (selectedDiff.changeType) {
      case 'created': return 'New file'
      case 'modified': return 'Modified'
      case 'deleted': return 'Deleted'
    }
  }

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {getIcon()}
          <span className="text-sm font-medium truncate">
            {fileName}
          </span>
          <span className="text-xs text-muted-foreground">
            {getLabel()}
          </span>
        </div>
        <button
          onClick={closeDiff}
          className="no-drag relative z-[60] p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* File path */}
      <div className="px-4 py-2 bg-muted/30 border-b border-border">
        <p className="text-xs text-muted-foreground font-mono truncate">
          {selectedDiff.filePath}
        </p>
      </div>

      {/* Diff viewer */}
      <div className="flex-1 overflow-auto">
        {!hasContent ? (
          <div className="p-4 text-center text-muted-foreground">
            <p>File was {selectedDiff.changeType}.</p>
            <p className="text-xs mt-2">No content available to display.</p>
          </div>
        ) : (
          <MultiFileDiff
            oldFile={oldFile}
            newFile={newFile}
            options={{
              theme: { dark: 'pierre-dark', light: 'pierre-light' },
              themeType: theme,
              diffStyle: 'unified',
              disableFileHeader: true,
              expandUnchanged: false,
            }}
          />
        )}
      </div>
    </div>
  )
}
