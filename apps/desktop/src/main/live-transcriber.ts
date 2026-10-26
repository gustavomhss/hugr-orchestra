import { Option, Schema } from "effect"
import { CHANNELS, SAMPLE_RATE, ringBuffer } from "./live-audio"

// One speech-to-text interface for the live seat: interleaved two-channel PCM16 in (left "me", right "them"), partial
// and final pieces out, plus an end-of-speech event per track. Times are milliseconds of meeting audio, so they survive
// reconnects. Kept free of Electron; the engine only needs a WebSocket.

export type Track = "me" | "them"

export type TranscriptPiece = { track: Track; text: string; startMs: number; endMs: number; final: boolean }

export type TranscriberEvent =
  | { kind: "piece"; piece: TranscriptPiece }
  | { kind: "speech-end"; track: Track; atMs: number }
  | { kind: "open"; attempt: number; replayFromMs: number }
  // The stream dropped and will reconnect in `retryInSeconds`; a drop without a close frame reports 1006 and the
  // transport error as the reason. `watermarkMs` is the end of the last audio the engine finalised.
  | { kind: "close"; attempt: number; code: number; reason: string; retryInSeconds: number; watermarkMs: number }

export type Transcriber = {
  send(startMs: number, pcm: Int16Array): void
  stop(): Promise<void>
}

// `language` is a BCP-47 tag; "multi" lets the engine follow a meeting that switches language.
export type TranscriberConfig = { engine: "deepgram"; model: string; key: string; url?: string; language?: string }

const TRACKS: Track[] = ["me", "them"]
const MAX_BACKOFF_SECONDS = 30

export function createTranscriber(config: TranscriberConfig, onEvent: (event: TranscriberEvent) => void): Transcriber {
  if (config.engine !== "deepgram") throw new Error(`Unknown transcription engine: ${String(config.engine)}`)
  if (!/^[\w.-]+$/.test(config.model)) throw new Error(`Invalid transcription model id: ${JSON.stringify(config.model)}`)
  if (!config.key) throw new Error("No transcription key is set")
  return deepgram(config, onEvent)
}

function deepgram(config: TranscriberConfig, onEvent: (event: TranscriberEvent) => void): Transcriber {
  const ring = ringBuffer()
  const finalEndMs = [0, 0]
  const url = new URL(config.url ?? "wss://api.deepgram.com/v1/listen")
  Object.entries({
    model: config.model,
    encoding: "linear16",
    sample_rate: String(SAMPLE_RATE),
    channels: String(CHANNELS),
    multichannel: "true",
    interim_results: "true",
    vad_events: "true",
    utterance_end_ms: "1000",
    punctuate: "true",
    smart_format: "true",
    ...(config.language ? { language: config.language } : {}),
  }).forEach(([key, value]) => url.searchParams.set(key, value))
  const state = {
    socket: undefined as WebSocket | undefined,
    // Meeting time of the first sample this socket was sent; the engine's times are relative to it.
    offsetMs: undefined as number | undefined,
    attempt: 0,
    error: "",
    stopped: false,
    retry: undefined as ReturnType<typeof setTimeout> | undefined,
  }
  const watermark = () => Math.min(...finalEndMs)

  const write = (socket: WebSocket, startMs: number, pcm: Int16Array) => {
    state.offsetMs ??= startMs
    socket.send(pcm)
  }

  const connect = () => {
    const socket = new WebSocket(url, ["token", config.key])
    socket.binaryType = "arraybuffer"
    state.socket = socket
    state.offsetMs = undefined
    state.error = ""
    socket.onopen = () => {
      const replayFromMs = Math.max(watermark(), ring.startMs() ?? 0)
      onEvent({ kind: "open", attempt: state.attempt, replayFromMs })
      state.attempt = 0
      ring.since(replayFromMs).forEach((chunk) => write(socket, chunk.startMs, chunk.data))
    }
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return
      const message = Option.getOrUndefined(decodeMessage(event.data))
      if (!message || state.offsetMs === undefined) return
      const offsetMs = state.offsetMs
      if (message.type === "UtteranceEnd") {
        message.channel.slice(0, 1).forEach((index) =>
          onEvent({ kind: "speech-end", track: TRACKS[index], atMs: offsetMs + message.last_word_end * 1000 }),
        )
        return
      }
      const index = message.channel_index[0]
      const track = TRACKS[index]
      if (!track) return
      const startMs = offsetMs + message.start * 1000
      const endMs = startMs + message.duration * 1000
      // A replay overlaps audio the engine already finalised before the drop; its pieces would repeat.
      if (endMs <= finalEndMs[index]) return
      if (message.is_final) finalEndMs[index] = endMs
      const text = message.channel.alternatives[0]?.transcript ?? ""
      if (text) onEvent({ kind: "piece", piece: { track, text, startMs, endMs, final: message.is_final } })
      if (message.speech_final) onEvent({ kind: "speech-end", track, atMs: endMs })
    }
    socket.onerror = (event) => {
      state.error = "message" in event && typeof event.message === "string" ? event.message : "transport error"
    }
    socket.onclose = (event) => {
      if (state.socket !== socket || state.stopped) return
      state.attempt += 1
      const retryInSeconds = Math.min(MAX_BACKOFF_SECONDS, 2 ** (state.attempt - 1))
      const code = event.code && event.code !== 1005 ? event.code : 1006
      onEvent({
        kind: "close",
        attempt: state.attempt,
        code,
        reason: event.reason || state.error || "closed without a reason",
        retryInSeconds,
        watermarkMs: watermark(),
      })
      state.retry = setTimeout(connect, retryInSeconds * 1000)
    }
  }

  connect()
  return {
    send(startMs, pcm) {
      ring.push(startMs, pcm)
      const socket = state.socket
      if (socket?.readyState === WebSocket.OPEN) write(socket, startMs, pcm)
    },
    async stop() {
      state.stopped = true
      clearTimeout(state.retry)
      const socket = state.socket
      if (!socket || socket.readyState === WebSocket.CLOSED) return
      // CloseStream asks the engine to flush its last finals before it closes; give it a bounded wait.
      const closed = new Promise<void>((resolve) => {
        socket.addEventListener("close", () => resolve())
        setTimeout(resolve, 3000)
      })
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "CloseStream" }))
      if (socket.readyState === WebSocket.CONNECTING) socket.close()
      await closed
    },
  }
}

const Results = Schema.Struct({
  type: Schema.Literal("Results"),
  channel_index: Schema.Array(Schema.Number),
  start: Schema.Number,
  duration: Schema.Number,
  is_final: Schema.Boolean,
  speech_final: Schema.optional(Schema.Boolean),
  channel: Schema.Struct({ alternatives: Schema.Array(Schema.Struct({ transcript: Schema.String })) }),
})
const UtteranceEnd = Schema.Struct({
  type: Schema.Literal("UtteranceEnd"),
  channel: Schema.Array(Schema.Number),
  last_word_end: Schema.Number,
})
const decodeMessage = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Union([Results, UtteranceEnd])))
