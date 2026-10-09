/** "2026-09-13_interview_R-Santos.md" -> "2026-09-13 · Interview R Santos" */
export function fileLabel(path: string): string {
  const base = path.split('/').pop()!.replace(/\.(md|txt|pdf)$/i, '')
  const parts = base.replace(/^00_/, '').split('_')
  const di = parts.findIndex((p) => /^\d{4}-\d{2}-\d{2}$/.test(p))
  const date = di >= 0 ? parts.splice(di, 1)[0] : null
  const rest = parts.map((s) => s.replace(/-/g, ' ')).join(' ')
  const title = rest.charAt(0).toUpperCase() + rest.slice(1)
  return date ? `${date} · ${title}` : title
}

export const isPdf = (path: string) => /\.pdf$/i.test(path)

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date. */
export function ago(iso: string, now = Date.now()): string {
  const min = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7) return d === 1 ? 'yesterday' : `${d} days ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}
