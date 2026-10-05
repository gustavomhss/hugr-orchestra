export * as NativeProofDocker from "./native-proof-docker"

import http from "node:http"
import { randomUUID } from "node:crypto"
import { connect, type Socket } from "node:net"
import { PassThrough, type Readable } from "node:stream"

// Test transport only: same guest process and raw stdio, without the Desktop CLI attach path.
const socketPath = "/Users/gustavoschneiter/.docker/run/docker.sock"
const cap = 512 * 1024

const supervisor = `import ctypes,json,os,pathlib,signal,subprocess,sys,time
path=pathlib.Path(sys.argv[1]); token=sys.argv[2]; argv=json.loads(sys.argv[3])
def identity(pid):
 data=pathlib.Path('/proc/'+str(pid)+'/stat').read_text().rsplit(')',1)[1].split()
 return dict(pid=pid,startTicks=int(data[19]),bootID=pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip(),pidNamespace=os.readlink('/proc/'+str(pid)+'/ns/pid'),mountNamespace=os.readlink('/proc/'+str(pid)+'/ns/mnt'))
def children(pid):
 try: return [int(x) for x in pathlib.Path('/proc/'+str(pid)+'/task/'+str(pid)+'/children').read_text().split()]
 except FileNotFoundError: return []
def descendants():
 pending=children(os.getpid()); found=[]
 while pending and len(found)<64:
  pid=pending.pop()
  found.append(pid); pending.extend(children(pid))
 return found
def owned(pid):
 for _ in range(64):
  if pid==os.getpid(): return True
  try: pid=int(pathlib.Path('/proc/'+str(pid)+'/stat').read_text().rsplit(')',1)[1].split()[1])
  except FileNotFoundError: return False
 return False
def interrupted(*_): raise SystemExit(143)
os.umask(0o077)
if ctypes.CDLL(None,use_errno=True).prctl(36,1,0,0,0)!=0: raise RuntimeError('exec-subreaper-unavailable')
path.parent.mkdir(mode=0o700,exist_ok=True)
temporary=path.with_suffix('.tmp')
with temporary.open('x') as f: json.dump(dict(token=token,process=identity(os.getpid())),f)
temporary.replace(path)
signal.signal(signal.SIGTERM,interrupted); signal.signal(signal.SIGINT,interrupted)
try:
 child=subprocess.Popen(argv)
 raise SystemExit(child.wait())
finally:
 signal.signal(signal.SIGTERM,signal.SIG_IGN); signal.signal(signal.SIGINT,signal.SIG_IGN)
 deadline=time.monotonic()+3
 while descendants():
  for pid in reversed(descendants()):
   try:
    before=identity(pid); fd=os.pidfd_open(pid,0)
    if identity(pid)==before and owned(pid): signal.pidfd_send_signal(fd,signal.SIGKILL)
    os.close(fd)
   except (FileNotFoundError,ProcessLookupError): pass
  try:
   while os.waitpid(-1,os.WNOHANG)[0]: pass
  except ChildProcessError: pass
  if time.monotonic()>=deadline: raise RuntimeError('exec-descendants-not-reaped')
  time.sleep(.02)
 path.unlink(missing_ok=True)`

const retire = `import json,os,pathlib,signal,sys,time
path=pathlib.Path(sys.argv[1]); token=sys.argv[2]
def identity(pid):
 try:
  data=pathlib.Path('/proc/'+str(pid)+'/stat').read_text().rsplit(')',1)[1].split()
  return dict(pid=pid,startTicks=int(data[19]),bootID=pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip(),pidNamespace=os.readlink('/proc/'+str(pid)+'/ns/pid'),mountNamespace=os.readlink('/proc/'+str(pid)+'/ns/mnt'))
 except (FileNotFoundError,ProcessLookupError): return None
deadline=time.monotonic()+4
while time.monotonic()<deadline:
 if not path.exists(): print('exec-supervisor-not-published'); sys.exit(2)
 data=json.loads(path.read_text()); expected=data['process']; pid=expected['pid']
 if data['token']!=token: raise RuntimeError('exec-supervisor-token-mismatch')
 if identity(pid)!=expected: raise RuntimeError('exec-supervisor-identity-changed')
 fd=os.pidfd_open(pid,0)
 if identity(pid)!=expected: raise RuntimeError('exec-supervisor-raced')
 signal.pidfd_send_signal(fd,signal.SIGTERM); os.close(fd)
 while path.exists() and time.monotonic()<deadline: time.sleep(.02)
 if not path.exists(): print('exec-supervisor-retired'); sys.exit(0)
raise RuntimeError('exec-supervisor-not-reaped')`

async function json(path: string, value?: unknown, timeoutMs = 5000) {
  return new Promise<unknown>((resolve, reject) => {
    const request = http.request({ socketPath, path: `/v1.51${path}`, method: value === undefined ? "GET" : "POST",
      headers: value === undefined ? {} : { "Content-Type": "application/json" } }, (response) => {
      const chunks: Buffer[] = []
      const state = { bytes: 0 }
      response.on("data", (chunk: Buffer) => {
        state.bytes += chunk.length
        if (state.bytes > cap) return request.destroy(new Error("docker-api-response-limit"))
        chunks.push(chunk)
      })
      response.once("error", reject)
      response.once("end", () => {
        if (response.statusCode === 204) return resolve(null)
        if (response.statusCode !== 200 && response.statusCode !== 201) return reject(new Error(`docker-api-status:${response.statusCode}`))
        void Promise.resolve().then(() => JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown).then(resolve, reject)
      })
    })
    const timer = setTimeout(() => request.destroy(new Error("docker-api-request-timeout")), timeoutMs)
    request.once("error", reject)
    request.once("close", () => clearTimeout(timer))
    request.end(value === undefined ? undefined : JSON.stringify(value))
  })
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function within<T>(promise: Promise<T>, deadline: number) {
  const remaining = deadline - performance.now()
  if (remaining <= 0) throw new Error("docker-cleanup-host-deadline")
  const expired = Promise.withResolvers<never>()
  const timer = setTimeout(() => expired.reject(new Error("docker-cleanup-host-deadline")), remaining)
  return Promise.race([promise, expired.promise]).finally(() => clearTimeout(timer))
}

export function exec(container: string, argv: string[], input: boolean) {
  return launch(container, argv, input, true)
}

function launch(container: string, argv: string[], input: boolean, supervised: boolean) {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const finished = Promise.withResolvers<{ code: number | null; signal: null }>()
  const state = { frame: Buffer.alloc(0), request: undefined as http.ClientRequest | undefined,
    socket: undefined as Socket | undefined, source: undefined as Readable | undefined,
    id: "", containerID: "", stopped: false, settled: false, blocked: false, failing: false, starting: false }
  const token = randomUUID()
  const metadata = `/session/native-proof-exec/${token}.json`
  const cleanupEvidence = async (deadline = performance.now() + 5000) => {
    if (!supervised) return
    const check = launch(container, ["python3", "-B", "-c", "import pathlib,sys; raise SystemExit(1 if pathlib.Path(sys.argv[1]).exists() else 0)", metadata], false, false)
    check.stdout.resume(); check.stderr.resume()
    if ((await within(check.exited, deadline)).code !== 0) throw new Error("docker-exec-tree-cleanup-unconfirmed")
  }
  const retireNamespace = async () => {
    if (!state.containerID) throw new Error("docker-retire-container-identity-missing")
    const inspect = await json(`/containers/${state.containerID}/json`)
    if (!object(inspect) || inspect.Id !== state.containerID || !object(inspect.Config) || !object(inspect.Config.Labels)
      || inspect.Config.Labels["orchestra.a11y.owner"] !== "dock-accessibility") throw new Error("docker-retire-container-not-owned")
    if (!object(inspect.State) || typeof inspect.State.Running !== "boolean") throw new Error("docker-retire-container-state-invalid")
    if (inspect.State.Running) await json(`/containers/${state.containerID}/kill?signal=SIGKILL`, {})
    const deadline = performance.now() + 5000
    while (performance.now() < deadline) {
      const current = await json(`/containers/${state.containerID}/json`, undefined, deadline - performance.now())
      if (!object(current) || !object(current.State) || typeof current.State.Running !== "boolean") throw new Error("docker-retire-container-state-invalid")
      if (!current.State.Running) return
      await Bun.sleep(25)
    }
    throw new Error("docker-retire-namespace-unconfirmed")
  }
  const join = async () => {
    if (!state.id) return
    const deadline = performance.now() + 10000
    while (performance.now() < deadline) {
      const info = await json(`/exec/${state.id}/json`, undefined, deadline - performance.now())
      if (!object(info) || typeof info.Running !== "boolean") throw new Error("docker-exec-retire-inspect-invalid")
      // Pid remains nonzero after Docker has started/reaped an exec. A created
      // but not-yet-admitted START reports Pid=0 and is not terminal evidence.
      if (!info.Running && (!state.starting || typeof info.Pid === "number" && info.Pid > 0)) {
        await cleanupEvidence(deadline)
        return
      }
      if (info.Running && supervised) {
        const cleanup = launch(container, ["python3", "-B", "-c", retire, metadata, token], false, false)
        cleanup.stdout.resume(); cleanup.stderr.resume()
        const result = await within(cleanup.exited, deadline)
        if (result.code !== 0 && result.code !== 2) throw new Error("docker-exec-supervisor-retire-failed")
      }
      await Bun.sleep(25)
    }
    throw new Error("docker-exec-failure-not-reaped")
  }
  const fail = (error: Error) => {
    if (state.settled || state.failing) return
    state.failing = true
    state.stopped = true
    state.request?.destroy()
    state.socket?.destroy()
    stdin.destroy()
    void join().then(() => {
      state.settled = true; stdout.end(); stderr.end(); finished.reject(error)
    }, (cleanup: unknown) => {
      // Last-resort test isolation: the immutable owned container/namespace is
      // the OS's process-tree authority, including detached/overflow children.
      // Fatal retirement ends this proof; it is not a production helper policy.
      void retireNamespace().then(() => {
        state.settled = true; stdout.end(); stderr.end()
        finished.reject(new Error(`${error.message}; owned-test-namespace-retired:${state.containerID}`))
      }, (failure: unknown) => {
        state.settled = true; stdout.end(); stderr.end()
        finished.reject(new Error(`${error.message}; cleanup-unconfirmed:${cleanup instanceof Error ? cleanup.message : String(cleanup)}; namespace:${failure instanceof Error ? failure.message : String(failure)}`))
      })
    })
  }
  const data = (chunk: Buffer) => {
    state.frame = Buffer.concat([state.frame, chunk])
    if (state.frame.length > cap + 8) return fail(new Error("docker-stream-buffer-limit"))
    while (state.frame.length >= 8) {
      const stream = state.frame[0]
      const size = state.frame.readUInt32BE(4)
      if ((stream !== 1 && stream !== 2) || state.frame.subarray(1, 4).some((byte) => byte !== 0) || size > cap)
        return fail(new Error("docker-stream-frame-invalid"))
      if (state.frame.length < size + 8) return
      const payload = state.frame.subarray(8, size + 8)
      const target = stream === 1 ? stdout : stderr
      const flowing = target.write(payload)
      state.frame = Buffer.from(state.frame.subarray(size + 8))
      if (!flowing) {
        state.blocked = true
        state.source?.pause()
        target.once("drain", () => {
          state.blocked = false
          data(Buffer.alloc(0))
          if (!state.blocked) state.source?.resume()
        })
        return
      }
    }
  }
  const end = async () => {
    if (state.settled || state.failing) return
    if (state.frame.length) return fail(new Error("docker-stream-partial-eof"))
    const deadline = performance.now() + 5000
    for (let count = 0; count < 20; count++) {
      const remaining = deadline - performance.now()
      if (remaining <= 0 || state.settled) throw new Error("docker-exec-reaping-timeout")
      const info = await json(`/exec/${state.id}/json`, undefined, remaining)
      if (!object(info) || typeof info.Running !== "boolean") throw new Error("docker-exec-inspect-invalid")
      if (!info.Running) {
        if (typeof info.ExitCode !== "number") throw new Error("docker-exec-exit-code-invalid:" + JSON.stringify(info).slice(0, 2048))
        await cleanupEvidence(deadline)
        state.settled = true
        stdout.end(); stderr.end(); stdin.destroy()
        finished.resolve({ code: info.ExitCode, signal: null })
        return
      }
      await Bun.sleep(25)
    }
    throw new Error("docker-exec-not-reaped")
  }
  void (async () => {
    const inspect = await json(`/containers/${encodeURIComponent(container)}/json`)
    if (!object(inspect) || !object(inspect.Config) || !object(inspect.Config.Labels)
      || inspect.Config.Labels["orchestra.a11y.owner"] !== "dock-accessibility") throw new Error("docker-exec-unowned-container")
    if (typeof inspect.Id !== "string" || !/^[a-f0-9]{64}$/.test(inspect.Id)) throw new Error("docker-exec-container-id-invalid")
    state.containerID = inspect.Id
    if (state.stopped) throw new Error("docker-exec-stopped-before-create")
    const created = await json(`/containers/${encodeURIComponent(container)}/exec`, {
      AttachStdout: true, AttachStderr: true, AttachStdin: input, Tty: false, User: "1000:1000",
      Cmd: supervised ? ["python3", "-B", "-c", supervisor, metadata, token, JSON.stringify(argv)] : argv,
    })
    if (!object(created) || typeof created.Id !== "string" || !/^[a-f0-9]{64}$/.test(created.Id)) throw new Error("docker-exec-id-invalid")
    state.id = created.Id
    if (state.stopped) throw new Error("docker-exec-stopped-before-start")
    if (input) {
      // Bun's node:http compatibility emits 101 as response, not upgrade. A raw
      // Unix socket preserves the actual Docker duplex stream without a PTY.
      const socket = connect({ path: socketPath, allowHalfOpen: true })
      state.socket = socket
      state.source = socket
      const handshake = { buffer: Buffer.alloc(0), complete: false }
      const timer = setTimeout(() => socket.destroy(new Error("docker-exec-upgrade-timeout")), 5000)
      socket.once("connect", () => {
        state.starting = true
        const body = JSON.stringify({ Detach: false, Tty: false })
        socket.write(`POST /v1.51/exec/${state.id}/start HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
      })
      socket.on("data", (chunk: Buffer) => {
        if (handshake.complete) return data(chunk)
        handshake.buffer = Buffer.concat([handshake.buffer, chunk])
        const end = handshake.buffer.indexOf("\r\n\r\n")
        if (end === -1) {
          if (handshake.buffer.length > 8192) fail(new Error("docker-exec-upgrade-header-limit"))
          return
        }
        if (end + 4 > 8192 || handshake.buffer.subarray(0, end).toString("ascii").split("\r\n")[0]?.split(" ")[1] !== "101")
          return fail(new Error("docker-exec-upgrade-invalid"))
        clearTimeout(timer)
        handshake.complete = true
        if (handshake.buffer.length > end + 4) data(handshake.buffer.subarray(end + 4))
        handshake.buffer = Buffer.alloc(0)
        stdin.on("error", (error) => socket.destroy(error))
        stdin.pipe(socket)
      })
      socket.once("error", fail)
      socket.once("end", () => {
        if (!handshake.complete) return fail(new Error("docker-exec-upgrade-incomplete"))
        void end().catch(fail)
      })
      socket.once("close", () => clearTimeout(timer))
      return
    }
    const request = http.request({ socketPath, path: `/v1.51/exec/${state.id}/start`, method: "POST",
      headers: { "Content-Type": "application/json" } })
    state.request = request
    const timer = setTimeout(() => request.destroy(new Error("docker-exec-attach-timeout")), 5000)
    request.once("response", (response) => {
      clearTimeout(timer)
      if (response.statusCode !== 200) return fail(new Error(`docker-exec-attach-status:${response.statusCode}`))
      state.source = response
      response.on("data", data)
      response.once("error", fail)
      response.once("end", () => void end().catch(fail))
    })
    request.once("error", fail)
    request.once("close", () => clearTimeout(timer))
    state.starting = true
    request.end(JSON.stringify({ Detach: false, Tty: false }))
  })().catch(fail)
  finished.promise.catch(() => {})
  return { stdin, stdout, stderr, exited: finished.promise,
    kill(_signal?: NodeJS.Signals) { state.stopped = true; fail(new Error("docker-exec-transport-stopped")) },
  }
}
