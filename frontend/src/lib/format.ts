/** "2026-09-13_interview_R-Santos.md" -> "2026-09-13 · Interview R Santos" */
export function fileLabel(path: string): string {
  const base = path.split('/').pop()!.replace(/\.(md|txt|pdf)$/i, '')
  const parts = base.replace(/^00_/, '').split('_')
  const date = /^\d{4}-\d{2}-\d{2}$/.test(parts[0]) ? parts.shift() : null
  const rest = parts.map((s) => s.replace(/-/g, ' ')).join(' ')
  const title = rest.charAt(0).toUpperCase() + rest.slice(1)
  return date ? `${date} · ${title}` : title
}

export const isPdf = (path: string) => /\.pdf$/i.test(path)

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
