import { app, BrowserWindow, ipcMain, nativeTheme, dialog, Menu, MenuItemConstructorOptions } from 'electron'
import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater
import path from 'path'
import { fileURLToPath } from 'url'
import { Database } from './database.js'
import { AgentManager } from './agent-manager.js'
import { WorkspaceManager } from './workspace-manager.js'
import { ConfigManager } from './config-manager.js'
import { CopilotClient as SDKCopilotClient } from '@github/copilot-sdk'
import type { Config } from './types.js'

// ESM __dirname polyfill
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Fix PATH for macOS GUI apps (Finder-launched apps don't inherit shell PATH)
if (process.platform === 'darwin' && !process.env.ACCREW_DEV) {
  const additionalPaths = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    `${process.env.HOME}/.local/bin`,
    `${process.env.HOME}/bin`
  ].filter(Boolean)
  process.env.PATH = [...additionalPaths, process.env.PATH].join(':')
}

let mainWindow: BrowserWindow | null = null
let database: Database
let agentManager: AgentManager
let workspaceManager: WorkspaceManager
let configManager: ConfigManager

// Use ACCREW_DEV env var to determine dev mode
const isDev = process.env.ACCREW_DEV === 'true'

// Set proper app name (overrides "Electron" in dev mode)
app.name = 'Accrew'

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    tabbingIdentifier: '', // Disable macOS window tabs (removes Show Tab Bar menu items)
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Handle dark mode changes
  nativeTheme.on('updated', () => {
    mainWindow?.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function initializeServices() {
  configManager = new ConfigManager()
  await configManager.init()
  
  database = new Database()
  await database.init()

  // Archive cleanup on startup
  // Archive sessions older than 2 days, delete archived sessions older than 90 days
  const archived = database.archiveOldSessions(2)
  const deleted = database.deleteArchivedSessions(90)
  if (archived > 0 || deleted > 0) {
    console.log(`Session cleanup: ${archived} archived, ${deleted} deleted`)
  }
  
  const config = configManager.get()
  workspaceManager = new WorkspaceManager(config.workspaceFolder, config.workspaceDepth)
  
  agentManager = new AgentManager(database, workspaceManager, configManager, (event, data) => {
    mainWindow?.webContents.send(event, data)
  })
}

function setupIpcHandlers() {
  // Session handlers
  ipcMain.handle('session:create', async (_, args: { workspace?: string; prompt: string; sessionId: string }) => {
    return agentManager.createSession(args.workspace, args.prompt, args.sessionId)
  })

  ipcMain.handle('session:send', async (_, args: { sessionId: string; content: string }) => {
    return agentManager.sendMessage(args.sessionId, args.content)
  })

  ipcMain.handle('session:list', async () => {
    return database.getSessions()
  })

  ipcMain.handle('session:get', async (_, args: { sessionId: string }) => {
    return {
      session: database.getSession(args.sessionId),
      messages: database.getMessages(args.sessionId)
    }
  })

  ipcMain.handle('session:abort', async (_, args: { sessionId: string }) => {
    return agentManager.abortSession(args.sessionId)
  })

  ipcMain.handle('session:delete', async (_, args: { sessionId: string }) => {
    await agentManager.stopSession(args.sessionId)
    return database.deleteSession(args.sessionId)
  })

  ipcMain.handle('session:mark-read', async (_, args: { sessionId: string }) => {
    return database.markSessionRead(args.sessionId)
  })

  ipcMain.handle('session:archive', async (_, args: { sessionId: string }) => {
    database.archiveSession(args.sessionId)
    return database.getSession(args.sessionId)
  })

  ipcMain.handle('session:unarchive', async (_, args: { sessionId: string }) => {
    database.unarchiveSession(args.sessionId)
    return database.getSession(args.sessionId)
  })

  ipcMain.handle('session:set-viewed', async (_, args: { sessionId: string | null }) => {
    agentManager.setViewedSession(args.sessionId)
  })

  // Workspace handlers
  ipcMain.handle('workspace:list', async () => {
    return workspaceManager.listWorkspaces()
  })

  ipcMain.handle('workspace:match', async (_, args: { prompt: string }) => {
    return agentManager.matchWorkspace(args.prompt)
  })

  // Config handlers
  ipcMain.handle('config:get', async () => {
    return configManager.get()
  })

  ipcMain.handle('config:set', async (_, config: Partial<Config>) => {
    configManager.set(config)
    if (config.workspaceFolder) {
      workspaceManager.setWorkspaceFolder(config.workspaceFolder)
    }
    if (config.workspaceDepth !== undefined) {
      workspaceManager.setDepth(config.workspaceDepth)
    }
    return configManager.get()
  })

  // File diff handler
  ipcMain.handle('file:get-diff', async (_, args: { sessionId: string; messageId: string; filePath: string }) => {
    return database.getFileDiff(args.sessionId, args.messageId, args.filePath)
  })

  // Theme handler
  ipcMain.handle('theme:get', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  // Models handler
  ipcMain.handle('models:list', async () => {
    try {
      const client = new SDKCopilotClient()
      await client.start()
      const models = await client.listModels()
      await client.stop()
      return models
    } catch (error) {
      console.error('Error listing models:', error)
      return []
    }
  })
}

function createMenu() {
  // Set custom About panel options
  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: 'Accrew',
      applicationVersion: app.getVersion(),
      copyright: '© 2026 Waldek Mastykarz',
      credits: 'AI Agent Command Center for local coding agents'
    })
  }

  const template: MenuItemConstructorOptions[] = [
    // App menu (macOS only - contains About)
    ...(process.platform === 'darwin' ? [{
      label: 'Accrew',
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),
    // Edit menu for copy/paste
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },
    // Developer menu (not named "View" to prevent macOS from adding tab items)
    {
      label: 'Developer',
      submenu: [
        { label: 'Toggle Developer Tools', role: 'toggleDevTools' as const, accelerator: 'Alt+CmdOrCtrl+I' }
      ]
    }
  ]
  
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(async () => {
  await initializeServices()
  setupIpcHandlers()
  createMenu()
  createWindow()

  // Auto-updater (disabled in dev mode)
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify()

    autoUpdater.on('update-downloaded', (info) => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. Restart to install?`,
        buttons: ['Restart', 'Later']
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  agentManager?.stopAll()
  database?.close()
})
