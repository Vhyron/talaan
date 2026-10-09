import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic } from 'lucide-react'
import { api } from '../api/client'
import { extFor } from '../lib/audio'
import { useElapsed } from '../lib/useElapsed'

type Step = 'idle' | 'opening' | 'recording' | 'sending'

// Whisper needs ~1.5 s of audio (shorter clips make it invent text); a quick tap is a hint, not a recording.
const MIN_MS = 1500

/**
 * Hold to talk: press and hold (mouse, touch, Space/Enter on the focused button, or Alt+M anywhere), speak,
 * release. The speech is transcribed on this laptop and handed to `onText`, which puts it in
 * the chat box to edit and send. Nothing is saved or asked until the user sends it.
 */
export default function HoldToTalk({ folderId, disabled, onText }: {
  /** Names from this Space's own files help spelling. Home chat passes none. */
  folderId?: string
  disabled?: boolean
  onText: (text: string) => void
}) {
  const [step, setStep] = useState<Step>('idle')
  const [note, setNote] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const held = useRef(false) // still held down: released while the mic was opening = cancel
  const startedAt = useRef(0)
  const seconds = useElapsed(step === 'recording')

  const stopTracks = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }
  useEffect(() => () => {
    if (recorder.current?.state === 'recording') recorder.current.stop()
    stopTracks()
  }, [])

  // Hints clear themselves.
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 5000)
    return () => clearTimeout(t)
  }, [note])

  async function press() {
    if (disabled || step !== 'idle') return
    held.current = true
    setNote(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return setNote('Recording isn’t available in this browser.')
    }
    setStep('opening')
    let mic: MediaStream
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setStep('idle')
      return setNote('Microphone access was blocked. Allow it in the browser to talk.')
    }
    if (!held.current) {
      // Released while the browser was asking for the mic (first use): don't record.
      mic.getTracks().forEach((t) => t.stop())
      setStep('idle')
      return setNote('Microphone ready. Hold the button (or Alt+M) while you speak.')
    }
    stream.current = mic
    const rec = new MediaRecorder(mic)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    rec.onstop = () => {
      stopTracks()
      if (Date.now() - startedAt.current < MIN_MS) {
        setStep('idle')
        return setNote('Hold the button (or Alt+M) while you speak, then let go.')
      }
      const type = rec.mimeType || 'audio/webm'
      void transcribe(new Blob(chunks, { type }), `dictation.${extFor(type)}`)
    }
    recorder.current = rec
    startedAt.current = Date.now()
    rec.start()
    setStep('recording')
  }

  function release() {
    held.current = false
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  // Hotkey: hold Alt+M (Option+M on a Mac) anywhere on the page, release either key to stop.
  // Chosen to avoid browser and OS shortcuts: Ctrl+Space switches input language on macOS and
  // toggles the IME on Windows; Alt+Space opens the Windows window menu; Ctrl/Cmd+letters are
  // browser commands. e.code, not e.key: Option+M types "µ" on a Mac.
  const keys = useRef({ press, release })
  keys.current = { press, release }
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'KeyM' || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      e.preventDefault() // no "µ" typed into the box
      if (!e.repeat) void keys.current.press()
    }
    const up = (e: KeyboardEvent) => {
      if (!held.current || (e.code !== 'KeyM' && e.key !== 'Alt')) return
      e.preventDefault() // releasing Alt mustn't focus Firefox's menu bar on Windows
      keys.current.release()
    }
    const lost = () => { if (held.current) keys.current.release() } // switched window mid-hold
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', lost)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', lost)
    }
  }, [])

  async function transcribe(audio: Blob, name: string) {
    setStep('sending')
    try {
      const { text } = await api.dictate(audio, name, folderId)
      if (text.trim()) onText(text.trim())
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setStep('idle')
    }
  }

  const label = step === 'recording' ? `Listening… ${seconds}s, release to stop`
    : step === 'sending' ? 'Transcribing on this laptop…'
      : 'Hold to talk (Alt+M)'

  return (
    <div className="relative shrink-0">
      {(note || step === 'recording' || step === 'sending') && (
        <p role="status" className="absolute bottom-full right-0 mb-2 w-max max-w-64 rounded-md bg-ink px-2 py-1 text-xs text-white shadow">
          {note ?? label}
        </p>
      )}
      <button
        type="button"
        disabled={disabled || step === 'sending'}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault() // keep focus in the text box
          e.currentTarget.setPointerCapture(e.pointerId) // release fires even if the pointer drifts off
          void press()
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); void press() }
        }}
        onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release() } }}
        onBlur={release}
        onContextMenu={(e) => e.preventDefault()} // long-press on touch screens
        aria-label={label}
        title="Hold to talk, or hold Alt+M / Option+M (transcribed on this laptop)"
        className={`grid h-9 w-9 touch-none select-none place-items-center rounded-full border disabled:opacity-40 ${
          step === 'recording' ? 'animate-pulse border-red-600 bg-red-600 text-white'
            : 'border-line bg-white text-muted hover:border-brand hover:text-ink'
        }`}
      >
        {step === 'sending' || step === 'opening' ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
      </button>
    </div>
  )
}
