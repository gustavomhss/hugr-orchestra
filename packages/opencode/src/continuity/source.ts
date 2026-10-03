import { createHash } from "node:crypto"
import { getNodeValue, parseTree } from "jsonc-parser"
import type { Node, ParseError } from "jsonc-parser"
import type { FilePart, ToolPart, WithParts } from "@opencode-ai/core/v1/session"
import type { SessionID } from "@/session/schema"
import type { JsonValue, MaterializedArtifact, SourceCatalogue, SourceDescriptor, SourceLocator, SourceUnit } from "./types"
import { estimateCitation, estimateExact } from "./artifact"
import { pricing } from "./render"

export function catalogue(input: {
  parentID: SessionID
  head: WithParts[]
  previous?: MaterializedArtifact
  canRecall?: boolean
}): SourceCatalogue {
  const previous = input.previous ?? null
  if (previous && (previous.envelope.version !== 1 || previous.envelope.kind !== "continuity_handoff" ||
    previous.envelope.parentID !== input.parentID)) throw new Error("Unsupported prior artifact")
  const units: SourceUnit[] = []
  const locations = new Map<string, SourceUnit>()
  const ids = new Set<string>()
  const counter = { id: 0, order: -1 }
  const canRecall = input.canRecall === true
  for (const source of previous?.sources ?? []) {
    const number = Number(source.id.slice(1))
    if (!Number.isSafeInteger(number) || number < 1 || source.id !== `S${String(number).padStart(3, "0")}` ||
      source.parentID !== input.parentID || !Number.isSafeInteger(source.order) || source.order < 0 ||
      ids.has(source.id) || locations.has(key(source.locator))) throw new Error("Prior source identity collision")
    const unit: SourceUnit = {
      id: source.id, parentID: source.parentID,
      locator: { messageID: source.locator.messageID, partID: source.locator.partID,
        field: source.locator.field, path: [...source.locator.path] },
      role: source.role, kind: source.kind, order: source.order, actor: source.actor, scope: source.scope,
      extent: source.extent, digest: source.digest, exit: source.exit, origin: "prior",
      recoverable: canRecall && source.extent !== "unavailable",
    }
    units.push(unit)
    locations.set(key(unit.locator), unit)
    ids.add(unit.id)
    counter.id = Math.max(counter.id, number)
    counter.order = Math.max(counter.order, source.order)
  }
  if (previous) {
    priorBody(previous, ids)
    const retained = new Set(previous.sources.map((source) => source.locator.messageID))
    if (input.head.length && (input.head[0].info.id !== previous.envelope.tailStart ||
      input.head.some((message) => retained.has(message.info.id)))) throw new Error("UnsupportedOverlap: prior/head partition")
  }
  const supplied = new Set<string>()
  for (const exact of previous?.exact ?? []) {
    const unit = units.find((source) => source.id === exact.source)
    if (!unit || supplied.has(exact.source) || !previous?.body.exact.some((selection) =>
      selection.source === exact.source && selection.reason === exact.reason)) throw new Error("Invalid prior exact source")
    const value = json(exact.value)
    if (digest(value) !== unit.digest) throw new Error("Changed prior exact source")
    unit.value = value
    supplied.add(exact.source)
  }
  for (const message of input.head) {
    if (message.info.sessionID !== input.parentID) throw new Error("Foreign source session")
    const actor = message.info.role === "assistant" ? message.info.agent || null : null
    const publish = (partID: SourceLocator["partID"], path: SourceLocator["path"], value: JsonValue,
      metadata: Pick<SourceDescriptor, "role" | "kind" | "scope" | "extent" | "exit">) => {
      const locator: SourceLocator = { messageID: message.info.id, partID, field: partID === null ? "system" : "part", path }
      const hash = digest(value)
      const existing = locations.get(key(locator))
      if (existing) {
        if (existing.digest !== hash || existing.role !== metadata.role || existing.kind !== metadata.kind ||
          existing.actor !== actor || existing.scope !== metadata.scope || existing.extent !== metadata.extent ||
          existing.exit !== metadata.exit) throw new Error("Source locator collision or changed source")
        existing.value = json(value)
        existing.origin = "head"
        return
      }
      if (counter.id >= Number.MAX_SAFE_INTEGER || counter.order >= Number.MAX_SAFE_INTEGER) throw new Error("Source counter exhausted")
      const unit: SourceUnit = {
        id: `S${String(++counter.id).padStart(3, "0")}`, parentID: input.parentID, locator,
        ...metadata, origin: "head", order: ++counter.order, actor,
        recoverable: canRecall && metadata.extent !== "unavailable", digest: hash, value: json(value),
      }
      units.push(unit)
      locations.set(key(locator), unit)
    }
    if (message.info.role === "user" && message.info.system !== undefined) {
      publish(null, [], message.info.system, {
        role: "user", kind: "text", scope: `turn:${message.info.id}`, extent: "full", exit: null,
      })
    }
    for (const part of message.parts) {
      if (part.sessionID !== input.parentID || part.messageID !== message.info.id) throw new Error("Foreign source part")
      const scope = message.info.role === "assistant" ? message.info.path.cwd || null : null
      const metadata = { role: message.info.role, kind: "json", scope, extent: "full", exit: null } satisfies
        Pick<SourceDescriptor, "role" | "kind" | "scope" | "extent" | "exit">
      switch (part.type) {
        case "text":
          if (!part.ignored) publish(part.id, ["text"], part.text, {
            ...metadata, kind: "text", extent: extent(part.metadata, "full"),
          })
          break
        case "file":
          publish(part.id, [], file(part), { ...metadata, kind: "file", extent: "unknown" })
          break
        case "tool": {
          const meta: unknown = "metadata" in part.state ? part.state.metadata : undefined
          const exit = record(meta) && typeof meta.exit === "number" && Number.isSafeInteger(meta.exit) ? meta.exit : null
          const observation = {
            ...metadata, role: "tool", exit,
            extent: part.state.status === "completed" && part.state.time.compacted !== undefined ? "cleared" : extent(meta, "unknown"),
          } satisfies Pick<SourceDescriptor, "role" | "kind" | "scope" | "extent" | "exit">
          publish(part.id, [], tool(part, exit), observation)
          // Input selectors identify arguments, never verification receipts; keep this prefix for the decoder.
          for (const leaf of leaves(json(part.state.input), ["state", "input"])) {
            publish(part.id, leaf.path, leaf.value, { ...observation, extent: "full" })
          }
          if (exit !== null) publish(part.id, ["state", "metadata", "exit"], exit, { ...observation, extent: "full" })
          if (part.state.status === "completed" && part.state.time.compacted === undefined &&
            observation.extent !== "cleared" && observation.extent !== "unavailable") {
            const decoded = output(part.state.output)
            const selected = decoded === undefined ? [] : leaves(decoded, ["state", "output"])
            // Full captured scalars do not certify a full original response. The wrapper keeps its extent.
            for (const leaf of selected.length ? selected : [{ path: ["state", "output"], value: part.state.output }]) {
              publish(part.id, leaf.path, leaf.value, {
                ...observation, kind: selected.length ? "json" : "text", extent: "full",
              })
            }
          }
          break
        }
        case "subtask":
          publish(part.id, [], json({ prompt: part.prompt, description: part.description, agent: part.agent,
            ...(part.command !== undefined && { command: part.command }) }), metadata)
          break
        case "agent":
          publish(part.id, ["name"], part.name, { ...metadata, kind: "text" })
          break
      }
    }
  }
  return { parentID: input.parentID, units, previous, canRecall }
}

export function input(catalogue: SourceCatalogue): JsonValue {
  // Prior prose is interpretation data. Only exact values appear as supplied source values.
  return json({ parentID: catalogue.parentID, canRecall: catalogue.canRecall,
    previous: catalogue.previous ? { envelope: catalogue.previous.envelope,
      body: priorBody(catalogue.previous, new Set(catalogue.units.map((unit) => unit.id))) } : null,
    groups: groups(catalogue.units),
  })
}

function groups(units: SourceUnit[]) {
  const costs = pricing(units)
  // Groups share only host provenance; payload claims never determine authority. IDs remain flat selectors.
  const result = new Map<string, {
    locator: Omit<SourceLocator, "path">
    role: SourceUnit["role"]; actor: SourceUnit["actor"]; scope: SourceUnit["scope"]
    origin: SourceUnit["origin"]; exit: SourceUnit["exit"]
    units: (Pick<SourceUnit, "id" | "kind" | "order" | "extent" | "recoverable" | "value"> &
      { path: SourceLocator["path"]; exactTokens: number | null; citationTokens: number })[]
  }>()
  for (const unit of units) {
    const locator = { messageID: unit.locator.messageID, partID: unit.locator.partID, field: unit.locator.field }
    const shared = { locator, role: unit.role, actor: unit.actor, scope: unit.scope, origin: unit.origin, exit: unit.exit }
    const key = JSON.stringify(shared)
    const group = result.get(key) ?? { ...shared, units: [] }
    group.units.push({ id: unit.id, path: unit.locator.path, kind: unit.kind, order: unit.order,
      extent: unit.extent, recoverable: unit.recoverable, exactTokens: estimateExact(unit, costs),
      citationTokens: estimateCitation(unit, costs),
      ...(unit.value !== undefined && { value: unit.value }) })
    result.set(key, group)
  }
  return [...result.values()]
}

function priorBody(previous: MaterializedArtifact, ids: ReadonlySet<string>) {
  const body = previous.body
  const exact = body.exact.map((selection) => selection.source)
  if (new Set(exact).size !== exact.length) throw new Error("Duplicate prior exact source")
  const refs = [...exact, ...body.notes.flatMap((note) => note.sources),
    ...body.reference_only.map((reference) => reference.source), ...body.issues.flatMap((issue) => issue.sources)]
  const priorIDs = new Set(previous.sources.map((source) => source.id))
  if (refs.some((ref) => !ids.has(ref) || !priorIDs.has(ref))) throw new Error("UnsupportedPriorReference: missing source metadata")
  if (body.status === "ready" && body.issues.length) throw new Error("Unsupported prior artifact: ready issues")
  // Omission diagnostics are not memory and must not alias newly allocated IDs in later packets.
  return { status: body.status, exact: body.exact, notes: body.notes, reference_only: body.reference_only,
    omissions: [], issues: body.issues }
}

function key(locator: SourceLocator) {
  if (!locator.messageID || (locator.field !== "part" && locator.field !== "system") ||
    (locator.field === "system" ? locator.partID !== null || locator.path.length !== 0 : !locator.partID) ||
    !locator.path.every((item) => typeof item === "string" || Number.isSafeInteger(item) && item >= 0)) {
    throw new Error("Invalid source locator")
  }
  return JSON.stringify([locator.messageID, locator.partID, locator.field, locator.path])
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function json(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number" && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return value
  if (Array.isArray(value)) return value.map(json)
  if (record(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, json(value[key])]))
  }
  throw new Error("Unsafe JSON value; supply original raw text")
}

function digest(value: JsonValue) {
  return createHash("sha256").update(JSON.stringify(json(value))).digest("hex")
}

function extent(meta: unknown, fallback: SourceDescriptor["extent"]): SourceDescriptor["extent"] {
  if (!record(meta)) return fallback
  if (meta.extent === "cleared" || meta.extent === "unavailable") return meta.extent
  if (meta.truncated === true) return "preview"
  if (meta.extent === "full" || meta.extent === "preview" || meta.extent === "unknown") return meta.extent
  return meta.truncated === false ? "full" : fallback
}

function file(part: FilePart): JsonValue {
  const source = part.source
  return json({ type: "file", mime: part.mime, filename: part.filename,
    url: /^data:/i.test(part.url) ? "[inline attachment]" : part.url,
    ...(source && { source: {
      type: source.type,
      ...(source.type !== "resource" && { path: source.path }),
      ...(source.type === "symbol" && { range: source.range, name: source.name, kind: source.kind }),
      ...(source.type === "resource" && { clientName: source.clientName,
        uri: /^data:/i.test(source.uri) ? "[inline attachment]" : source.uri }),
    } }),
  })
}

function tool(part: ToolPart, exit: number | null): JsonValue {
  const meta: unknown = "metadata" in part.state ? part.state.metadata : undefined
  const safe = record(meta) ? {
    exit, truncated: typeof meta.truncated === "boolean" ? meta.truncated : null,
    outputPath: typeof meta.outputPath === "string" ? meta.outputPath : null,
  } : { exit, truncated: null, outputPath: null }
  return json({ type: "tool", tool: part.tool, callID: part.callID,
    state: { status: part.state.status, input: part.state.input, metadata: safe,
      ...(part.state.status === "pending" && { raw: part.state.raw }),
      ...(part.state.status === "completed" && part.state.time.compacted === undefined && {
        output: part.state.output, attachments: part.state.attachments?.map(file),
      }),
      ...(part.state.status === "error" && { error: part.state.error }),
    },
  })
}

function leaves(value: JsonValue, path: SourceLocator["path"]): { path: SourceLocator["path"]; value: JsonValue }[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => leaves(item, [...path, index]))
  if (value !== null && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => leaves(item, [...path, key]))
  return [{ path, value }]
}

function output(text: string): JsonValue | undefined {
  const errors: ParseError[] = []
  const tree = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false })
  if (!tree || errors.length || !safe(tree, text)) return undefined
  return json(getNodeValue(tree))
}

function safe(node: Node, text: string): boolean {
  if (node.type === "number") {
    const value: unknown = node.value
    if (typeof value !== "number" || !Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value)) return false
    const raw = text.slice(node.offset, node.offset + node.length)
    if (decimal(raw) !== decimal(JSON.stringify(value))) return false
  }
  // Duplicate keys make selectors ambiguous; inspect every token before converting the tree.
  if (node.type === "object") {
    const keys = node.children?.map((property) => property.children?.[0].value) ?? []
    if (new Set(keys).size !== keys.length) return false
  }
  return node.children?.every((child) => safe(child, text)) ?? true
}

function decimal(text: string) {
  // Grammar is already checked by the JSON parser. Compare decimal values without powers of ten.
  const [mantissa, exponent = "0"] = text.toLowerCase().split("e")
  const unsigned = mantissa.startsWith("-") ? mantissa.slice(1) : mantissa
  const point = unsigned.indexOf(".")
  const digits = unsigned.replace(".", "").replace(/^0+/, "")
  if (!digits) return "0"
  const coefficient = digits.replace(/0+$/, "")
  const scale = BigInt(exponent) - BigInt(point < 0 ? 0 : unsigned.length - point - 1) +
    BigInt(digits.length - coefficient.length)
  return `${mantissa.startsWith("-") ? "-" : ""}${coefficient}e${scale.toString()}`
}
