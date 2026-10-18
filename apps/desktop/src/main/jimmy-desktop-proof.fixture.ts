import { app, BrowserWindow } from "electron"
import { join } from "node:path"
import { spawnLocalServer } from "./server"

const root = process.env.JIMMY_DESKTOP_ROOT
const port = Number(process.env.JIMMY_DESKTOP_PORT)
if (!root || !Number.isInteger(port) || port <= 0) throw new Error("Missing owned desktop proof root/port")
app.setName("Jimmy Desktop Proof")
app.setPath("userData", join(root, "desktop"))
app.setPath("sessionData", join(root, "session"))
app.commandLine.appendSwitch("disable-gpu")
console.log(`JIMMY_ELECTRON_ENTRY=${JSON.stringify({ pid: process.pid, execPath: process.execPath, entry: import.meta.url, versions: process.versions })}`)
// Electron postpones ready until its ESM entry finishes evaluating. Await readiness
// inside an async startup boundary, as production's Effect.runFork does.
void main().catch((error: unknown) => {
  console.error(error)
  app.exit(1)
})

async function main() {
  await app.whenReady()
  if (process.platform === "darwin") app.dock?.hide()
  const deadline = setTimeout(() => {
    console.error("Jimmy desktop fixture deadline exceeded")
    app.exit(2)
  }, 90000)
  const server = await spawnLocalServer("127.0.0.1", port, "owned-proof-password", {
    userDataPath: app.getPath("userData"),
    onStdout: (message) => console.log(message),
    onStderr: (message) => console.error(message),
    onExit: (code) => console.log(`JIMMY_SIDECAR_EXIT=${code}`),
  })
  await server.health.wait
  console.log(`JIMMY_DESKTOP_READY=${JSON.stringify({ pid: process.pid, execPath: process.execPath, entry: import.meta.url, versions: process.versions, metrics: app.getAppMetrics(), windows: BrowserWindow.getAllWindows().length, userData: app.getPath("userData") })}`)
  process.stdin.setEncoding("utf8")
  process.stdin.once("data", async () => {
    await server.listener.stop()
    clearTimeout(deadline)
    // This acknowledges the stop request; the host emits STOPPED only after PID and TCP checks.
    console.log(`JIMMY_DESKTOP_STOP_ACK=${JSON.stringify({ windows: BrowserWindow.getAllWindows().length, metrics: app.getAppMetrics() })}`)
    process.stdin.destroy()
    // The host observes native process disappearance before reaping this private
    // Electron process group. This harness does not exercise desktop activation/quit.
  })
}
