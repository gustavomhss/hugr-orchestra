import type { TranscriptPiece, Track } from "./live-transcriber"

// Turns the transcriber's pieces into meeting segments, one per utterance and track. Final pieces accumulate into the
// open segment; partials only feed the live caption. A segment closes on the engine's end-of-speech, or, for an engine
// without one, once the transcript stops growing for 700 ms after a sentence end or 1500 ms otherwise. A segment is
// force-cut at 30 s. Times are meeting-audio milliseconds, driven by `tick`, so the rules are testable without timers.

export type Segment = { track: Track; text: string; startMs: number; endMs: number }
export type Caption = { track: Track; text: string; partial: string }

const SENTENCE_END_QUIET_MS = 700
const QUIET_MS = 1500
const FORCE_CUT_MS = 30_000

export function segmenter(options: {
  endOfSpeech: boolean
  onSegment: (segment: Segment) => void
  onCaption: (caption: Caption) => void
}) {
  const open = new Map<Track, { texts: string[]; startMs: number; endMs: number; partial: string; grewAtMs: number }>()

  const close = (track: Track) => {
    const segment = open.get(track)
    open.delete(track)
    options.onCaption({ track, text: "", partial: "" })
    if (!segment || segment.texts.length === 0) return
    options.onSegment({ track, text: segment.texts.join(" "), startMs: segment.startMs, endMs: segment.endMs })
  }

  return {
    piece(piece: TranscriptPiece, nowMs: number) {
      const segment = open.get(piece.track) ?? { texts: [], startMs: piece.startMs, endMs: piece.endMs, partial: "", grewAtMs: nowMs }
      open.set(piece.track, segment)
      segment.grewAtMs = nowMs
      if (piece.final) {
        segment.texts.push(piece.text)
        segment.endMs = Math.max(segment.endMs, piece.endMs)
        segment.partial = ""
      }
      if (!piece.final) segment.partial = piece.text
      options.onCaption({ track: piece.track, text: segment.texts.join(" "), partial: segment.partial })
      if (segment.endMs - segment.startMs >= FORCE_CUT_MS) close(piece.track)
    },
    speechEnd(track: Track) {
      close(track)
    },
    tick(nowMs: number) {
      if (options.endOfSpeech) return
      ;[...open.entries()]
        .filter(([, segment]) => {
          const last = segment.texts.at(-1) ?? ""
          const quietMs = /[.?!]$/.test(last) && !segment.partial ? SENTENCE_END_QUIET_MS : QUIET_MS
          return segment.texts.length > 0 && nowMs - segment.grewAtMs >= quietMs
        })
        .forEach(([track]) => close(track))
    },
    flush() {
      ;[...open.keys()].forEach(close)
    },
  }
}
