// "Hey Tala" / "Tala, Tala": spotting the wake phrase in a local Whisper transcript.

const TALA = '(?:tala|talla|thala|tahla)'
const HEY = '(?:hey|hay|hi|hoy|uy|oy|ok|okay|hello)'
// "hey tala", "hey tala tala" or "tala tala" at the very start. A lone "tala" doesn't count:
// it's an everyday Tagalog word (star, list), so it would trigger on ordinary talk.
const WAKE = new RegExp(`^(?:${HEY} ${TALA}(?: ${TALA})?|${TALA} ${TALA})(?: |$)`)

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()

/** The command after the wake phrase ("" if only the phrase was said), or null if there was no wake phrase. */
export function matchWake(transcript: string): string | null {
  const m = normalize(transcript).match(WAKE)
  if (!m) return null
  const consumed = m[0].trim().split(' ').length
  // Drop the same number of words from the original, keeping its punctuation and casing.
  const words = transcript.trim().split(/\s+/).filter((w) => normalize(w))
  return words.slice(consumed).join(' ').replace(/^[\s,.!?;:—-]+/, '').trim()
}

/** Mono samples -> 16 kHz 16-bit WAV, what Whisper wants. Pads to `minSeconds` with silence. */
export function encodeWav(chunks: Float32Array[], rate: number, minSeconds = 1.6): Blob {
  const OUT = 16000
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const input = new Float32Array(total)
  let at = 0
  for (const c of chunks) { input.set(c, at); at += c.length }

  const step = rate / OUT
  const n = Math.max(Math.floor(total / step), Math.ceil(minSeconds * OUT))
  const view = new DataView(new ArrayBuffer(44 + n * 2))
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, OUT, true); view.setUint32(28, OUT * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  str(36, 'data'); view.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    // Average the source samples that fall in this output sample (a cheap low-pass).
    const from = Math.floor(i * step), to = Math.min(Math.floor((i + 1) * step), total)
    let sum = 0
    for (let j = from; j < to; j++) sum += input[j]
    const v = to > from ? sum / (to - from) : 0
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true)
  }
  return new Blob([view], { type: 'audio/wav' })
}
