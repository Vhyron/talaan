import type { Source } from '../api/types'
import { fileLabel } from '../lib/format'
import { useFolder } from '../lib/folderContext'

/** A clickable citation. Opens the file and highlights the cited lines. */
export default function SourceChip({ source, n }: { source: Source; n?: number }) {
  const { openSource } = useFolder()
  return (
    <button
      onClick={() => openSource(source.path, source.start, source.end)}
      title={`${source.path}, lines ${source.start}–${source.end}\n${source.snippet}`}
      className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 align-baseline text-xs font-semibold text-brand-text hover:bg-brand hover:text-white"
    >
      {n !== undefined && <span>{n}</span>}
      <span className="truncate">{fileLabel(source.path)}</span>
    </button>
  )
}
