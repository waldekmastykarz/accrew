import { execSync } from 'child_process'

export interface GitFileStatus {
  path: string
  status: 'A' | 'M' | 'D' | '?'
}

export class GitManager {
  /**
   * Check if a path is inside a git repository
   */
  isRepo(path: string): boolean {
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: path,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8'
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get the current branch name
   */
  getBranch(path: string): string | null {
    try {
      const branch = execSync('git branch --show-current', {
        cwd: path,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8'
      }).trim()
      // WHY: Detached HEAD returns empty string — return null for consistent "no branch" state
      return branch || null
    } catch {
      return null
    }
  }

  /**
   * Get list of changed files with their status
   */
  getStatus(path: string): GitFileStatus[] {
    try {
      const output = execSync('git status --porcelain', {
        cwd: path,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8'
      })

      // WHY: Don't use trim() on the full output — it strips leading spaces which are significant
      // in git porcelain format (first column = index status, can be space)
      const lines = output.split('\n').filter(line => line.length > 0)
      if (lines.length === 0) {
        return []
      }

      return lines.map(line => {
        // WHY: Git status --porcelain format is "XY PATH" — X=index, Y=worktree, then space, then path
        const indexStatus = line[0]
        const worktreeStatus = line[1]
        const filePath = line.slice(3) // Skip "XY " (positions 0, 1, 2)

        // Determine effective status (prefer worktree, fall back to index)
        let status: GitFileStatus['status']
        if (worktreeStatus === 'M' || indexStatus === 'M') {
          status = 'M'
        } else if (worktreeStatus === 'D' || indexStatus === 'D') {
          status = 'D'
        } else if (worktreeStatus === '?' || indexStatus === '?') {
          status = '?'
        } else if (indexStatus === 'A') {
          status = 'A'
        } else {
          status = 'M' // Default to modified for any other status
        }

        return { path: filePath, status }
      })
    } catch {
      return []
    }
  }

  /**
   * Get diff for a specific file
   * Returns raw diff string for use with PatchDiff component
   */
  getDiff(repoPath: string, filePath: string): string | null {
    // WHY: Check status first to handle untracked files — git diff HEAD fails for untracked files
    const status = this.getStatus(repoPath)
    const fileStatus = status.find(f => f.path === filePath)
    
    if (fileStatus?.status === '?') {
      // Untracked file: generate diff showing full content as added
      return this.generateUntrackedDiff(repoPath, filePath)
    }

    try {
      // WHY: Use HEAD to compare against last commit, not staged changes
      // This shows the complete diff of what changed since last commit
      const diff = execSync(`git diff HEAD -- "${filePath}"`, {
        cwd: repoPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large diffs
      })

      if (diff.trim()) {
        return diff
      }

      // WHY: git diff HEAD returns empty for staged-only new files (status A with no
      // working tree changes). Fall back to --cached which compares index to HEAD.
      return this.getCachedDiff(repoPath, filePath)
    } catch {
      // WHY: git diff HEAD fails when HEAD doesn't exist (first commit in repo).
      // Try --cached (compares index to empty tree), then fall back to reading
      // the file directly for untracked files.
      return this.getCachedDiff(repoPath, filePath)
        ?? this.generateUntrackedDiff(repoPath, filePath)
    }
  }

  /**
   * Get cached (staged) diff for a specific file
   */
  private getCachedDiff(repoPath: string, filePath: string): string | null {
    try {
      const diff = execSync(`git diff --cached -- "${filePath}"`, {
        cwd: repoPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
      })
      return diff.trim() ? diff : null
    } catch {
      return null
    }
  }

  /**
   * Generate a diff-like output for untracked files
   */
  private generateUntrackedDiff(repoPath: string, filePath: string): string | null {
    try {
      const content = execSync(`cat "${filePath}"`, {
        cwd: repoPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
      })

      const lines = content.split('\n')
      const addedLines = lines.map((line, i) => `+${line}`).join('\n')
      
      return `diff --git a/${filePath} b/${filePath}
new file mode 100644
--- /dev/null
+++ b/${filePath}
@@ -0,0 +1,${lines.length} @@
${addedLines}`
    } catch {
      return null
    }
  }
}
