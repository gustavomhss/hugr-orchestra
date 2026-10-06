import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "@/utils/server"

// Typed client for the Relay HttpApi groups `server.relay.{document,publish,run,hook}` (RELAY-PORT-PLAN §5).
// It builds requests the way the generated V2 client does (`location[directory]` query, JSON bodies, Basic
// auth, the platform fetch). Once `bun run generate` emits the relay groups into @opencode-ai/client, these
// calls move to `serverSDK().currentApi`. Shapes follow the frozen §2 contracts; run, audit and decision views
// are read defensively, so a missing field renders as absent, never as an invented value.

export type RelayKind = "workflow" | "hook"

export type RelayNode = {
  id: string
  name: string
  type: string
  position: [number, number]
  parameters: Record<string, unknown>
}
export type RelayConnection = { node: string; type: string; index: number }
export type RelayGroup = { id: string; name: string; description: string; nodeIds: string[] }

export type RelayDocument = {
  id: string
  name: string
  description: string
  nodes: RelayNode[]
  connections: Record<string, { main: RelayConnection[][] }>
  nodeGroups: RelayGroup[]
  isArchived: boolean
  activeVersionId: string | null
  versionId: string
  versionCounter: number
  // Counter of the published version when the server reports it.
  publishedCounter: number | undefined
  checksum: string | undefined
  updatedAt: number | undefined
  meta: Record<string, unknown>
  // The document as the server sent it; saves send it back with only the edited fields replaced.
  raw: Record<string, unknown>
}

export type RelayNodeType = {
  type: string
  label: string
  outputs: string[]
  maximum: number | undefined
  parameters: {
    name: string
    label: string
    type: string
    default: unknown
    options: { value: string; label: string }[]
  }[]
}

export type RelayRunStatus = "running" | "parked" | "completed" | "failed" | "cancelled"
export type RelayStepStatus = "pending" | "running" | "passed" | "failed" | "escalated"
export type RelayCheckResult = { id: string; verdict: "pass" | "fail" | "advisory"; output: string | undefined }
export type RelayRunStep = {
  wp: string
  status: RelayStepStatus
  attempts: number
  sessionID: string | undefined
  startedAt: number | undefined
  endedAt: number | undefined
  checks: RelayCheckResult[]
  note: string | undefined
}
export type RelayRun = {
  runID: string
  documentID: string
  version: number | undefined
  status: RelayRunStatus
  position: string | undefined
  failing: string[]
  reason: string | undefined
  label: string | undefined
  agent: string | undefined
  baseRef: string | undefined
  startedAt: number | undefined
  endedAt: number | undefined
  steps: RelayRunStep[]
}
export type RelayAudit = { status: "pass" | "fail" | "pending"; code: string; rows: { label: string; value: string }[] }

export type RelayInstall = {
  installID: string
  document: string
  version: number | undefined
  enabled: boolean
  installedBy: string | undefined
  installedAt: number | undefined
}
export type RelayDecision = {
  decisionID: string
  installID: string
  nodeID: string
  action: string
  trigger: string
  tool: string
  sessionID: string | undefined
  subject: string
  outcome: string
  at: number | undefined
}

export class RelayError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message)
  }
}

// The server has no Relay routes (404/405/501) or answers with something that is not the Relay API.
export function relayUnsupported(error: unknown) {
  return (
    error instanceof RelayError &&
    (error.status === 404 || error.status === 405 || error.status === 501 || error.status === 0)
  )
}

type Fetch = (url: URL, init: RequestInit) => Promise<Response>

export type RelayClient = ReturnType<typeof createRelayClient>

export function createRelayClient(input: { server: ServerConnection.HttpBase; directory: string; fetch: Fetch }) {
  const call = async (method: string, path: string, body?: unknown, query?: Record<string, string>) => {
    const url = new URL(path, input.server.url)
    url.searchParams.set("location[directory]", input.directory)
    Object.entries(query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value))
    const headers = new Headers()
    if (body !== undefined) headers.set("content-type", "application/json")
    if (input.server.password)
      headers.set(
        "authorization",
        `Basic ${authTokenFromCredentials({ username: input.server.username, password: input.server.password })}`,
      )
    const response = await input.fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = response.headers.get("content-type")?.includes("application/json")
    const value: unknown = json ? await response.json().catch(() => undefined) : await response.body?.cancel()
    if (!response.ok)
      throw new RelayError(response.status, errorMessage(value) ?? `${response.status}`, errorCode(value))
    // A 2xx that is not JSON comes from something other than the Relay API (for example an app shell).
    if (!json && response.status !== 204) throw new RelayError(0, "Not the Relay API")
    return unwrap(value)
  }
  const doc = (id: string) => `/api/relay/document/${encodeURIComponent(id)}`
  const run = (id: string) => `/api/relay/run/${encodeURIComponent(id)}`
  const hook = (id: string) => `/api/relay/hook/${encodeURIComponent(id)}`

  return {
    documents: async () => list(await call("GET", "/api/relay/document")).flatMap(decodeDocument),
    document: async (id: string) => requireDocument(await call("GET", doc(id))),
    version: async (id: string, version: string) =>
      requireDocument(await call("GET", `${doc(id)}/version/${encodeURIComponent(version)}`)),
    create: async (body: Record<string, unknown>) => requireDocument(await call("POST", "/api/relay/document", body)),
    save: async (document: RelayDocument, changes: Record<string, unknown>) =>
      requireDocument(
        await call("PATCH", doc(document.id), {
          ...document.raw,
          ...changes,
          versionId: document.versionId,
          expectedChecksum: document.checksum,
        }),
      ),
    remove: (id: string) => call("DELETE", doc(id)).then(() => undefined),
    publish: async (document: RelayDocument) =>
      requireDocument(
        await call("POST", `${doc(document.id)}/publish`, {
          versionId: document.versionId,
          expectedChecksum: document.checksum,
        }),
      ),
    definition: (id: string) => call("GET", `${doc(id)}/export`),
    nodeTypes: async () => decodeNodeTypes(await call("GET", "/api/relay/node-types")),
    runs: async (documentID?: string) =>
      list(await call("GET", "/api/relay/run", undefined, documentID ? { document: documentID } : undefined)).flatMap(
        decodeRun,
      ),
    run: async (id: string) => requireRun(await call("GET", run(id))),
    start: async (body: { documentID: string; version: string; params: Record<string, string> }) =>
      requireRun(await call("POST", "/api/relay/run", body)),
    release: async (id: string, reason: string) =>
      requireRun(await call("POST", `${run(id)}/release`, { reason, mode: "recheck" })),
    cancel: async (id: string, reason: string) => requireRun(await call("POST", `${run(id)}/cancel`, { reason })),
    audit: async (id: string) => decodeAudit(await call("GET", `${run(id)}/audit`)),
    ledger: (id: string) => call("GET", `${run(id)}/ledger`, undefined, { after: "0" }),
    installs: async () => {
      const value = await call("GET", "/api/relay/hook")
      return (record(value) && "installs" in value ? list(value.installs) : list(value)).flatMap(decodeInstall)
    },
    install: async (document: RelayDocument) =>
      decodeInstall(
        await call("POST", "/api/relay/hook", { document: document.id, version: document.activeVersionId }),
      )[0],
    enable: (id: string, enabled: boolean) =>
      call("POST", `${hook(id)}/${enabled ? "enable" : "disable"}`).then(() => undefined),
    uninstall: (id: string) => call("DELETE", hook(id)).then(() => undefined),
    decisions: async (id: string) => list(await call("GET", `${hook(id)}/decisions`)).flatMap(decodeDecision),
  }
}

export function documentKind(document: Pick<RelayDocument, "meta" | "nodes">): RelayKind {
  const relay = record(document.meta.relay) ? document.meta.relay : {}
  if (relay.kind === "hook") return "hook"
  if (relay.kind === "workflow") return "workflow"
  return document.nodes.some((node) => node.type.startsWith("relay.hook")) ? "hook" : "workflow"
}

export function documentDiagnostics(document: RelayDocument) {
  const relay = record(document.meta.relay) ? document.meta.relay : {}
  return list(relay.diagnostics).filter((item): item is string => typeof item === "string")
}

function unwrap(value: unknown) {
  // Location-scoped V2 routes answer `{ location, data }`; the authoring service answers the value itself.
  if (record(value) && "data" in value && "location" in value) return value.data
  return value
}

function errorMessage(value: unknown) {
  if (!record(value)) return
  if (typeof value.message === "string" && value.message) return value.message
  if (record(value.error) && typeof value.error.message === "string") return value.error.message
}

function errorCode(value: unknown) {
  if (!record(value)) return
  if (typeof value.code === "string") return value.code
  if (typeof value._tag === "string") return value._tag
}

function requireDocument(value: unknown) {
  const document = decodeDocument(value)[0]
  if (!document) throw new RelayError(0, "The server sent an unreadable document")
  return document
}

function requireRun(value: unknown) {
  const run = decodeRun(value)[0]
  if (!run) throw new RelayError(0, "The server sent an unreadable run")
  return run
}

export function decodeDocument(value: unknown): RelayDocument[] {
  if (!record(value) || typeof value.id !== "string" || typeof value.name !== "string") return []
  const active = record(value.activeVersion) ? value.activeVersion : undefined
  const counter = num(value.versionCounter) ?? 1
  return [
    {
      id: value.id,
      name: value.name,
      description: str(value.description) ?? "",
      nodes: list(value.nodes).flatMap(decodeNode),
      connections: decodeConnections(value.connections),
      nodeGroups: list(value.nodeGroups).flatMap(decodeGroup),
      isArchived: value.isArchived === true,
      activeVersionId: str(value.activeVersionId) ?? null,
      versionId: str(value.versionId) ?? "",
      versionCounter: counter,
      publishedCounter:
        num(active?.versionCounter) ??
        (value.activeVersionId && value.activeVersionId === value.versionId ? counter : undefined),
      checksum: str(value.checksum),
      updatedAt: time(value.updatedAt),
      meta: record(value.meta) ? value.meta : {},
      raw: value,
    },
  ]
}

function decodeNode(value: unknown): RelayNode[] {
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.type !== "string"
  )
    return []
  const position = Array.isArray(value.position) ? value.position : []
  return [
    {
      id: value.id,
      name: value.name,
      type: value.type,
      position: [num(position[0]) ?? 0, num(position[1]) ?? 0],
      parameters: record(value.parameters) ? value.parameters : {},
    },
  ]
}

function decodeConnections(value: unknown) {
  if (!record(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([source, outputs]) => {
      if (!record(outputs)) return []
      const main = list(outputs.main).map((channel) =>
        list(channel).flatMap((edge) =>
          record(edge) && typeof edge.node === "string"
            ? [{ node: edge.node, type: str(edge.type) ?? "main", index: num(edge.index) ?? 0 }]
            : [],
        ),
      )
      return [[source, { main }]]
    }),
  )
}

function decodeGroup(value: unknown): RelayGroup[] {
  if (!record(value) || typeof value.id !== "string") return []
  return [
    {
      id: value.id,
      name: str(value.name) ?? value.id,
      description: str(value.description) ?? "",
      nodeIds: list(value.nodeIds).filter((item): item is string => typeof item === "string"),
    },
  ]
}

function decodeNodeTypes(value: unknown) {
  const read = (items: unknown) =>
    list(items).flatMap((item): RelayNodeType[] => {
      if (!record(item) || typeof item.type !== "string") return []
      return [
        {
          type: item.type,
          label: str(item.label) ?? item.type,
          outputs: list(item.outputs).filter((output): output is string => typeof output === "string"),
          maximum: num(item.maximum),
          parameters: list(item.parameters).flatMap((parameter) =>
            record(parameter) && typeof parameter.name === "string"
              ? [
                  {
                    name: parameter.name,
                    label: str(parameter.label) ?? parameter.name,
                    type: str(parameter.type) ?? "string",
                    default: parameter.default,
                    options: list(parameter.options).flatMap((option) =>
                      record(option) && typeof option.value === "string"
                        ? [{ value: option.value, label: str(option.label) ?? option.value }]
                        : [],
                    ),
                  },
                ]
              : [],
          ),
        },
      ]
    })
  if (!record(value)) return { workflow: [], hook: [] }
  return { workflow: read(value.workflow), hook: read(value.hook) }
}

const RUN_STATUS: Record<string, RelayRunStatus> = {
  running: "running",
  admitted: "running",
  parked: "parked",
  "awaiting-human": "parked",
  completed: "completed",
  complete: "completed",
  success: "completed",
  failed: "failed",
  error: "failed",
  crashed: "failed",
  cancelled: "cancelled",
}
const STEP_STATUS: Record<string, RelayStepStatus> = {
  pending: "pending",
  running: "running",
  passed: "passed",
  pass: "passed",
  advance: "passed",
  complete: "passed",
  failed: "failed",
  fail: "failed",
  "gate-fail": "failed",
  escalated: "escalated",
  escalate: "escalated",
  parked: "escalated",
}

export function decodeRun(value: unknown): RelayRun[] {
  if (!record(value)) return []
  const runID = str(value.runID) ?? str(value.id)
  const documentID = str(value.documentID) ?? str(value.workflowId)
  const status = RUN_STATUS[str(value.status) ?? ""]
  if (!runID || !documentID || !status) return []
  return [
    {
      runID,
      documentID,
      version: num(value.version),
      status,
      position: str(value.position),
      failing: strings(value.failing),
      reason: str(value.reason),
      label: str(value.label),
      agent: str(value.agent),
      baseRef: str(value.baseRef),
      startedAt: time(value.startedAt),
      endedAt: time(value.endedAt),
      steps: list(value.steps).flatMap((step): RelayRunStep[] => {
        if (!record(step) || typeof step.wp !== "string") return []
        return [
          {
            wp: step.wp,
            status: STEP_STATUS[str(step.status) ?? ""] ?? "pending",
            attempts: num(step.attempts) ?? 0,
            sessionID: str(step.sessionID),
            startedAt: time(step.startedAt),
            endedAt: time(step.endedAt),
            note: str(step.note),
            checks: list(step.checks).flatMap((check): RelayCheckResult[] => {
              if (!record(check) || typeof check.id !== "string") return []
              const verdict =
                check.verdict === "pass" || check.verdict === "fail" || check.verdict === "advisory"
                  ? check.verdict
                  : undefined
              return verdict ? [{ id: check.id, verdict, output: str(check.output) }] : []
            }),
          },
        ]
      }),
    },
  ]
}

function decodeAudit(value: unknown): RelayAudit {
  if (!record(value)) return { status: "pending", code: "", rows: [] }
  const status = value.status === "pass" || value.status === "fail" ? value.status : "pending"
  return {
    status,
    code: str(value.code) ?? "",
    rows: list(value.rows).flatMap((row) =>
      record(row) && typeof row.label === "string" && typeof row.value === "string"
        ? [{ label: row.label, value: row.value }]
        : [],
    ),
  }
}

function decodeInstall(value: unknown): RelayInstall[] {
  if (!record(value) || typeof value.installID !== "string" || typeof value.document !== "string") return []
  return [
    {
      installID: value.installID,
      document: value.document,
      version: num(value.version),
      enabled: value.enabled !== false,
      installedBy: str(value.installedBy),
      installedAt: time(value.installedAt),
    },
  ]
}

function decodeDecision(value: unknown): RelayDecision[] {
  if (!record(value) || typeof value.decisionID !== "string") return []
  return [
    {
      decisionID: value.decisionID,
      installID: str(value.installID) ?? "",
      nodeID: str(value.nodeID) ?? "",
      action: str(value.action) ?? "",
      trigger: str(value.trigger) ?? "",
      tool: str(value.tool) ?? "",
      sessionID: str(value.sessionID),
      subject: str(value.subject) ?? "",
      outcome: str(value.outcome) ?? "",
      at: time(value.ts) ?? time(value.at),
    },
  ]
}

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function str(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function strings(value: unknown) {
  return list(value).filter((item): item is string => typeof item === "string")
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

// Timestamps arrive as epoch milliseconds or ISO strings.
function time(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : parsed
}
