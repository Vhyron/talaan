import { useState, type DragEvent, type ReactNode } from 'react'
import { Upload as UploadIcon } from 'lucide-react'
import { fromDataTransfer, type Upload } from '../lib/upload'
import { useFilePicker } from '../lib/useFilePicker'

export function ImportButton({ onFiles, busy }: { onFiles: (uploads: Upload[]) => void; busy: boolean }) {
  const picker = useFilePicker(onFiles)
  return (
    <>
      <button
        onClick={picker.open}
        disabled={busy}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium hover:bg-panel disabled:opacity-50"
      >
        <UploadIcon size={15} /> {busy ? 'Importing…' : 'Import files'}
      </button>
      {picker.element}
    </>
  )
}

/** Drop files or whole folders; folders keep their subfolders. */
export function DropZone({ onFiles, children, className = '' }: { onFiles: (uploads: Upload[]) => void; children: ReactNode; className?: string }) {
  const [over, setOver] = useState(false)
  const has = (e: DragEvent) => e.dataTransfer.types.includes('Files')
  return (
    <div
      className={`relative min-h-0 min-w-0 flex-1 flex-col ${className || 'flex'}`}
      onDragOver={(e) => { if (has(e)) { e.preventDefault(); setOver(true) } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
      onDrop={async (e) => {
        if (!has(e)) return
        e.preventDefault()
        setOver(false)
        onFiles(await fromDataTransfer(e.dataTransfer))
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-xl border-2 border-dashed border-brand bg-brand-soft/80 text-brand-text">
          <p className="flex items-center gap-2 px-4 text-center font-semibold">
            <UploadIcon size={18} className="shrink-0" /> Drop .md, .txt or .pdf files, or a whole folder
          </p>
        </div>
      )}
    </div>
  )
}
