import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import type { Page, Route } from "@playwright/test"
import { mockOrchestraServer } from "../utils/mock-server"

// The Relay routes as the server answers them after WP14 (server.relay.{document,publish,hook}), for the Workflows and
// Hooks specs. Workflow documents are the shipped profiles seeded the way AuthoringStore.seedProfiles projects them;
// hooks, installs and ledger decisions come from relay.data.json (times in minutes ago). Requests are checked like the
// server checks them: unknown save fields, stale versions, fractional positions and an install `version` are refused.
// The run routes (WP17) do not exist yet, so they answer a plain 404.

export const server = "http://127.0.0.1:4096"
export const directory = "/repo/orchestra-canonical"
const minute = 60_000

type Json = Record<string, unknown>
type Sprint = { brief?: string; retry_budget?: number; macros?: Json[]; work_packages: Json[] }
type HookNode = [string, string, string, number, number, Json]
type Decision = [string, string, string, string, string, string, string, number, string]
type Data = {
  profiles: Record<string, { published: number | null; draft?: number; updated: number }>
  runnable: string[]
  hooks: {
    id: string
    name: string
    description: string
    draft: number
    published: number | null
    updated: number
    nodes: HookNode[]
    edges: [string, string, number][]
  }[]
  installs: { installID: string; document: string; order: number; enabled: boolean; installed: number }[]
  decisions: Record<string, Decision[]>
  nodeTypes: { workflow: Json[]; hook: Json[]; step: Json[]; context: Json[] }
}

const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"))
const data = read<Data>("./relay.data.json")
const hex = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const iso = (now: number, minutes: number) => new Date(now - minutes * minute).toISOString()

// The node catalogs of AuthoringGraph.nodeTypes and AuthoringHook.nodeTypes.
const message = { name: "message", label: "Message", type: "text", default: "" }
const parameters: Record<string, Json[]> = {
  step: data.nodeTypes.step,
  context: [...data.nodeTypes.step, ...data.nodeTypes.context],
  message: [message],
  note: [{ ...message, label: "Note" }],
  verify: [message, { name: "check", label: "Check command", type: "string", default: "" }],
}
const expand = (item: Json) =>
  typeof item.parameters === "string" ? { ...item, parameters: parameters[item.parameters] } : item
export const nodeTypes = { workflow: data.nodeTypes.workflow.map(expand), hook: data.nodeTypes.hook.map(expand) }

// A stored document and its view: checksum, published version and whether run admission accepts its profile.
function stored(input: {
  id: string
  name: string
  description?: string
  nodes: Json[]
  connections: Json
  nodeGroups?: Json[]
  meta: Json
  draft: number
  published: number | null
  updated: string
  runnable: boolean
}) {
  const version = (counter: number) => `${input.id}-v${counter}`
  const document = {
    id: input.id,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    nodes: input.nodes,
    connections: input.connections,
    ...(input.nodeGroups ? { nodeGroups: input.nodeGroups } : {}),
    tags: [],
    isArchived: false,
    active: input.published !== null,
    activeVersionId: input.published === null ? null : version(input.published),
    meta: input.meta,
    createdAt: input.updated,
    updatedAt: input.updated,
    versionId: version(input.draft),
    versionCounter: input.draft,
  }
  return view(
    document,
    input.published === null
      ? null
      : { ...document, versionId: version(input.published), versionCounter: input.published, workflowId: input.id },
    input.runnable,
  )
}

function view(document: Json, activeVersion: Json | null, runnable: boolean): Json {
  return { ...document, checksum: hex(document), activeVersion, runnable }
}

// AuthoringGraph.project: steps 224 apart, phases two per row 672 apart, a "Workflow start" node in front.
function profile(name: string, now: number) {
  const source = read<Sprint>(`../../../relay/profiles/${name}.sprint.json`)
  const seed = data.profiles[name]
  const wps = source.work_packages
  const phases = [...new Set(wps.map((wp) => String(wp.macro ?? "")))]
  const taken = new Set<string>()
  const unique = (title: string, id: string): string => (taken.has(title) ? unique(`${title} · ${id}`, id) : title)
  const steps = wps.map((wp) => {
    const phase = phases.indexOf(String(wp.macro ?? ""))
    const member = wps.filter((item) => item.macro === wp.macro).indexOf(wp)
    const nodeName = unique(String(wp.title || wp.id), String(wp.id))
    taken.add(nodeName)
    return {
      id: wp.id,
      name: nodeName,
      type: `relay.${wp.kind ?? "execute"}`,
      typeVersion: 1,
      position: [240 + (phase % 2) * 672 + member * 224, 240 + Math.floor(phase / 2) * 288],
      parameters: {
        title: wp.title ?? "",
        macro: wp.macro ?? "",
        instructions: wp.instructions ?? "",
        checklist: JSON.stringify(wp.checklist ?? [], null, 2),
        skill: "",
        skillMode: "combine",
        text: wp.text ?? "",
        file: wp.file ?? "",
      },
    }
  })
  const first = steps[0]!
  const start = {
    id: "relay-start",
    name: "Workflow start",
    type: "relay.startTrigger",
    typeVersion: 1,
    position: [first.position[0]! - 224, first.position[1]],
    parameters: { relayBrief: source.brief ?? "", relayRetryBudget: source.retry_budget ?? 3 },
  }
  const nodes: Json[] = [start, ...steps]
  const link = (target: Json) => ({ main: [[{ node: target.name, type: "main", index: 0 }]] })
  const connections = Object.fromEntries(nodes.slice(0, -1).map((node, index) => [node.name, link(nodes[index + 1]!)]))
  const nodeGroups = (source.macros ?? []).map((macro) => ({
    id: macro.id,
    name: macro.title || macro.id,
    description: macro.instructions ?? "",
    nodeIds: wps.filter((wp) => wp.macro === macro.id).map((wp) => wp.id),
  }))
  const names = Object.fromEntries(steps.map((step) => [step.id, step.name]))
  return stored({
    id: `relay-${name}`,
    name: `Relay · ${name}`,
    nodes,
    connections,
    nodeGroups,
    meta: { relay: { schema: 1, kind: "workflow", sprint: source, names, diagnostics: [], profile: name } },
    draft: seed.draft ?? 1,
    published: seed.published,
    updated: iso(now, seed.updated),
    runnable: data.runnable.includes(name),
  })
}

function hookConnections(nodes: HookNode[], edges: [string, string, number][]) {
  const names = new Map(nodes.map(([id, name]) => [id, name]))
  const connections: Record<string, { main: Json[][] }> = {}
  edges.forEach(([from, to, port]) => {
    const source = names.get(from)!
    const main = connections[source]?.main ?? []
    while (main.length <= port) main.push([])
    main[port]!.push({ node: names.get(to), type: "main", index: 0 })
    connections[source] = { main }
  })
  return connections
}

function hook(input: Data["hooks"][number], now: number) {
  const nodes = input.nodes.map(([id, name, type, x, y, parameters]) => ({
    id,
    name,
    type,
    position: [x, y],
    parameters,
  }))
  return stored({
    ...input,
    nodes,
    connections: hookConnections(input.nodes, input.edges),
    meta: { relay: { schema: 1, kind: "hook", diagnostics: [] } },
    updated: iso(now, input.updated),
    runnable: true,
  })
}

// The relay.hook.v1 export an install pins.
function snapshot(document: Json) {
  const nodes = document.nodes as Json[]
  const ids = new Map(nodes.map((node) => [node.name, node.id]))
  const connections = Object.entries(document.connections as Record<string, { main: Json[][] }>).flatMap(
    ([source, outputs]) =>
      outputs.main.flatMap((channel, port) =>
        channel.map((edge) => ({ from: ids.get(source), port, to: ids.get(String(edge.node)) })),
      ),
  )
  return {
    schema: "relay.hook.v1",
    name: document.name,
    nodes,
    connections,
    binding: "host-required",
    installed: false,
  }
}

function install(document: Json, item: { installID: string; order: number; enabled: boolean }, at: number) {
  const pinned = snapshot(document)
  return {
    installID: item.installID,
    document: document.id,
    version: document.activeVersionId,
    sha256: hex(pinned),
    order: item.order,
    enabled: item.enabled,
    installedBy: "machine-user",
    installedAt: at,
    snapshot: pinned,
  }
}

export function relayState(now = Date.now()) {
  const documents = [
    ...Object.keys(data.profiles).map((name) => profile(name, now)),
    ...data.hooks.map((item) => hook(item, now)),
  ].toSorted((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  const byID = (id: string) => documents.find((document) => document.id === id)!
  const decisions = Object.fromEntries(
    Object.entries(data.decisions).map(([installID, rows]) => [
      installID,
      rows.map(([decision, node, action, trigger, tool, subject, outcome, minutes, session], seq) => ({
        ts: Math.floor((now - minutes * minute) / 1000),
        event: "hook-decision",
        decision,
        install: installID,
        version: byID(data.installs.find((item) => item.installID === installID)!.document).activeVersionId,
        node,
        action,
        trigger,
        tool,
        session,
        call: `call_${decision}`,
        subject,
        outcome,
        seq,
      })),
    ]),
  ) as Record<string, Json[]>
  return {
    documents,
    installs: data.installs.map((item) => install(byID(item.document), item, now - item.installed * minute)) as Json[],
    decisions,
    supported: true,
    writes: [] as { method: string; path: string; body: unknown }[],
  }
}

export type RelayState = ReturnType<typeof relayState>
type Answer = (body: unknown, status?: number) => Promise<void>
type Call = { method: string; id?: string; action?: string; extra?: string; body?: Json }

const SAVE_FIELDS = new Set([
  "name",
  "description",
  "nodes",
  "connections",
  "nodeGroups",
  "tags",
  "meta",
  "isArchived",
  "versionId",
  "expectedChecksum",
  "force",
])
const refuse = (json: Answer, status: number, tag: string, code: string, text: string) =>
  json({ _tag: tag, code, message: text }, status)

export async function mockRelay(page: Page, state: RelayState) {
  await page.route(/\/api\/relay(\/|\?|$)/, async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const [group, id, action, extra] = url.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent)
    const method = request.method()
    const headers = { "access-control-allow-origin": "*" }
    // Location-scoped successes are `{location, data}`; refusals are `{_tag, code, message}`; NoContent has no body.
    const json: Answer = (body, status = 200) =>
      status === 204
        ? route.fulfill({ status, headers })
        : route.fulfill({
            status,
            contentType: "application/json",
            headers,
            body: JSON.stringify(status < 300 ? { location: { directory }, data: body } : body),
          })
    const missing = () => route.fulfill({ status: 404, contentType: "text/plain", headers, body: "Not Found" })
    if (!state.supported || group === "run") return missing()
    if (url.searchParams.get("location[directory]") !== directory)
      return refuse(json, 400, "RelayInvalidError", "invalid-request", "Unknown location")
    const body = method === "GET" || method === "DELETE" ? undefined : (request.postDataJSON() as Json)
    if (method !== "GET") state.writes.push({ method, path: url.pathname, body })
    const call = { method, id, action, extra, body }
    if (group === "node-types") return json(nodeTypes)
    if (group === "document") return answerDocument(state, json, call)
    if (group === "hook") return answerHook(state, json, call)
    return missing()
  })
}

function answerDocument(state: RelayState, json: Answer, call: Call) {
  if (!call.id && call.method === "GET") return json(state.documents)
  if (!call.id && call.method === "POST") {
    const fields = call.body ?? {}
    const id = `doc-${state.documents.length + 1}`
    const created = stored({
      id,
      name: String(fields.name ?? "New Relay workflow"),
      description: typeof fields.description === "string" ? fields.description : undefined,
      nodes: (fields.nodes as Json[]) ?? [],
      connections: (fields.connections as Json) ?? {},
      nodeGroups: fields.nodeGroups as Json[] | undefined,
      meta: (fields.meta as Json) ?? {},
      draft: 1,
      published: null,
      updated: new Date().toISOString(),
      runnable: !["design", "planning", "research-v2", "spec-decompose"].includes(
        String((fields.meta as { relay?: Json })?.relay?.profile),
      ),
    })
    state.documents.unshift(created)
    return json(created)
  }
  const index = state.documents.findIndex((item) => item.id === call.id)
  const current = state.documents[index]
  if (!current) return refuse(json, 404, "RelayNotFoundError", "document-missing", `No document ${call.id}.`)
  if (call.method === "DELETE") {
    state.documents.splice(index, 1)
    return json(null, 204)
  }
  if (call.method === "PATCH") return save(state, json, index, call.body ?? {})
  if (call.action === "publish") {
    if (call.body?.versionId !== current.versionId)
      return refuse(
        json,
        409,
        "RelayConflictError",
        "version-conflict",
        "The workflow changed. Reload it before saving.",
      )
    const { checksum: _checksum, activeVersion: _active, runnable, ...document } = current
    const published = { ...document, active: true, activeVersionId: current.versionId }
    state.documents[index] = view(published, { ...document, workflowId: current.id }, Boolean(runnable))
    return json(state.documents[index])
  }
  return json(current)
}

function save(state: RelayState, json: Answer, index: number, body: Json) {
  const current = state.documents[index]!
  const unknown = Object.keys(body).filter((key) => !SAVE_FIELDS.has(key))
  if (unknown.length)
    return refuse(json, 400, "RelayInvalidError", "invalid-request", `Unknown fields: ${unknown.join(", ")}`)
  if (body.versionId !== current.versionId || (body.expectedChecksum && body.expectedChecksum !== current.checksum))
    return refuse(json, 409, "RelayConflictError", "version-conflict", "The workflow changed. Reload it before saving.")
  const fractional = ((body.nodes as Json[] | undefined) ?? []).some((node) =>
    (node.position as number[]).some((value) => !Number.isInteger(value)),
  )
  if (fractional) return refuse(json, 400, "RelayInvalidError", "invalid-request", "Positions must be whole numbers")
  const { versionId: _version, expectedChecksum: _checksum, force: _force, ...fields } = body
  const { checksum: _stored, activeVersion, runnable, ...document } = current
  const counter = Number(current.versionCounter) + 1
  const next = {
    ...document,
    ...fields,
    versionCounter: counter,
    versionId: `${current.id}-v${counter}`,
    updatedAt: new Date().toISOString(),
  }
  state.documents[index] = view(next, (activeVersion as Json | null) ?? null, Boolean(runnable))
  return json(state.documents[index])
}

function answerHook(state: RelayState, json: Answer, call: Call) {
  if (!call.id && call.method === "GET") return json({ installs: state.installs })
  if (!call.id && call.method === "POST") {
    if (call.body && "version" in call.body)
      return refuse(
        json,
        400,
        "RelayInvalidError",
        "invalid-request",
        "Leave version out; the published version is pinned",
      )
    const document = state.documents.find((item) => item.id === call.body?.document)
    if (!document?.activeVersionId)
      return refuse(json, 409, "RelayConflictError", "hook-unpublished", "Publish the hook before installing it.")
    const created = install(
      document,
      { installID: `inst-${document.id}`, order: state.installs.length, enabled: true },
      Date.now(),
    )
    state.installs.push(created)
    return json(created)
  }
  const index = state.installs.findIndex((item) => item.installID === call.id)
  if (index === -1) return refuse(json, 404, "RelayNotFoundError", "install-missing", `No installed hook ${call.id}.`)
  const current = state.installs[index]!
  if (call.action === "decisions") return json(state.decisions[String(call.id)] ?? [])
  if (call.action === "enable" || call.action === "disable") current.enabled = call.action === "enable"
  if (call.action === "update") {
    const document = state.documents.find((item) => item.id === current.document)!
    state.installs[index] = install(
      document,
      { installID: String(current.installID), order: Number(current.order), enabled: Boolean(current.enabled) },
      Date.now(),
    )
  }
  return json(state.installs[index])
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
      localStorage.setItem("orchestra.settings.dat:defaultServerUrl", server)
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem("settings.v3", JSON.stringify({ general }))
      localStorage.setItem("orchestra-theme-id", "oc-2")
      localStorage.setItem("orchestra-color-scheme", scheme)
      localStorage.setItem("orchestra.global.dat:server", JSON.stringify({ list: [server], projects }))
      localStorage.setItem("orchestra.global.dat:layout", layout)
      localStorage.setItem(`orchestra.global.dat:${server}\0layout`, layout)
    },
    { server, directory, scheme: input.scheme ?? "dark" },
  )
  const time = { created: 1, updated: 1 }
  await mockOrchestraServer(page, {
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
