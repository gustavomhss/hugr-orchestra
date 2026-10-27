// Audio for the live seat: the capture window posts mono Float32 frames per track at 16 kHz, and main turns them into
// one interleaved PCM16 stream, left "me" and right "them", which is what the transcriber receives. Kept free of
// Electron so the echo gate and the ring buffer can be tested directly.

export const SAMPLE_RATE = 16_000
export const CHANNELS = 2
// 2 bytes per sample, 2 channels.
export const BYTES_PER_MS = (SAMPLE_RATE * CHANNELS * 2) / 1000

// RMS of "them" above which the far end counts as speaking. Speakers leak the far end into the mic, and the browser's
// echo canceller does not see loopback audio, so the mic is silenced while "them" speaks and for a short hangover.
const THEM_SPEAKING_RMS = 0.01
const ECHO_HANGOVER_MS = 200

const LEVEL_INTERVAL_MS = 66

export type EchoGate = { silentUntilMs: number }

export function echoGate(): EchoGate {
  return { silentUntilMs: -1 }
}

export function interleave(me: Float32Array, them: Float32Array, startMs: number, gate: EchoGate) {
  const frames = Math.min(me.length, them.length)
  if (rms(them, frames) > THEM_SPEAKING_RMS) gate.silentUntilMs = startMs + (frames / SAMPLE_RATE) * 1000 + ECHO_HANGOVER_MS
  const muted = startMs < gate.silentUntilMs
  const out = new Int16Array(frames * CHANNELS)
  for (let i = 0; i < frames; i++) {
    out[i * 2] = muted ? 0 : pcm16(me[i])
    out[i * 2 + 1] = pcm16(them[i])
  }
  return out
}

export function rms(samples: Float32Array, frames: number) {
  if (frames === 0) return 0
  let sum = 0
  for (let i = 0; i < frames; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / frames)
}

// Input levels for the settings screen and the meeting bar: the RMS of each track, handed on at most every 66 ms
// (about 15 Hz). `nowMs` is a wall clock the caller supplies so the throttle can be tested.
export function levelMeter(emit: (levels: { microphone: number; "system-audio": number }) => void) {
  const state = { lastMs: -Infinity }
  return (me: Float32Array, them: Float32Array, nowMs: number) => {
    if (nowMs - state.lastMs < LEVEL_INTERVAL_MS) return
    state.lastMs = nowMs
    emit({ microphone: Math.min(1, rms(me, me.length)), "system-audio": Math.min(1, rms(them, them.length)) })
  }
}

function pcm16(sample: number) {
  const clamped = Math.max(-1, Math.min(1, sample))
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff)
}

// The last `limitMs` of interleaved audio, addressed by stream time, so a reconnect can resend what the engine had
// not yet acknowledged.
export function ringBuffer(limitMs = 30_000) {
  const chunks: { startMs: number; data: Int16Array }[] = []
  const durationMs = (data: Int16Array) => (data.length * 2) / BYTES_PER_MS
  return {
    push(startMs: number, data: Int16Array) {
      chunks.push({ startMs, data })
      const endMs = startMs + durationMs(data)
      while (chunks.length > 0 && chunks[0].startMs + durationMs(chunks[0].data) <= endMs - limitMs) chunks.shift()
    },
    // Chunks that end after `fromMs`; the first one may start before it, which the engine tolerates as overlap.
    since(fromMs: number) {
      return chunks.filter((chunk) => chunk.startMs + durationMs(chunk.data) > fromMs)
    },
    startMs() {
      return chunks[0]?.startMs
    },
  }
}
