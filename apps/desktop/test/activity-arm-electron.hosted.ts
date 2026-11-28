import assert from "node:assert/strict"
import { createServer } from "node:http"
import { chmod, mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

const desktop = process.cwd()

async function parent() {
  if (process.platform !== "linux" || process.env.CI !== "true" || process.getuid?.() !== 0 || !Bun.which("xdotool"))
    throw new Error("Activity arm proof requires the hosted root Linux/Xvfb fixture and xdotool")
  const root = await mkdtemp(join(tmpdir(), "activity-arm-electron-"))
  try {
    const main = join(root, "repository")
    const worktree = join(root, "worktree")
    await mkdir(main)
    await run("git", ["init", "-q", main])
    await run("git", ["-C", main, "config", "user.email", "fixture@example.invalid"])
    await run("git", ["-C", main, "config", "user.name", "Activity fixture"])
    await writeFile(join(main, ".gitignore"), "/.turbo/\n")
    await run("git", ["-C", main, "add", ".gitignore"])
    await run("git", ["-C", main, "commit", "-qm", "fixture"])
    await run("git", ["-C", main, "worktree", "add", "--detach", worktree])
    await chmod(worktree, 0o700)
    await mkdir(join(worktree, ".turbo"))
    await writeFile(join(worktree, ".turbo", "payload"), "untouched fixture\n")
    const preload = await Bun.build({ entrypoints: [join(desktop, "src/preload/index.ts")], outdir: root, naming: "preload.cjs", target: "node", format: "cjs", external: ["electron"] })
    const hosted = await Bun.build({ entrypoints: [join(desktop, "test/activity-arm-electron.hosted.ts")], outdir: root, naming: "main.cjs", target: "node", format: "cjs", external: ["electron", "node:sqlite"], define: { "import.meta.env.ORCHESTRA_CHANNEL": '"dev"', "import.meta.env.ORCHESTRA_MAC_SIGNED": '"false"' } })
    if (!preload.success || !hosted.success) throw new Error("Could not build Electron fixture")
    const entry = hosted.outputs[0]!.path
    await writeFile(entry, (await readFile(entry, "utf8")).replaceAll(/import\.meta\??\.env/g, "({})"))
    const electron = createRequire(join(desktop, "package.json")).resolve("electron")
    const binary = join(dirname(electron), "dist", (await readFile(join(dirname(electron), "path.txt"), "utf8")).trim())
    const bun = process.execPath
    const child = Bun.spawn([binary, "--no-sandbox", "--disable-gpu", "--disable-software-rasterizer", entry, "--activity-arm-child"], {
      stdout: "inherit", stderr: "inherit", env: { ...process.env, ACTIVITY_ARM_ROOT: root, ACTIVITY_ARM_PRELOAD: preload.outputs[0]!.path, ACTIVITY_ARM_BUN: bun, ACTIVITY_ARM_CLI: join(desktop, "../cli/src/index.ts") },
    })
    let done = false
    const dialogs = handleDialogs(() => done, root)
    const timer = setTimeout(() => child.kill("SIGKILL"), 90_000)
    const status = await child.exited
    clearTimeout(timer)
    done = true
    await dialogs
    assert.equal(status, 0, "Electron fixture failed")
    const report = await readFile(join(root, "report.json"), "utf8")
    assert.deepEqual(JSON.parse(report), {
      status: "pass", openFileRefused: true, nativeCancel: true, identityMismatch: true, staleRefused: true,
      signedReceipt: true, durableReceipt: true, sourceUntouched: true,
    })
    process.stdout.write(report + "\n")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function child() {
  const { app, BrowserWindow, dialog, ipcMain } = await import("electron")
  const { DatabaseSync } = await import("node:sqlite")
  const { startOwnedServe } = await import("../src/main/owned-serve")
  const { registerActivityArmIpc } = await import("../src/main/activity-arm-ipc")
  assert.ok(process.versions.electron)
  const root = process.env.ACTIVITY_ARM_ROOT!
  const main = join(root, "repository")
  const worktree = join(root, "worktree")
  const source = join(worktree, ".turbo")
  const databasePath = join(root, "activity.sqlite")
  await mkdir(join(root, "home"))
  await mkdir(join(root, "electron"))
  app.setPath("userData", join(root, "electron"))
  app.commandLine.appendSwitch("disable-gpu")
  app.on("window-all-closed", () => {})
  await app.whenReady()
  const page = createServer((_req, response) => response.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>Activity arm fixture</title>"))
  await new Promise<void>((resolve, reject) => { page.once("error", reject); page.listen(0, "127.0.0.1", resolve) })
  const address = page.address()
  if (!address || typeof address === "string") throw new Error("Could not start renderer")
  const rendererURL = `http://127.0.0.1:${address.port}`
  const owned = await startOwnedServe({
    command: [process.env.ACTIVITY_ARM_BUN!, process.env.ACTIVITY_ARM_CLI!], cwd: root,
    env: { PATH: process.env.PATH ?? "", HOME: join(root, "home"), ORCHESTRA_TEST_HOME: join(root, "home"), ORCHESTRA_DB: databasePath, ORCHESTRA_CONFIG_DIR: join(root, "config"), ORCHESTRA_DISABLE_MODELS_FETCH: "1", ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true", ORCHESTRA_INHERIT_CREDENTIALS: "0", ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strict", HUGR_OMNI_ADDON: process.env.HUGR_OMNI_ADDON ?? "", HUGR_OMNI_SUPERVISOR: process.env.HUGR_OMNI_SUPERVISOR ?? "" },
    privateActivityApproval: true, logger: { log() {}, error() {} }, write() {},
  })
  let window: InstanceType<typeof BrowserWindow> | undefined
  try {
    await owned.health.wait
    assert.equal(await owned.probeActivityApproval(), true)
    const db = new DatabaseSync(databasePath)
    const now = Date.now()
    db.prepare("INSERT INTO project (id, worktree, vcs, time_created, time_updated, sandboxes) VALUES (?, ?, 'git', ?, ?, '[]')").run("activity-fixture", main, now, now)
    db.prepare("INSERT INTO project_directory (project_id, directory, registration_id, type, strategy, time_created) VALUES (?, ?, ?, 'git_worktree', 'git_worktree', ?)").run("activity-fixture", worktree, "activity-registration", now)
    const receipts = () => db.prepare("SELECT receipt FROM activity_arm").all()
    const authorization = `Basic ${Buffer.from(`${owned.username}:${owned.password}`).toString("base64")}`
    const plan = async () => {
      const response = await fetch(`${owned.url}/api/activity/plan`, { headers: { authorization } })
      assert.equal(response.status, 200)
      return await response.json() as { ready: Array<{ targetID: string; generation: string; label: string }>; approvals: unknown[] }
    }
    const unsigned = await fetch(`${owned.url}/_orchestra-activity/v1/arm-inspect`, { method: "POST", headers: { authorization, "content-type": "application/json" }, body: "{}" })
    assert.equal(unsigned.status, 403)
    assert.equal((await plan()).ready.length, 0, "passive GET must not discover the target")
    const nativeDialog = {
      ...dialog,
      showMessageBox: (async (parent: InstanceType<typeof BrowserWindow>, options: Parameters<typeof dialog.showMessageBox>[1]) => {
        await rename(join(root, "next-dialog.json"), join(root, "dialog.json"))
        process.stderr.write("Native arm dialog opened\n")
        return dialog.showMessageBox(parent, options)
      }) as typeof dialog.showMessageBox,
    }
    registerActivityArmIpc({ ipcMain, BrowserWindow, dialog: nativeDialog, rendererDevURL: rendererURL, getOwned: () => owned })
    window = new BrowserWindow({ show: true, webPreferences: { preload: process.env.ACTIVITY_ARM_PRELOAD!, sandbox: true, nodeIntegration: false, contextIsolation: true } })
    await window.loadURL(rendererURL)
    const inspect = async () => await window!.webContents.executeJavaScript(`window.api.inspectActivityArm(${JSON.stringify(owned.url)})`) as { ready: Array<{ targetID: string; generation: string; label: string }> }
    const inspected = await inspect()
    const target = inspected.ready.find((item) => item.label.includes(".turbo"))
    assert.ok(target, `registered worktree did not produce a ready target: ${JSON.stringify(inspected)}`)
    process.stderr.write("Live object qualified\n")
    assert.equal((await plan()).ready.some((item) => item.targetID === target.targetID), true)
    const handle = await open(join(source, "payload"), "r")
    try {
      assert.equal((await inspect()).ready.length, 0, "an open file prevents qualification")
    } finally {
      await handle.close()
    }
    const idle = (await inspect()).ready.find((item) => item.targetID === target.targetID)
    assert.ok(idle && idle.generation !== target.generation, "verified idleness must acquire a new generation")
    process.stderr.write("Open file refused and new generation qualified\n")
    const request = { targets: [{ targetID: idle.targetID, generation: idle.generation }] }
    let step = 0
    const arm = async (mode: "cancel" | "change" | "confirm") => {
      await writeFile(join(root, "next-dialog.json"), JSON.stringify({ step: ++step, mode, source }))
      return await window!.webContents.executeJavaScript(`window.api.armActivityQuarantine(${JSON.stringify(owned.url)}, ${JSON.stringify(request)})`)
    }
    assert.equal(await arm("cancel"), undefined)
    assert.equal(receipts().length, 0, "cancellation cannot persist approval")
    process.stderr.write("Native cancellation left no receipt\n")
    assert.equal(await readFile(join(source, "payload"), "utf8"), "untouched fixture\n")
    const client = owned.openActivityArm()
    assert.ok(client)
    const stale = await client.preview(request)
    assert.ok(stale)
    assert.equal(await arm("change"), undefined, "changed target must fail confirmation")
    assert.equal(receipts().length, 0, "identity mismatch cannot persist approval")
    assert.equal(await client.confirm({ previewID: stale.previewID }), undefined, "stale signed preview cannot arm")
    process.stderr.write("Replacement and stale preview refused\n")
    await rm(source, { recursive: true })
    await rename(`${source}.original`, source)
    const refreshed = await inspect()
    const current = refreshed.ready.find((item) => item.targetID === target.targetID)
    assert.ok(current)
    const currentRequest = { targets: [{ targetID: current.targetID, generation: current.generation }] }
    await writeFile(join(root, "next-dialog.json"), JSON.stringify({ step: ++step, mode: "confirm", source }))
    const receipt = await window.webContents.executeJavaScript(`window.api.armActivityQuarantine(${JSON.stringify(owned.url)}, ${JSON.stringify(currentRequest)})`) as { approvalID: string; targets: unknown[] } | undefined
    assert.ok(receipt?.approvalID, "native confirmation must return an authenticated receipt")
    assert.equal(receipts().length, 1)
    assert.deepEqual(JSON.parse(String(receipts()[0]!.receipt)), receipt)
    assert.equal((await plan()).approvals.length, 1)
    assert.equal(await readFile(join(source, "payload"), "utf8"), "untouched fixture\n")
    db.close()
    await writeFile(join(root, "report.json"), JSON.stringify({
      status: "pass", openFileRefused: true, nativeCancel: true, identityMismatch: true, staleRefused: true,
      signedReceipt: true, durableReceipt: true, sourceUntouched: true,
    }))
  } finally {
    window?.destroy()
    page.close()
    await owned.listener.stop()
  }
}

async function handleDialogs(done: () => boolean, root: string) {
  let handled = 0
  while (!done()) {
    const request = await readFile(join(root, "dialog.json"), "utf8").then((text) => JSON.parse(text) as { step: number; mode: "cancel" | "change" | "confirm"; source: string }).catch(() => undefined)
    if (request && request.step > handled) {
      const search = Bun.spawn(["xdotool", "search", "--name", "Arm quarantine"], { stdout: "pipe", stderr: "ignore" })
      const output = await new Response(search.stdout).text()
      const status = await search.exited
      const id = status === 0 ? output.trim().split("\n").at(-1) : undefined
      if (id) {
        process.stdout.write(`Acting on native dialog step ${request.step}\n`)
        if (request.mode === "change") {
          await rename(request.source, `${request.source}.original`)
          await mkdir(request.source)
          await writeFile(join(request.source, "payload"), "replacement\n")
        }
        await run("xdotool", ["windowfocus", id])
        await run("xdotool", request.mode === "cancel" ? ["key", "Return"] : ["key", "Tab", "Return"])
        handled = request.step
      }
    }
    await delay(100)
  }
}

async function run(command: string, args: string[]) {
  const child = Bun.spawn([command, ...args], { stdout: "ignore", stderr: "pipe" })
  const error = new Response(child.stderr).text()
  const timeout = setTimeout(() => child.kill("SIGKILL"), 6_000)
  try {
    assert.equal(await child.exited, 0, `${command} failed: ${await error}`)
  } finally {
    clearTimeout(timeout)
  }
}

if (process.argv.includes("--activity-arm-child"))
  void child().then(async () => (await import("electron")).app.exit(0), async (error) => {
    console.error(error)
    const { app } = await import("electron")
    app.exit(1)
  })
else
  void parent().catch((error) => { console.error(error); process.exitCode = 1 })
