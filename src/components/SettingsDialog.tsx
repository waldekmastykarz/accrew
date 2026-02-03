import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { X, Folder, Type, Cpu } from 'lucide-react'

interface ModelInfo {
  id: string
  name?: string
}

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen, config, updateConfig } = useStore()
  const [workspaceFolder, setWorkspaceFolder] = useState('')
  const [diffFont, setDiffFont] = useState('')
  const [diffFontSize, setDiffFontSize] = useState(13)
  const [model, setModel] = useState('')
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])

  useEffect(() => {
    if (config) {
      setWorkspaceFolder(config.workspaceFolder)
      setDiffFont(config.diffFont)
      setDiffFontSize(config.diffFontSize)
      setModel(config.model)
    }
  }, [config])

  useEffect(() => {
    if (settingsOpen) {
      // Fetch available models when dialog opens
      window.accrew.models.list().then((models: ModelInfo[]) => {
        setAvailableModels(models)
      }).catch(() => {
        // Silently fail - user can still type model name manually
      })
    }
  }, [settingsOpen])

  if (!settingsOpen) return null

  const handleSave = async () => {
    await updateConfig({
      workspaceFolder,
      diffFont,
      diffFontSize,
      model
    })
    setSettingsOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => setSettingsOpen(false)}
      />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Workspace folder */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Folder className="w-4 h-4 text-muted-foreground" />
              Workspace Folder
            </label>
            <p className="text-xs text-muted-foreground">
              The parent folder containing your project repositories
            </p>
            <input
              type="text"
              value={workspaceFolder}
              onChange={(e) => setWorkspaceFolder(e.target.value)}
              placeholder="/Users/you/github"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Diff font */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Type className="w-4 h-4 text-muted-foreground" />
              Diff Font
            </label>
            <p className="text-xs text-muted-foreground">
              Font family for the diff viewer (type or select)
            </p>
            <input
              type="text"
              list="font-options"
              value={diffFont}
              onChange={(e) => setDiffFont(e.target.value)}
              placeholder="Enter font name..."
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <datalist id="font-options">
              <option value="ui-monospace">System Mono</option>
              <option value="SF Mono" />
              <option value="Menlo" />
              <option value="Monaco" />
              <option value="Consolas" />
              <option value="Fira Code" />
              <option value="JetBrains Mono" />
              <option value="Source Code Pro" />
            </datalist>
          </div>

          {/* Diff font size */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              Font Size
            </label>
            <p className="text-xs text-muted-foreground">
              Font size for the diff viewer ({diffFontSize}px)
            </p>
            <input
              type="range"
              min="10"
              max="20"
              value={diffFontSize}
              onChange={(e) => setDiffFontSize(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>10px</span>
              <span>20px</span>
            </div>
          </div>

          {/* Model selection */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Cpu className="w-4 h-4 text-muted-foreground" />
              Model
            </label>
            <p className="text-xs text-muted-foreground">
              LLM model for conversations (type or select)
            </p>
            <input
              type="text"
              list="model-options"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="claude-opus-4-5"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <datalist id="model-options">
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))}
            </datalist>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30">
          <button
            onClick={() => setSettingsOpen(false)}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
