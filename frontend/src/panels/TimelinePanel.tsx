import { useState } from 'react'
import { AlertTriangle, GanttChart } from 'lucide-react'
import { api } from '../api/client'
import type { TimelineEvent, TimelineResponse } from '../api/types'
import SourceChip from '../components/SourceChip'
import { useElapsed } from '../lib/useElapsed'
import { useFolder } from '../lib/folderContext'

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function groupByDate(events: TimelineEvent[]): [string, TimelineEvent[]][] {
  const sorted = [...events].sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`))
  const groups = new Map<string, TimelineEvent[]>()
  for (const e of sorted) groups.set(e.date, [...(groups.get(e.date) ?? []), e])
  return [...groups]
}

export default function TimelinePanel() {
  const { folder } = useFolder()
  const [data, setData] = useState<TimelineResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const elapsed = useElapsed(busy)

  async function build() {
    setBusy(true)
    setError(null)
    try {
      setData(await api.timeline(folder.id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 p-4 pb-3">
        <div className="mr-auto">
          <h2 className="font-bold">Timeline</h2>
          <p className="text-xs text-muted">Dated events from every file in this {folder.mode}, each with its source.</p>
        </div>
        <button onClick={build} disabled={busy} className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm">
          <GanttChart size={15} /> {data ? 'Rebuild' : 'Build timeline'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {busy && <p className="rounded-xl bg-white px-3 py-2 text-sm text-muted">Reading every file on this laptop… {elapsed}s</p>}
        {error && <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn-text">{error}</p>}
        {!data && !busy && !error && (
          <p className="text-sm text-muted">Build a timeline to see events in order and anything that doesn’t line up.</p>
        )}

        {data && !busy && (
          <>
            {data.flags.length > 0 && (
              <section className="mb-4 rounded-xl border border-amber-300 bg-warn-soft p-3">
                <p className="flex items-center gap-1.5 text-sm font-bold text-warn-text">
                  <AlertTriangle size={15} /> Flagged for your review
                </p>
                <p className="mt-0.5 text-[11px] text-warn-text/80">These may not line up. The app doesn’t decide; you do.</p>
                <ul className="mt-2 space-y-2">
                  {data.flags.map((f, i) => (
                    <li key={i} className="rounded-lg bg-white/70 p-2 text-sm">
                      {f.description}
                      <div className="mt-1 flex flex-wrap gap-y-1">
                        {f.sources.map((s, j) => <SourceChip key={j} source={s} />)}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <ol className="relative ml-2 border-l-2 border-line">
              {groupByDate(data.events).map(([date, events]) => (
                <li key={date} className="mb-4 ml-4">
                  <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand" />
                  <p className="text-xs font-bold tracking-wide text-brand-text uppercase">{dayLabel(date)}</p>
                  <ul className="mt-1 space-y-1.5">
                    {events.map((e, i) => (
                      <li key={i} className="rounded-lg bg-white p-2 text-sm">
                        {e.time && <span className="mr-1.5 font-mono text-xs text-muted">{e.time}</span>}
                        {e.description}
                        <div className="mt-1 flex flex-wrap gap-y-1">
                          {e.sources.map((s, j) => <SourceChip key={j} source={s} />)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  )
}
