import { contextBridge, ipcRenderer } from "electron"

// The live seat's hidden capture page reports audio and sense status to main; it receives nothing else.
contextBridge.exposeInMainWorld("liveCapture", {
  audio: (me: Float32Array, them: Float32Array) => ipcRenderer.send("live-capture:audio", me, them),
  status: (sense: "microphone" | "systemAudio", status: "granted" | "denied", reason: string) =>
    ipcRenderer.send("live-capture:status", sense, status, reason),
  restart: () => ipcRenderer.send("live-capture:restart"),
  state: (state: "started" | "restarted" | "failed", reason: string) => ipcRenderer.send("live-capture:state", state, reason),
})
