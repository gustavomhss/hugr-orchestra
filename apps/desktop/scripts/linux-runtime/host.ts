import { app, BrowserWindow, session, WebContentsView } from "electron"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { randomBytes, X509Certificate } from "node:crypto"
import { createAppDock } from "../../src/main/app-dock"
import { Runtime } from "./runtime"

async function main() {
  const root = process.env.APP_DOCK_PROOF_ROOT!
  const container = process.env.APP_DOCK_PROOF_CONTAINER!
  const progress: Record<string, unknown> = { status: "incomplete" }
  const checkpoint = async (phase: string, data: Record<string, unknown> = {}) => {
    Object.assign(progress, { phase }, data)
    await writeFile(join(root, "progress.json"), JSON.stringify(progress, null, 2))
  }
  await checkpoint("boot")
  app.setPath("userData", join(root, "electron"))
  await app.whenReady()
  if (process.platform === "darwin") {
    app.setActivationPolicy("regular")
    app.show()
    app.focus({ steal: true })
  }
  const watchdog = setTimeout(() => app.exit(1), 180_000)
  const storageKey = randomBytes(16).toString("hex")
  session.fromPartition(`persist:app-dock-${storageKey}`).setCertificateVerifyProc((request, callback) => {
    callback(request.hostname === "127.0.0.1" && new X509Certificate(request.certificate.data).fingerprint256.toLowerCase() === process.env.APP_DOCK_PROOF_FINGERPRINT!.toLowerCase() ? 0 : -3)
  })
  const win = new BrowserWindow({ width: 1000, height: 720, webPreferences: { sandbox: true, contextIsolation: true } })
  await win.loadURL("data:text/html,<title>Orchestra Linux App Dock proof</title>")
  const dock = createAppDock()
  const bounds = { x: 0, y: 0, width: 1000, height: 680 }
  const connect = new URL(process.env.APP_DOCK_PROOF_URL!)
  connect.pathname = "/connect.html"
  const tab = await dock.open(win.webContents.id, win, connect.toString(), bounds, () => {}, { storageKey })
  const view = win.contentView.children.find((child) => child instanceof WebContentsView)
  if (!(view instanceof WebContentsView)) throw new Error("App Dock did not attach its real WebContentsView")
  const contents = view.webContents
  win.show()
  win.focus()
  contents.focus()
  contents.on("console-message", (event) => {
    if (event.level === "error") console.error(event.message)
  })
  await Runtime.waitFor(async () => contents.executeJavaScript("typeof Utilities !== 'undefined' && !!Utilities.setSessionStorageValue").catch(() => false), "Xpra client configuration page")
  await contents.executeJavaScript(`Utilities.setSessionStorageValue("password", ${JSON.stringify(process.env.APP_DOCK_PROOF_PASSWORD!)})`)
  await contents.loadURL(process.env.APP_DOCK_PROOF_URL!)
  await Runtime.waitFor(async () => contents.executeJavaScript(`typeof client !== "undefined" && client.connected && Object.values(client.id_to_window).some(w => w.title === "Orchestra GTK latency probe")`).catch(() => false), "native GTK window in App Dock")
  const windows = await contents.executeJavaScript(`Object.values(client.id_to_window).map(w => ({ id: w.wid, title: w.title, classes: w.metadata["class-instance"] }))`) as Array<{ id: number; title: string; classes: string[] }>
  if (!windows.some((window) => window.classes?.some((name) => /mousepad/i.test(name)))) throw new Error("Real Mousepad GTK window missing")
  if (!windows.some((window) => window.classes?.some((name) => /featherpad/i.test(name)))) throw new Error("Real FeatherPad Qt window missing")
  await contents.executeJavaScript(`(() => {
    const target = Object.values(client.id_to_window).find(w => w.title === "Orchestra GTK latency probe");
    target.focus();
    client.request_refresh(target.wid);
  })()`)
  await Runtime.waitFor(async () => contents.executeJavaScript(`(() => {
    const target = Object.values(client.id_to_window).find(w => w.title === "Orchestra GTK latency probe");
    const pixel = target.canvas_ctx.getImageData(Math.floor(Math.min(target.canvas.width, target.draw_canvas.width) / 2), Math.floor(Math.min(target.canvas.height, target.draw_canvas.height) / 2), 1, 1).data;
    return pixel[3] === 255 && pixel.slice(0, 3).every(value => value < 3);
  })()`), "first native GTK pixels").catch(async (error: unknown) => {
    await checkpoint("native-pixel-failure", { windows, canvas: await contents.executeJavaScript(`(() => {
      const target = Object.values(client.id_to_window).find(w => w.title === "Orchestra GTK latency probe");
      return { width: target.canvas.width, height: target.canvas.height, drawWidth: target.draw_canvas.width, drawHeight: target.draw_canvas.height, pixel: [...target.canvas_ctx.getImageData(128, 128, 1, 1).data], hidden: document.hidden, connected: client.connected };
    })()`), native: { windowVisible: win.isVisible(), minimized: win.isMinimized(), viewVisible: view.getVisible(), appHidden: process.platform === "darwin" ? app.isHidden() : false } })
    throw error
  })
  await contents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))")
  await checkpoint("apps-rendered", { windows })
  await writeFile(join(root, "apps.png"), (await contents.capturePage()).toPNG())
  const focusProbe = async () => {
    win.show()
    win.focus()
    contents.focus()
    const geometry = await contents.executeJavaScript(`(() => {
      const target = Object.values(client.id_to_window).find(w => w.title === "Orchestra GTK latency probe");
      target.focus();
      const rect = target.canvas.getBoundingClientRect();
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    })()`)
    contents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...geometry })
    contents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...geometry })
    await Runtime.waitFor(async () => contents.executeJavaScript(`client.capture_keyboard && client.focused_wid === Object.values(client.id_to_window).find(w => w.title === "Orchestra GTK latency probe").wid`), "native GTK keyboard focus")
  }
  await focusProbe()
  await contents.executeJavaScript(`(() => {
    const target = Object.values(client.id_to_window).find(w => w.title === "Orchestra GTK latency probe");
    const state = { wid: target.wid, pending: null, expected: 0, delay: 0, samples: [], frames: 0 };
    window.__dockProof = state;
    const draw = target.draw.bind(target);
    target.draw = function() {
      draw();
      state.frames++;
      if (!state.pending || state.pending.started === null) return;
      const pixel = target.canvas_ctx.getImageData(Math.floor(Math.min(target.canvas.width, target.draw_canvas.width) / 2), Math.floor(Math.min(target.canvas.height, target.draw_canvas.height) / 2), 1, 1).data;
      if (pixel[3] !== 255 || !pixel.slice(0, 3).every(value => Math.abs(value - state.expected * 255) < 3)) return;
      state.samples.push(performance.now() - state.pending.started);
      state.pending = null;
    };
    const send = client.protocol.send.bind(client.protocol);
    client.protocol.send = function(packet) {
      const key = packet[0] === "key-action" && packet[1] === state.wid;
      if (key && packet[3] && state.pending && state.pending.started === null) state.pending.started = performance.now();
      if (key && state.delay) return setTimeout(() => send(packet), state.delay);
      return send(packet);
    };
  })()`)
  const sample = async () => {
    const admission = await contents.executeJavaScript(`(() => {
      if (!client.connected) return "disconnected";
      const state = window.__dockProof;
      if (client.focused_wid !== state.wid) return "unfocused";
      state.expected = 1 - state.expected;
      state.pending = { started: null };
      return "ready";
    })()`)
    if (admission === "disconnected") throw new Error("Runtime disconnected")
    if (admission !== "ready") throw new Error("Native probe does not own keyboard focus")
    contents.sendInputEvent({ type: "keyDown", keyCode: "A" })
    contents.sendInputEvent({ type: "keyUp", keyCode: "A" })
    await Runtime.waitFor(async () => contents.executeJavaScript("window.__dockProof.pending === null"), "input-caused native canvas update")
  }
  await sample()
  await contents.executeJavaScript("window.__dockProof.samples = []")
  for (const _ of Array.from({ length: 30 })) await sample()
  const baseline = await contents.executeJavaScript("window.__dockProof.samples.slice()") as number[]
  await contents.executeJavaScript("window.__dockProof.delay = 100; window.__dockProof.samples = []")
  for (const _ of Array.from({ length: 5 })) await sample()
  const delayed = await contents.executeJavaScript("window.__dockProof.samples.slice()") as number[]
  await contents.executeJavaScript("window.__dockProof.delay = 0")
  const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]!
  if (median(delayed) - median(baseline) < 70) throw new Error("Latency probe failed injected-delay calibration")
  await checkpoint("latency-calibrated", { baseline, delayed })

  const resources = async (phase: string) => {
    const before = await Runtime.stats(container)
    const started = performance.now()
    app.getAppMetrics()
    const frames = await contents.executeJavaScript("window.__dockProof.frames") as number
    await new Promise((resolve) => setTimeout(resolve, 10_000))
    const after = await Runtime.stats(container)
    return {
      phase,
      seconds: (performance.now() - started) / 1000,
      guestCPUPercent: (after.cpuUsec - before.cpuUsec) / ((performance.now() - started) * 10),
      guestMemoryBytes: after.memoryBytes,
      guestWorkingSetBytes: after.memoryBytes - after.inactiveFileBytes,
      hostProcesses: app.getAppMetrics().map((metric) => ({ type: metric.type, cpu: metric.cpu.percentCPUUsage, workingSetKiB: metric.memory.workingSetSize })),
      probeFrames: (await contents.executeJavaScript("window.__dockProof.frames") as number) - frames,
      pageHidden: await contents.executeJavaScript("document.hidden") as boolean,
      vm: await Runtime.vmStats(),
    }
  }
  const visible = await resources("visible-idle")
  await contents.executeJavaScript('client.send(["suspend"]); true')
  dock.hide(win.webContents.id, win)
  const hidden = await resources("hidden-idle")
  await checkpoint("idle-measured", { resources: [visible, hidden] })
  dock.select(win.webContents.id, win, tab.tabID, bounds)
  await contents.executeJavaScript('client.send(["resume"]); client.redraw_windows(); true')
  await focusProbe()
  contents.sendInputEvent({ type: "keyDown", keyCode: "B" })
  contents.sendInputEvent({ type: "keyUp", keyCode: "B" })
  const animated = await resources("visible-animation")
  if (animated.probeFrames < 50) throw new Error("Native animation did not produce enough visible frames")
  await contents.executeJavaScript('client.send(["suspend"]); true')
  dock.hide(win.webContents.id, win)
  const hiddenAnimated = await resources("hidden-animation")
  if (hiddenAnimated.probeFrames > animated.probeFrames / 10) throw new Error("Hidden native animation continued excessive canvas redraws")
  dock.select(win.webContents.id, win, tab.tabID, bounds)
  await contents.executeJavaScript('client.send(["resume"]); client.redraw_windows(); true')
  win.show()
  win.focus()
  contents.focus()
  await focusProbe()
  const restored = await resources("restored-animation")
  await checkpoint("animation-measured", { resources: [visible, hidden, animated, hiddenAnimated, restored] })
  if (restored.probeFrames < 50) throw new Error("Native animation did not resume after restoring App Dock")
  await contents.executeJavaScript(`Object.values(client.id_to_window).find(w => w.title === "Orchestra GTK latency probe").focus(); true`)
  contents.sendInputEvent({ type: "keyDown", keyCode: "B" })
  contents.sendInputEvent({ type: "keyUp", keyCode: "B" })
  await checkpoint("animation-measured", { resources: [visible, hidden, animated, hiddenAnimated, restored] })
  await contents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))")
  await writeFile(join(root, "probe.png"), (await contents.capturePage()).toPNG())
  const controlBefore = await Runtime.stats(container)
  const controlStarted = performance.now()
  const load = Runtime.docker(["exec", container, "python3", "-c", "import time; data=bytearray(32*1024*1024); deadline=time.monotonic()+5\nwhile time.monotonic()<deadline: pass"])
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const controlDuring = await Runtime.stats(container)
  const controlCPU = (controlDuring.cpuUsec - controlBefore.cpuUsec) / ((performance.now() - controlStarted) * 10)
  await load
  if (controlCPU < 20 || controlDuring.memoryBytes - controlBefore.memoryBytes < 16 * 1024 * 1024) throw new Error("Resource instrument failed CPU/allocation positive control")
  await contents.executeJavaScript("client.reconnect = false; client.callback_close = () => {}; true")
  await Runtime.docker(["stop", "--time", "2", container])
  await Runtime.waitFor(async () => contents.executeJavaScript("!client.connected"), "stopped runtime disconnect")
  const disconnected = await sample().then(() => false, (error: unknown) => String(error).includes("Runtime disconnected"))
  if (!disconnected) throw new Error("Disconnected runtime did not fail latency probe")
  const sorted = baseline.toSorted((a, b) => a - b)
  await writeFile(join(root, "report.json"), JSON.stringify({
    version: 1,
    scope: "macOS x86_64, Linux amd64, real App Dock WebContentsView, GTK and Qt desktop apps; no Windows validation",
    metric: "key enqueue to verified native-app canvas update; excludes display scanout; offscreen=0 adds readback instrumentation",
    electron: process.versions.electron,
    settings: { encoding: process.env.APP_DOCK_PROOF_ENCODING ?? "auto", batchMinDelay: process.env.XPRA_BATCH_MIN_DELAY ?? "default", batchStartDelay: process.env.XPRA_BATCH_START_DELAY ?? "default" },
    windows,
    latency: { samples: baseline, p50: median(baseline), p95: sorted[Math.ceil(sorted.length * 0.95) - 1], injectedDelayMedian: median(delayed) },
    controls: { injectedDelayDetected: true, disconnectedRejected: disconnected, resourceLoadCPUPercent: controlCPU, resourceLoadMemoryDeltaBytes: controlDuring.memoryBytes - controlBefore.memoryBytes },
    resources: [visible, hidden, animated, hiddenAnimated, restored],
  }, null, 2))
  clearTimeout(watchdog)
  dock.closeAll(win.webContents.id, win)
  win.destroy()
  app.exit(0)
}

void main().catch(async (error) => {
  console.error(error)
  await writeFile(join(process.env.APP_DOCK_PROOF_ROOT!, "error.txt"), String(error))
  app.exit(1)
})
