import { useState } from 'react'
import { AlertTriangle, GanttChart, Loader2, RefreshCw } from 'lucide-react'
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

const shortDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
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
  const noun = folder.mode === 'chart' ? 'chart' : 'case'

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

  const days = data ? groupByDate(data.events) : []

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">Timeline</h2>
          <p className="text-xs text-muted">Dated events from every file in this {noun}, each with its source.</p>
        </div>
        {data && !busy && (
          <button
            onClick={build}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold whitespace-nowrap hover:bg-panel"
            title="Build it again from the current files"
          >
            <RefreshCw size={12} /> Rebuild
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {busy && (
          <div role="status" className="rounded-xl border border-line bg-white p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Loader2 size={15} className="animate-spin text-brand-text" /> Building the timeline… <span className="font-mono text-xs font-normal text-muted">{elapsed}s</span>
            </p>
            <p className="mt-1 text-xs text-muted">Reading every file in this {noun} on this laptop. This can take a minute or two.</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-panel">
              <div className="h-full w-1/3 animate-[timeline-progress_1.4s_ease-in-out_infinite] rounded-full bg-brand" />
            </div>
          </div>
        )}

        {error && !busy && (
          <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-warn-soft p-4 text-warn-text">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle size={15} className="shrink-0" /> Couldn’t build the timeline</p>
            <p className="mt-1 text-xs break-words">{error}</p>
            {data && <p className="mt-1 text-xs font-semibold">The previous timeline is shown below.</p>}
            <button onClick={build} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-panel">
              <RefreshCw size={12} /> Try again
            </button>
          </div>
        )}

        {!data && !busy && !error && (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-line bg-white/60 px-5 py-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand-text">
              <GanttChart size={22} />
            </span>
            <p className="mt-3 font-semibold">No timeline yet</p>
            <p className="mt-1 max-w-xs text-sm text-muted">
              See what happened in order, with a source for every event, and anything that doesn’t line up.
            </p>
            <button onClick={build} className="btn-primary mt-4 inline-flex w-full max-w-xs items-center justify-center gap-1.5 text-sm">
              <GanttChart size={15} /> Build timeline
            </button>
            <p className="mt-2 text-[11px] text-muted">Runs on this laptop · may take a minute or two</p>
          </div>
        )}

        {data && !busy && (
          <>
            <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span><b className="text-ink">{data.events.length}</b> event{data.events.length === 1 ? '' : 's'}</span>
              {data.flags.length > 0 && <span>· <b className="text-warn-text">{data.flags.length}</b> to review</span>}
              {days.length > 0 && <span>· {shortDay(days[0][0])} – {shortDay(days[days.length - 1][0])}</span>}
            </p>

            {data.flags.length > 0 && (
              <section className="mb-4 rounded-xl border border-amber-300 bg-warn-soft p-3" aria-label="Flagged for your review">
                <p className="flex items-center gap-1.5 text-sm font-bold text-warn-text">
                  <AlertTriangle size={15} className="shrink-0" /> Flagged for your review
                </p>
                <p className="mt-0.5 text-[11px] text-warn-text/80">These may not line up. The app doesn’t decide; you do.</p>
                <ul className="mt-2 space-y-2">
                  {data.flags.map((f, i) => (
                    <li key={i} className="rounded-lg bg-white/80 p-2.5 text-sm break-words">
                      {f.description}
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {f.sources.map((s, j) => <SourceChip key={j} source={s} />)}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!data.events.length ? (
              <p className="rounded-xl bg-white p-4 text-sm text-muted">No dated events were found in this {noun}.</p>
            ) : (
              <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-0.5 before:bg-line" aria-label="Events in order">
                {days.map(([date, events]) => (
                  <li key={date} className="relative pl-6">
                    <span className="absolute top-1 left-0 h-3 w-3 rounded-full border-2 border-white bg-brand ring-1 ring-brand/30" aria-hidden="true" />
                    <p className="text-xs font-bold tracking-wide text-brand-text uppercase">{dayLabel(date)}</p>
                    <ul className="mt-1.5 space-y-2">
                      {events.map((e, i) => (
                        <li key={i} className="rounded-lg border border-line/60 bg-white p-2.5 text-sm break-words">
                          <div className="flex items-start gap-2">
                            {e.time && (
                              <span className="mt-px shrink-0 rounded bg-panel px-1.5 font-mono text-[11px] leading-5 text-muted">{e.time}</span>
                            )}
                            <span className="min-w-0">{e.description}</span>
                          </div>
                          {e.sources.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {e.sources.map((s, j) => <SourceChip key={j} source={s} />)}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  )
}
