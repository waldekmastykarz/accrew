import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Config } from './types.js'

const DEFAULT_CONFIG: Config = {
  workspaceFolder: path.join(os.homedir(), 'github'),
  workspaceDepth: 1,
  diffFont: 'ui-monospace',
  diffFontSize: 13,
  diffWordWrap: false,
  sidebarWidth: 256,
  changesPanelWidth: 500,
  changesFileListHeight: 200,
  model: 'claude-opus-4-5',
}

export class ConfigManager {
  private configPath: string
  private config: Config = DEFAULT_CONFIG

  constructor() {
    this.configPath = path.join(os.homedir(), '.accrew', 'config.json')
  }

  async init() {
    const configDir = path.dirname(this.configPath)
    
    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    // Load existing config or create default
    if (fs.existsSync(this.configPath)) {
      try {
        const data = fs.readFileSync(this.configPath, 'utf-8')
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) }
      } catch {
        this.config = DEFAULT_CONFIG
        this.save()
      }
    } else {
      this.config = DEFAULT_CONFIG
      this.save()
    }
  }

  get(): Config {
    return { ...this.config }
  }

  set(updates: Partial<Config>): void {
    this.config = { ...this.config, ...updates }
    this.save()
  }

  private save(): void {
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
  }
}
