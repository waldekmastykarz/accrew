import { v4 as uuid } from 'uuid'
import { app, BrowserWindow } from 'electron'
import { Database } from './database.js'
import { WorkspaceManager } from './workspace-manager.js'
import { ConfigManager } from './config-manager.js'
import { CopilotClient, type StreamEvent } from './copilot-client.js'
import type { Session, Message, FileChange, ToolCall, WorkspaceMatch, Workspace } from './types.js'

type EventEmitter = (event: string, data: unknown) => void

interface ActiveSession {
  session: Session
  copilotClient: CopilotClient | null
  currentMessageId: string | null
  thinking: string
  toolCalls: ToolCall[]
  fileChanges: FileChange[]
  content: string
  aborted: boolean
}

export class AgentManager {
  private database: Database
  private workspaceManager: WorkspaceManager
  private configManager: ConfigManager
  private emit: EventEmitter
  private activeSessions: Map<string, ActiveSession> = new Map()
  private viewedSessionId: string | null = null

  constructor(database: Database, workspaceManager: WorkspaceManager, configManager: ConfigManager, emit: EventEmitter) {
    this.database = database
    this.workspaceManager = workspaceManager
    this.configManager = configManager
    this.emit = emit
  }

  setViewedSession(sessionId: string | null): void {
    this.viewedSessionId = sessionId
  }

  async createSession(workspaceName: string | undefined, prompt: string, sessionId: string): Promise<Session> {
    let workspace: Workspace | null = null
    let workspacePath: string | null = null

    // Check for explicit @-mention
    const mentionMatch = prompt.match(/^@(\S+)\s*(.*)$/)
    if (mentionMatch) {
      workspaceName = mentionMatch[1]
      prompt = mentionMatch[2] || prompt
    }

    // Check if this is a "create new project" intent
    const isNewProject = await this.detectNewProjectIntent(prompt)
    
    if (isNewProject && !workspaceName) {
      // Create new workspace with random name
      const newName = this.workspaceManager.generateRandomName()
      workspacePath = this.workspaceManager.createWorkspace(newName)
      workspaceName = newName
      workspace = await this.workspaceManager.getWorkspace(newName)
    } else if (workspaceName) {
      // Use specified workspace
      workspace = await this.workspaceManager.getWorkspace(workspaceName)
      workspacePath = workspace?.path || null
    } else {
      // Try to match workspace from prompt
      const match = await this.matchWorkspace(prompt)
      if (match.workspace && match.confidence > 0.7) {
        workspace = match.workspace
        workspacePath = workspace.path
        workspaceName = workspace.displayName
      }
    }

    const session: Session = {
      id: sessionId,
      title: 'New conversation',
      workspace: workspace?.displayName || workspaceName || null,
      workspacePath,
      logo: workspace?.logo || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hasUnread: false,
      status: 'active'
    }

    this.database.createSession(session)

    // Initialize active session tracking
    this.activeSessions.set(session.id, {
      session,
      copilotClient: null,
      currentMessageId: null,
      thinking: '',
      toolCalls: [],
      fileChanges: [],
      content: '',
      aborted: false
    })

    // Send the initial prompt (don't await - let it run async so renderer gets session ID immediately)
    this.sendMessage(session.id, prompt).catch(err => {
      console.error('Error sending initial message:', err)
      this.emit('agent:error', { sessionId: session.id, error: err.message })
    })

    return session
  }

  async sendMessage(sessionId: string, content: string): Promise<void> {
    let active = this.activeSessions.get(sessionId)
    
    // WHY: Lazily initialize active session for existing DB sessions — when app restarts,
    // sessions exist in DB but not in activeSessions Map. Create tracking entry on first message.
    if (!active) {
      const session = this.database.getSession(sessionId)
      if (!session) {
        throw new Error('Session not found')
      }
      active = {
        session,
        copilotClient: null,
        currentMessageId: null,
        thinking: '',
        toolCalls: [],
        fileChanges: [],
        content: '',
        aborted: false
      }
      this.activeSessions.set(sessionId, active)
    }

    // Save user message
    const userMessage: Message = {
      id: uuid(),
      sessionId,
      role: 'user',
      content,
      createdAt: Date.now()
    }
    this.database.addMessage(userMessage)

    // WHY: Update session timestamp immediately when user sends — moves session
    // to top of list right away, not after agent responds
    this.database.updateSession(sessionId, {})
    const updatedSession = this.database.getSession(sessionId)
    if (updatedSession) {
      this.emit('session:updated', { session: updatedSession })
    }

    // Reset streaming state for new assistant message
    const assistantMessageId = uuid()
    active.currentMessageId = assistantMessageId
    active.thinking = ''
    active.toolCalls = []
    active.fileChanges = []
    active.content = ''
    active.aborted = false

    // Save placeholder assistant message
    const assistantMessage: Message = {
      id: assistantMessageId,
      sessionId,
      role: 'assistant',
      content: '',
      createdAt: Date.now()
    }
    this.database.addMessage(assistantMessage)

    // Start or continue Copilot session
    try {
      if (!active.copilotClient) {
        const config = this.configManager.get()
        active.copilotClient = new CopilotClient({
          workingDirectory: active.session.workspacePath || process.cwd(),
          model: config.model,
          nodePath: config.nodePath || undefined,
        })
        await active.copilotClient.init()
      }

      // Stream the response
      for await (const event of active.copilotClient.chat(content)) {
        await this.handleStreamEvent(sessionId, event)
      }

      // Finalize the message
      this.database.updateMessage(assistantMessageId, {
        content: active.content,
        thinking: active.thinking || undefined,
        toolCalls: active.toolCalls.length > 0 ? active.toolCalls : undefined,
        fileChanges: active.fileChanges.length > 0 ? active.fileChanges : undefined
      })

      // Save file snapshots
      for (const change of active.fileChanges) {
        this.database.saveFileSnapshot(sessionId, assistantMessageId, change)
      }

      // Generate/update title after first response
      const messages = this.database.getMessages(sessionId)
      if (messages.length <= 2) {
        await this.generateTitle(sessionId)
      } else {
        // Update title periodically
        await this.updateTitleIfNeeded(sessionId)
      }

      this.emit('agent:done', { 
        sessionId, 
        messageId: assistantMessageId,
        thinking: active.thinking,
        content: active.content,
        toolCalls: active.toolCalls,
        fileChanges: active.fileChanges,
        aborted: active.aborted
      })

      // Bounce dock icon on macOS to notify user
      if (process.platform === 'darwin') {
        app.dock?.bounce('informational')
      } else if (process.platform === 'win32') {
        // Flash taskbar on Windows
        BrowserWindow.getAllWindows()[0]?.flashFrame(true)
      }

      // WHY: Always call updateSession to touch updated_at — this drives
      // the "most recent first" sort. Only set hasUnread when not viewing.
      this.database.updateSession(sessionId, 
        sessionId !== this.viewedSessionId ? { hasUnread: true } : {}
      )
      const updatedSession = this.database.getSession(sessionId)
      if (updatedSession) {
        this.emit('session:updated', { session: updatedSession })
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.emit('agent:error', { sessionId, error: errorMessage })
      this.database.updateSession(sessionId, { status: 'error' })
    }
  }

  private async handleStreamEvent(sessionId: string, event: StreamEvent): Promise<void> {
    const active = this.activeSessions.get(sessionId)
    if (!active) return

    switch (event.type) {
      case 'thinking':
        active.thinking += event.content || ''
        this.emit('agent:thinking', { sessionId, content: event.content || '' })
        break

      case 'tool_call':
        if (event.id && event.name) {
          const toolCall: ToolCall = {
            id: event.id,
            name: event.name,
            arguments: event.arguments || {},
            status: 'running'
          }
          active.toolCalls.push(toolCall)
          this.emit('agent:tool-call', { sessionId, toolCall })
        }
        break

      case 'tool_result':
        const tc = active.toolCalls.find(t => t.id === event.toolCallId)
        if (tc) {
          tc.result = event.result
          tc.status = 'completed'
          
          // Check for file changes in tool results
          const args = tc.arguments || {}
          const toolName = tc.name?.toLowerCase() || ''
          if (toolName === 'write_file' || toolName === 'create_file' || toolName === 'create' || toolName === 'create_file') {
            const change: FileChange = {
              path: (args.path as string) || (args.filePath as string),
              type: 'created',
              newContent: (args.content as string) || ''
            }
            active.fileChanges.push(change)
            this.emit('agent:file-change', { sessionId, change })
          } else if (toolName === 'edit' || toolName === 'edit_file' || toolName === 'replace_string_in_file' || toolName === 'str_replace') {
            // Extract old/new content from arguments (common patterns)
            const oldContent = (args.oldString as string) || (args.old_str as string) || (args.search as string) || ''
            const newContent = (args.newString as string) || (args.new_str as string) || (args.replace as string) || (args.content as string) || ''
            const change: FileChange = {
              path: (args.path as string) || (args.filePath as string),
              type: 'modified',
              oldContent,
              newContent
            }
            active.fileChanges.push(change)
            this.emit('agent:file-change', { sessionId, change })
          } else if (toolName === 'delete_file' || toolName === 'delete') {
            const change: FileChange = {
              path: (args.path as string) || (args.filePath as string),
              type: 'deleted',
              oldContent: ''
            }
            active.fileChanges.push(change)
            this.emit('agent:file-change', { sessionId, change })
          }
        }
        this.emit('agent:tool-result', { sessionId, toolCallId: event.toolCallId, result: event.result })
        break

      case 'text':
        // WHY: SDK sends separate assistant.message events per turn. Without separators,
        // "Let me do that now:" + "Now let me run..." = "now:Now" (missing paragraph break).
        // Add double newline between chunks when needed for proper markdown paragraphs.
        const newContent = event.content || ''
        let separator = ''
        if (active.content && newContent && !active.content.endsWith('\n') && !newContent.startsWith('\n')) {
          separator = '\n\n'
        }
        active.content += separator + newContent
        // Emit with separator so renderer stays in sync
        this.emit('agent:response', { sessionId, content: separator + newContent })
        break
    }
  }

  async matchWorkspace(prompt: string): Promise<WorkspaceMatch> {
    const workspaces = await this.workspaceManager.listWorkspaces()
    
    if (workspaces.length === 0) {
      return { workspace: null, confidence: 0, reason: 'No workspaces available' }
    }

    // Build context for matching
    const workspaceDescriptions = workspaces.map(w => ({
      name: w.name,
      readme: w.readme?.substring(0, 500) || '',
      instructions: w.copilotInstructions?.substring(0, 300) || ''
    }))

    // Use a lightweight LLM call for matching
    try {
      const config = this.configManager.get()
      const matchClient = new CopilotClient({
        model: config.model,
        nodePath: config.nodePath || undefined,
      })
      await matchClient.init()

      const matchPrompt = `Given this user prompt: "${prompt}"

And these available workspaces:
${workspaceDescriptions.map(w => `- ${w.name}: ${w.readme.substring(0, 200)}${w.instructions ? ` (Instructions: ${w.instructions.substring(0, 100)})` : ''}`).join('\n')}

Which workspace (if any) is the user most likely referring to? 
Respond with JSON: { "workspace": "name" | null, "confidence": 0-1, "reason": "brief explanation" }
Only match if confidence > 0.7. Be conservative.`

      let responseText = ''
      for await (const event of matchClient.chat(matchPrompt)) {
        if (event.type === 'text') {
          responseText += event.content || ''
        }
      }

      // Parse JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        const matchedWorkspace = workspaces.find(w => w.name === parsed.workspace)
        return {
          workspace: matchedWorkspace || null,
          confidence: parsed.confidence || 0,
          reason: parsed.reason || ''
        }
      }
    } catch {
      // Fall back to simple matching
    }

    // Simple fallback: keyword matching
    const promptLower = prompt.toLowerCase()
    for (const workspace of workspaces) {
      const nameParts = workspace.name.toLowerCase().split(/[-_]/)
      const matchCount = nameParts.filter(part => promptLower.includes(part)).length
      if (matchCount >= 2 || (nameParts.length === 1 && promptLower.includes(nameParts[0]))) {
        return {
          workspace,
          confidence: 0.8,
          reason: `Matched workspace name "${workspace.name}" in prompt`
        }
      }
    }

    return { workspace: null, confidence: 0, reason: 'No confident match found' }
  }

  private async detectNewProjectIntent(prompt: string): Promise<boolean> {
    const newProjectKeywords = [
      'create a new', 'start a new', 'build a new', 'make a new',
      'initialize', 'scaffold', 'bootstrap', 'set up a new',
      'new project', 'new app', 'new application', 'new repo'
    ]
    const promptLower = prompt.toLowerCase()
    return newProjectKeywords.some(keyword => promptLower.includes(keyword))
  }

  private async generateTitle(sessionId: string): Promise<void> {
    const messages = this.database.getMessages(sessionId)
    const active = this.activeSessions.get(sessionId)
    
    if (messages.length < 2) return

    try {
      const config = this.configManager.get()
      const titleClient = new CopilotClient({
        workingDirectory: active?.session.workspacePath || undefined,
        model: config.model,
        nodePath: config.nodePath || undefined,
      })
      await titleClient.init()

      const conversation = messages.slice(0, 4).map(m => `${m.role}: ${m.content.substring(0, 200)}`).join('\n')
      const titlePrompt = `Generate a short, descriptive title (3-6 words) for this conversation:
${conversation}

Respond with just the title, no quotes or punctuation.`

      let title = ''
      for await (const event of titleClient.chat(titlePrompt)) {
        if (event.type === 'text') {
          title += event.content || ''
        }
      }

      title = title.trim().substring(0, 50)
      if (title) {
        this.database.updateSession(sessionId, { title })
        this.emit('session:title-updated', { sessionId, title })
      }
    } catch {
      // Keep default title
    }
  }

  async regenerateTitle(sessionId: string): Promise<string | null> {
    const messages = this.database.getMessages(sessionId)
    const session = this.database.getSession(sessionId)
    
    if (messages.length === 0) return null

    try {
      const config = this.configManager.get()
      const titleClient = new CopilotClient({
        workingDirectory: session?.workspacePath || undefined,
        model: config.model,
        nodePath: config.nodePath || undefined,
      })
      await titleClient.init()

      // Use more context for regeneration — up to 10 messages
      const conversation = messages.slice(0, 10).map(m => `${m.role}: ${m.content.substring(0, 300)}`).join('\n')
      const titlePrompt = `Generate a short, descriptive title (3-6 words) that captures the main topic of this conversation:
${conversation}

Respond with just the title, no quotes or punctuation.`

      let title = ''
      for await (const event of titleClient.chat(titlePrompt)) {
        if (event.type === 'text') {
          title += event.content || ''
        }
      }

      title = title.trim().substring(0, 50)
      if (title) {
        this.database.updateSession(sessionId, { title })
        this.emit('session:title-updated', { sessionId, title })
        return title
      }
    } catch {
      // Keep existing title
    }
    return null
  }

  private async updateTitleIfNeeded(sessionId: string): Promise<void> {
    const messages = this.database.getMessages(sessionId)
    // Update title every 10 messages
    if (messages.length % 10 === 0) {
      await this.generateTitle(sessionId)
    }
  }

  async abortSession(sessionId: string): Promise<void> {
    const active = this.activeSessions.get(sessionId)
    if (active?.copilotClient) {
      active.aborted = true
      await active.copilotClient.abort()
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const active = this.activeSessions.get(sessionId)
    if (active?.copilotClient) {
      await active.copilotClient.stop()
      active.copilotClient = null
    }
    this.activeSessions.delete(sessionId)
  }

  async stopAll(): Promise<void> {
    for (const sessionId of Array.from(this.activeSessions.keys())) {
      await this.stopSession(sessionId)
    }
  }
}
