import { spawn } from "node:child_process"
import { NativeDockProtocol } from "../src/main/app-dock-native-protocol"
import { NativeProofDocker } from "./native-proof-docker"
import { appIDs, check, digest, message, validateProcess, type FileEvidence, type Manifests, type Recorder } from "./app-dock-native-proof-support"

const maxCommandBytes = 512 * 1024

export async function command(argv: string[], record: Recorder, timeoutMs = 10000, input?: Uint8Array) {
  check(input === undefined || input.byteLength <= maxCommandBytes, "command-stdin-byte-limit")
  const native = argv[0] === "docker" && argv[1] === "exec" ? (() => {
    const cursor = { index: 2 }
    while (argv[cursor.index]?.startsWith("-")) {
      if (argv[cursor.index] === "-i") { cursor.index++; continue }
      check(argv[cursor.index] === "--user" && argv[cursor.index + 1] === "1000:1000", "unsupported-proof-exec-option")
      cursor.index += 2
    }
    const container = argv[cursor.index++]
    check(container, "proof-exec-container-missing")
    const cmd = argv.slice(cursor.index)
    check(cmd.length > 0, "proof-exec-command-missing")
    // Exact one-shot Python setup source moves from stdin to -c; its effects and
    // receipt remain identical, without Bun's premature socket half-close.
    if (input !== undefined) {
      const interpreter = cmd[0] === "python3" ? 0 : cmd[0] === "/usr/local/bin/orchestra-a11y-session" && cmd[1] === "--exec" && cmd[2] === "python3" ? 2 : -1
      check(interpreter >= 0 && cmd[interpreter + 1] === "-B" && cmd[interpreter + 2] === "-", "unsupported-proof-stdin-command")
      return NativeProofDocker.exec(container, [...cmd.slice(0, interpreter + 2), "-c", new TextDecoder("utf-8", { fatal: true }).decode(input), ...cmd.slice(interpreter + 3)], false)
    }
    return NativeProofDocker.exec(container, cmd, false)
  })() : undefined
  const child = native ?? spawn(argv[0]!, argv.slice(1), { stdio: ["pipe", "pipe", "pipe"] })
  child.stdin.on("error", () => {})
  child.stdin.end(input)
  const state = { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), failure: "" }
  const stop = (detail: string) => { state.failure ||= detail; child.kill("SIGKILL") }
  const timer = setTimeout(() => stop("command-timeout"), timeoutMs)
  child.stdout.on("data", (chunk: Buffer) => {
    if (state.stdout.length + chunk.length > maxCommandBytes) return stop("command-stdout-byte-limit")
    state.stdout = Buffer.concat([state.stdout, chunk])
  })
  child.stderr.on("data", (chunk: Buffer) => {
    if (state.stderr.length + chunk.length > 65536) return stop("command-stderr-byte-limit")
    state.stderr = Buffer.concat([state.stderr, chunk])
  })
  const exit = await (native ? native.exited : new Promise<{ code: number | null; signal: string | null }>((done, fail) => {
    check("once" in child, "command-process-events-missing")
    child.once("error", fail)
    child.once("close", (code, signal) => done({ code, signal }))
  })).finally(() => clearTimeout(timer))
  record("command", { argv, ...exit, stdout: state.stdout.toString("utf8"), stderr: state.stderr.toString("utf8"), failure: state.failure,
    ...(input ? { stdin: { bytes: input.byteLength, sha256: digest(input), base64: Buffer.from(input).toString("base64") } } : {}) })
  check(!state.failure && exit.code === 0, `${state.failure || "command-failed"}: ${argv.join(" ")}: ${state.stderr.toString("utf8").slice(0, 2048)}`)
  return state.stdout.toString("utf8")
}

const fileReader = `import base64,hashlib,json,pathlib,sys
out=[]
for name in json.loads(sys.argv[1]):
 p=pathlib.Path(name)
 if not p.exists(): out.append(dict(path=name,exists=False,bytes=0,sha256=hashlib.sha256(b'').hexdigest(),base64='',text='')); continue
 with p.open('rb') as f: data=f.read(131073)
 if len(data)>131072: raise RuntimeError('independent-file-byte-limit: '+name)
 out.append(dict(path=name,exists=True,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),base64=base64.b64encode(data).decode(),text=data.decode('utf-8')))
print(json.dumps(out,ensure_ascii=True,separators=(',',':')))`

export async function files(container: string, paths: string[], record: Recorder): Promise<FileEvidence[]> {
  const value: unknown = JSON.parse(await command(["docker", "exec", "--user", "1000:1000", container,
    "python3", "-B", "-c", fileReader, JSON.stringify(paths)], record))
  check(Array.isArray(value) && value.length === paths.length, "independent-file-reader-invalid")
  return value.map((item, index) => {
    check(NativeDockProtocol.object(item) && item.path === paths[index] && typeof item.exists === "boolean"
      && typeof item.bytes === "number" && typeof item.sha256 === "string" && typeof item.base64 === "string"
      && typeof item.text === "string", "independent-file-evidence-invalid")
    check(Buffer.from(item.base64, "base64").length === item.bytes && digest(Buffer.from(item.base64, "base64")) === item.sha256,
      "independent-file-hash-mismatch")
    return item as FileEvidence
  })
}

export async function manifests(container: string, record: Recorder): Promise<Manifests> {
  const read = await files(container, ["/session/environment.json", "/session/apps.json"], record)
  const environment: unknown = JSON.parse(read[0]!.text)
  const apps: unknown = JSON.parse(read[1]!.text)
  check(NativeDockProtocol.object(environment) && Object.values(environment).every((value) => typeof value === "string"), "session-environment-invalid")
  check(NativeDockProtocol.object(apps) && apps.v === 1 && typeof apps.sessionID === "string"
    && apps.sessionID === environment.ORCHESTRA_A11Y_SESSION_ID && NativeDockProtocol.object(apps.apps), "session-manifests-mismatch")
  const launches = apps.apps
  appIDs.forEach((id) => {
    const app = launches[id]
    check(NativeDockProtocol.object(app) && app.appID === id && typeof app.launchEpoch === "string"
      && typeof app.file === "string" && app.file.startsWith("/home/proof/") && Array.isArray(app.argv)
      && app.argv.every((arg) => typeof arg === "string") && Array.isArray(app.processIdentities)
      && app.processIdentities.length > 0 && app.processIdentities.length <= 128, `launch-manifest-invalid: ${id}`)
    app.processIdentities.forEach((process) => validateProcess(process))
    validateProcess(app)
  })
  return { environment: environment as Record<string, string>, apps: apps as Manifests["apps"] }
}

export const validateLaunches = `import json,os,pathlib,sys
expected=json.loads(sys.argv[1])
with pathlib.Path('/session/apps.json').open('rb') as f: data=f.read(131073)
if len(data)>131072: raise RuntimeError('launch-manifest-byte-limit')
actual=json.loads(data)
if actual['sessionID']!=expected['sessionID']: raise RuntimeError('launch-session-changed')
for name,app in expected['apps'].items():
 if actual['apps'][name]!=app: raise RuntimeError('launch-manifest-changed: '+name)
 for p in app['processIdentities']:
  root=pathlib.Path('/proc')/str(p['pid'])
  with (root/'stat').open() as f: data=f.read(8192).rsplit(')',1)[1].split()
  live=dict(pid=p['pid'],startTicks=int(data[19]),bootID=pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip(),pidNamespace=os.readlink(root/'ns/pid'),mountNamespace=os.readlink(root/'ns/mnt'))
  if any(live[k]!=p[k] for k in live): raise RuntimeError('launch-process-changed: '+name)
print(json.dumps(dict(checked=list(expected['apps']),processIdentity='pid+startTicks+boot+namespaces',exclusiveLaunchAuthority='isolated supervisor'),separators=(',',':')))`

// Disposal is confined to the hello-identified helper. Never kill an app, UID or process-name set.
const terminateHelper = `import json,os,pathlib,signal,sys,time
p=json.loads(sys.argv[1]); root=pathlib.Path('/proc')/str(p['pid'])
def current():
 try:
  with (root/'stat').open() as f: fields=f.read(8192).rsplit(')',1)[1].split()
  return dict(pid=p['pid'],startTicks=int(fields[19]),bootID=pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip(),pidNamespace=os.readlink(root/'ns/pid'),mountNamespace=os.readlink(root/'ns/mnt'))
 except FileNotFoundError: return None
live=current()
if live is not None and live!=p: print(json.dumps(dict(terminated=False,disappearedOrRecycled=True,reason='identity-recycled'))); sys.exit(0)
if live is not None:
 fd=os.pidfd_open(p['pid'],0)
 with (root/'cmdline').open('rb') as f: args=f.read(8192).split(b'\\0')
 if b'/bridge/main.py' not in args or b'python3' not in args: raise RuntimeError('helper-cmdline-mismatch')
 if current()!=p: raise RuntimeError('helper-identity-changed-before-signal')
 signal.pidfd_send_signal(fd,signal.SIGTERM)
deadline=time.monotonic()+3
while time.monotonic()<deadline:
 live=current()
 if live is None or live!=p: print(json.dumps(dict(terminated=True,disappearedOrRecycled=True,pid=p['pid'],startTicks=p['startTicks']))); sys.exit(0)
 time.sleep(.02)
if current()!=p: sys.exit(0)
signal.pidfd_send_signal(fd,signal.SIGKILL)
deadline=time.monotonic()+2
while time.monotonic()<deadline:
 if current()!=p: print(json.dumps(dict(terminated=True,disappearedOrRecycled=True,escalated=True,pid=p['pid'],startTicks=p['startTicks']))); sys.exit(0)
 time.sleep(.02)
raise RuntimeError('helper-not-reaped')`

export function channel(container: string, record: Recorder, control: { suppress: boolean; readAbort?: () => void }) {
  const argv = ["docker", "exec", "-i", "--user", "1000:1000", container,
    "/usr/local/bin/orchestra-a11y-session", "--exec", "python3", "-u", "-B", "/bridge/main.py"]
  const child = NativeProofDocker.exec(container, argv.slice(6), true)
  const dataListeners = new Set<(data: Uint8Array) => void>()
  const exitListeners = new Set<(exit: NativeDockProtocol.Exit) => void>()
  const state = { frame: Buffer.alloc(0), stderr: Buffer.alloc(0), identity: undefined as NativeDockProtocol.ProcessIdentity | undefined,
    exit: undefined as NativeDockProtocol.Exit | undefined, termination: undefined as Promise<void> | undefined,
    audit: undefined as Promise<void> | undefined }
  const reaped = Promise.withResolvers<void>()
  const emitExit = (exit: NativeDockProtocol.Exit) => {
    if (state.exit) return
    state.exit = exit
    exitListeners.forEach((listener) => listener(exit))
  }
  const data = (chunk: Buffer, synthetic = false) => {
    state.frame = Buffer.concat([state.frame, chunk])
    check(state.frame.length <= NativeDockProtocol.limits.frameBytes * 2, "channel-read-buffer-limit")
    while (state.frame.includes(10)) {
      const end = state.frame.indexOf(10)
      check(end + 1 <= NativeDockProtocol.limits.frameBytes, "channel-frame-byte-limit")
      const raw = state.frame.subarray(0, end + 1).toString("utf8")
      const reply: unknown = JSON.parse(raw)
      record(synthetic ? "control.synthetic-reply" : "wire.reply", { bytes: end + 1, sha256: digest(raw), raw })
      if (NativeDockProtocol.object(reply) && reply.id === "hello" && NativeDockProtocol.object(reply.value)) {
        validateProcess(reply.value.processIdentity)
        state.identity = reply.value.processIdentity
      }
      state.frame = Buffer.from(state.frame.subarray(end + 1))
    }
    dataListeners.forEach((listener) => listener(chunk))
  }
  child.stdout.on("data", (chunk: Buffer) => {
    try { data(chunk) } catch (error) {
      record("channel.failure", message(error)); emitExit({ code: null, reason: "helper-exited" }); child.stdin.end()
    }
  })
  child.stderr.on("data", (chunk: Buffer) => {
    const remaining = 65536 - state.stderr.length
    state.stderr = Buffer.concat([state.stderr, chunk.subarray(0, Math.max(0, remaining))])
    if (chunk.length > remaining) { emitExit({ code: null, reason: "helper-resource-exit" }); child.stdin.end() }
  })
  child.stdin.on("error", () => emitExit({ code: null, reason: "helper-exited" }))
  child.stdout.once("end", () => emitExit({ code: null, reason: "helper-exited" }))
  void child.exited.then(({ code, signal }) => {
    emitExit({ code, ...(signal ? { signal } : {}), reason: "helper-exited" })
    record("helper.reaped", { argv, code, signal, stderr: state.stderr.toString("utf8"), processIdentity: state.identity })
    reaped.resolve()
  }, (error: unknown) => {
    record("channel.spawn-error", message(error)); emitExit({ code: null, reason: "helper-exited" })
    reaped.reject(error)
  })
  reaped.promise.catch(() => {})
  const transport: NativeDockProtocol.Channel = {
    async write(bytes) {
      const raw = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      check(raw.length <= NativeDockProtocol.limits.frameBytes, "channel-write-byte-limit")
      const request: unknown = JSON.parse(raw.toString("utf8"))
      check(NativeDockProtocol.object(request), "channel-request-invalid")
      if (control.suppress && request.op === "action") {
        record("control.suppressed-action", { bytes: raw.length, sha256: digest(raw), raw: raw.toString("utf8") })
        queueMicrotask(() => data(Buffer.from(JSON.stringify({ v: 1, id: request.id, ok: true,
          value: { method: "action", dispatch: "acknowledged", postcondition: "unverified", consistency: "non-atomic",
            identity: NativeDockProtocol.object(request.args) && request.args.mode === "observed" ? "observed-control" : "snapshot-bound-control",
            logicalIdentity: "unverified" } }) + "\n"), true))
        return
      }
      record("wire.request", { bytes: raw.length, sha256: digest(raw), raw: raw.toString("utf8") })
      await new Promise<void>((done, fail) => {
        const status = { written: false, drained: true }
        const off = () => { child.stdin.off("error", error); child.stdin.off("drain", drain); child.stdin.off("close", closed); clearTimeout(timer) }
        const finish = () => { if (status.written && status.drained) { off(); done() } }
        const error = (error: Error) => { off(); fail(error) }
        const closed = () => error(new Error("helper-stdin-closed"))
        const drain = () => { status.drained = true; finish() }
        const timer = setTimeout(() => error(new Error("channel-write-timeout")), 1000)
        child.stdin.once("error", error); child.stdin.once("close", closed)
        status.drained = child.stdin.write(raw, (failure) => {
          if (failure) return error(failure)
          status.written = true; finish()
        })
        if (!status.drained) child.stdin.once("drain", drain)
        if (request.op === "read" && control.readAbort) { const abort = control.readAbort; control.readAbort = undefined; abort() }
      })
    },
    onData(listener) { dataListeners.add(listener); return () => dataListeners.delete(listener) },
    onExit(listener) {
      exitListeners.add(listener)
      if (state.exit) queueMicrotask(() => { if (exitListeners.has(listener)) listener(state.exit!) })
      return () => exitListeners.delete(listener)
    },
    terminate() {
      if (state.termination) return state.termination
      child.stdin.end()
      state.audit = (async () => {
        const identified = state.identity
        if (identified) await command(["docker", "exec", "--user", "1000:1000", container,
          "python3", "-B", "-c", terminateHelper, JSON.stringify(identified)], record, 7000)
        await reaped.promise
        if (!identified && state.identity) await command(["docker", "exec", "--user", "1000:1000", container,
          "python3", "-B", "-c", terminateHelper, JSON.stringify(state.identity)], record, 7000)
      })()
      state.audit.catch(() => {})
      // Exec completion joins guest-process wait; /proc audit also joins stopHelper.
      // Stream EOF alone does not establish that the helper was reaped.
      state.termination = deadline(reaped.promise, 8000, "helper-exec-reaping-timeout").then(() => {
        check(!state.frame.length, "helper-eof-with-partial-frame")
        dataListeners.clear(); exitListeners.clear()
      })
      return state.termination
    },
  }
  return { transport, state }
}

export async function deadline<T>(promise: Promise<T>, milliseconds: number, name: string) {
  const timeout = Promise.withResolvers<never>()
  const timer = setTimeout(() => timeout.reject(new Error(name)), milliseconds)
  return Promise.race([promise, timeout.promise]).finally(() => clearTimeout(timer))
}
