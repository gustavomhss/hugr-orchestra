export * as AppDockRuntime from "./app-dock-runtime"

import type { LinuxApp, LinuxState } from "@opencode-ai/app/app-dock-linux"
import { spawn } from "node:child_process"
import { randomBytes, randomUUID, X509Certificate } from "node:crypto"
import { mkdir, rename, stat, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { NativeDockProtocol } from "./app-dock-native-protocol"
import {
  hasCode,
  readMetadata,
  RuntimeError,
  verifyEndpoint,
  type Backend,
  type Helper,
  type Metadata,
  type Session,
  type Workspace,
} from "./app-dock-runtime-backend"
import { AppDockRuntimeDocker } from "./app-dock-runtime-docker"
import { LinuxWorkspaceAccess } from "./linux-workspace-access"

export { RuntimeError }

const helper = "/opt/orchestra/workspace.py"
const staging = "/var/lib/orchestra-install/package.deb"
const queues = new Map<string, Promise<void>>()

type NativeHandle = Helper & {
  runtime: NativeDockProtocol.RuntimeIdentity; session: Session; endpoint: string; imageID: string
}

export function create(options: { root: string; context: string; image?: string; nativePayload?: string; backend?: Backend }) {
  const root = resolve(options.root)
  const nativePayload = options.nativePayload === undefined ? undefined : resolve(options.nativePayload)
  const backend = options.backend ?? AppDockRuntimeDocker.create({ context: options.context })
  const current = {
    metadata: undefined as Metadata | undefined,
    state: { phase: "stopped", apps: [] } as LinuxState,
    catalogue: undefined as
      | { id: string; endpoint: string; startedAt: string; expires: number; apps: LinuxApp[] }
      | undefined,
    reading: undefined as { promise: Promise<LinuxState>; barrier: Promise<void> | undefined } | undefined,
    browserBridge: undefined as { key: string; endpoint: string; token: string } | undefined,
    native: undefined as NativeHandle | undefined,
    accessKey: undefined as string | undefined,
    // Workspace whose workspace.py was refreshed in this app session.
    refreshed: undefined as { id: string; done: Promise<void> } | undefined,
    nativeStart: undefined as Promise<NativeHandle> | undefined,
    // Bumped by stop/dispose so a helper admitted across a teardown is reaped, not published.
    nativeEpoch: 0,
  }

  const snapshot = (state = current.state): LinuxState => ({ ...state, apps: state.apps.map((app) => ({ ...app })) })
  // Native observations pass marks=false: accessibility is optional, so its
  // failures must not turn the whole workspace (terminal, apps, Slack) into an error.
  const serialize = <T>(run: () => Promise<T>, marks = true) => {
    const result = (queues.get(root) ?? Promise.resolve()).then(run).catch((error: unknown) => {
      const failure = error instanceof RuntimeError ? error : new RuntimeError("failed")
      if (marks) {
        current.catalogue = undefined
        current.state = { phase: "error", apps: current.state.apps, error: failure.code }
      }
      if (error instanceof NativeDockProtocol.NativeError) throw error
      // Fixed access codes carry no Docker diagnostics and tell the agent what is wrong.
      if (!marks && error instanceof Error && /^workspace-[a-z-]{1,48}$/.test(error.message)) throw error
      throw failure
    })
    const tail = result.then(
      () => undefined,
      () => undefined,
    )
    queues.set(root, tail)
    void tail.then(() => {
      if (queues.get(root) === tail) queues.delete(root)
    })
    return result
  }
  const save = async (metadata: Metadata) => {
    await writeFile(join(root, "metadata.json.tmp"), JSON.stringify(metadata), { mode: 0o600 })
    await rename(join(root, "metadata.json.tmp"), join(root, "metadata.json"))
    current.metadata = metadata
  }
  const load = async () => {
    const saved = await readMetadata(root)
    if (!saved && current.metadata) throw new RuntimeError("failed")
    // Reload the durable ID every time; engine discovery is only needed for a new endpoint.
    const connection =
      saved && current.metadata?.endpoint === saved.endpoint
        ? { dockerContext: saved.dockerContext, endpoint: saved.endpoint }
        : await backend.locate(saved).catch(() => {
            throw new RuntimeError("unavailable")
          })
    if (saved) {
      current.metadata = saved
      return saved
    }
    await mkdir(root, { recursive: true, mode: 0o700 })
    const metadata: Metadata = {
      version: 1,
      owner: randomUUID(),
      password: randomBytes(32).toString("hex"),
      ...connection,
    }
    // Exclusive creation keeps a second controller from replacing the durable owner.
    await writeFile(join(root, "metadata.json"), JSON.stringify(metadata), { mode: 0o600, flag: "wx" }).catch(
      async (error: unknown) => {
        if (!hasCode(error, "EEXIST")) throw error
        const existing = await readMetadata(root)
        if (!existing) throw new RuntimeError("failed")
        await backend.locate(existing)
        current.metadata = existing
      },
    )
    current.metadata ??= metadata
    return current.metadata
  }
  // The backend proves ownership; the durable ID pin is re-checked here so it holds for any backend.
  const owned = async (metadata: Metadata) => {
    const found = await backend.find(metadata)
    if (found && metadata.containerID && found.id !== metadata.containerID) throw new RuntimeError("failed")
    return found
  }
  const guest = (metadata: Metadata, container: Workspace, args: string[], admin = false, timeout = 20_000) => {
    // Callers verify ownership once per serialized operation. Exec targets its immutable ID,
    // so a name replacement cannot redirect a later command to a different container.
    if (metadata.containerID !== container.id) throw new RuntimeError("failed")
    return refresh(metadata, container).then(() =>
      backend.exec(metadata, container, { user: admin ? "root" : "dock", argv: ["python3", helper, ...args], timeout }))
  }
  // A workspace left running by an earlier app session still has that session's workspace.py.
  // Refresh it once per workspace before the first helper exec; running processes keep their
  // loaded code and later execs use the new file. A failed refresh is retried on the next use.
  const refresh = (metadata: Metadata, container: Workspace) => {
    if (current.refreshed?.id !== container.id) {
      const done = provision(metadata, container, "workspace.py").catch((error: unknown) => {
        if (current.refreshed?.done === done) current.refreshed = undefined
        throw error
      })
      current.refreshed = { id: container.id, done }
    }
    return current.refreshed.done
  }
  // Trusted helper code is root-owned and read-only for the workspace user.
  const provision = async (metadata: Metadata, container: Workspace, name: string) => {
    await backend.copy(metadata, container, resolve(options.context, name), `/opt/orchestra/${name}`)
    await backend.exec(metadata, container, { user: "root", argv: ["chown", "0:0", `/opt/orchestra/${name}`] })
    await backend.exec(metadata, container, { user: "root", argv: ["chmod", "0644", `/opt/orchestra/${name}`] })
  }
  const bridgeCommand = (metadata: Metadata, container: Workspace, command: "configure" | "callback", input: unknown) => new Promise<void>((resolve, reject) => {
    const host = backend.command(metadata.endpoint, container.id, { user: "dock", argv: ["python3", "/opt/orchestra/browser-bridge.py", command] })
    const child = spawn(host.file, host.args, { env: host.env, stdio: ["pipe", "pipe", "pipe"] })
    const timer = setTimeout(() => child.kill("SIGKILL"), 20_000)
    // URI callbacks carry credentials. Keep them out of argv, output and errors.
    child.stdout.resume()
    child.stderr.resume()
    child.stdin.on("error", () => reject(new RuntimeError("failed")))
    child.once("error", () => { clearTimeout(timer); reject(new RuntimeError("failed")) })
    child.once("exit", code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new RuntimeError("failed")) })
    child.stdin.end(JSON.stringify(input))
  })
  const placement = (container: Workspace) => `${container.id}:${container.startedAt}`
  const nativeSession = async (metadata: Metadata, container: Workspace) => {
    const output = await guest(metadata, container, ["native-session"], false, 4000).catch(() => {
      throw new NativeDockProtocol.NativeError("not-ready", "Linux accessibility is unavailable in this workspace session")
    })
    const value: unknown = JSON.parse(output.stdout)
    if (!NativeDockProtocol.object(value) || typeof value.sessionID !== "string" || !NativeDockProtocol.object(value.processIdentity)
      || !NativeDockProtocol.object(value.environment) || Object.keys(value.environment).length > 6
      || !Object.values(value.environment).every((entry) => typeof entry === "string" && entry.length <= 1024))
      throw new NativeDockProtocol.NativeError("not-ready", "Runtime accessibility session is unavailable")
    // The helper manager validates every identity/environment field before I/O.
    return value as Session
  }
  const closeNative = async (native = current.native) => {
    if (!native) return
    const closed = await native.client.close().then(() => undefined, (error: unknown) => error)
    // Client settlement can precede its channel's actual helper reap.
    const terminated = await native.channel.terminate().then(() => undefined, (error: unknown) => error)
    // The channel keeps a missed cleanup deadline as a permanent failure, so under host load every later
    // admission would stay stuck on this dead helper. Reap it by its proven identity; only proven
    // removal releases the handle, otherwise the next call retries the reap.
    if (terminated) await native.reap()
    if (current.native === native) current.native = undefined
    if (closed && !terminated) throw closed
  }
  const catalogue = async (metadata: Metadata, container: Workspace, refresh = false) => {
    // Ownership and limits were verified immediately before this call. Only the
    // display catalogue is cached; launch still revalidates through actual Gio.
    if (
      !refresh &&
      current.catalogue?.id === container.id &&
      current.catalogue.endpoint === metadata.endpoint &&
      current.catalogue.startedAt === container.startedAt &&
      current.catalogue.expires > performance.now()
    ) {
      current.state = { phase: "ready", apps: current.catalogue.apps }
      return snapshot().apps
    }
    const apps: unknown = JSON.parse((await guest(metadata, container, ["list"])).stdout)
    if (
      !Array.isArray(apps) ||
      !apps.every(
        (app): app is LinuxApp =>
          typeof app === "object" &&
          app !== null &&
          typeof app.id === "string" &&
          typeof app.name === "string" &&
          app.id.endsWith(".desktop") &&
          !/[\x00-\x1f/\\]/.test(app.id) &&
          app.id.length <= 512 &&
          app.name.length <= 512,
      )
    )
      throw new RuntimeError("failed")
    current.state = { phase: "ready", apps }
    current.catalogue = {
      id: container.id,
      endpoint: metadata.endpoint,
      startedAt: container.startedAt,
      expires: performance.now() + 5_000,
      apps,
    }
    return apps.map((app) => ({ ...app }))
  }
  const stopOwned = async (metadata: Metadata) => {
    const found = await owned(metadata)
    if (!found?.running) return
    await backend.stop(metadata, found)
    if ((await owned(metadata))?.running) throw new RuntimeError("failed")
  }
  const start = async () => {
    current.state = { phase: "starting", apps: current.state.apps }
    const policy = await backend.sandbox()
    const metadata = await load()
    const found = await owned(metadata)
    if (!found && metadata.containerID) throw new RuntimeError("failed")
    const started = { value: false }
    return (async () => {
      if (!found) {
        const image = await backend.ensureImage(metadata, options.image)
        await backend.ensureHome(metadata)
        const created = await backend.create(metadata, { image, sandbox: policy })
        if (!/^[a-f0-9]{64}$/.test(created)) throw new RuntimeError("failed")
        metadata.containerID = created
        await save(metadata)
      }
      const container = found ?? (await owned(metadata))
      if (!container) throw new RuntimeError("failed")
      if (!metadata.containerID) {
        // Recover an interrupted create only after checking the exact owner and mounts.
        metadata.containerID = container.id
        await save(metadata)
      }
      if (!container.running) {
        // Refresh the trusted helper before a cold start so persisted workspaces
        // receive crash-recovery fixes without replacing their installation.
        await backend.copy(metadata, container, resolve(options.context, "workspace.py"), helper)
        current.refreshed = { id: container.id, done: Promise.resolve() }
        started.value = true
        await backend.start(metadata, container)
      }
      const deadline = Date.now() + 60_000
      const ready = async (): Promise<{ certificate: string; fingerprint: string }> => {
        const result = await guest(
          metadata,
          container,
          ["ready"],
          false,
          Math.max(1, Math.min(4_000, deadline - Date.now())),
        ).catch(() => undefined)
        if (result) return JSON.parse(result.stdout) as { certificate: string; fingerprint: string }
        if (!(await owned(metadata))?.running || Date.now() >= deadline) throw new RuntimeError("failed")
        await new Promise((resolve) => setTimeout(resolve, 300))
        return ready()
      }
      const tls = await ready()
      const running = await owned(metadata)
      if (!running?.viewerPort) throw new RuntimeError("failed")
      const url = `https://127.0.0.1:${running.viewerPort}/index.html?username=dock`
      const fingerprint = new X509Certificate(tls.certificate).fingerprint256
      if (fingerprint !== tls.fingerprint) throw new RuntimeError("failed")
      await verifyEndpoint(url, tls.certificate)
      await catalogue(metadata, running)
      return { url, fingerprint, password: metadata.password,
        placement: { runtimeID: metadata.owner, runtimeEpoch: placement(running) } }
    })().catch(async (error: unknown) => {
      // Keep installed packages and the primary failure, even when Docker cleanup fails.
      if (started.value) await stopOwned(metadata).catch(() => undefined)
      throw error
    })
  }

  const startNative = async (): Promise<NativeHandle> => {
    const epoch = current.nativeEpoch
    // Only the ownership snapshot is serialized; it never marks the workspace state.
    const target = await serialize(async () => {
      const payload = nativePayload
      if (!payload) throw new NativeDockProtocol.NativeError("not-ready", "Native helper payload is not configured")
      const policy = await backend.sandbox()
      const metadata = await load()
      const container = await owned(metadata)
      if (!container?.running) throw new NativeDockProtocol.NativeError("not-ready", "Linux workspace is not running")
      const session = await nativeSession(metadata, container)
      return { payload, policy, metadata, container, session,
        runtime: { runtimeID: metadata.owner, runtimeEpoch: placement(container), accessibilitySessionID: session.sessionID } }
    }, false)
    const existing = current.native
    if (existing?.active() && existing.runtime.runtimeEpoch === target.runtime.runtimeEpoch
      && existing.runtime.runtimeID === target.runtime.runtimeID && existing.endpoint === target.metadata.endpoint
      && existing.imageID === target.container.image && JSON.stringify(existing.session) === JSON.stringify(target.session)) return existing
    await closeNative()
    const native: NativeHandle = { ...await backend.helper({
      metadata: target.metadata, workspace: target.container, sandbox: target.policy, payload: target.payload,
      session: target.session,
      verifyWorkspace: async () => {
        const latest = await load()
        if (current.nativeEpoch !== epoch || latest.owner !== target.metadata.owner || latest.endpoint !== target.metadata.endpoint
          || latest.containerID !== target.container.id)
          throw new NativeDockProtocol.NativeError("wrong-scope", "Runtime ownership changed during helper admission")
        const live = await owned(latest)
        if (!live?.running || placement(live) !== target.runtime.runtimeEpoch || live.image !== target.container.image
          || JSON.stringify(await nativeSession(latest, live)) !== JSON.stringify(target.session))
          throw new NativeDockProtocol.NativeError("wrong-scope", "Runtime session changed during helper admission")
      },
    }), runtime: target.runtime, session: target.session, endpoint: target.metadata.endpoint, imageID: target.container.image }
    if (current.nativeEpoch !== epoch) {
      await closeNative(native)
      throw new NativeDockProtocol.NativeError("wrong-scope", "Linux workspace stopped during helper admission")
    }
    current.native = native
    native.channel.onExit(() => { if (current.native === native) current.native = undefined })
    return native
  }
  // Teardown must not leave a helper container behind: invalidate admissions in
  // flight, then wait for them to reap themselves before closing the current one.
  const retireNative = async () => {
    current.nativeEpoch++
    await current.nativeStart?.catch(() => undefined)
  }

  const access = LinuxWorkspaceAccess.create({
    // Terminal access observes the workspace; a stopped workspace is not a workspace failure.
    prepare: () => serialize(async () => {
      if (!(await readMetadata(root))) throw new Error("workspace-not-configured")
      const metadata = await load()
      const container = await owned(metadata)
      if (!container?.running) throw new Error("workspace-not-running")
      const key = placement(container)
      if (current.accessKey !== key) {
        await provision(metadata, container, "workspace-access.py")
        current.accessKey = key
      }
      return { endpoint: metadata.endpoint, workspaceID: container.id, key }
    }, false),
    verify: async connection => {
      const metadata = await load()
      const container = await owned(metadata)
      if (!container?.running || metadata.endpoint !== connection.endpoint || container.id !== connection.workspaceID || placement(container) !== connection.key)
        throw new Error("workspace-changed")
    },
    command: (connection, input) => backend.command(connection.endpoint, connection.workspaceID, { user: "dock", ...input }),
  })

  return {
    access,
    dispose: async () => {
      const closed = await access.close().then(() => undefined, (error: unknown) => error)
      await retireNative()
      await closeNative()
      backend.close()
      if (closed) throw closed
    },
    workspaceScope: () => serialize(async () => {
      const metadata = await load()
      const container = await owned(metadata)
      if (!container?.running) throw new NativeDockProtocol.NativeError("not-ready", "Linux workspace is not running")
      // The guest bounds its census to 4 s itself; this deadline only absorbs docker exec and interpreter start,
      // which took longer than 5 s for minutes under host load while every ui_* call failed as ownership-unresolved.
      const value: unknown = JSON.parse((await guest(metadata, container, ["native-scope"], false, 15_000)).stdout)
      if (!NativeDockProtocol.object(value) || !NativeDockProtocol.object(value.session)
        || typeof value.session.sessionID !== "string" || !NativeDockProtocol.object(value.session.processIdentity))
        throw new NativeDockProtocol.NativeError("ownership-unresolved", "Runtime workspace session evidence is incomplete")
      const realm = value.session.processIdentity
      if (!Array.isArray(value.processIdentities) || value.processIdentities.length < 1 || value.processIdentities.length > 128
        || !value.processIdentities.every((process) => NativeDockProtocol.object(process)
          && [process.pid, process.startTicks].every((field) => Number.isSafeInteger(field) && Number(field) > 0)
          && ["bootID", "pidNamespace", "mountNamespace"].every((key) => typeof process[key] === "string"
            && process[key] === realm[key]))
        || new Set(value.processIdentities.map((process) => process.pid)).size !== value.processIdentities.length)
        throw new NativeDockProtocol.NativeError("ownership-unresolved", "Runtime workspace process evidence is incomplete")
      const latest = await owned(metadata)
      if (!latest?.running || placement(latest) !== placement(container))
        throw new NativeDockProtocol.NativeError("wrong-scope", "Runtime changed during workspace observation")
      return {
        runtime: { runtimeID: metadata.owner, runtimeEpoch: placement(container), accessibilitySessionID: value.session.sessionID },
        processIdentities: value.processIdentities as NativeDockProtocol.ProcessIdentity[],
      }
    }, false),
    // Helper admission runs outside the mutation queue: a cold helper start must
    // not hold app listing, launch or the Slack bridge. Concurrent callers join.
    native: () => {
      current.nativeStart ??= startNative().finally(() => { current.nativeStart = undefined })
      return current.nativeStart
    },
    configureBrowser: (connection: { endpoint: string; token: string }) => serialize(async () => {
      const metadata = await load()
      const container = await owned(metadata)
      if (!container?.running) throw new RuntimeError("failed")
      const key = placement(container)
      if (current.browserBridge?.key !== key || current.browserBridge.endpoint !== connection.endpoint || current.browserBridge.token !== connection.token) {
        await backend.copy(metadata, container, resolve(options.context, "browser-bridge.py"), "/opt/orchestra/browser-bridge.py")
        await bridgeCommand(metadata, container, "configure", connection)
        current.browserBridge = { key, ...connection }
      }
      return key
    }),
    callback: (url: string, key: string) => serialize(async () => {
      if (!URL.canParse(url) || new URL(url).protocol !== "slack:" || url.length > 8192) throw new RuntimeError("failed")
      const metadata = await load()
      const container = await owned(metadata)
      if (!container?.running || placement(container) !== key || current.browserBridge?.key !== key) throw new RuntimeError("failed")
      await bridgeCommand(metadata, container, "callback", { url })
    }),
    start: () => serialize(start),
    state: async (): Promise<LinuxState> => {
      if (current.state.phase === "starting" || current.state.phase === "installing") return snapshot()
      if (current.reading && current.reading.barrier === queues.get(root)) return current.reading.promise.then(snapshot)
      const reading = serialize(async () => {
        if (!current.metadata && !(await readMetadata(root))) return snapshot()
        const metadata = await load()
        const found = await owned(metadata)
        if (found?.running) await catalogue(metadata, found)
        if (!found?.running) {
          current.catalogue = undefined
          current.state = { phase: "stopped", apps: current.state.apps }
        }
        return snapshot()
      }).catch(() => snapshot())
      // Joining reads is safe only until another operation is enqueued. A later
      // install/stop/start must remain a barrier even while this read is pending.
      current.reading = { promise: reading, barrier: queues.get(root) }
      void reading.finally(() => {
        if (current.reading?.promise === reading) current.reading = undefined
      })
      return reading.then(snapshot)
    },
    install: (filePath: string) =>
      serialize(async () => {
        const file = await stat(filePath).catch(() => {
          throw new RuntimeError("invalid-package")
        })
        if (!file.isFile() || !filePath.toLowerCase().endsWith(".deb")) throw new RuntimeError("invalid-package")
        if (current.state.phase !== "ready") await start()
        const metadata = await load()
        const container = await owned(metadata)
        if (!container?.running) throw new RuntimeError("failed")
        current.state = { phase: "installing", apps: current.state.apps }
        current.catalogue = undefined
        await guest(metadata, container, ["prepare"], true)
        const clean = () => guest(metadata, container, ["clean"], true)
        return (async () => {
          await backend.copy(metadata, container, resolve(filePath), staging, 60_000)
          await guest(metadata, container, ["install"], true, 240_000).catch((error: unknown) => {
            const code = error instanceof Error && "stderr" in error ? String(error.stderr).trim() : ""
            if (code === "invalid-package" || code === "architecture-mismatch") throw new RuntimeError(code)
            throw new RuntimeError("failed")
          })
        })().then(
          async () => {
            await clean()
            return catalogue(metadata, container, true)
          },
          async (error: unknown) => {
            await clean().catch(() => undefined)
            throw error
          },
        )
      }),
    application: (appID: string) =>
      serialize(async () => {
        if (current.state.phase !== "ready") await start()
        const metadata = await load()
        const container = await owned(metadata)
        if (!container?.running) throw new RuntimeError("failed")
        const app = (await catalogue(metadata, container)).find((app) => app.id === appID)
        if (!app) throw new RuntimeError("failed")
        const classes: unknown = JSON.parse((await backend.exec(metadata, container, { user: "dock", argv: [
          "python3", "-c",
          "from gi.repository import Gio; from pathlib import Path; import json, sys; app=Gio.DesktopAppInfo.new(sys.argv[1]); print(json.dumps([value for value in (app.get_startup_wm_class(), Path(app.get_executable() or '').name) if value]))",
          appID,
        ] })).stdout)
        if (!Array.isArray(classes) || !classes.every((value): value is string => typeof value === "string" && value.length <= 512))
          throw new RuntimeError("failed")
        return { ...app, classes: classes.filter(value => !["python", "python3", "node", "java", "env", "sh", "bash"].includes(value)) }
      }),
    launch: (appID: string) =>
      serialize(async () => {
        if (current.state.phase !== "ready") await start()
        const metadata = await load()
        const container = await owned(metadata)
        if (!container?.running) throw new RuntimeError("failed")
        if (!(await catalogue(metadata, container)).some((app) => app.id === appID)) throw new RuntimeError("failed")
        await guest(metadata, container, ["launch", appID])
      }),
    stop: async () => {
      // Reap access outside the mutation queue: an admitted run may still be
      // waiting for its serialized ownership/deployment check. Its failure must
      // not skip helper/container teardown, so it is rethrown afterwards.
      const closed = await access.close().then(() => undefined, (error: unknown) => error)
      await retireNative()
      await serialize(async () => {
        if (!current.metadata && !(await readMetadata(root))) return
        current.nativeEpoch++
        await closeNative()
        await stopOwned(await load())
        current.catalogue = undefined
        backend.close()
        current.state = { phase: "stopped", apps: current.state.apps }
      })
      if (closed) throw closed
    },
  }
}
