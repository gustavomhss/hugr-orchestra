export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue }
export type JSONObject = { [key: string]: JSONValue }
export type NativeRef = `n:${string}`
export type Outcome = "not-dispatched" | "unknown"
export type Operation = "bind" | "read" | "action" | "type" | "key" | "pointer" | "unbind" | "cancel" | "shutdown"
export type Identity = { senderID: number; tabID: string; generation: number; profileID: string }
export type Handle = { owner: string; path: string }
export type ProcessIdentity = { pid: number; startTicks: number; bootID: string; pidNamespace: string; mountNamespace: string }
export type RuntimeIdentity = { runtimeID: string; runtimeEpoch: string; accessibilitySessionID: string }
export type ScopeKind = "application" | "workspace"
export type Target = {
  scopeKind?: ScopeKind
  runtime: RuntimeIdentity
  appID: string
  launchEpoch: string
  ownershipRevision: number
  processIdentities: ProcessIdentity[]
  roots?: Handle[]
}
export type Hello = {
  backend: "linux-atspi"
  helperEpoch: string
  sessionID: string
  limits: { [key: string]: number }
  operations: string[]
  processIdentity?: ProcessIdentity
  scopeKinds?: ScopeKind[]
}
export type Proposal = { status: "proposal"; proposalID: string; roots: Array<Handle & { name: string; role: number }> }
export type Binding = { bindingID: string; bindingEpoch: string; appID: string; launchEpoch: string }
export type Exit = { code: number | null; signal?: string; reason?: "helper-resource-exit" | "helper-exited" }
export type Channel = {
  write(data: Uint8Array): Promise<void>
  onData(listener: (data: Uint8Array) => void): () => void
  onExit(listener: (exit: Exit) => void): () => void
  terminate(): Promise<void>
}
export type ClientConfig = { startupMs?: number; timeoutMs?: number; cancelGraceMs?: number; sessionID?: string }
export type Call = { op: Operation; args: JSONObject; bindingID?: string; bindingEpoch?: string; timeoutMs?: number }
export type ReadQuery = { budget?: number; maxText?: number; rootRef?: NativeRef; cursor?: string; textOffset?: number }
export type Client = { readonly hello: Hello; request(call: Call, signal?: AbortSignal): Promise<JSONValue>; close(): Promise<void> }
export type Confirm = (proposal: Proposal) => Promise<Handle[]>
export type Reply =
  | { v: 1; id: string; ok: true; value: JSONValue }
  | { v: 1; id: string; ok: false; error: { code: string; message: string; outcome: Outcome; result?: JSONValue } }
export type Request = {
  v: 1
  id: string
  sequence: number
  helperEpoch: string
  op: Operation
  timeoutMs: number
  bindingID?: string
  bindingEpoch?: string
  args: JSONObject
}

export const limits = Object.freeze({ frameBytes: 262144, pending: 32, timeoutMs: 10000, startupMs: 5000, cancelGraceMs: 1000 })

export class NativeError extends Error {
  readonly backend = "linux-atspi"
  constructor(readonly code: string, message: string, readonly outcome: Outcome = "not-dispatched", readonly result?: JSONValue,
    readonly cleanup?: Readonly<{ code: string; outcome: "unknown" }>) {
    super(message)
    this.name = "NativeError"
  }
}

export const isNativeRef = (value: unknown): value is NativeRef =>
  typeof value === "string" && value.startsWith("n:") && value.length > 2 && value.length <= 256

export const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function json(value: unknown, depth = 0): value is JSONValue {
  if (depth > 40) return false
  if (value === null || typeof value === "boolean" || typeof value === "string") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.length <= 4096 && value.every((item) => json(item, depth + 1))
  return object(value) && Object.keys(value).length <= 128 && Object.values(value).every((item) => json(item, depth + 1))
}

export function decode(line: string): Reply {
  if (Buffer.byteLength(line) > limits.frameBytes) throw new NativeError("protocol-error", "Native frame exceeds byte limit")
  const value: unknown = parse(line)
  if (!object(value) || value.v !== 1 || typeof value.id !== "string" || !value.id || value.id.length > 256 || typeof value.ok !== "boolean")
    throw new NativeError("protocol-error", "Invalid native reply envelope")
  if (value.ok === true && json(value.value)) return { v: 1, id: value.id, ok: true, value: value.value }
  if (value.ok === false && object(value.error) && typeof value.error.code === "string" && value.error.code.length <= 256
      && typeof value.error.message === "string" && value.error.message.length <= 1024
      && (value.error.outcome === "unknown" || value.error.outcome === "not-dispatched")
      && (value.error.result === undefined || json(value.error.result))) {
    return { v: 1, id: value.id, ok: false, error: { code: value.error.code, message: value.error.message,
      outcome: value.error.outcome, ...(value.error.result === undefined ? {} : { result: value.error.result }) } }
  }
  throw new NativeError("protocol-error", "Invalid native reply payload")
}

export function hello(value: JSONValue): Hello {
  const operations = object(value) ? value.operations : undefined
  const process = object(value) ? value.processIdentity : undefined
  if (!object(value) || value.backend !== "linux-atspi" || typeof value.helperEpoch !== "string" || !value.helperEpoch
      || typeof value.sessionID !== "string" || !value.sessionID || value.sessionID.length > 256
      || !object(value.limits) || value.limits.frameBytes !== limits.frameBytes || value.limits.pending !== limits.pending
      || value.limits.timeoutMs !== limits.timeoutMs || !Object.values(value.limits).every((item) => typeof item === "number" && Number.isSafeInteger(item) && item > 0)
      || !Array.isArray(operations) || !operations.every((op) => typeof op === "string")
       || !["bind", "read", "action", "type", "key", "unbind", "cancel", "shutdown"].every((op) => operations.includes(op))
       || (value.scopeKinds !== undefined && (!Array.isArray(value.scopeKinds) || value.scopeKinds.length < 1 || value.scopeKinds.length > 2
         || new Set(value.scopeKinds).size !== value.scopeKinds.length || !value.scopeKinds.every((kind) => kind === "application" || kind === "workspace")))
      || (process !== undefined && (!object(process)
        || ![process.pid, process.startTicks].every((item) => typeof item === "number" && Number.isSafeInteger(item) && item > 0)
        || ![process.bootID, process.pidNamespace, process.mountNamespace].every((item) => typeof item === "string" && item.length > 0 && item.length <= 256))))
    throw new NativeError("protocol-error", "Invalid native startup hello")
  return value as Hello
}

function parse(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    throw new NativeError("protocol-error", "Malformed native JSON")
  }
}

export function encode(request: Request): string {
  const line = JSON.stringify(request)
  if (Buffer.byteLength(line) + 1 > limits.frameBytes) throw new NativeError("protocol-error", "Native request exceeds byte limit")
  return `${line}\n`
}

export * as NativeDockProtocol from "./app-dock-native-protocol"
