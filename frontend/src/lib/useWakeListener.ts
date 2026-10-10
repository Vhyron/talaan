import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { encodeWav, matchWake } from './wakeWord'

export type WakeState =
  | { step: 'off' }
  | { step: 'starting' }
  | { step: 'listening'; hearing: boolean; checking: boolean }
  | { step: 'armed' } // heard just a wake phrase: the next thing said is the question
  | { step: 'error'; message: string }

const PREROLL_MS = 400 // kept from before the voice crossed the threshold, so "Hey" isn't clipped
const HANGOVER_MS = 700 // this much quiet ends a phrase
const MAX_MS = 15000 // a phrase longer than this is cut and checked anyway
const MIN_MS = 350 // shorter blips (a cough, a click) are ignored
const ARMED_MS = 8000 // after a bare wake phrase, how long to wait for the question
const MAX_QUEUE = 3

/**
 * Wake phrase, fully on this laptop: while `enabled`, the mic level is watched in the browser;
 * each spoken phrase is cut out and transcribed by the local Whisper (POST /voice/dictate),
 * and only a phrase starting with one of the two wake phrases, "Hey Tala!" or "Tala, Tala", does anything. Everything else
 * is dropped: not saved, not sent to the model, not logged. (The browser's own speech
 * recognition isn't used: Chrome's sends audio to Google.)
 */
export function useWakeListener(enabled: boolean, opts: {
  folderId?: string
  /** Ignore the mic meanwhile (hold-to-talk is recording). */
  paused: boolean
  onCommand: (text: string) => void
}): WakeState {
  const [state, setState] = useState<WakeState>({ step: 'off' })
  const latest = useRef(opts)
  latest.current = opts

  useEffect(() => {
    if (!enabled) { setState({ step: 'off' }); return }
    let stopped = false
    let release = () => {}
    const queue: Blob[] = []
    let working = false
    let armedUntil = 0
    let armTimer: ReturnType<typeof setTimeout> | undefined
    let hearing = false

    const show = () => {
      if (stopped) return
      setState(armedUntil > Date.now() ? { step: 'armed' } : { step: 'listening', hearing, checking: working || queue.length > 0 })
    }

    async function drain() {
      if (working) return
      working = true
      while (queue.length && !stopped) {
        show()
        const clip = queue.shift()!
        let text = ''
        try {
          text = (await api.dictate(clip, 'wake.wav', latest.current.folderId, true)).text.trim()
        } catch {
          continue // no speech, too short, model busy: just keep listening
        }
        if (stopped || !text) continue
        const rest = matchWake(text)
        if (armedUntil > Date.now()) {
          armedUntil = 0
          const command = rest ?? text // "Hey Tala … Hey Tala, what's open?" still works
          if (command) latest.current.onCommand(command)
        } else if (rest !== null) {
          if (rest) {
            latest.current.onCommand(rest)
          } else {
            armedUntil = Date.now() + ARMED_MS
            clearTimeout(armTimer)
            armTimer = setTimeout(show, ARMED_MS + 50)
          }
        }
      }
      working = false
      show()
    }

    setState({ step: 'starting' })
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then((mic) => {
      if (stopped) { mic.getTracks().forEach((t) => t.stop()); return }
      const ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(mic)
      // ScriptProcessor is deprecated but runs everywhere without a separate worklet file.
      const proc = ctx.createScriptProcessor(2048, 1, 1)
      const bufMs = (2048 / ctx.sampleRate) * 1000
      const preroll: Float32Array[] = []
      let phrase: Float32Array[] | null = null
      let quietMs = 0
      let floor = 0.005 // background noise level, tracked while nobody's speaking

      proc.onaudioprocess = (e) => {
        if (latest.current.paused) {
          phrase = null; preroll.length = 0
          if (hearing) { hearing = false; show() }
          return
        }
        const buf = new Float32Array(e.inputBuffer.getChannelData(0))
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        const rms = Math.sqrt(sum / buf.length)
        const loud = rms > Math.max(0.012, floor * 3)

        if (!phrase) {
          if (!loud) floor = floor * 0.95 + rms * 0.05
          preroll.push(buf)
          while (preroll.length * bufMs > PREROLL_MS) preroll.shift()
          if (loud) {
            phrase = [...preroll]
            preroll.length = 0
            quietMs = 0
            hearing = true
            show()
          }
          return
        }
        phrase.push(buf)
        quietMs = loud ? 0 : quietMs + bufMs
        const length = phrase.length * bufMs
        if (quietMs >= HANGOVER_MS || length >= MAX_MS) {
          const spoken = length - quietMs
          const clip = phrase
          phrase = null
          hearing = false
          if (spoken >= MIN_MS && queue.length < MAX_QUEUE) {
            queue.push(encodeWav(clip, ctx.sampleRate))
            void drain()
          }
          show()
        }
      }
      src.connect(proc)
      proc.connect(ctx.destination) // outputs silence; needed for the processor to run
      release = () => {
        proc.onaudioprocess = null
        proc.disconnect(); src.disconnect()
        mic.getTracks().forEach((t) => t.stop())
        void ctx.close()
      }
      show()
    }).catch(() => {
      if (!stopped) setState({ step: 'error', message: 'Microphone access was blocked, so Tala can’t listen.' })
    })

    return () => {
      stopped = true
      clearTimeout(armTimer)
      release()
    }
  }, [enabled])

  return state
}
