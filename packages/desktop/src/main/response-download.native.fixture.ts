import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { open, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { app, BrowserWindow, ipcMain } from "electron"
import { registerResponseDownloadIpc } from "./response-download"

const root = process.env.RESPONSE_DOWNLOAD_FIXTURE_ROOT
if (!root) throw new Error("Missing owned response download fixture root")
app.setPath("userData", join(root, "profile"))
app.commandLine.appendSwitch("disable-gpu")

void main(root).catch((error: unknown) => { console.error(error); app.exit(1) })

async function main(root: string) {
  await app.whenReady()
  const deadline = setTimeout(() => { console.error("Native response save deadline exceeded"); app.exit(2) }, 30000)
  const destination = join(root, "fixture.bin")
  const choice = { mode: "save", pending: Promise.withResolvers<{ canceled: boolean; filePath: string }>(), entered: Promise.withResolvers<void>() }
  const metrics = { closes: 0 }
  const registry = registerResponseDownloadIpc({
    ipcMain, app, BrowserWindow,
    choose: async () => {
      if (choice.mode === "cancel") return { canceled: true }
      if (choice.mode === "denied") throw Object.assign(new Error("fixture denied"), { code: "EACCES" })
      if (choice.mode === "pending") { choice.entered.resolve(); return choice.pending.promise }
      return { canceled: false, filePath: destination }
    },
    open: async (path) => {
      const file = await open(path, "wx", 0o600)
      return { write: (bytes, offset, length) => file.write(bytes, offset, Math.min(length, 1021)),
        close: () => { metrics.closes++; return file.close() } }
    },
  })
  const window = () => new BrowserWindow({ show: false, webPreferences: {
    preload: join(root, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false,
    // Test adversarial subframe IPC against the actual preload too.
    nodeIntegrationInSubFrames: true,
  } })
  const owned = window()
  const foreign = window()
  const execute = (source: BrowserWindow, script: string) => source.webContents.executeJavaScript(script)
  const temporary = async () => (await readdir(root)).filter((name) => name.startsWith(".orchestra-download-"))
  try {
    await Promise.all([owned.loadFile(join(root, "fixture.html")), foreign.loadFile(join(root, "fixture.html"))])
    assert.equal(await execute(owned, "typeof window.api.responseDownload.write"), "function", "Actual preload missing save bridge")
    assert.deepEqual(await execute(owned, "window.responseSaveFixture.download('bytes')"), { status: "ok", pulls: 128, cancels: 0 })
    const actual = createHash("sha256")
    for await (const chunk of createReadStream(destination)) actual.update(chunk)
    const expected = createHash("sha256")
    for (let index = 0; index < 128; index++) expected.update(new Uint8Array(4096).fill(index))
    assert.equal(actual.digest("hex"), expected.digest("hex"), "Native saved bytes differ")
    assert.deepEqual(await temporary(), [])
    assert.equal(metrics.closes, 1)

    choice.mode = "cancel"
    assert.deepEqual(await execute(owned, "window.responseSaveFixture.download('bytes')"), { status: "error", name: "AbortError", message: "", pulls: 0, cancels: 1 })
    assert.deepEqual(await execute(owned, "window.responseSaveFixture.download('clone')"), {
      status: "error", name: "AbortError", message: "", pulls: 0, cancels: 0, locked: false,
    }, "Live clone branch must not retain failed save or reader lock")
    choice.mode = "denied"
    const denied = await execute(owned, "window.responseSaveFixture.download('bytes')")
    assert.equal(denied.name, "NotAllowedError")
    assert.equal(denied.message, "permission_denied")

    choice.mode = "save"
    await writeFile(destination, "prior file")
    const broken = await execute(owned, "window.responseSaveFixture.download('error')")
    assert.equal(broken.message, "fixture stream failure")
    const prior = createHash("sha256")
    for await (const chunk of createReadStream(destination)) prior.update(chunk)
    assert.equal(prior.digest("hex"), createHash("sha256").update("prior file").digest("hex"))
    assert.deepEqual(await temporary(), [])

    const started = await execute(owned, "window.api.responseDownload.start('fixture.bin')")
    assert.equal(started.status, "ok")
    assert.equal((await execute(owned, `window.api.responseDownload.ready(${JSON.stringify(started.handle)})`)).status, "ok")
    for (const call of ["ready", "write", "finish", "cancel"]) {
      const args = call === "write" ? ", 0, new ArrayBuffer(1)" : call === "finish" ? ", 0" : ""
      assert.equal((await execute(foreign, `window.api.responseDownload.${call}(${JSON.stringify(started.handle)}${args})`)).code, "permission_denied")
    }
    await execute(owned, "new Promise(resolve => { const frame = document.createElement('iframe'); frame.src = location.href; frame.onload = () => resolve(true); document.body.append(frame) })")
    const frame = owned.webContents.mainFrame.frames[0]
    assert.ok(frame, "Adversarial subframe missing")
    assert.equal(await frame.executeJavaScript("typeof window.api.responseDownload.write"), "function", "Subframe positive control missing")
    assert.equal((await frame.executeJavaScript(`window.api.responseDownload.write(${JSON.stringify(started.handle)}, 0, new ArrayBuffer(1))`)).code, "permission_denied")
    assert.equal((await execute(owned, `window.api.responseDownload.write(${JSON.stringify(started.handle)}, 0, new ArrayBuffer(65537))`)).code, "transfer_failed")
    assert.equal((await execute(owned, `window.api.responseDownload.write(${JSON.stringify(started.handle)}, 0, new Uint8Array([0,255]).buffer)`)).status, "ok")
    assert.equal((await execute(owned, `window.api.responseDownload.cancel(${JSON.stringify(started.handle)})`)).status, "cancelled")

    choice.mode = "pending"
    const pending = execute(owned, "window.responseSaveFixture.download('pending')")
    await choice.entered.promise
    await execute(owned, "window.responseSaveFixture.abort()")
    assert.equal((await pending).name, "AbortError")
    choice.pending.resolve({ canceled: false, filePath: destination })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.deepEqual(await temporary(), [])

    choice.mode = "save"
    const dying = await execute(owned, "window.api.responseDownload.start('fixture.bin')")
    assert.equal((await execute(owned, `window.api.responseDownload.ready(${JSON.stringify(dying.handle)})`)).status, "ok")
    assert.equal((await temporary()).length, 1, "Renderer death positive control requires live temp file")
    const gone = new Promise<void>((resolve) => owned.webContents.once("render-process-gone", () => resolve()))
    owned.webContents.forcefullyCrashRenderer()
    await gone
    const until = Date.now() + 5000
    while ((await temporary()).length && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 20))
    assert.deepEqual(await temporary(), [], "Renderer crash retained partial file")
    console.log("response-download-native:pass")
  } finally {
    choice.pending.resolve({ canceled: true, filePath: destination })
    await registry.clear()
    if (!owned.isDestroyed()) owned.destroy()
    if (!foreign.isDestroyed()) foreign.destroy()
    clearTimeout(deadline)
    app.quit()
  }
}
