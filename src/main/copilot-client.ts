import { CopilotClient as SDKCopilotClient, CopilotSession, type SessionEvent } from '@github/copilot-sdk'
import { app } from 'electron'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
}

// WHY: The SDK spawns .js CLI paths via process.execPath (= Electron binary in
// packaged apps), which opens a new window instead of running the CLI. Using the
// native platform binary (copilot-darwin-arm64/copilot) avoids this entirely
// because the SDK spawns it directly — no process.execPath, no Commander.js
// electron detection, no "too many arguments" errors. The .js fallback +
// ELECTRON_RUN_AS_NODE is kept for platforms where the native binary isn't available.
const platformPkg = `copilot-${process.platform}-${process.arch}`

function resolveCopilotCliPath(): string {
  const nativeBin = path.join('@github', platformPkg, `copilot${process.platform === 'win32' ? '.exe' : ''}`)
  // WHY: electron-builder nests optional deps under the parent package's
  // node_modules, so the native binary may be at @github/copilot/node_modules/
  // instead of the top-level @github/ in packaged builds.
  const nestedNativeBin = path.join('@github', 'copilot', 'node_modules', nativeBin)
  const jsFallback = path.join('@github', 'copilot', 'index.js')

  // 1. ASAR-unpacked paths (packaged builds)
  const appPath = app.getAppPath()
  const unpackedBase = appPath + '.unpacked'
  for (const bin of [nativeBin, nestedNativeBin]) {
    const candidate = path.join(unpackedBase, 'node_modules', bin)
    if (existsSync(candidate)) return candidate
  }
  const unpackedJs = path.join(unpackedBase, 'node_modules', jsFallback)
  if (existsSync(unpackedJs)) return unpackedJs

  // 2. Walk up from __dirname (dev mode)
  let dir = __dirname
  for (let i = 0; i < 10; i++) {
    for (const bin of [nativeBin, nestedNativeBin]) {
      const candidate = path.join(dir, 'node_modules', bin)
      if (existsSync(candidate)) return candidate
    }
    const candidateJs = path.join(dir, 'node_modules', jsFallback)
    if (existsSync(candidateJs)) return candidateJs
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return ''
}

// WHY: When the resolved CLI path is a .js file (native binary not found),
// the SDK spawns it via process.execPath which is the Electron binary.
// ELECTRON_RUN_AS_NODE=1 makes that spawned process act as Node.js instead
// of opening a new Electron window. Not needed for native binaries since
// they're spawned directly without process.execPath.
export function getCopilotCliOptions(): { cliPath?: string; env?: NodeJS.ProcessEnv } {
  const cliPath = resolveCopilotCliPath()
  if (!cliPath) return {}

  const opts: { cliPath: string; env?: NodeJS.ProcessEnv } = { cliPath }
  if (cliPath.endsWith('.js')) {
    opts.env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  }
  console.log(`[CopilotClient] Resolved CLI: ${cliPath} (native=${!cliPath.endsWith('.js')})`)
  return opts
}

export class CopilotClient {
  private client: SDKCopilotClient | null = null
  private session: CopilotSession | null = null
  private options: CopilotClientOptions

  constructor(options: CopilotClientOptions = {}) {
    this.options = options
  }

  async init(): Promise<void> {
    const cliOpts = getCopilotCliOptions()
    this.client = new SDKCopilotClient({
      cwd: this.options.workingDirectory,
      ...cliOpts,
    })
    
    // WHY: SDK's createSession → start() → verifyProtocolVersion() has no timeout.
    // If the CLI binary can't respond (e.g., blocked by macOS Keychain prompt when
    // signed with a different identity), the await hangs forever with no error.
    // 30s timeout ensures the error surfaces to the user instead of infinite spin.
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(
        'Copilot CLI failed to start within 30 seconds. ' +
        'This may happen if GitHub Copilot authentication is missing or blocked. ' +
        'Try running "copilot auth login" in your terminal.'
      )), 30_000)
    })
    
    this.session = await Promise.race([
      this.client.createSession({
        model: this.options.model || 'claude-opus-4-5',
      }),
      timeout
    ])
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
