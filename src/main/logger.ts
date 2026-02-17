import { app } from 'electron'
import { appendFileSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import os from 'os'

// WHY: Logger uses a getter for configManager instead of a direct import to avoid
// circular dependencies — agent-manager and copilot-client import logger, but also
// need to be imported by index.ts which creates configManager. The getter is set
// once during app initialization via initLogger().
let getDebugEnabled: () => boolean = () => false
let logFilePath: string | null = null
let wasEnabled = false

export function initLogger(isDebugEnabled: () => boolean): void {
  getDebugEnabled = isDebugEnabled
  // WHY: Log file lives in ~/.accrew/ alongside config.json so all user-facing
  // files are in one predictable location, not split between ~/.accrew and
  // ~/Library/Application Support/Accrew/.
  const logDir = path.join(os.homedir(), '.accrew')
  mkdirSync(logDir, { recursive: true })
  logFilePath = path.join(logDir, 'debug.log')

  // Truncate log file on startup when debug is enabled
  if (isDebugEnabled()) {
    wasEnabled = true
    try {
      writeFileSync(logFilePath, `[${new Date().toISOString()}] Debug logging started (v${app.getVersion()})\n`)
    } catch {
      // Non-critical — log file may not be writable
    }
  }
}

export function debug(category: string, message: string, data?: unknown): void {
  if (!getDebugEnabled()) {
    wasEnabled = false
    return
  }

  // WHY: Truncate log file when debug is toggled on mid-session via Settings.
  // Without this, enabling debug appends to stale logs from a previous run,
  // making it unclear which entries are from the current session.
  if (!wasEnabled && logFilePath) {
    wasEnabled = true
    try {
      writeFileSync(logFilePath, `[${new Date().toISOString()}] Debug logging enabled (v${app.getVersion()})\n`)
    } catch {
      // Non-critical
    }
  }

  const timestamp = new Date().toISOString()
  const prefix = `[${timestamp}] [${category}]`
  const line = data !== undefined
    ? `${prefix} ${message} ${JSON.stringify(data)}`
    : `${prefix} ${message}`

  // Terminal (visible in dev mode or when launched from terminal)
  console.log(line)

  // WHY: File logging is essential for packaged builds launched from Finder/Dock
  // where stdout is not visible. The log file lives in userData alongside the DB.
  if (logFilePath) {
    try {
      appendFileSync(logFilePath, line + '\n')
    } catch {
      // Non-critical
    }
  }
}
