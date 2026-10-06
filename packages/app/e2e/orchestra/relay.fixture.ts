import { readFileSync } from "node:fs"
import type { Page, Route } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

// A Relay server for the Workflows and Hooks specs. Workflow documents are the shipped Relay profiles laid out
// the way the authoring service seeds them; runs, installs and decisions (relay.data.json, times in minutes ago)
// are fixtures shaped like the RELAY-PORT-PLAN §5 API.

export const server = "http://127.0.0.1:4096"
export const directory = "/repo/orchestra-canonical"
const minute = 60_000

type Json = Record<string, unknown>
type Sprint = { brief?: string; retry_budget?: number; macros?: Json[]; work_packages: Json[] }
type Meta = { id: string; name: string; description: string; draft: number; live?: number; updated: number }
type HookNode = [string, string, string, number, number, Json]
type Step = {
  wp: string
  at: number
  seconds: number
  attempts?: number
  status?: string
  note?: string
  passed?: string[]
  checks?: [string, string, string][]
}
type Run = Json & { runID: string; documentID: string; started: number; ended?: number; steps?: Step[] }
type Decision = [string, string, string, string, string, string, number, string]
type Data = {
  workflows: (Meta & { profile: string })[]
  hooks: (Meta & { nodes: HookNode[]; edges: [string, string, number][] })[]
  runs: Run[]
  audits: Record<string, Json>
  installs: (Json & { installed: number })[]
  decisions: Record<string, Decision[]>
  nodeTypes: Json
}

const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"))
const data = read<Data>("./relay.data.json")
export const nodeTypes = data.nodeTypes

function document(input: Meta & { nodes: Json[]; connections: Json; nodeGroups?: Json[]; kind: string }, now: number) {
  const version = (counter: number) => `${input.id}-v${counter}`
  const live = input.live
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    nodes: input.nodes,
    connections: input.connections,
    nodeGroups: input.nodeGroups ?? [],
    tags: [],
    isArchived: false,
    active: false,
    activeVersionId: live === undefined ? null : version(live),
    activeVersion: live === undefined ? null : { versionId: version(live), versionCounter: live },
    versionId: version(input.draft),
    versionCounter: input.draft,
    checksum: `sum-${input.id}-${input.draft}`,
    meta: { relay: { schema: 1, kind: input.kind } },
    updatedAt: new Date(now - input.updated * minute).toISOString(),
  } as Json
}

// Projects a shipped profile into a document: a start node, then the steps in sequence, phases two per row.
function workflow(meta: Meta & { profile: string }, now: number) {
  const source = read<Sprint>(`../../../relay/profiles/${meta.profile}.sprint.json`)
  const phases = [...new Set(source.work_packages.map((wp) => String(wp.macro ?? "")))]
  const members = (phase: string) => source.work_packages.filter((wp) => wp.macro === phase)
  const even = phases.filter((_, index) => index % 2 === 0)
  const width = Math.max(272, ...even.map((phase) => 136 * members(phase).length))
  // Duplicate titles get the step ID appended, as the authoring service does when it seeds.
  const seen = new Set<string>()
  const unique = (title: string, id: string) => {
    const name = seen.has(title) ? `${title} · ${id}` : title
    seen.add(name)
    return name
  }
  const start = { relayBrief: source.brief ?? "", relayRetryBudget: source.retry_budget ?? 3 }
  const steps = source.work_packages.map((wp) => {
    const phase = phases.indexOf(String(wp.macro ?? ""))
    const x = (phase % 2 === 0 ? 200 : 296 + width) + 40 + members(String(wp.macro)).indexOf(wp) * 136
    const checklist = JSON.stringify(wp.checklist ?? [], null, 2)
    return {
      id: wp.id,
      name: unique(String(wp.title ?? wp.id), String(wp.id)),
      type: `relay.${wp.kind ?? "execute"}`,
      position: [x, 132 + Math.floor(phase / 2) * 240],
      parameters: { instructions: wp.instructions ?? "", checklist, skill: "", skillMode: "combine" },
    }
  })
  const nodes: Json[] = [
    { id: "relay-start", name: "Start", type: "relay.startTrigger", position: [96, 132], parameters: start },
    ...steps,
  ]
  const link = (target: Json) => ({ main: [[{ node: target.name, type: "main", index: 0 }]] })
  const connections = Object.fromEntries(nodes.slice(0, -1).map((node, index) => [node.name, link(nodes[index + 1])]))
  const nodeGroups = phases.map((phase) => {
    const macro = (source.macros ?? []).find((item) => item.id === phase)
    const title = String(macro?.title ?? phase)
    return {
      id: phase,
      name: title[0] + title.slice(1).toLowerCase(),
      description: String(macro?.instructions ?? ""),
      nodeIds: members(phase).map((wp) => wp.id),
    }
  })
  return document({ ...meta, nodes, connections, nodeGroups, kind: "workflow" }, now)
}

function hook(meta: Data["hooks"][number], now: number) {
  const names = new Map(meta.nodes.map(([id, name]) => [id, name]))
  const connections: Record<string, { main: Json[][] }> = {}
  meta.edges.forEach(([from, to, port]) => {
    const source = names.get(from)!
    const main = connections[source]?.main ?? []
    while (main.length <= port) main.push([])
    main[port].push({ node: names.get(to), type: "main", index: 0 })
    connections[source] = { main }
  })
  const nodes = meta.nodes.map(([id, name, type, x, y, parameters]) => ({
    id,
    name,
    type,
    position: [x, y],
    parameters,
  }))
  return document({ ...meta, nodes, connections, kind: "hook" }, now)
}

function run(input: Run, now: number): Json {
  const started = now - input.started * minute
  const steps = (input.steps ?? []).map((step) => ({
    wp: step.wp,
    status: step.status ?? "passed",
    attempts: step.attempts ?? 1,
    startedAt: started + step.at * minute,
    endedAt: started + step.at * minute + step.seconds * 1000,
    sessionID: `ses_${step.wp.replace(/\W/g, "")}`,
    note: step.note,
    checks: step.checks
      ? step.checks.map(([id, verdict, output]) => ({ id, verdict, output }))
      : (step.passed ?? []).map((id) => ({ id, verdict: "pass", output: "exit 0" })),
  }))
  const ended = input.ended === undefined ? undefined : now - input.ended * minute
  return { ...input, failing: input.failing ?? [], startedAt: started, endedAt: ended, steps }
}

function decision(install: string, row: Decision, now: number) {
  const [decisionID, nodeID, trigger, tool, subject, outcome, minutes, sessionID] = row
  const ts = new Date(now - minutes * minute).toISOString()
  return {
    decisionID,
    installID: install,
    version: 1,
    nodeID,
    action: outcome,
    trigger,
    tool,
    sessionID,
    subject,
    outcome,
    ts,
  }
}

export function relayState(now = Date.now()) {
  const decisions = Object.entries(data.decisions).map(([install, rows]) => [
    install,
    rows.map((row) => decision(install, row, now)),
  ])
  return {
    documents: [...data.workflows.map((item) => workflow(item, now)), ...data.hooks.map((item) => hook(item, now))],
    runs: data.runs.map((item) => run(item, now)),
    audits: data.audits,
    installs: data.installs.map((item) => ({ ...item, installedAt: now - item.installed * minute }) as Json),
    decisions: Object.fromEntries(decisions) as Record<string, Json[]>,
    supported: true,
    writes: [] as { method: string; path: string; body: unknown }[],
  }
}

export type RelayState = ReturnType<typeof relayState>
type Answer = (body: unknown, status?: number) => Promise<void>
type Request = { method: string; id?: string; action?: string; extra?: string; body?: Json; url: URL }

// Answers every /api/relay route from `state`; with `supported: false` the server has no Relay routes.
export async function mockRelay(page: Page, state: RelayState) {
  await page.route(/\/api\/relay(\/|\?|$)/, async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const [group, id, action, extra] = url.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent)
    const method = request.method()
    const headers = { "access-control-allow-origin": "*" }
    const json: Answer = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) })
    if (!state.supported) return json({ message: "Not found" }, 404)
    const body = method === "GET" || method === "DELETE" ? undefined : (request.postDataJSON() as Json)
    if (method !== "GET") state.writes.push({ method, path: url.pathname, body })
    const call = { method, id, action, extra, body, url }
    if (group === "node-types") return json(nodeTypes)
    if (group === "document") return answerDocument(state, json, call)
    if (group === "run") return answerRun(state, json, call)
    if (group === "hook") return answerHook(state, json, call)
    return json({ message: "Unknown route" }, 404)
  })
}

function answerDocument(state: RelayState, json: Answer, call: Request) {
  if (!call.id && call.method === "GET") return json(state.documents)
  if (!call.id && call.method === "POST") {
    const meta = {
      id: `doc-${state.documents.length + 1}`,
      name: String(call.body?.name),
      description: "",
      draft: 1,
      updated: 0,
    }
    const nodes = (call.body?.nodes as Json[]) ?? []
    const connections = (call.body?.connections as Json) ?? {}
    const nodeGroups = (call.body?.nodeGroups as Json[]) ?? []
    const created = {
      ...document({ ...meta, nodes, connections, nodeGroups, kind: "workflow" }, Date.now()),
      meta: call.body?.meta,
    }
    state.documents.unshift(created)
    return json(created)
  }
  const index = state.documents.findIndex((item) => item.id === call.id)
  const current = state.documents[index]
  if (!current) return json({ message: "Unknown document" }, 404)
  if (call.method === "DELETE") {
    state.documents.splice(index, 1)
    return json({})
  }
  if (call.method === "PATCH") {
    const counter = Number(current.versionCounter) + 1
    const versions = {
      versionCounter: counter,
      versionId: `${call.id}-v${counter}`,
      checksum: `sum-${call.id}-${counter}`,
    }
    state.documents[index] = { ...current, ...call.body, ...versions, expectedChecksum: undefined }
    return json(state.documents[index])
  }
  if (call.action === "publish") {
    const live = { versionId: current.versionId, versionCounter: current.versionCounter }
    state.documents[index] = { ...current, activeVersionId: current.versionId, activeVersion: live }
    return json(state.documents[index])
  }
  if (call.action === "version") return json({ ...current, versionId: call.extra })
  if (call.action === "export") return json({ kind: "workflow", definition: { name: current.name } })
  return json(current)
}

function answerRun(state: RelayState, json: Answer, call: Request) {
  if (!call.id && call.method === "GET") {
    const document = call.url.searchParams.get("document")
    return json(state.runs.filter((item) => !document || item.documentID === document))
  }
  if (!call.id && call.method === "POST") {
    const started = {
      runID: String(2000 + state.runs.length),
      documentID: call.body?.documentID,
      version: 3,
      status: "running",
      label: "Started from the app",
      agent: "Maestro",
      startedAt: Date.now(),
      steps: [],
      failing: [],
    }
    state.runs.unshift(started)
    return json(started)
  }
  const current = state.runs.find((item) => item.runID === call.id)
  if (!current) return json({ message: "Unknown run" }, 404)
  if (call.action === "release") {
    if (!String(call.body?.reason ?? "").trim()) return json({ message: "Release requires a reason" }, 400)
    const steps = (current.steps as Json[]).map((step) =>
      step.wp === current.position
        ? { ...step, status: "running", attempts: Number(step.attempts) + 1, checks: [] }
        : step,
    )
    Object.assign(current, { status: "running", failing: [], steps })
    return json(current)
  }
  const pending = { status: current.status === "completed" ? "pass" : "pending", code: "", rows: [] }
  if (call.action === "audit") return json(state.audits[String(call.id)] ?? pending)
  if (call.action === "ledger") return json({ entries: [] })
  return json(current)
}

function answerHook(state: RelayState, json: Answer, call: Request) {
  if (!call.id && call.method === "GET") return json({ installs: state.installs })
  if (!call.id && call.method === "POST") {
    const document = String(call.body?.document)
    const install = { installID: `inst-${document}`, document, version: 1, enabled: true, installedAt: Date.now() }
    state.installs.push(install)
    return json(install)
  }
  const install = state.installs.find((item) => item.installID === call.id)
  if (!install) return json({ message: "Unknown install" }, 404)
  if (call.action === "decisions") return json(state.decisions[String(call.id)] ?? [])
  if (call.action === "enable" || call.action === "disable") install.enabled = call.action === "enable"
  return json(install)
}

export async function setupRelay(page: Page, input: { scheme?: "dark" | "light"; state?: RelayState } = {}) {
  const state = input.state ?? relayState()
  await page.addInitScript(
    ({ server, directory, scheme }) => {
      const general = { newLayoutDesigns: true, shouldDisplayTabsToast: false, newInterfaceNoticeDismissed: true }
      const projects = {
        local: [{ worktree: directory, expanded: true }],
        [server]: [{ worktree: directory, expanded: true }],
      }
      const layout = JSON.stringify({ home: { selection: { server, directory } } })
      localStorage.setItem("opencode.settings.dat:defaultServerUrl", server)
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem("settings.v3", JSON.stringify({ general }))
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem("opencode.global.dat:server", JSON.stringify({ list: [server], projects }))
      localStorage.setItem("opencode.global.dat:layout", layout)
      localStorage.setItem(`opencode.global.dat:${server}\0layout`, layout)
    },
    { server, directory, scheme: input.scheme ?? "dark" },
  )
  const time = { created: 1, updated: 1 }
  await mockOpenCodeServer(page, {
    protocol: "v2",
    eventRetry: 60_000,
    provider: { all: [], connected: [], default: {} },
    directory,
    project: { id: "orchestra", name: "orchestra-canonical", worktree: directory, vcs: "git", sandboxes: [], time },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await mockRelay(page, state)
  return state
}
