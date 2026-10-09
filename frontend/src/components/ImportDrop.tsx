import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Upload } from 'lucide-react'
import { ACCEPT } from '../lib/useImport'

export function ImportButton({ onFiles, busy }: { onFiles: (f: FileList) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium hover:bg-panel disabled:opacity-50"
      >
        <Upload size={15} /> {busy ? 'Importing…' : 'Import files'}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT.join(',')}
        className="hidden"
        onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = '' }}
      />
    </>
  )
}

export function DropZone({ onFiles, children }: { onFiles: (f: FileList) => void; children: ReactNode }) {
  const [over, setOver] = useState(false)
  const has = (e: DragEvent) => e.dataTransfer.types.includes('Files')
  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
      onDragOver={(e) => { if (has(e)) { e.preventDefault(); setOver(true) } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
      onDrop={(e) => { if (has(e)) { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files) } }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-xl border-2 border-dashed border-brand bg-brand-soft/80 text-brand-text">
          <p className="flex items-center gap-2 font-semibold"><Upload size={18} /> Drop .md, .txt or .pdf to add to this folder</p>
        </div>
      )}
    </div>
  )
}
