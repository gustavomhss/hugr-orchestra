export * as AppDockRuntime from "./app-dock-runtime"

import type { LinuxApp, LinuxError, LinuxState } from "@opencode-ai/app/app-dock-linux"
import { execFile, spawn } from "node:child_process"
import { createHash, randomBytes, randomUUID, X509Certificate } from "node:crypto"
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import { request } from "node:https"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import { DockerEngine } from "./docker-engine"
import type { AppDockNativeRuntime } from "./app-dock-native-runtime"
import { NativeDockProtocol } from "./app-dock-native-protocol"
import { LinuxWorkspaceAccess } from "./linux-workspace-access"

const exec = promisify(execFile)
const label = "io.orchestra.app-dock"
const helper = "/opt/orchestra/workspace.py"
const staging = "/var/lib/orchestra-install/package.deb"
const queues = new Map<string, Promise<void>>()
const sandboxFingerprint = "ba7ed925345f1b6839c40dfe341404ca0cb94f4a2a438b79c058793106713daa"

export class RuntimeError extends Error {
  constructor(readonly code: LinuxError) {
    super(code)
    this.name = "RuntimeError"
  }
}

type Metadata = {
  version: 1
  owner: string
  password: string
  dockerContext: string
  endpoint: string
  containerID?: string
}

type Container = {
  Id: string
  Image: string
  Name: string
  Config: { Labels: Record<string, string> | null; Env: string[] }
  State: { Running: boolean; StartedAt: string }
  Mounts: { Type: string; Name: string; Destination: string }[]
  NetworkSettings: { Ports: Record<string, { HostIp: string; HostPort: string }[] | null> }
  HostConfig: {
    Memory: number
    NanoCpus: number
    PidsLimit: number
    ShmSize: number
    Init: boolean
    SecurityOpt: string[]
    Privileged: boolean
    CapAdd: string[] | null
  }
}

type Volume = { Name: string; Labels: Record<string, string> | null }
type NativeHandle = Awaited<ReturnType<typeof AppDockNativeRuntime.create>> & {
  runtime: NativeDockProtocol.RuntimeIdentity; session: AppDockNativeRuntime.Options["session"]; endpoint: string; imageID: string
}

export function create(options: { root: string; context: string; image?: string; nativePayload?: string }) {
  const root = resolve(options.root)
  const nativePayload = options.nativePayload === undefined ? undefined : resolve(options.nativePayload)
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_API_VERSION"].includes(key),
    ),
  )
  const current = {
    metadata: undefined as Metadata | undefined,
    state: { phase: "stopped", apps: [] } as LinuxState,
    engine: undefined as { endpoint: string; client: ReturnType<typeof DockerEngine.create> } | undefined,
    catalogue: undefined as
      | { id: string; endpoint: string; startedAt: string; expires: number; apps: LinuxApp[] }
      | undefined,
    reading: undefined as { promise: Promise<LinuxState>; barrier: Promise<void> | undefined } | undefined,
    browserBridge: undefined as { key: string; endpoint: string; token: string } | undefined,
    native: undefined as NativeHandle | undefined,
    accessKey: undefined as string | undefined,
    nativeStart: undefined as Promise<NativeHandle> | undefined,
    // Bumped by stop/dispose so a helper admitted across a teardown is reaped, not published.
    nativeEpoch: 0,
  }

  const command = (args: string[], timeout = 20_000, extraEnv = {}) =>
    exec("docker", args, {
      env: { ...env, ...extraEnv },
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 2 * 1024 * 1024,
    })
  const docker = (metadata: Metadata, args: string[], timeout?: number, extraEnv?: Record<string, string>) =>
    command(["--host", metadata.endpoint, ...args], timeout, extraEnv)
  const snapshot = (state = current.state): LinuxState => ({ ...state, apps: state.apps.map((app) => ({ ...app })) })
  const engine = (endpoint: string) => {
    if (current.engine?.endpoint === endpoint) return current.engine.client
    current.engine?.client.close()
    current.engine = { endpoint, client: DockerEngine.create(endpoint) }
    return current.engine.client
  }
  const sandbox = async () => {
    const path = resolve(options.context, "seccomp.json")
    const policy: unknown = JSON.parse(await readFile(path, "utf8"))
    if (fingerprintPolicy(policy) !== sandboxFingerprint) throw new RuntimeError("unavailable")
    return { path, value: policy }
  }
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
  const connect = async (saved?: Metadata) => {
    if (saved) {
      if (!localEndpoint(saved.endpoint)) throw new RuntimeError("unavailable")
      const info = await engine(saved.endpoint).get<{ OSType: string }>("/info")
      if (info.OSType !== "linux") throw new RuntimeError("unavailable")
      return { dockerContext: saved.dockerContext, endpoint: saved.endpoint }
    }
    const context = process.env.DOCKER_CONTEXT || (await command(["context", "show"])).stdout.trim()
    const inspected = JSON.parse((await command(["context", "inspect", context])).stdout) as {
      Endpoints: { docker?: { Host: string } }
    }[]
    const endpoint = inspected[0]?.Endpoints.docker?.Host
    if (!endpoint || !localEndpoint(endpoint)) throw new RuntimeError("unavailable")
    if (process.env.DOCKER_HOST && process.env.DOCKER_HOST !== endpoint) throw new RuntimeError("unavailable")
    const info = await engine(endpoint).get<{ OSType: string }>("/info")
    if (info.OSType !== "linux") throw new RuntimeError("unavailable")
    return { dockerContext: context, endpoint }
  }
  const load = async () => {
    const saved = await readMetadata(root)
    if (!saved && current.metadata) throw new RuntimeError("failed")
    // Reload the durable ID every time; engine discovery is only needed for a new endpoint.
    const connection =
      saved && current.metadata?.endpoint === saved.endpoint
        ? { dockerContext: saved.dockerContext, endpoint: saved.endpoint }
        : await connect(saved).catch(() => {
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
        await connect(existing)
        current.metadata = existing
      },
    )
    current.metadata ??= metadata
    return current.metadata
  }
  const inspect = async <T>(metadata: Metadata, kind: "container" | "volume" | "image", name: string) => {
    return engine(metadata.endpoint)
      .get<T>(`/${kind}s/${encodeURIComponent(name)}${kind === "volume" ? "" : "/json"}`)
      .catch((error: unknown) => {
        if (namedMissing(error, kind, name)) return undefined
        throw new RuntimeError("unavailable")
      })
  }
  const volume = async (metadata: Metadata) => {
    const found = await inspect<Volume>(metadata, "volume", `orchestra-linux-${metadata.owner}-home`)
    if (found) requireLabels(found.Labels, metadata.owner, "home")
    return found
  }
  const owned = async (metadata: Metadata) => {
    const found = await inspect<Container>(metadata, "container", `orchestra-linux-${metadata.owner}`)
    if (!found) return undefined
    requireLabels(found.Config.Labels, metadata.owner, "workspace")
    if (
      !/^[a-f0-9]{64}$/.test(found.Id) ||
      found.Name !== `/orchestra-linux-${metadata.owner}` ||
      (metadata.containerID && found.Id !== metadata.containerID)
    )
      throw new RuntimeError("failed")
    const home = await volume(metadata)
    if (
      !home ||
      !found.Mounts.some(
        (mount) => mount.Type === "volume" && mount.Name === home.Name && mount.Destination === "/home/dock",
      )
    ) {
      throw new RuntimeError("failed")
    }
    if (
      !found.Config.Env.includes(`APP_DOCK_RUNTIME_PASSWORD=${metadata.password}`) ||
      found.HostConfig.Memory !== 2 * 1024 ** 3 ||
      found.HostConfig.NanoCpus !== 2 * 10 ** 9 ||
      found.HostConfig.PidsLimit !== 512 ||
      found.HostConfig.ShmSize !== 128 * 1024 ** 2 ||
      !found.HostConfig.Init
    )
      throw new RuntimeError("failed")
    if (
      found.HostConfig.Privileged ||
      found.HostConfig.CapAdd?.length ||
      !found.HostConfig.SecurityOpt.some(
        (option) =>
          option.startsWith("seccomp=") &&
          fingerprintPolicy(JSON.parse(option.slice("seccomp=".length))) === sandboxFingerprint,
      )
    ) {
      throw new RuntimeError("failed")
    }
    return found
  }
  const guest = (metadata: Metadata, container: Container, args: string[], admin = false, timeout = 20_000) => {
    // Callers verify ownership once per serialized operation. Exec targets its immutable ID,
    // so a name replacement cannot redirect a later command to a different container.
    if (metadata.containerID !== container.Id) throw new RuntimeError("failed")
    return docker(
      metadata,
      ["exec", "--user", admin ? "root" : "dock", container.Id, "python3", helper, ...args],
      timeout,
    )
  }
  const bridgeCommand = (metadata: Metadata, container: Container, command: "configure" | "callback", input: unknown) => new Promise<void>((resolve, reject) => {
    const child = spawn("docker", ["--host", metadata.endpoint, "exec", "--interactive", "--user", "dock", container.Id, "python3", "/opt/orchestra/browser-bridge.py", command], { env, stdio: ["pipe", "pipe", "pipe"] })
    const timer = setTimeout(() => child.kill("SIGKILL"), 20_000)
    // URI callbacks carry credentials. Keep them out of argv, output and errors.
    child.stdout.resume()
    child.stderr.resume()
    child.stdin.on("error", () => reject(new RuntimeError("failed")))
    child.once("error", () => { clearTimeout(timer); reject(new RuntimeError("failed")) })
    child.once("exit", code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new RuntimeError("failed")) })
    child.stdin.end(JSON.stringify(input))
  })
  const placement = (container: Container) => `${container.Id}:${container.State.StartedAt}`
  const nativeSession = async (metadata: Metadata, container: Container) => {
    const output = await guest(metadata, container, ["native-session"], false, 4000).catch(() => {
      throw new NativeDockProtocol.NativeError("not-ready", "Linux accessibility is unavailable in this workspace session")
    })
    const value: unknown = JSON.parse(output.stdout)
    if (!NativeDockProtocol.object(value) || typeof value.sessionID !== "string" || !NativeDockProtocol.object(value.processIdentity)
      || !NativeDockProtocol.object(value.environment) || Object.keys(value.environment).length > 6
      || !Object.values(value.environment).every((entry) => typeof entry === "string" && entry.length <= 1024))
      throw new NativeDockProtocol.NativeError("not-ready", "Runtime accessibility session is unavailable")
    // The helper manager validates every identity/environment field before I/O.
    return value as AppDockNativeRuntime.Options["session"]
  }
  const closeNative = async (native = current.native) => {
    if (!native) return
    const closed = await native.client.close().then(() => undefined, (error: unknown) => error)
    // Client settlement can precede its channel's actual helper-container reap.
    const terminated = await native.channel.terminate().then(() => undefined, (error: unknown) => error)
    // The channel keeps a missed cleanup deadline as a permanent failure, so under host load every later
    // admission would stay stuck on this dead helper. Reap its proven container directly; only proven
    // removal releases the handle, otherwise the next call retries the reap.
    if (terminated) await reapHelper(native)
    if (current.native === native) current.native = undefined
    if (closed && !terminated) throw closed
  }
  const reapHelper = async (native: NativeHandle) => {
    const client = engine(native.endpoint)
    const path = `/containers/${native.containerID}`
    const present = () => client.get<Container>(`${path}/json`, 4000).catch((error: unknown) => {
      if (namedMissing(error, "container", native.containerID)) return undefined
      throw new NativeDockProtocol.NativeError("helper-termination-failed", "Native helper cleanup failed", "unknown")
    })
    const found = await present()
    if (!found) return
    requireLabels(found.Config.Labels, native.runtime.runtimeID, "accessibility")
    await client.delete(`${path}?force=true`, 4000).catch(() => undefined)
    if (await present())
      throw new NativeDockProtocol.NativeError("helper-termination-failed", "Native helper cleanup failed", "unknown")
  }
  const catalogue = async (metadata: Metadata, container: Container, refresh = false) => {
    // Ownership and limits were verified immediately before this call. Only the
    // display catalogue is cached; launch still revalidates through actual Gio.
    if (
      !refresh &&
      current.catalogue?.id === container.Id &&
      current.catalogue.endpoint === metadata.endpoint &&
      current.catalogue.startedAt === container.State.StartedAt &&
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
      id: container.Id,
      endpoint: metadata.endpoint,
      startedAt: container.State.StartedAt,
      expires: performance.now() + 5_000,
      apps,
    }
    return apps.map((app) => ({ ...app }))
  }
  const stopOwned = async (metadata: Metadata) => {
    const found = await owned(metadata)
    if (!found?.State.Running) return
    await docker(metadata, ["stop", "--time", "10", found.Id], 25_000)
    if ((await owned(metadata))?.State.Running) throw new RuntimeError("failed")
  }
  const start = async () => {
    current.state = { phase: "starting", apps: current.state.apps }
    const policy = await sandbox()
    const metadata = await load()
    const found = await owned(metadata)
    if (!found && metadata.containerID) throw new RuntimeError("failed")
    const started = { value: false }
    return (async () => {
      if (!found) {
        const image = options.image ?? `orchestra-linux-${metadata.owner}:xpra-6.5.4-html5-21`
        const existing = await inspect<{ Os: string; Config: { Labels: Record<string, string> | null } }>(
          metadata,
          "image",
          image,
        )
        if (existing && !options.image) requireLabels(existing.Config.Labels, metadata.owner, "image")
        if (existing && existing.Os !== "linux") throw new RuntimeError("unavailable")
        if (!existing) {
          if (options.image || !(await stat(options.context)).isDirectory()) throw new RuntimeError("unavailable")
          await docker(
            metadata,
            [
              "build",
              "--tag",
              image,
              "--label",
              `${label}=workspace`,
              "--label",
              `${label}.owner=${metadata.owner}`,
              "--label",
              `${label}.kind=image`,
              resolve(options.context),
            ],
            480_000,
          )
        }
        if (!(await volume(metadata))) {
          await docker(metadata, [
            "volume",
            "create",
            "--label",
            `${label}=workspace`,
            "--label",
            `${label}.owner=${metadata.owner}`,
            "--label",
            `${label}.kind=home`,
            `orchestra-linux-${metadata.owner}-home`,
          ])
        }
        const created = await docker(
          metadata,
          [
            "create",
            "--init",
            "--name",
            `orchestra-linux-${metadata.owner}`,
            "--label",
            `${label}=workspace`,
            "--label",
            `${label}.owner=${metadata.owner}`,
            "--label",
            `${label}.kind=workspace`,
            "--cpus",
            "2",
            "--memory",
            "2g",
            "--pids-limit",
            "512",
            "--shm-size",
            "128m",
            "--restart",
            "no",
            "--security-opt",
            `seccomp=${policy.path}`,
            "--publish",
            "127.0.0.1::14500",
            "--mount",
            `type=volume,source=orchestra-linux-${metadata.owner}-home,target=/home/dock`,
            "--env",
            "APP_DOCK_RUNTIME_PASSWORD",
            image,
          ],
          20_000,
          { APP_DOCK_RUNTIME_PASSWORD: metadata.password },
        )
        if (!/^[a-f0-9]{64}$/.test(created.stdout.trim())) throw new RuntimeError("failed")
        metadata.containerID = created.stdout.trim()
        await save(metadata)
      }
      const container = found ?? (await owned(metadata))
      if (!container) throw new RuntimeError("failed")
      if (!metadata.containerID) {
        // Recover an interrupted create only after checking the exact owner and mounts.
        metadata.containerID = container.Id
        await save(metadata)
      }
      if (!container.State.Running) {
        // Refresh the trusted helper before a cold start so persisted workspaces
        // receive crash-recovery fixes without replacing their installation.
        await docker(metadata, ["cp", "--", resolve(options.context, "workspace.py"), `${container.Id}:${helper}`])
        started.value = true
        await docker(metadata, ["start", container.Id])
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
        if (!(await owned(metadata))?.State.Running || Date.now() >= deadline) throw new RuntimeError("failed")
        await new Promise((resolve) => setTimeout(resolve, 300))
        return ready()
      }
      const tls = await ready()
      const running = await owned(metadata)
      const ports = running?.NetworkSettings.Ports["14500/tcp"]
      if (ports?.length !== 1 || ports[0].HostIp !== "127.0.0.1" || !/^\d+$/.test(ports[0].HostPort))
        throw new RuntimeError("failed")
      const url = `https://127.0.0.1:${ports[0].HostPort}/index.html?username=dock`
      const fingerprint = new X509Certificate(tls.certificate).fingerprint256
      if (fingerprint !== tls.fingerprint) throw new RuntimeError("failed")
      await verifyEndpoint(url, tls.certificate)
      await catalogue(metadata, running!)
      return { url, fingerprint, password: metadata.password,
        placement: { runtimeID: metadata.owner, runtimeEpoch: placement(running!) } }
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
      const policy = await sandbox()
      const metadata = await load()
      const container = await owned(metadata)
      if (!container?.State.Running) throw new NativeDockProtocol.NativeError("not-ready", "Linux workspace is not running")
      const session = await nativeSession(metadata, container)
      return { payload, policy, metadata, container, session,
        runtime: { runtimeID: metadata.owner, runtimeEpoch: placement(container), accessibilitySessionID: session.sessionID } }
    }, false)
    const existing = current.native
    if (existing?.active() && existing.runtime.runtimeEpoch === target.runtime.runtimeEpoch
      && existing.runtime.runtimeID === target.runtime.runtimeID && existing.endpoint === target.metadata.endpoint
      && existing.imageID === target.container.Image && JSON.stringify(existing.session) === JSON.stringify(target.session)) return existing
    await closeNative()
    const { AppDockNativeRuntime } = await import("./app-dock-native-runtime")
    const native: NativeHandle = { ...await AppDockNativeRuntime.create({
      endpoint: target.metadata.endpoint, owner: target.metadata.owner, workspaceID: target.container.Id,
      workspaceStartedAt: target.container.State.StartedAt, imageID: target.container.Image,
      homeVolume: `orchestra-linux-${target.metadata.owner}-home`, securityPolicy: target.policy.value, payloadDirectory: target.payload,
      session: target.session,
      verifyWorkspace: async () => {
        const latest = await load()
        if (current.nativeEpoch !== epoch || latest.owner !== target.metadata.owner || latest.endpoint !== target.metadata.endpoint
          || latest.containerID !== target.container.Id)
          throw new NativeDockProtocol.NativeError("wrong-scope", "Runtime ownership changed during helper admission")
        const live = await owned(latest)
        if (!live?.State.Running || placement(live) !== target.runtime.runtimeEpoch || live.Image !== target.container.Image
          || JSON.stringify(await nativeSession(latest, live)) !== JSON.stringify(target.session))
          throw new NativeDockProtocol.NativeError("wrong-scope", "Runtime session changed during helper admission")
      },
    }), runtime: target.runtime, session: target.session, endpoint: target.metadata.endpoint, imageID: target.container.Image }
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
    prepare: () => serialize(async () => {
      if (!(await readMetadata(root))) throw new Error("workspace-not-configured")
      const metadata = await load()
      const container = await owned(metadata)
      if (!container?.State.Running) throw new Error("workspace-not-running")
      const key = placement(container)
      if (current.accessKey !== key) {
        await docker(metadata, ["cp", "--", resolve(options.context, "workspace-access.py"), `${container.Id}:/opt/orchestra/workspace-access.py`])
        await docker(metadata, ["exec", "--user", "root", container.Id, "chown", "0:0", "/opt/orchestra/workspace-access.py"])
        await docker(metadata, ["exec", "--user", "root", container.Id, "chmod", "0644", "/opt/orchestra/workspace-access.py"])
        current.accessKey = key
      }
      return { endpoint: metadata.endpoint, containerID: container.Id, key }
    }),
    verify: async connection => {
      const metadata = await load()
      const container = await owned(metadata)
      if (!container?.State.Running || metadata.endpoint !== connection.endpoint || container.Id !== connection.containerID || placement(container) !== connection.key)
        throw new Error("workspace-changed")
    },
  })

  return {
    access,
    dispose: async () => {
      const closed = await access.close().then(() => undefined, (error: unknown) => error)
      await retireNative()
      await closeNative()
      current.engine?.client.close()
      current.engine = undefined
      if (closed) throw closed
    },
    workspaceScope: () => serialize(async () => {
      const metadata = await load()
      const container = await owned(metadata)
      if (!container?.State.Running) throw new NativeDockProtocol.NativeError("not-ready", "Linux workspace is not running")
      const value: unknown = JSON.parse((await guest(metadata, container, ["native-scope"], false, 5000)).stdout)
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
      if (!latest?.State.Running || placement(latest) !== placement(container))
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
      if (!container?.State.Running) throw new RuntimeError("failed")
      const key = placement(container)
      if (current.browserBridge?.key !== key || current.browserBridge.endpoint !== connection.endpoint || current.browserBridge.token !== connection.token) {
        await docker(metadata, ["cp", "--", resolve(options.context, "browser-bridge.py"), `${container.Id}:/opt/orchestra/browser-bridge.py`])
        await bridgeCommand(metadata, container, "configure", connection)
        current.browserBridge = { key, ...connection }
      }
      return key
    }),
    callback: (url: string, key: string) => serialize(async () => {
      if (!URL.canParse(url) || new URL(url).protocol !== "slack:" || url.length > 8192) throw new RuntimeError("failed")
      const metadata = await load()
      const container = await owned(metadata)
      if (!container?.State.Running || placement(container) !== key || current.browserBridge?.key !== key) throw new RuntimeError("failed")
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
        if (found?.State.Running) await catalogue(metadata, found)
        if (!found?.State.Running) {
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
        if (!container?.State.Running) throw new RuntimeError("failed")
        current.state = { phase: "installing", apps: current.state.apps }
        current.catalogue = undefined
        await guest(metadata, container, ["prepare"], true)
        const clean = () => guest(metadata, container, ["clean"], true)
        return (async () => {
          await docker(metadata, ["cp", "--", resolve(filePath), `${container.Id}:${staging}`], 60_000)
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
        if (!container?.State.Running) throw new RuntimeError("failed")
        const app = (await catalogue(metadata, container)).find((app) => app.id === appID)
        if (!app) throw new RuntimeError("failed")
        const classes: unknown = JSON.parse((await docker(metadata, [
          "exec", "--user", "dock", container.Id, "python3", "-c",
          "from gi.repository import Gio; from pathlib import Path; import json, sys; app=Gio.DesktopAppInfo.new(sys.argv[1]); print(json.dumps([value for value in (app.get_startup_wm_class(), Path(app.get_executable() or '').name) if value]))",
          appID,
        ])).stdout)
        if (!Array.isArray(classes) || !classes.every((value): value is string => typeof value === "string" && value.length <= 512))
          throw new RuntimeError("failed")
        return { ...app, classes: classes.filter(value => !["python", "python3", "node", "java", "env", "sh", "bash"].includes(value)) }
      }),
    launch: (appID: string) =>
      serialize(async () => {
        if (current.state.phase !== "ready") await start()
        const metadata = await load()
        const container = await owned(metadata)
        if (!container?.State.Running) throw new RuntimeError("failed")
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
        current.engine?.client.close()
        current.engine = undefined
        current.state = { phase: "stopped", apps: current.state.apps }
      })
      if (closed) throw closed
    },
  }
}

function requireLabels(labels: Record<string, string> | null, owner: string, kind: string) {
  if (labels?.[label] !== "workspace" || labels?.[`${label}.owner`] !== owner || labels?.[`${label}.kind`] !== kind) {
    throw new RuntimeError("failed")
  }
}

function fingerprintPolicy(value: unknown) {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical)
    if (typeof item !== "object" || item === null) return item
    return Object.fromEntries(
      Object.entries(item)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    )
  }
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")
}

function localEndpoint(endpoint: string) {
  if (process.platform === "win32" && /^npipe:\/\/\/\/\.\/pipe\/[\w.-]+$/.test(endpoint)) return true
  if (!endpoint.startsWith("unix:///")) return false
  const url = new URL(endpoint)
  return !url.hostname && !url.search && !url.hash && !url.username && !url.password
}

function hasCode(error: unknown, code: string | number) {
  return error instanceof Error && "code" in error && error.code === code
}

function namedMissing(error: unknown, kind: "container" | "volume" | "image", name: string) {
  if (error instanceof DockerEngine.ResponseError && error.status === 404) {
    const body = JSON.parse(error.body) as { message?: string }
    if (kind === "container")
      return body.message === `No such container: ${name}` || body.message === `No such object: ${name}`
    if (kind === "volume") return body.message === `get ${name}: no such volume`
    return body.message === `No such image: ${name}`
  }
  if (!hasCode(error, 1) || !(error instanceof Error) || !("stderr" in error)) return false
  const message = String(error.stderr).trim()
  if (kind === "container")
    return (
      message === `Error response from daemon: No such container: ${name}` ||
      message === `Error: No such object: ${name}`
    )
  if (kind === "volume") return message === `Error response from daemon: get ${name}: no such volume`
  return message === `Error response from daemon: No such image: ${name}`
}

async function readMetadata(root: string) {
  const text = await readFile(join(root, "metadata.json"), "utf8").catch((error: unknown) => {
    if (hasCode(error, "ENOENT")) return undefined
    throw new RuntimeError("failed")
  })
  if (text === undefined) return undefined
  const metadata = JSON.parse(text) as Metadata
  if (
    metadata.version !== 1 ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(metadata.owner) ||
    !/^[a-f0-9]{64}$/.test(metadata.password) ||
    typeof metadata.dockerContext !== "string" ||
    !metadata.dockerContext ||
    typeof metadata.endpoint !== "string" ||
    !localEndpoint(metadata.endpoint) ||
    (metadata.containerID !== undefined && !/^[a-f0-9]{64}$/.test(metadata.containerID))
  )
    throw new RuntimeError("failed")
  return metadata
}

function verifyEndpoint(url: string, certificate: string) {
  return new Promise<void>((resolve, reject) => {
    const probe = request(url, { method: "HEAD", ca: certificate, agent: false, timeout: 3_000 }, (response) => {
      response.resume()
      if (response.statusCode !== 200) return reject(new RuntimeError("failed"))
      resolve()
    })
    probe.once("timeout", () => probe.destroy(new RuntimeError("failed")))
    probe.once("error", reject)
    probe.end()
  })
}
