import { createElement, useEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api/client'
import { fileLabel, isPdf } from '../lib/format'
import { useFolder } from '../lib/folderContext'

export type Highlight = { start: number; end: number } | null

type Pos = { position?: { start: { line: number }; end: { line: number } } }

// Block elements that carry source line positions; each gets highlighted when
// it overlaps the cited range.
const BLOCKS = ['p', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'tr', 'pre'] as const

function withHighlight(h: Highlight, offset: number): Components {
  const out: Components = {}
  for (const tag of BLOCKS) {
    out[tag] = ({ node, children, ...props }: { node?: Pos; children?: ReactNode } & Record<string, unknown>) => {
      const s = (node?.position?.start.line ?? 0) + offset
      const e = (node?.position?.end.line ?? 0) + offset
      const hit = h && s <= h.end && e >= h.start
      return createElement(tag, { ...props, 'data-line': s, className: hit ? 'source-hit' : undefined }, children)
    }
  }
  return out
}

export default function FileViewer({ path, highlight }: { path: string; highlight: Highlight }) {
  const { folder, version } = useFolder()
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    if (isPdf(path)) return
    setText(null)
    setError(null)
    api.file(folder.id, path).then(setText).catch((e) => setError(e.message))
  }, [folder.id, path, version])

  useEffect(() => {
    if (!highlight || text === null) return
    root.current?.querySelector('.source-hit')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlight, text])

  if (isPdf(path)) {
    return <iframe title={path} src={`/api/folders/${encodeURIComponent(folder.id)}/files/${encodeURIComponent(path)}`} className="h-full w-full" />
  }
  if (error) return <p className="p-6 text-red-700 sm:p-10">{error}</p>
  if (text === null) return <p className="p-6 text-muted sm:p-10">Loading…</p>

  // The first H1 becomes the page title; keep line numbers aligned with the file.
  const lines = text.split('\n')
  const h1 = lines.findIndex((l) => /^#\s+/.test(l))
  const title = h1 >= 0 ? lines[h1].replace(/^#\s+/, '') : fileLabel(path)
  const body = h1 >= 0 ? lines.slice(h1 + 1).join('\n') : text
  const offset = h1 >= 0 ? h1 + 1 : 0
  const date = path.match(/^\d{4}-\d{2}-\d{2}/)?.[0]

  return (
    <article ref={root} className="mx-auto max-w-3xl px-4 py-5 sm:px-10 sm:py-8">
      <p className="text-sm break-words text-muted">{folder.name} / {path}</p>
      <h1 className={`mt-2 text-2xl font-extrabold tracking-tight break-words sm:text-3xl ${highlight && h1 + 1 >= highlight.start && h1 + 1 <= highlight.end ? 'source-hit' : ''}`}>
        {title}
      </h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="chip">#{folder.mode}</span>
        {date && <span className="chip">{date}</span>}
      </div>
      {path.endsWith('.md') ? (
        <div className="prose-talaan mt-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={withHighlight(highlight, offset)}>{body}</ReactMarkdown>
        </div>
      ) : (
        <pre className="mt-6 font-mono text-sm whitespace-pre-wrap">
          {lines.map((l, i) => (
            <div key={i} className={highlight && i + 1 >= highlight.start && i + 1 <= highlight.end ? 'source-hit' : undefined}>{l || ' '}</div>
          ))}
        </pre>
      )}
    </article>
  )
}
