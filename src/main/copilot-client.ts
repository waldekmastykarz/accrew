import { CopilotClient as SDKCopilotClient, CopilotSession, type SessionEvent } from '@github/copilot-sdk'

export interface StreamEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'text'
  content?: string
  id?: string
  name?: string
  arguments?: Record<string, unknown>
  toolCallId?: string
  result?: unknown
  oldContent?: string
  newContent?: string
}

export interface CopilotClientOptions {
  workingDirectory?: string
  model?: string
  nodePath?: string
}

export class CopilotClient {
  private client: SDKCopilotClient | null = null
  private session: CopilotSession | null = null
  private options: CopilotClientOptions

  constructor(options: CopilotClientOptions = {}) {
    this.options = options
  }

  async init(): Promise<void> {
    // WHY: SDK's bundled CLI is a .js file, so it spawns via
    // spawn(process.execPath, [cliPath, ...args]). In Electron, process.execPath
    // is the app binary, which opens a new window instead of running the CLI.
    // Temporarily override to real Node.js so the SDK spawns correctly.
    const savedExecPath = process.execPath
    if (this.options.nodePath) {
      process.execPath = this.options.nodePath
    }

    this.client = new SDKCopilotClient({
      cwd: this.options.workingDirectory,
    })
    
    this.session = await this.client.createSession({
      model: this.options.model || 'claude-opus-4-5',
    })

    // Restore original execPath after SDK has spawned the CLI process
    process.execPath = savedExecPath
  }

  async *chat(message: string): AsyncGenerator<StreamEvent> {
    if (!this.session) {
      throw new Error('CopilotClient not initialized')
    }

    const events: StreamEvent[] = []
    let resolve: (() => void) | null = null
    let done = false

    const unsubscribe = this.session.on((event: SessionEvent) => {
      const normalized = this.normalizeEvent(event)
      if (normalized) {
        events.push(normalized)
        resolve?.()
      }
      
      if (event.type === 'session.idle') {
        done = true
        resolve?.()
      }
    })

    // Send message (non-blocking)
    this.session.send({ prompt: message })

    try {
      while (!done) {
        if (events.length > 0) {
          yield events.shift()!
        } else {
          await new Promise<void>(r => { resolve = r })
        }
      }
      
      // Yield remaining events
      while (events.length > 0) {
        yield events.shift()!
      }
    } finally {
      unsubscribe()
    }
  }

  async stop(): Promise<void> {
    if (this.session) {
      await this.session.destroy()
      this.session = null
    }
    if (this.client) {
      await this.client.stop()
      this.client = null
    }
  }

  async abort(): Promise<void> {
    if (this.session) {
      await this.session.abort()
    }
  }

  private normalizeEvent(event: SessionEvent): StreamEvent | null {
    // Thinking/reasoning
    if (event.type === 'assistant.reasoning_delta') {
      return { type: 'thinking', content: event.data.deltaContent }
    }
    if (event.type === 'assistant.reasoning') {
      return { type: 'thinking', content: event.data.content }
    }

    // Text streaming - handle both deltas and final message
    if (event.type === 'assistant.message_delta') {
      return { type: 'text', content: event.data.deltaContent }
    }
    if (event.type === 'assistant.message') {
      // Final message - emit if there's content (SDK may only send final, not deltas)
      if (event.data.content) {
        return { type: 'text', content: event.data.content }
      }
      return null
    }

    // Tool execution
    if (event.type === 'tool.execution_start') {
      return {
        type: 'tool_call',
        id: event.data.toolCallId,
        name: event.data.toolName,
        arguments: event.data.arguments as Record<string, unknown> | undefined
      }
    }
    if (event.type === 'tool.execution_complete') {
      return {
        type: 'tool_result',
        toolCallId: event.data.toolCallId,
        result: event.data.result?.content,
      }
    }

    return null
  }
}
