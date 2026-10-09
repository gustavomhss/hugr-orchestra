export * as OmniSmoke from "./omni-smoke"

// The packaged-app smoke (.github/workflows/omni-desktop-smoke.yml) and nothing else. It runs only when the launcher
// sets ORCHESTRA_DESKTOP_OMNI_SMOKE to a file path and the omni flag is on. It writes the local server's URL and
// credentials there, so the smoke driver can call the server API (a session shell, a terminal), plus this process's
// pid, which the driver kill -9s. Whoever sets the variable already controls this app's environment.
// With ORCHESTRA_DESKTOP_OMNI_SMOKE_ARGV (a JSON argv) it also starts that tree through the main process's own omni
// supervisor and reads its first line as bytes: the text:false path under Electron, and a main-process tree for the
// kill -9 oracle.

import { randomUUID } from "node:crypto"
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { rename, writeFile } from "node:fs/promises"
import { app, BrowserWindow, screen } from "electron"
import { DesktopOmni } from "./omni-process"

const utility = { pid: undefined as number | undefined }

/** Smoke-only lifecycle witnesses. No new runtime IPC or HTTP surface. */
export function event(name: string, data: Record<string, unknown> = {}) {
  const file = process.env.ORCHESTRA_DESKTOP_OMNI_SMOKE
  if (!file || !DesktopOmni.enabled()) return
  appendFileSync(`${file}.events`, JSON.stringify({ name, pid: process.pid, at: Date.now(), ...data }) + "\n", { mode: 0o600 })
}

export function utilityStarted(pid: number | undefined) {
  if (!process.env.ORCHESTRA_DESKTOP_OMNI_SMOKE || !DesktopOmni.enabled()) return
  utility.pid = pid
  event("utility-started", { utilityPID: pid })
}

/** Observability only: unknown native/UV handles stay named, never classified as harmless. */
export function resources(stage: string) {
  if (!process.env.ORCHESTRA_DESKTOP_OMNI_SMOKE || !DesktopOmni.enabled()) return
  const node = process as NodeJS.Process & { _getActiveHandles?: () => unknown[]; _getActiveRequests?: () => unknown[] }
  const summarize = (value: unknown) => {
    if (!value || typeof value !== "object") return { type: typeof value }
    const handle = value as { constructor?: { name?: string }; hasRef?: () => boolean; fd?: number; pid?: number;
      _handle?: { constructor?: { name?: string }; hasRef?: () => boolean } }
    return { type: handle.constructor?.name ?? "unknown", uv: handle._handle?.constructor?.name,
      ref: handle.hasRef?.() ?? handle._handle?.hasRef?.(), fd: handle.fd, childPID: handle.pid }
  }
  event("resources", { stage, active: process.getActiveResourcesInfo(), handles: node._getActiveHandles?.().map(summarize),
    requests: node._getActiveRequests?.().map(summarize) })
}

export async function report(server: { url: string; username: string; password: string }) {
  const file = process.env.ORCHESTRA_DESKTOP_OMNI_SMOKE
  if (!file || !DesktopOmni.enabled()) return
  const argv = JSON.parse(process.env.ORCHESTRA_DESKTOP_OMNI_SMOKE_ARGV ?? "[]") as string[]
  const main = argv.length > 0 ? await firstLine(argv) : undefined
  const token = randomUUID()
  const quit = `${file}.quit`
  const gui = () => {
    const windows = BrowserWindow.getAllWindows().map((window) => ({ id: window.id, visible: window.isVisible(), url: window.webContents.getURL() }))
    if (windows.some((window) => window.visible)) event("gui-visible", { windows, displays: screen.getAllDisplays().map((display) => ({ id: display.id, size: display.size })) })
  }
  const timer = setInterval(() => {
    gui()
    if (!existsSync(quit) || readFileSync(quit, "utf8") !== token) return
    clearInterval(timer)
    void (async () => {
      resources("quit-trigger-active-fixtures")
      if (process.env.ORCHESTRA_DESKTOP_OMNI_DIAGNOSE_MAIN === "1") {
        event("diagnostic-main-stop-start", { mainPID: main?.pid, scope: "diagnostic only; not production shutdown" })
        if (!main) throw new Error("diagnostic main tree missing")
        await main.stop()
        event("diagnostic-main-stop-complete", { mainPID: main.pid })
        resources("diagnostic-main-closed")
      }
      event("quit-requested")
      app.quit()
    })().catch((error: unknown) => event("diagnostic-error", { error: String(error) }))
  }, 200)
  timer.unref()
  app.on("before-quit", () => { event("before-quit"); resources("before-quit") })
  app.once("will-quit", () => { clearInterval(timer); event("will-quit"); resources("will-quit") })
  app.once("quit", (_event, code) => {
    event("quit", { code })
    resources("quit")
    ;[1000, 5000, 15000].forEach((ms) => setTimeout(() => resources(`after-quit-${ms}ms`), ms).unref())
  })
  await writeFile(`${file}.tmp`, JSON.stringify({ ...server, pid: process.pid, utilityPID: utility.pid, main, quit, token,
    packaged: app.isPackaged, resources: process.resourcesPath, versions: process.versions, userData: app.getPath("userData"),
    home: process.env.HOME, db: process.env.ORCHESTRA_DB, nonce: process.env.ORCHESTRA_DESKTOP_OMNI_SMOKE_NONCE,
    diagnostic: process.env.ORCHESTRA_DESKTOP_OMNI_DIAGNOSE_MAIN === "1" }), { mode: 0o600 })
  await rename(`${file}.tmp`, file)
}

async function firstLine([file, ...args]: string[]) {
  const child = DesktopOmni.spawn(file, args, { stdin: "closed" })
  const chunks: Buffer[] = []
  const line = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the smoke tree printed no line within 30 s")), 30_000)
    child.once("error", reject)
    child.once("exit", () => reject(new Error("the smoke tree exited")))
    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
      const text = Buffer.concat(chunks).toString("utf8")
      if (!text.includes("\n")) return
      clearTimeout(timer)
      resolve(text.slice(0, text.indexOf("\n")))
    })
  })
  return { pid: child.pid, line, bytes: chunks.every((chunk) => chunk instanceof Uint8Array), stop: async () => {
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()))
    if (!child.kill()) throw new Error("diagnostic main tree stop was not accepted")
    let timer: NodeJS.Timeout | undefined
    await Promise.race([closed, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("diagnostic main tree close exceeded 7000 ms")), 7000) })]).finally(() => clearTimeout(timer))
  } }
}
