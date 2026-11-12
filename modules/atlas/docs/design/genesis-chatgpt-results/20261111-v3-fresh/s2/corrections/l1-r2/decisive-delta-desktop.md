# Decisive desktop delta — S2 L1 correction

Execution: `46d09d97-39a9-482a-a290-646ba1d94c99`. Pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Public scope extension: exact cwd wording plus additional readiness and native-translation excerpts.

This correction changes one desktop L1 paragraph. All original static discrepancies and other claims are preserved. These are reverified source excerpts, not new runtime measurements, test results or a producer verdict. Five previously captured files are reused without increasing the canonical source count.

## desktop-readiness-cap

The readiness ceiling is 120,000ms; the comment's scan timing is historical rationale.

Source: `apps/desktop/src/main/owned-serve.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `31d70c15aafdc91ebccc1c5cd25da153cfac84ed`; SHA-256 `0970f4ddb99c1c004e200443abc54ed5ea38cec098e19ef9aa748b771238dfb5`.

Exact lines 15–25:

```ts
const HOSTNAME = "127.0.0.1"
// A server that exits fails the wait at once; this cap only ends a child that stays alive without ever answering. It is
// long because macOS scans a new unsigned executable on its first run, and that scan alone has taken about 30s.
const READY_TIMEOUT = 120_000
const STOP_TIMEOUT = 6_000
// When the desktop dies, omni stops the server tree with this much grace: the server needs it to stop the shells and
// MCP servers it started, through its own supervisor, before the forced step ends that supervisor too.
const TREE_GRACE = 5_000
const BACKOFF = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]
// A child that served this long resets the backoff; a crash loop gives up after BACKOFF runs out.
const STABLE_AFTER = 60_000
```

## desktop-readiness-race

Health races first exit and deadline; sidecarMode and authenticated response.ok predicate are exact code.

Source: `apps/desktop/src/main/owned-serve.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `31d70c15aafdc91ebccc1c5cd25da153cfac84ed`; SHA-256 `0970f4ddb99c1c004e200443abc54ed5ea38cec098e19ef9aa748b771238dfb5`.

Exact lines 94–102:

```ts
  const health = Promise.race([
    poll(() => healthy(url, password)),
    first.exited.then(() => Promise.reject(new Error("Owned serve exited before its health check passed"))),
    delay(READY_TIMEOUT).then(() => Promise.reject(new Error(`Owned serve not healthy within ${READY_TIMEOUT}ms`))),
  ]).catch((error: unknown) => {
    // The renderer shows this message, so it carries what the server last said about why it did not come up.
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(recent.length ? `${reason}\n\nLast server output:\n${recent.join("\n")}` : reason)
  })
```

Exact lines 130–141:

```ts
export function sidecarMode(value: string | undefined) {
  if (value === "shared") return "shared" as const
  return "owned" as const
}

async function healthy(url: string, password: string) {
  return fetch(new URL("/api/health", url), {
    headers: { authorization: `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}` },
    signal: AbortSignal.timeout(3000),
  }).then(
    (response) => response.ok,
    () => false,
```

## desktop-cwd-and-readiness-publication

Main creates userData/global and supplies it as cwd; health is awaited before serverReady publication.

Source: `apps/desktop/src/main/index.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2a00cd582c5917716fe9061a46ca614ed45d086e`; SHA-256 `79e2de4c4f9e50a9b04cf78ad09b3d03585b1e49190943e230f1d45f49b08f11`.

Exact lines 431–466:

```ts
    // The child reaches main's Dock handlers through this channel.
    const dock = yield* Effect.promise(() =>
      startDockChannel({
        onMessage: (message, reply) => {
          if (!LinuxWorkspaceRPC.handle(message, reply)) handleDockRPC(message, reply)
        },
        onClose: () =>
          void LinuxWorkspaceRPC.close().catch(() => writeLog("utility", "linux access cleanup failed", {}, "warn")),
      }),
    )
    // The app's global reads (providers, models) name no directory, so the server boots a Location for its cwd. In the
    // home directory that Location watched the whole home and cost about three more seconds of startup; an empty
    // directory of the app's own boots fast and watches nothing.
    const cwd = join(app.getPath("userData"), "global")
    mkdirSync(cwd, { recursive: true })
    const owned = yield* Effect.promise(() =>
      Promise.all([resolveCliBinary(logger), sidecarLaunchEnv(app.getPath("userData"))]).then(
        ([binary, env]) =>
          startOwnedServe({
            logger,
            command: [binary],
            env: { ...env, ...dock.env },
            cwd,
            write: (stream, message) =>
              writeLog("server", stream, { message }, stream === "stderr" ? "warn" : "info"),
            onSpawn: (pid) => OmniSmoke.utilityStarted(pid),
            onEvent: (name, data) => OmniSmoke.event(name, data),
          }),
      ),
    )
    server = { stop: () => owned.listener.stop().finally(() => dock.close()) }

    if (process.platform === "win32") {
      void wslServers.initialize().catch((error) => logger.error("wsl server initialization failed", error))
    }

```

Exact lines 467–475:

```ts
    // A server that never came up fails initialization, so the renderer shows why instead of a dead URL.
    yield* Effect.tryPromise({
      try: () => owned.health.wait,
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(Effect.tapError((e) => Effect.sync(() => logger.error("owned serve health check failed", e.message))))
    yield* Deferred.succeed(serverReady, { url: owned.url, username: owned.username, password: owned.password })
    yield* Effect.promise(() => OmniBoot.report({ url: owned.url, username: owned.username, password: owned.password }, logger))
    logger.log("loading task finished")
  }).pipe(forwardInitializationFailure(serverReady), Effect.forkChild)
```

## desktop-cwd-maintenance

Maintenance rule for cwd, separated from its historical measured rationale.

Source: `.orchestra/skills/desktop-startup-maintenance/SKILL.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ba3d5859d9109e104687f628bc3e96ad5e616d07`; SHA-256 `6434f6ed07efb0c67275e3d1c30270c2a012aa77b46071239080ae8475dd42a9`.

Exact lines 18–21:

```md
- Readiness fails at once when the child exits. `READY_TIMEOUT` only ends a child that stays alive without answering, so keep it long: macOS scans a new unsigned executable on its first run, and that took about 30s on 0.3.1. A 20s cap turned that scan into "Owned serve not healthy within 20000ms".
- A valid installed copy is hashed against its own manifest on every launch; the bundled copy (about 116 MB) is hashed only when it must be installed. Do not add a second full hash to the warm path.
- Nothing the server start does not need may be awaited before the loading task (the net log once cost about a second there).
- The owned server runs with cwd `userData/global`, an empty folder. Requests that name no directory (Home's provider and model lists) boot a Location for the server's cwd; in the home directory that Location watched the whole home and cost about 3.4s after `server listening`. Never start the owned server in home or another large folder.
```

## desktop-native-typed-bridge

Typed bundle/key imports, English initial bundle, equality check and nativeT delegation.

Source: `apps/desktop/src/main/native-translations.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5913dd7bc0df13e90170e049e3c6eea58790aaf0`; SHA-256 `146cceedea77950c17dbfc32f1d618e954c7a33b5901a7fa8b5218dae0902a7b`.

Exact lines 1–24:

```ts
import {
  DESKTOP_NATIVE_ENGLISH,
  DESKTOP_NATIVE_KEYS,
  formatDesktopNativeMessage,
  type DesktopNativeBundle,
  type DesktopNativeKey,
} from "@orchestra/app/i18n/desktop-native"

let bundle: DesktopNativeBundle = { locale: "en", messages: { ...DESKTOP_NATIVE_ENGLISH } }

export function setNativeTranslations(next: DesktopNativeBundle) {
  if (
    next.locale === bundle.locale &&
    DESKTOP_NATIVE_KEYS.every((key) => next.messages[key] === bundle.messages[key])
  ) {
    return false
  }
  bundle = next
  return true
}

export function nativeT(key: DesktopNativeKey, params?: Record<string, string | number>) {
  return formatDesktopNativeMessage(bundle.messages[key], params)
}
```

## desktop-preload-named-api

The preload builds a named ElectronAPI object and exposes that object as window.api through contextBridge; representative named calls are shown, not a blanket IPC admission guarantee.

Source: `apps/desktop/src/preload/index.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d03c62bb17ae88d31b0e74c7be65b27226e68536`; SHA-256 `fa34bb74659b29838bfedc6d3d6e220c63e5a29769df7664a1986176c20e25ac`.

Exact lines 1–4:

```ts
import { contextBridge, ipcRenderer, webUtils } from "electron"
import type { ElectronAPI, WslServersEvent } from "./types"
import type { UpdaterState } from "@orchestra/app/updater"
import { RESPONSE_DOWNLOAD_CHUNK_BYTES } from "./response-download"
```

Exact lines 24–48:

```ts
const api: ElectronAPI = {
  appDockLinuxOpen: (bounds, profile) => ipcRenderer.invoke("app-dock-linux-open", bounds, profile),
  appDockLinuxList: () => ipcRenderer.invoke("app-dock-linux-list"),
  appDockLinuxInstall: () => ipcRenderer.invoke("app-dock-linux-install"),
  appDockLinuxLaunch: (appID) => ipcRenderer.invoke("app-dock-linux-launch", appID),
  appDockLinuxWindows: (tabID, generation) => ipcRenderer.invoke("app-dock-linux-windows", tabID, generation),
  appDockLinuxFocus: (tabID, generation, windowID) =>
    ipcRenderer.invoke("app-dock-linux-focus", tabID, generation, windowID),
  appDockOpen: (url, bounds, profile) => ipcRenderer.invoke("app-dock-open", url, bounds, profile),
  appDockList: () => ipcRenderer.invoke("app-dock-list"),
  appDockDeleteProfile: (profileID) => ipcRenderer.invoke("app-dock-delete-profile", { profileID }),
  appDockResize: (tab, bounds) => ipcRenderer.invoke("app-dock-resize", tab, bounds),
  appDockHide: (tab) => ipcRenderer.invoke("app-dock-hide", tab),
  appDockOcclude: (occluded) => ipcRenderer.invoke("app-dock-occlude", occluded),
  appDockClose: () => ipcRenderer.invoke("app-dock-close"),
  appDockCloseTab: (tabID) => ipcRenderer.invoke("app-dock-close-tab", tabID),
  appDockRecoverTab: (tabID) => ipcRenderer.invoke("app-dock-recover-tab", tabID),
  appDockCloseTabs: (tabID, scope, order) => ipcRenderer.invoke("app-dock-close-tabs", tabID, scope, order),
  appDockSelect: (tab, bounds) => ipcRenderer.invoke("app-dock-select", tab, bounds),
  appDockNavigate: (tabID, url) => ipcRenderer.invoke("app-dock-navigate", tabID, url),
  appDockCommand: (tabID, command) => ipcRenderer.invoke("app-dock-command", tabID, command),
  appDockEvent: (callback) => {
    const handler = (_event: unknown, appDockEvent: Parameters<typeof callback>[0]) => callback(appDockEvent)
    ipcRenderer.on("app-dock-event", handler)
    return () => ipcRenderer.removeListener("app-dock-event", handler)
```

Exact lines 64–66:

```ts
  killSidecar: () => ipcRenderer.invoke("kill-sidecar"),
  installCli: () => ipcRenderer.invoke("install-cli"),
  awaitInitialization: () => ipcRenderer.invoke("await-initialization"),
```

Exact lines 159–164:

```ts
  openDirectoryPicker: (opts) => ipcRenderer.invoke("open-directory-picker", opts),
  openFilePicker: (opts) => ipcRenderer.invoke("open-file-picker", opts),
  readPickedFile: (token, path) => ipcRenderer.invoke("read-picked-file", token, path),
  releasePickedFiles: (token) => ipcRenderer.invoke("release-picked-files", token),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  saveFilePicker: (opts) => ipcRenderer.invoke("save-file-picker", opts),
```

Exact lines 243–254:

```ts
  setTitlebar: (theme) => ipcRenderer.invoke("set-titlebar", theme),
  setTitlebarFrame: (frame) => ipcRenderer.invoke("set-titlebar-frame", frame),
  setMenuAvailability: (commands) => ipcRenderer.send("set-menu-availability", commands),
  runDesktopMenuAction: (action) => ipcRenderer.invoke("run-desktop-menu-action", action),
  setBackgroundColor: (color: string) => ipcRenderer.invoke("set-background-color", color),
  exportDebugLogs: () => ipcRenderer.invoke("export-debug-logs"),
  setForceFocus: (enabled) => ipcRenderer.invoke("set-force-focus", enabled),
  recordFatalRendererError: (error) => ipcRenderer.invoke("record-fatal-renderer-error", error),
  setNativeTranslations: (bundle) => ipcRenderer.invoke("set-native-translations", bundle),
}

contextBridge.exposeInMainWorld("api", api)
```

