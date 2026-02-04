import fs from 'fs'
import path from 'path'
import * as jdenticon from 'jdenticon'
import type { Workspace } from './types.js'

export class WorkspaceManager {
  private workspaceFolder: string
  private depth: number

  constructor(workspaceFolder: string, depth: number = 1) {
    this.workspaceFolder = workspaceFolder
    this.depth = depth
  }

  setWorkspaceFolder(folder: string): void {
    this.workspaceFolder = folder
  }

  setDepth(depth: number): void {
    this.depth = depth
  }

  async listWorkspaces(): Promise<Workspace[]> {
    if (!fs.existsSync(this.workspaceFolder)) {
      return []
    }

    const workspaces: Workspace[] = []
    await this.collectWorkspaces(this.workspaceFolder, 1, workspaces)

    // Detect duplicate names and qualify them
    const nameCounts = new Map<string, number>()
    for (const ws of workspaces) {
      nameCounts.set(ws.name, (nameCounts.get(ws.name) || 0) + 1)
    }

    // Set displayName - use qualified name for duplicates
    for (const ws of workspaces) {
      if (nameCounts.get(ws.name)! > 1) {
        // Get relative path from workspace folder and use parent/name format
        const relativePath = path.relative(this.workspaceFolder, ws.path)
        ws.displayName = relativePath.replace(/\\/g, '/')
      } else {
        ws.displayName = ws.name
      }
    }

    return workspaces.sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  private async collectWorkspaces(dir: string, currentDepth: number, workspaces: Workspace[]): Promise<void> {
    if (currentDepth > this.depth) {
      return
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue
      }

      const workspacePath = path.join(dir, entry.name)
      
      if (currentDepth === this.depth) {
        // At target depth, add as workspace
        const workspace = await this.getWorkspaceDetails(entry.name, workspacePath)
        workspaces.push(workspace)
      } else {
        // Not at target depth, recurse into subdirectory
        await this.collectWorkspaces(workspacePath, currentDepth + 1, workspaces)
      }
    }
  }

  async getWorkspace(name: string): Promise<Workspace | null> {
    const workspacePath = path.join(this.workspaceFolder, name)
    if (!fs.existsSync(workspacePath)) {
      return null
    }
    return this.getWorkspaceDetails(name, workspacePath)
  }

  private async getWorkspaceDetails(name: string, workspacePath: string): Promise<Workspace> {
    const logo = await this.findLogo(workspacePath)
    const readme = this.readFile(path.join(workspacePath, 'README.md'))
    const copilotInstructions = this.readFile(path.join(workspacePath, '.github', 'copilot-instructions.md'))

    return {
      name,
      displayName: name, // Will be qualified later if duplicates exist
      path: workspacePath,
      logo: logo || this.generateIdenticon(name),
      readme: readme?.substring(0, 2000), // Limit for matching
      copilotInstructions: copilotInstructions?.substring(0, 1000)
    }
  }

  private async findLogo(workspacePath: string): Promise<string | null> {
    const logoPatterns = ['logo', 'icon', 'brand']
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.webp']

    // Check root and common locations
    const searchDirs = [
      workspacePath,
      path.join(workspacePath, 'assets'),
      path.join(workspacePath, 'images'),
      path.join(workspacePath, 'public'),
      path.join(workspacePath, '.github')
    ]

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue

      try {
        const files = fs.readdirSync(dir)
        for (const file of files) {
          const lowerFile = file.toLowerCase()
          const hasLogoName = logoPatterns.some(p => lowerFile.includes(p))
          const hasImageExt = imageExtensions.some(ext => lowerFile.endsWith(ext))

          if (hasLogoName && hasImageExt) {
            const filePath = path.join(dir, file)
            const data = fs.readFileSync(filePath)
            const ext = path.extname(file).toLowerCase()
            const mimeType = ext === '.svg' ? 'image/svg+xml' : 
                            ext === '.png' ? 'image/png' :
                            ext === '.webp' ? 'image/webp' : 'image/jpeg'
            return `data:${mimeType};base64,${data.toString('base64')}`
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    return null
  }

  private generateIdenticon(name: string): string {
    const svg = jdenticon.toSvg(name, 200)
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  }

  private readFile(filePath: string): string | undefined {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8')
      }
    } catch {
      // Ignore read errors
    }
    return undefined
  }

  createWorkspace(name: string): string {
    const workspacePath = path.join(this.workspaceFolder, name)
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true })
    }
    return workspacePath
  }

  generateRandomName(): string {
    const adjectives = [
      'bold', 'bright', 'calm', 'deft', 'epic', 'fair', 'glad', 'hale', 'keen', 'lite',
      'neat', 'pert', 'sage', 'tidy', 'vast', 'warm', 'agile', 'brisk', 'crisp', 'dapper'
    ]
    const nouns = [
      'arc', 'bay', 'cog', 'dew', 'elm', 'fox', 'gem', 'hut', 'ivy', 'jet',
      'kit', 'lab', 'map', 'net', 'oak', 'pod', 'ray', 'sky', 'tin', 'web'
    ]
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const noun = nouns[Math.floor(Math.random() * nouns.length)]
    const num = Math.floor(Math.random() * 1000)
    return `${adj}-${noun}-${num}`
  }
}
