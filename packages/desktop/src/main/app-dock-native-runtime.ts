export * as AppDockNativeRuntime from "./app-dock-native-runtime"

import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { lstat, open } from "node:fs/promises"
import { isAbsolute, join, posix } from "node:path"
import { AppDockNativeChannel } from "./app-dock-native-channel"
import { NativeDockClient } from "./app-dock-native-client"
import { NativeDockProtocol } from "./app-dock-native-protocol"
import { DockerEngine } from "./docker-engine"

export type Options = {
  endpoint: string
  owner: string
  workspaceID: string
  workspaceStartedAt: string
  homeVolume: string
  imageID: string
  securityPolicy: unknown
  payloadDirectory: string
  session: {
    sessionID: string
    processIdentity: NativeDockProtocol.ProcessIdentity
    environment: Record<string, string>
  }
  verifyWorkspace: () => Promise<void>
}

const label = "io.orchestra.app-dock"
const names = ["actions.py", "bindings.py", "bus.py", "context.py", "keyboard.py", "main.py", "refs.py", "snapshot.py"]
const home = "/home/dock"
const run = `${home}/.orchestra-runtime/run`
const guest = "/opt/orchestra/app-dock-accessibility"
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const id = /^[a-f0-9]{64}$/
const memory = 128 * 1024 ** 2
const environmentKeys = ["DISPLAY", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "XAUTHORITY", "AT_SPI_BUS_ADDRESS", "ORCHESTRA_A11Y_SESSION_ID"]

// The uploaded directory must be root-owned, outside the shared writable home. Verify
// the exact manifest before importing any payload code; never print source/paths.
const verifier = `import hashlib,itertools,json,os,stat,sys
try:
 p='/opt/orchestra/app-dock-accessibility'
 d=os.lstat(p); assert stat.S_ISDIR(d.st_mode) and d.st_uid==0 and not d.st_mode&0o022
 m=json.loads(sys.argv[1]); total=0
 with os.scandir(p) as entries:
  actual=sorted(e.name for e in itertools.islice(entries,9))
 assert len(m)==8 and actual==[f['name'] for f in m]
 for f in m:
  fd=os.open(p+'/'+f['name'],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
  with os.fdopen(fd,'rb') as s:
   st=os.fstat(s.fileno()); b=s.read(131073)
  assert stat.S_ISREG(st.st_mode) and st.st_nlink==1 and st.st_uid==0 and not st.st_mode&0o022 and 0<len(b)<=131072
  assert len(b)==st.st_size==f['bytes'] and hashlib.sha256(b).hexdigest()==f['sha256']
  total+=len(b)
 assert total<=262144
except Exception:
 sys.stderr.write('native-payload-verification-failed\\n'); sys.exit(78)
e={k:os.environ[k] for k in ('DISPLAY','DBUS_SESSION_BUS_ADDRESS','XDG_RUNTIME_DIR','XAUTHORITY','AT_SPI_BUS_ADDRESS','ORCHESTRA_A11Y_SESSION_ID') if k in os.environ}
e.update(HOME='/home/dock',LANG='C.UTF-8')
os.execve('/usr/bin/python3',['python3','-u','-B','-s','-E',p+'/main.py','--session-id',sys.argv[2]],e)`

export async function create(options: Options) {
  // Capture before the first await. No later callback observes caller mutations.
  const captured = capture(options)
  const engine = DockerEngine.create(captured.endpoint)
  const name = `orchestra-native-${captured.owner}-${randomUUID()}`
  const labels = {
    [label]: "workspace", [`${label}.owner`]: captured.owner, [`${label}.kind`]: "accessibility",
    [`${label}.workspace`]: captured.workspaceID, [`${label}.session`]: captured.session.sessionID,
  }
  const state = {
    containerID: undefined as string | undefined,
    attempted: false,
    channel: undefined as NativeDockProtocol.Channel | undefined,
    retiring: false,
    stopping: undefined as Promise<NativeDockProtocol.Exit> | undefined,
  }
  const owned = (value: unknown) => {
    const found = object(value)
    const config = object(found.Config)
    const actual = object(config.Labels)
    if (typeof found.Id !== "string" || !id.test(found.Id) || found.Id === captured.workspaceID
      || (state.containerID !== undefined && found.Id !== state.containerID) || found.Name !== `/${name}`
      || !Object.entries(labels).every(([key, value]) => actual[key] === value))
      throw failure("helper-ownership-unproven", "unknown")
    return found
  }
  const inspect = async (deadline: number) => owned(await bounded(deadline, (timeout) =>
    engine.get<unknown>(`/containers/${state.containerID ?? name}/json`, timeout)))
  const stop = () => {
    if (state.stopping) return state.stopping
    const deadline = performance.now() + 4000
    const cleanup = async (): Promise<NativeDockProtocol.Exit> => {
      const found = await inspect(deadline)
      // A lost create reply may be recovered by the unique name, but mutations
      // always use the full ID proven by inspect, never a name or workspace ID.
      state.containerID ??= found.Id as string
      const path = `/containers/${state.containerID}`
      const killed = containerState(found).Running
      if (killed) await bounded(deadline, (timeout) => engine.post(`${path}/kill?signal=SIGKILL`, undefined, timeout)).catch((error: unknown) => {
        // The helper can exit between inspect and kill. A conflict is not itself
        // reaping evidence; the following inspect still has to prove it stopped.
        if (!(error instanceof DockerEngine.ResponseError && error.status === 409)) throw error
      })
      const stopped = { value: killed ? await inspect(deadline) : found }
      while (containerState(stopped.value).Running) {
        await bounded(deadline, () => new Promise<void>((resolve) => setTimeout(resolve, 25)))
        stopped.value = await inspect(deadline)
      }
      const exited = containerState(stopped.value)
      const exit: NativeDockProtocol.Exit = {
        code: exited.ExitCode,
        ...(killed || exited.OOMKilled ? { signal: "SIGKILL" } : {}),
        reason: exited.OOMKilled ? "helper-resource-exit" : "helper-exited",
      }
      // Running=false is reaping evidence, including never-started PID=0. EOF is not.
      await bounded(deadline, (timeout) => engine.delete(path, timeout))
      return exit
    }
    state.stopping = cleanup().catch(() => { throw failure("helper-termination-failed", "unknown") }).finally(() => engine.close())
    return state.stopping
  }

  try {
    const loaded = await payload(captured.payloadDirectory)
    const security = [`seccomp=${JSON.stringify(captured.securityPolicy)}`, "no-new-privileges"]
    const env = Object.entries({ ...captured.session.environment, HOME: home, LANG: "C.UTF-8" }).map(([key, value]) => `${key}=${value}`)
    // Shared HOME must not execute user-site .pth/sitecustomize before verification.
    const cmd = ["/usr/bin/python3", "-u", "-B", "-I", "-c", verifier, JSON.stringify(loaded.manifest.files), captured.session.sessionID]
    const config = {
      Image: captured.imageID, User: "10001:10001", Labels: labels, Env: env, Entrypoint: [], Cmd: cmd, Healthcheck: { Test: ["NONE"] },
      WorkingDir: guest, Tty: false, OpenStdin: true, StdinOnce: true, AttachStdin: true, AttachStdout: true, AttachStderr: true,
      HostConfig: {
        PidMode: `container:${captured.workspaceID}`, NetworkMode: `container:${captured.workspaceID}`,
        Mounts: [{ Type: "volume", Source: captured.homeVolume, Target: home, ReadOnly: false, VolumeOptions: { NoCopy: true } }],
        Memory: memory, MemorySwap: memory, NanoCpus: 500_000_000, PidsLimit: 64,
        Privileged: false, CapAdd: [], CapDrop: ["ALL"], SecurityOpt: security, Init: false,
        PublishAllPorts: false, PortBindings: {}, RestartPolicy: { Name: "no" }, AutoRemove: false,
      },
    }
    const admitted = (found: Record<string, unknown>) => {
      requireConfig(found, config, captured)
      const current = containerState(found)
      if (current.Running || current.Pid !== 0 || current.Status !== "created") throw failure("helper-config-invalid")
    }
    await bounded(performance.now() + 4000, () => captured.verifyWorkspace())
    state.attempted = true
    const created = object(await bounded(performance.now() + 20_000, (timeout) =>
      engine.post<unknown>(`/containers/create?name=${name}`, config, timeout)))
    if (typeof created.Id !== "string" || !id.test(created.Id) || created.Id === captured.workspaceID)
      throw failure("helper-ownership-unproven", "unknown")
    state.containerID = created.Id
    admitted(await inspect(performance.now() + 4000))
    // Docker copyUIDGID=true forces Config.User ownership. Preserve the archive's
    // explicit root UID/GID instead; the guest verifier checks the extracted files.
    await bounded(performance.now() + 20_000, (timeout) => engine.put(
      `/containers/${state.containerID}/archive?path=/opt/orchestra&copyUIDGID=false&noOverwriteDirNonDir=true`,
      archive(loaded.files), timeout,
    ))
    admitted(await inspect(performance.now() + 4000))
    const channel = AppDockNativeChannel.create({
      endpoint: captured.endpoint, containerID: state.containerID,
      async start() {
        const deadline = performance.now() + 4000
        await bounded(deadline, () => captured.verifyWorkspace())
        admitted(await inspect(deadline))
        await bounded(deadline, (timeout) => engine.post(`/containers/${state.containerID}/start`, undefined, timeout))
      },
      stop,
    })
    state.channel = { ...channel, terminate: () => {
      state.retiring = true
      return channel.terminate()
    } }
    // The channel's own cleanup (kill, inspect, delete) has a 5 s deadline. A shorter client watchdog
    // declared helpers unreaped that the channel then proved gone, and that verdict is permanent: under
    // load it failed the next workspace rebind and retired the fresh helper with it.
    const client = await NativeDockClient.create(state.channel, { sessionID: captured.session.sessionID, reapMs: 6000 })
    const identity = client.hello.processIdentity
    // Placement evidence belongs to this helper container, not an app binding.
    if (!identity || identity.bootID !== captured.session.processIdentity.bootID
      || identity.pidNamespace !== captured.session.processIdentity.pidNamespace
      || identity.mountNamespace === captured.session.processIdentity.mountNamespace)
      throw failure("helper-placement-mismatch")
    return { client, channel: state.channel, containerID: state.containerID, payload: loaded.manifest,
      active: () => !state.retiring && state.stopping === undefined }
  } catch (error) {
    // NativeDockClient's shorter watchdog may reject while channel cleanup is
    // still in flight. Join both promises before returning a setup failure.
    const channelFailure = await state.channel?.terminate().then(() => undefined, (cause: unknown) => cause)
    const exit = state.attempted ? await stop() : undefined
    if (!state.attempted) engine.close()
    const unknown = [error, channelFailure].some((cause) => cause instanceof NativeDockProtocol.NativeError && cause.outcome === "unknown")
    throw Object.assign(failure("helper-setup-failed", unknown ? "unknown" : "not-dispatched"), { cause: error, exit })
  }
}

function capture(options: Options): Options {
  try {
    // The Runtime caller owns semantic fingerprint validation. Capture its policy
    // value synchronously so later caller mutations cannot alter deployment.
    const encoded = JSON.stringify(options.securityPolicy)
    if (typeof encoded !== "string" || Buffer.byteLength(encoded) > 131072) throw failure("helper-options-invalid")
    const securityPolicy: unknown = JSON.parse(encoded, (_key, value: unknown) =>
      value !== null && typeof value === "object" ? Object.freeze(value) : value)
    if (!NativeDockProtocol.object(securityPolicy) || securityPolicy.defaultAction !== "SCMP_ACT_ERRNO")
      throw failure("helper-options-invalid")
    if (Object.keys(options.session.environment).length > 6 || Object.keys(options.session.processIdentity).length !== 5)
      throw failure("helper-options-invalid")
    const value = {
      endpoint: options.endpoint, owner: options.owner, workspaceID: options.workspaceID,
      workspaceStartedAt: options.workspaceStartedAt, homeVolume: options.homeVolume, imageID: options.imageID,
      securityPolicy, payloadDirectory: options.payloadDirectory,
      verifyWorkspace: options.verifyWorkspace,
      session: { sessionID: options.session.sessionID, processIdentity: { ...options.session.processIdentity }, environment: { ...options.session.environment } },
    }
    if (typeof value.owner !== "string" || !uuid.test(value.owner) || typeof value.workspaceID !== "string" || !id.test(value.workspaceID)
      || typeof value.imageID !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.imageID)
      || typeof value.session.sessionID !== "string" || !uuid.test(value.session.sessionID) || value.homeVolume !== `orchestra-linux-${value.owner}-home`
      || typeof value.workspaceStartedAt !== "string" || value.workspaceStartedAt.length > 40
      || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value.workspaceStartedAt) || !Number.isFinite(Date.parse(value.workspaceStartedAt))
      || typeof value.verifyWorkspace !== "function") throw failure("helper-options-invalid")
    const endpoint = value.endpoint
    if (typeof endpoint !== "string" || endpoint.length > 4096 || /[\x00-\x1f\x7f]/.test(endpoint)) throw failure("helper-options-invalid")
    if (!(process.platform === "win32" && /^npipe:\/\/\/\/\.\/pipe\/[\w.-]+$/.test(endpoint))) {
      const url = new URL(endpoint)
      if (process.platform === "win32" || !endpoint.startsWith("unix:///") || url.host || url.search || url.hash || url.username || url.password
        || /[\x00-\x1f\x7f]/.test(decodeURIComponent(url.pathname))) throw failure("helper-options-invalid")
    }
    if (typeof value.payloadDirectory !== "string" || value.payloadDirectory.length > 4096 || !isAbsolute(value.payloadDirectory)
      || /[\x00-\x1f\x7f]/.test(value.payloadDirectory)) throw failure("helper-options-invalid")
    const identity = value.session.processIdentity
    if (Object.keys(identity).sort().join() !== "bootID,mountNamespace,pid,pidNamespace,startTicks"
      || ![identity.pid, identity.startTicks].every((number) => Number.isSafeInteger(number) && number > 0)
      || typeof identity.bootID !== "string" || !uuid.test(identity.bootID)
      || typeof identity.pidNamespace !== "string" || identity.pidNamespace.length > 128 || !/^pid:\[\d+\]$/.test(identity.pidNamespace)
      || typeof identity.mountNamespace !== "string" || identity.mountNamespace.length > 128 || !/^mnt:\[\d+\]$/.test(identity.mountNamespace))
      throw failure("helper-options-invalid")
    const env = value.session.environment
    if (Object.keys(env).length > 6 || !Object.keys(env).every((key) => environmentKeys.includes(key))
      || !Object.values(env).every((entry) => typeof entry === "string" && entry.length > 0 && Buffer.byteLength(entry) <= 1024 && !/[\x00-\x1f\x7f]/.test(entry))
      || env.DISPLAY !== ":100" || env.XDG_RUNTIME_DIR !== run || env.ORCHESTRA_A11Y_SESSION_ID !== value.session.sessionID
      || !/^unix:path=\/home\/dock\/\.orchestra-runtime\/run\/session-bus(?:,guid=[0-9a-fA-F]{32})?$/.test(env.DBUS_SESSION_BUS_ADDRESS ?? "")
      || !/^unix:path=\/home\/dock\/\.orchestra-runtime\/run\/at-spi\/bus_100(?:,guid=[0-9a-fA-F]{32})?$/.test(env.AT_SPI_BUS_ADDRESS ?? "")
      || (env.XAUTHORITY !== undefined && (!env.XAUTHORITY.startsWith(`${home}/`) || posix.normalize(env.XAUTHORITY) !== env.XAUTHORITY
        || env.XAUTHORITY.endsWith("/") || env.XAUTHORITY.includes("\\")))) throw failure("helper-options-invalid")
    return value
  } catch {
    throw failure("helper-options-invalid")
  }
}

async function regularFile(path: string, maximum: number) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await file.stat()
    if (!before.isFile() || before.nlink !== 1 || before.size < 1 || before.size > maximum) throw failure("helper-file-invalid")
    const bytes = Buffer.alloc(maximum + 1)
    const state = { used: 0 }
    while (state.used < bytes.length) {
      const read = await file.read(bytes, state.used, bytes.length - state.used, null)
      if (!read.bytesRead) break
      state.used += read.bytesRead
    }
    const after = await file.stat()
    if (state.used !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs)
      throw failure("helper-file-invalid")
    return Buffer.from(bytes.subarray(0, state.used))
  } finally {
    await file.close()
  }
}

async function payload(directory: string) {
  if (!(await lstat(directory)).isDirectory()) throw failure("helper-file-invalid")
  const files: Array<{ name: string; data: Buffer }> = []
  for (const name of names) {
    const data = await regularFile(join(directory, name), 131072)
    if (files.reduce((total, file) => total + file.data.length, data.length) > 262144) throw failure("helper-file-invalid")
    files.push({ name, data })
  }
  const manifest = files.map((file) => ({ name: file.name, sha256: hash(file.data), bytes: file.data.length }))
  return { files, manifest: { files: manifest, sha256: hash(JSON.stringify(manifest)) } }
}

function archive(files: Array<{ name: string; data: Buffer }>) {
  if (files.length !== names.length || files.some((file, index) =>
    file.name !== names[index] || file.data.length < 1 || file.data.length > 131072)
    || files.reduce((total, file) => total + file.data.length, 0) > 262144) throw failure("helper-archive-invalid")
  const length = 512 * (names.length + 3) + files.reduce((total, file) => total + Math.ceil(file.data.length / 512) * 512, 0)
  // One directory, eight headers and at most eight 511-byte pads, plus two EOF blocks.
  if (length > 262144 + 9 * 512 + 8 * 511 + 2 * 512) throw failure("helper-archive-invalid")
  const bytes = Buffer.alloc(length)
  const position = { offset: 0 }
  const entries = [
    { name: "app-dock-accessibility/", data: Buffer.alloc(0), directory: true },
    ...files.map((file) => ({ name: `app-dock-accessibility/${file.name}`, data: file.data, directory: false })),
  ]
  entries.forEach((entry) => {
    const header = bytes.subarray(position.offset, position.offset + 512)
    // All names come from the closed ASCII list and fit the USTAR name field.
    header.write(entry.name, 0, 100, "ascii")
    header.write((entry.directory ? 0o755 : 0o644).toString(8).padStart(7, "0"), 100, 7, "ascii")
    // Numeric ownership is independent of the host account running the manager.
    header.write("0000000", 108, 7, "ascii")
    header.write("0000000", 116, 7, "ascii")
    header.write(entry.data.length.toString(8).padStart(11, "0"), 124, 11, "ascii")
    header.write("00000000000", 136, 11, "ascii")
    header.fill(0x20, 148, 156)
    header[156] = entry.directory ? 0x35 : 0x30
    header.write("ustar\0", 257, 6, "ascii")
    header.write("00", 263, 2, "ascii")
    header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0"), 148, 6, "ascii")
    header[154] = 0
    header[155] = 0x20
    entry.data.copy(bytes, position.offset + 512)
    position.offset += 512 + Math.ceil(entry.data.length / 512) * 512
  })
  return bytes
}

function requireConfig(found: Record<string, unknown>, expected: Record<string, unknown>, options: Options) {
  const config = object(found.Config)
  const host = object(found.HostConfig)
  const wanted = object(expected.HostConfig)
  const mounts = found.Mounts
  const requested = host.Mounts
  const env = config.Env
  // These are the pinned workspace image's harmless defaults, not host/session
  // inheritance. The verifier execs with only the session allowlist plus HOME/LANG.
  const allowed = [...expected.Env as string[], "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "DEBIAN_FRONTEND=noninteractive"]
  if (found.Image !== options.imageID || config.Image !== options.imageID || config.User !== "10001:10001"
    || config.Tty !== false || config.OpenStdin !== true || config.StdinOnce !== true
    || config.WorkingDir !== guest || !empty(config.Entrypoint) || !same(config.Cmd, expected.Cmd)
    || !same(object(config.Healthcheck).Test, ["NONE"])
    || !Array.isArray(env) || env.length > allowed.length || new Set(env).size !== env.length
    || !env.every((item) => allowed.includes(item)) || !(expected.Env as string[]).every((item) => env.includes(item))
    || !["Memory", "MemorySwap", "NanoCpus", "PidsLimit", "PidMode", "NetworkMode"].every((key) => host[key] === wanted[key])
    || host.Privileged !== false || !empty(host.CapAdd) || !same(host.CapDrop, ["ALL"])
    || (host.Init !== undefined && host.Init !== null && host.Init !== false) || host.AutoRemove !== false || host.PublishAllPorts !== false
    || object(host.RestartPolicy).Name !== "no" || !empty(host.PortBindings) || !empty(host.Binds)
    || !empty(host.Devices) || !empty(host.DeviceRequests) || !empty(host.VolumesFrom) || !empty(host.Tmpfs)
    || !Array.isArray(requested) || requested.length !== 1
    || object(requested[0]).Type !== "volume" || object(requested[0]).Source !== options.homeVolume
    || object(requested[0]).Target !== home || ![undefined, false].includes(object(requested[0]).ReadOnly as boolean | undefined)
    || !same(object(requested[0]).VolumeOptions, { NoCopy: true }) || !same(host.SecurityOpt, wanted.SecurityOpt)
    || !Array.isArray(mounts) || mounts.length !== 1
    || object(mounts[0]).Type !== "volume" || object(mounts[0]).Name !== options.homeVolume
    || object(mounts[0]).Destination !== home || object(mounts[0]).RW !== true
    || Object.values(object(object(found.NetworkSettings).Ports)).some((value) => !empty(value))) throw failure("helper-config-invalid")
}

function containerState(found: Record<string, unknown>) {
  const state = object(found.State)
  if (typeof state.Running !== "boolean" || typeof state.OOMKilled !== "boolean"
    || typeof state.Pid !== "number" || !Number.isSafeInteger(state.Pid) || state.Pid < 0
    || typeof state.ExitCode !== "number" || !Number.isSafeInteger(state.ExitCode)
    || state.Restarting !== false || state.Dead !== false || state.Paused !== false
    || (!state.Running && state.Pid !== 0)) throw failure("helper-state-unproven", "unknown")
  return { Running: state.Running, OOMKilled: state.OOMKilled, Pid: state.Pid, ExitCode: state.ExitCode, Status: state.Status }
}

function object(value: unknown) {
  if (!NativeDockProtocol.object(value)) throw failure("helper-inspect-invalid")
  return value
}

function empty(value: unknown) {
  return value === undefined || value === null || (Array.isArray(value) ? value.length === 0 : NativeDockProtocol.object(value) && Object.keys(value).length === 0)
}

function same(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => same(value, right[index]))
  if (!NativeDockProtocol.object(left) || !NativeDockProtocol.object(right)) return false
  return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every((key) => Object.hasOwn(right, key) && same(left[key], right[key]))
}

function hash(bytes: string | Buffer) {
  return createHash("sha256").update(bytes).digest("hex")
}

async function bounded<T>(deadline: number, run: (timeout: number) => Promise<T>): Promise<T> {
  const remaining = Math.floor(deadline - performance.now())
  if (remaining < 1) throw failure("helper-deadline-expired", "unknown")
  const expired = Promise.withResolvers<never>()
  const timer = setTimeout(() => expired.reject(failure("helper-deadline-expired", "unknown")), remaining)
  try {
    const result = await Promise.race([run(Math.min(20_000, remaining)), expired.promise])
    if (performance.now() >= deadline) throw failure("helper-deadline-expired", "unknown")
    return result
  } finally {
    clearTimeout(timer)
  }
}

function failure(code: string, outcome: NativeDockProtocol.Outcome = "not-dispatched") {
  return new NativeDockProtocol.NativeError(code, "Native helper resource boundary failed", outcome)
}
