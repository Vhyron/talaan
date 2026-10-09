import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Ban, Check, Copy, Download, Laptop, Loader2, Mic, RefreshCw, RotateCcw, Square, Upload, Users, X } from 'lucide-react'
import { api } from '../api/client'
import type { Outcome, VoiceStatus } from '../api/types'
import { useFolder } from '../lib/folderContext'
import { useElapsed } from '../lib/useElapsed'

type State =
  | { step: 'idle'; note?: string }
  | { step: 'recording' }
  | { step: 'ready'; audio: Blob; name: string; url: string; seconds?: number }
  | { step: 'sending'; name: string; long: boolean }
  | { step: 'done'; outcome: Outcome }
  | { step: 'error'; message: string }

const AUDIO_ACCEPT = '.webm,.wav,.m4a,.mp3,.ogg,audio/*'

/** File extension the backend accepts, from the recorder's MIME type. */
function extFor(mime: string): string {
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  return 'webm'
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** What to record: the microphone, the laptop's own audio (a meeting tab or the screen), or both mixed. */
type Source = 'mic' | 'laptop' | 'both'
const SOURCES: { id: Source; label: string; icon: typeof Mic }[] = [
  { id: 'mic', label: 'Microphone', icon: Mic },
  { id: 'laptop', label: 'Laptop audio', icon: Laptop },
  { id: 'both', label: 'Both', icon: Users },
]
const SOURCE_KEY = 'talaan.voiceSource'
const canShareScreen = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia
/** Browsers only hand over another app's sound through screen sharing, and only Chromium
 * browsers (Chrome, Edge, Dia, Arc…) include audio. Safari and Firefox share video only. */
const canShareAudio = () => {
  if (!canShareScreen()) return false
  const supported = navigator.mediaDevices.getSupportedConstraints() as MediaTrackSupportedConstraints & { suppressLocalAudioPlayback?: boolean }
  return !!supported.suppressLocalAudioPlayback
}

function savedSource(): Source {
  try {
    const v = localStorage.getItem(SOURCE_KEY)
    if ((v === 'laptop' || v === 'both') && canShareAudio()) return v
  } catch {
    // storage blocked: use the default
  }
  return 'mic'
}

/** Why no audio came with the share, from what the user picked in the share window. */
function noAudioMessage(surface: string | undefined): string {
  if (surface === 'window') {
    return 'A single window can’t share its sound. Try again and pick the browser tab the meeting is in, with “Share tab audio” on.'
  }
  if (surface === 'monitor') {
    return 'This browser didn’t share the screen’s sound (on a Mac it usually can’t). Try again and pick the browser tab the meeting is in, with “Share tab audio” on.'
  }
  return 'No sound was shared. Try again and keep “Share tab audio” switched on in the share window.'
}

/** Open the chosen source as one audio stream. `shared` is the laptop-audio track (it ends when the user stops sharing). */
async function openSource(source: Source): Promise<{ stream: MediaStream; shared?: MediaStreamTrack; release: () => void }> {
  const opened: MediaStream[] = []
  const stopAll = () => opened.forEach((s) => s.getTracks().forEach((t) => t.stop()))
  try {
    let laptop: MediaStream | undefined
    let mic: MediaStream | undefined
    // Screen share first: the browser only allows it straight after the click.
    if (source !== 'mic') {
      try {
        // Browsers only share another app's sound through the screen-share window, and it
        // needs video too; only the audio is recorded. Open it on the Tabs list (tab audio
        // works on every OS) and hide Talaan's own tab.
        laptop = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'browser' },
          audio: { suppressLocalAudioPlayback: false },
          preferCurrentTab: false,
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'include',
          systemAudio: 'include',
        } as DisplayMediaStreamOptions)
      } catch {
        throw new Error('Sharing was cancelled or blocked, so there’s no laptop audio to record.')
      }
      opened.push(laptop)
      if (!laptop.getAudioTracks().length) throw new Error(noAudioMessage(laptop.getVideoTracks()[0]?.getSettings().displaySurface))
    }
    if (source !== 'laptop') {
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        throw new Error('Microphone access was blocked. Allow it in the browser, or upload an audio file instead.')
      }
      opened.push(mic)
    }
    const shared = laptop?.getAudioTracks()[0]
    if (mic && laptop) {
      // Mix both into one track: Whisper transcribes a single audio stream.
      const ctx = new AudioContext()
      await ctx.resume()
      const out = ctx.createMediaStreamDestination()
      ctx.createMediaStreamSource(mic).connect(out)
      ctx.createMediaStreamSource(new MediaStream(laptop.getAudioTracks())).connect(out)
      return { stream: out.stream, shared, release: () => { stopAll(); void ctx.close() } }
    }
    return { stream: mic ?? new MediaStream(laptop!.getAudioTracks()), shared, release: stopAll }
  } catch (e) {
    stopAll()
    throw e
  }
}

/** Record or upload a voice note; it is transcribed on this laptop and proposed as a draft. */
export default function VoiceNote({ onProposed }: { onProposed: () => void }) {
  const { folder, bump } = useFolder()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({ step: 'idle' })
  const recorder = useRef<MediaRecorder | null>(null)
  const release = useRef<(() => void) | null>(null)
  const startedAt = useRef(0)
  const chunks = useRef<Blob[]>([])
  const [source, setSourceState] = useState<Source>(savedSource)
  const [recordingSource, setRecordingSource] = useState<Source>('mic')
  const fileInput = useRef<HTMLInputElement>(null)
  const recordingFor = useElapsed(state.step === 'recording')
  const sendingFor = useElapsed(state.step === 'sending')
  // Checked every time the dialog opens: is speech-to-text installed on this laptop?
  const [voice, setVoice] = useState<VoiceStatus | 'checking' | { unreachable: string }>('checking')
  const ready = typeof voice === 'object' && 'ready' in voice && voice.ready

  function checkVoice() {
    setVoice('checking')
    api.voiceStatus().then(setVoice).catch((e) => setVoice({ unreachable: (e as Error).message }))
  }

  useEffect(() => {
    if (open) checkVoice()
  }, [open])

  // While the speech model downloads, poll for progress (stops when the dialog closes).
  const downloading = typeof voice === 'object' && 'ready' in voice && voice.downloading
  useEffect(() => {
    if (!open || !downloading) return
    const t = setTimeout(() => {
      api.voiceStatus().then(setVoice).catch((e) => setVoice({ unreachable: (e as Error).message }))
    }, 1000)
    return () => clearTimeout(t)
  }, [open, downloading, voice])

  function download() {
    return api.downloadVoiceModel().then(setVoice).catch((e) => setVoice({ unreachable: (e as Error).message }))
  }

  function setSource(s: Source) {
    setSourceState(s)
    try { localStorage.setItem(SOURCE_KEY, s) } catch { /* not persisted */ }
  }

  // Release the microphone, shared audio and any preview URL when closing or unmounting.
  const stopTracks = () => {
    release.current?.()
    release.current = null
  }
  useEffect(() => () => stopTracks(), [])
  useEffect(() => () => {
    if (state.step === 'ready') URL.revokeObjectURL(state.url)
  }, [state])

  function close() {
    if (recorder.current?.state === 'recording') recorder.current.stop()
    stopTracks()
    setOpen(false)
    setState({ step: 'idle' })
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return setState({ step: 'idle', note: 'Recording isn’t available in this browser. Upload an audio file instead.' })
    }
    const using = canShareAudio() ? source : 'mic'
    let opened: Awaited<ReturnType<typeof openSource>>
    try {
      opened = await openSource(using)
    } catch (e) {
      return setState({ step: 'idle', note: (e as Error).message })
    }
    release.current = opened.release
    const rec = new MediaRecorder(opened.stream)
    chunks.current = []
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
    rec.onstop = () => {
      stopTracks()
      const type = rec.mimeType || 'audio/webm'
      const audio = new Blob(chunks.current, { type })
      const seconds = Math.round((Date.now() - startedAt.current) / 1000)
      const base = using === 'mic' ? 'voice-note' : 'meeting'
      setState({ step: 'ready', audio, name: `${base}.${extFor(type)}`, url: URL.createObjectURL(audio), seconds })
    }
    // The browser's "Stop sharing" bar ends the laptop audio: finish the recording there too.
    opened.shared?.addEventListener('ended', () => { if (rec.state === 'recording') rec.stop() })
    recorder.current = rec
    startedAt.current = Date.now()
    rec.start(1000) // 1 s chunks: long meetings don't pile up in one buffer
    setRecordingSource(using)
    setState({ step: 'recording' })
  }

  function pickFile(f: File | undefined) {
    if (f) setState({ step: 'ready', audio: f, name: f.name, url: URL.createObjectURL(f) })
  }

  async function send(audio: Blob, name: string, seconds?: number) {
    setState({ step: 'sending', name, long: (seconds ?? 0) > 300 || audio.size > 5 * 2 ** 20 })
    try {
      const outcome = await api.transcribe(folder.id, audio, name)
      bump()
      setState({ step: 'done', outcome })
      if (outcome.status === 'pending') onProposed()
    } catch (e) {
      setState({ step: 'error', message: (e as Error).message })
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-white px-2.5 py-0.5 font-semibold hover:bg-panel"
      >
        <Mic size={12} /> Voice note
      </button>

      {/* Portal: the toolbar can be hidden on phones (e.g. after switching to Approvals),
          and the dialog must stay visible regardless. */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Voice note"
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-sm shadow-xl sm:max-w-md sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Voice note</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Transcribed on this laptop and proposed as a draft in {folder.name}. Nothing is saved until you approve it.
                </p>
              </div>
              <button onClick={close} className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-panel" aria-label="Close voice note">
                <X size={16} />
              </button>
            </div>

            {!ready && <SetupNotice voice={voice} onRecheck={checkVoice} onDownload={download} />}

            <div className="mt-5">
              {state.step === 'idle' && (
                <div className="flex flex-col items-center gap-3">
                  {canShareAudio() && (
                    <div role="radiogroup" aria-label="What to record" className="flex w-full rounded-full border border-line bg-panel p-0.5 text-xs">
                      {SOURCES.map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          role="radio"
                          aria-checked={source === id}
                          onClick={() => setSource(id)}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 font-semibold ${source === id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
                        >
                          <Icon size={13} /> {label}
                        </button>
                      ))}
                    </div>
                  )}
                  {canShareAudio() && source !== 'mic' && (
                    <p className="text-center text-xs text-muted">
                      {source === 'both' ? 'Records your microphone and the laptop’s audio together. ' : 'Records the laptop’s audio, e.g. a meeting. '}
                      Your browser will open its screen-sharing window, the only way it allows recording another app’s sound: pick the <b>tab</b> the meeting is in and keep “Share tab audio” on. Only the sound is recorded. Let everyone know you’re recording.
                    </p>
                  )}
                  {!canShareAudio() && canShareScreen() && (
                    <p className="text-center text-xs text-muted">To record a meeting’s sound, open Talaan in Chrome or Edge. This browser can only record the microphone.</p>
                  )}
                  <button
                    onClick={startRecording}
                    disabled={!ready}
                    className="grid h-16 w-16 place-items-center rounded-full bg-brand text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
                    aria-label="Start recording"
                  >
                    <Mic size={26} />
                  </button>
                  <p className="text-muted">
                    {ready ? 'Tap to record' : voice === 'checking' ? 'Checking speech-to-text…' : downloading ? 'Recording turns on when the download finishes' : 'Recording is off until speech-to-text is set up'}
                  </p>
                  {state.note && <p className="rounded-lg bg-warn-soft px-3 py-2 text-center text-xs text-warn-text">{state.note}</p>}
                </div>
              )}

              {state.step === 'recording' && (
                <div className="flex flex-col items-center gap-3">
                  <button onClick={() => recorder.current?.stop()} className="grid h-16 w-16 place-items-center rounded-full bg-red-700 text-white" aria-label="Stop recording">
                    <Square size={22} fill="currentColor" />
                  </button>
                  <p className="flex items-center gap-2 font-mono text-lg">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" /> {clock(recordingFor)}
                  </p>
                  <p className="text-xs text-muted">Recording {SOURCES.find((s) => s.id === recordingSource)?.label.toLowerCase()}</p>
                </div>
              )}

              {state.step === 'ready' && (
                <div className="space-y-3">
                  <audio controls src={state.url} className="w-full" />
                  <p className="truncate text-xs text-muted">{state.name}</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => send(state.audio, state.name, state.seconds)} disabled={!ready} className="btn-primary text-sm disabled:cursor-not-allowed">Transcribe</button>
                    <button onClick={() => setState({ step: 'idle' })} className="btn-ghost inline-flex items-center gap-1.5 text-sm">
                      <RotateCcw size={14} /> Discard
                    </button>
                  </div>
                </div>
              )}

              {state.step === 'sending' && (
                <p className="rounded-lg bg-panel px-3 py-3 text-muted">
                  Transcribing on this laptop… {sendingFor}s
                  {state.long && <span className="mt-1 block text-xs">Long recordings can take several minutes. Keep this dialog open.</span>}
                </p>
              )}

              {state.step === 'done' && <Result outcome={state.outcome} />}

              {state.step === 'error' && (
                <div className="space-y-3">
                  <p className="rounded-lg bg-warn-soft px-3 py-2 text-warn-text">{state.message}</p>
                  <button onClick={() => setState({ step: 'idle' })} className="btn-ghost text-sm">Try again</button>
                </div>
              )}
            </div>

            {(state.step === 'idle' || state.step === 'ready') && (
              <div className="mt-5 border-t border-line pt-3">
                <button
                  onClick={() => fileInput.current?.click()}
                  disabled={!ready}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-text hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
                >
                  <Upload size={13} /> Upload an audio file instead
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept={AUDIO_ACCEPT}
                  aria-label="Upload audio file"
                  className="hidden"
                  onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }}
                />
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Shown instead of recording when speech-to-text isn't installed (or can't be checked). */
function SetupNotice({ voice, onRecheck, onDownload }: {
  voice: VoiceStatus | 'checking' | { unreachable: string }
  onRecheck: () => void
  onDownload: () => Promise<void>
}) {
  const [copied, setCopied] = useState(false)
  const [starting, setStarting] = useState(false)
  if (voice === 'checking') {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-lg bg-panel px-3 py-2 text-muted">
        <Loader2 size={14} className="animate-spin" /> Checking speech-to-text on this laptop…
      </p>
    )
  }
  const unreachable = 'unreachable' in voice
  // The model is missing: the backend fetches it itself, no terminal needed.
  if (!unreachable && voice.problem === 'model') {
    const total = voice.total_mb
    const done = voice.downloaded_mb ?? 0
    const pct = total ? Math.min(99, Math.round((done / total) * 100)) : null
    if (voice.downloading) {
      return (
        <div role="status" className="mt-4 space-y-2 rounded-lg border border-line bg-panel p-3">
          <p className="flex items-center gap-1.5 font-semibold"><Loader2 size={15} className="shrink-0 animate-spin text-brand-text" /> Downloading the speech model…</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-white">
            {pct === null
              ? <div className="h-full w-1/3 animate-[timeline-progress_1.4s_ease-in-out_infinite] rounded-full bg-brand" />
              : <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />}
          </div>
          <p className="text-xs text-muted">
            {total ? `${Math.round(done)} / ${total} MB · ${pct}%` : `${Math.round(done)} MB`} · Keep this laptop online until it finishes. This only happens once.
          </p>
        </div>
      )
    }
    async function start() {
      setStarting(true)
      await onDownload()
      setStarting(false)
    }
    return (
      <div role="alert" className="mt-4 space-y-2 rounded-lg border border-amber-300 bg-warn-soft p-3 text-warn-text">
        <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} className="shrink-0" /> Voice notes need a one-time download</p>
        {voice.message && <p className="text-xs">{voice.message}</p>}
        {voice.download_error && <p className="rounded bg-white px-2 py-1.5 text-xs text-red-800">{voice.download_error}</p>}
        <button onClick={start} disabled={starting} className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs">
          {starting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {voice.download_error ? 'Try again' : `Download speech model${total ? ` (${total} MB)` : ''}`}
        </button>
      </div>
    )
  }
  const title = unreachable ? 'Can’t reach Talaan’s backend' : 'Voice notes aren’t set up on this laptop'
  const message = unreachable ? 'Start the backend, then check again.' : voice.message
  const fix = unreachable ? 'cd backend; uv run uvicorn app.main:app' : voice.fix

  async function copy() {
    if (!fix) return
    try {
      await navigator.clipboard.writeText(fix)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false) // clipboard blocked: the command is still visible to select
    }
  }

  return (
    <div role="alert" className="mt-4 space-y-2 rounded-lg border border-amber-300 bg-warn-soft p-3 text-warn-text">
      <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} className="shrink-0" /> {title}</p>
      {message && <p className="text-xs">{message}</p>}
      {fix && (
        <>
          <p className="text-xs">Run this in a terminal from the Talaan folder:</p>
          <div className="flex items-stretch gap-1">
            <code className="min-w-0 flex-1 overflow-x-auto rounded bg-white px-2 py-1.5 font-mono text-[11px] whitespace-nowrap text-ink">{fix}</code>
            <button onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded bg-white px-2 text-xs font-semibold text-ink hover:bg-panel" aria-label="Copy command">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </>
      )}
      <button onClick={onRecheck} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-panel">
        <RefreshCw size={12} /> Check again
      </button>
    </div>
  )
}

function Result({ outcome }: { outcome: Outcome }) {
  if (outcome.status === 'blocked') {
    return (
      <p className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
        <Ban size={15} className="mt-0.5 shrink-0" /> Not saved: {outcome.reason}
      </p>
    )
  }
  return (
    <p className="flex gap-2 rounded-lg bg-brand-soft px-3 py-2 text-brand-text">
      <Check size={15} className="mt-0.5 shrink-0" />
      {outcome.status === 'pending'
        ? <span>Transcript proposed as <b className="break-all">{outcome.path}</b>. Review it in Approvals.</span>
        : <span>Saved as <b className="break-all">{outcome.path}</b>.</span>}
    </p>
  )
}
