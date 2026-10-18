// Scoped gate extension. Manual I2/I3 diagnostic; the lead runs the GUI cases.
import { execFile } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { lstat, open, realpath } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import { parseArgs, promisify } from "node:util"
import { tool, type ToolContext } from "@orchestra/plugin"
import type { AppDockAPI } from "../src/main/app-dock-api"
import { AppDockRuntime } from "../src/main/app-dock-runtime"
import { AppDockNativeWorkspace } from "../src/main/app-dock-native-workspace"
import { NativeDockProtocol } from "../src/main/app-dock-native-protocol"
import { AppDockRPC } from "../src/main/app-dock-rpc"
import { DockerEngine } from "../src/main/docker-engine"
import { createAppDockHooks } from "../../orchestra/src/plugin/app-dock"

type Options = { output: string; root?: string; image?: string; context?: string; nativePayload?: string; suppressAction?: boolean; diagnosticCase?: string }
type Item = { ref: NativeDockProtocol.NativeRef; role: number; name: string; depth: number; states: number[]; interfaces: string[];
  actions: { id: string; name: string }[]; capabilities: Record<string, { supported: boolean }>; text?: string; textOffset?: number; textTruncated?: boolean }
type Page = { backend: string; scopeKind: string; items: Item[]; observation: string; hasMore: boolean; cursor?: string;
  capabilities: Record<string, { supported: boolean }>; coverage: { complete: boolean; reasons: string[] } }
type Case = { id: string; status: "PASS" | "FAIL"; evidence?: unknown; error?: string; restored?: boolean }
type Trace = { kind: string; at: number; value: unknown }
type Resource = Awaited<ReturnType<ReturnType<typeof AppDockRuntime.create>["native"]>>
const checkout = resolve(import.meta.dir, "../../..")
const manifest = join(import.meta.dir, "../test/native/workspace-scenarios.json")
const defaultRoot = "/Users/gustavoschneiter/.local/share/orchestra/recovery/dock-accessibility-20261002/i1-runtime-state-v2"
const apps = [{ id: "org.xfce.mousepad.desktop", name: "Mousepad", package: "mousepad" }, { id: "featherpad.desktop", name: "FeatherPad", package: "featherpad" },
  { id: "code.desktop", name: "Visual Studio Code", package: "vscode" }]
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const object = NativeDockProtocol.object
function check(value: unknown, code: string): asserts value { if (!value) throw new Error(code) }

export function requirements(value: unknown, handlers: string[]) {
  check(object(value) && value.version === 1 && Array.isArray(value.required), "manifest-invalid-or-required-missing")
  check(value.required.length > 0, "manifest-required-empty")
  const rows = value.required.map((row: unknown) => {
    check(object(row) && typeof row.id === "string" && /^W0[1-6]$/.test(row.id)
      && typeof row.description === "string" && row.description.trim().length > 0, "manifest-case-invalid")
    return { id: row.id, description: row.description }
  })
  check(new Set(rows.map((row) => row.id)).size === rows.length, "manifest-case-duplicate")
  check(rows.length === 6 && handlers.length === rows.length && rows.every((row) => handlers.includes(row.id))
    && handlers.every((id) => rows.some((row) => row.id === id)), "manifest-handler-correspondence")
  return rows
}

export function recorder(trace: Trace[]) {
  const state = { bytes: 2, failure: "" }
  const record = (kind: string, value: unknown) => {
    const entry = { kind, at: performance.now(), value }
    const bytes = Buffer.byteLength(JSON.stringify(entry)) + Number(trace.length > 0)
    if (state.failure) return
    if (state.bytes + bytes > 24 * 1024 ** 2 || trace.length >= 8192) { state.failure = "trace-bound-exceeded"; return }
    state.bytes += bytes; trace.push(entry)
  }
  return Object.assign(record, { state })
}

export function frame(bytes: Uint8Array) {
  check(bytes.length > 1 && bytes.length <= 262144 && bytes.at(-1) === 10 && !bytes.subarray(0, -1).includes(10), "wire-frame-bound-or-delimiter")
  const raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
  const value: unknown = JSON.parse(raw)
  check(object(value), "wire-frame-object-required")
  return { raw, bytes: bytes.length, sha256: hash(bytes), value }
}

async function receiptFile(output: string) {
  check(isAbsolute(output), "output-absolute-required")
  const parent = await realpath(dirname(output))
  const info = await lstat(parent)
  check(info.isDirectory() && !(info.mode & 0o077) && info.uid === process.getuid?.(), "output-parent-must-be-private-owned-existing-directory")
  for (let path = parent; ; path = dirname(path)) {
    const git = await lstat(join(path, ".git")).then(() => true, (error: unknown) => {
      check(object(error) && error.code === "ENOENT", "output-git-check-failed"); return false
    })
    check(!git, "output-inside-git")
    if (path === dirname(path)) break
  }
  return open(join(parent, basename(output)), "wx", 0o600)
}

const setup = `import hashlib,json,os,pathlib,shlex,subprocess,sys,uuid
sys.path.insert(0,'/opt/orchestra')
import workspace
from gi.repository import Gio
nonce=str(uuid.UUID(sys.argv[1])); specs=json.loads(sys.argv[2])
environment=workspace.session_environment(); os.environ.update(environment)
catalogue=workspace.applications()
if not all(spec['id'] in catalogue for spec in specs): raise RuntimeError('setup-catalogue-id-missing')
directory=pathlib.Path('/home/dock')/('native-proof-'+nonce); directory.mkdir(mode=0o700)
rows=[]
for index,spec in enumerate(specs):
 path=directory/(spec['package']+'-'+nonce+'.txt'); seed='Initial '+spec['name']+' '+nonce+' '+str(index)+'\\n'
 with path.open('x',encoding='utf-8',newline='') as stream: stream.write(seed)
 context=Gio.AppLaunchContext()
 for key,value in environment.items(): context.setenv(key,value)
 # Fresh app settings and an independent instance prevent interrupted proofs'
 # recovered tabs/dialogs from changing the next input fixture.
 for key,suffix in (('XDG_CONFIG_HOME','config'),('XDG_CACHE_HOME','cache'),('XDG_DATA_HOME','data')):
  private=directory/(spec['package']+'-'+suffix); private.mkdir(mode=0o700); context.setenv(key,str(private))
 pids=[]
 def launched(_context,_app,data):
  pid=data.unpack().get('pid')
  if isinstance(pid,int) and pid>0: pids.append(pid)
 context.connect('launched',launched)
 desktop=Gio.DesktopAppInfo.new(spec['id'])
 if desktop is None: raise RuntimeError('setup-desktop-info-missing')
 executable=desktop.get_executable()
 if executable not in (spec['package'],'/usr/bin/'+spec['package'],'/opt/vscode/code' if spec['package']=='vscode' else ''): raise RuntimeError('setup-desktop-executable-unexpected')
 flags=['--disable-server' if spec['package']=='mousepad' else '--standalone']
 if spec['package']=='vscode':
  profile=directory/'vscode-config'; (profile/'User').mkdir(mode=0o700)
  (profile/'User/settings.json').write_text(json.dumps({'editor.accessibilitySupport':'on','telemetry.telemetryLevel':'off','update.mode':'none','workbench.startupEditor':'none','security.workspace.trust.enabled':False,'files.trimTrailingWhitespace':False},indent=2)+'\\n')
  flags=['--force-renderer-accessibility','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions','--disable-workspace-trust','--skip-welcome','--skip-release-notes','--new-window','--user-data-dir='+str(profile),'--extensions-dir='+str(directory/'vscode-extensions')]
 app=Gio.AppInfo.create_from_commandline(' '.join(shlex.quote(arg) for arg in [executable,*flags])+' %f',spec['name'],Gio.AppInfoCreateFlags.NONE)
 # App processes must not keep the one-shot exec's output pipes open.
 saved=[os.dup(1),os.dup(2)]; null=os.open(os.devnull,os.O_WRONLY)
 try:
  os.dup2(null,1); os.dup2(null,2)
  if not app.launch([Gio.File.new_for_path(str(path))],context): raise RuntimeError('setup-gio-launch-failed')
 finally:
  os.dup2(saved[0],1); os.dup2(saved[1],2)
  for fd in [*saved,null]: os.close(fd)
 identities=[]
 for pid in pids:
  try: identities.append(workspace.process_identity(pid))
  except workspace.SessionError: pass
 version=json.loads(pathlib.Path('/opt/vscode/resources/app/package.json').read_text())['version'] if spec['package']=='vscode' else subprocess.check_output(['dpkg-query','-W','-f=\${Version}',spec['package']],timeout=3).decode()
 rows.append(dict(id=spec['id'],path=str(path),seed=seed,seedSHA256=hashlib.sha256(seed.encode()).hexdigest(),version=version,launchedPIDs=pids,processIdentities=identities))
print(json.dumps(dict(directory=str(directory),apps=rows,sessionID=environment['ORCHESTRA_A11Y_SESSION_ID'],workspaceSHA256=hashlib.sha256(pathlib.Path(workspace.__file__).read_bytes()).hexdigest())))`

const readFile = `import base64,hashlib,json,os,stat,sys
with os.fdopen(os.open(sys.argv[1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as stream:
 info=os.fstat(stream.fileno()); data=stream.read(131073)
 if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or len(data)>131072: raise RuntimeError('file-oracle-invalid')
print(json.dumps(dict(path=sys.argv[1],bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),base64=base64.b64encode(data).decode(),text=data.decode('utf-8'))))`

const codeView = `import json,os,subprocess,sys,time
sys.path.insert(0,'/opt/orchestra'); import workspace
identity=json.loads(sys.argv[1]); view=sys.argv[2]
if view not in ('ready','quick','settings') or workspace.process_identity(identity['pid'])!=identity: raise RuntimeError('code-setup-process-changed')
os.environ.update(workspace.session_environment())
deadline=time.monotonic()+4; windows=[]
while time.monotonic()<deadline:
 if workspace.process_identity(identity['pid'])!=identity: raise RuntimeError('code-setup-process-changed')
 found=subprocess.run(['xdotool','search','--onlyvisible','--pid',str(identity['pid'])],text=True,capture_output=True,timeout=1)
 if found.returncode not in (0,1): raise RuntimeError('code-setup-window-search-failed')
 windows=found.stdout.split()
 if len(windows)>1: raise RuntimeError('code-setup-visible-window-ambiguous')
 if windows and (view!='ready' or sys.argv[3] in subprocess.check_output(['xdotool','getwindowname',windows[0]],text=True,timeout=1)): break
 windows=[]
 time.sleep(0.1)
if view=='ready' and not windows:
 print(json.dumps(dict(stage='ready-view-setup',ready=False,processIdentity=identity,semanticProof=False))); raise SystemExit(0)
if len(windows)!=1: raise RuntimeError('code-setup-visible-window-ambiguous')
if view!='ready':
 subprocess.run(['xdotool','windowfocus','--sync',windows[0]],check=True,timeout=2)
 subprocess.run(['xdotool','key','--clearmodifiers','Escape'],check=True,timeout=2)
 subprocess.run(['xdotool','key','--clearmodifiers','ctrl+p' if view=='quick' else 'ctrl+comma'],check=True,timeout=2)
print(json.dumps(dict(stage=view+'-view-setup',ready=True,processIdentity=identity,window=windows[0],semanticProof=False)))`

export async function run(options: Options) {
  const output = await receiptFile(options.output)
  const receipt = { version: 1, gate: "extension", status: "FAIL", controlDetected: false, started: new Date().toISOString(),
    mode: options.suppressAction ? "suppress-action" : "normal", diagnosticCase: options.diagnosticCase ?? null,
    required: [] as { id: string; description: string }[], cases: [] as Case[],
    scope: { chain: "production plugin execute -> in-process contract port + viewer fixture -> production RPC/workspace preparer/Runtime/helper container/Gio -> installed apps",
      rootPermission: "fixture authorizes this entire captured runtime workspace; file/app titles select within it, not ownership",
      policy: "ToolContext.ask fixture, not production permission service", packagedElectron: false, xpraViewer: false,
      suppression: "only action wire writes; synthetic ACK via existing production client decoder; unchanged semantic metadata; restoration exempt",
      bounds: { setupMs: 60000, focusedMs: 60000, appMs: 120000, electronWorkflowMs: 180000, helpers: 64, frameBytesIncludingLF: 262144, traceBytes: 24 * 1024 ** 2, traceEntries: 8192 } },
    provenance: {} as Record<string, unknown>, trace: [] as Trace[], failures: [] as string[] }
  const record = recorder(receipt.trace)
  const rpc = new AppDockRPC()
  const helpers = new Map<string, { resource: Resource; partial: Buffer; exit?: NativeDockProtocol.Exit; reaped: boolean; off: (() => void)[] }>()
  const pending = new Set<Promise<unknown>>()
  const state = { abort: new AbortController(), deadline: 0, stopped: false, restoring: false, actionName: "", rpcCalls: 0, preparations: 0,
    fallback: 0, asks: 0, suppressed: 0, suppressionEligible: false, binding: "", roots: [] as NativeDockProtocol.Proposal["roots"], cleanup: false }
  const hold = <T>(promise: Promise<T>) => { pending.add(promise); void promise.finally(() => pending.delete(promise)).catch(() => {}); return promise }
  const interrupt = () => { state.stopped = true; state.abort.abort(); receipt.failures.push("interrupted") }
  process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt)
  const fail = (error: unknown) => { receipt.failures.push(message(error)); record("failure", message(error)) }
  async function budget<T>(name: string, ms: number, body: () => Promise<T>) {
    check(ms > 0 && !state.stopped, `${name}-deadline`)
    state.abort = new AbortController(); state.deadline = performance.now() + ms
    const timer = setTimeout(() => state.abort.abort(), ms)
    // Join the original work after cancellation; never let a raced mutation run into restoration.
    try { const value = await body(); check(!state.abort.signal.aborted && performance.now() < state.deadline, `${name}-deadline`); return value }
    finally { clearTimeout(timer) }
  }
  const sources = ["app-dock-runtime", "app-dock-native-runtime", "app-dock-native-workspace", "app-dock-native-channel", "app-dock-native-client",
    "app-dock-native-protocol", "app-dock-native", "app-dock-rpc", "app-dock-api", "docker-engine"].map((name) => join(import.meta.dir, `../src/main/${name}.ts`))
  const context = resolve(options.context ?? join(import.meta.dir, "../resources/linux-runtime"))
  const payload = resolve(options.nativePayload ?? join(import.meta.dir, "../resources/linux/app-dock-accessibility"))
  sources.push(import.meta.path, manifest, join(import.meta.dir, "../../orchestra/src/plugin/app-dock.ts"), ...["index", "tool"].map((name) => join(checkout, `packages/plugin/src/${name}.ts`)),
    ...["workspace.py", "Dockerfile", "seccomp.json"].map((name) => join(context, name)),
    ...["actions", "bindings", "bus", "context", "keyboard", "main", "refs", "snapshot"].map((name) => join(payload, `${name}.py`)))
  const hashes = () => Promise.all(sources.map(async (path) => { const bytes = await Bun.file(path).bytes(); check(bytes.length > 0, `source-empty:${path}`); return { path, bytes: bytes.length, sha256: hash(bytes) } }))
  const engineState = { engine: undefined as ReturnType<typeof DockerEngine.create> | undefined }
  try {
    receipt.provenance.before = await hashes()
    const root = await realpath(options.root ?? defaultRoot)
    const metadataPath = join(root, "metadata.json")
    const metadataBytes = await Bun.file(metadataPath).bytes()
    check(metadataBytes.length <= 8192, "metadata-byte-limit")
    const metadata: unknown = await Promise.resolve().then(() => JSON.parse(new TextDecoder().decode(metadataBytes)) as unknown)
      .catch(() => { throw new Error("metadata-json-invalid") })
    check(object(metadata) && metadata.version === 1 && typeof metadata.owner === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(metadata.owner)
      && typeof metadata.containerID === "string" && /^[a-f0-9]{64}$/.test(metadata.containerID) && typeof metadata.endpoint === "string", "metadata-identity-invalid")
    const captured = { owner: metadata.owner, containerID: metadata.containerID, endpoint: metadata.endpoint }
    check(URL.canParse(captured.endpoint), "metadata-endpoint-invalid")
    const endpoint = new URL(captured.endpoint)
    check(captured.endpoint.startsWith("unix:///") && !endpoint.host && !endpoint.search && !endpoint.hash && !endpoint.username && !endpoint.password, "metadata-local-endpoint-required")
    const engine = DockerEngine.create(captured.endpoint); engineState.engine = engine
    const placement = { runtimeID: "", runtimeEpoch: "", ready: true }
    async function owned() {
      check(hash(await Bun.file(metadataPath).bytes()) === hash(metadataBytes), "metadata-drift")
      const found = await engine.get<unknown>(`/containers/${captured.containerID}/json`, 4000)
      check(object(found) && found.Id === captured.containerID && found.Name === `/orchestra-linux-${captured.owner}` && object(found.Config)
        && object(found.Config.Labels) && found.Config.Labels["io.orchestra.app-dock"] === "workspace"
        && found.Config.Labels["io.orchestra.app-dock.owner"] === captured.owner && found.Config.Labels["io.orchestra.app-dock.kind"] === "workspace"
        && object(found.State) && found.State.Running === true && typeof found.State.StartedAt === "string", "owned-running-workspace-unproven")
      check(!placement.runtimeEpoch || placement.runtimeEpoch === `${found.Id}:${found.State.StartedAt}`, "workspace-placement-drift")
      record("workspace.ownership", { ...captured, startedAt: found.State.StartedAt, imageID: found.Image,
        labels: Object.fromEntries(["io.orchestra.app-dock", "io.orchestra.app-dock.owner", "io.orchestra.app-dock.kind"].map((key) => [key, (found.Config as { Labels: Record<string, unknown> }).Labels[key]])) })
    }
    async function guest(code: string, args: string[], phase: string): Promise<unknown> {
      check(!state.abort.signal.aborted && performance.now() < state.deadline, `${phase}-deadline`)
      await owned()
      const result = await promisify(execFile)("docker", ["--host", captured.endpoint, "exec", "--user", "dock", captured.containerID,
        "python3", "-B", "-c", `import signal; signal.alarm(8)\n${code}`, ...args], { timeout: 10000, killSignal: "SIGKILL", maxBuffer: 262144,
          env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_API_VERSION"].includes(key))) })
        .catch((error: unknown) => {
          if (object(error)) record("guest.exec.failed", { phase, code: error.code, signal: error.signal, killed: error.killed,
            stdout: typeof error.stdout === "string" ? error.stdout.slice(0, 8192) : undefined,
            stderr: typeof error.stderr === "string" ? error.stderr.slice(0, 8192) : undefined })
          throw new Error(`${phase}-guest-exec-failed-or-unjoined`)
        })
      record("guest.exec", { phase, sourceSHA256: hash(code), args, stdout: result.stdout, stderr: result.stderr, hostExit: 0 })
      return JSON.parse(result.stdout) as unknown
    }
    const runtime = AppDockRuntime.create({ root, context, image: options.image ?? "orchestra-native-i1:20261004", nativePayload: payload })
    const wrapperRuntime = {
      async workspaceScope() { await owned(); const scope = await runtime.workspaceScope(); record("runtime.scope", scope); return scope },
      native() { return hold((async () => {
        check(helpers.size < 64, "helper-count-limit")
        await owned()
        const resource = await runtime.native().catch((error: unknown) => {
          // Diagnostic only: production sanitizes helper setup failures; keep the cause chain in the private receipt.
          const chain = (cause: unknown, depth: number): unknown[] => depth > 4 || !object(cause) ? [] : [{
            name: cause.name, code: cause.code, outcome: cause.outcome, message: String(cause.message ?? "").slice(0, 512),
            exit: cause.exit }, ...chain(cause.cause, depth + 1)]
          record("runtime.helper.setup-failed", { chain: chain(error, 0) })
          throw error
        })
        if (helpers.has(resource.id)) return resource
        const tracked = { resource, partial: Buffer.alloc(0), reaped: false, off: [] as (() => void)[], exit: undefined as NativeDockProtocol.Exit | undefined }
        helpers.set(resource.id, tracked)
        const decode: unknown = Reflect.get(resource.client, "read")
        check(typeof decode === "function", "trace-client-decoder-unavailable")
        // The existing client can terminate the channel during its shutdown ACK,
        // before later onData subscribers run. A byte-preserving decoder tap also
        // captures that terminal frame; the channel subscription is retained below.
        Reflect.set(resource.client, "read", (chunk: Uint8Array) => {
          try {
            for (let offset = 0; offset < chunk.length;) {
              const newline = chunk.indexOf(10, offset)
              const end = newline < 0 ? chunk.length : newline + 1
              check(tracked.partial.length + end - offset <= (newline < 0 ? 262143 : 262144), "wire-frame-bound-or-delimiter")
              tracked.partial = Buffer.concat([tracked.partial, chunk.subarray(offset, end)]); offset = end
              if (newline < 0) continue
              const wire = frame(tracked.partial)
              record("wire.reply", { helper: resource.id, raw: wire.raw, bytes: wire.bytes, sha256: wire.sha256,
                value: { id: wire.value.id, ok: wire.value.ok } }); tracked.partial = Buffer.alloc(0)
            }
          } catch (error) { fail(error); void resource.channel.terminate().catch(fail) }
          decode.call(resource.client, chunk)
        })
        tracked.off.push(resource.channel.onData((chunk) => record("wire.channel-delivery", { helper: resource.id, bytes: chunk.byteLength, sha256: hash(chunk) })),
          resource.channel.onExit((exit) => { tracked.exit = exit; record("helper.exit", { helper: resource.id, exit }) }))
        record("runtime.helper.hello-parsed", { containerID: resource.id, hello: resource.client.hello, runtime: resource.runtime, payload: resource.payload })
        check(resource.payload.files.length === 8 && resource.payload.files.every((file) =>
          (receipt.provenance.before as { path: string; sha256: string; bytes: number }[]).some((source) => source.path === join(payload, file.name)
            && source.sha256 === file.sha256 && source.bytes === file.bytes)), "helper-payload-source-mismatch")
        const write = resource.channel.write.bind(resource.channel)
        resource.channel.write = async (bytes) => {
          const wire = frame(bytes); const request = wire.value
          if (request.op === "read") state.binding = `${request.bindingID}:${request.bindingEpoch}`
          if (options.suppressAction && state.suppressionEligible && !state.restoring && request.op === "action") {
            check(state.actionName && object(request.args) && ["stable", "observed"].includes(String(request.args.mode)), "control-action-metadata-missing")
            const value = { method: "action", action: state.actionName, dispatch: "acknowledged", postcondition: "unverified",
              consistency: "non-atomic", identity: request.args.mode === "observed" ? "observed-control" : "snapshot-bound-control", logicalIdentity: "unverified" }
            const reply = Buffer.from(JSON.stringify({ v: 1, id: request.id, ok: true, value }) + "\n")
            record("control.suppressed-action", { helper: resource.id, ...wire }); state.suppressed++
            record("control.synthetic-ack", { helper: resource.id, ...frame(reply) })
            // Runtime already subscribed its client before returning. Feed only the
            // declared control ACK to that same decoder, without replacing the client.
            decode.call(resource.client, reply)
            return
          }
          record("wire.request", { helper: resource.id, ...wire }); await write(bytes)
        }
        return resource
      })()) },
    }
    const prepare = AppDockNativeWorkspace.create(wrapperRuntime)
    rpc.setWorkspacePreparation((...args) => hold((async () => {
      state.preparations++; const prepared = await prepare(...args)
      record("workspace.prepared", { identity: args[0], placement: args[1], target: prepared.target })
      return { ...prepared, confirm: async (proposal) => {
        const roots = await prepared.confirm(proposal)
        state.roots = proposal.roots.filter((item) => roots.some((root) => root.owner === item.owner && root.path === item.path))
        record("workspace.confirmed", { proposal, roots }); return roots
      } }
    })()))
    const forbidden = () => { state.fallback++; throw new Error("viewer-browser-fallback-forbidden") }
    const viewer = new Proxy({
      list: (sender: number) => { check(sender === 812, "viewer-sender"); return [{ tabID: "workspace", generation: 1, active: true, title: "Workspace fixture", url: "fixture:workspace", loading: false, audible: false, canGoBack: false, canGoForward: false }] },
      nativeWorkspace: (sender: number, tabID: string) => { check(sender === 812 && tabID === "workspace", "viewer-target"); return { ...placement } },
    }, { get: (target, key) => Reflect.has(target, key) ? Reflect.get(target, key) : key === "onTabRemoved" ? undefined : forbidden }) as AppDockAPI
    rpc.setAppDock(viewer)
    rpc.setWindow({ webContents: { id: 812 }, isDestroyed: () => false, once: () => undefined } as unknown as Parameters<AppDockRPC["setWindow"]>[0])
    rpc.setProfileResolver(() => ({ profileID: "workspace-proof-fixture", storageKey: "workspace-proof-fixture" }))
    const listeners = new Set<(event: { data: unknown }) => void>()
    const terminals = new Map<string, () => void>()
    const definitions = createAppDockHooks({ on: (_event, listener) => { listeners.add(listener) }, postMessage: (value) => {
      state.rpcCalls++; record("port.request", value)
      if (object(value) && value.type === "dock.rpc" && typeof value.id === "string") {
        check(terminals.size < 32 && !terminals.has(value.id), "port-correlation-bound")
        const terminal = Promise.withResolvers<void>(); terminals.set(value.id, terminal.resolve); hold(terminal.promise)
      }
      check(rpc.handleDockRPC(value, (data) => {
        record("port.reply", object(data) && data.type === "dock.rpc.result" && data.ok === true
          ? { type: data.type, id: data.id, ok: true, valueSHA256: hash(JSON.stringify(data.value)) } : data)
        if (object(data) && data.type === "dock.rpc.result" && typeof data.id === "string") { terminals.get(data.id)?.(); terminals.delete(data.id) }
        listeners.forEach((listener) => listener({ data }))
      }), "port-unhandled")
    } }).tool
    check(definitions, "plugin-tools-missing")
    async function execute(name: string, args: Record<string, unknown> = {}, denied = false) {
      check(!state.stopped && !state.abort.signal.aborted && performance.now() < state.deadline, "focused-deadline")
      const definition = definitions![name]; check(definition, `plugin-tool-missing:${name}`)
      const input = tool.schema.object(definition.args).parse(args)
      const context: ToolContext = { sessionID: "workspace-proof", messageID: randomUUID(), agent: "workspace-proof", directory: checkout, worktree: checkout,
        abort: state.abort.signal, metadata: (value) => record("tool.metadata", value), ask: async (request) => {
          state.asks++
          record("permission.fixture", { request, denied, placement, scope: "entire workspace" })
          const op = name.slice(5)
          check(request.permission === "dock" && JSON.stringify(request.patterns) === JSON.stringify([op])
            && JSON.stringify(request.always) === JSON.stringify([op]), "permission-fixture-scope-mismatch")
          if (denied) throw new Error("Permission denied")
        } }
      record("tool.args", { name, args: input })
      const result = await hold(definition.execute(input, context))
      const raw = typeof result === "string" ? result : result.output
      record("tool.result", { name, ...(name === "dock_read" ? {} : { raw }), bytes: Buffer.byteLength(raw), sha256: hash(raw) })
      if (denied) return raw
      return JSON.parse(raw) as unknown
    }
    async function page(args: Record<string, unknown> = {}) {
      const previous = state.binding
      const value = await execute("dock_read", args.cursor ? args : { budget: 64, maxText: 2048, ...args })
      if (object(value) && typeof value.code === "string") throw new NativeDockProtocol.NativeError(value.code, String(value.message))
      check(object(value) && value.backend === "linux-atspi" && value.scopeKind === "workspace" && Array.isArray(value.items)
        && value.items.length <= 64 && typeof value.observation === "string" && typeof value.hasMore === "boolean" && object(value.coverage)
        && Array.isArray(value.coverage.reasons) && object(value.capabilities), "workspace-page-invalid")
      check(state.binding && (args.rootRef || args.cursor ? state.binding === previous : state.binding !== previous), "read-binding-lifetime-invalid")
      value.items.forEach((item: unknown) => check(object(item) && NativeDockProtocol.isNativeRef(item.ref) && typeof item.name === "string"
        && Number.isInteger(item.role) && Array.isArray(item.states) && item.states.length <= 64
        && item.states.every((state: unknown) => typeof state === "number" && Number.isInteger(state) && state >= 0 && state <= 63)
        && Array.isArray(item.interfaces) && Array.isArray(item.actions) && object(item.capabilities), "workspace-item-invalid"))
      return value as Page
    }
    async function pages(first: () => Promise<Page>, predicate: (item: Item) => boolean, label: string, stopAt?: number | "match") {
      const matches: { item: Item; page: number }[] = []; const cursors = new Set<string>(); const current = { page: await first() }
      for (let index = 0; index < 48; index++) {
        matches.push(...current.page.items.filter(predicate).map((item) => ({ item, page: index })))
        check(matches.length <= 1, `${label}-ambiguous`)
        if (index === stopAt || stopAt === "match" && matches.length === 1 || !current.page.hasMore) {
          check(stopAt !== undefined || current.page.coverage.complete, `${label}-incomplete:${current.page.coverage.reasons.join(",")}`)
          check(matches.length === 1, `${label}-missing-accessibility`)
          return { ...matches[0]!, last: index }
        }
        check(current.page.cursor && !cursors.has(current.page.cursor), `${label}-cursor-invalid`)
        cursors.add(current.page.cursor); current.page = await page({ cursor: current.page.cursor })
      }
      throw new Error(`${label}-page-limit`)
    }
    async function select(app: typeof apps[number], path: string, predicate: (item: Item) => boolean, label: string): Promise<Item> {
      const first = async () => {
        const start = await page({ maxText: 0 })
        const roots = state.roots.filter((root) => [23, 69].includes(root.role) && (app.package === "vscode" || root.name.includes(basename(path)))
          && root.name.toLowerCase().includes(app.name.toLowerCase()))
        check(roots.length === 1, `${app.name}-frame-missing-or-ambiguous-accessibility`)
        // Proposal roots were authorized by the production preparer. Title is only selection.
        const found = await pages(async () => start, (item) => item.depth === 0 && item.role === roots[0]!.role && item.name === roots[0]!.name, `${app.name}-frame`, "match")
        return page({ rootRef: found.item.ref, maxText: 0 })
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          // Code's exact named controls are selected within its unique confirmed
          // frame. Like the existing Electron proof, this is a first-match read,
          // not a claim of logical uniqueness across the entire application tree.
          const found = await pages(first, predicate, label, app.package === "vscode" ? "match" : undefined)
          if (found.page === found.last) return found.item
          const fresh = await pages(first, predicate, label, found.page)
          check(fresh.item.role === found.item.role && fresh.item.name === found.item.name && fresh.item.text === found.item.text, `${label}-reacquire-drift`)
          return fresh.item
        } catch (error) {
          if (!(error instanceof NativeDockProtocol.NativeError) || attempt === 2
            || !["stale-ref", "cursor-stale"].includes(error.code) && !(error.code === "wrong-scope"
              && error.message === "Native workspace membership changed before confirmation")) throw error
          record("read.reacquire", { label, code: error.code, attempt, mutationRetry: false })
        }
      }
      throw new Error(`${label}-reacquire-limit`)
    }
    const initial = { value: undefined as { directory: string; apps: { id: string; path: string; seed: string; seedSHA256: string; version: string; processIdentities: NativeDockProtocol.ProcessIdentity[] }[]; sessionID: string } | undefined }
    async function agreement(path: string, expected: string, label: string) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const value = await guest(readFile, [path], "independent-file-oracle")
        check(object(value) && value.path === path && typeof value.base64 === "string" && typeof value.sha256 === "string"
          && value.bytes === Buffer.from(value.base64, "base64").length && value.sha256 === hash(Buffer.from(value.base64, "base64")), "file-evidence-invalid")
        if (value.base64 === Buffer.from(expected, "utf8").toString("base64") && value.text === expected) return value
        if (attempt < 2) await Bun.sleep(100)
      }
      throw new Error(`${label}-effect-file-bytes-mismatch`)
    }
    async function textCase(index: number, result: Case) {
      const app = apps[index]!; const file = initial.value!.apps[index]!
      const end = performance.now() + 120000
      const editable = async (expected?: string) => {
        const selected = await select(app, file.path, (item) => item.capabilities.type?.supported === true
          && item.states.includes(17) && item.states.includes(25) && item.interfaces.includes("org.a11y.atspi.Text"), `${app.name}-writableText`)
        const current = await page({ rootRef: selected.ref, budget: 1, maxText: 2048 })
        const item = current.items[0]
        check(current.items.length === 1 && item?.capabilities.type?.supported === true && item.states.includes(17) && item.states.includes(25)
          && item.textOffset === 0 && item.textTruncated === false && typeof item.text === "string"
          && (expected === undefined || item.text === expected), `${app.name}-editor-text-mismatch`)
        return item
      }
      const replace = async (text: string, expected?: string) => {
        const item = await editable(expected)
        const value = await execute("dock_type", { ref: item.ref, mode: "editable", text })
        check(object(value) && value.method === "editable" && value.dispatch === "acknowledged" && value.postcondition === "verified" && value.value === text, `${app.name}-replacement-unverified`)
      }
      const save = async () => {
        const item = await select(app, file.path, (item) => ["Save", "_Save", "&Save"].includes(item.name)
          && item.role === 43 && (app.package !== "featherpad" || item.states.includes(25))
          && item.capabilities.action?.supported === true, `${app.name}-advertised-Save`)
        check(item.actions.length === 1 && item.actions[0]!.id && item.actions[0]!.name, `${app.name}-Save-action-ambiguous`)
        state.actionName = item.actions[0]!.name
        state.suppressionEligible = true
        const value = await execute("dock_action", { ref: item.ref, actionID: item.actions[0]!.id, mode: "stable" })
          .finally(() => { state.suppressionEligible = false })
        check(object(value) && value.method === "action" && value.action === state.actionName && value.dispatch === "acknowledged"
          && value.postcondition === "unverified" && value.consistency === "non-atomic" && value.identity === "snapshot-bound-control"
          && value.logicalIdentity === "unverified", `${app.name}-Save-semantic-metadata`)
        record("app.Save", { app: app.id, restoration: state.restoring, value })
      }
      try {
        result.evidence = await budget(`${app.name}-effect`, 60000, async () => {
          const before = await agreement(file.path, file.seed, `${app.name}-seed`)
          const desired = `${app.name} café 漢字 e\u0301 🧪 ${randomUUID()}\nsecond line\n`
          result.evidence = { before, desired }
          await replace(desired, file.seed); await replace("", desired); await replace(desired, ""); await editable(desired)
          await save(); const after = await agreement(file.path, desired, app.name)
          return { before, desired, after }
        })
      } finally {
        await Promise.allSettled([...pending])
        state.restoring = true
        // Reserve one unchanged client timeout for the final cancelled operation to join.
        await budget(`${app.name}-restoration`, Math.min(60000, end - performance.now() - 15000), async () => {
          // A control run leaves the original file on disk: a distinct app-written
          // checkpoint keeps Save enabled even when restoring to the original text.
          const checkpoint = `Restoration ${randomUUID()}\n`
          await replace(checkpoint); await save(); await agreement(file.path, checkpoint, `${app.name}-restore-checkpoint`)
          await replace(file.seed, checkpoint); await save(); await editable(file.seed)
          await agreement(file.path, file.seed, `${app.name}-restored`); result.restored = true
        }).catch((error: unknown) => { fail(`restoration:${app.name}:${message(error)}`); throw error }).finally(() => { state.restoring = false })
      }
    }
    async function codeCase(result: Case) {
      const app = apps[2]!; const file = initial.value!.apps[2]!
      const path = `${initial.value!.directory}/vscode-config/User/settings.json`
      const evidence: Record<string, unknown> = {}; result.evidence = evidence
      const changed = { attempted: false }
      const selectCode = (predicate: (item: Item) => boolean, label: string) => select(app, file.path, predicate, `Code-${label}`)
      const field = async (view: "quick" | "settings") => {
        const matches = (item: Item) => item.capabilities.keyboardType?.supported === true && (view === "quick"
          ? item.role === 79 && /^Search files by name\b/i.test(item.name) : /^Search settings\b/i.test(item.name))
        const selected = await selectCode(matches, `${view}-input`)
        const current = await page({ rootRef: selected.ref, budget: 1, maxText: 1500 })
        const item = current.items[0]
        check(current.items.length === 1 && item && matches(item) && item.textOffset === 0 && item.textTruncated === false && typeof item.text === "string", "Code-field-changed")
        return item
      }
      const replace = async (item: Item, text: string) => {
        const value = await execute("dock_type", { ref: item.ref, text, mode: "keyboard" })
        check(object(value) && value.method === "keyboard" && value.dispatch === "acknowledged" && value.postcondition === "verified" && value.value === text, "Code-keyboard-replacement-unverified")
        await Bun.sleep(150)
        return value
      }
      const view = async (name: "quick" | "settings") => {
        check(file.version === "1.140.0" && file.processIdentities.length === 1, "Code-launch-provenance-invalid")
        record("setup.code-view", await guest(codeView, [JSON.stringify(file.processIdentities[0]), name], "SETUP-code-view-not-effect-oracle"))
        await Bun.sleep(400)
      }
      const checkbox = () => selectCode((item) => item.role === 7 && (item.name === "files.trimTrailingWhitespace"
        || /trim trailing whitespace/i.test(item.name)), "trim-checkbox")
      const actionID = (item: Item) => {
        const actions = item.actions.filter((action) => ["check", "uncheck", "toggle", "click", "press", "activate"].includes(action.name))
        check(actions.length === 1, "Code-checkbox-action-ambiguous")
        state.actionName = actions[0]!.name
        return actions[0]!.id
      }
      const observed = async (item: Item) => {
        check(item.capabilities.observedAction?.supported === true, "Code-observed-action-unsupported")
        state.suppressionEligible = true
        const value = await execute("dock_action", { ref: item.ref, actionID: actionID(item), mode: "observed" })
          .finally(() => { state.suppressionEligible = false })
        check(object(value) && value.method === "action" && value.dispatch === "acknowledged" && value.postcondition === "unverified"
          && value.identity === "observed-control" && value.logicalIdentity === "unverified" && value.consistency === "non-atomic", "Code-observed-action-metadata")
        return value
      }
      const config = async (expected: boolean) => {
        for (let attempt = 0; attempt < 5; attempt++) {
          const value = await guest(readFile, [path], "independent-Code-config-oracle")
          check(object(value) && typeof value.text === "string" && typeof value.base64 === "string"
            && value.sha256 === hash(Buffer.from(value.base64, "base64")) && Buffer.from(value.base64, "base64").toString("utf8") === value.text, "Code-config-evidence-invalid")
          const parsed: unknown = JSON.parse(value.text)
          check(object(parsed) && typeof parsed["files.trimTrailingWhitespace"] === "boolean", "Code-config-value-invalid")
          if (parsed["files.trimTrailingWhitespace"] === expected) return value
          if (attempt < 4) await Bun.sleep(100)
        }
        throw new Error("Code-effect-config-mismatch")
      }
      // Human waiver 2026-10-04: each Code readback re-traverses ~7 pages (~17s on an idle host), so a
      // phase with 4-7 readbacks cannot fit 60s. Case phases only; per-request product limits are unchanged.
      const codePhaseMs = 120000
      evidence.waiver = { codePhaseMs, previousMs: 60000, reason: "Code readback re-traversal cost; human-approved" }
      try {
        // Measured 2026-10-04: a cold Code start saturates the workspace CPU limit for ~30s and
        // native helper startup then misses its fixed 5000ms deadline. Wait for quiescence as an
        // explicit precondition; product limits are unchanged.
        evidence.quiescence = await budget("Code-quiescence", 90000, async () => {
          const samples: number[] = []
          while (samples.length < 2 || samples.slice(-2).some((cpu) => cpu >= 20)) {
            check(!state.abort.signal.aborted && performance.now() < state.deadline, "Code-workspace-not-quiescent")
            const stats = await promisify(execFile)("docker", ["--host", captured.endpoint, "stats", "--no-stream", "--format", "{{.CPUPerc}}", captured.containerID],
              { timeout: 10000, killSignal: "SIGKILL", env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("DOCKER_"))) })
            const cpu = Number(stats.stdout.trim().replace(/%$/, ""))
            check(Number.isFinite(cpu) && cpu >= 0, "Code-quiescence-observation-invalid")
            samples.push(cpu)
            record("setup.Code-quiescence", { sample: samples.length, cpu })
          }
          return { samples, threshold: 20 }
        })
        evidence.quick = await budget("Code-Quick-Open", codePhaseMs, async () => {
          await view("quick")
          const before = await field("quick")
          check(before.text === "", "Code-quick-initial-not-empty")
          const unicode = await replace(before, "café 漢字 🧪")
          const unicodeField = await field("quick")
          check(unicodeField.text === "café 漢字 🧪", "Code-quick-unicode-readback")
          const decomposed = await replace(unicodeField, "e\u0301")
          const decomposedField = await field("quick")
          check(decomposedField.text === "e\u0301", "Code-quick-decomposed-readback")
          const clear = await replace(decomposedField, "")
          const clearField = await field("quick")
          check(clearField.text === "", "Code-quick-clear-readback")
          const noop = await replace(clearField, "")
          check(noop.noOp === true && noop.controllerCalls === 0 && (await field("quick")).text === "", "Code-quick-noop-dispatched")
          return { before, unicode, decomposed, clear, noop }
        })
        await budget("Code-Settings", codePhaseMs, async () => {
          evidence.before = await config(false)
          await view("settings")
          const initial = await field("settings")
          evidence.emptyProjection = { text: initial.text, normalization: false, clearClaimed: false }
          const desired = "@id:editor.fontSize"
          const output = await execute("dock_type", { ref: initial.ref, text: desired, mode: "keyboard" })
          check(object(output), "Code-baseline-result-missing")
          if (output.code !== undefined) check(output.code === "stale-ref" && output.outcome === "unknown"
            && output.message === "Native action target role, name or parent changed: name" && object(output.result)
            && output.result.method === "keyboard" && output.result.dispatch === "acknowledged" && output.result.postcondition === "unverified"
            && output.result.value === desired, "Code-baseline-unexpected-uncertainty")
          if (output.code === undefined) check(output.method === "keyboard" && output.dispatch === "acknowledged" && output.postcondition === "verified" && output.value === desired, "Code-baseline-unverified")
          record("setup.Code-single-result", { output, semanticProof: false, mutationReplay: false })
          const baseline = { item: await field("settings") }
          for (let attempt = 0; attempt < 3 && baseline.item.name !== "Search settings. 1 Setting Found"; attempt++) {
            await Bun.sleep(250); baseline.item = await field("settings")
          }
          check(baseline.item.text === desired && baseline.item.name === "Search settings. 1 Setting Found", "Code-single-result-baseline-missing")
          evidence.filter = await replace(baseline.item, "@id:files.trimTrailingWhitespace")
          check((await field("settings")).text === "@id:files.trimTrailingWhitespace", "Code-filter-readback")
          const stable = await checkbox()
          check(stable.capabilities.action?.supported === false && !stable.states.includes(4), "Code-stable-policy-or-before-mismatch")
          evidence.rejected = await execute("dock_action", { ref: stable.ref, actionID: actionID(stable), mode: "stable" })
          check(object(evidence.rejected) && evidence.rejected.code === "unstable-ref" && evidence.rejected.outcome === "not-dispatched", "Code-stable-action-not-rejected")
          const unchanged = await config(false)
          check(object(evidence.before) && unchanged.base64 === evidence.before.base64, "Code-default-action-changed-config")
          changed.attempted = true
          evidence.action = await observed(await checkbox())
          evidence.after = await config(true)
          check((await checkbox()).states.includes(4), "Code-checkbox-config-disagree")
        })
      } finally {
        await Promise.allSettled([...pending])
        state.restoring = true
        await budget("Code-restoration", codePhaseMs, async () => {
          if (changed.attempted) {
            const live = await checkbox()
            if (live.states.includes(4)) await observed(live)
            evidence.restored = await config(false)
            check(!(await checkbox()).states.includes(4), "Code-restored-checkbox-config-disagree")
          }
          if (!changed.attempted) evidence.preserved = await config(false)
          result.restored = true
        }).catch((error: unknown) => { fail(`restoration:Code:${message(error)}`); throw error }).finally(() => { state.restoring = false })
      }
    }
    const handlers: Record<string, (result: Case) => Promise<unknown>> = {
      W01: async () => {
        const list = await execute("dock_list"); check(Array.isArray(list) && list.length === 1 && object(list[0]) && list[0].scopeKind === "workspace" && list[0].backend === "linux-atspi", "workspace-kind-missing")
        const tree = await (async () => {
          for (let attempt = 1; attempt <= 3; attempt++) {
            try { return await page() }
            catch (error) {
              if (!(error instanceof NativeDockProtocol.NativeError) || error.code !== "wrong-scope"
                || error.message !== "Native workspace membership changed before confirmation") throw error
              record("W01.readonly-membership-reacquire", { attempt, originalError: { name: error.name, code: error.code, message: error.message, outcome: error.outcome },
                retry: attempt < 3, noMutationReplay: true })
              if (attempt === 3) throw error
            }
          }
          throw new Error("W01-read-attempt-limit")
        })()
        check(tree.items.length > 0 && tree.capabilities.read?.supported === true, "workspace-tree-or-capability-empty")
        const scope = await wrapperRuntime.workspaceScope(); const helper = [...helpers.values()].at(-1)!.resource
        check(scope.runtime.runtimeID === placement.runtimeID && scope.runtime.runtimeEpoch === placement.runtimeEpoch
          && scope.runtime.accessibilitySessionID === initial.value!.sessionID && helper.client.hello.sessionID === scope.runtime.accessibilitySessionID
          && helper.client.hello.processIdentity && scope.processIdentities.length > 0
          && scope.processIdentities.every((identity) => identity.bootID === helper.client.hello.processIdentity!.bootID
            && identity.pidNamespace === helper.client.hello.processIdentity!.pidNamespace && identity.mountNamespace !== helper.client.hello.processIdentity!.mountNamespace), "session-namespace-provenance-mismatch")
        return { scope, hello: helper.client.hello, payload: helper.payload, observation: tree.observation }
      },
      W02: (result) => textCase(0, result), W03: (result) => textCase(1, result),
      W04: async () => {
        const calls = state.rpcCalls; const preparations = state.preparations; const asks = state.asks
        check(await execute("dock_read", {}, true) === "Permission denied" && state.asks === asks + 1 && state.rpcCalls === calls && state.preparations === preparations, "denied-fixture-sent-RPC-or-missing-ask")
        return { rpcDelta: state.rpcCalls - calls, preparationDelta: state.preparations - preparations }
      },
      W05: async () => {
        await page()
        const value = await execute("dock_evaluate", { script: "document.title" })
        check(object(value) && value.backend === "linux-atspi" && value.code === "unsupported-operation" && value.outcome === "not-dispatched" && state.fallback === 0, "browser-operation-not-rejected")
        return { value, browserFallbackCount: state.fallback }
      },
      W06: (result) => codeCase(result),
    }
    receipt.required = requirements(await Bun.file(manifest).json(), Object.keys(handlers))
    check(options.diagnosticCase === undefined || receipt.required.some((row) => row.id === options.diagnosticCase), "diagnostic-case-invalid")
    await budget("setup", 60000, async () => {
      await owned() // Existing running owner only: the lead performs startup.
      Object.assign(placement, (await runtime.start()).placement)
      check(placement.runtimeID === captured.owner && placement.runtimeEpoch.startsWith(captured.containerID + ":"), "runtime-start-placement-mismatch")
      const catalogue = await runtime.state()
      check(catalogue.phase === "ready" && apps.every((app) => catalogue.apps.some((entry) => entry.id === app.id)), "installed-catalogue-missing")
      const nonce = randomUUID(); const value = await guest(setup, [nonce, JSON.stringify(apps)], "SETUP-not-effect-oracle")
      check(object(value) && value.directory === `/home/dock/native-proof-${nonce}` && Array.isArray(value.apps) && value.apps.length === apps.length
        && typeof value.sessionID === "string" && value.workspaceSHA256 === hash(await Bun.file(join(context, "workspace.py")).bytes()), "setup-provenance-invalid")
      value.apps.forEach((entry: unknown, index: number) => check(object(entry) && entry.id === apps[index]!.id
        && entry.path === `${value.directory}/${apps[index]!.package}-${nonce}.txt` && typeof entry.seed === "string" && entry.seed.length > 0 && entry.seedSHA256 === hash(entry.seed)
        && typeof entry.version === "string" && entry.version.length > 0 && Array.isArray(entry.launchedPIDs) && entry.launchedPIDs.length <= 16
        && Array.isArray(entry.processIdentities) && entry.processIdentities.length <= 16, "setup-file-or-app-evidence-invalid"))
      initial.value = value as NonNullable<typeof initial.value>
      check(new Set(initial.value!.apps.map((app) => app.seed)).size === apps.length, "setup-seeds-not-distinct")
      receipt.provenance.setup = value; receipt.provenance.placement = { ...placement }; receipt.provenance.runtimeRoot = root
      const code = initial.value!.apps[2]!
      check(code.processIdentities.length === 1, "Code-launch-process-missing")
      // A fresh Code profile can take tens of seconds to title its editor. Poll within the
      // unchanged setup budget, keeping room for one worst-case guest exec plus the census.
      for (let attempt = 1; ; attempt++) {
        const ready = await guest(codeView, [JSON.stringify(code.processIdentities[0]), "ready", basename(code.path)], "SETUP-code-ready-not-effect-oracle")
        record("setup.Code-ready", { attempt, value: ready, mutationReplay: false })
        check(object(ready) && typeof ready.ready === "boolean", "Code-readiness-observation-invalid")
        if (ready.ready) break
        check(state.deadline - performance.now() > 15000, "Code-workbench-not-ready")
      }
      const census = { previous: "" }
      for (let sample = 1; sample <= 5; sample++) {
        check(!state.stopped && !state.abort.signal.aborted && performance.now() < state.deadline, "setup-census-deadline")
        const current = JSON.stringify(await wrapperRuntime.workspaceScope())
        record("setup.workspace-census", { sample, sha256: hash(current), stable: current === census.previous })
        if (current === census.previous) return
        census.previous = current
        if (sample < 5) await Bun.sleep(100)
      }
      throw new Error("setup-workspace-census-unstable")
    })
    for (const row of receipt.required) {
      const result: Case = { id: row.id, status: "FAIL" }; receipt.cases.push(result)
      if (options.diagnosticCase !== undefined && options.diagnosticCase !== row.id) {
        result.error = "mandatory-case-not-run"; record("case", result); continue
      }
      await (["W02", "W03", "W06"].includes(row.id) ? handlers[row.id]!(result) : budget(row.id, 60000, () => handlers[row.id]!(result)))
        .then((value) => { if (value !== undefined) result.evidence = value; result.status = "PASS" }, (error: unknown) => { result.error = message(error) })
      record("case", result)
    }
    await owned()
  } catch (error) { fail(error) }
  finally {
    state.abort.abort()
    await rpc.reset().catch(fail)
    await Promise.allSettled([...pending])
    await Promise.all([...helpers.values()].map(async (tracked) => {
      await tracked.resource.client.close().catch(fail)
      await tracked.resource.channel.terminate().then(() => {
        check(tracked.exit && tracked.partial.length === 0, "helper-reaping-or-trace-incomplete")
        tracked.reaped = true; record("helper.reaped", { helper: tracked.resource.id, exit: tracked.exit, authority: "production channel termination joins helper-container removal" })
      }).catch(fail)
      tracked.off.forEach((off) => off())
    }))
    state.cleanup = [...helpers.values()].every((helper) => helper.reaped)
    engineState.engine?.close()
    await hashes().then((after) => { receipt.provenance.after = after; check(JSON.stringify(after) === JSON.stringify(receipt.provenance.before), "source-drift") }).catch(fail)
    if (record.state.failure) receipt.failures.push(record.state.failure)
    if (!helpers.size || !state.cleanup || !receipt.trace.some((entry) => entry.kind === "wire.request") || !receipt.trace.some((entry) => entry.kind === "wire.reply")) receipt.failures.push("trace-provenance-or-cleanup-missing")
    const replies = new Set(receipt.trace.filter((entry) => ["wire.reply", "control.synthetic-ack"].includes(entry.kind)).map((entry) => {
      const wire = entry.value as { helper: string; value: { id: string } }; return `${wire.helper}:${wire.value.id}`
    }))
    const requests = receipt.trace.filter((entry) => ["wire.request", "control.suppressed-action"].includes(entry.kind))
    if (requests.some((entry) => { const wire = entry.value as { helper: string; value: { id: string } }; return !replies.has(`${wire.helper}:${wire.value.id}`) })
      || [...helpers.keys()].some((id) => !requests.some((entry) => (entry.value as { helper: string }).helper === id))) receipt.failures.push("semantic-wire-trace-incomplete")
    for (const id of ["W01", "W02", "W03", "W04", "W05", "W06"]) if (!receipt.cases.some((result) => result.id === id)) receipt.cases.push({ id, status: "FAIL", error: "mandatory-case-not-run" })
    if (state.fallback) receipt.failures.push("browser-fallback-used")
    receipt.controlDetected = !!options.suppressAction && options.diagnosticCase === undefined && state.suppressed === 3 && !receipt.failures.length
      && receipt.cases.every((result) => ["W02", "W03", "W06"].includes(result.id)
        ? result.status === "FAIL" && result.restored === true && (result.id === "W06" ? result.error === "Code-effect-config-mismatch" : result.error?.endsWith("-effect-file-bytes-mismatch")) : result.status === "PASS")
    receipt.status = receipt.required.length === 6 && !receipt.failures.length && receipt.cases.every((result) => result.status === "PASS") && !options.suppressAction && options.diagnosticCase === undefined ? "PASS" : "FAIL"
    process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt)
    await output.writeFile(JSON.stringify({ ...receipt, finished: new Date().toISOString() }) + "\n").finally(() => output.close())
  }
  return { status: receipt.status, diagnosticCase: receipt.diagnosticCase, controlDetected: receipt.controlDetected, cases: receipt.cases.map((result) => ({ id: result.id, status: result.status, error: result.error })), failures: receipt.failures, output: options.output }
}

if (import.meta.main) {
  const summary = await (async () => {
    const cli = parseArgs({ args: Bun.argv.slice(2), strict: true, options: { output: { type: "string" }, root: { type: "string" }, context: { type: "string" }, image: { type: "string" }, "native-payload": { type: "string" }, "suppress-action": { type: "boolean" }, "diagnostic-case": { type: "string" } } }).values
    check(cli.output, "--output-required-absolute-private-outside-git")
    check(resolve(process.cwd()) !== checkout, "do-not-run-tests-from-root")
    return run({ output: cli.output, root: cli.root, context: cli.context, image: cli.image, nativePayload: cli["native-payload"], suppressAction: cli["suppress-action"], diagnosticCase: cli["diagnostic-case"] })
  })().catch((error: unknown) => ({ status: "FAIL", error: message(error) }))
  console.log(JSON.stringify(summary)); process.exitCode = summary.status === "PASS" ? 0 : 1
}
