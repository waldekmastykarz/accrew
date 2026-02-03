declare module '@pierre/diffs' {
  interface DiffFile {
    from: string
    to: string
    chunks: DiffChunk[]
  }

  interface DiffChunk {
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    changes: DiffChange[]
  }

  interface DiffChange {
    type: 'add' | 'delete' | 'normal'
    content: string
    oldLine?: number
    newLine?: number
  }

  export class MultiFileDiff extends HTMLElement {
    files: DiffFile[]
    style: CSSStyleDeclaration
  }
}
