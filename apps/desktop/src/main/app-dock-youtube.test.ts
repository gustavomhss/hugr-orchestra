import { spawn } from "node:child_process"
import { mkdir, mkdtemp, copyFile, rm, access, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

type Case = { id: string; status: "pass"; detail: string }
const required = ["Y01", "Y02", "Y03", "Y04"]
const scriptDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDir, "../..")
const desktopMain = resolve(root, "src/main")
const outMain = resolve(root, "out/main")
const artifact = join(process.env.APP_DOCK_ARTIFACT_ROOT ?? root, "artifacts/app-dock-youtube/s1.json")
const cases: Case[] = []

const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}
const pass = (id: string, detail: string) => cases.push({ id, status: "pass", detail })

const skipReason = (): string | null => {
  if (process.env.APP_DOCK_YOUTUBE !== "1") return "APP_DOCK_YOUTUBE != 1 (opt-in LLM test)"
  if (!process.env.ORCHESTRA_AUTH_CONTENT) return "ORCHESTRA_AUTH_CONTENT missing (provider auth)"
  if (!process.env.APP_DOCK_YOUTUBE_MODEL) return "APP_DOCK_YOUTUBE_MODEL missing (provider/model)"
  return null
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object"

const collect = (value: unknown, predicate: (node: Record<string, unknown>) => boolean, out: Record<string, unknown>[] = []) => {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, predicate, out)
    return out
  }
  if (isRecord(value)) {
    if (predicate(value)) out.push(value)
    for (const key of Object.keys(value)) collect(value[key], predicate, out)
  }
  return out
}

async function child() {
  const electron = await import("electron")
  const { app, BrowserWindow } = electron
  const { createAppDock } = await import("./app-dock")
  const { handleDockRPC, registerAppDockBridge, registerAppDockWindow } = await import("./app-dock-rpc")
  const { startDockChannel } = await import("./dock-channel")
  const { startOwnedServe } = await import("./owned-serve")
  const { resolveCliBinary } = await import("./background-cli")
  const { sidecarLaunchEnv } = await import("./server")
  if (!process.versions.electron) throw new Error("Electron child not started")
  app.commandLine.appendSwitch("ignore-certificate-errors")
  await app.whenReady()
  const userDataPath = await mkdtemp(join(tmpdir(), "app-dock-youtube-userdata-"))
  const rawModel = process.env.APP_DOCK_YOUTUBE_MODEL
  check(typeof rawModel === "string", "APP_DOCK_YOUTUBE_MODEL must be provider/model")
  const slash = rawModel.indexOf("/")
  check(slash > 0, "APP_DOCK_YOUTUBE_MODEL must be provider/model")
  const providerID = rawModel.slice(0, slash)
  const modelID = rawModel.slice(slash + 1)
  check(providerID.length > 0 && modelID.length > 0, "APP_DOCK_YOUTUBE_MODEL must be provider/model")
  Object.assign(process.env, {
    ORCHESTRA_CLIENT: "desktop",
    XDG_STATE_HOME: userDataPath,
    ORCHESTRA_EXPERIMENTAL_ICON_DISCOVERY: "true",
    ORCHESTRA_EXPERIMENTAL_FILEWATCHER: "true",
    ORCHESTRA_PERMISSION: "allow",
  })
  const doc = createAppDock({ developmentMode: () => false })
  registerAppDockBridge(doc)
  const win = new BrowserWindow({ width: 900, height: 700, show: true })
  win.show()
  registerAppDockWindow(win)
  // The V2 shape: main's Dock handlers sit behind the Dock channel, and the owned `orchestra serve` child dials it.
  const logger = { log: () => {}, error: (message: string) => console.error(`SERVE: ${message}`) }
  const dock = await startDockChannel({ onMessage: handleDockRPC })
  const owned = await Promise.all([resolveCliBinary(logger), sidecarLaunchEnv(userDataPath)]).then(([binary, env]) =>
    startOwnedServe({
      logger,
      command: [binary],
      env: { ...env, ...dock.env },
      cwd: userDataPath,
      write: (_stream, message) => console.error(`SERVE: ${message}`),
    }),
  )
  let outcome = 1
  try {
    await owned.health.wait
    const headers = {
      authorization: `Basic ${Buffer.from(`${owned.username}:${owned.password}`).toString("base64")}`,
      "content-type": "application/json",
    }
    const api = async (path: string, init: { method?: string; body?: unknown; timeout?: number } = {}) => {
      const response = await fetch(`${owned.url}/api/session${path}`, {
        method: init.method ?? "GET",
        headers,
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: AbortSignal.timeout(init.timeout ?? 30_000),
      })
      const text = await response.text()
      check(response.ok, `${init.method ?? "GET"} /api/session${path} failed with ${response.status}: ${text.slice(0, 300)}`)
      return text ? (JSON.parse(text) as unknown) : undefined
    }

    const created = await api("", { method: "POST", body: { location: { directory: userDataPath } } })
    check(isRecord(created) && isRecord(created.data) && typeof created.data.id === "string", "session create returned no id")
    const sessionID = created.data.id
    pass("Y01", "owned V2 serve created a live session")

    await api(`/${sessionID}/model`, { method: "POST", body: { model: { providerID, id: modelID, variant: process.env.APP_DOCK_YOUTUBE_VARIANT } } })
    pass("Y02", "live model selected on the session; dock_* tools are checked by the tool calls in Y03")

    const promptText =
      "Your first action MUST be a dock_open tool call. Never answer from memory. Use only the dock_open, dock_read and dock_click tools. Open https://www.youtube.com/results?search_query=orchestra, read the page, click the first video result, then reply with that video's title. Do nothing else. You control a live browser through tools and have no browsing knowledge after training: answering from memory is forbidden and scored as failure."
    await api(`/${sessionID}/prompt`, { method: "POST", body: { prompt: { text: promptText, files: [] } } })
    await api(`/${sessionID}/wait`, { method: "POST", timeout: 300_000 })

    const history = await api(`/${sessionID}/history?after=0&limit=1000`)
    console.error(`HISTORY-HEAD: ${JSON.stringify(history).slice(0, 1500)}`)
    const turnErrors = collect(history, (node) => typeof node.type === "string" && node.type.endsWith(".failed")).map((node) => JSON.stringify(node).slice(0, 300))
    const toolCalls = collect(history, (node) => node.type === "session.next.tool.called" && isRecord(node.data) && typeof node.data.tool === "string" && node.data.tool.startsWith("dock_"))
    const allTools = collect(history, (node) => node.type === "session.next.tool.called").map((node) => JSON.stringify(node.data).slice(0, 80))
    const modelTexts = collect(history, (node) => node.type === "session.next.text.ended" && isRecord(node.data) && typeof node.data.text === "string")
    const lastNode = modelTexts.length > 0 ? modelTexts[modelTexts.length - 1] : undefined
    const lastText = isRecord(lastNode?.data) && typeof lastNode.data.text === "string" ? lastNode.data.text : ""
    check(
      toolCalls.length > 0,
      `live model turn invoked no dock_* tools (calls: ${JSON.stringify(allTools.slice(0, 10))}; text: ${JSON.stringify(lastText.slice(0, 200))}; errors: ${JSON.stringify(turnErrors.slice(0, 2))})`,
    )
    pass("Y03", "live model invoked dock_* tools against YouTube")

    check(lastText.trim().length > 10, "live model turn produced no final text")
    pass("Y04", "live model reported back with text")

    outcome = cases.length === required.length && required.every((id) => cases.some((item: Case) => item.id === id)) ? 0 : 1
  } finally {
    const report = { version: 1, cases }
    await mkdir(dirname(artifact), { recursive: true })
    await writeFile(artifact, JSON.stringify(report, null, 2))
    await owned.listener.stop()
    await dock.close()
    win.destroy()
    app.exit(outcome)
  }
}

async function parent() {
  const skipped = skipReason()
  if (skipped) {
    await mkdir(dirname(artifact), { recursive: true })
    await writeFile(artifact, JSON.stringify({ version: 1, skipped: true, reason: skipped, cases: [] }, null, 2))
    console.log(`app-dock-youtube skipped: ${skipped}`)
    return
  }
  const buildDir = await mkdtemp(join(tmpdir(), "app-dock-youtube-e2e-"))
  try {
    const result = await Bun.build({
      entrypoints: [join(desktopMain, "app-dock-youtube.test.ts")],
      outdir: buildDir,
      naming: "app-dock-youtube.test.cjs",
      target: "node",
      format: "cjs",
      external: ["electron"],
      write: true,
    })
    check(result.success && result.outputs?.[0], "bundle failed")
    const built = result.outputs![0].path
    await access(built)
    await mkdir(outMain, { recursive: true })
    const hosted = join(outMain, "app-dock-youtube.test.cjs")
    await copyFile(built, hosted)
    const electronModule = createRequire(join(process.cwd(), "package.json")).resolve("electron")
    const electron = join(dirname(electronModule), "dist/Electron.app/Contents/MacOS/Electron")
    await access(electron)
    const env = {
      ...process.env,
      APP_DOCK_ARTIFACT_ROOT: root,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    }
    await rm(artifact, { force: true })
    const child = spawn(electron, [hosted, "--app-dock-youtube-child"], { stdio: ["ignore", "pipe", "pipe"], env })
    let stderr = ""
    child.stderr.on("data", (chunk) => { stderr += chunk })
    let timedOut = false
    const watchdog = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, 600_000)
    const exitResult = await new Promise<{ code: number | null }>((resolveProcess, reject) => {
      child.once("exit", (code) => resolveProcess({ code }))
      child.once("error", reject)
    })
    clearTimeout(watchdog)
    if (exitResult.code !== 0) throw new Error(`child failed (${exitResult.code})${timedOut ? " timed out" : ""}: ${stderr}`)
    const report = JSON.parse(await readFile(artifact, "utf8"))
    if (report.skipped === true) {
      console.log(`app-dock-youtube skipped: ${report.reason}`)
      return
    }
    check(
      report.version === 1 &&
        Array.isArray(report.cases) &&
        report.cases.length === required.length &&
        required.every((id) => report.cases.some((item: Case) => item.id === id && item.status === "pass")),
      "invalid app-dock-youtube artifact",
    )
  } finally {
    await rm(buildDir, { recursive: true, force: true })
    await rm(join(outMain, "app-dock-youtube.test.cjs"), { force: true })
  }
}

if (process.argv.includes("--app-dock-youtube-child"))
  void child().catch((error) => {
    console.error(error)
    process.exit(1)
  })
else
  void parent().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
