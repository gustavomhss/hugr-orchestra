import assert from "node:assert/strict"
import { createServer } from "node:http"
import { chmod, lstat, mkdir, open, readFile, rename, rm, utimes, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import type { ActivityArm } from "@orchestra/schema/activity-arm"
import type { ActivityApply } from "@orchestra/schema/activity-apply"
import type { MessageBoxOptions } from "electron"

const desktop = process.cwd()

async function parent() {
  if (process.platform !== "linux" || process.env.CI !== "true" || process.getuid?.() !== 0 || !Bun.which("xdotool") ||
    !Bun.which("runuser") || !await Bun.file("/usr/bin/python3").exists())
    throw new Error("Activity Apply proof requires the hosted root Linux/Xvfb fixture, xdotool, runuser, and Python")
  const root = join("/var/lib", `orchestra-activity-apply-${process.pid}-${crypto.randomUUID()}`)
  await mkdir(root, { mode: 0o700 })
  await chmod(root, 0o700)
  try {
    const main = join(root, "repository")
    const worktrees = join(root, "worktrees")
    const quarantine = join(root, "quarantine")
    const outside = join(root, "outside")
    const worktree = join(worktrees, "worktree")
    const sibling = join(outside, "sibling")
    await Promise.all([mkdir(worktrees, { mode: 0o700 }), mkdir(quarantine, { mode: 0o700 }), mkdir(outside, { mode: 0o700 })])
    await Promise.all([chmod(worktrees, 0o700), chmod(quarantine, 0o700), chmod(outside, 0o700)])
    await mkdir(main)
    await run("git", ["init", "-q", main])
    await run("git", ["-C", main, "config", "user.email", "fixture@example.invalid"])
    await run("git", ["-C", main, "config", "user.name", "Activity fixture"])
    await writeFile(join(main, ".gitignore"), "/.turbo/\n")
    await writeFile(join(main, ".gitattributes"), "*.fixture filter=activity\n")
    await writeFile(join(main, "tracked.fixture"), "tracked fixture\n")
    await run("git", ["-C", main, "add", ".gitignore", ".gitattributes", "tracked.fixture"])
    await run("git", ["-C", main, "commit", "-qm", "fixture"])
    await run("git", ["-C", main, "worktree", "add", "--detach", worktree])
    await run("git", ["-C", main, "worktree", "add", "--detach", sibling])
    await run("git", ["-C", main, "config", "filter.activity.clean", "tee .activity-filter-ran"])
    await utimes(join(worktree, "tracked.fixture"), new Date(), new Date(Date.now() + 30_000))
    await chmod(worktree, 0o700)
    await mkdir(join(worktree, ".turbo"), { mode: 0o700 })
    await chmod(join(worktree, ".turbo"), 0o700)
    await mkdir(join(sibling, ".turbo"), { mode: 0o700 })
    await chmod(join(sibling, ".turbo"), 0o700)
    await writeFile(join(worktree, ".turbo", "payload"), "untouched fixture\n")
    await writeFile(join(sibling, ".turbo", "payload"), "outside fixture\n")
    await chmod(join(worktree, ".turbo", "payload"), 0o600)
    const handle = await open(join(worktree, ".turbo", "payload"), "r")
    try {
      const source = JSON.stringify(join(desktop, "../../packages/core/src/activity-arm-proof.ts"))
      await run("unshare", ["--mount", "--pid", "--fork", "--kill-child", "--mount-proc", process.execPath, "-e", `
        import { ActivityArmProof } from ${source}
        const proof = await ActivityArmProof.inspect({ worktree: ${JSON.stringify(worktree)}, name: ".turbo" })
        if (proof) throw new Error("A nested process view must refuse the object while the host holds it")
      `])
    } finally {
      await handle.close()
    }
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
      signedReceipt: true, durableReceipt: true, sourceUntouched: true, nestedNamespaceRefused: true,
      wrongGitDirectoryRefused: true, cleanFilterNotRun: true, unsignedApplyRefused: true, unsignedApplyPreviewRefused: true,
      applyCancel: true, protectedSourceDenied: true, applyConfirm: true, inodePreserved: true, rereadOut: true,
      outsideRootArmed: true, outsideRootApplyRefused: true,
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
  const { setNativeTranslations } = await import("../src/main/native-translations")
  const { DESKTOP_NATIVE_ENGLISH } = await import("@orchestra/app/i18n/desktop-native")
  assert.ok(process.versions.electron)
  const root = process.env.ACTIVITY_ARM_ROOT!
  const main = join(root, "repository")
  const worktree = join(root, "worktrees", "worktree")
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
    env: { PATH: process.env.PATH ?? "", HOME: join(root, "home"), ORCHESTRA_TEST_HOME: join(root, "home"), ORCHESTRA_DB: databasePath, ORCHESTRA_CONFIG_DIR: join(root, "config"), ORCHESTRA_DISABLE_MODELS_FETCH: "1", ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true", ORCHESTRA_INHERIT_CREDENTIALS: "0", ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strict", HUGR_OMNI_ADDON: process.env.HUGR_OMNI_ADDON ?? "", HUGR_OMNI_SUPERVISOR: process.env.HUGR_OMNI_SUPERVISOR ?? "", ORCHESTRA_ACTIVITY_APPLY_ROOT: root },
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
      return await response.json() as ActivityArm.PlanSnapshot
    }
    const unsigned = await fetch(`${owned.url}/_orchestra-activity/v1/arm-inspect`, { method: "POST", headers: { authorization, "content-type": "application/json" }, body: "{}" })
    assert.equal(unsigned.status, 403)
    assert.equal((await plan()).ready.length, 0, "passive GET must not discover the target")
    const messages = {
      ...DESKTOP_NATIVE_ENGLISH,
      "desktop.activity.arm.title": "Renderer-supplied title",
      "desktop.activity.arm.message": "Renderer-supplied message",
      "desktop.activity.arm.cancel": "Renderer-supplied cancel",
      "desktop.activity.arm.confirm": "Renderer-supplied confirm",
      "desktop.activity.apply.title": "Renderer-supplied Apply title",
      "desktop.activity.apply.message": "Renderer-supplied Apply message",
      "desktop.activity.apply.cancel": "Renderer-supplied Apply cancel",
      "desktop.activity.apply.confirm": "Renderer-supplied Apply confirm",
    }
    setNativeTranslations({ locale: "en", messages })
    const nativeResponses: { options: MessageBoxOptions; response: number }[] = []
    const nativeDialog = {
      ...dialog,
      showMessageBox: (async (parent: InstanceType<typeof BrowserWindow>, options: MessageBoxOptions) => {
        const shown = { ...options, buttons: options.buttons?.slice() }
        await rename(join(root, "next-dialog.json"), join(root, "dialog.json"))
        process.stderr.write("Native arm dialog opened\n")
        const result = await dialog.showMessageBox(parent, options)
        nativeResponses.push({ options: shown, response: result.response })
        return result
      }) as typeof dialog.showMessageBox,
    }
    const applyClient = owned.openActivityApply()
    assert.ok(applyClient, "the production signed Apply client must be available")
    registerActivityArmIpc({ ipcMain, BrowserWindow, dialog: nativeDialog, rendererDevURL: rendererURL, getOwned: () => owned })
    window = new BrowserWindow({ show: true, webPreferences: { preload: process.env.ACTIVITY_ARM_PRELOAD!, sandbox: true, nodeIntegration: false, contextIsolation: true } })
    await window.loadURL(rendererURL)
    const inspect = async () => await window!.webContents.executeJavaScript(`window.api.inspectActivityArm(${JSON.stringify(owned.url)})`) as ActivityArm.PlanSnapshot
    const inspected = await inspect()
    const target = inspected.ready.find((item) => item.label === source)
    assert.ok(target, `registered worktree did not produce a ready target: ${JSON.stringify(inspected)}`)
    process.stderr.write("Live object qualified\n")
    assert.equal((await plan()).ready.some((item) => item.targetID === target.targetID), true)
    const marker = join(worktree, ".git")
    const pointer = await readFile(marker)
    await writeFile(marker, await readFile(join(root, "outside", "sibling", ".git")))
    try {
      assert.ok((await plan()).ready.some((item) => item.targetID === target.targetID), "passive GET retains its cached projection")
      assert.equal((await inspect()).ready.length, 0, "a different Git admin directory cannot qualify the worktree")
    } finally {
      await writeFile(marker, pointer)
    }
    const handle = await open(join(source, "payload"), "r")
    try {
      assert.equal((await inspect()).ready.length, 0, "an open file prevents qualification")
    } finally {
      await handle.close()
    }
    const idle = (await inspect()).ready.find((item) => item.targetID === target.targetID)
    assert.ok(idle && idle.generation !== target.generation, "verified idleness must acquire a new generation")
    process.stderr.write("Open file refused and new generation qualified\n")
    let step = 0
    const arm = async (mode: "cancel" | "change" | "confirm", target: ActivityArm.Target) => {
      const request = { targets: [{ targetID: target.targetID, generation: target.generation }] }
      await writeFile(join(root, "next-dialog.json"), JSON.stringify({ step: ++step, mode, source: target.label }))
      const receipt = await window!.webContents.executeJavaScript(`window.api.armActivityQuarantine(${JSON.stringify(owned.url)}, ${JSON.stringify(request)})`) as ActivityArm.Receipt | undefined
      assert.equal(nativeResponses.length, step, `native dialog did not return for ${mode}`)
      const shown = nativeResponses[step - 1]!
      assert.equal(shown.response, mode === "cancel" ? 0 : 1, `unexpected native response for ${mode}`)
      assert.equal(shown.options.title, "Arm quarantine")
      assert.equal(shown.options.message, "Arm quarantine for these targets?")
      assert.deepEqual(shown.options.buttons, ["Cancel", "Arm quarantine"])
      assert.equal(shown.options.defaultId, 0)
      assert.equal(shown.options.cancelId, 0)
      assert.equal(shown.options.detail, `${JSON.stringify(target.label)} — "activity-fixture"\nID: ${JSON.stringify(target.targetID)}\nGeneration: ${JSON.stringify(target.generation)}`)
      return receipt
    }
    assert.equal(await arm("cancel", idle), undefined)
    assert.equal(receipts().length, 0, "cancellation cannot persist approval")
    process.stderr.write("Native cancellation left no receipt\n")
    assert.equal(await readFile(join(source, "payload"), "utf8"), "untouched fixture\n")
    const client = owned.openActivityArm()
    assert.ok(client)
    const stale = await client.preview({ targets: [{ targetID: idle.targetID, generation: idle.generation }] })
    assert.ok(stale)
    assert.equal(await arm("change", idle), undefined, "changed target must fail confirmation")
    assert.equal(receipts().length, 0, "identity mismatch cannot persist approval")
    assert.equal(await client.confirm({ previewID: stale.previewID }), undefined, "stale signed preview cannot arm")
    process.stderr.write("Replacement and stale preview refused\n")
    await rm(source, { recursive: true })
    await rename(`${source}.original`, source)
    const refreshed = await inspect()
    const current = refreshed.ready.find((item) => item.targetID === target.targetID)
    assert.ok(current)
    const receipt = await arm("confirm", current)
    assert.ok(receipt?.approvalID, "native confirmation must return an authenticated receipt")
    assert.equal(receipts().length, 1)
    assert.deepEqual(JSON.parse(String(receipts()[0]!.receipt)), receipt)
    assert.equal((await plan()).approvals.length, 1)
    assert.equal(await readFile(join(source, "payload"), "utf8"), "untouched fixture\n")
    const request = { approvalID: receipt.approvalID, targetID: current.targetID, generation: current.generation }
    assert.ok(applyClient, "owned production Apply client must be available")
    const state = await window!.webContents.executeJavaScript(`window.api.readActivityApply(${JSON.stringify(owned.url)})`) as ActivityApply.State
    assert.equal(state.available, true, "the configured root-owned profile must enable production Apply")
    assert.ok(state.eligible.some((item) => item.approvalID === request.approvalID && item.targetID === request.targetID && item.generation === request.generation))
    const unsigned = await fetch(`${owned.url}/_orchestra-activity/v1/apply-confirm`, {
      method: "POST", headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({ previewID: crypto.randomUUID() }),
    })
    assert.equal(unsigned.status, 403, "an ordinary authenticated caller cannot submit private Apply confirmation")
    const unsignedPreview = await fetch(`${owned.url}/_orchestra-activity/v1/apply-preview`, {
      method: "POST", headers: { authorization, "content-type": "application/json" }, body: JSON.stringify(request),
    })
    assert.equal(unsignedPreview.status, 403, "an ordinary authenticated caller cannot submit private Apply preview")
    const preview = await applyClient.preview(request)
    assert.ok(preview, "the real signed production client must produce an Apply preview")
    assert.equal(preview.target.label, source)
    const expectedDestination = join(root, "quarantine", `q-${createHash("sha256").update(JSON.stringify([current.targetID, current.generation])).digest("hex")}`)
    assert.equal(preview.destination, expectedDestination)
    const original = await lstat(source, { bigint: true })
    assert.equal(original.isDirectory(), true)
    assert.equal(original.isSymbolicLink(), false)
    assert.equal(original.uid, 0n)
    for (const directory of [root, join(root, "worktrees"), worktree, source, join(root, "quarantine")]) {
      const info = await lstat(directory, { bigint: true })
      assert.equal(info.uid, 0n, `${directory} must be administrator-owned`)
      assert.equal(info.isSymbolicLink(), false, `${directory} must not resolve through a symlink`)
      assert.equal(Number(info.mode & 0o777n), 0o700, `${directory} must be inaccessible to ordinary users`)
    }
    for (const ancestor of ["/", "/var", "/var/lib"]) {
      const info = await lstat(ancestor, { bigint: true })
      assert.equal(info.uid, 0n, `${ancestor} must be administrator-owned`)
      assert.equal(info.isSymbolicLink(), false, `${ancestor} must not be a symlink`)
      assert.equal(info.mode & 0o022n, 0n, `${ancestor} must not be writable by ordinary users`)
    }
    const apply = async (mode: "cancel" | "confirm") => {
      await writeFile(join(root, "next-dialog.json"), JSON.stringify({ step: ++step, mode, source, title: "Apply quarantine", attack: mode === "confirm" }))
      const result = await window!.webContents.executeJavaScript(`window.api.applyActivityQuarantine(${JSON.stringify(owned.url)}, ${JSON.stringify(request)})`) as ActivityApply.Receipt | undefined
      assert.equal(nativeResponses.length, step, `native Apply dialog did not return for ${mode}`)
      const shown = nativeResponses[step - 1]!
      assert.equal(shown.response, mode === "cancel" ? 0 : 1)
      assert.equal(shown.options.title, "Apply quarantine")
      assert.equal(shown.options.message, "Apply quarantine to this object?")
      assert.deepEqual(shown.options.buttons, ["Cancel", "Apply quarantine"])
      assert.equal(shown.options.defaultId, 0)
      assert.equal(shown.options.cancelId, 0)
      assert.equal(shown.options.detail, `Approval: ${JSON.stringify(receipt.approvalID)}\nTarget: ${JSON.stringify(current.targetID)}\nPath: ${JSON.stringify(source)}\nGeneration: ${JSON.stringify(current.generation)}\nDestination: ${JSON.stringify(expectedDestination)}`)
      return result
    }
    assert.equal(await apply("cancel"), undefined)
    assert.equal(await lstat(source, { bigint: true }).then((info) => `${info.dev}:${info.ino}`), `${original.dev}:${original.ino}`, "native cancellation must keep the original inode at source")
    await assert.rejects(lstat(expectedDestination), { code: "ENOENT" })
    const applied = await apply("confirm")
    assert.ok(applied)
    assert.equal(applied.approvalID, request.approvalID)
    assert.equal(applied.targetID, request.targetID)
    assert.equal(applied.generation, request.generation)
    assert.equal(applied.outcome, "Out")
    assert.notEqual(applied.previewID, preview.previewID, "the native confirmation flow must consume its own one-use preview")
    const attack = JSON.parse(await readFile(join(root, "attack-result.json"), "utf8")) as { uid: number; errno?: string; renamed: boolean; sentinel: boolean }
    assert.equal(attack.uid, 65_534, "the replacement attempt must run as the ordinary nobody UID")
    assert.ok(attack.errno === "EACCES" || attack.errno === "EPERM", `kernel must deny source substitution: ${JSON.stringify(attack)}`)
    assert.equal(attack.renamed, false, "the ordinary same-UID process must not rename the protected source")
    assert.equal(attack.sentinel, false, "the ordinary same-UID process must not plant a replacement sentinel")
    const reread = await window!.webContents.executeJavaScript(`window.api.readActivityApply(${JSON.stringify(owned.url)})`) as ActivityApply.State
    assert.equal(reread.results.find((item) => item.targetID === request.targetID && item.generation === request.generation)?.outcome, "Out", "the genuine production reread must report Out")
    await assert.rejects(lstat(source), { code: "ENOENT" })
    const moved = await lstat(expectedDestination, { bigint: true })
    assert.equal(moved.isDirectory(), true)
    assert.equal(moved.isSymbolicLink(), false)
    assert.equal(`${moved.dev}:${moved.ino}`, `${original.dev}:${original.ino}`, "quarantine must contain the exact inode captured before confirmation")
    assert.equal(await readFile(join(expectedDestination, "payload"), "utf8"), "untouched fixture\n")
    const saved = db.prepare("SELECT identity, outcome, source, destination FROM activity_apply WHERE target_id = ? AND generation = ?").get(request.targetID, request.generation) as { identity: string; outcome: string; source: string; destination: string } | undefined
    assert.deepEqual(saved, { identity: `${original.dev}:${original.ino}`, outcome: "Out", source, destination: expectedDestination }, "SQLite must persist the pinned native identity and verified Out receipt")
    const outsideSource = join(root, "outside", "sibling", ".turbo")
    db.prepare("INSERT INTO project_directory (project_id, directory, registration_id, type, strategy, time_created) VALUES (?, ?, ?, 'git_worktree', 'git_worktree', ?)").run("activity-fixture", join(root, "outside", "sibling"), "outside-registration", now)
    const outsideTarget = (await inspect()).ready.find((item) => item.label === outsideSource)
    assert.ok(outsideTarget, "a real registered target outside the configured worktrees directory must remain armable")
    const outsideArm = await arm("confirm", outsideTarget)
    assert.ok(outsideArm?.approvalID)
    assert.equal(receipts().length, 2)
    const outsideRequest = { approvalID: outsideArm.approvalID, targetID: outsideTarget.targetID, generation: outsideTarget.generation }
    assert.equal(await applyClient.preview(outsideRequest), undefined, "production Apply must refuse an already Armed source outside the configured protected root")
    assert.equal(await window!.webContents.executeJavaScript(`window.api.applyActivityQuarantine(${JSON.stringify(owned.url)}, ${JSON.stringify(outsideRequest)})`), undefined)
    assert.equal(nativeResponses.length, step, "an outside-root refusal must not prompt for native Apply confirmation")
    assert.equal(await readFile(join(outsideSource, "payload"), "utf8"), "outside fixture\n")
    await assert.rejects(readFile(join(worktree, ".activity-filter-ran")), { code: "ENOENT" })
    db.close()
    await writeFile(join(root, "report.json"), JSON.stringify({
      status: "pass", openFileRefused: true, nativeCancel: true, identityMismatch: true, staleRefused: true,
      signedReceipt: true, durableReceipt: true, sourceUntouched: true, nestedNamespaceRefused: true,
      wrongGitDirectoryRefused: true, cleanFilterNotRun: true, unsignedApplyRefused: true, unsignedApplyPreviewRefused: true,
      applyCancel: true, protectedSourceDenied: true, applyConfirm: true, inodePreserved: true, rereadOut: true,
      outsideRootArmed: true, outsideRootApplyRefused: true,
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
    const request = await readFile(join(root, "dialog.json"), "utf8").then((text) => JSON.parse(text) as { step: number; mode: "cancel" | "change" | "confirm"; source: string; title?: string; attack?: boolean }).catch(() => undefined)
    if (request && request.step > handled) {
      const search = Bun.spawn(["xdotool", "search", "--name", request.title ?? "Arm quarantine"], { stdout: "pipe", stderr: "ignore" })
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
        if (request.attack) await writeFile(join(root, "attack-result.json"), JSON.stringify(await sourceSwapAsNobody(request.source)))
        await run("xdotool", ["windowfocus", id])
        await run("xdotool", request.mode === "cancel" ? ["key", "Return"] : ["key", "Tab", "Return"])
        handled = request.step
      }
    }
    await delay(100)
  }
}

async function sourceSwapAsNobody(source: string) {
  const script = `import errno, json, os, sys
source = sys.argv[1]
moved = source + ".attacker"
sentinel = os.path.join(source, "sentinel")
try:
    os.rename(source, moved)
    os.mkdir(source)
    with open(sentinel, "w", encoding="utf-8") as output:
        output.write("attacker replacement")
    result = {"uid": os.getuid(), "renamed": True, "sentinel": os.path.exists(sentinel)}
except OSError as error:
    result = {"uid": os.getuid(), "errno": errno.errorcode.get(error.errno, str(error.errno)), "renamed": os.path.exists(moved), "sentinel": os.path.exists(sentinel)}
print(json.dumps(result))`
  const child = Bun.spawn(["runuser", "-u", "nobody", "--", "/usr/bin/python3", "-c", script, source], { stdout: "pipe", stderr: "pipe" })
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text()
  assert.equal(await child.exited, 0, `the same-UID source swap attempt failed to run: ${await stderr}`)
  return JSON.parse(await stdout) as { uid: number; errno?: string; renamed: boolean; sentinel: boolean }
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
