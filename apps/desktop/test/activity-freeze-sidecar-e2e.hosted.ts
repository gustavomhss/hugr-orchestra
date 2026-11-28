import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"
import { setTimeout as delay } from "node:timers/promises"

type FixtureReport = {
  controlPort: number
  selected: { file: string; recordID: string; pid: number; member: string }
  sibling: { file: string; recordID: string; pid: number }
  uid?: number
  inheritedOmniVariables: string[]
}

const desktopRoot = process.cwd()
const source = join(desktopRoot, "test/activity-freeze-sidecar-e2e.hosted.ts")
const fixtureCLI = join(desktopRoot, "test/activity-freeze-sidecar-cli.fixture.ts")

function requireHostedEnvironment() {
  const required = ["ORCHESTRA_ACTIVITY_SIDECAR_CI", "HUGR_OMNI_ADDON", "HUGR_OMNI_SUPERVISOR", "ORCHESTRA_ACTIVITY_SIDECAR_WORKLOAD_UID"]
  const missing = required.filter((key) => !process.env[key])
  if (process.platform !== "linux" || missing.length || process.env.ORCHESTRA_ACTIVITY_SIDECAR_CI !== "1" || process.env.CI !== "true" ||
    process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER !== "strict" || process.getuid?.() === 0)
    throw new Error(`Linux sidecar qualification requires the hosted non-root runner, strict Omni, Xvfb, and native runtime; missing=${missing.join(",")}`)
  if (!Bun.which("xdotool"))
    throw new Error("Linux sidecar qualification requires xdotool for real native confirmation controls")
}

async function parent() {
  requireHostedEnvironment()
  const root = await mkdtemp(join(tmpdir(), "activity-freeze-sidecar-"))
  const build = join(root, "build")
  await mkdir(build)
  try {
    const electron = createRequire(join(desktopRoot, "package.json")).resolve("electron")
    const preload = await Bun.build({
      entrypoints: [join(desktopRoot, "src/preload/index.ts")], outdir: build,
      naming: "activity-freeze-preload.cjs", target: "node", format: "cjs", external: ["electron"],
    })
    if (!preload.success || !preload.outputs[0]) throw new Error(`production preload bundle failed: ${preload.logs.map((log) => log.message).join("\n")}`)
    const hosted = await Bun.build({
      entrypoints: [source], outdir: build, naming: "activity-freeze-sidecar-e2e.cjs",
      target: "node", format: "cjs", external: ["electron"],
    })
    if (!hosted.success || !hosted.outputs[0]) throw new Error(`Electron fixture bundle failed: ${hosted.logs.map((log) => log.message).join("\n")}`)
    const electronPath = join(dirname(electron), "dist/electron")
    const bunPath = Bun.which("bun")
    if (!bunPath) throw new Error("Bun executable was not found on hosted PATH")
    const reportPath = join(root, "sidecar-report.json")
    const child = Bun.spawn([electronPath, hosted.outputs[0]!.path, "--activity-freeze-sidecar-e2e-child"], {
      stdout: "pipe", stderr: "pipe",
      env: {
        ...process.env,
        ORCHESTRA_ACTIVITY_E2E_ROOT: root,
        ORCHESTRA_ACTIVITY_E2E_REPORT: reportPath,
        ORCHESTRA_ACTIVITY_E2E_PRELOAD: preload.outputs[0]!.path,
        ORCHESTRA_ACTIVITY_E2E_FIXTURE_CLI: fixtureCLI,
        ORCHESTRA_ACTIVITY_E2E_BUN: bunPath,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      },
    })
    const stdout = new Response(child.stdout).text()
    const stderr = new Response(child.stderr).text()
    let dialogsDone = false
    const dialogs = handleNativeDialogs(() => dialogsDone, join(root, "dialog-request.json"))
    const timer = setTimeout(() => child.kill("SIGKILL"), 165_000)
    const status = await child.exited
    clearTimeout(timer)
    dialogsDone = true
    await dialogs
    if (status !== 0)
      throw new Error(`Electron sidecar fixture failed (${status}):\n${await stderr}\n${await stdout}`)
    const result = JSON.parse(await readFile(reportPath, "utf8")) as { status: string; selected: unknown; sibling: unknown; sameMark: boolean }
    assert.equal(result.status, "pass", JSON.stringify(result))
    assert.ok(result.selected)
    assert.ok(result.sibling)
    assert.equal(result.sameMark, true)
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function child() {
  const { app, BrowserWindow, dialog, ipcMain } = await import("electron")
  const { registerActivityArmIpc } = await import("../src/main/activity-arm-ipc")
  const { startOwnedServe } = await import("../src/main/owned-serve")
  assert.ok(process.versions.electron, "this proof must run in the real Electron main process")
  assert.equal(process.platform, "linux")
  assert.notEqual(process.getuid?.(), 0, "the desktop and sidecar run as the unprivileged fixture user")

  const root = process.env.ORCHESTRA_ACTIVITY_E2E_ROOT!
  const reportPath = process.env.ORCHESTRA_ACTIVITY_E2E_REPORT!
  const preload = process.env.ORCHESTRA_ACTIVITY_E2E_PRELOAD!
  const fixtureCLI = process.env.ORCHESTRA_ACTIVITY_E2E_FIXTURE_CLI!
  const bun = process.env.ORCHESTRA_ACTIVITY_E2E_BUN!
  const fixtureEnv = {
    PATH: process.env.PATH ?? "",
    HOME: join(root, "home"),
    USERPROFILE: join(root, "home"),
    TMPDIR: root,
    TMP: root,
    TEMP: root,
    ORCHESTRA_DB: join(root, "activity.sqlite"),
    ORCHESTRA_CONFIG_DIR: join(root, "config"),
    ORCHESTRA_ACTIVITY_E2E_REPORT: reportPath,
    ORCHESTRA_ACTIVITY_ISOLATED_EXECUTABLES: JSON.stringify(["/usr/bin/cat"]),
    ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strict",
    ORCHESTRA_DISABLE_MODELS_FETCH: "1",
    ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
    ORCHESTRA_INHERIT_CREDENTIALS: "0",
  }
  await Promise.all([mkdir(fixtureEnv.HOME), mkdir(fixtureEnv.ORCHESTRA_CONFIG_DIR), mkdir(join(root, "electron-user-data"))])
  app.setPath("userData", join(root, "electron-user-data"))
  app.commandLine.appendSwitch("disable-gpu")
  await app.whenReady()

  const page = createServer((_request, response) => response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html>
    <meta charset="utf-8"><title>Activity freeze IPC fixture</title>
    <button id="read">Read member</button><button id="freeze">Freeze member</button>
    <script>
      window.fixtureRead = (recordID) => window.api.readActivityFreeze(window.fixtureServer, { recordID });
      window.fixtureFreeze = (recordID, action) => window.api.freezeActivityMember(window.fixtureServer, { recordID, action });
      window.fixtureServer = "";
    </script>`))
  await new Promise<void>((resolvePage, rejectPage) => {
    page.once("error", rejectPage)
    page.listen(0, "127.0.0.1", resolvePage)
  })
  const address = page.address()
  if (!address || typeof address === "string") throw new Error("renderer fixture listener failed")
  const rendererURL = `http://127.0.0.1:${address.port}`

  const log: string[] = []
  const owned = await startOwnedServe({
    logger: { log: (message, meta) => log.push(`${message} ${JSON.stringify(meta ?? {})}`), error: (message, meta) => log.push(`${message} ${JSON.stringify(meta ?? {})}`) },
    command: [bun, fixtureCLI],
    env: fixtureEnv,
    cwd: "/tmp",
    privateActivityApproval: true,
    write: (_stream, message) => log.push(message),
  })
  let window: InstanceType<typeof BrowserWindow> | undefined
  let dialogStep = 0
  const invokeFreeze = async (recordID: string, action: "suspend" | "resume", button: "default" | "confirm") => {
    dialogStep++
    await writeFile(join(root, "dialog-request.json"), JSON.stringify({
      step: dialogStep,
      title: action === "suspend" ? "Suspend activity member" : "Resume activity member",
      button,
    }))
    return window!.webContents.executeJavaScript(`window.fixtureFreeze(${JSON.stringify(recordID)}, ${JSON.stringify(action)})`)
  }
  try {
    await owned.health.wait
    assert.equal(await owned.probeActivityApproval(), true, "private activity channel must verify its signed stdin challenge")
    registerActivityArmIpc({ ipcMain, BrowserWindow, dialog, rendererDevURL: rendererURL, getOwned: () => owned })
    window = new BrowserWindow({
      width: 800,
      height: 600,
      show: true,
      webPreferences: { preload, sandbox: true, nodeIntegration: false, contextIsolation: true },
    })
    await window.loadURL(rendererURL)
    await window.webContents.executeJavaScript(`window.fixtureServer = ${JSON.stringify(owned.url)}; true`)
    assert.equal(await window.webContents.executeJavaScript("typeof window.api.freezeActivityMember"), "function")

    const report = await waitFor<FixtureReport>(async () => {
      try { return JSON.parse(await readFile(reportPath, "utf8")) as FixtureReport } catch { return undefined }
    }, "fixture process report")
    assert.equal(report.uid, process.getuid?.(), "sidecar must keep the desktop user's non-root identity")
    assert.deepEqual(report.inheritedOmniVariables, [], "Omni socket/runtime secrets must not reach the sidecar's child environment")
    const snapshot = await waitFor(async () => {
      const response = await fetch(`${owned.url}/api/activity`, {
        headers: { authorization: `Basic ${Buffer.from(`${owned.username}:${owned.password}`).toString("base64")}` },
      })
      if (!response.ok) return undefined
      const value = await response.json() as { records?: Array<{ recordID: string; pid: number; owner: string }> }
      return value.records?.some((record) => record.recordID === report.selected.recordID) ? value : undefined
    }, "production activity snapshot registration")
    const selectedRecord = snapshot.records!.find((record) => record.recordID === report.selected.recordID)!
    assert.equal(selectedRecord.pid, report.selected.pid)
    assert.equal(selectedRecord.owner, "activity-freeze-sidecar-fixture")

    const selectedIdentity = await readMemberIdentity(report.selected.pid)
    assert.equal(selectedIdentity.startTime, report.selected.member.split(":")[1])
    assert.equal(selectedIdentity.uid, Number(process.env.ORCHESTRA_ACTIVITY_SIDECAR_WORKLOAD_UID))
    const siblingIdentity = await readMemberIdentity(report.sibling.pid)
    assert.equal(siblingIdentity.uid, process.getuid?.(), "unlisted sibling must retain the sidecar runner uid")
    const siblingRead = await window.webContents.executeJavaScript(`window.fixtureRead(${JSON.stringify(report.sibling.recordID)})`)
    assert.equal(siblingRead, undefined, "unlisted /bin/cat sibling must not receive a freeze control")

    const { DatabaseSync } = await import("node:sqlite")
    const journal = () => {
      const database = new DatabaseSync(fixtureEnv.ORCHESTRA_DB, { readOnly: true })
      try {
        return database.prepare("SELECT mark_id, phase FROM activity_suspension_ledger WHERE tree_id = ?")
          .get(report.selected.recordID)
      } finally {
        database.close()
      }
    }
    const selectedBefore = await control(report.controlPort, "selected", "before-freeze\n")
    assert.equal(selectedBefore.result, "before-freeze\n", "selected sidecar child made progress before freeze")
    const stateBefore = await window.webContents.executeJavaScript(`window.fixtureRead(${JSON.stringify(report.selected.recordID)})`)
    assert.equal(stateBefore?.next, "suspend")

    const cancelled = invokeFreeze(report.selected.recordID, "suspend", "default")
    assert.equal(await cancelled, undefined, "default native button must cancel without an effect")
    assert.equal(journal(), undefined, "cancelling must leave no suspension mark")
    assert.notEqual((await readMemberIdentity(report.selected.pid)).state, "T", "default cancel must leave the selected process running")
    const afterCancel = await control(report.controlPort, "selected", "after-cancel\n")
    assert.equal(afterCancel.result, "after-cancel\n", "default cancel must leave member progress intact")
    assert.equal((await window.webContents.executeJavaScript(`window.fixtureRead(${JSON.stringify(report.selected.recordID)})`))?.next, "suspend")

    const pending = invokeFreeze(report.selected.recordID, "suspend", "confirm")
    const suspended = await pending
    assert.equal(suspended?.action, "suspend")
    assert.equal(suspended?.phase, "suspended")
    assert.ok(suspended?.markID)
    const savedSuspension = journal()
    assert.equal(savedSuspension?.mark_id, suspended.markID)
    assert.equal(savedSuspension?.phase, "suspended")
    const blocked = await control(report.controlPort, "selected", "while-suspended\n")
    assert.equal(blocked.timeout, true, "selected process must stop making stdin/stdout progress while suspended")
    const siblingProgress = await control(report.controlPort, "sibling", "sibling-progress\n")
    assert.equal(siblingProgress.result, "sibling-progress\n", "unselected sibling must remain responsive while selected member is stopped")

    const resuming = invokeFreeze(report.selected.recordID, "resume", "confirm")
    const resumed = await resuming
    assert.equal(resumed?.action, "resume")
    assert.equal(resumed?.phase, "resumed")
    assert.equal(resumed?.markID, suspended.markID, "resume must settle the same suspension mark")
    const savedResume = journal()
    assert.equal(savedResume?.mark_id, suspended.markID)
    assert.equal(savedResume?.phase, "resumed")
    const buffered = await control(report.controlPort, "selected", "")
    assert.equal(buffered.result, "while-suspended\n", "buffered input must progress after same-mark resume")
    const selectedAfter = await control(report.controlPort, "selected", "after-resume\n")
    assert.equal(selectedAfter.result, "after-resume\n", "selected process must make progress after same-mark resume")

    const result = {
      status: "pass",
      selected: { member: report.selected, identity: selectedIdentity, suspended: suspended.phase, resumed: resumed.phase },
      sibling: { member: report.sibling, identity: siblingIdentity, responsiveWhileSelectedStopped: true },
      sameMark: suspended.markID === resumed.markID,
      defaultCancelNoop: true,
      signedPrivateChannel: true,
      durableJournal: true,
      desktopUID: process.getuid?.(),
      sidecarUID: report.uid,
    }
    await writeFile(reportPath, JSON.stringify(result))
    if (log.join("\n").includes(owned.password)) throw new Error("owned-sidecar credential entered desktop diagnostics")
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } finally {
    window?.destroy()
    page.close()
    await owned.listener.stop()
    app.quit()
  }
}

async function control(port: number, name: string, text: string) {
  const response = await fetch(`http://127.0.0.1:${port}/${name}`, { method: "POST", body: text })
  assert.equal(response.status, 200)
  return await response.json() as { result?: string; timeout?: true }
}

async function readMemberIdentity(pid: number) {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8")
  const close = stat.lastIndexOf(")")
  const fields = stat.slice(close + 2).split(" ")
  const state = fields[0]
  const startTime = fields[19]
  const status = await readFile(`/proc/${pid}/status`, "utf8")
  const uid = Number(/^Uid:\s+(\d+)/m.exec(status)?.[1])
  assert.ok(state)
  assert.ok(startTime)
  return { pid, state, startTime, uid }
}

async function handleNativeDialogs(stopping: () => boolean, requestPath: string) {
  let handledStep = 0
  while (!stopping()) {
    const request = await readFile(requestPath, "utf8")
      .then((value) => JSON.parse(value) as { step: number; title: string; button: "default" | "confirm" })
      .catch(() => undefined)
    if (request && request.step > handledStep) {
      const found = await commandOutput("xdotool", ["search", "--name", request.title])
      const id = found.status === 0 ? found.stdout.trim().split("\n").at(-1) : undefined
      if (id) {
        await runCommand("xdotool", ["windowfocus", "--sync", id])
        await runCommand("xdotool", request.button === "default" ? ["key", "Return"] : ["key", "Tab", "Return"])
        handledStep = request.step
      }
    }
    await delay(100)
  }
}

async function commandOutput(file: string, args: string[]) {
  const process = Bun.spawn([file, ...args], { stdout: "pipe", stderr: "ignore" })
  return { status: await process.exited, stdout: await new Response(process.stdout).text() }
}

async function runCommand(file: string, args: string[]) {
  const result = await commandOutput(file, args)
  assert.equal(result.status, 0, `${file} ${args.join(" ")} failed`)
}

async function waitFor<A>(read: () => Promise<A | undefined> | A | undefined, name: string) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const value = await read()
    if (value !== undefined) return value
    await delay(100)
  }
  throw new Error(`timed out waiting for ${name}`)
}

if (process.argv.includes("--activity-freeze-sidecar-e2e-child"))
  void child().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
else
  void parent().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })

