import { execFileSync, spawn } from "node:child_process"
import { mkdir, mkdtemp, rename, rm, writeFile, access, readFile } from "node:fs/promises"
import { createServer } from "node:https"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { createRequire } from "node:module"

const required = [
  "U01",
  "U02",
  "U03",
  "U04",
  "U05",
  "U06",
  "U07",
  "U08",
  "U09",
  "U10",
  "U11",
  "U12",
  "U13",
  "U14",
  "U15",
  "U16",
  "U17",
  "U18",
  "U19",
  "U20",
  "U21",
  "U22",
  "U23",
  "U24",
  "U25",
  "U26",
  "U27",
  "U28",
  "U29",
  "U30",
]
const root = resolve(import.meta.dir, "../..")
const artifact = join(process.env.APP_DOCK_ARTIFACT_ROOT ?? root, "artifacts/app-dock/s1.json")
const schemes = ["http://127.0.0.1/", "file:///etc/passwd", "javascript:document.title='pwned'", "data:text/html,pwned"]
const cacheableBody = `cacheable fixture${"x".repeat(1_000_000)}`
type Case = { id: string; status: "pass"; detail: string }
const cases: Case[] = []

const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}
const pass = (id: string, detail: string) => cases.push({ id, status: "pass", detail })
const rejects = async (fn: () => unknown | Promise<unknown>, text: string) => {
  try {
    await fn()
  } catch (error) {
    check(String(error).includes(text), `Expected ${text}, got ${error}`)
    return
  }
  throw new Error(`Expected rejection: ${text}`)
}

async function parent() {
  const startupOnly = process.env.APP_DOCK_STARTUP_ONLY === "1"
  const loadOnly = process.env.APP_DOCK_LOAD_ONLY === "1"
  const buildDir = await mkdtemp(join(tmpdir(), "app-dock-e2e-"))
  let output = ""
  if (!startupOnly) {
    const result = await Bun.build({
      entrypoints: [import.meta.path],
      outdir: buildDir,
      naming: "[name].cjs",
      target: "node",
      format: "cjs",
      external: ["electron", "node:sqlite"],
      write: true,
    })
    output = result.outputs[0]?.path ?? ""
    if (!result.success || !output)
      throw new Error(
        JSON.stringify({
          phase: "build-failure",
          output,
          outputs: result.outputs.map((item) => item.path),
          logs: result.logs.map(String),
        }),
      )
    try {
      await access(output)
    } catch {
      throw new Error(
        JSON.stringify({
          phase: "build-output-missing",
          output,
          outputs: result.outputs.map((item) => item.path),
          logs: result.logs.map(String),
        }),
      )
    }
  }
  const electronModule = createRequire(join(process.cwd(), "package.json")).resolve("electron")
  const electron = join(dirname(electronModule), "dist/Electron.app/Contents/MacOS/Electron")
  await access(electron)
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, NODE_OPTIONS, APP_DOCK_LOAD_ONLY: _loadOnly, ...env } = process.env
  const safeNodeOptions = NODE_OPTIONS?.includes("ELECTRON_RUN_AS_NODE") ? undefined : NODE_OPTIONS
  const entry = join(import.meta.dir, "app-dock-security.child.cjs")
  const restartEntry = join(import.meta.dir, "app-dock-security.restart.cjs")
  const restartStages: string[] = []
  if (!startupOnly && !loadOnly) {
    const restartUserData = await mkdtemp(join(tmpdir(), "app-dock-restart-user-data-"))
    const restartSite = await fixture()
    const runRestartStage = async (stage: string) => {
      const child = spawn(electron, [restartEntry, output, stage], {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...env,
          ...(safeNodeOptions ? { NODE_OPTIONS: safeNodeOptions } : {}),
          APP_DOCK_ARTIFACT_ROOT: root,
          APP_DOCK_RESTART_SITE: restartSite.base,
          APP_DOCK_RESTART_USER_DATA: restartUserData,
          ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        },
      })
      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (chunk) => {
        stdout += chunk
      })
      child.stderr.on("data", (chunk) => {
        stderr += chunk
      })
      const result = await new Promise<{ code: number | null }>((resolve, reject) => {
        child.once("exit", (code) => resolve({ code }))
        child.once("error", reject)
      })
      if (result.code !== 0 || !stdout.includes(`app-dock-restart:${stage}:pass`))
        throw new Error(JSON.stringify({ phase: "restart-stage-failure", stage, ...result, stdout, stderr }))
      restartStages.push(stage)
    }
    try {
      await runRestartStage("u23-write")
      await runRestartStage("u23-read")
      await runRestartStage("u24-delete")
      await runRestartStage("u24-read")
      const registryPath = join(restartUserData, "app-dock-profile-registry.json")
      const corruptRegistry = "{corrupt native registry"
      await writeFile(registryPath, corruptRegistry)
      await runRestartStage("u25-corrupt")
      check((await readFile(registryPath, "utf8")) === corruptRegistry, "corrupt registry was modified")
      await rm(restartUserData, { recursive: true, force: true })
      await mkdir(restartUserData)
      await runRestartStage("u26-write")
      await runRestartStage("u26-read")
    } finally {
      await restartSite.close()
      await rm(restartUserData, { recursive: true, force: true })
    }
    check(restartStages.length === 7, "restart acceptance stages incomplete")
  }
  await rm(artifact, { force: true })
  const child = spawn(
    electron,
    startupOnly ? [entry, "--startup-only"] : [entry, output, "--app-dock-electron-child"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...env,
        ...(safeNodeOptions ? { NODE_OPTIONS: safeNodeOptions } : {}),
        ...(loadOnly ? { APP_DOCK_LOAD_ONLY: "1" } : {}),
        APP_DOCK_RESTART_CASES: restartStages.join(","),
        APP_DOCK_ARTIFACT_ROOT: root,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      },
    },
  )
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => {
    stdout += chunk
  })
  child.stderr.on("data", (chunk) => {
    stderr += chunk
  })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill("SIGKILL")
  }, 180_000)
  const exitResult = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("exit", (code, signal) => resolve({ code, signal }))
    child.once("error", reject)
  })
  clearTimeout(timeout)
  if (!startupOnly && !loadOnly && exitResult.code === 0) {
    const reportPath = join(root, "artifacts/app-dock/s1.json")
    try {
      const report = JSON.parse(await readFile(reportPath, "utf8"))
      check(
        report.version === 1 &&
          typeof report.electronVersion === "string" &&
          Array.isArray(report.screenshots) &&
          report.screenshots.length > 0,
        "Invalid App Dock artifact schema",
      )
      check(
        Array.isArray(report.cases) &&
          report.cases.length === required.length &&
          new Set(report.cases.map((item: Case) => item.id)).size === required.length &&
          required.every((id) => report.cases.some((item: Case) => item.id === id && item.status === "pass")),
        "Invalid App Dock artifact cases",
      )
      await Promise.all(
        report.screenshots.map(async (screenshot: unknown) => {
          check(
            typeof screenshot === "string" && screenshot.length > 0 && isAbsolute(screenshot),
            "Invalid App Dock screenshot path",
          )
          check(resolve(screenshot).startsWith(`${root}/`), "App Dock screenshot escapes artifact root")
          const png = await readFile(screenshot)
          check(
            png.length > 8 && png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
            "Invalid App Dock screenshot PNG",
          )
        }),
      )
    } catch (error) {
      console.error(
        JSON.stringify({ phase: "parent-artifact-failure", reportPath, root, error: String(error), stderr }),
      )
      process.exitCode = 1
    }
  }
  await rm(buildDir, { recursive: true, force: true })
  if (startupOnly || loadOnly)
    console.error(
      JSON.stringify({ phase: "parent-startup", electron, executable: true, ...exitResult, stdout, stderr }),
    )
  if (exitResult.code !== 0 || timedOut) {
    console.error(
      JSON.stringify({
        phase: "parent-child-failure",
        electron,
        executable: true,
        timedOut,
        ...exitResult,
        stdout,
        stderr,
      }),
    )
    process.exitCode = exitResult.code ?? 1
  }
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "app-dock-https-"))
  const key = join(dir, "key.pem")
  const cert = join(dir, "cert.pem")
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-subj",
      "/CN=127.0.0.1",
      "-days",
      "1",
    ],
    { stdio: "ignore" },
  )
  const activeDownloads = new Set<ServerResponse>()
  let cacheableRequests = 0
  let downloadRequests = 0
  let cancelledDownloads = 0
  let resolveDownloadCancelled: () => void = () => {}
  const downloadCancelled = new Promise<void>((resolve) => {
    resolveDownloadCancelled = resolve
  })
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/redirect-http") {
      res.writeHead(302, { location: "http://127.0.0.1/redirect-blocked" })
      return res.end()
    }
    if (req.url === "/popup") return res.end("<script>window.open('http://127.0.0.1/popup-blocked')</script>")
    if (req.url === "/popup-https") return res.end("<script>window.open(`${location.origin}/popup-target`)</script>")
    if (req.url === "/popup-target")
      return res.end("<!doctype html><title>popup target</title><body>popup target</body>")
    if (req.url === "/navigate")
      return res.end("<a id=n href='http://127.0.0.1/navigate-blocked'>go</a><script>n.click()</script>")
    if (req.url === "/permission")
      return res.end(
        "<script>Promise.all([navigator.permissions.query({name:'microphone'}).then(result=>result.state),navigator.mediaDevices.getUserMedia({audio:true}).then(()=>'granted').catch(()=>'denied')]).then(([check,request])=>document.title=`check-${check}-request-${request}`)</script>",
      )
    if (req.url === "/cacheable") {
      cacheableRequests += 1
      res.writeHead(200, {
        "cache-control": "public, max-age=3600",
        "content-length": String(Buffer.byteLength(cacheableBody)),
        "content-type": "text/plain; charset=utf-8",
        etag: '"app-dock-cacheable"',
      })
      return res.end(cacheableBody)
    }
    if (req.url?.startsWith("/download")) {
      downloadRequests += 1
      res.writeHead(200, {
        "content-disposition": "attachment; filename=fixture-download.txt",
        "content-type": "text/plain",
      })
      activeDownloads.add(res)
      const interval = setInterval(() => res.write("fixture download data\n"), 10)
      return res.on("close", () => {
        clearInterval(interval)
        activeDownloads.delete(res)
        cancelledDownloads += 1
        resolveDownloadCancelled()
      })
    }
    if (req.url === "/ticker")
      return res.end(
        "<script>let tick=0;const started=performance.now();setInterval(()=>document.title=`tick-${++tick}-${Math.round(performance.now()-started)}`,25)</script>",
      )
    if (req.url === "/delayed") {
      res.writeHead(200, { "content-type": "text/html" })
      res.write("<script>setTimeout(() => document.title = 'delayed', 500)</script>")
      return setTimeout(() => res.end(), 750)
    }
    if (req.url === "/iframe") return res.end("<iframe src='/'>")
    res.end("<!doctype html><title>fixture</title><body>fixture</body>")
  }
  const tls = { key: await readFile(key), cert: await readFile(cert) }
  const servers = Array.from({ length: 9 }, () => createServer(tls, handler))
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))))
  const addresses = servers.map((server) => server.address())
  if (addresses.some((address) => !address || typeof address === "string"))
    throw new Error("HTTPS fixture did not bind")
  const ports = addresses.map((address) => (address as AddressInfo).port)
  return {
    base: `https://127.0.0.1:${ports[0]!}`,
    downloadURL: (index: number) => `https://127.0.0.1:${ports[index]!}/download?u28=${index}`,
    cacheableRequests: () => cacheableRequests,
    downloadRequests: () => downloadRequests,
    cancelledDownloads: () => cancelledDownloads,
    activeDownloadCount: () => activeDownloads.size,
    downloadCancelled,
    close: async () => {
      activeDownloads.forEach((response) => response.destroy())
      servers.forEach((server) => server.closeAllConnections())
      await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
      await rm(dir, { recursive: true, force: true })
    },
  }
}

async function child() {
  const diagnostic = (phase: string) =>
    process.stderr.write(
      `${JSON.stringify({ phase, argv: process.argv, electronVersion: process.versions.electron, pid: process.pid })}\n`,
    )
  process.on("uncaughtException", (error) => diagnostic(`uncaught:${error.message}`))
  diagnostic("entry")
  const startupWatchdog = setTimeout(() => {
    diagnostic("startup-timeout")
    process.exit(1)
  }, 15_000)
  diagnostic("before-import-electron")
  const { app, BrowserWindow, webContents } = await import("electron")
  diagnostic("after-import-electron")
  if (!process.versions.electron) throw new Error("Electron child not started")
  const restartStage = process.env.APP_DOCK_RESTART_STAGE
  if (restartStage) return restartChild(restartStage, app, BrowserWindow, webContents)
  if (!process.env.APP_DOCK_ARTIFACT_ROOT || !isAbsolute(process.env.APP_DOCK_ARTIFACT_ROOT))
    throw new Error("Invalid App Dock artifact root")
  const childArtifact = join(process.env.APP_DOCK_ARTIFACT_ROOT, "artifacts/app-dock/s1.json")
  const ipcModule = await import("./ipc")
  app.commandLine.appendSwitch("ignore-certificate-errors")
  diagnostic("before-whenReady")
  await app.whenReady()
  diagnostic("after-whenReady")
  clearTimeout(startupWatchdog)
  if (process.env.APP_DOCK_LOAD_ONLY === "1") {
    diagnostic("harness-entry")
    app.exit()
    return
  }
  const watchdog = setTimeout(() => {
    console.error("App Dock acceptance watchdog expired")
    app.exit(1)
  }, 150_000)
  const temp = await mkdtemp(join(tmpdir(), "app-dock-user-data-"))
  app.setPath("userData", temp)
  const site = await fixture()
  const { registerIpcHandlers } = ipcModule
  const { createAppDock } = await import("./app-dock")
  registerIpcHandlers({
    killSidecar() {},
    relaunch() {},
    awaitInitialization: async () => ({ serverUrl: site.base }),
    consumeInitialDeepLinks: () => [],
    getDefaultServerUrl: () => null,
    setDefaultServerUrl() {},
    isFirstLaunchOnboardingPending: () => false,
    finishFirstLaunchOnboarding: () => null,
    isOldLayoutEligible: () => false,
    getDisplayBackend: async () => null,
    setDisplayBackend: async () => {},
    checkAppExists: () => false,
    resolveAppPath: async () => null,
    updater: { subscribe: () => () => {}, check: async () => {}, install: async () => {} },
    showUpdater() {},
    setBackgroundColor() {},
    exportDebugLogs: async () => "",
    recordFatalRendererError() {},
    setNativeTranslations() {},
  })
  if (!process.env.APP_DOCK_TEST_PRELOAD || !isAbsolute(process.env.APP_DOCK_TEST_PRELOAD))
    throw new Error("Invalid App Dock test preload")
  const ipcWin = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      preload: process.env.APP_DOCK_TEST_PRELOAD,
    },
  })
  let ipcWinB: BrowserWindow | undefined
  const execute = async (phase: string, frame: { executeJavaScript: (code: string) => Promise<any> }, code: string) => {
    diagnostic(`renderer:${phase}:start`)
    try {
      const result = await frame.executeJavaScript(code)
      diagnostic(`renderer:${phase}:ok`)
      return result
    } catch (error) {
      diagnostic(`renderer:${phase}:error:${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }
  const invoke = (frame: { executeJavaScript: (code: string) => Promise<any> }, channel: string, args: unknown[]) =>
    execute(`ipc:${channel}`, frame, `window.__testIpcInvoke(${JSON.stringify(channel)}, ${JSON.stringify(args)})`)
  let events: any[] = []
  const installEventStore = () =>
    execute(
      "event-store",
      ipcWin.webContents,
      "window.__appDockEvents = []; window.onerror = (message, source, line, column, error) => console.error('app-dock-renderer-error', message, source, line, column, error?.stack); require('electron').ipcRenderer.on('app-dock-event', (_event, value) => window.__appDockEvents.push(value)); undefined",
    )
  const readEvents = async () => (events = await execute("event-read", ipcWin.webContents, "window.__appDockEvents"))
  const eventCount = async () => {
    await readEvents()
    return events.length
  }
  const attached = (win: BrowserWindow, contents: Electron.WebContents) =>
    (win.contentView as unknown as { children: { webContents?: Electron.WebContents }[] }).children.some(
      (child) => child.webContents === contents,
    )
  const attachedContents = (win: BrowserWindow) =>
    (win.contentView as unknown as { children: { webContents?: Electron.WebContents }[] }).children
      .map((child) => child.webContents)
      .find(Boolean)
  const waitFor = async (predicate: () => boolean | Promise<boolean>, label: string) => {
    const deadline = Date.now() + 5_000
    while (!(await predicate())) {
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`)
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
  }
  const waitEvent = (after: number, predicate: (event: any) => boolean, label: string) => {
    const deadline = Date.now() + 5_000
    return new Promise<any>((resolve, reject) => {
      const poll = async () => {
        await readEvents()
        const event = events.slice(after).find(predicate)
        if (event) return resolve(event)
        if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for ${label}`))
        setTimeout(poll, 25)
      }
      void poll()
    })
  }
  diagnostic("renderer:load:fixture:start")
  await ipcWin.loadURL(site.base)
  diagnostic("renderer:load:fixture:ok")
  await installEventStore()
  const profile = "e2e-profile"
  const bounds = { x: 0, y: 0, width: 400, height: 300 }
  const open = async (url = site.base, profileID = profile) =>
    invoke(ipcWin.webContents.mainFrame, "app-dock-open", [url, bounds, profileID])
  const navigate = (tabID: string, url: string) =>
    invoke(ipcWin.webContents.mainFrame, "app-dock-navigate", [tabID, url])
  const viewContents = () =>
    webContents
      .getAllWebContents()
      .filter((item) => item !== ipcWin.webContents && !item.isDestroyed())
      .at(-1)
  let completed = false
  try {
    const u01Start = await eventCount()
    await Promise.all(schemes.map((url) => rejects(() => open(url), "App Dock only supports HTTPS URLs")))
    await Promise.all(
      schemes.map((url) =>
        waitEvent(
          u01Start,
          (event) => event.type === "navigation-error" && event.payload.code === "blocked" && event.payload.url === url,
          `open block ${url}`,
        ),
      ),
    )
    pass("U01", "open rejects http/file/javascript/data")

    const tab = await open()
    const u02Start = await eventCount()
    await Promise.all(
      schemes.map((url) => rejects(() => navigate(tab.tabID, url), "App Dock only supports HTTPS URLs")),
    )
    await Promise.all(
      schemes.map((url) =>
        waitEvent(
          u02Start,
          (event) => event.type === "navigation-error" && event.payload.code === "blocked" && event.payload.url === url,
          `navigate block ${url}`,
        ),
      ),
    )
    pass("U02", "navigate rejects http/file/javascript/data")

    const u03Start = await eventCount()
    await navigate(tab.tabID, `${site.base}/popup`)
    await waitEvent(
      u03Start,
      (event) =>
        event.type === "navigation-error" &&
        event.payload.code === "blocked" &&
        event.payload.url === "http://127.0.0.1/popup-blocked",
      "popup block",
    )
    pass("U03", "real window.open blocked")

    const u04Start = await eventCount()
    await navigate(tab.tabID, `${site.base}/navigate`)
    await waitEvent(
      u04Start,
      (event) =>
        event.type === "navigation-error" &&
        event.payload.code === "blocked" &&
        event.payload.url === "http://127.0.0.1/navigate-blocked",
      "will-navigate block",
    )
    pass("U04", "real main-frame navigation blocked")

    const u05Start = await eventCount()
    await rejects(() => navigate(tab.tabID, `${site.base}/redirect-http`), "Navigation failed")
    await waitEvent(
      u05Start,
      (event) =>
        event.type === "navigation-error" &&
        event.payload.code === "blocked" &&
        event.payload.url === "http://127.0.0.1/redirect-blocked",
      "will-redirect block",
    )
    pass("U05", "real HTTPS redirect to HTTP blocked")

    const contents = viewContents()
    check(contents, "App Dock did not create WebContentsView")
    const preferences = contents.getLastWebPreferences()
    check(
      preferences.sandbox === true && preferences.contextIsolation === true && preferences.nodeIntegration === false,
      "unsafe App Dock webPreferences",
    )
    pass("U06", "real view has sandbox/contextIsolation/nodeIntegration policy")

    const u07Start = await eventCount()
    await navigate(tab.tabID, `${site.base}/permission`)
    await waitEvent(
      u07Start,
      (event) =>
        event.type === "state" &&
        event.payload.tabID === tab.tabID &&
        event.payload.title === "check-denied-request-denied",
      "permission request/check denial state",
    )
    pass("U07", "real permission request and permission check both deny")
    const permissionEvent = await waitEvent(
      u07Start,
      (event) =>
        event.type === "permission" &&
        event.payload.identity.tabID === tab.tabID &&
        /^[a-z-]{1,64}$/.test(event.payload.permission) &&
        event.payload.state === "denied",
      "permission denial UI state",
    )
    check(
      Object.keys(permissionEvent.payload).length === 3 && !JSON.stringify(permissionEvent).includes(temp),
      "permission event exposes sensitive data",
    )
    pass("U29", "permission denial emits cloneable App Dock UI state without storage data")

    await readEvents()
    const error = events.find((event) => event.type === "navigation-error")
    check(
      error?.type === "navigation-error" &&
        typeof error.payload.identity?.tabID === "string" &&
        Number.isSafeInteger(error.payload.identity?.generation) &&
        (error.payload.code === "blocked" || error.payload.code === "failed"),
      "navigation error envelope not discriminated",
    )
    check(
      !JSON.stringify(events).includes("storageKey") && !JSON.stringify(events).includes(temp),
      "renderer event exposes storage path/key",
    )
    pass("U08", "typed state/error envelopes omit storage internals")

    void navigate(tab.tabID, `${site.base}/delayed`).catch(() => {})
    await waitFor(() => contents.isLoading(), "delayed App Dock navigation")
    const u09CloseStart = await eventCount()
    await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tab", [tab.tabID])
    check(contents.isDestroyed(), "closed App Dock view remains alive")
    await new Promise<void>((resolve) => setTimeout(resolve, 750))
    check(
      !(await execute("event-read-after-close", ipcWin.webContents, "window.__appDockEvents"))
        .slice(u09CloseStart)
        .some((event: any) => event.payload?.tabID === tab.tabID && event.payload?.generation === tab.generation),
      "closed identity emitted stale event",
    )
    pass("U09", "close destroys delayed real view; no scheduled 500ms identity event after 750ms")

    const first = await open()
    const firstContents = viewContents()
    check(firstContents, "App Dock did not create profile view")
    await waitFor(
      async () =>
        (await execute(
          "view:ready",
          firstContents,
          "document.readyState === 'complete' && location.origin === " + JSON.stringify(site.base),
        )) === true,
      "App Dock cache fixture load",
    )
    await execute("view:storage-set", firstContents, "localStorage.setItem('app-dock-e2e', 'present')")
    const u10Start = await eventCount()
    await execute(
      "view:download-start",
      firstContents,
      "(() => { const link = document.createElement('a'); link.href = '/download'; document.body.append(link); link.click() })()",
    )
    const download = await waitEvent(
      u10Start,
      (event) =>
        event.type === "download" && event.payload.tabID === first.tabID && event.payload.state === "progressing",
      "real download",
    )
    await invoke(ipcWin.webContents.mainFrame, "app-dock-delete-profile", [{ profileID: profile }])
    check(firstContents.isDestroyed(), "profile delete did not detach/destroy view")
    check(!attached(ipcWin, firstContents), "deleted view remains attached")
    await site.downloadCancelled
    await rejects(
      () => invoke(ipcWin.webContents.mainFrame, "app-dock-cancel-download", [download.payload.id]),
      "Unknown App Dock download",
    )
    await rejects(() => open(site.base, profile), "App Dock profile is not active")
    const fresh = await open(site.base, "e2e-profile-fresh")
    const freshContents = viewContents()
    await waitFor(
      async () =>
        (await execute(
          "view:fresh-ready",
          freshContents,
          "document.readyState === 'complete' && location.origin === " + JSON.stringify(site.base),
        )) === true,
      "fresh App Dock storage fixture load",
    )
    check(
      (await execute("view:storage-get", freshContents, "localStorage.getItem('app-dock-e2e')")) === null,
      "fresh profile inherited deleted profile storage",
    )
    await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tab", [fresh.tabID])
    pass(
      "U10",
      "profile delete cancels/removes real download, tombstones old profile, and leaves fresh profile storage empty",
    )

    diagnostic("renderer:load:iframe:start")
    await ipcWin.loadURL(`${site.base}/iframe`)
    diagnostic("renderer:load:iframe:ok")
    await installEventStore()
    await rejects(
      () => invoke(ipcWin.webContents.mainFrame, "app-dock-open", [site.base, { x: 0, y: 0, width: 0, height: 1 }]),
      "Invalid App Dock bounds",
    )
    await rejects(
      () => invoke(ipcWin.webContents.mainFrame, "app-dock-open", [site.base, { x: 0, y: 0, width: "1", height: 1 }]),
      "Invalid App Dock bounds",
    )
    pass("U11", "malformed bounds rejected")

    const frame = ipcWin.webContents.mainFrame.frames.find((item) => item !== ipcWin.webContents.mainFrame)
    check(frame, "fixture did not create iframe")
    await rejects(
      () => invoke(frame, "app-dock-resize", [{ x: 0, y: 0, width: 1, height: 1 }]),
      "Invalid App Dock sender",
    )
    pass("U12", "subframe IPC sender rejected")

    const ipcTab = await invoke(ipcWin.webContents.mainFrame, "app-dock-open", [site.base, bounds, "ipc-profile"])
    await rejects(
      () => invoke(ipcWin.webContents.mainFrame, "app-dock-fullscreen", [ipcTab.tabID, "true"]),
      "Invalid App Dock fullscreen state",
    )
    pass("U13", "non-boolean IPC fullscreen state rejected")

    await rejects(
      () => invoke(ipcWin.webContents.mainFrame, "app-dock-command", [ipcTab.tabID, "history-back"]),
      "Invalid App Dock command",
    )
    pass("U15", "invalid IPC command enum rejected")
    const ticker = await open(`${site.base}/ticker`, "e2e-profile-fresh")
    const tickerContents = viewContents()
    check(attached(ipcWin, tickerContents), "open App Dock view is not attached")
    const tickerSample = async () => {
      const title = await execute("view:ticker-sample", tickerContents, "document.title")
      const match = /^tick-(\d+)-(\d+)$/.exec(title)
      if (!match) return
      return { count: Number(match[1]), elapsed: Number(match[2]), observed: performance.now() }
    }
    await waitFor(async () => (await tickerSample())?.count >= 2, "ticker startup")
    await invoke(ipcWin.webContents.mainFrame, "app-dock-hide", [])
    check(!attached(ipcWin, tickerContents), "hide leaves App Dock view attached")
    await new Promise<void>((resolve) => setTimeout(resolve, 1_200))
    const beforeHide = await tickerSample()
    if (!beforeHide) throw new Error("ticker disappeared after hide")
    await new Promise<void>((resolve) => setTimeout(resolve, 300))
    const hidden = await tickerSample()
    if (!hidden) throw new Error("ticker disappeared while hidden")
    check(
      hidden.count - beforeHide.count <= 1,
      `hidden ticker was not throttled: ${beforeHide.count} -> ${hidden.count}`,
    )
    await invoke(ipcWin.webContents.mainFrame, "app-dock-select", [ticker.tabID, bounds])
    check(attached(ipcWin, tickerContents), "select does not reattach hidden App Dock view")
    const resumedAt = performance.now()
    await waitFor(
      async () => (await tickerSample())?.count >= hidden.count + 3 && performance.now() - resumedAt <= 200,
      "unthrottled selected ticker",
    )
    const resumed = await tickerSample()
    if (!resumed) throw new Error("ticker disappeared after select")
    check(
      resumed.observed - resumedAt <= 200 && resumed.elapsed > hidden.elapsed,
      `selected ticker did not resume within 200ms: ${resumed.observed - resumedAt}ms`,
    )
    await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tab", [ticker.tabID])
    pass("U14", "hide throttles 25ms ticker to at most one tick in 300ms; select resumes three ticks within 200ms")
    check(
      !("storageKey" in ipcTab) && !Object.keys(ipcTab).some((key) => /path/i.test(key)),
      "open response exposes storage internals",
    )
    pass("U16", "IPC open response omits storage key and path")
    check(
      events.every(
        (event) =>
          event.type !== "state" ||
          (typeof event.payload.tabID === "string" && Number.isInteger(event.payload.generation)),
      ),
      "state event lacks generation identity",
    )
    pass("U17", "state events carry tabID and generation")
    check(site.base.startsWith("https://127.0.0.1:"), "fixture is not local HTTPS")
    pass("U18", "fixture is local HTTPS")

    ipcWinB = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false, preload: process.env.APP_DOCK_TEST_PRELOAD },
    })
    await ipcWinB.loadURL(site.base)
    const sharedProfile = "shared-profile"
    const sharedA = await open(site.base, sharedProfile)
    const sharedAContents = attachedContents(ipcWin)
    const sharedB = await invoke(ipcWinB.webContents.mainFrame, "app-dock-open", [site.base, bounds, sharedProfile])
    const sharedBContents = attachedContents(ipcWinB)
    check(
      !sharedAContents.isDestroyed() && !sharedBContents.isDestroyed(),
      "shared profile did not create both real views",
    )
    await invoke(ipcWin.webContents.mainFrame, "app-dock-delete-profile", [{ profileID: sharedProfile }])
    check(
      sharedAContents.isDestroyed() && sharedBContents.isDestroyed(),
      "profile delete did not destroy shared-profile views in both windows",
    )
    check(
      !attached(ipcWin, sharedAContents) && !attached(ipcWinB, sharedBContents),
      "profile delete leaves shared-profile view attached",
    )
    check(
      typeof sharedA.tabID === "string" && typeof sharedB.tabID === "string",
      "shared-profile IPC did not return tabs",
    )
    pass("U19", "real IPC from two BrowserWindows shares profile; delete from A removes both views")

    const closeA = await open(site.base, "close-tabs-profile")
    const closeAContents = viewContents()
    const closeTarget = await open(site.base, "close-tabs-profile")
    const closeTargetContents = viewContents()
    const closeC = await open(site.base, "close-tabs-profile")
    const closeCContents = viewContents()
    await rejects(
      () => invoke(ipcWin.webContents.mainFrame, "app-dock-close-tabs", [closeTarget.tabID, "invalid"]),
      "Invalid App Dock close scope",
    )
    await invoke(ipcWin.webContents.mainFrame, "app-dock-select", [closeTarget.tabID, bounds])
    await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tabs", [closeTarget.tabID, "others"])
    check(!closeTargetContents.isDestroyed(), "close-tabs others destroyed target")
    await rejects(
      () => invoke(ipcWin.webContents.mainFrame, "app-dock-select", [closeA.tabID, bounds]),
      "Unknown App Dock tab",
    )
    await rejects(
      () => invoke(ipcWin.webContents.mainFrame, "app-dock-select", [closeC.tabID, bounds]),
      "Unknown App Dock tab",
    )
    const rightA = await open(site.base, "close-tabs-right-profile")
    const rightAContents = viewContents()
    const rightTarget = await open(site.base, "close-tabs-right-profile")
    const rightTargetContents = viewContents()
    const rightC = await open(site.base, "close-tabs-right-profile")
    const rightCContents = viewContents()
    const rightD = await open(site.base, "close-tabs-right-profile")
    const rightDContents = viewContents()
    await invoke(ipcWin.webContents.mainFrame, "app-dock-select", [rightTarget.tabID, bounds])
    const visualOrder = [rightA.tabID, rightC.tabID, rightTarget.tabID, rightD.tabID]
    await rejects(
      () =>
        invoke(ipcWin.webContents.mainFrame, "app-dock-close-tabs", [rightTarget.tabID, "right", visualOrder.slice(1)]),
      "Invalid App Dock tab order",
    )
    await rejects(
      () =>
        invoke(ipcWin.webContents.mainFrame, "app-dock-close-tabs", [
          rightTarget.tabID,
          "right",
          [...visualOrder.slice(0, 3), "foreign-tab"],
        ]),
      "Invalid App Dock tab order",
    )
    await rejects(
      () =>
        invoke(ipcWin.webContents.mainFrame, "app-dock-close-tabs", [
          rightTarget.tabID,
          "right",
          [rightA.tabID, rightC.tabID, rightTarget.tabID, rightTarget.tabID],
        ]),
      "Invalid App Dock tab order",
    )
    await rejects(
      () => invoke(ipcWin.webContents.mainFrame, "app-dock-close-tabs", [rightTarget.tabID, "others", visualOrder]),
      "Invalid App Dock tab order",
    )
    await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tabs", [rightTarget.tabID, "right", visualOrder])
    await invoke(ipcWin.webContents.mainFrame, "app-dock-select", [rightTarget.tabID, bounds])
    await invoke(ipcWin.webContents.mainFrame, "app-dock-select", [rightA.tabID, bounds])
    await invoke(ipcWin.webContents.mainFrame, "app-dock-select", [rightC.tabID, bounds])
    await rejects(
      () => invoke(ipcWin.webContents.mainFrame, "app-dock-select", [rightD.tabID, bounds]),
      "Unknown App Dock tab",
    )
    diagnostic("u20:right-verified")
    pass("U20", "real close-tabs validates complete visual order; closes only visual-right tab")
    diagnostic("u20:passed")

    const u21Start = await eventCount()
    const popupSource = await open(`${site.base}/popup-https`, "popup-https-profile")
    const popupSourceContents = attachedContents(ipcWin)
    check(popupSourceContents && attached(ipcWin, popupSourceContents), "popup source view is not attached")
    await waitFor(
      async () =>
        (await execute(
          "view:popup-source-ready",
          popupSourceContents,
          "document.readyState === 'complete' && location.origin === " + JSON.stringify(site.base),
        )) === true,
      "popup source load",
    )
    const popupTarget = `${site.base}/popup-target`
    const popupOpened = await waitEvent(
      u21Start,
      (event) => event.type === "tab-opened" && event.payload.url === popupTarget,
      "HTTPS popup tab-opened",
    )
    check(
      Object.keys(popupOpened.payload).length === 3 &&
        typeof popupOpened.payload.tabID === "string" &&
        popupOpened.payload.tabID.length > 0 &&
        Number.isSafeInteger(popupOpened.payload.generation) &&
        popupOpened.payload.generation >= 1 &&
        popupOpened.payload.url === popupTarget &&
        !Object.keys(popupOpened.payload).some(
          (key) => key === "id" || key === "storageKey" || /path|adapter/i.test(key),
        ) &&
        JSON.stringify(structuredClone(popupOpened.payload)) === JSON.stringify(popupOpened.payload),
      "HTTPS popup event is not cloneable public tab identity",
    )
    const popupContents = attachedContents(ipcWin)
    check(popupContents && popupContents !== popupSourceContents, "HTTPS popup did not create second WebContentsView")
    await waitFor(
      async () => (await execute("view:popup-target-ready", popupContents, "location.href")) === popupTarget,
      "HTTPS popup target load",
    )
    check(attached(ipcWin, popupContents), "HTTPS popup view is not selected and attached")
    check(
      !popupSourceContents.isDestroyed() && !attached(ipcWin, popupSourceContents),
      "HTTPS popup source view is not hidden and detached",
    )
    pass("U21", "real HTTPS popup emits cloneable public tab identity and selects second WebContentsView")

    await invoke(ipcWin.webContents.mainFrame, "app-dock-hide", [])
    await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tab", [popupOpened.payload.tabID])
    await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tab", [popupSource.tabID])
    await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tab", [rightA.tabID])
    await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tab", [rightC.tabID])
    await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tab", [rightTarget.tabID])
    await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tab", [closeTarget.tabID])
    await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tab", [ipcTab.tabID])

    await readEvents()
    check(
      [tab, ipcTab, sharedA, sharedB, popupSource, popupOpened.payload].every(
        (opened) =>
          Object.keys(opened).length === 3 &&
          typeof opened.tabID === "string" &&
          opened.tabID.length > 0 &&
          Number.isSafeInteger(opened.generation) &&
          opened.generation >= 1 &&
          typeof opened.url === "string" &&
          !Object.keys(opened).some((key) => key === "id" || key === "storageKey" || /path|adapter/i.test(key)),
      ) &&
        events
          .filter((event) => event.type === "tab-opened")
          .every(
            (event) =>
              Object.keys(event.payload).length === 3 &&
              typeof event.payload.tabID === "string" &&
              event.payload.tabID.length > 0 &&
              Number.isSafeInteger(event.payload.generation) &&
              event.payload.generation >= 1 &&
              typeof event.payload.url === "string" &&
              !Object.keys(event.payload).some(
                (key) => key === "id" || key === "storageKey" || /path|adapter/i.test(key),
              ),
          ) &&
        events
          .filter((event) => event.type === "navigation-error")
          .every(
            (event) =>
              Object.keys(event.payload).length === 3 &&
              Object.keys(event.payload.identity).length === 2 &&
              typeof event.payload.identity.tabID === "string" &&
              event.payload.identity.tabID.length > 0 &&
              Number.isSafeInteger(event.payload.identity.generation) &&
              event.payload.identity.generation >= 1 &&
              !Object.keys(event.payload).some((key) => key === "id" || /adapter/i.test(key)),
          ) &&
        events.every((event) => !Object.keys(event).some((key) => key === "id" || /adapter/i.test(key))),
      "open/event contract exposes legacy id or adapter fields",
    )
    pass(
      "U22",
      "open and tab-opened contracts expose only tabID, generation, and URL; event envelopes omit legacy fields",
    )
    check(
      process.env.APP_DOCK_RESTART_CASES === "u23-write,u23-read,u24-delete,u24-read,u25-corrupt,u26-write,u26-read",
      "restart acceptance cases incomplete",
    )
    pass("U23", "fresh Electron main process preserves same profile localStorage and cookie")
    pass("U24", "deleted profile tombstone survives restart and blocks old partition access")
    pass("U25", "corrupt native registry fails closed without rebind and remains unchanged")
    pass("U26", "separate profiles retain isolated storage across fresh Electron main process")

    const crashed = await open(`${site.base}/ticker`, "crash-profile")
    const unaffected = await open(`${site.base}/ticker`, "unaffected-profile")
    const unaffectedContents = attachedContents(ipcWin)
    await invoke(ipcWin.webContents.mainFrame, "app-dock-select", [crashed.tabID, bounds])
    const crashedContents = attachedContents(ipcWin)
    check(crashedContents && unaffectedContents && crashedContents !== unaffectedContents, "U27 App Dock views missing")
    await execute("view:crash-storage-set", crashedContents, "localStorage.setItem('recovery', 'present')")
    const u27CrashStart = await eventCount()
    crashedContents.forcefullyCrashRenderer()
    const crash = await waitEvent(
      u27CrashStart,
      (event) =>
        event.type === "tab-crashed" &&
        event.payload.identity.tabID === crashed.tabID &&
        event.payload.identity.generation === crashed.generation,
      "real selected renderer crash",
    )
    check(crash.payload.reason === "crashed" || crash.payload.reason === "killed", "unexpected renderer crash reason")
    check(
      !unaffectedContents.isDestroyed() &&
        (await execute("view:unaffected-url", unaffectedContents, "location.href")) === `${site.base}/ticker`,
      "other App Dock tab changed after selected renderer crash",
    )
    const knownContents = new Set([crashedContents.id, unaffectedContents.id])
    const u27RecoverStart = await eventCount()
    const recovered = await invoke(ipcWin.webContents.mainFrame, "app-dock-recover-tab", [crashed.tabID])
    const recoveredEvent = await waitEvent(
      u27RecoverStart,
      (event) =>
        event.type === "tab-recovered" &&
        event.payload.tabID === crashed.tabID &&
        event.payload.generation === recovered.generation,
      "real crashed tab recovery",
    )
    let recoveredContents: Electron.WebContents | undefined
    await waitFor(() => {
      recoveredContents = webContents
        .getAllWebContents()
        .find((item) => item !== ipcWin.webContents && !item.isDestroyed() && !knownContents.has(item.id))
      return recoveredContents !== undefined
    }, "recovered App Dock WebContents")
    check(
      recovered.tabID === crashed.tabID &&
        recovered.generation > crashed.generation &&
        recovered.url === `${site.base}/ticker` &&
        recoveredEvent.payload.url === recovered.url,
      "recovery did not replace crashed tab identity with newer same-URL generation",
    )
    check(
      attached(ipcWin, recoveredContents) &&
        (await execute("view:recovered-url", recoveredContents, "location.href")) === `${site.base}/ticker` &&
        (await execute("view:recovered-storage", recoveredContents, "localStorage.getItem('recovery')")) === "present",
      "recovered selected tab is not usable with original profile",
    )
    await new Promise<void>((resolve) => setTimeout(resolve, 250))
    await readEvents()
    check(
      !events.slice(u27RecoverStart).some((event) => {
        const identity = event.payload?.identity ?? event.payload
        return identity?.tabID === crashed.tabID && identity?.generation === crashed.generation
      }),
      "old crashed generation emitted event after recovery",
    )
    check(!unaffectedContents.isDestroyed(), "other App Dock tab changed during recovery")
    await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tab", [recovered.tabID])
    await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tab", [unaffected.tabID])
    pass(
      "U27",
      "real selected renderer crash emits old identity; IPC recovery creates same tabID/URL/profile newer generation, selects usable view, preserves other tab, and ignores old generation events",
    )

    const u28Profile = "u28-capacity-profile"
    const u28TabsA = [] as { tabID: string }[]
    const u28TabsB = [] as { tabID: string }[]
    for (let index = 0; index < 11; index++)
      u28TabsA.push(await open(`${site.base}/ticker?capacity=a${index}`, u28Profile))
    for (let index = 0; index < 11; index++)
      u28TabsB.push(
        await invoke(ipcWinB.webContents.mainFrame, "app-dock-open", [
          `${site.base}/ticker?capacity=b${index}`,
          bounds,
          u28Profile,
        ]),
      )
    const u28ActiveB = attachedContents(ipcWinB)
    await invoke(ipcWin.webContents.mainFrame, "app-dock-select", [u28TabsA[0]!.tabID, bounds])
    const u28ActiveContents = attachedContents(ipcWin)
    check(u28ActiveContents && u28ActiveB, "U28 active App Dock views missing")
    await waitFor(
      async () =>
        (await execute("u28:active-a0", u28ActiveContents, "location.href")) === `${site.base}/ticker?capacity=a0` &&
        (await execute("u28:active-b10", u28ActiveB, "location.href")) === `${site.base}/ticker?capacity=b10`,
      "U28 active tab loads",
    )
    const u28Extra = await open(`${site.base}/ticker?capacity=extra`, u28Profile)
    const u28ExtraContents = attachedContents(ipcWin)
    check(u28ExtraContents, "U28 extra active App Dock view missing")
    await rejects(
      () => invoke(ipcWinB.webContents.mainFrame, "app-dock-select", [u28TabsB[0]!.tabID, bounds]),
      "Unknown App Dock tab",
    )
    check(
      attached(ipcWin, u28ExtraContents) &&
        (await execute("u28:active-extra", u28ExtraContents, "location.href")) ===
          `${site.base}/ticker?capacity=extra` &&
        attached(ipcWinB, u28ActiveB) &&
        !u28ActiveB.isDestroyed(),
      "U28 capacity eviction displaced an active view",
    )
    await invoke(ipcWin.webContents.mainFrame, "app-dock-select", [u28TabsA[0]!.tabID, bounds])
    await waitFor(
      async () =>
        (await execute("u28:retained-lru", attachedContents(ipcWin), "location.href")) ===
        `${site.base}/ticker?capacity=a0`,
      "U28 recently selected tab remains usable",
    )

    const u28DownloadStart = await eventCount()
    const u28CancelledStart = site.cancelledDownloads()
    const u28RequestsStart = site.downloadRequests()
    for (let index = 0; index < 8; index++) {
      await execute(
        `u28:parallel-download-${index}`,
        u28ActiveContents,
        `(() => { const link = document.createElement('a'); link.href = ${JSON.stringify(site.downloadURL(index))}; document.body.append(link); link.click() })()`,
      )
      await waitFor(
        async () => {
          await readEvents()
          return (
            new Set(
              events
                .slice(u28DownloadStart)
                .filter((event) => event.type === "download" && event.payload.state === "progressing")
                .map((event) => event.payload.id),
            ).size >=
            index + 1
          )
        },
        `U28 accepted profile download ${index + 1}`,
      )
    }
    check(
      site.downloadRequests() === u28RequestsStart + 8,
      `U28 started ${site.downloadRequests() - u28RequestsStart} profile downloads, expected 8`,
    )
    await execute(
      "u28:ninth-download",
      u28ActiveContents,
      `(() => { const link = document.createElement('a'); link.href = ${JSON.stringify(site.downloadURL(8))}; document.body.append(link); link.click() })()`,
    )
    await waitFor(() => site.downloadRequests() === u28RequestsStart + 9, "U28 ninth profile download request")
    await waitFor(() => site.cancelledDownloads() > u28CancelledStart, "U28 refused ninth profile download")
    await readEvents()
    const u28Events = events.slice(u28DownloadStart)
    const u28Progressing = new Map(
      u28Events
        .filter((event) => event.type === "download" && event.payload.state === "progressing")
        .map((event) => [event.payload.id, event]),
    )
    check(u28Progressing.size === 8, `U28 accepted ${u28Progressing.size} progressing downloads, expected 8`)
    check(
      u28Events.some((event) => event.type === "navigation-error" && event.payload.code === "failed"),
      "U28 refused download did not emit failure event",
    )
    await Promise.all(
      [...u28Progressing.values()].map((event) =>
        invoke(ipcWin.webContents.mainFrame, "app-dock-cancel-download", [event.payload.id]),
      ),
    )
    await readEvents()
    const u28FinalEvents = events.slice(u28DownloadStart)
    check(
      !JSON.stringify(u28FinalEvents).includes(temp) &&
        !u28FinalEvents.some((event) => Object.keys(event.payload ?? {}).some((key) => /path|save/i.test(key))),
      "U28 download event exposes filesystem path",
    )
    for (const tab of [...u28TabsA, u28Extra])
      await invoke(ipcWin.webContents.mainFrame, "app-dock-close-tab", [tab.tabID])
    for (const tab of u28TabsB.slice(1)) await invoke(ipcWinB.webContents.mainFrame, "app-dock-close-tab", [tab.tabID])
    pass(
      "U28",
      "20 inactive views across two windows use global LRU: selecting A0 retains it while opening one more evicts older B0; active views remain usable; nine real same-profile slow downloads admit eight, cancel safely, and expose no filesystem path",
    )

    const devDock = createAppDock({ developmentMode: () => true })
    const devProfile = { storageKey: "12345678-1234-4123-8123-123456789abc" }
    const devTab = await devDock.open(ipcWin.webContents.id, ipcWin, site.base, bounds, () => {}, devProfile)
    const devContents = attachedContents(ipcWin)
    check(devContents && !devContents.isDevToolsOpened(), "App Dock DevTools opened without trusted route")
    devContents.sendInputEvent({ type: "keyDown", keyCode: "F12" })
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
    check(!devContents.isDevToolsOpened(), "ordinary App Dock user input opened DevTools")
    await rejects(
      () => invoke(ipcWin.webContents.mainFrame, "app-dock-open-devtools", [devTab.tabID]),
      "No handler registered",
    )
    devDock.openDevTools(ipcWin.webContents.id, devTab.tabID)
    await waitFor(() => devContents.isDevToolsOpened(), "trusted development DevTools route")
    devContents.closeDevTools()
    devDock.close(ipcWin.webContents.id)
    const productionDock = createAppDock({ developmentMode: () => false })
    const productionTab = await productionDock.open(ipcWin.webContents.id, ipcWin, site.base, bounds, () => {}, {
      storageKey: "abcdef12-1234-4123-8123-123456789abc",
    })
    await rejects(
      () => productionDock.openDevTools(ipcWin.webContents.id, productionTab.tabID),
      "App Dock DevTools are disabled in production",
    )
    productionDock.close(ipcWin.webContents.id)
    pass(
      "U30",
      "renderer, content, and ordinary input cannot open DevTools; trusted development main route can; production refuses",
    )

    check(
      cases.length === required.length &&
        new Set(cases.map((item) => item.id)).size === required.length &&
        required.every((id) => cases.some((item) => item.id === id && item.status === "pass")),
      "required acceptance cases incomplete",
    )
    diagnostic("artifact:validated-cases")
    diagnostic(`artifact:${childArtifact}`)
    await mkdir(dirname(childArtifact), { recursive: true })
    const screenshot = join(dirname(childArtifact), "s1-main.png")
    await writeFile(screenshot, (await ipcWin.capturePage()).toPNG())
    const payload = JSON.stringify(
      { version: 1, electronVersion: process.versions.electron, cases, screenshots: [screenshot] },
      null,
      2,
    )
    const temporary = `${childArtifact}.${process.pid}.tmp`
    await writeFile(temporary, payload)
    await rename(temporary, childArtifact)
    completed = true
  } finally {
    clearTimeout(watchdog)
    if (ipcWinB && !ipcWinB.isDestroyed()) ipcWinB.destroy()
    if (!ipcWin.isDestroyed()) ipcWin.destroy()
    await site.close()
    await new Promise<void>((resolve) => setTimeout(resolve, 250))
    await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    process.exit(completed ? 0 : 1)
  }
}

async function restartChild(
  stage: string,
  app: Electron.App,
  BrowserWindow: typeof Electron.BrowserWindow,
  webContents: typeof Electron.webContents,
) {
  const userData = process.env.APP_DOCK_RESTART_USER_DATA
  const site = process.env.APP_DOCK_RESTART_SITE
  if (!userData || !isAbsolute(userData) || !site?.startsWith("https://")) throw new Error("Invalid restart fixture")
  const { registerIpcHandlers } = await import("./ipc")
  app.commandLine.appendSwitch("ignore-certificate-errors")
  await app.whenReady()
  try {
    registerIpcHandlers({
      killSidecar() {},
      relaunch() {},
      awaitInitialization: async () => ({ serverUrl: site }),
      consumeInitialDeepLinks: () => [],
      getDefaultServerUrl: () => null,
      setDefaultServerUrl() {},
      isFirstLaunchOnboardingPending: () => false,
      finishFirstLaunchOnboarding: () => null,
      isOldLayoutEligible: () => false,
      getDisplayBackend: async () => null,
      setDisplayBackend: async () => {},
      checkAppExists: () => false,
      resolveAppPath: async () => null,
      updater: { subscribe: () => () => {}, check: async () => {}, install: async () => {} },
      showUpdater() {},
      setBackgroundColor() {},
      exportDebugLogs: async () => "",
      recordFatalRendererError() {},
      setNativeTranslations() {},
    })
  } catch (error) {
    if (stage !== "u25-corrupt" || !String(error).includes("Invalid App Dock profile registry")) throw error
    console.log(`app-dock-restart:${stage}:pass`)
    app.exit(0)
    return
  }
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, preload: process.env.APP_DOCK_TEST_PRELOAD },
  })
  const invoke = (channel: string, args: unknown[]) =>
    win.webContents.executeJavaScript(
      `require('electron').ipcRenderer.invoke(${JSON.stringify(channel)}, ...${JSON.stringify(args)})`,
    )
  const bounds = { x: 0, y: 0, width: 400, height: 300 }
  const open = (profileID: string) => {
    check(typeof site === "string", "Invalid restart App Dock address")
    return invoke("app-dock-open", [site, bounds, profileID])
  }
  const view = () =>
    webContents
      .getAllWebContents()
      .filter((item) => item !== win.webContents && !item.isDestroyed())
      .at(-1)
  const waitForView = async (excluded: number[] = []) => {
    const deadline = Date.now() + 5_000
    const current = () =>
      webContents
        .getAllWebContents()
        .filter((item) => item !== win.webContents && !item.isDestroyed() && !excluded.includes(item.id))
        .at(-1)
    while (!current()) {
      if (Date.now() > deadline) throw new Error("App Dock restart view missing")
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    return current()!
  }
  let completed = false
  try {
    await win.loadURL(site)
    if (stage === "u23-write") {
      await open("restart-profile")
      const contents = await waitForView()
      await contents.executeJavaScript(
        "localStorage.setItem('restart-local', 'present'); document.cookie = 'restart-cookie=present; max-age=3600; path=/'",
      )
      await contents.session.flushStorageData()
      await contents.session.cookies.flushStore()
    } else if (stage === "u23-read") {
      await open("restart-profile")
      const contents = await waitForView()
      const storage = await contents.executeJavaScript(
        "({ local: localStorage.getItem('restart-local'), cookie: document.cookie })",
      )
      check(
        storage.local === "present" && storage.cookie.includes("restart-cookie=present"),
        `profile storage did not survive main-process restart: ${JSON.stringify(storage)}`,
      )
    } else if (stage === "u24-delete") {
      await open("tombstone-profile")
      await invoke("app-dock-delete-profile", [{ profileID: "tombstone-profile" }])
    } else if (stage === "u24-read") {
      await rejects(() => open("tombstone-profile"), "App Dock profile is not active")
      check(!view(), "deleted profile accessed old partition")
    } else if (stage === "u25-corrupt") {
      await rejects(() => open("corrupt-profile"), "Invalid App Dock profile registry")
      check(!view(), "corrupt registry rebound profile partition")
    } else if (stage === "u26-write") {
      await open("isolation-alpha")
      const alpha = await waitForView()
      await alpha.executeJavaScript("localStorage.setItem('isolation', 'alpha')")
      await alpha.session.flushStorageData()
      await open("isolation-beta")
      const beta = await waitForView([alpha.id])
      await beta.executeJavaScript("localStorage.setItem('isolation', 'beta')")
      await beta.session.flushStorageData()
    } else if (stage === "u26-read") {
      await open("isolation-alpha")
      const alpha = await waitForView()
      check((await alpha.executeJavaScript("localStorage.getItem('isolation')")) === "alpha", "alpha storage changed")
      await open("isolation-beta")
      const beta = await waitForView([alpha.id])
      check((await beta.executeJavaScript("localStorage.getItem('isolation')")) === "beta", "beta storage changed")
    } else throw new Error(`Unknown restart stage: ${stage}`)
    completed = true
    console.log(`app-dock-restart:${stage}:pass`)
  } catch (error) {
    console.error(`app-dock-restart:${stage}:failure`, error)
    throw error
  } finally {
    if (!win.isDestroyed()) win.destroy()
    await new Promise<void>((resolve) => setTimeout(resolve, 250))
    app.exit(completed ? 0 : 1)
  }
}

if (process.argv.includes("--app-dock-electron-child"))
  void child().catch(async (error) => {
    console.error(error)
    process.exit(1)
  })
else
  void parent().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
