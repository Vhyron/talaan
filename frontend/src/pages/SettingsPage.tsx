import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, Cpu, HardDrive, Loader2, MemoryStick, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import type { AppSettings, LlmCall, ModelOption, SystemTier } from '../api/types'
import { useElapsed } from '../lib/useElapsed'

/** Hardware class each model is sized for (not a plan: everything runs locally and free). */
const TIER_NAME = { light: 'Budget', standard: 'Mid', pro: 'High' } as const
const POLL_MS = 2000

export default function SettingsPage({ onModelChanged }: { onModelChanged: () => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-10 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <BackLink />
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-1 text-muted">Models run on this laptop through Ollama. Nothing is sent online.</p>
        <ModelSection onModelChanged={onModelChanged} />
        <ActivitySection />
      </div>
    </div>
  )
}

/** Back to where Settings was opened from; home if it was opened directly. */
function BackLink() {
  const navigate = useNavigate()
  const location = useLocation()
  // React Router's first history entry has key "default": nothing in-app to go back to.
  const canGoBack = location.key !== 'default'
  return (
    <button
      onClick={() => (canGoBack ? navigate(-1) : navigate('/'))}
      className="inline-flex items-center gap-1 text-sm font-semibold text-brand-text hover:underline"
    >
      <ArrowLeft size={14} /> Back
    </button>
  )
}

// --- Device and chat model ---------------------------------------------------

function ModelSection({ onModelChanged }: { onModelChanged: () => void }) {
  const [tier, setTier] = useState<SystemTier | null>(null)
  const [switching, setSwitching] = useState<string | null>(null) // tag, or 'auto'
  const [error, setError] = useState<string | null>(null)
  const elapsed = useElapsed(switching !== null)

  useEffect(() => {
    api.systemTier().then(setTier).catch((e) => setError(e.message))
  }, [])

  async function choose(tag: string | null) {
    setSwitching(tag ?? 'auto')
    setError(null)
    try {
      setTier(await api.chooseModel(tag))
      onModelChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSwitching(null)
    }
  }

  if (!tier) return <Section title="This device">{error ? <ErrorLine text={error} /> : <p className="text-sm text-muted">Detecting…</p>}</Section>

  const recommended = tier.tiers.find((t) => t.id === tier.recommended)!
  return (
    <>
      <Section title="This device">
        <div className="flex flex-wrap gap-2">
          <Stat icon={<MemoryStick size={14} />} label={`${tier.ram_gb} GB RAM`} />
          <Stat icon={<Cpu size={14} />} label={tier.gpu ?? 'No GPU detected'} />
          <Stat icon={<HardDrive size={14} />} label={`${tier.free_disk_gb} GB free`} />
        </div>
        {!tier.ollama_running && (
          <ErrorLine text="Ollama is not running. Open the Ollama app or run `ollama serve`." />
        )}
        {tier.ollama_running && !tier.embed_installed && (
          <ErrorLine text={`Embedding model missing. Run \`ollama pull ${recommended.embed_model}\`.`} />
        )}
      </Section>

      <Section
        title="Chat model"
        help={`Embeddings always use ${recommended.embed_model} for every model, so switching the chat model never needs re-indexing.`}
      >
        {tier.active_source === 'env' && (
          <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-text">
            Locked by the <code className="font-mono">CHAT_MODEL</code> environment variable. Unset it to switch here.
          </p>
        )}
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          <ModelRow
            title={`Automatic (${tier.auto_chat_model ?? recommended.chat_model})`}
            detail="Best installed model below that fits in this device's RAM alongside the embedding model, OS and browser"
            active={tier.active_source === 'auto'}
            busy={switching === 'auto'}
            disabled={switching !== null || tier.active_source === 'env'}
            onUse={() => choose(null)}
          />
          {tier.models.map((m) => (
            <ModelRow
              key={m.tag}
              title={m.tag}
              detail={modelDetail(m, tier.tiers.find((t) => t.id === m.tier)?.min_ram_gb)}
              tierLabel={TIER_NAME[m.tier]}
              warn={m.installed && !m.fits}
              active={tier.active_source !== 'auto' && m.active}
              busy={switching === m.tag}
              disabled={!m.installed || switching !== null || tier.active_source === 'env'}
              onUse={() => choose(m.tag)}
            />
          ))}
        </ul>
        <p className="mt-2 font-mono text-xs text-muted">
          Running now: {tier.active_chat_model ?? 'none'}
          {switching && ` · loading model… ${elapsed}s (first load can take ~20s)`}
        </p>
        {error && <ErrorLine text={error} />}
      </Section>
    </>
  )
}

/** `needGb`: RAM for this model + the embedding model + the OS, browser and backend, all at once. */
function modelDetail(m: ModelOption, needGb?: number): string {
  const need = needGb ? ` · needs ${needGb} GB RAM with everything running` : ''
  if (!m.installed) return `Not installed · ollama pull ${m.tag}${need}`
  if (!m.fits) return `Installed${need}, may be slow here`
  return `Installed${need}`
}

function ModelRow({ title, detail, tierLabel, warn, active, busy, disabled, onUse }: {
  title: string
  detail: string
  tierLabel?: string
  warn?: boolean
  active: boolean
  busy: boolean
  disabled: boolean
  onUse: () => void
}) {
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${active ? 'bg-brand-soft/60' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-mono text-sm font-semibold">
          {title}
          {tierLabel && <span className="rounded bg-panel px-1.5 py-0.5 font-sans text-[11px] font-semibold uppercase text-muted">{tierLabel}</span>}
        </p>
        <p className={`mt-0.5 inline-flex items-center gap-1 text-xs ${warn ? 'text-warn-text' : 'text-muted'}`}>
          {warn && <AlertTriangle size={12} />} {detail}
        </p>
      </div>
      {active ? (
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-text"><Check size={15} /> In use</span>
      ) : (
        <button className="btn-ghost px-4 py-1.5 text-sm" disabled={disabled} onClick={onUse}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : 'Use'}
        </button>
      )}
    </li>
  )
}

// --- LLM activity log --------------------------------------------------------

function ActivitySection() {
  const [calls, setCalls] = useState<LlmCall[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastId = useRef(0)

  const poll = useCallback(() => {
    api.llmLog(lastId.current)
      .then((fresh) => {
        setError(null)
        if (!fresh.length) return
        lastId.current = Math.max(lastId.current, ...fresh.map((c) => c.id))
        // Merge by id: two polls can overlap (first load) and must not show a call twice. Newest first.
        setCalls((prev) => {
          const byId = new Map(prev.map((c) => [c.id, c]))
          for (const c of fresh) byId.set(c.id, c)
          return [...byId.values()]
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id - a.id)
            .slice(0, 200)
        })
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    api.settings().then(setSettings).catch(() => {})
    poll()
    const t = setInterval(poll, POLL_MS)
    return () => clearInterval(t)
  }, [poll])

  async function toggleRecord() {
    if (!settings) return
    const next = await api.setSettings({ log_prompts: !settings.log_prompts })
    setSettings(next)
    if (!next.log_prompts) setCalls((prev) => prev.map((c) => ({ ...c, prompt: null, response: null })))
  }

  async function clear() {
    await api.clearLlmLog()
    setCalls([])
  }

  return (
    <Section
      title="LLM activity"
      help="Every model call this session: tokens, speed and timing. Kept in memory only and cleared when the backend restarts."
      action={
        <button className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink" onClick={clear}>
          <Trash2 size={13} /> Clear
        </button>
      }
    >
      <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
        <input type="checkbox" className="mt-1 accent-brand" checked={settings?.log_prompts ?? false} onChange={toggleRecord} disabled={!settings} />
        <span>
          <span className="text-sm font-semibold">Record prompt and response text</span>
          <span className="block text-xs text-muted">
            For debugging. Prompts contain client files, so text is held in memory only, never written to disk. Turning this off forgets it.
          </span>
        </span>
      </label>

      {error && <ErrorLine text={error} />}
      {calls.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
          No model calls yet. Ask a question or switch models to see activity here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-xs">
            <thead className="bg-panel text-muted">
              <tr>
                <th className="w-6 px-2 py-2" />
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">Call</th>
                <th className="px-2 py-2">Model</th>
                <th className="px-2 py-2 text-right">Tokens in → out</th>
                <th className="px-2 py-2 text-right">Speed</th>
                <th className="px-2 py-2 text-right">Load</th>
                <th className="px-2 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {calls.map((c) => (
                <CallRow key={c.id} call={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

function CallRow({ call: c, open, onToggle }: { call: LlmCall; open: boolean; onToggle: () => void }) {
  const flagged = !c.ok || c.warning
  return (
    <>
      <tr className={`cursor-pointer border-t border-line hover:bg-panel/60 ${!c.ok ? 'bg-red-50' : c.warning ? 'bg-warn-soft/50' : ''}`} onClick={onToggle}>
        <td className="px-2 py-1.5 text-muted">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</td>
        <td className="px-2 py-1.5 text-muted">{new Date(c.timestamp).toLocaleTimeString()}</td>
        <td className="px-2 py-1.5">
          {c.kind}
          {c.json_valid !== null && <span className={c.json_valid ? 'text-brand-text' : 'text-red-700'}> · json {c.json_valid ? 'ok' : 'bad'}</span>}
          {flagged && <AlertTriangle size={12} className={`ml-1 inline ${!c.ok ? 'text-red-700' : 'text-warn-text'}`} />}
        </td>
        <td className="px-2 py-1.5">{c.model}</td>
        <td className="px-2 py-1.5 text-right">
          {c.kind === 'embed' ? `${c.inputs ?? '?'} texts` : c.prompt_tokens != null ? `${c.prompt_tokens.toLocaleString()} → ${c.output_tokens ?? 0}` : '—'}
        </td>
        <td className="px-2 py-1.5 text-right">{c.tokens_per_s ? `${c.tokens_per_s} tok/s` : '—'}</td>
        <td className="px-2 py-1.5 text-right">{c.load_s && c.load_s >= 0.1 ? `${c.load_s}s` : '—'}</td>
        <td className="px-2 py-1.5 text-right">{c.total_s}s</td>
      </tr>
      {open && (
        <tr className="border-t border-line bg-panel/40">
          <td />
          <td colSpan={7} className="space-y-2 px-2 py-3 font-sans">
            {c.error && <p className="text-red-700">{c.error}</p>}
            {c.warning && <p className="text-warn-text">{c.warning}</p>}
            <p className="text-muted">
              {c.num_ctx != null && <>Context window {c.num_ctx.toLocaleString()} tokens</>}
              {c.think != null && <> · thinking {c.think ? 'on' : 'off'}</>}
            </p>
            {c.prompt || c.response ? (
              <>
                {c.prompt && <Block label="Prompt" text={c.prompt} />}
                {c.response && <Block label="Response" text={c.response} />}
              </>
            ) : (
              (c.kind === 'chat') && <p className="text-muted">Prompt text not recorded. Turn on “Record prompt and response text” above.</p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// --- Bits --------------------------------------------------------------------

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="eyebrow mb-1">{label}</p>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-white p-3 font-mono text-[12px] leading-5">{text}</pre>
    </div>
  )
}

function Section({ title, help, action, children }: { title: string; help?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-lg font-bold">{title}</h2>
          {help && <p className="text-sm text-muted">{help}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Stat({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <span className="chip gap-1.5 text-muted">{icon} {label}</span>
}

function ErrorLine({ text }: { text: string }) {
  return <p className="mt-3 text-sm text-red-700">{text}</p>
}
