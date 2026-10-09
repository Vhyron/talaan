import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Ban, Check, Copy, Loader2, Mic, RefreshCw, RotateCcw, Square, Upload, X } from 'lucide-react'
import { api } from '../api/client'
import type { Outcome, VoiceStatus } from '../api/types'
import { useFolder } from '../lib/folderContext'
import { useElapsed } from '../lib/useElapsed'

type State =
  | { step: 'idle'; note?: string }
  | { step: 'recording' }
  | { step: 'ready'; audio: Blob; name: string; url: string }
  | { step: 'sending'; name: string }
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

/** Record or upload a voice note; it is transcribed on this laptop and proposed as a draft. */
export default function VoiceNote({ onProposed }: { onProposed: () => void }) {
  const { folder, bump } = useFolder()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({ step: 'idle' })
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
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

  // Release the microphone and any preview URL when closing or unmounting.
  const stopTracks = () => recorder.current?.stream.getTracks().forEach((t) => t.stop())
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
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return setState({ step: 'idle', note: 'Microphone access was blocked. Allow it in the browser, or upload an audio file instead.' })
    }
    const rec = new MediaRecorder(stream)
    chunks.current = []
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      const type = rec.mimeType || 'audio/webm'
      const audio = new Blob(chunks.current, { type })
      setState({ step: 'ready', audio, name: `voice-note.${extFor(type)}`, url: URL.createObjectURL(audio) })
    }
    recorder.current = rec
    rec.start()
    setState({ step: 'recording' })
  }

  function pickFile(f: File | undefined) {
    if (f) setState({ step: 'ready', audio: f, name: f.name, url: URL.createObjectURL(f) })
  }

  async function send(audio: Blob, name: string) {
    setState({ step: 'sending', name })
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

            {!ready && <SetupNotice voice={voice} onRecheck={checkVoice} />}

            <div className="mt-5">
              {state.step === 'idle' && (
                <div className="flex flex-col items-center gap-3">
                  <button
                    onClick={startRecording}
                    disabled={!ready}
                    className="grid h-16 w-16 place-items-center rounded-full bg-brand text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
                    aria-label="Start recording"
                  >
                    <Mic size={26} />
                  </button>
                  <p className="text-muted">{ready ? 'Tap to record' : voice === 'checking' ? 'Checking speech-to-text…' : 'Recording is off until speech-to-text is set up'}</p>
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
                </div>
              )}

              {state.step === 'ready' && (
                <div className="space-y-3">
                  <audio controls src={state.url} className="w-full" />
                  <p className="truncate text-xs text-muted">{state.name}</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => send(state.audio, state.name)} disabled={!ready} className="btn-primary text-sm disabled:cursor-not-allowed">Transcribe</button>
                    <button onClick={() => setState({ step: 'idle' })} className="btn-ghost inline-flex items-center gap-1.5 text-sm">
                      <RotateCcw size={14} /> Discard
                    </button>
                  </div>
                </div>
              )}

              {state.step === 'sending' && (
                <p className="rounded-lg bg-panel px-3 py-3 text-muted">Transcribing on this laptop… {sendingFor}s</p>
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
function SetupNotice({ voice, onRecheck }: { voice: VoiceStatus | 'checking' | { unreachable: string }; onRecheck: () => void }) {
  const [copied, setCopied] = useState(false)
  if (voice === 'checking') {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-lg bg-panel px-3 py-2 text-muted">
        <Loader2 size={14} className="animate-spin" /> Checking speech-to-text on this laptop…
      </p>
    )
  }
  const unreachable = 'unreachable' in voice
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
