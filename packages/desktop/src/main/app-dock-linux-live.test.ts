import assert from "node:assert/strict"
import { execFile, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import type { AppDockEvent } from "./app-dock"

// Run from packages/desktop with APP_DOCK_LINUX_INTEGRATION=1 and
// APP_DOCK_RUNTIME_TEST_IMAGE=<existing image>. No image build or pull is allowed.
// Optional MAIN_ROOT/COORDINATOR overrides resolve relative imports against an
// in-flight integration tree; the landed test uses its adjacent implementations.
const flag = "--app-dock-linux-live-child"
const label = "io.orchestra.app-dock"
const exec = promisify(execFile)
const cases = [
  "startup-invalidation",
  "authenticated-xterm",
  "console-privacy",
  "browser-boundary",
  "browser-login-bridge",
  "installed-gtk",
  "visibility",
  "owner-visibility",
  "reuse-recovery",
  "browser-popup",
  "foreign-origin",
  "persistence",
  "unrelated-view-close",
]
type Metadata = { owner: string; containerID?: string; dockerContext: string; password: string }

async function docker(context: string, args: string[]) {
  return exec("docker", ["--context", context, ...args], {
    timeout: 60_000,
    killSignal: "SIGKILL",
    maxBuffer: 2 * 1024 * 1024,
  })
}

async function wait(predicate: () => Promise<boolean>, phase: string) {
  const deadline = Date.now() + 20_000
  while (!(await predicate())) {
    assert(Date.now() < deadline, `Timed out waiting for ${phase}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

async function child() {
  const { app, BrowserWindow } = await import("electron")
  const { createAppDock } = await import("./app-dock")
  const { AppDockLinux } = await import("./app-dock-linux")
  const { AppDockRuntime } = await import("./app-dock-runtime")
  const { initLogging } = await import("./logging")
  assert(process.versions.electron, "This child requires actual Electron")
  const root = process.env.APP_DOCK_LINUX_TEST_ROOT!
  const runtimeRoot = join(root, "runtime")
  await mkdir(join(root, "electron"), { recursive: true })
  app.setPath("userData", join(root, "electron"))
  const logger = initLogging()
  logger.transports.console.level = false
  await app.whenReady()
  const runtime = AppDockRuntime.create({
    root: runtimeRoot,
    context: resolve("resources/linux-runtime"),
    image: process.env.APP_DOCK_RUNTIME_TEST_IMAGE,
  })
  const events: AppDockEvent[] = []
  const evidence: Record<string, unknown> = {}
  const report = { version: 1, status: "incomplete", cases: evidence, navigation: [] as string[] }
  const observed = new Set<number>()
  const hooks = { linux: undefined as ReturnType<typeof AppDockLinux.create> | undefined }
  const dock = createAppDock({
    developmentMode: () => false,
    onVisibility: (sender, identity, visible) => {
      hooks.linux?.visibility(sender, identity, visible)
      const contents = dock.contents(sender, identity.tabID)
      if (observed.has(contents.id)) return
      observed.add(contents.id)
      contents.on("did-navigate", (_event, url) => report.navigation.push(new URL(url).pathname))
    },
    onClosed: (sender, identity) => hooks.linux?.closed(sender, identity),
    allowPopup: (sender, identity, url) => hooks.linux?.allowPopup(sender, identity, url) ?? true,
    onPopupOpened: (sender, parent, tab) => hooks.linux?.popupOpened(sender, parent, tab),
    onExternalURL: (sender, identity, url) => hooks.linux?.externalURL(sender, identity, url),
  })
  const linux = AppDockLinux.create({ dock, runtime, notify: (_sender, event) => events.push(event) })
  hooks.linux = linux
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: true,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
  })
  const sender = win.webContents.id
  const bounds = { x: 0, y: 0, width: 900, height: 660 }
  const profile = { storageKey: randomUUID().replaceAll("-", "") }
  await win.loadURL("data:text/html,<title>Linux App Dock functional test</title>")
    const ownerListeners = [win.listenerCount("show"), win.listenerCount("hide"), win.listenerCount("minimize"), win.listenerCount("restore"), win.listenerCount("resize")]
  try {
    // Cancel while real runtime.start() is pending; late startup must not admit a view.
    const canceled = linux.open(sender, win, bounds, profile)
    linux.invalidate(sender)
    await assert.rejects(canceled, { code: "failed" })
    assert.deepEqual(dock.list(sender), [])
    assert.deepEqual(events, [])
    evidence["startup-invalidation"] = { rejected: true, admittedViews: 0 }

    const tab = await linux.open(sender, win, bounds, profile)
    const metadata = JSON.parse(await readFile(join(runtimeRoot, "metadata.json"), "utf8")) as Metadata
    assert(metadata.containerID, "Runtime did not record its owned container ID")
    const guest = (args: string[]) => docker(metadata.dockerContext, ["exec", metadata.containerID!, ...args])
    const inspected = JSON.parse(
      (await docker(metadata.dockerContext, ["container", "inspect", metadata.containerID])).stdout,
    )[0]
    assert.equal(inspected.Config.Labels[`${label}.owner`], metadata.owner)
    assert.equal(inspected.HostConfig.NanoCpus, 2 * 10 ** 9)
    assert.equal(inspected.HostConfig.Memory, 2 * 1024 ** 3)
    const contents = dock.contents(sender, tab.tabID)
    const windows = (id: string) =>
      dock.contents(sender, id).executeJavaScript(`(() => {
      if (typeof client === "undefined" || !client.connected) return [];
      return Object.values(client.id_to_window).map(w => ({ id: w.wid, title: w.title, classes: w.metadata["class-instance"] }));
    })()`) as Promise<Array<{ id: number; title: string; classes: string[] }>>
    await wait(
      async () =>
        (await windows(tab.tabID)).some(
          (window) => /xterm/i.test(window.title) || window.classes?.some((name) => /xterm/i.test(name)),
        ),
      "actual xterm window",
    )
    const client = await contents.executeJavaScript(`({
      connected: client.connected, worker: client.protocol.worker instanceof Worker,
      offscreen: client.offscreen_api, decodeWorker: client.decode_worker instanceof Worker,
      clipboard: client.clipboard_enabled, printing: client.printing, fileTransfer: client.file_transfer,
      sandbox: typeof require === "undefined" && typeof process === "undefined",
      passwordInURL: location.href.includes("password") || location.href.includes(${JSON.stringify(metadata.password)})
    })`)
    assert.equal(client.connected, true)
    assert.equal(client.worker, true, "Default Xpra protocol worker was not used")
    assert.equal(client.offscreen, true, "Default Xpra OffscreenCanvas path was not used")
    assert.equal(client.decodeWorker, true, "Default Xpra decoder worker was not used")
    assert.equal(client.clipboard, false)
    assert.equal(client.printing, false)
    assert.equal(client.fileTransfer, false)
    assert.equal(client.sandbox, true)
    assert.equal(client.passwordInURL, false)
    const publicView = {
      tab,
      list: dock.list(sender).map((item) => linux.present(sender, item)),
      events,
      state: await runtime.state(),
    }
    const serialized = JSON.stringify(publicView)
    // Positive controls: the raw Core URL and private metadata really carry the needles.
    assert.match(contents.getURL(), /https:\/\/127\.0\.0\.1:\d+/)
    assert.equal(metadata.password.length, 64)
    assert.equal(tab.url, "appdock://linux")
    assert(!serialized.includes("127.0.0.1"), "Public Linux data exposed the endpoint")
    assert(!serialized.includes(metadata.password), "Public Linux data exposed credentials")
    evidence["authenticated-xterm"] = { ...client, url: tab.url, windows: await windows(tab.tabID) }

    const runs = await readdir(join(root, "electron/logs"))
    assert.equal(runs.length, 1, "Expected one logging run")
    const rendererLog = join(root, "electron/logs", runs[0]!, "renderer.log")
    const control = `trusted-console-${randomUUID()}`
    await win.webContents.executeJavaScript(`console.info(${JSON.stringify(control)}); true`)
    await wait(async () => (await readFile(rendererLog, "utf8").catch(() => "")).includes(control),
      "trusted renderer console persisted as positive control")
    const remote = `remote-console-${randomUUID()}`
    const observed: string[] = []
    contents.on("console-message", (event) => {
      if (event.message === remote) observed.push(event.message)
    })
    await contents.executeJavaScript(`console.info(${JSON.stringify(remote)}); true`)
    await wait(async () => observed.includes(remote), "real remote console event")
    const logs = await readFile(rendererLog, "utf8")
    assert(!logs.includes(metadata.password), "Linux authentication material entered desktop logs")
    assert(!logs.includes(remote), "Remote console entered trusted renderer logs")
    evidence["console-privacy"] = { trustedControl: true, remoteObserved: true, secretExcluded: true }

    // Exercise the exact facade registered by production IPC, including RPC helpers.
    const web = await linux.browser.open(
      sender,
      win,
      new URL("/connect.html", contents.getURL()).href,
      bounds,
      () => undefined,
      profile,
    )
    assert.equal(await linux.browser.execute(sender, web.tabID, "6 * 7"), 42)
    await linux.browser.execute(sender, web.tabID, 'sessionStorage.setItem("probe", "browser-control"); true')
    assert.equal((await linux.browser.storage(sender, web.tabID, "session", "probe")).value, "browser-control")
    linux.browser.close(sender, win, web.tabID)
    await linux.open(sender, win, bounds, profile)
    for (const read of [
      () => linux.browser.execute(sender, tab.tabID, "location.href"),
      () => linux.browser.read(sender, tab.tabID, 10, 100),
      () => linux.browser.storage(sender, tab.tabID, "session", "password"),
      () => linux.browser.evaluate(sender, tab.tabID, "location.href"),
      () => linux.browser.network(sender, tab.tabID, {}),
    ]) {
      await assert.rejects(
        Promise.resolve().then(read),
        { code: "failed" },
        "Browser automation reached the privileged Linux client",
      )
    }
    evidence["browser-boundary"] = { browserControl: true, linuxReadsRejected: true }

    const callbackControl = `slack://bridge-test?token=${randomUUID()}`
    await guest(["python3", "-c", `from pathlib import Path
directory=Path('/home/dock/.local/share/applications')
directory.mkdir(parents=True,exist_ok=True)
(directory/'slack.desktop').write_text('[Desktop Entry]\\nType=Application\\nName=Slack bridge fixture\\nExec=/usr/bin/python3 /home/dock/bridge-callback.py %u\\nMimeType=x-scheme-handler/slack;\\n')
Path('/home/dock/bridge-callback.py').write_text('import sys, json\\nfrom pathlib import Path\\nPath("/home/dock/bridge-callback.json").write_text(json.dumps(sys.argv[1:]))\\n')
`])
    const { createServer } = await import("node:https")
    await docker(metadata.dockerContext, ["cp", `${metadata.containerID}:/home/dock/.orchestra-runtime/cert.pem`, join(root, "cert.pem")])
    await docker(metadata.dockerContext, ["cp", `${metadata.containerID}:/home/dock/.orchestra-runtime/key.pem`, join(root, "key.pem")])
    const loginServer = createServer({ cert: await readFile(join(root, "cert.pem")), key: await readFile(join(root, "key.pem")) }, (_request, response) => {
      response.setHeader("content-type", "text/html")
      response.end("<title>Native application login fixture</title><button>Sign in</button>")
    })
    await new Promise<void>(resolve => loginServer.listen(0, "127.0.0.1", resolve))
    const loginAddress = loginServer.address()
    assert(loginAddress && typeof loginAddress !== "string")
    const loginURL = `https://127.0.0.1:${loginAddress.port}/login`
    for (const transport of ["iframe", "popup"] as const) {
      const beforeLogin = new Set(dock.list(sender).map(tab => tab.tabID))
      await guest(["rm", "-f", "/home/dock/bridge-callback.json"])
      await guest(["python3", "-c", `import os, runpy, subprocess
env={**os.environ,**runpy.run_path('/opt/orchestra/workspace.py')['session_environment']()}
from gi.repository import Gio
assert Gio.AppInfo.get_default_for_type('x-scheme-handler/https',False).get_id()=='orchestra-browser.desktop'
os.environ.update(env)
assert Gio.AppInfo.launch_default_for_uri(${JSON.stringify(loginURL)},None)
`])
      await wait(async () => dock.list(sender).some(tab => !beforeLogin.has(tab.tabID) && tab.url === loginURL), "guest URL opened in native Dock browser")
      const loginTab = dock.list(sender).find(tab => !beforeLogin.has(tab.tabID) && tab.url === loginURL)!
      assert(!linux.has(sender, loginTab.tabID), "Authentication page replaced the Linux viewer")
      assert.equal(linux.externalURL(sender, { tabID: "unrelated", generation: 1 }, callbackControl), false)
      await assert.rejects(guest(["test", "-f", "/home/dock/bridge-callback.json"]))
      const loginContents = dock.contents(sender, loginTab.tabID)
      await wait(async () => !loginContents.isLoadingMainFrame(), "native login browser completed load")
      await loginContents.executeJavaScript(transport === "iframe"
        ? `const frame=document.createElement("iframe");frame.hidden=true;frame.src=${JSON.stringify(callbackControl)};document.body.append(frame);true`
        : `window.open(${JSON.stringify(callbackControl)});true`)
      await wait(async () => {
        const result = await guest(["python3", "-c", "from pathlib import Path; print(Path('/home/dock/bridge-callback.json').read_text())"]).catch(() => undefined)
        return !!result && JSON.parse(result.stdout)[0] === callbackControl
      }, `${transport} URI delivered to actual Gio desktop handler`)
      assert.equal(linux.externalURL(sender, loginTab, callbackControl), false, "Callback claim was replayable")
      await wait(async () => dock.list(sender).find(item => item.tabID === tab.tabID)?.active === true, "callback returned to Linux workspace")
      assert(!JSON.stringify(events).includes(callbackControl), "URI credential entered renderer events")
      dock.close(sender, win, loginTab.tabID)
    }
    loginServer.closeAllConnections()
    await new Promise<void>(resolve => loginServer.close(()=>resolve()))
    evidence["browser-login-bridge"] = { guestDefaultBrowser: true, dockBrowser: true, gioCallback: true, iframeCallback: true, popupCallback: true, unrelatedRejected: true, oneUse: true, returnedToLinux: true, callbackExcluded: true }

    const title = `Orchestra Linux flow ${randomUUID()}`
    assert(!(await windows(tab.tabID)).some((window) => window.title === title))
    // Build a tiny real Debian package inside this one owned container, then use
    // the same host-file install boundary as the native picker/runtime path.
    await docker(metadata.dockerContext, [
      "exec",
      "--user",
      "root",
      metadata.containerID,
      "python3",
      "-c",
      String.raw`
from pathlib import Path
import subprocess
base = Path('/tmp/orchestra-linux-flow-deb')
(base / 'DEBIAN').mkdir(parents=True)
(base / 'usr/share/applications').mkdir(parents=True)
(base / 'usr/share/orchestra-linux-flow').mkdir(parents=True)
(base / 'DEBIAN/control').write_text('Package: orchestra-linux-flow\nVersion: 1.0\nArchitecture: all\nMaintainer: Orchestra Test <test@example.invalid>\nDescription: Linux App Dock Gio fixture\n')
(base / 'usr/share/applications/orchestra-linux-flow.desktop').write_text('[Desktop Entry]\nType=Application\nName=Orchestra Linux flow\nExec=/usr/bin/python3 "/usr/share/orchestra-linux-flow/launch probe.py" %% %U\nTerminal=false\n')
(base / 'usr/share/orchestra-linux-flow/launch probe.py').write_text(${JSON.stringify(`import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, Gio, GLib
from pathlib import Path
import json, os, sys
Gtk.init([])
Gio.bus_get_sync(Gio.BusType.SESSION, None)
window = Gtk.Window(title=${JSON.stringify(title)})
label=Gtk.Label(label="Guest state survives hiding and reconnecting")
window.add(label)
animation={'tick':0}
def animate():
    animation['tick']=(animation['tick']+1)%100
    label.set_text('Guest state survives hiding and reconnecting '+str(animation['tick']))
    return True
GLib.timeout_add(50,animate)
window.show_all()
Path('/home/dock/flow-result.json').write_text(json.dumps({'pid':os.getpid(),'display':os.environ['DISPLAY'],'dbus':bool(os.environ.get('DBUS_SESSION_BUS_ADDRESS')),'args':sys.argv[1:],'title':${JSON.stringify(title)}}))
Gtk.main()
`)})
subprocess.run(['dpkg-deb', '--build', '--root-owner-group', str(base), '/tmp/orchestra-linux-flow.deb'], check=True)
`,
    ])
    const deb = join(root, "native package.deb")
    await docker(metadata.dockerContext, ["cp", `${metadata.containerID}:/tmp/orchestra-linux-flow.deb`, deb])
    assert((await runtime.install(deb)).some((item) => item.id === "orchestra-linux-flow.desktop"))
    await runtime.launch("orchestra-linux-flow.desktop")
    await wait(
      async () => (await windows(tab.tabID)).some((window) => window.title === title),
      "Gio-launched native GTK window",
    )
    assert.equal(
      await contents.executeJavaScript(`(() => {
      const window = Object.values(client.id_to_window).find(window => window.title === ${JSON.stringify(title)});
      window.set_maximized(true);
      const rect = window.div.getBoundingClientRect();
      return rect.width <= innerWidth && rect.height <= innerHeight;
    })()`),
      true,
      "Maximized Linux window exceeds its native view",
    )
    assert(
      !events.some((event) => event.type === "permission" && event.payload.permission.startsWith("clipboard")),
      "Disabled clipboard forwarding surfaced a host permission warning",
    )
    const launch = JSON.parse(
      (
        await guest([
          "python3",
          "-c",
          "from pathlib import Path; print(Path('/home/dock/flow-result.json').read_text())",
        ])
      ).stdout,
    ) as {
      pid: number
      display: string
      dbus: boolean
      args: string[]
      title: string
    }
    assert.equal(launch.display, ":100")
    assert.equal(launch.dbus, true)
    assert.deepEqual(launch.args, ["%"])
    const alive = async () => {
      await guest(["python3", "-c", `import os; os.kill(${launch.pid}, 0)`])
      assert.equal(
        JSON.parse(
          (
            await guest([
              "python3",
              "-c",
              "from pathlib import Path; print(Path('/home/dock/flow-result.json').read_text())",
            ])
          ).stdout,
        ).pid,
        launch.pid,
      )
    }
    evidence["installed-gtk"] = { appID: "orchestra-linux-flow.desktop", ...launch }

    // Observe real protocol sends without replacing the worker or packet transport.
    await contents.executeJavaScript(`(() => {
      window.__flowPackets = [];
      const send = client.protocol.send.bind(client.protocol);
      client.protocol.send = function(packet) {
        if (packet[0] === "suspend" || packet[0] === "resume") window.__flowPackets.push(packet[0]);
        return send(packet);
      };
    })()`)
    const gtk = (await windows(tab.tabID)).find((window) => window.title === title)!
    const managed = await linux.windows(sender, tab)
    assert(managed.some(window => window.id === gtk.id && window.title === title))
    const otherWindow = managed.find(window => window.id !== gtk.id)
    assert(otherWindow, "Window activation needs an independent focus control")
    await contents.executeJavaScript(`client.id_to_window[${otherWindow.id}].focus();true`)
    assert.equal(await contents.executeJavaScript("client.focused_wid"), otherWindow.id)
    await contents.executeJavaScript(`client.id_to_window[${gtk.id}].toggle_minimized();true`)
    await wait(async () => await contents.executeJavaScript(`client.id_to_window[${gtk.id}].minimized`), "actual guest window minimize")
    await linux.focus(sender, tab, gtk.id)
    assert.equal(await contents.executeJavaScript(`client.id_to_window[${gtk.id}].minimized`), false)
    assert.equal(await contents.executeJavaScript("client.focused_wid"), gtk.id)
    await contents.executeJavaScript(`client.id_to_window[${otherWindow.id}].focus();true`)
    assert.equal(await contents.executeJavaScript("client.focused_wid"), otherWindow.id)
    await linux.focus(sender, tab, gtk.id)
    assert.equal(await contents.executeJavaScript("client.focused_wid"), gtk.id)
    await linux.launch(sender, "orchestra-linux-flow.desktop")
    await alive()
    assert.equal(await contents.executeJavaScript("client.focused_wid"), gtk.id)
    await assert.rejects(linux.focus(sender, { ...tab, generation: tab.generation + 1 }, gtk.id), { code: "failed" })
    await assert.rejects(linux.focus(sender, tab, -1), { code: "failed" })
    evidence["installed-gtk"] = { ...evidence["installed-gtk"] as object, windowActivation: true, minimizedWindowRestored: true, sameGuestPID: true }
    await contents.executeJavaScript(`(() => {
      window.__flowPaints=0;
      const send=client.protocol.send.bind(client.protocol);
      client.protocol.send=function(packet) {
        if(packet[0]==="damage-sequence" && packet[2]===${gtk.id} && packet[5]>=0) window.__flowPaints++;
        return send(packet);
      };
      return true;
    })()`)
    await wait(async () => await contents.executeJavaScript("window.__flowPaints>5"), "actual animated GTK paint positive control")
    dock.hide(sender, win)
    await wait(
      async () => (await contents.executeJavaScript('window.__flowPackets.includes("suspend")')) === true,
      "hide suspend packet",
    )
    assert.equal(dock.list(sender).find((item) => item.tabID === tab.tabID)?.active, false)
    await alive()
    dock.select(sender, win, tab.tabID, bounds)
    await wait(
      async () => (await contents.executeJavaScript('window.__flowPackets.includes("resume")')) === true,
      "select resume packet",
    )
    assert.equal((await windows(tab.tabID)).find((window) => window.title === title)?.id, gtk.id)
    assert.equal(await contents.executeJavaScript("client.connected"), true)
    evidence.visibility = { packets: await contents.executeJavaScript("window.__flowPackets"), sameGuestWindow: true }

    await contents.executeJavaScript("window.__flowPackets=[]; true")
    win.minimize()
    await wait(async () => win.isMinimized() && await contents.executeJavaScript('window.__flowPackets.includes("suspend")'), "actual owner minimize suspension")
    assert.equal(contents.getBackgroundThrottling(), true)
    assert.equal(linux.allowPopup(sender, tab, "https://example.com"), false)
    await new Promise(resolve => setTimeout(resolve, 300))
    const minimizedPaints = await contents.executeJavaScript("window.__flowPaints")
    await new Promise(resolve => setTimeout(resolve, 3_000))
    const minimizedDelta = await contents.executeJavaScript("window.__flowPaints") - minimizedPaints
    assert(minimizedDelta <= 1, `Minimized owner still decoded ${minimizedDelta} GTK paints`)
    win.hide()
    await wait(async () => !win.isVisible(), "actual hidden owner window")
    await win.webContents.executeJavaScript(`window.__flowOwnerResizes=0; window.addEventListener("resize",event=>{if(!event.isTrusted)window.__flowOwnerResizes++});true`)
    win.setContentSize(940, 720)
    await wait(async () => await win.webContents.executeJavaScript("window.__flowOwnerResizes>0"), "hidden owner native resize resampling")
    await alive()
    await contents.executeJavaScript("window.__flowPackets=[]; true")
    win.restore()
    win.show()
    await wait(async () => !win.isMinimized() && await contents.executeJavaScript('window.__flowPackets.includes("resume")'), "actual owner restore resume")
    assert.equal(contents.getBackgroundThrottling(), false)
    win.setContentSize(900, 700)

    await contents.executeJavaScript("window.__flowPackets=[]; true")
    win.hide()
    await wait(async () => !win.isVisible() && await contents.executeJavaScript('window.__flowPackets.includes("suspend")'), "actual owner hide suspension")
    assert.equal(linux.allowPopup(sender, tab, "https://example.com"), false)
    // Reopening an already selected view must not resume a still-hidden owner.
    await linux.open(sender, win, bounds, profile)
    assert.equal(contents.getBackgroundThrottling(), true)
    await contents.executeJavaScript("window.__flowPackets=[]; true")
    win.show()
    await wait(async () => win.isVisible() && await contents.executeJavaScript('window.__flowPackets.includes("resume")'), "actual owner show resume")
    assert.equal(contents.getBackgroundThrottling(), false)
    await alive()
    evidence["owner-visibility"] = { minimizedSuspends: true, minimizedPaints: minimizedDelta, hiddenOwnerResize: true, hiddenSuspends: true, restoredResumes: true, sameGuestPID: true }

    assert.deepEqual(await linux.open(sender, win, bounds, profile), tab)
    assert.equal(dock.contents(sender, tab.tabID), contents)
    await contents.loadURL(new URL("/connect.html", contents.getURL()).href)
    assert.equal(await contents.executeJavaScript('typeof client === "undefined"'), true)
    assert.deepEqual(await linux.open(sender, win, bounds, profile), tab)
    assert.equal(dock.contents(sender, tab.tabID), contents)
    await wait(
      async () => (await windows(tab.tabID)).some((window) => window.title === title),
      "GTK after trusted connection page reauthentication",
    )
    await alive()
    dock.close(sender, win, tab.tabID)
    assert.equal(linux.has(sender, tab.tabID), false, "Core closed hook did not retire Linux ownership")
    assert.deepEqual([win.listenerCount("show"), win.listenerCount("hide"), win.listenerCount("minimize"), win.listenerCount("restore"), win.listenerCount("resize")], ownerListeners, "Retired view left owner-window listeners")
    const reopened = await linux.open(sender, win, bounds, profile)
    await wait(
      async () => (await windows(reopened.tabID)).some((window) => window.title === title),
      "GTK after closing display view",
    )
    const crashed = dock.contents(sender, reopened.tabID)
    crashed.forcefullyCrashRenderer()
    await wait(
      async () =>
        events.some((event) => event.type === "tab-crashed" && event.payload.identity.tabID === reopened.tabID),
      "real renderer crash event",
    )
    const recovered = await linux.open(sender, win, bounds, profile)
    assert.equal(recovered.tabID, reopened.tabID)
    assert(recovered.generation > reopened.generation)
    assert.notEqual(dock.contents(sender, recovered.tabID), crashed)
    await wait(
      async () => (await windows(recovered.tabID)).some((window) => window.title === title),
      "GTK after renderer recovery",
    )
    await alive()
    evidence["reuse-recovery"] = {
      reused: true,
      connectPageReauthenticated: true,
      closedHook: true,
      recoveredGeneration: recovered.generation,
      sameGuestPID: true,
    }

    // Same certificate, different port/origin: TLS succeeds through the real pin,
    // but this page must never receive runtime credentials or origin-local storage.
    await docker(metadata.dockerContext, [
      "cp",
      `${metadata.containerID}:/home/dock/.orchestra-runtime/cert.pem`,
      join(root, "cert.pem"),
    ])
    await docker(metadata.dockerContext, [
      "cp",
      `${metadata.containerID}:/home/dock/.orchestra-runtime/key.pem`,
      join(root, "key.pem"),
    ])
    const captured: string[] = []
    const foreign = createServer(
      { cert: await readFile(join(root, "cert.pem")), key: await readFile(join(root, "key.pem")) },
      (request, response) => {
        if (request.url === "/capture") {
          let body = ""
          request.on("data", (chunk) => {
            body += chunk
          })
          request.on("end", () => {
            captured.push(body)
            response.end("received")
          })
          return
        }
        response.setHeader("content-type", "text/html")
        response.end(`<script>
        const client = {connected:true};
        const Utilities = {setSessionStorageValue(key, value) {
          const request = new XMLHttpRequest();
          request.open("POST", "/capture", false);
          request.send(String(value));
        }};
      </script>`)
      },
    )
    try {
      await new Promise<void>((resolve) => foreign.listen(0, "127.0.0.1", resolve))
      const address = foreign.address()
      assert(address && typeof address !== "string")
      const foreignContents = dock.contents(sender, recovered.tabID)
      const popupURL = `https://127.0.0.1:${address.port}/popup`
      const resized = { x: 30, y: 40, width: 720, height: 540 }
      dock.resize(sender, resized)
      await foreignContents.executeJavaScript(`window.open(${JSON.stringify(popupURL)}); true`)
      await wait(
        async () => events.some((event) => event.type === "tab-opened" && event.payload.url === popupURL),
        "Linux popup forwarded to the browser UI",
      )
      const popup = dock.list(sender).find((item) => item.url === popupURL)!
      assert(popup, "Linux popup was not admitted")
      assert.deepEqual(dock.list(sender).find((item) => item.tabID === popup.tabID)?.viewBounds, resized)
      dock.close(sender, win, popup.tabID)
      await linux.open(sender, win, bounds, profile)
      const before = dock.list(sender).length
      await foreignContents.executeJavaScript('window.open(new URL("/connect.html", location.href).href); true')
      await new Promise((resolve) => setTimeout(resolve, 100))
      assert.equal(dock.list(sender).length, before, "Privileged Linux origin escaped into a browser tab")
      evidence["browser-popup"] = { forwarded: true, currentBounds: true, privilegedOriginBlocked: true }
      await foreignContents.loadURL(`https://127.0.0.1:${address.port}/index.html`)
      assert.equal(await foreignContents.executeJavaScript("Object.values(sessionStorage).join('')"), "")
      await foreignContents.executeJavaScript('Utilities.setSessionStorageValue("probe", "positive-control"); true')
      assert.deepEqual(
        captured,
        ["positive-control"],
        "Credential sink positive control did not reach the foreign server",
      )
      await assert.rejects(linux.open(sender, win, bounds, profile), { code: "failed" })
      assert.deepEqual(captured, ["positive-control"], "Coordinator injected credentials into the foreign origin")
      evidence["foreign-origin"] = { tlsPinned: true, emptyOriginStorage: true, sinkCalibrated: true, rejected: true }
    } finally {
      foreign.closeAllConnections()
      await new Promise<void>((resolve, reject) => foreign.close((error) => (error ? reject(error) : resolve())))
    }

    linux.closeSender(sender)
    await runtime.stop()
    assert.equal((await runtime.state()).phase, "stopped")
    const reloaded = AppDockRuntime.create({
      root: runtimeRoot,
      context: resolve("resources/linux-runtime"),
      image: process.env.APP_DOCK_RUNTIME_TEST_IMAGE,
    })
    assert.equal((await reloaded.state()).phase, "stopped")
    await reloaded.start()
    const persisted = JSON.parse(await readFile(join(runtimeRoot, "metadata.json"), "utf8")) as Metadata
    assert.equal(persisted.containerID, metadata.containerID)
    assert.equal(persisted.owner, metadata.owner)
    assert.equal(persisted.password, metadata.password)
    assert((await reloaded.state()).apps.some((item) => item.id === "orchestra-linux-flow.desktop"))
    assert.equal(
      JSON.parse(
        (
          await guest([
            "python3",
            "-c",
            "from pathlib import Path; print(Path('/home/dock/flow-result.json').read_text())",
          ])
        ).stdout,
      ).title,
      title,
    )
    await reloaded.launch("orchestra-linux-flow.desktop")
    const finalTab = await linux.open(sender, win, bounds, profile)
    await wait(
      async () => (await windows(finalTab.tabID)).some((window) => window.title === title),
      "installed GTK after runtime restart",
    )
    evidence.persistence = {
      sameContainer: true,
      sameOwner: true,
      installedApp: true,
      homeFile: true,
      reauthenticated: true,
    }
    const switching = linux.open(sender, win, bounds, { storageKey: randomUUID().replaceAll("-", "") })
    // Core eviction/close of another profile must not cancel the current admission.
    dock.close(sender, win, finalTab.tabID)
    const switched = await switching
    assert.equal(await dock.contents(sender, switched.tabID).executeJavaScript("client.connected"), true)
    evidence["unrelated-view-close"] = { admitted: true, differentProfile: true }
    assert.deepEqual(Object.keys(evidence), cases)
    report.status = "pass"
  } finally {
    await writeFile(join(root, "evidence.json"), JSON.stringify(report, null, 2))
    linux.closeSender(sender)
    dock.closeAll(sender, win)
    await runtime.stop()
    win.destroy()
  }
  app.exit(0)
}

// Parent owns cleanup even when Electron fails or is killed. Exact ID, context,
// owner/kind labels and mounted volume are checked before any object is removed.
async function cleanup(root: string) {
  const metadata = await readFile(join(root, "runtime/metadata.json"), "utf8")
    .then((text) => JSON.parse(text) as Metadata)
    .catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
      throw error
    })
  if (!metadata) return
  assert.match(metadata.owner, /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
  const home = `orchestra-linux-${metadata.owner}-home`
  const container = await docker(metadata.dockerContext, ["container", "inspect", `orchestra-linux-${metadata.owner}`])
    .then((result) => JSON.parse(result.stdout)[0])
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        "stderr" in error &&
        String(error.stderr).trim() ===
          `Error response from daemon: No such container: orchestra-linux-${metadata.owner}`
      )
        return undefined
      throw error
    })
  if (container) {
    if (metadata.containerID) assert.equal(container.Id, metadata.containerID)
    assert.equal(container.Name, `/orchestra-linux-${metadata.owner}`)
    assert.equal(container.Config.Labels[label], "workspace")
    assert.equal(container.Config.Labels[`${label}.owner`], metadata.owner)
    assert.equal(container.Config.Labels[`${label}.kind`], "workspace")
    assert(
      container.Mounts.some(
        (mount: { Type: string; Name: string; Destination: string }) =>
          mount.Type === "volume" && mount.Name === home && mount.Destination === "/home/dock",
      ),
    )
    await docker(metadata.dockerContext, ["rm", "--force", container.Id])
    await assert.rejects(docker(metadata.dockerContext, ["container", "inspect", container.Id]), {
      stderr: `Error response from daemon: No such container: ${container.Id}\n`,
    })
  }
  const volume = await docker(metadata.dockerContext, ["volume", "inspect", home])
    .then((result) => JSON.parse(result.stdout)[0])
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        "stderr" in error &&
        String(error.stderr).trim() === `Error response from daemon: get ${home}: no such volume`
      )
        return undefined
      throw error
    })
  if (!volume) return
  assert.equal(volume.Name, home)
  assert.equal(volume.Labels[label], "workspace")
  assert.equal(volume.Labels[`${label}.owner`], metadata.owner)
  assert.equal(volume.Labels[`${label}.kind`], "home")
  await docker(metadata.dockerContext, ["volume", "rm", home])
  await assert.rejects(docker(metadata.dockerContext, ["volume", "inspect", home]), {
    stderr: `Error response from daemon: get ${home}: no such volume\n`,
  })
}

async function parent() {
  assert(process.env.APP_DOCK_RUNTIME_TEST_IMAGE, "Set APP_DOCK_RUNTIME_TEST_IMAGE to an existing runtime image")
  const temporary = process.env.APP_DOCK_RUNTIME_TEST_TMP ?? join(tmpdir(), "opencode")
  await mkdir(temporary, { recursive: true })
  const root = await mkdtemp(join(temporary, "orchestra-dock-linux-flow-"))
  console.log(`Linux App Dock evidence and ownership metadata: ${root}`)
  try {
    const result = await Bun.build({
      entrypoints: [import.meta.path],
      outdir: root,
      naming: "linux-flow.cjs",
      target: "node",
      format: "cjs",
      external: ["electron", "bun:test"],
      write: true,
      plugins: [
        {
          name: "linux-flow-integration-sources",
          setup(build) {
            const mutation = process.env.APP_DOCK_LINUX_TEST_MUTATION
            if (mutation) {
              if (mutation === "callback-delivery") {
                build.onLoad({ filter: /app-dock-runtime\.ts$/ }, async args => {
                  const text = await Bun.file(args.path).text()
                  const before = 'await bridgeCommand(metadata, container, "callback", { url })'
                  assert.equal(text.split(before).length, 2)
                  return { contents: text.replace(before, "undefined"), loader: "ts" }
                })
              }
              if (mutation === "callback-frame") {
                build.onLoad({ filter: /app-dock\.ts$/ }, async args => {
                  const text = await Bun.file(args.path).text()
                  const before = 'listen("will-frame-navigate", details => {\n      if (externalURL(details.url)) details.preventDefault()\n    })'
                  assert.equal(text.split(before).length, 2)
                  return { contents: text.replace(before, "undefined"), loader: "ts" }
                })
              }
              const before =
                mutation === "close"
                  ? "if (intents.get(senderID) === view.intent) invalidate(senderID)"
                 : mutation === "popup"
                   ? "options.notify(senderID, event)"
                 : mutation === "owner-visibility"
                   ? "const displayed = visible && view.win.isVisible() && !view.win.isMinimized()"
                  : mutation === "paint-suspension"
                    ? "delay: 60000, max_delay: 60000, timeout_delay: 60000"
                  : mutation === "reconnect"
                    ? 'url.pathname === "/index.html" &&'
                  : mutation === "owner-resize"
                    ? 'win.on("resize", resize)'
                  : mutation === "window-focus"
                    ? "win.set_maximized(true);win.focus();return client.focused_wid===win.wid;"
                  : mutation === "callback-delivery" || mutation === "callback-frame"
                    ? "return true;"
                    : undefined
              assert(before, "Unknown Linux integration mutation")
              build.onLoad({ filter: /app-dock-linux\.ts$/ }, async (args) => {
                if (mutation === "callback-delivery" || mutation === "callback-frame") return undefined
                const text = await Bun.file(args.path).text()
                assert.equal(text.split(before).length, mutation === "popup" ? 3 : 2, "Mutation source shape changed")
                return {
                  contents: text.replace(before, mutation === "close" ? "invalidate(senderID)" : mutation === "owner-visibility" ? "const displayed = visible" : mutation === "paint-suspension" ? "delay: 1000, max_delay: 1000, timeout_delay: 1000" : mutation === "window-focus" ? "return true;" : mutation === "reconnect" || mutation === "owner-resize" ? "" : "undefined"),
                  loader: "ts",
                }
              })
            }
            build.onResolve({ filter: /^\.\/app-dock(?:-linux|-runtime)?$/ }, (args) => {
              if (args.path === "./app-dock-linux" && process.env.APP_DOCK_LINUX_TEST_COORDINATOR)
                return { path: resolve(process.env.APP_DOCK_LINUX_TEST_COORDINATOR) }
              if (process.env.APP_DOCK_LINUX_TEST_MAIN_ROOT)
                return { path: resolve(process.env.APP_DOCK_LINUX_TEST_MAIN_ROOT, `${args.path}.ts`) }
              return undefined
            })
          },
        },
      ],
    })
    assert(result.success && result.outputs[0], `Electron child bundle failed: ${result.logs.join("\n")}`)
    const compiled = await result.outputs[0].text()
    assert(compiled.length > 1_000, "Electron child compiler emitted an empty artifact")
    await writeFile(join(root, "linux-flow.cjs"), compiled)
    const electron = process.env.APP_DOCK_ELECTRON ?? (createRequire(resolve("package.json"))("electron") as string)
    const env: NodeJS.ProcessEnv = { ...process.env, APP_DOCK_LINUX_TEST_ROOT: root }
    delete env.ELECTRON_RUN_AS_NODE
    const processChild = spawn(electron, [result.outputs[0].path, flag], { env, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    processChild.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    processChild.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    const watchdog = setTimeout(() => processChild.kill("SIGKILL"), 540_000)
    const code = await new Promise<number | null>((resolve, reject) => {
      processChild.once("error", reject)
      processChild.once("exit", resolve)
    }).finally(() => clearTimeout(watchdog))
    const text = await readFile(join(root, "evidence.json"), "utf8").catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
      throw error
    })
    if (text) console.log(JSON.stringify(JSON.parse(text)))
    assert.equal(code, 0, `Electron Linux flow failed; diagnostics retained at ${root}\n${stdout}\n${stderr}`)
    assert(text, "Electron child did not emit JSON evidence")
    const report = JSON.parse(text)
    assert.equal(report.version, 1)
    assert.equal(report.status, "pass")
    assert.deepEqual(Object.keys(report.cases), cases)
  } finally {
    await cleanup(root)
  }
}

if (process.argv.includes(flag)) {
  void child().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
} else {
  void import("bun:test").then(({ test }) => {
    test.skipIf(process.env.APP_DOCK_LINUX_INTEGRATION !== "1")(
      "[integration: APP_DOCK_LINUX_INTEGRATION=1; actual Electron + Docker] Linux App Dock lifecycle",
      parent,
      600_000,
    )
  })
}
