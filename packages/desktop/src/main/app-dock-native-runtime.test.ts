import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { createServer, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AppDockNativeRuntime } from "./app-dock-native-runtime"
import { NativeDockProtocol } from "./app-dock-native-protocol"

const owner = "11dc45b7-3ed8-40ea-a56e-232a1c39f381"
const sessionID = "96cab8ab-6bce-4d07-94ec-fb0a2951d998"
const workspaceID = "a".repeat(64)
const helperID = "b".repeat(64)
const imageID = `sha256:${"c".repeat(64)}`
const names = ["actions.py", "bindings.py", "bus.py", "context.py", "keyboard.py", "main.py", "refs.py", "snapshot.py"]
const resources: Array<() => Promise<void>> = []
const channels: NativeDockProtocol.Channel[] = []

afterEach(async () => {
  await Promise.all(channels.splice(0).map((channel) => channel.terminate().catch(() => {})))
  await Promise.all(resources.splice(0).map((close) => close()))
})

type Inspect = {
  Id: string
  Name: string
  Image: string
  Config: Record<string, unknown>
  HostConfig: Record<string, unknown>
  Mounts: Array<{ Type: string; Name: string; Destination: string; RW: boolean }>
  NetworkSettings: { Ports: Record<string, unknown> }
  State: { Running: boolean; OOMKilled: boolean; Pid: number; ExitCode: number; Status: string; Restarting: boolean; Dead: boolean; Paused: boolean }
}

type ArchiveEntry = {
  name: string; type: string; mode: number; uid: number; gid: number; mtime: number; size: number
  linkname: string; pax: Record<string, string>; sha256: string
}

function readArchive(bytes: Buffer) {
  // Independent stdlib reader/writer validates USTAR framing and checksums. This
  // proves upload metadata/bytes, not Docker's eventual extraction ownership.
  const result = Bun.spawnSync(["python3", "-I", "-B", "-c", `import hashlib,io,json,sys,tarfile
b=sys.stdin.buffer.read(271865)
assert len(b)<=271864
with tarfile.open(fileobj=io.BytesIO(b),mode='r:') as archive:
 members=archive.getmembers(); assert len(members)<=9
 rows=[]; encoded=[]
 for m in members:
  data=archive.extractfile(m).read(131073) if m.isfile() else b''
  assert len(data)<=131072 and not m.pax_headers
  encoded.extend((m.tobuf(format=tarfile.USTAR_FORMAT),data,b'\\0'*(-len(data)%tarfile.BLOCKSIZE)))
  rows.append(dict(name=m.name,type=m.type.decode('ascii'),mode=m.mode,uid=m.uid,gid=m.gid,mtime=m.mtime,size=m.size,linkname=m.linkname,pax=m.pax_headers,sha256=hashlib.sha256(data).hexdigest()))
 expected=b''.join(encoded)+b'\\0'*(2*tarfile.BLOCKSIZE)
 assert b==expected, ('USTAR framing mismatch',next(((i,x,y) for i,(x,y) in enumerate(zip(b,expected)) if x!=y),None),len(b),len(expected))
 print(json.dumps(rows,separators=(',',':')))`], {
    stdin: bytes, stdout: "pipe", stderr: "pipe", timeout: 3000, maxBuffer: 65536,
  })
  expect({ code: result.exitCode, stderr: result.stderr.toString() }).toEqual({ code: 0, stderr: "" })
  return JSON.parse(result.stdout.toString()) as ArchiveEntry[]
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "nr-"))
  const directory = join(root, "payload")
  await mkdir(directory)
  const source = names.map((name) => ({ name, bytes: Buffer.from(`# checked ${name}\n`) }))
  await Promise.all(source.map((file) => writeFile(join(directory, file.name), file.bytes)))
  await writeFile(join(directory, "extra-artifact.json"), "must not be copied")
  const policy = { defaultAction: "SCMP_ACT_ERRNO", syscalls: [{ names: ["read", "write", "exit_group"], action: "SCMP_ACT_ALLOW" }] }
  const state = {
    requests: [] as Array<{ method: string; path: string }>,
    events: [] as string[],
    created: undefined as Record<string, unknown> | undefined,
    container: undefined as Inspect | undefined,
    socket: undefined as Socket | undefined,
    upload: undefined as ArchiveEntry[] | undefined,
    archiveBytes: 0,
    verifies: 0,
    rejectVerify: 0,
    rejectStart: false,
    badHello: false,
    helloIdentity: {
      pid: 453, startTicks: 135900, bootID: "d094670f-c1f8-446c-bdc6-084e9b057bd4",
      pidNamespace: "pid:[4026532500]", mountNamespace: "mnt:[4026532502]",
    } as NativeDockProtocol.ProcessIdentity | undefined,
    delayReap: false,
    killConflict: false,
    uploadFailure: false,
    rejectDelete: false,
    lostCreate: false,
    mutate: undefined as ((value: Inspect) => void) | undefined,
    errors: [] as unknown[],
  }
  const sockets = new Set<Socket>()
  const serveRequest = (request: { url: string; method: string; body: Buffer; headers: string[] }, response: {
    writeHead: (code: number, headers?: Record<string, string>) => void; end: (body?: string) => void
  }) => {
    const serve = async () => {
      const url = new URL(request.url!, "http://fixture")
      state.requests.push({ method: request.method!, path: request.url! })
      if (request.method === "POST" && url.pathname === "/containers/create") {
        const body = JSON.parse(request.body.toString()) as Record<string, unknown>
        state.created = body
        state.events.push("create")
        state.container = {
          Id: helperID, Name: `/${url.searchParams.get("name")}`, Image: imageID,
          Config: Object.fromEntries(Object.entries(body).filter(([key]) => key !== "HostConfig")),
          HostConfig: structuredClone(body.HostConfig) as Record<string, unknown>,
          Mounts: [{ Type: "volume", Name: `orchestra-linux-${owner}-home`, Destination: "/home/dock", RW: true }],
          NetworkSettings: { Ports: {} },
          State: { Running: false, Pid: 0, Status: "created", ExitCode: 0, OOMKilled: false, Restarting: false, Paused: false, Dead: false },
        }
        // Docker's image environment merge and omitempty encoding are real
        // boundary details; do not return the create body byte-for-byte.
        state.container.Config.Env = [...body.Env as string[], "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "DEBIAN_FRONTEND=noninteractive"]
        const mount = (state.container.HostConfig.Mounts as Array<Record<string, unknown>>)[0]!
        delete mount.ReadOnly
        state.container.HostConfig.RestartPolicy = { Name: "no", MaximumRetryCount: 0 }
        response.writeHead(state.lostCreate ? 500 : 201, { "Content-Type": "application/json" })
        response.end(JSON.stringify(state.lostCreate ? { message: "private create diagnostic" } : { Id: helperID }))
        return
      }
      const container = state.container
      const path = `/containers/${helperID}`
      if (request.method === "GET" && container && (url.pathname === `${path}/json` || url.pathname === `/containers${container.Name}/json`)) {
        state.events.push("inspect")
        const inspected = structuredClone(container)
        state.mutate?.(inspected)
        response.writeHead(200, { "Content-Type": "application/json" })
        response.end(JSON.stringify(inspected))
        return
      }
      if (request.method === "PUT" && container && url.pathname === `${path}/archive`) {
        expect(request.url).toBe(`${path}/archive?path=/opt/orchestra&copyUIDGID=false&noOverwriteDirNonDir=true`)
        expect(request.headers.map((line) => line.toLowerCase())).toContain("content-type: application/x-tar")
        expect(request.body.length).toBeLessThanOrEqual(262144 + 9 * 512 + 8 * 511 + 2 * 512)
        expect(container.State).toMatchObject({ Running: false, Pid: 0, Status: "created" })
        state.events.push("upload")
        state.archiveBytes = request.body.length
        state.upload = readArchive(request.body)
        response.writeHead(state.uploadFailure ? 500 : 200)
        response.end(state.uploadFailure ? JSON.stringify({ message: "private upload diagnostic" }) : undefined)
        return
      }
      if (request.method === "POST" && container && url.pathname === `${path}/start`) {
        state.events.push("start")
        expect(state.upload).toBeDefined()
        if (state.rejectStart) {
          response.writeHead(500, { "Content-Type": "application/json" })
          response.end(JSON.stringify({ message: "secret start diagnostic" }))
          return
        }
        container.State.Running = true
        container.State.Pid = 453
        container.State.Status = "running"
        response.writeHead(204)
        response.end()
        const hello = Buffer.from(JSON.stringify({ v: 1, id: "hello", ok: true, value: {
          backend: "linux-atspi", helperEpoch: "fixture-helper", sessionID: state.badHello ? "wrong-session" : sessionID,
          limits: NativeDockProtocol.limits, operations: ["bind", "read", "action", "type", "unbind", "cancel", "shutdown"],
          processIdentity: state.helloIdentity,
        } }) + "\n")
        const header = Buffer.alloc(8)
        header[0] = 1
        header.writeUInt32BE(hello.length, 4)
        state.socket!.write(Buffer.concat([header, hello]))
        return
      }
      if (request.method === "POST" && container && url.pathname === `${path}/kill` && url.search === "?signal=SIGKILL") {
        state.events.push("kill")
        expect(container.State.Running).toBe(true)
        if (!state.delayReap) {
          container.State.Running = false
          container.State.Pid = 0
          container.State.Status = "exited"
          container.State.ExitCode = 137
        }
        response.writeHead(state.killConflict ? 409 : 204)
        response.end(state.killConflict ? JSON.stringify({ message: "already exited" }) : undefined)
        return
      }
      if (request.method === "DELETE" && container && url.pathname === path && !url.search) {
        expect(container.State.Running).toBe(false)
        state.events.push("delete")
        if (!state.rejectDelete) state.container = undefined
        response.writeHead(state.rejectDelete ? 500 : 204)
        response.end(state.rejectDelete ? JSON.stringify({ message: "private removal diagnostic" }) : undefined)
        return
      }
      throw new Error(`Unexpected fake engine request: ${request.method} ${url.pathname}`)
    }
    serve().catch((error: unknown) => {
      state.errors.push(error)
      response.writeHead(500)
      response.end(JSON.stringify({ message: "fixture failure" }))
    })
  }
  // Real HTTP over a Unix socket. Bun's node:http upgrade shim acknowledges
  // socket.write without delivering bytes; use node:net for the hijacked stream.
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    sockets.add(socket)
    socket.on("error", () => {})
    socket.on("close", () => sockets.delete(socket))
    const input = { bytes: Buffer.alloc(0), attached: false }
    socket.on("data", (chunk) => {
      if (input.attached) return
      input.bytes = Buffer.concat([input.bytes, chunk])
      while (input.bytes.length) {
        const end = input.bytes.indexOf("\r\n\r\n")
        if (end < 0) return
        const lines = input.bytes.subarray(0, end).toString().split("\r\n")
        const [method, url] = lines[0]!.split(" ")
        const length = Number(lines.find((line) => /^content-length:/i.test(line))?.split(":")[1]?.trim() ?? 0)
        if (input.bytes.length < end + 4 + length) return
        const body = input.bytes.subarray(end + 4, end + 4 + length)
        input.bytes = input.bytes.subarray(end + 4 + length)
        if (url!.includes("/attach?")) {
          state.requests.push({ method: method!, path: url! })
          expect(url).toBe(`/v1.51/containers/${helperID}/attach?stream=1&stdin=1&stdout=1&stderr=1`)
          input.attached = true
          state.socket = socket
          state.events.push("attach")
          socket.write("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n")
          return
        }
        const reply = { code: 200 }
        serveRequest({ method: method!, url: url!, body, headers: lines.slice(1) }, {
          writeHead(code) { reply.code = code },
          end(body = "") {
            socket.write(`HTTP/1.1 ${reply.code} Fixture\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: keep-alive\r\n\r\n${body}`)
          },
        })
      }
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(join(root, "s"), resolve)
  })
  resources.push(async () => {
    sockets.forEach((socket) => socket.destroy())
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await rm(root, { recursive: true })
    expect(state.errors).toEqual([])
    expect(state.requests.filter((request) => request.method !== "GET").every((request) => !request.path.includes(workspaceID))).toBe(true)
  })
  const options: AppDockNativeRuntime.Options = {
    endpoint: `unix://${join(root, "s")}`, owner, workspaceID, workspaceStartedAt: "2026-10-03T21:00:00.123456789Z",
    homeVolume: `orchestra-linux-${owner}-home`, imageID,
    securityPolicy: policy, payloadDirectory: directory,
    session: {
      sessionID,
      processIdentity: { pid: 77, startTicks: 135790, bootID: "d094670f-c1f8-446c-bdc6-084e9b057bd4", pidNamespace: "pid:[4026532500]", mountNamespace: "mnt:[4026532501]" },
      environment: {
        DISPLAY: ":100", XDG_RUNTIME_DIR: "/home/dock/.orchestra-runtime/run", XAUTHORITY: "/home/dock/.Xauthority",
        DBUS_SESSION_BUS_ADDRESS: "unix:path=/home/dock/.orchestra-runtime/run/session-bus,guid=0123456789abcdef0123456789abcdef",
        AT_SPI_BUS_ADDRESS: "unix:path=/home/dock/.orchestra-runtime/run/at-spi/bus_100", ORCHESTRA_A11Y_SESSION_ID: sessionID,
      },
    },
    async verifyWorkspace() {
      state.events.push("verify")
      state.verifies++
      if (state.verifies === state.rejectVerify) throw new Error("private workspace identity failure")
    },
  }
  return { options, state, source, root, policy }
}

async function rejected(promise: Promise<unknown>) {
  return promise.then(async (value) => {
    if (NativeDockProtocol.object(value) && NativeDockProtocol.object(value.channel) && typeof value.channel.terminate === "function")
      await value.channel.terminate()
    throw new Error("Expected native runtime rejection")
  }, (error: unknown) => {
    expect(error).toBeInstanceOf(NativeDockProtocol.NativeError)
    expect((error as Error).message).toBe("Native helper resource boundary failed")
    return error as NativeDockProtocol.NativeError
  })
}

test("deploys exact byte manifest, captures inputs, overrides image entrypoint, and reaps only owned helper", async () => {
  const f = await fixture()
  const creating = AppDockNativeRuntime.create(f.options)
  f.options.owner = "mutated"
  f.options.workspaceID = "d".repeat(64)
  f.options.session.sessionID = "mutated"
  f.options.session.environment.DISPLAY = ":999"
  f.options.session.processIdentity.pid = -1
  f.options.session.processIdentity.bootID = owner
  f.options.session.processIdentity.pidNamespace = "pid:[1]"
  f.options.session.processIdentity.mountNamespace = "mnt:[4026532502]"
  f.options.verifyWorkspace = async () => { throw new Error("mutated") }
  const result = await creating
  channels.push(result.channel)
  expect(result.containerID).toBe(helperID)
  expect(result.client.hello.sessionID).toBe(sessionID)
  const files = f.source.map((file) => ({ name: file.name, sha256: createHash("sha256").update(file.bytes).digest("hex"), bytes: file.bytes.length }))
  expect(result.payload).toEqual({ files, sha256: createHash("sha256").update(JSON.stringify(files)).digest("hex") })
  expect(f.state.created).toMatchObject({
    Image: imageID, User: "10001:10001", Entrypoint: [], Tty: false, OpenStdin: true, StdinOnce: true,
    Labels: { "io.orchestra.app-dock": "workspace", "io.orchestra.app-dock.owner": owner, "io.orchestra.app-dock.kind": "accessibility", "io.orchestra.app-dock.workspace": workspaceID, "io.orchestra.app-dock.session": sessionID },
    HostConfig: {
      PidMode: `container:${workspaceID}`, NetworkMode: `container:${workspaceID}`, Memory: 134217728, MemorySwap: 134217728,
      NanoCpus: 500000000, PidsLimit: 64, Privileged: false, CapAdd: [], CapDrop: ["ALL"], Init: false,
      PublishAllPorts: false, PortBindings: {}, AutoRemove: false, SecurityOpt: [`seccomp=${JSON.stringify(f.policy)}`, "no-new-privileges"],
    },
  })
  expect(f.state.created!.Env).toContain("HOME=/home/dock")
  expect(f.state.created!.Env).toContain("LANG=C.UTF-8")
  expect((f.state.created!.Cmd as string[]).slice(0, 5)).toEqual(["/usr/bin/python3", "-u", "-B", "-I", "-c"])
  expect(JSON.parse((f.state.created!.Cmd as string[])[6]!)).toEqual(files)
  expect(f.state.events).toEqual(["verify", "create", "inspect", "upload", "inspect", "attach", "verify", "inspect", "start"])
  const exits: NativeDockProtocol.Exit[] = []
  result.channel.onExit((exit) => { exits.push(exit) })
  expect(result.active()).toBe(true)
  const stopping = result.channel.terminate()
  expect(result.active()).toBe(false)
  await Promise.all([stopping, result.channel.terminate()])
  expect(f.state.events.slice(-4)).toEqual(["inspect", "kill", "inspect", "delete"])
  expect(exits).toEqual([{ code: 137, signal: "SIGKILL", reason: "helper-exited" }])
  expect(f.state.container).toBeUndefined()
})

test("USTAR upload carries root ownership and exact checked payload bytes", async () => {
  const f = await fixture()
  const result = await AppDockNativeRuntime.create(f.options)
  channels.push(result.channel)
  expect(f.state.upload).toEqual([
    { name: "app-dock-accessibility", type: "5", mode: 0o755, uid: 0, gid: 0, mtime: 0, size: 0,
      linkname: "", pax: {}, sha256: createHash("sha256").update(Buffer.alloc(0)).digest("hex") },
    ...f.source.map((file) => ({
      name: `app-dock-accessibility/${file.name}`, type: "0", mode: 0o644, uid: 0, gid: 0, mtime: 0,
      size: file.bytes.length, linkname: "", pax: {}, sha256: createHash("sha256").update(file.bytes).digest("hex"),
    })),
  ])
  expect(f.state.upload).toHaveLength(9)
  expect(f.state.archiveBytes % 512).toBe(0)
  expect(f.state.events).toEqual(["verify", "create", "inspect", "upload", "inspect", "attach", "verify", "inspect", "start"])
})

test("security policy capture isolates nested caller mutation before first await", async () => {
  const f = await fixture()
  const expected = JSON.stringify(f.policy)
  const creating = AppDockNativeRuntime.create(f.options)
  f.policy.syscalls[0]!.names.push("mount")
  f.policy.syscalls[0]!.action = "SCMP_ACT_ERRNO"
  f.policy.syscalls.push({ names: ["ptrace"], action: "SCMP_ACT_ALLOW" })
  const result = await creating
  channels.push(result.channel)
  expect(JSON.stringify(f.policy)).not.toBe(expected)
  expect(f.state.container!.HostConfig.SecurityOpt).toEqual([`seccomp=${expected}`, "no-new-privileges"])
  expect(result.active()).toBe(true)
})

test.each([
  { name: "null", policy: null },
  { name: "undefined", policy: undefined },
  { name: "array", policy: [] },
  { name: "string", policy: "{private-policy" },
  { name: "number", policy: 42 },
  { name: "missing default action", policy: {} },
  { name: "wrong default action", policy: { defaultAction: "SCMP_ACT_ALLOW" } },
  { name: "nonserializable", policy: { defaultAction: "SCMP_ACT_ERRNO", private: 1n } },
  { name: "throwing serializer", policy: { toJSON() { throw new Error("private policy serializer diagnostic") } } },
  { name: "oversized ASCII", policy: { defaultAction: "SCMP_ACT_ERRNO", comment: "x".repeat(131072) } },
  { name: "oversized UTF-8", policy: { defaultAction: "SCMP_ACT_ERRNO", comment: "é".repeat(65536) } },
])("rejects $name security policy before engine I/O", async (example) => {
  const f = await fixture()
  f.options.securityPolicy = example.policy
  expect(await rejected(AppDockNativeRuntime.create(f.options))).toMatchObject({ code: "helper-options-invalid", outcome: "not-dispatched" })
  expect(f.state.events).toEqual([])
  expect(f.state.requests).toEqual([])
})

test("rejects cyclic security policy before engine I/O", async () => {
  const f = await fixture()
  const policy: Record<string, unknown> = { defaultAction: "SCMP_ACT_ERRNO" }
  policy.self = policy
  f.options.securityPolicy = policy
  expect(await rejected(AppDockNativeRuntime.create(f.options))).toMatchObject({ code: "helper-options-invalid", outcome: "not-dispatched" })
  expect(f.state.events).toEqual([])
  expect(f.state.requests).toEqual([])
})

test.each([0, 1])("security policy byte boundary plus %i", async (extra) => {
  const f = await fixture()
  const policy = { ...f.policy, comment: "" }
  policy.comment = "x".repeat(131072 - Buffer.byteLength(JSON.stringify(policy)) + extra)
  f.options.securityPolicy = policy
  expect(Buffer.byteLength(JSON.stringify(policy))).toBe(131072 + extra)
  if (extra) {
    expect(await rejected(AppDockNativeRuntime.create(f.options))).toMatchObject({ code: "helper-options-invalid", outcome: "not-dispatched" })
    expect(f.state.events).toEqual([])
    expect(f.state.requests).toEqual([])
    return
  }
  const result = await AppDockNativeRuntime.create(f.options)
  channels.push(result.channel)
  expect(f.state.container!.HostConfig.SecurityOpt).toEqual([`seccomp=${JSON.stringify(policy)}`, "no-new-privileges"])
})

test.each(["valid", "wrong-boot", "wrong-pid-namespace", "missing-identity", "same-mount-namespace"])(
  "helper placement %s is checked before client admission", async (kind) => {
    const f = await fixture()
    if (kind === "wrong-boot") f.state.helloIdentity!.bootID = owner
    if (kind === "wrong-pid-namespace") f.state.helloIdentity!.pidNamespace = "pid:[4026532999]"
    if (kind === "missing-identity") f.state.helloIdentity = undefined
    if (kind === "same-mount-namespace") f.state.helloIdentity!.mountNamespace = f.options.session.processIdentity.mountNamespace
    if (kind === "valid") {
      const result = await AppDockNativeRuntime.create(f.options)
      channels.push(result.channel)
      expect(result.client.hello.processIdentity).toEqual(f.state.helloIdentity)
      expect(result.client.hello.processIdentity!.bootID).toBe(f.options.session.processIdentity.bootID)
      expect(result.client.hello.processIdentity!.pidNamespace).toBe(f.options.session.processIdentity.pidNamespace)
      expect(result.client.hello.processIdentity!.mountNamespace).not.toBe(f.options.session.processIdentity.mountNamespace)
      expect(f.state.events.at(-1)).toBe("start")
      return
    }
    expect(await rejected(AppDockNativeRuntime.create(f.options))).toMatchObject({ code: "helper-setup-failed" })
    expect(f.state.events.slice(-4)).toEqual(["inspect", "kill", "inspect", "delete"])
    expect(f.state.container).toBeUndefined()
  },
)

test.each(["owner", "id", "name", "session", "workspace", "kind"])("foreign %s never permits upload, start, kill, or delete", async (kind) => {
  const f = await fixture()
  f.state.mutate = (found) => {
    if (kind === "id") { found.Id = workspaceID; return }
    if (kind === "name") { found.Name = "/replacement"; return }
    ;(found.Config.Labels as Record<string, string>)[`io.orchestra.app-dock.${kind}`] = "foreign"
  }
  expect(await rejected(AppDockNativeRuntime.create(f.options))).toMatchObject({ code: "helper-termination-failed", outcome: "unknown" })
  expect(f.state.events).toEqual(["verify", "create", "inspect", "inspect"])
})

test.each(["User", "Memory", "MemorySwap", "NanoCpus", "PidsLimit", "PidMode", "NetworkMode", "CapAdd", "SecurityOpt", "Mounts", "Cmd", "Env", "OpenStdin", "StdinOnce", "Tty", "Healthcheck"])(
  "rejects wrong %s before admission, then removes proven stopped helper", async (key) => {
    const f = await fixture()
    f.state.mutate = (found) => {
      if (["User", "Cmd", "Env", "OpenStdin", "StdinOnce", "Tty", "Healthcheck"].includes(key)) { found.Config[key] = "wrong"; return }
      if (key === "Mounts") { found.Mounts = []; return }
      found.HostConfig[key] = "wrong"
    }
    expect(await rejected(AppDockNativeRuntime.create(f.options))).toMatchObject({ code: "helper-setup-failed" })
    expect(f.state.events).toEqual(["verify", "create", "inspect", "inspect", "delete"])
  },
)

test.each(["manifest", "resource"])("changed %s after upload is rejected before attach", async (kind) => {
  const f = await fixture()
  f.state.mutate = (found) => {
    if (!f.state.upload) return
    if (kind === "resource") { found.HostConfig.Memory = 1; return }
    const command = found.Config.Cmd as string[]
    const manifest = JSON.parse(command[6]!) as Array<{ sha256: string }>
    manifest[0]!.sha256 = "0".repeat(64)
    command[6] = JSON.stringify(manifest)
  }
  expect(await rejected(AppDockNativeRuntime.create(f.options))).toMatchObject({ code: "helper-setup-failed" })
  expect(f.state.events).toEqual(["verify", "create", "inspect", "upload", "inspect", "inspect", "delete"])
  expect(f.state.container).toBeUndefined()
})

test.each(["workspace", "engine", "hello", "upload", "create"])("%s rejection joins cleanup before returning sanitized failure", async (point) => {
  const f = await fixture()
  f.state.rejectVerify = point === "workspace" ? 2 : 0
  f.state.rejectStart = point === "engine"
  f.state.badHello = point === "hello"
  f.state.uploadFailure = point === "upload"
  f.state.lostCreate = point === "create"
  await rejected(AppDockNativeRuntime.create(f.options))
  expect(f.state.events.at(-1)).toBe("delete")
  expect(f.state.container).toBeUndefined()
  expect(f.state.events.includes("kill")).toBe(point === "hello")
  if (point === "upload") expect(f.state.events).toEqual(["verify", "create", "inspect", "upload", "inspect", "delete"])
})

test("failed removal preserves unknown instead of reporting successful cleanup", async () => {
  const f = await fixture()
  f.state.uploadFailure = true
  f.state.rejectDelete = true
  expect(await rejected(AppDockNativeRuntime.create(f.options))).toMatchObject({ code: "helper-termination-failed", outcome: "unknown" })
  expect(f.state.container?.State).toMatchObject({ Running: false, Pid: 0 })
})

test("EOF cannot reap a still-running helper; final inspect records OOM reason", async () => {
  const f = await fixture()
  f.state.delayReap = true
  const result = await AppDockNativeRuntime.create(f.options)
  channels.push(result.channel)
  const exits: NativeDockProtocol.Exit[] = []
  result.channel.onExit((exit) => { exits.push(exit) })
  f.state.socket!.end()
  const deadline = performance.now() + 1000
  while (!f.state.events.includes("kill")) {
    if (performance.now() >= deadline) throw new Error("Fixture did not receive helper kill")
    await Bun.sleep(1)
  }
  await Bun.sleep(40)
  expect(exits).toEqual([])
  expect(f.state.events.includes("delete")).toBe(false)
  Object.assign(f.state.container!.State, { Running: false, Pid: 0, Status: "exited", ExitCode: 137, OOMKilled: true })
  await result.channel.terminate()
  expect(exits).toEqual([{ code: 137, signal: "SIGKILL", reason: "helper-resource-exit" }])
  expect(f.state.events.at(-1)).toBe("delete")
})

test("exit racing kill conflict still requires inspect evidence", async () => {
  const f = await fixture()
  f.state.killConflict = true
  const result = await AppDockNativeRuntime.create(f.options)
  channels.push(result.channel)
  await result.channel.terminate()
  expect(f.state.events.slice(-4)).toEqual(["inspect", "kill", "inspect", "delete"])
})

test("late old cleanup refuses replacement identity", async () => {
  const f = await fixture()
  const result = await AppDockNativeRuntime.create(f.options)
  channels.push(result.channel)
  f.state.mutate = (found) => { found.Id = "e".repeat(64) }
  await expect(result.channel.terminate()).rejects.toMatchObject({ code: "helper-termination-failed", outcome: "unknown" })
  expect(f.state.events.slice(-2)).toEqual(["start", "inspect"])
  expect(f.state.container!.State.Running).toBe(true)
})

test("unreaped helper exhausts one absolute stop budget and reports unknown", async () => {
  const f = await fixture()
  const result = await AppDockNativeRuntime.create(f.options)
  channels.push(result.channel)
  f.state.delayReap = true
  const exits: NativeDockProtocol.Exit[] = []
  result.channel.onExit((exit) => { exits.push(exit) })
  const started = performance.now()
  await expect(result.channel.terminate()).rejects.toMatchObject({ code: "helper-termination-failed", outcome: "unknown" })
  expect(performance.now() - started).toBeGreaterThanOrEqual(3800)
  expect(performance.now() - started).toBeLessThan(4700)
  expect(exits).toEqual([])
  expect(f.state.events.includes("delete")).toBe(false)
  expect(f.state.container!.State.Running).toBe(true)
}, 6000)

test("payload capture precedes workspace callback mutation of original source", async () => {
  const f = await fixture()
  const verify = f.options.verifyWorkspace
  f.options.verifyWorkspace = async () => {
    await writeFile(join(f.options.payloadDirectory, "main.py"), "changed after capture")
    await verify()
  }
  const result = await AppDockNativeRuntime.create(f.options)
  channels.push(result.channel)
  expect(result.payload.files.find((file) => file.name === "main.py")?.sha256)
    .toBe(createHash("sha256").update(f.source.find((file) => file.name === "main.py")!.bytes).digest("hex"))
  expect(f.state.upload!.find((entry) => entry.name === "app-dock-accessibility/main.py")?.sha256)
    .toBe(result.payload.files.find((file) => file.name === "main.py")!.sha256)
  expect(await readFile(join(f.options.payloadDirectory, "main.py"), "utf8")).toBe("changed after capture")
})

test("admits exact per-file and total byte boundaries with optional XAUTHORITY absent", async () => {
  const f = await fixture()
  delete f.options.session.environment.XAUTHORITY
  await Promise.all(f.source.map(async (file, index) => {
    file.bytes = Buffer.alloc(index === 0 ? 131072 : index === 1 ? 131066 : 1, 35)
    await writeFile(join(f.options.payloadDirectory, file.name), file.bytes)
  }))
  const result = await AppDockNativeRuntime.create(f.options)
  channels.push(result.channel)
  expect(result.payload.files.reduce((sum, file) => sum + file.bytes, 0)).toBe(262144)
  expect(result.payload.files[0]!.bytes).toBe(131072)
  expect(f.state.upload!.slice(1).map((entry) => ({ bytes: entry.size, sha256: entry.sha256 })))
    .toEqual(f.source.map((file) => ({ bytes: file.bytes.length, sha256: createHash("sha256").update(file.bytes).digest("hex") })))
  expect(f.state.archiveBytes).toBeLessThanOrEqual(262144 + 9 * 512 + 8 * 511 + 2 * 512)
})

test.each(["owner", "workspaceID", "imageID", "homeVolume", "sessionID", "process", "namespace", "env-extra", "display", "bus", "xauth", "atspi", "env-session", "endpoint"])(
  "rejects invalid %s before engine I/O", async (kind) => {
    const f = await fixture()
    if (kind === "owner") f.options.owner = "invalid"
    if (kind === "workspaceID") f.options.workspaceID = "abc"
    if (kind === "imageID") f.options.imageID = "image:latest"
    if (kind === "homeVolume") f.options.homeVolume = "foreign"
    if (kind === "sessionID") f.options.session.sessionID = "invalid"
    if (kind === "process") f.options.session.processIdentity.startTicks = 0
    if (kind === "namespace") f.options.session.processIdentity.mountNamespace = "pid:[123]"
    if (kind === "env-extra") f.options.session.environment.PASSWORD = "must-not-pass"
    if (kind === "display") f.options.session.environment.DISPLAY = ":101"
    if (kind === "bus") f.options.session.environment.DBUS_SESSION_BUS_ADDRESS = "unix:path=/tmp/session-bus"
    if (kind === "xauth") f.options.session.environment.XAUTHORITY = "/home/dock/../../etc/passwd"
    if (kind === "atspi") f.options.session.environment.AT_SPI_BUS_ADDRESS += ";tcp:host=localhost"
    if (kind === "env-session") f.options.session.environment.ORCHESTRA_A11Y_SESSION_ID = owner
    if (kind === "endpoint") f.options.endpoint = "tcp://127.0.0.1:2375"
    expect(await rejected(AppDockNativeRuntime.create(f.options))).toMatchObject({ code: "helper-options-invalid" })
    expect(f.state.events).toEqual([])
    expect(f.state.requests).toEqual([])
  },
)

test.each(["empty", "oversize", "total", "link", "missing"])("rejects %s payload before create", async (kind) => {
  const f = await fixture()
  if (kind === "empty") await writeFile(join(f.options.payloadDirectory, "main.py"), "")
  if (kind === "oversize") await writeFile(join(f.options.payloadDirectory, "main.py"), Buffer.alloc(131073))
  if (kind === "total") await Promise.all(names.slice(0, 3).map((name) => writeFile(join(f.options.payloadDirectory, name), Buffer.alloc(100000))))
  if (kind === "link" || kind === "missing") await rm(join(f.options.payloadDirectory, "main.py"))
  if (kind === "link") await symlink(join(f.options.payloadDirectory, "context.py"), join(f.options.payloadDirectory, "main.py"))
  await rejected(AppDockNativeRuntime.create(f.options))
  expect(f.state.requests).toEqual([])
})

/*
Lead-only real Docker probe; this fixture suite never invokes Docker.

Run the following in the lead's main-process integration harness with its already
captured AppDockNativeRuntime.Options named `options` and its separate endpoint/env-
captured Docker `command` function. Import assert from "node:assert/strict" and
the DockerEngine/AppDockNativeRuntime namespaces. Keep the real
verifyWorkspace callback: it must check owner, immutable workspace ID, StartedAt,
and the complete current native-session record outside the global runtime queue.
Use the existing running workspace/image and the Runtime-validated securityPolicy value.

const engine = DockerEngine.create(options.endpoint)
const workspacePath = `/containers/${options.workspaceID}/json`
const before = await engine.get<{ Id: string; State: { Running: boolean; StartedAt: string } }>(workspacePath, 3000)
assert.equal(before.Id, options.workspaceID)
assert.equal(before.State.StartedAt, options.workspaceStartedAt)
assert.equal(before.State.Running, true)
const helper = await AppDockNativeRuntime.create(options)
try {
  // A real hello proves the verifier exec and Python/Gio imports completed.
  assert.equal(helper.client.hello.sessionID, options.session.sessionID)
  assert.equal(helper.client.hello.processIdentity?.bootID, options.session.processIdentity.bootID)
  assert.equal(helper.client.hello.processIdentity?.pidNamespace, options.session.processIdentity.pidNamespace)
  assert.notEqual(helper.client.hello.processIdentity?.mountNamespace, options.session.processIdentity.mountNamespace)
  const checked = await engine.get<{ HostConfig: Record<string, unknown>; Config: { User: string; OpenStdin: boolean; StdinOnce: boolean } }>(`/containers/${helper.containerID}/json`, 3000)
  assert.equal(checked.Config.User, "10001:10001")
  assert.equal(checked.Config.OpenStdin, true)
  assert.equal(checked.Config.StdinOnce, true)
  for (const [key, value] of Object.entries({ Memory: 134217728, MemorySwap: 134217728, NanoCpus: 500000000, PidsLimit: 64,
    PidMode: `container:${options.workspaceID}`, NetworkMode: `container:${options.workspaceID}` })) assert.equal(checked.HostConfig[key], value)
  await command(["exec", "--user", "10001:10001", helper.containerID, "/usr/bin/python3", "-B", "-I", "-c", [
    "import hashlib,json,os,socket,sys",
    "from gi.repository import Gio",
    "assert os.getuid()==os.getgid()==10001",
    "p='/opt/orchestra/app-dock-accessibility'; m=json.loads(sys.argv[1])",
    "assert os.lstat(p).st_uid==0 and not os.lstat(p).st_mode&0o022",
    "assert sorted(os.listdir(p))==[f['name'] for f in m]",
    "for f in m:",
    " assert os.lstat(p+'/'+f['name']).st_uid==0 and not os.lstat(p+'/'+f['name']).st_mode&0o022",
    " b=open(p+'/'+f['name'],'rb').read(131073); assert len(b)==f['bytes'] and hashlib.sha256(b).hexdigest()==f['sha256']",
    "for key in ('DBUS_SESSION_BUS_ADDRESS','AT_SPI_BUS_ADDRESS'):",
    " c=Gio.DBusConnection.new_for_address_sync(os.environ[key],Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT|Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,None,None)",
    " c.call_sync('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','GetId',None,None,Gio.DBusCallFlags.NONE,1000,None); c.close_sync(None)",
    "s=socket.socket(socket.AF_UNIX); s.settimeout(1); s.connect(chr(0)+'/tmp/.X11-unix/X100'); s.close()",
  ].join("\n"), JSON.stringify(helper.payload.files)], 3000)
  // Freeze only the helper. SIGKILL/reap must finish even without stdout EOF.
  await engine.post(`/containers/${helper.containerID}/kill?signal=SIGSTOP`, undefined, 1000)
  const started = performance.now()
  await helper.channel.terminate()
  assert.ok(performance.now() - started < 4500)
  await assert.rejects(engine.get(`/containers/${helper.containerID}/json`, 1000),
    (error: unknown) => error instanceof DockerEngine.ResponseError && error.status === 404)
  await options.verifyWorkspace()
  const after = await engine.get<{ Id: string; State: { Running: boolean; StartedAt: string } }>(workspacePath, 3000)
  assert.equal(after.Id, before.Id)
  assert.equal(after.State.StartedAt, before.State.StartedAt)
  assert.equal(after.State.Running, true)
} finally {
  await helper.channel.terminate().finally(() => engine.close())
}

Expected: the positive probe returns hello and checked source hashes, verifies
root ownership after real extraction, and removes only the helper. The Python
tarfile fixture checks archive bytes/metadata only. It cannot prove Docker's
extraction UID/GID. Real Docker cgroups/OOM behavior, daemon seccomp and
mount normalization, Unix credential visibility, and Windows named pipes remain
outside this local HTTP fixture's evidence. If any constraint rejects the real
image/daemon, capture that exact field/error rather than relaxing the boundary.
*/
