import { BrowserWindow, desktopCapturer, session } from "electron"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// Microphone and system-audio capture for the live seat, in a hidden window on its own session so its media
// permissions and display-media handler never reach the app's windows. System audio is Electron's display-media
// loopback (the Core Audio process tap on macOS) granted with no picker; the video track is stopped at once. The page
// mixes both into a two-channel 16 kHz AudioContext and an AudioWorklet posts 20 ms of each track to main. It restarts
// when an input or output device changes or a track ends, so capture follows the system default device.

const root = dirname(fileURLToPath(import.meta.url))
const PARTITION = "live-capture"
const PAGE_URL = "oc://live-capture/index.html"

export type CaptureHandlers = {
  audio(me: Float32Array, them: Float32Array): void
  status(sense: "microphone" | "systemAudio", status: "granted" | "denied", reason: string): void
  state(state: "started" | "restarted" | "failed", reason: string): void
}

export async function startCapture(handlers: CaptureHandlers) {
  const captureSession = session.fromPartition(PARTITION)
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: PARTITION,
      preload: join(root, "../preload/live-capture.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  const contents = win.webContents
  if (!captureSession.protocol.isProtocolHandled("oc"))
    captureSession.protocol.handle("oc", () => new Response(PAGE, { headers: { "content-type": "text/html" } }))
  captureSession.setPermissionRequestHandler((source, permission, callback) =>
    callback(source === contents && permission === "media"),
  )
  captureSession.setPermissionCheckHandler((source, permission) => source === contents && permission === "media")
  captureSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      if (request.frame?.url !== PAGE_URL) return callback({})
      void desktopCapturer
        .getSources({ types: ["screen"] })
        .then((sources) => callback(sources[0] ? { video: sources[0], audio: "loopback" } : {}))
        .catch(() => callback({}))
    },
    { useSystemPicker: false },
  )
  contents.setWindowOpenHandler(() => ({ action: "deny" }))
  contents.on("will-navigate", (event) => event.preventDefault())
  contents.ipc.on("live-capture:audio", (_, me: Float32Array, them: Float32Array) => handlers.audio(me, them))
  contents.ipc.on("live-capture:status", (_, sense, status, reason) => handlers.status(sense, status, String(reason)))
  contents.ipc.on("live-capture:state", (_, state, reason) => handlers.state(state, String(reason)))
  // A restart opens display media again, which needs the same main-side gesture as the first start.
  contents.ipc.on("live-capture:restart", () =>
    contents.executeJavaScript("start(true)", true).catch((error) => handlers.state("failed", String(error))),
  )
  await win.loadURL(PAGE_URL)
  // getDisplayMedia needs a user gesture; the explicit meeting start is that gesture.
  await contents.executeJavaScript("start()", true)
  return {
    async stop() {
      if (win.isDestroyed()) return
      await contents.executeJavaScript("stop()").catch(() => undefined)
      win.destroy()
    },
  }
}

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input.length > 0) this.port.postMessage([input[0].slice(0), (input[1] ?? input[0].map(() => 0)).slice(0)])
    return true
  }
}
registerProcessor("tap", Tap)
`

// Plain script on purpose: it is the whole page, served by this module's own protocol handler.
const PAGE = `<!doctype html><meta charset="utf-8"><script>
const FRAMES = 320
let current
async function start(restart) {
  await stop()
  const context = new AudioContext({ sampleRate: 16000 })
  const run = { context, streams: [], me: [], them: [], size: 0 }
  current = run
  await context.audioWorklet.addModule(URL.createObjectURL(new Blob([${JSON.stringify(WORKLET)}], { type: "text/javascript" })))
  const merger = context.createChannelMerger(2)
  const tap = new AudioWorkletNode(context, "tap", { channelCount: 2, channelCountMode: "explicit", channelInterpretation: "discrete" })
  const mute = context.createGain()
  mute.gain.value = 0
  merger.connect(tap).connect(mute).connect(context.destination)
  tap.port.onmessage = (event) => {
    run.me.push(event.data[0])
    run.them.push(event.data[1])
    run.size += event.data[0].length
    if (run.size < FRAMES) return
    const join = (parts) => { const out = new Float32Array(run.size); let at = 0; for (const part of parts) { out.set(part, at); at += part.length } return out }
    window.liveCapture.audio(join(run.me), join(run.them))
    run.me = []; run.them = []; run.size = 0
  }
  const mic = await navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
    .then((stream) => { window.liveCapture.status("microphone", "granted", ""); return stream })
    .catch((error) => { window.liveCapture.status("microphone", "denied", String(error)); return undefined })
  const loop = await navigator.mediaDevices
    .getDisplayMedia({ audio: true, video: true })
    .catch((error) => { window.liveCapture.status("systemAudio", "denied", String(error)); return undefined })
  if (current !== run) return [mic, loop].forEach((stream) => stream?.getTracks().forEach((track) => track.stop()))
  loop?.getVideoTracks().forEach((track) => track.stop())
  if (mic) context.createMediaStreamSource(mic).connect(merger, 0, 0)
  if (loop && loop.getAudioTracks().length > 0) context.createMediaStreamSource(new MediaStream(loop.getAudioTracks())).connect(merger, 0, 1)
  run.streams = [mic, loop].filter(Boolean)
  run.streams.forEach((stream) => stream.getAudioTracks().forEach((track) => track.addEventListener("ended", () => schedule())))
  window.liveCapture.state(restart ? "restarted" : "started", "")
}
async function stop() {
  const run = current
  current = undefined
  if (!run) return
  run.streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
  await run.context.close()
}
let pending
function schedule() {
  if (!current) return
  clearTimeout(pending)
  pending = setTimeout(() => window.liveCapture.restart(), 300)
}
navigator.mediaDevices.addEventListener("devicechange", schedule)
</script>`
