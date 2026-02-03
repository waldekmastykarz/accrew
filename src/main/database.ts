import BetterSqlite3 from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import type { Session, Message, FileChange, ToolCall } from './types.js'

export class Database {
  private db!: BetterSqlite3.Database

  async init() {
    const dbPath = path.join(app.getPath('userData'), 'accrew.db')
    this.db = new BetterSqlite3(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.createTables()
  }

  private createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        workspace TEXT,
        workspace_path TEXT,
        logo TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        has_unread INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        thinking TEXT,
        tool_calls TEXT,
        file_changes TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS file_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        old_content TEXT,
        new_content TEXT,
        change_type TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_file_snapshots_session ON file_snapshots(session_id);
      CREATE INDEX IF NOT EXISTS idx_file_snapshots_message ON file_snapshots(message_id);
    `)
  }

  // Session operations
  createSession(session: Session): Session {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, title, workspace, workspace_path, logo, created_at, updated_at, has_unread, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      session.id,
      session.title,
      session.workspace,
      session.workspacePath,
      session.logo,
      session.createdAt,
      session.updatedAt,
      session.hasUnread ? 1 : 0,
      session.status
    )
    return session
  }

  getSession(id: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?')
    const row = stmt.get(id) as SessionRow | undefined
    return row ? this.rowToSession(row) : null
  }

  getSessions(): Session[] {
    const stmt = this.db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC')
    const rows = stmt.all() as SessionRow[]
    return rows.map(row => this.rowToSession(row))
  }

  updateSession(id: string, updates: Partial<Session>): void {
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      values.push(updates.title)
    }
    if (updates.hasUnread !== undefined) {
      fields.push('has_unread = ?')
      values.push(updates.hasUnread ? 1 : 0)
    }
    if (updates.status !== undefined) {
      fields.push('status = ?')
      values.push(updates.status)
    }
    if (updates.logo !== undefined) {
      fields.push('logo = ?')
      values.push(updates.logo)
    }

    fields.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(...values)
  }

  deleteSession(id: string): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?')
    stmt.run(id)
  }

  markSessionRead(id: string): void {
    const stmt = this.db.prepare('UPDATE sessions SET has_unread = 0 WHERE id = ?')
    stmt.run(id)
  }

  // Message operations
  addMessage(message: Message): Message {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, thinking, tool_calls, file_changes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      message.id,
      message.sessionId,
      message.role,
      message.content,
      message.thinking || null,
      message.toolCalls ? JSON.stringify(message.toolCalls) : null,
      message.fileChanges ? JSON.stringify(message.fileChanges) : null,
      message.createdAt
    )
    return message
  }

  updateMessage(id: string, updates: Partial<Message>): void {
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.content !== undefined) {
      fields.push('content = ?')
      values.push(updates.content)
    }
    if (updates.thinking !== undefined) {
      fields.push('thinking = ?')
      values.push(updates.thinking)
    }
    if (updates.toolCalls !== undefined) {
      fields.push('tool_calls = ?')
      values.push(JSON.stringify(updates.toolCalls))
    }
    if (updates.fileChanges !== undefined) {
      fields.push('file_changes = ?')
      values.push(JSON.stringify(updates.fileChanges))
    }

    values.push(id)
    const stmt = this.db.prepare(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(...values)
  }

  getMessages(sessionId: string): Message[] {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
    const rows = stmt.all(sessionId) as MessageRow[]
    return rows.map(row => this.rowToMessage(row))
  }

  // File snapshot operations
  saveFileSnapshot(sessionId: string, messageId: string, change: FileChange): void {
    const stmt = this.db.prepare(`
      INSERT INTO file_snapshots (session_id, message_id, file_path, old_content, new_content, change_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(sessionId, messageId, change.path, change.oldContent || null, change.newContent || null, change.type)
  }

  getFileDiff(sessionId: string, messageId: string, filePath: string): { oldContent: string; newContent: string } | null {
    const stmt = this.db.prepare(`
      SELECT old_content, new_content FROM file_snapshots 
      WHERE session_id = ? AND message_id = ? AND file_path = ?
    `)
    const row = stmt.get(sessionId, messageId, filePath) as { old_content: string | null; new_content: string | null } | undefined
    if (!row) return null
    return {
      oldContent: row.old_content || '',
      newContent: row.new_content || ''
    }
  }

  // Archive operations
  archiveOldSessions(daysOld: number): number {
    const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000)
    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET status = 'archived', updated_at = ? 
      WHERE status IN ('active', 'completed') AND updated_at < ?
    `)
    const result = stmt.run(Date.now(), cutoff)
    return result.changes
  }

  deleteArchivedSessions(daysOld: number): number {
    const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000)
    const stmt = this.db.prepare(`
      DELETE FROM sessions 
      WHERE status = 'archived' AND updated_at < ?
    `)
    const result = stmt.run(cutoff)
    return result.changes
  }

  archiveSession(id: string): void {
    const stmt = this.db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?')
    stmt.run('archived', Date.now(), id)
  }

  unarchiveSession(id: string): void {
    const stmt = this.db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?')
    stmt.run('active', Date.now(), id)
  }

  close(): void {
    this.db.close()
  }

  private rowToSession(row: SessionRow): Session {
    return {
      id: row.id,
      title: row.title,
      workspace: row.workspace,
      workspacePath: row.workspace_path,
      logo: row.logo,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      hasUnread: row.has_unread === 1,
      status: row.status as Session['status']
    }
  }

  private rowToMessage(row: MessageRow): Message {
    return {
      id: row.id,
      sessionId: row.session_id,
      role: row.role as Message['role'],
      content: row.content,
      thinking: row.thinking || undefined,
      toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
      fileChanges: row.file_changes ? JSON.parse(row.file_changes) : undefined,
      createdAt: row.created_at
    }
  }
}

interface SessionRow {
  id: string
  title: string
  workspace: string | null
  workspace_path: string | null
  logo: string | null
  created_at: number
  updated_at: number
  has_unread: number
  status: string
}

interface MessageRow {
  id: string
  session_id: string
  role: string
  content: string
  thinking: string | null
  tool_calls: string | null
  file_changes: string | null
  created_at: number
}
