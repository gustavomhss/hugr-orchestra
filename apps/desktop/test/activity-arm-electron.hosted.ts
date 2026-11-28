import assert from "node:assert/strict"
import { createServer, request } from "node:http"
import { chmod, chown, copyFile, lstat, mkdir, open, readFile, readdir, rename, rm, utimes, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import type { ActivityArm } from "@orchestra/schema/activity-arm"
import type { ActivityApply } from "@orchestra/schema/activity-apply"
import { ActivityPrivateChannel } from "@orchestra/schema/activity-private-channel"
import type { MessageBoxOptions } from "electron"

const desktop = process.cwd()
const projectID = "activity-fixture"
const python = "/usr/bin/python3"

async function parent() {
  const uid = Number(process.env.ACTIVITY_ARM_UID)
  const gid = Number(process.env.ACTIVITY_ARM_GID)
  const addon = process.env.HUGR_OMNI_ADDON
  const supervisor = process.env.HUGR_OMNI_SUPERVISOR
  const outerDisplay = process.env.DISPLAY
  const outerAuthority = process.env.XAUTHORITY
  if (process.platform !== "linux" || process.env.CI !== "true" || process.getuid?.() !== 0 ||
    !Number.isSafeInteger(uid) || uid <= 0 || !Number.isSafeInteger(gid) || gid <= 0 ||
    !addon || !supervisor || !outerDisplay || !outerAuthority || !Bun.which("xdotool") || !Bun.which("xwd") ||
    !Bun.which("weston") || !await Bun.file(python).exists()) {
    throw new Error("Activity proof requires the hosted Weston fixture, an ordinary Desktop UID and GID, and Python")
  }
  await chmod(outerAuthority, 0o600)
  const authorityFile = await lstat(outerAuthority)
  assert.ok(authorityFile.isFile() && authorityFile.uid === 0 && (authorityFile.mode & 0o077) === 0,
    "the outer display credential must be private to root")
  const id = `orchestra-activity-apply-${process.pid}-${crypto.randomUUID()}`
  const root = join("/var/lib", id)
  const runtime = join("/run", id)
  const session = join(runtime, "session")
  const socketPath = join(runtime, "custody.sock")
  const wayland = join(runtime, "wayland.sock")
  const credential = join(root, "desktop.credential")
  const worktree = join(root, "worktrees", "worktree")
  const source = join(worktree, ".turbo")
  const cli = join(desktop, "../cli/src/index.ts")
  const omni = join(root, "omni")
  const nativeAddon = join(omni, "libhugr_omni_node.so")
  const nativeSupervisor = join(omni, "hugr-omni-supervisor")
  const secret = crypto.getRandomValues(new Uint8Array(32))
  const frame = ActivityPrivateChannel.frame(secret)
  const signer = await ActivityPrivateChannel.signer(secret).finally(() => secret.fill(0))
  const launchBroker = (credentialFrame: Uint8Array) => {
    const broker = Bun.spawn([process.execPath, cli, "activity-custody", "--root", root, "--socket", socketPath], {
      stdin: "pipe", stdout: "inherit", stderr: "inherit",
      env: { PATH: process.env.PATH, HOME: root, HUGR_OMNI_ADDON: nativeAddon, HUGR_OMNI_SUPERVISOR: nativeSupervisor },
    })
    broker.stdin.write(credentialFrame)
    broker.stdin.end()
    return broker
  }
  const brokers: ReturnType<typeof launchBroker>[] = []
  let weston: { kill(signal: NodeJS.Signals): void; exited: Promise<number> } | undefined
  const refuseBroker = async (reason: string) => {
    const temporarySecret = crypto.getRandomValues(new Uint8Array(32))
    const temporaryFrame = ActivityPrivateChannel.frame(temporarySecret)
    temporarySecret.fill(0)
    const invalid = launchBroker(temporaryFrame)
    brokers.push(invalid)
    try {
      const exit = await Promise.race([invalid.exited, delay(15_000, undefined, { ref: false })])
      assert.ok(exit !== undefined && exit !== 0, reason)
      await assert.rejects(lstat(socketPath), { code: "ENOENT" })
    } finally {
      temporaryFrame.fill(0)
    }
  }
  const signed = async (endpoint: ActivityPrivateChannel.ArmPath, key = signer) => {
    const body = "{}"
    const nonce = ActivityPrivateChannel.applyNonce()
    const response = await unixRequest(socketPath, endpoint, body, {
      [ActivityPrivateChannel.nonceHeader]: nonce,
      [ActivityPrivateChannel.macHeader]: await key.signArm("arm-request", endpoint, nonce, body),
    })
    assert.equal(response.status, 200, `custody request failed at ${endpoint}`)
    assert.ok(await key.verifyArm("arm-response", endpoint, nonce, response.mac, response.body))
    return JSON.parse(response.body)
  }
  const probe = async (key: typeof signer) => {
    const nonce = ActivityPrivateChannel.nonce()
    const response = await unixRequest(socketPath, ActivityPrivateChannel.path, "", {
      [ActivityPrivateChannel.nonceHeader]: nonce,
      [ActivityPrivateChannel.macHeader]: await key.sign("probe-request", nonce),
    })
    return response.status === 204 && await key.verify("probe-response", nonce, response.mac)
  }
  const ready = async (key = signer) => {
    await waitFor("signed custody probe", async () => {
      return probe(key).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT" && error.code !== "ECONNREFUSED") throw error
        return undefined
      })
    })
  }
  try {
    await mkdir(root, { mode: 0o700 })
    await mkdir(omni, { mode: 0o700 })
    await copyFile(addon, nativeAddon)
    await copyFile(supervisor, nativeSupervisor)
    await chmod(nativeAddon, 0o600)
    await chmod(nativeSupervisor, 0o700)
    await mkdir(runtime, { mode: 0o755 })
    await chmod(runtime, 0o755)
    await mkdir(session, { mode: 0o700 })
    await chown(session, uid, gid)
    const main = join(root, "repositories", "repository")
    const sibling = join(root, "outside", "sibling")
    for (const path of [root, dirname(main), dirname(worktree), dirname(sibling), join(root, "quarantine")]) {
      if (path !== root) await mkdir(path, { mode: 0o700 })
      assert.equal((await lstat(path)).uid, 0)
      assert.equal((await lstat(path)).mode & 0o777, 0o700)
    }
    await run("git", ["init", "-q", main])
    await chmod(main, 0o700)
    await writeFile(join(main, ".gitignore"), "/.turbo/\n")
    await writeFile(join(main, ".gitattributes"), "*.fixture filter=activity\n")
    await writeFile(join(main, "tracked.fixture"), "tracked fixture\n")
    await run("git", ["-C", main, "add", ".gitignore", ".gitattributes", "tracked.fixture"])
    await run("git", ["-C", main, "-c", "user.email=fixture@example.invalid", "-c", "user.name=Activity fixture", "commit", "-qm", "fixture"])
    await run("git", ["-C", main, "worktree", "add", "--detach", worktree])
    await run("git", ["-C", main, "worktree", "add", "--detach", sibling])
    await utimes(join(worktree, "tracked.fixture"), new Date(), new Date(Date.now() + 30_000))
    await chmod(worktree, 0o700)
    await chmod(sibling, 0o700)
    await mkdir(source, { mode: 0o700 })
    await mkdir(join(sibling, ".turbo"), { mode: 0o700 })
    await writeFile(join(source, "payload"), "untouched fixture\n", { mode: 0o600 })
    await writeFile(join(sibling, ".turbo", "payload"), "outside fixture\n", { mode: 0o600 })
    const original = await lstat(source, { bigint: true })
    assert.ok(original.isDirectory() && original.uid === 0n && (original.mode & 0o777n) === 0o700n)
    await writeFile(credential, frame, { mode: 0o600, flag: "wx" })

    const manifest = join(root, "registrations.json")
    await writeFile(manifest, JSON.stringify([{ projectID, repository: "repository", worktree: "../outside/sibling" }]), { mode: 0o600 })
    await refuseBroker("custody must refuse an outside-root registration")
    await writeFile(manifest, JSON.stringify([{ projectID, repository: "repository", worktree: "worktree" }]))
    await run("git", ["-C", main, "config", "filter.activity.clean", "tee .activity-filter-ran"])
    await refuseBroker("custody must refuse repository-configured commands")
    await run("git", ["-C", main, "config", "--unset", "filter.activity.clean"])
    const broker = launchBroker(frame)
    brokers.push(broker)
    await ready()
    assert.equal(await processUID(broker.pid), 0, "the dedicated custody process must hold the root authority")
    const inspect = async () => await signed(ActivityPrivateChannel.inspectArmPath) as ActivityArm.PlanSnapshot
    const initial = await waitFor("registered object to qualify", async () => {
      const plan = await inspect()
      return plan.ready.find((item) => item.label === source)
    })
    const marker = join(worktree, ".git")
    const pointer = await readFile(marker)
    await writeFile(marker, await readFile(join(sibling, ".git")))
    try {
      assert.equal((await inspect()).ready.length, 0, "a mismatched Git worktree admin directory must fail qualification")
    } finally {
      await writeFile(marker, pointer)
    }
    const held = await open(join(source, "payload"), "r")
    try {
      assert.equal((await inspect()).ready.length, 0, "a live open file must prevent custody qualification")
      const proof = JSON.stringify(join(desktop, "../../packages/core/src/activity-arm-proof.ts"))
      await run("unshare", ["--mount", "--pid", "--fork", "--kill-child", "--mount-proc", process.execPath, "-e", `
        import { ActivityArmProof } from ${proof}
        const result = await ActivityArmProof.inspect({ worktree: ${JSON.stringify(worktree)}, name: ".turbo" })
        if (result) throw new Error("A nested process view must refuse the object while the host holds it")
      `])
    } finally {
      await held.close()
    }
    const requalified = await waitFor("the registered object to qualify again", async () => {
      const plan = await inspect()
      assert.ok(plan.ready.every((item) => item.label === source), "custody can inspect only its registered worktrees")
      return plan.ready.find((item) => item.targetID === initial.targetID)
    })
    assert.notEqual(requalified.generation, initial.generation)

    const preload = await Bun.build({ entrypoints: [join(desktop, "src/preload/index.ts")], outdir: runtime, naming: "preload.cjs", target: "node", format: "cjs", external: ["electron"] })
    const hosted = await Bun.build({ entrypoints: [join(desktop, "test/activity-arm-electron.hosted.ts")], outdir: runtime, naming: "main.cjs", target: "node", format: "cjs", external: ["electron", "bun:sqlite"], define: { "import.meta.env.ORCHESTRA_CHANNEL": '"dev"', "import.meta.env.ORCHESTRA_MAC_SIGNED": '"false"' } })
    assert.ok(preload.success && preload.outputs[0] && hosted.success && hosted.outputs[0], "could not build Electron fixture")
    const entry = hosted.outputs[0].path
    await writeFile(entry, (await readFile(entry, "utf8")).replaceAll(/import\.meta\??\.env/g, "({})"))
    const electron = createRequire(join(desktop, "package.json")).resolve("electron")
    const binary = join(dirname(electron), "dist", (await readFile(join(dirname(electron), "path.txt"), "utf8")).trim())
    const westonRuntime = join(runtime, "weston")
    await mkdir(westonRuntime, { mode: 0o700 })
    weston = Bun.spawn(["weston", "--backend=x11", "--renderer=pixman", "--no-config", "--idle-time=0",
      "--width=1280", "--height=900", `--socket=${wayland}`], {
      stdout: "inherit", stderr: "inherit", env: { ...process.env, XDG_RUNTIME_DIR: westonRuntime, WAYLAND_DISPLAY: undefined },
    })
    await waitFor("Weston Wayland socket", () => lstat(wayland).catch(() => undefined))
    await chmod(wayland, 0o666)
    const westonWindow = await waitFor("outer Weston window", async () => {
      const search = Bun.spawn(["xdotool", "search", "--onlyvisible", "--class", "^Weston Compositor$"], { stdout: "pipe", stderr: "ignore" })
      const query = await new Response(search.stdout).text()
      return await search.exited === 0 ? query.trim().split("\n").at(-1) : undefined
    })
    const outer = join(runtime, "outer-x11.json")
    await writeFile(outer, JSON.stringify({ display: outerDisplay, authority: outerAuthority }), { mode: 0o644 })
    // Only the administrator opens the credential file. A high FD survives the UID drop and exec.
    const launcher = `import os, sys
fd = os.open(sys.argv[1], os.O_RDONLY | os.O_NOFOLLOW)
descriptor = int(os.environ["ORCHESTRA_ACTIVITY_CUSTODY_FD"])
if fd != descriptor:
    os.dup2(fd, descriptor)
    os.close(fd)
os.set_inheritable(descriptor, True)
os.setgroups([])
os.setgid(int(sys.argv[3]))
os.setuid(int(sys.argv[2]))
os.execv(sys.argv[4], sys.argv[4:])
`
    const electronChild = Bun.spawn([python, "-c", launcher, credential, String(uid), String(gid), binary, "--ozone-platform=wayland", "--disable-gpu", entry, "--activity-arm-child"], {
      stdout: "inherit", stderr: "inherit", env: {
        PATH: process.env.PATH, DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS,
        HUGR_OMNI_ADDON: addon, HUGR_OMNI_SUPERVISOR: supervisor,
        HOME: session, ACTIVITY_ARM_UID: String(uid), ACTIVITY_ARM_SESSION: session, ACTIVITY_ARM_ROOT: root,
        ACTIVITY_ARM_PRELOAD: preload.outputs[0].path, ACTIVITY_ARM_BUN: process.execPath, ACTIVITY_ARM_CLI: cli,
        ACTIVITY_ARM_OUTER_X11: outer,
        XDG_SESSION_TYPE: "wayland", WAYLAND_DISPLAY: wayland, GDK_BACKEND: "wayland", XDG_RUNTIME_DIR: session,
        ORCHESTRA_ACTIVITY_CUSTODY_SOCKET: socketPath, ORCHESTRA_ACTIVITY_CUSTODY_FD: "42",
      },
    })
    const controller = new AbortController()
    const dialogs = handleDialogs(session, source, join(root, "quarantine"), original, electronChild.pid, uid, westonWindow, controller.signal)
    const timer = setTimeout(() => electronChild.kill("SIGKILL"), 125_000)
    try {
      const status = await Promise.race([electronChild.exited, dialogs])
      assert.equal(status, 0, "the ordinary user Electron fixture failed")
    } finally {
      clearTimeout(timer)
      controller.abort()
      electronChild.kill("SIGKILL")
      await electronChild.exited
      await dialogs
    }
    const report = JSON.parse(await readFile(join(session, "report.json"), "utf8")) as {
      desktopUID: number
      sidecarUID: number
      rendererSandbox: boolean
      arm: ActivityArm.Receipt
      apply: ActivityApply.Receipt
    }
    assert.equal(report.desktopUID, uid)
    assert.equal(report.sidecarUID, uid)
    assert.equal(report.rendererSandbox, true)
    const destination = join(root, "quarantine", "q-" + createHash("sha256").update(JSON.stringify([report.apply.targetID, report.apply.generation])).digest("hex"))
    await assert.rejects(lstat(source), { code: "ENOENT" })
    const moved = await lstat(destination, { bigint: true })
    assert.ok(moved.isDirectory() && !moved.isSymbolicLink())
    assert.equal(`${moved.dev}:${moved.ino}`, `${original.dev}:${original.ino}`, "native Apply must move the original inode")
    assert.equal(await readFile(join(destination, "payload"), "utf8"), "untouched fixture\n")
    assert.equal(await readFile(join(sibling, ".turbo", "payload"), "utf8"), "outside fixture\n")
    await assert.rejects(lstat(join(worktree, ".activity-filter-ran")), { code: "ENOENT" })

    broker.kill("SIGTERM")
    assert.ok(await Promise.race([broker.exited.then(() => true), delay(15_000, false, { ref: false })]), "custody must stop before reopen")
    await assert.rejects(lstat(socketPath), { code: "ENOENT" })
    const reopenedSecret = crypto.getRandomValues(new Uint8Array(32))
    const reopenedFrame = ActivityPrivateChannel.frame(reopenedSecret)
    const reopenedSigner = await ActivityPrivateChannel.signer(reopenedSecret).finally(() => reopenedSecret.fill(0))
    const reopened = launchBroker(reopenedFrame)
    brokers.push(reopened)
    try {
      await ready(reopenedSigner)
    } finally {
      reopenedFrame.fill(0)
    }
    assert.equal(await probe(signer), false, "the previous broker key must fail after a new launch")
    const persisted = await signed(ActivityPrivateChannel.applyStatePath, reopenedSigner) as ActivityApply.State
    assert.deepEqual(persisted.results.find((item) => item.targetID === report.apply.targetID &&
      item.generation === report.apply.generation), {
      approvalID: report.arm.approvalID, targetID: report.apply.targetID, generation: report.apply.generation, outcome: "Out",
    })
    assert.ok(persisted.custodyPlan?.approvals.some((item) => JSON.stringify(item.receipt) === JSON.stringify(report.arm)),
      "the reopened signed Plan must contain the native Arm receipt")
    const { Database } = await import("bun:sqlite")
    const db = new Database(join(root, "activity-custody.sqlite"), { readonly: true })
    try {
      assert.deepEqual(db.query("SELECT receipt FROM activity_arm").all().map((row) => JSON.parse(String((row as { receipt: string }).receipt))), [report.arm])
      const saved = db.query("SELECT identity, outcome, source, destination FROM activity_apply WHERE target_id = ? AND generation = ?")
        .get(report.apply.targetID, report.apply.generation) as { identity: string; outcome: string; source: string; destination: string } | null
      assert.deepEqual({ ...saved }, {
        identity: `${original.dev}:${original.ino}`, outcome: "Out", source, destination,
      })
    } finally {
      db.close()
    }
    process.stdout.write(JSON.stringify({
      status: "pass", custodyUID: 0, desktopUID: uid, sidecarUID: uid, rendererSandbox: true, nativeWayland: true, outerX11Denied: true,
      openFileRefused: true, wrongGitDirectoryRefused: true, nestedNamespaceRefused: true,
      outsideRegistrationRefused: true, gitFilterConfigRefused: true, unsignedCustodyRefused: true, custodyPtyUnavailable: true,
      nativeArmCancel: true, replacementArmRefused: true, staleArmRefused: true, nativeArmConfirmed: true,
      nativeApplyCancel: true, ordinaryPtySwapDenied: true, nativeApplyConfirmed: true, inodePreserved: true, reopenedOut: true,
    }) + "\n")
  } finally {
    frame.fill(0)
    weston?.kill("SIGTERM")
    for (const broker of brokers) broker.kill("SIGKILL")
    await Promise.all(brokers.map((broker) => broker.exited))
    await weston?.exited
    await rm(runtime, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
}

async function child() {
  const { app, BrowserWindow, dialog, ipcMain } = await import("electron")
  const { loadActivityCustody } = await import("../src/main/activity-custody")
  const { startOwnedServe } = await import("../src/main/owned-serve")
  const { registerActivityArmIpc } = await import("../src/main/activity-arm-ipc")
  const { setNativeTranslations } = await import("../src/main/native-translations")
  const { DESKTOP_NATIVE_ENGLISH } = await import("@orchestra/app/i18n/desktop-native")
  assert.ok(process.versions.electron)
  const desktopUID = process.getuid?.()
  assert.ok(desktopUID && desktopUID === Number(process.env.ACTIVITY_ARM_UID))
  assert.equal(app.commandLine.hasSwitch("no-sandbox"), false)
  assert.equal(app.commandLine.getSwitchValue("ozone-platform"), "wayland")
  assert.equal(process.env.XDG_SESSION_TYPE, "wayland")
  assert.equal(process.env.GDK_BACKEND, "wayland")
  assert.equal(process.env.DISPLAY, undefined)
  assert.equal(process.env.XAUTHORITY, undefined)
  const root = process.env.ACTIVITY_ARM_ROOT!
  const session = process.env.ACTIVITY_ARM_SESSION!
  const source = join(root, "worktrees", "worktree", ".turbo")
  const custody = await loadActivityCustody()
  assert.ok(custody, "Desktop must consume the administrator-provided custody FD")
  assert.equal(process.env.ORCHESTRA_ACTIVITY_CUSTODY_FD, undefined)
  assert.equal(process.env.ORCHESTRA_ACTIVITY_CUSTODY_SOCKET, undefined)
  assert.equal((await unixRequest(custody.socketPath, ActivityPrivateChannel.inspectArmPath, "{}")).status, 403)
  assert.equal((await unixRequest(custody.socketPath, ActivityPrivateChannel.applyPreviewPath, "{}")).status, 403)
  assert.equal((await unixRequest(custody.socketPath, ActivityPrivateChannel.applyConfirmPath, "{}")).status, 403)
  const custodyPty = await unixRequest(custody.socketPath, "/api/pty", "{}")
  assert.ok(custodyPty.status === 403 || custodyPty.status === 404, "custody must deny the ordinary PTY API")
  await mkdir(join(session, "electron"))
  app.setPath("userData", join(session, "electron"))
  app.on("window-all-closed", () => {})
  await app.whenReady()
  const page = createServer((_req, response) => response.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>Activity arm fixture</title>"))
  await new Promise<void>((resolve, reject) => { page.once("error", reject); page.listen(0, "127.0.0.1", resolve) })
  const address = page.address()
  if (!address || typeof address === "string") throw new Error("Could not start renderer")
  const rendererURL = `http://127.0.0.1:${address.port}`
  const sidecar = { pid: undefined as number | undefined }
  const owned = await startOwnedServe({
    command: [process.env.ACTIVITY_ARM_BUN!, process.env.ACTIVITY_ARM_CLI!], cwd: session,
    env: { PATH: process.env.PATH ?? "", HOME: session, ORCHESTRA_TEST_HOME: session, ORCHESTRA_DB: join(session, "sidecar.sqlite"),
      ORCHESTRA_CONFIG_DIR: join(session, "config"), ORCHESTRA_DISABLE_MODELS_FETCH: "1", ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
      ORCHESTRA_INHERIT_CREDENTIALS: "0", ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strict",
      HUGR_OMNI_ADDON: process.env.HUGR_OMNI_ADDON, HUGR_OMNI_SUPERVISOR: process.env.HUGR_OMNI_SUPERVISOR },
    custody, privateActivityApproval: true, onSpawn: (pid) => { sidecar.pid = pid },
    logger: { log() {}, error() {} }, write() {},
  })
  let window: InstanceType<typeof BrowserWindow> | undefined
  try {
    await owned.health.wait
    assert.ok(sidecar.pid, "the real ordinary sidecar must expose its process witness")
    const sidecarUID = await processUID(sidecar.pid)
    assert.equal(sidecarUID, desktopUID)
    const authorization = `Basic ${Buffer.from(`${owned.username}:${owned.password}`).toString("base64")}`
    const api = async (path: string, method = "GET", input?: unknown) => fetch(owned.url + path, {
      method, headers: { authorization, "content-type": "application/json" }, body: input === undefined ? undefined : JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
    })
    assert.equal((await api(ActivityPrivateChannel.applyConfirmPath, "POST", { previewID: "unsigned" })).status, 403)
    assert.equal((await api(ActivityPrivateChannel.applyPreviewPath, "POST", {})).status, 403)
    const publicRead = await api("/api/activity/plan")
    assert.equal(publicRead.status, 200)
    assert.equal((await publicRead.json() as ActivityArm.PlanSnapshot).ready.length, 0, "protected targets must never come from the ordinary public API")

    setNativeTranslations({ locale: "en", messages: {
      ...DESKTOP_NATIVE_ENGLISH,
      "desktop.activity.arm.title": "Renderer-supplied title",
      "desktop.activity.arm.message": "Renderer-supplied message",
      "desktop.activity.arm.cancel": "Renderer-supplied cancel",
      "desktop.activity.arm.confirm": "Renderer-supplied confirm",
      "desktop.activity.apply.title": "Renderer-supplied Apply title",
      "desktop.activity.apply.message": "Renderer-supplied Apply message",
      "desktop.activity.apply.cancel": "Renderer-supplied Apply cancel",
      "desktop.activity.apply.confirm": "Renderer-supplied Apply confirm",
    } })
    const nativeResponses: { options: MessageBoxOptions; response: number }[] = []
    const nativeDialog = {
      ...dialog,
      showMessageBox: (async (parent: InstanceType<typeof BrowserWindow>, options: MessageBoxOptions) => {
        const next = JSON.parse(await readFile(join(session, "next-dialog.json"), "utf8")) as { step: number }
        await rename(join(session, "next-dialog.json"), join(session, "dialog.json"))
        await waitFor("trusted compositor window capture", () => lstat(join(session, `dialog-ready-${next.step}`)).catch(() => undefined))
        const result = await dialog.showMessageBox(parent, options)
        nativeResponses.push({ options: { ...options, buttons: options.buttons?.slice() }, response: result.response })
        return result
      }) as typeof dialog.showMessageBox,
    }
    const armClient = owned.openActivityArm()
    const applyClient = owned.openActivityApply()
    assert.ok(armClient && applyClient)
    registerActivityArmIpc({ ipcMain, BrowserWindow, dialog: nativeDialog, rendererDevURL: rendererURL, getOwned: () => owned })
    window = new BrowserWindow({ show: true, webPreferences: { preload: process.env.ACTIVITY_ARM_PRELOAD!, sandbox: true, nodeIntegration: false, contextIsolation: true } })
    await window.loadURL(rendererURL)
    assert.equal(await window.webContents.executeJavaScript("typeof process"), "undefined")
    const rendererStatus = await readFile(`/proc/${window.webContents.getOSProcessId()}/status`, "utf8")
    const rendererSandbox = /^Seccomp:\s+2$/m.test(rendererStatus) && /^NoNewPrivs:\s+1$/m.test(rendererStatus)
    assert.equal(rendererSandbox, true, "the real Chromium renderer must be sandboxed")
    const inspect = async () => await window!.webContents.executeJavaScript(`window.api.inspectActivityArm(${JSON.stringify(owned.url)})`) as ActivityArm.PlanSnapshot
    const state = async () => await window!.webContents.executeJavaScript(`window.api.readActivityApply(${JSON.stringify(owned.url)})`) as ActivityApply.State
    const target = await waitFor("registered target through Desktop IPC", async () => (await inspect())?.ready.find((item) => item.label === source))
    assert.ok((await state()).custodyPlan?.ready.some((item) => item.targetID === target.targetID), "signed Plan must include the protected target")

    let step = 0
    const shown = (mode: "cancel" | "change" | "confirm", title: string, message: string, detail: string) => {
      assert.equal(nativeResponses.length, step, `expected a native dialog for step ${step}`)
      const result = nativeResponses[step - 1]!
      assert.equal(result.response, mode === "cancel" ? 0 : 1)
      assert.equal(result.options.title, title)
      assert.equal(result.options.message, message)
      assert.deepEqual(result.options.buttons, ["Cancel", title])
      assert.equal(result.options.defaultId, 0)
      assert.equal(result.options.cancelId, 0)
      assert.equal(result.options.detail, detail)
    }
    const arm = async (mode: "cancel" | "change" | "confirm", item: ActivityArm.Target) => {
      const request = { targets: [{ targetID: item.targetID, generation: item.generation }] }
      await writeFile(join(session, "next-dialog.json"), JSON.stringify({ step: ++step, mode }))
      const receipt = await window!.webContents.executeJavaScript(`window.api.armActivityQuarantine(${JSON.stringify(owned.url)}, ${JSON.stringify(request)})`) as ActivityArm.Receipt | undefined
      shown(mode, "Arm quarantine", "Arm quarantine for these targets?",
        `${JSON.stringify(item.label)} — ${JSON.stringify(projectID)}\nID: ${JSON.stringify(item.targetID)}\nGeneration: ${JSON.stringify(item.generation)}`)
      return receipt
    }
    assert.equal(await arm("cancel", target), undefined)
    assert.equal((await state()).custodyPlan?.approvals.length, 0, "cancelling Arm must leave no receipt")
    const stale = await armClient.preview({ targets: [{ targetID: target.targetID, generation: target.generation }] })
    assert.ok(stale)
    assert.equal(await arm("change", target), undefined, "a replacement in the Arm modal must invalidate the approved identity")
    assert.equal((await state()).custodyPlan?.approvals.length, 0)
    assert.equal(await armClient.confirm({ previewID: stale.previewID }), undefined, "a stale preview cannot arm")
    await writeFile(join(session, "restore-source"), "")
    await waitFor("fixture source restoration", () => lstat(join(session, "source-restored")).catch(() => undefined))
    const current = await waitFor("restored target through Desktop IPC", async () => (await inspect())?.ready.find((item) => item.targetID === target.targetID))
    const armReceipt = await arm("confirm", current)
    assert.ok(armReceipt)
    assert.deepEqual((await state()).custodyPlan?.approvals[0]?.receipt, armReceipt)
    const request = { approvalID: armReceipt.approvalID, targetID: current.targetID, generation: current.generation }
    const armed = await state()
    assert.equal(armed.available, true)
    assert.deepEqual(armed.eligible, [request])
    const preview = await applyClient.preview(request)
    assert.ok(preview)
    assert.equal(preview.target.label, source)
    const destination = join(root, "quarantine", "q-" + createHash("sha256").update(JSON.stringify([current.targetID, current.generation])).digest("hex"))
    assert.equal(preview.destination, destination)
    const apply = async (mode: "cancel" | "confirm") => {
      await writeFile(join(session, "next-dialog.json"), JSON.stringify({ step: ++step, mode, apply: true }))
      // Start a real ordinary-sidecar PTY workload while the native Apply dialog is visible.
      const attack = mode === "confirm" ? (async () => {
        await waitFor("visible native Apply dialog", () => lstat(join(session, "attack-request")).catch(() => undefined))
        const output = join(session, "pty-result.json")
        const outer = JSON.parse(await readFile(process.env.ACTIVITY_ARM_OUTER_X11!, "utf8")) as { display: string; authority: string }
        const started = await api("/api/pty", "POST", {
          command: python, args: ["-c", sourceSwap, source, output, join(root, "desktop.credential"), String(process.pid), outer.display, outer.authority],
        })
        assert.equal(started.status, 200, "the regular sidecar must still serve its real PTY API")
        const created = await started.json() as { data: { id: string; pid: number } }
        assert.ok(created.data.id)
        await waitFor("PTY workload to exit", async () => {
          const response = await api(`/api/pty/${created.data.id}`)
          assert.equal(response.status, 200)
          const pty = await response.json() as { data: { status: string; exitCode?: number } }
          if (pty.data.status !== "exited") return undefined
          assert.equal(pty.data.exitCode, 0)
          return true
        })
        const attack = JSON.parse(await readFile(output, "utf8")) as {
          uid: number; pid: number; errno?: string; renamed: boolean; sentinel: boolean
          credential: boolean; inheritedCredential: boolean; desktopMemory: boolean; custodyEnvironment: string[]
          x11Environment: string[]; outerAuthorization: boolean; outerConnection: boolean
        }
        assert.equal(attack.pid, created.data.pid)
        assert.equal(attack.uid, desktopUID, "the real workload must have the ordinary Desktop UID")
        assert.ok(attack.errno === "EACCES" || attack.errno === "EPERM", "the kernel must deny replacement of the protected source")
        assert.equal(attack.renamed, false)
        assert.equal(attack.sentinel, false)
        assert.equal(attack.credential, false)
        assert.equal(attack.inheritedCredential, false)
        assert.equal(attack.desktopMemory, false)
        assert.deepEqual(attack.custodyEnvironment, [])
        assert.deepEqual(attack.x11Environment, [])
        assert.equal(attack.outerAuthorization, false, "the PTY cannot read the administrator's outer X11 credential")
        assert.equal(attack.outerConnection, false, "the PTY cannot connect to the outer input server")
        await writeFile(join(session, "attack-complete"), "")
      })() : Promise.resolve()
      const [result] = await Promise.all([
        window!.webContents.executeJavaScript(`window.api.applyActivityQuarantine(${JSON.stringify(owned.url)}, ${JSON.stringify(request)})`) as Promise<ActivityApply.Receipt | undefined>,
        attack,
      ])
      shown(mode, "Apply quarantine", "Apply quarantine to this object?",
        `Approval: ${JSON.stringify(request.approvalID)}\nTarget: ${JSON.stringify(request.targetID)}\nPath: ${JSON.stringify(source)}\nGeneration: ${JSON.stringify(request.generation)}\nDestination: ${JSON.stringify(destination)}`)
      return result
    }
    assert.equal(await apply("cancel"), undefined)
    assert.deepEqual((await state()).results, [], "cancelling Apply must leave no recorded attempt")
    const applyReceipt = await apply("confirm")
    assert.ok(applyReceipt)
    assert.equal(applyReceipt.approvalID, request.approvalID)
    assert.equal(applyReceipt.targetID, request.targetID)
    assert.equal(applyReceipt.generation, request.generation)
    assert.equal(applyReceipt.outcome, "Out")
    assert.notEqual(applyReceipt.previewID, preview.previewID)
    const reread = await state()
    assert.equal(reread.results.find((item) => item.targetID === request.targetID && item.generation === request.generation)?.outcome, "Out")
    await writeFile(join(session, "report.json"), JSON.stringify({ desktopUID, sidecarUID, rendererSandbox, arm: armReceipt, apply: applyReceipt }))
  } finally {
    window?.destroy()
    page.close()
    await owned.listener.stop()
  }
}

async function handleDialogs(session: string, source: string, quarantine: string, original: { dev: bigint; ino: bigint }, desktopPID: number, uid: number, window: string, signal: AbortSignal) {
  let handled = 0
  while (!signal.aborted) {
    if (await lstat(join(session, "restore-source")).catch(() => undefined)) {
      await rm(join(session, "restore-source"))
      await rm(source, { recursive: true })
      await rename(`${source}.original`, source)
      await writeFile(join(session, "source-restored"), "")
    }
    const next = await readFile(join(session, "dialog.json"), "utf8").then(
      (body) => JSON.parse(body) as { step: number; mode: "cancel" | "change" | "confirm"; apply?: boolean },
      (error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error },
    )
    if (next && next.step > handled) {
      assert.equal(await processUID(desktopPID), uid, "the Electron main process must run as the ordinary user")
      await run("xdotool", ["windowfocus", "--sync", window])
      const baseline = await westonFrame(window)
      await writeFile(join(session, `dialog-ready-${next.step}`), "", { flag: "wx" })
      // The outer window belongs to Weston. A real Wayland dialog changes the composed pixels inside it.
      let previous = baseline
      await waitFor("native Wayland dialog to paint", async () => {
        const frame = await westonFrame(window)
        const painted = frame !== baseline && frame === previous
        previous = frame
        return painted
      })
      if (next.mode === "change") {
        await rename(source, `${source}.original`)
        await mkdir(source, { mode: 0o700 })
        await writeFile(join(source, "payload"), "replacement\n")
      }
      if (next.mode === "confirm" && next.apply) {
        const afterCancel = await lstat(source, { bigint: true })
        assert.equal(`${afterCancel.dev}:${afterCancel.ino}`, `${original.dev}:${original.ino}`, "native cancellation must keep the source inode")
        assert.deepEqual(await readdir(quarantine), [], "native cancellation must leave quarantine empty")
        await writeFile(join(session, "attack-request"), "")
        await waitFor("ordinary PTY source replacement attempt", () => lstat(join(session, "attack-complete")).catch(() => undefined))
        const afterAttack = await lstat(source, { bigint: true })
        assert.equal(`${afterAttack.dev}:${afterAttack.ino}`, `${original.dev}:${original.ino}`)
      }
      await run("xdotool", next.mode === "cancel" ? ["key", "Return"] : ["key", "Tab", "Return"])
      handled = next.step
    }
    await delay(75)
  }
}

async function westonFrame(window: string) {
  const capture = Bun.spawn(["xwd", "-silent", "-id", window], { stdout: "pipe", stderr: "inherit" })
  const image = await new Response(capture.stdout).arrayBuffer()
  assert.equal(await capture.exited, 0, "could not capture the outer Weston window")
  assert.ok(image.byteLength > 100_000)
  return createHash("sha256").update(new Uint8Array(image)).digest("hex")
}

const sourceSwap = `import errno, json, os, subprocess, sys
source, output, credential_file, desktop_pid, outer_display, outer_authority = sys.argv[1:]
moved = source + ".attacker"
sentinel = os.path.join(source, "sentinel")
result = {"uid": os.getuid(), "pid": os.getpid(), "custodyEnvironment": [key for key in os.environ if key.startswith("ORCHESTRA_ACTIVITY_CUSTODY_")]}
try:
    with open(credential_file, "rb"):
        result["credential"] = True
except PermissionError:
    result["credential"] = False
result["inheritedCredential"] = False
for name in os.listdir("/proc/self/fd"):
    try:
        result["inheritedCredential"] |= os.readlink("/proc/self/fd/" + name) == credential_file
    except FileNotFoundError:
        pass
try:
    with open("/proc/" + desktop_pid + "/mem", "rb"):
        result["desktopMemory"] = True
except PermissionError:
    result["desktopMemory"] = False
result["x11Environment"] = [key for key in ("DISPLAY", "XAUTHORITY") if key in os.environ]
try:
    with open(outer_authority, "rb"):
        result["outerAuthorization"] = True
except PermissionError:
    result["outerAuthorization"] = False
outer = subprocess.run(["/usr/bin/xdotool", "getdisplaygeometry"],
    env={"DISPLAY": outer_display, "XAUTHORITY": outer_authority}, capture_output=True, timeout=5)
result["outerConnection"] = outer.returncode == 0
try:
    os.rename(source, moved)
    os.mkdir(source)
    with open(sentinel, "w", encoding="utf-8") as file:
        file.write("attacker replacement")
except OSError as error:
    result["errno"] = errno.errorcode.get(error.errno, str(error.errno))
result.update({"renamed": os.path.exists(moved), "sentinel": os.path.exists(sentinel)})
with open(output, "w", encoding="utf-8") as file:
    json.dump(result, file)
`

async function unixRequest(socketPath: string, path: string, body: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number | undefined; mac: string | null; body: string }>((resolve, reject) => {
    const req = request({ socketPath, path, method: "POST", agent: false, signal: AbortSignal.timeout(15_000),
      headers: { ...headers, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) } }, (response) => {
      const chunks: Buffer[] = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.once("error", reject)
      response.once("end", () => {
        const mac = response.headers[ActivityPrivateChannel.macHeader]
        resolve({ status: response.statusCode, mac: typeof mac === "string" ? mac : null, body: Buffer.concat(chunks).toString("utf8") })
      })
    })
    req.once("error", reject)
    req.end(body)
  })
}

async function processUID(pid: number) {
  const status = await readFile(`/proc/${pid}/status`, "utf8")
  const record = status.match(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m)
  assert.ok(record, `missing UID witness for process ${pid}`)
  const ids = record.slice(1).map(Number)
  assert.ok(ids.every((uid) => uid === ids[0]), `process ${pid} has differing real, effective, saved or filesystem UIDs`)
  return ids[0]
}

async function waitFor<T>(description: string, attempt: () => Promise<T | undefined | false>) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const outcome = await attempt()
    if (outcome) return outcome
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

async function run(command: string, args: string[]) {
  const child = Bun.spawn([command, ...args], { stdout: "ignore", stderr: "pipe" })
  const error = new Response(child.stderr).text()
  const timeout = setTimeout(() => child.kill("SIGKILL"), 10_000)
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
