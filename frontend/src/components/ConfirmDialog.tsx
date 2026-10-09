import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * A focused yes/no prompt for actions that remove things (Move to Trash, Delete forever).
 * Centred on wider screens, a bottom sheet on phones. Cancel has focus, so Enter never
 * removes anything by accident; Esc and the backdrop cancel too.
 */
export default function ConfirmDialog({ title, children, confirmLabel, busyLabel, busy, error, onConfirm, onClose }: {
  title: string
  children: ReactNode
  confirmLabel: string
  busyLabel?: string
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy, onClose])

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/30 sm:items-center" onClick={() => !busy && onClose()}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full space-y-4 rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-sm shadow-xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold break-words">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-panel" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-2 text-ink/80">{children}</div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-800">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" autoFocus onClick={onClose} disabled={busy} className="btn-ghost">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="rounded-full bg-red-700 px-5 py-2.5 font-semibold text-white hover:bg-red-800 disabled:opacity-50">
            {busy ? (busyLabel ?? 'Working…') : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
