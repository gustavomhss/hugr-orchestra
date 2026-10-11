import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "@/utils/server"
import { record, RelayError } from "./client"

// Workflow runs (`server.relay.run`, WP17). The routes are not in the API or the generated client yet, so these calls
// answer 404 (or the web app's fallback) today and the run views say that the server cannot run workflows. Once
// WP17 lands they move to the generated client and its contract; until then the answers are read defensively, so a
// missing field renders as absent, never as an invented value.

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

type Fetch = (url: URL, init: RequestInit) => Promise<Response>

export type RelayRunClient = ReturnType<typeof createRunClient>

export function createRunClient(input: { server: ServerConnection.HttpBase; directory: string; fetch: Fetch }) {
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
    const response = await input
      .fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
      .catch((cause: unknown) => {
        throw new RelayError(-1, cause instanceof Error ? cause.message : String(cause), "transport")
      })
    const json = response.headers.get("content-type")?.includes("application/json")
    const value: unknown = json ? await response.json().catch(() => undefined) : await response.body?.cancel()
    if (!response.ok) {
      const refusal = record(value) ? value : {}
      const message = typeof refusal.message === "string" && refusal.message ? refusal.message : `${response.status}`
      const code = typeof refusal.code === "string" ? refusal.code : undefined
      const tag = typeof refusal._tag === "string" ? refusal._tag : undefined
      throw new RelayError(response.status, message, code, tag)
    }
    // A 2xx that is not JSON comes from something other than the Relay API (for example the web app's fallback).
    if (!json) throw new RelayError(0, "The server did not answer as Relay")
    return record(value) && "data" in value && "location" in value ? value.data : value
  }
  const run = (id: string) => `/api/relay/run/${encodeURIComponent(id)}`
  return {
    runs: async (documentID?: string) =>
      list(await call("GET", "/api/relay/run", undefined, documentID ? { document: documentID } : undefined)).flatMap(
        decodeRun,
      ),
    run: async (id: string) => required(await call("GET", run(id))),
    // `version` is the published versionId the run admits.
    start: async (body: { documentID: string; version: string; params: Record<string, string> }) =>
      required(await call("POST", "/api/relay/run", body)),
    // Release records the signed-in user and the reason, then runs the same gate again.
    release: async (id: string, reason: string) =>
      required(await call("POST", `${run(id)}/release`, { reason, mode: "recheck" })),
    audit: async (id: string) => decodeAudit(await call("GET", `${run(id)}/audit`)),
    ledger: (id: string) => call("GET", `${run(id)}/ledger`, undefined, { after: "0" }),
  }
}

function required(value: unknown) {
  const run = decodeRun(value)[0]
  if (!run) throw new RelayError(0, "The server sent an unreadable run")
  return run
}

const RUN_STATUS: Record<string, RelayRunStatus> = {
  running: "running",
  admitted: "running",
  parked: "parked",
  "awaiting-human": "parked",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
}
const STEP_STATUS: Record<string, RelayStepStatus> = {
  pending: "pending",
  running: "running",
  passed: "passed",
  advance: "passed",
  failed: "failed",
  "gate-fail": "failed",
  escalated: "escalated",
  escalate: "escalated",
}

export function decodeRun(value: unknown): RelayRun[] {
  if (!record(value)) return []
  const runID = str(value.runID)
  const documentID = str(value.documentID)
  const status = RUN_STATUS[str(value.status) ?? ""]
  if (!runID || !documentID || !status) return []
  return [
    {
      runID,
      documentID,
      version: num(value.version),
      status,
      position: str(value.position),
      failing: list(value.failing).filter((item): item is string => typeof item === "string"),
      reason: str(value.reason),
      label: str(value.label),
      agent: str(value.agent),
      baseRef: str(value.baseRef),
      startedAt: time(value.startedAt),
      endedAt: time(value.endedAt),
      steps: list(value.steps).flatMap(decodeStep),
    },
  ]
}

function decodeStep(step: unknown): RelayRunStep[] {
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
        const verdict = check.verdict
        if (verdict !== "pass" && verdict !== "fail" && verdict !== "advisory") return []
        return [{ id: check.id, verdict, output: str(check.output) }]
      }),
    },
  ]
}

function decodeAudit(value: unknown): RelayAudit {
  if (!record(value)) return { status: "pending", code: "", rows: [] }
  return {
    status: value.status === "pass" || value.status === "fail" ? value.status : "pending",
    code: str(value.code) ?? "",
    rows: list(value.rows).flatMap((row) =>
      record(row) && typeof row.label === "string" && typeof row.value === "string"
        ? [{ label: row.label, value: row.value }]
        : [],
    ),
  }
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function str(value: unknown) {
  return typeof value === "string" ? value : undefined
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
