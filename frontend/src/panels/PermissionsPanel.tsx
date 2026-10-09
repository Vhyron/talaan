import { useEffect, useState } from 'react'
import { Library, Lock } from 'lucide-react'
import { api } from '../api/client'
import type { Grant, GrantKey, Grants } from '../api/types'
import { useFolder } from '../lib/folderContext'

const ROWS: { key: GrantKey; label: string; help: string }[] = [
  { key: 'read', label: 'Read', help: 'Search and read files in this folder to answer questions.' },
  { key: 'suggest_edits', label: 'Suggest edits', help: 'Propose changes to a file, shown to you as a diff.' },
  { key: 'create_drafts', label: 'Create drafts', help: 'Write new files, such as transcripts or notice outlines.' },
  { key: 'delete', label: 'Delete', help: 'Remove files from this folder.' },
]

const OPTIONS: { value: Grant; label: string; on: string }[] = [
  { value: 'allow', label: 'Allow', on: 'bg-brand text-white' },
  { value: 'needs_approval', label: 'Needs approval', on: 'bg-warn-soft text-warn-text ring-1 ring-amber-300' },
  { value: 'never', label: 'Never', on: 'bg-red-700 text-white' },
]

export default function PermissionsPanel() {
  const { folder, bump } = useFolder()
  const [grants, setGrants] = useState<Grants | null>(null)
  const [saving, setSaving] = useState<keyof Grants | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.grants(folder.id).then(setGrants).catch((e) => setError(e.message))
  }, [folder.id])

  async function change<K extends keyof Grants>(key: K, value: Grants[K]) {
    if (!grants || grants[key] === value) return
    setSaving(key)
    setError(null)
    try {
      setGrants(await api.setGrants(folder.id, { ...grants, [key]: value }))
      bump() // the change is in the audit log
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className="font-bold">What the AI may do here</h2>
      <p className="mt-1 text-xs text-muted">
        Applies to {folder.name} only. Checked by the app on every action, not by the AI.
      </p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <ul className="mt-4 space-y-3">
        {ROWS.map(({ key, label, help }) => {
          const value = grants?.[key]
          return (
            <li key={key} className={`rounded-xl bg-white p-3 ${value === 'never' ? 'ring-1 ring-red-200' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{label}</span>
                {value === 'never' && <Lock size={14} className="text-red-700" aria-label="Never" />}
              </div>
              <p className="mt-0.5 text-xs text-muted">{help}</p>
              <div role="radiogroup" aria-label={label} className="mt-2 grid grid-cols-3 gap-1 rounded-full bg-panel p-1">
                {OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    role="radio"
                    aria-checked={value === o.value}
                    disabled={!grants || saving === key}
                    onClick={() => change(key, o.value)}
                    className={`rounded-full px-2 py-1 text-xs font-semibold transition-colors ${
                      value === o.value ? o.on : 'text-muted hover:bg-white'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 rounded-xl bg-white p-3">
        <label className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-semibold"><Library size={14} /> Include in home chat</span>
          <input
            type="checkbox"
            role="switch"
            checked={grants?.home_chat ?? false}
            disabled={!grants || saving === 'home_chat'}
            onChange={(e) => change('home_chat', e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
        </label>
        <p className="mt-0.5 text-xs text-muted">
          Off: the home page's chat across Spaces can't see {folder.name}. On: it can read it (read only, never changes files),
          and each question that uses it is logged here.
        </p>
      </div>
      <p className="mt-4 text-xs text-muted">There is no “allow everything” option. Every change is recorded in the audit log.</p>
    </div>
  )
}
