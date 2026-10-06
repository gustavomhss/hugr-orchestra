export * as AuthoringGraph from "./graph"

import { Effect, Option, Schema } from "effect"
import { RelayAuthoring } from "@opencode-ai/schema/relay-authoring"
import { RelaySprint } from "@opencode-ai/schema/relay-sprint"

// Workflow graphs (relay_authoring/graph.py; WP7): validate, compile to a flat sprint, project a sprint back.
//
// The Python raises AuthoringError deep inside synchronous checks, and the first failing check names the refusal. This
// port throws `Refusal` at the same points in the same order, and `refusing` turns it back into the typed failure at
// every export. Documents arrive as raw JSON, as the Python reads them: the checks here are the gate, with their own
// messages, so a draft the editor saved can always be explained.

// AuthoringError: an HTTP status, a stable code and the exact Python message.
export class Refusal extends Schema.TaggedErrorClass<Refusal>()("Authoring.Refusal", {
  status: Schema.Int,
  code: Schema.String,
  message: Schema.String,
}) {}

// A skill resolved from Orchestra's catalog: its ID, content and sha256.
export type SkillResolver = (
  skill: string,
) => Effect.Effect<{ readonly id: string; readonly content: string; readonly sha256: string }, Refusal>

// A document that passed `validate`: the shapes below hold, every other key is untouched Relay data.
export interface Graph {
  readonly name: string
  readonly nodes?: ReadonlyArray<GraphNode>
  readonly connections?: Readonly<Record<string, Readonly<Record<string, ReadonlyArray<ReadonlyArray<GraphEdge>>>>>>
  readonly nodeGroups?: ReadonlyArray<GraphGroup>
  readonly meta?: { readonly relay?: Readonly<Record<string, unknown>> }
}

export interface GraphNode {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly position: readonly [number, number]
  readonly parameters?: Readonly<Record<string, unknown>>
}

export interface GraphEdge {
  readonly node: string
  readonly type: string
  readonly index: number
}

export interface GraphGroup {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly nodeIds: ReadonlyArray<string>
}

type Loose = Record<string, unknown>

const KINDS = {
  execute: "Run task",
  gate: "Check criteria",
  review: "Review change",
  inject: "Provide context",
  human: "Human approval",
}
const START_NAME = "Workflow start"

export const nodeTypes = (): ReadonlyArray<RelayAuthoring.NodeTypeDescriptor> => {
  const entry = [
    { name: "relayBrief", label: "Workflow objective", type: "text", default: "" },
    { name: "relayRetryBudget", label: "Fixes allowed per step", type: "number", default: 3, minimum: 0, maximum: 99 },
  ]
  const step = [
    { name: "instructions", label: "Instructions", type: "text", default: "" },
    { name: "skill", label: "Skill", type: "skill", default: "" },
    {
      name: "skillMode",
      label: "How to use the skill",
      type: "options",
      default: "combine",
      options: [
        { value: "combine", label: "Skill plus instructions" },
        { value: "replace", label: "Skill replaces instructions" },
      ],
    },
    { name: "checklist", label: "Criteria to advance", type: "json", default: "[]" },
  ]
  const context = [
    { name: "text", label: "Context", type: "text", default: "" },
    { name: "file", label: "Context file", type: "string", default: "" },
  ]
  return [
    { type: RelayAuthoring.StartType, label: START_NAME, inputs: 0, outputs: ["main"], maximum: 1, parameters: entry },
    ...Object.entries(KINDS).map(([kind, label]) => ({
      type: "relay." + kind,
      label,
      inputs: 1,
      outputs: ["main"],
      parameters: kind === "inject" ? [...step, ...context] : step,
    })),
  ]
}

// `validate_document`: unique IDs and names, positions, connections, the retained sprint, scopes and phases.
export const validate = (document: unknown): Effect.Effect<Graph, Refusal> =>
  refusing(Effect.sync(() => validated(document)))

// `compile_document`: the edge-ordered chain becomes WPs, phases become macros, skills are resolved and bound.
export const compile = (
  document: unknown,
  skills?: SkillResolver,
): Effect.Effect<
  { readonly sprint: RelaySprint.Sprint; readonly bindings: ReadonlyArray<RelayAuthoring.SkillBinding> },
  Refusal
> =>
  refusing(
    Effect.gen(function* () {
      const graph = validated(document)
      if (!graph.nodes?.length) return refuse("Add at least one step before running")
      const chain = orderedChain(graph, graph.nodes)
      const relay = graph.meta?.relay ?? {}
      const sprint = structuredClone(
        get(relay, "sprint", { brief: graph.name, gen: 0, retry_budget: 3, macros: [] }) as Loose,
      )
      const entry = chain[0]!.parameters ?? {}
      const started = chain[0]!.type === RelayAuthoring.StartType
      if (started && (graph.nodeGroups ?? []).some((group) => group.nodeIds.includes(chain[0]!.id)))
        return refuse("The workflow start stays outside every phase")
      const ordered = started ? chain.slice(1) : chain
      if (!ordered.length) return refuse("Add at least one step after the start")
      sprint.brief = text(get(entry, "relayBrief", get(sprint, "brief", graph.name)), "Workflow objective")
      const budget = get(entry, "relayRetryBudget", get(sprint, "retry_budget", 3))
      if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 0 || budget > 99)
        return refuse("The retry budget must be an integer from 0 to 99")
      sprint.retry_budget = budget
      const previous = new Map(
        (get(sprint, "work_packages", []) as ReadonlyArray<Loose>).map((wp) => [wp.id as string, wp]),
      )
      const grouped = new Map(
        (graph.nodeGroups ?? []).flatMap((group) => group.nodeIds.map((member) => [member, group.id])),
      )
      const phased = Object.hasOwn(graph, "nodeGroups")
      if (phased) {
        const macros = new Map(
          (get(sprint, "macros", []) as ReadonlyArray<Loose>).map((macro) => [macro.id as string, macro]),
        )
        sprint.macros = graph.nodeGroups!.map((group) => ({
          ...structuredClone(macros.get(group.id) ?? {}),
          id: group.id,
          title: group.name,
          instructions: get(group, "description", get(macros.get(group.id) ?? {}, "instructions", "")),
        }))
      }
      const names = get(relay, "names", {}) as Loose
      const controls = new Set<string>()
      const bindings: RelayAuthoring.SkillBinding[] = []
      const workPackages: Loose[] = []
      for (const node of ordered) {
        const kind = node.type.slice("relay.".length)
        if (!node.type.startsWith("relay.") || !Object.hasOwn(KINDS, kind))
          return refuse("This node type has no Relay implementation")
        const params = node.parameters ?? {}
        const retained = previous.get(node.id)
        const wp = structuredClone(retained ?? {})
        const listed = get(params, "checklist", "[]")
        const checks = typeof listed === "string" ? strictJson(listed) : listed
        if (!Array.isArray(checks)) return refuse("Criteria must be a JSON list")
        checks.forEach((item) => {
          if (!isObject(item)) return refuse("A criterion must be a JSON object")
          const id = text(get(item, "id"), "Criterion ID", true)
          if (controls.has(id)) return refuse("Criterion IDs must be unique across the workflow")
          controls.add(id)
          ;["cmd", "judge", "assert"].forEach((field) => {
            if (Object.hasOwn(item, field) && item[field] !== null) text(item[field], field)
          })
        })
        const proposed = get(params, "title", retained ? get(retained, "title", node.name) : node.name)
        // A renamed node renames its WP unless the author also edited the title separately.
        const renamed = node.name !== get(names, node.id, node.name)
        const title = !retained || (renamed && proposed === get(retained, "title", "")) ? node.name : proposed
        Object.assign(wp, {
          id: node.id,
          title: text(title, "Title"),
          kind,
          instructions: text(get(params, "instructions", ""), "Instructions"),
          checklist: structuredClone(checks),
        })
        const macro = phased ? (grouped.get(node.id) ?? "") : get(params, "macro", "")
        if (truthy(macro)) wp.macro = text(macro, "Phase")
        if (!truthy(macro) && (phased || Object.hasOwn(params, "macro"))) delete wp.macro
        const skill = get(params, "skill", "")
        if (typeof skill !== "string") return refuse("Choose at most one skill per step")
        if (skill) {
          if (!skills) return refuse("The skill catalog is unavailable")
          const resolved = yield* skills(skill)
          const mode = get(params, "skillMode", "combine")
          if (mode !== "combine" && mode !== "replace") return refuse("Invalid skill mode")
          wp.instructions = mode === "replace" ? resolved.content : resolved.content + "\n\n" + wp.instructions
          bindings.push({ wp: node.id, skill: resolved.id, sha256: resolved.sha256, mode, content: resolved.content })
        }
        if (kind === "inject")
          Object.assign(wp, {
            text: text(get(params, "text", ""), "Context"),
            file: text(get(params, "file", ""), "Context file"),
          })
        workPackages.push(wp)
      }
      sprint.work_packages = workPackages
      // TS only (PARITY-EXCEPTIONS W7-3): the compiled plan is what the arm loads, so it must be a plan. Decoding is
      // the check only; the plan keeps Python's key order, which a decode would not.
      if (Option.isNone(Schema.decodeUnknownOption(RelaySprint.Sprint)(sprint)))
        return refuse("The retained plan holds fields a Relay sprint cannot carry")
      return { sprint: sprint as unknown as RelaySprint.Sprint, bindings }
    }),
  )

// `project_sprint`: a flat sprint laid out as a chain behind a start node; IDs stay exact.
export const project = (
  name: string,
  sprint: RelaySprint.Sprint,
): Effect.Effect<
  Pick<RelayAuthoring.Document, "name" | "nodes" | "connections" | "nodeGroups" | "tags" | "meta">,
  Refusal
> =>
  refusing(
    Effect.sync(() => {
      const plan = sprint as unknown as Loose
      if (!isObject(plan) || !Array.isArray(plan.work_packages)) return refuse("Invalid sprint")
      const wps = plan.work_packages as ReadonlyArray<Loose>
      const phases = [...new Set(wps.map((wp) => (truthy(wp.macro) ? wp.macro : "")))]
      const counts = new Map<unknown, number>()
      const taken = new Set<string>()
      const nodes = wps.map((wp) => {
        const id = text(wp.id, "WP ID", true)
        const title = truthy(wp.title) ? (wp.title as string) : id
        const nodeName = disambiguate(title, taken, " · " + id)
        taken.add(nodeName)
        const phase = truthy(wp.macro) ? wp.macro : ""
        const phaseIndex = phases.indexOf(phase)
        const memberIndex = counts.get(phase) ?? 0
        counts.set(phase, memberIndex + 1)
        return {
          id,
          name: nodeName,
          type: "relay." + String(get(wp, "kind", "execute")),
          typeVersion: 1,
          position: [240 + (phaseIndex % 2) * 672 + memberIndex * 224, 240 + Math.floor(phaseIndex / 2) * 288] as [
            number,
            number,
          ],
          parameters: {
            title: get(wp, "title", ""),
            macro: truthy(wp.macro) ? wp.macro : "",
            instructions: get(wp, "instructions", ""),
            checklist: dumps(get(wp, "checklist", [])),
            skill: "",
            skillMode: "combine",
            text: get(wp, "text", ""),
            file: get(wp, "file", ""),
          },
        }
      })
      const connections = Object.fromEntries(
        nodes
          .slice(1)
          .map((node, index) => [nodes[index]!.name, { main: [[{ node: node.name, type: "main", index: 0 }]] }]),
      )
      const macros = [...((get(plan, "macros", []) as ReadonlyArray<Loose>) ?? [])]
      const declared = new Set(macros.map((macro) => macro.id))
      wps.forEach((wp) => {
        if (!truthy(wp.macro) || declared.has(wp.macro)) return
        macros.push({ id: wp.macro, instructions: "" })
        declared.add(wp.macro)
      })
      const document = {
        name,
        nodes,
        connections,
        nodeGroups: macros.map((macro) => ({
          id: macro.id,
          name: truthy(macro.title) ? macro.title : macro.id,
          description: get(macro, "instructions", ""),
          nodeIds: wps.filter((wp) => wp.macro === macro.id).map((wp) => wp.id),
        })),
        tags: [],
        meta: {
          relay: {
            schema: 1,
            kind: "workflow",
            sprint: structuredClone(sprint),
            names: Object.fromEntries(nodes.map((node) => [node.id, node.name])),
          },
        },
      }
      // The start node carries the objective and retry budget; it is neither a WP nor a phase member.
      const first = nodes[0]
      const start = first && {
        id: disambiguate("relay-start", new Set(nodes.map((node) => node.id)), "-start"),
        name: disambiguate(START_NAME, taken, " · start"),
        type: RelayAuthoring.StartType,
        typeVersion: 1,
        position: [first.position[0] - 224, first.position[1]] as [number, number],
        parameters: { relayBrief: get(plan, "brief", ""), relayRetryBudget: get(plan, "retry_budget", 3) },
      }
      const projected = start
        ? {
            ...document,
            nodes: [start, ...nodes],
            connections: { ...connections, [start.name]: { main: [[{ node: first.name, type: "main", index: 0 }]] } },
          }
        : document
      validated(projected)
      return projected as unknown as Pick<
        RelayAuthoring.Document,
        "name" | "nodes" | "connections" | "nodeGroups" | "tags" | "meta"
      >
    }),
  )

// `loads`: the strict JSON reader for criteria text, with Python's messages.
export const loads = (text: string): Effect.Effect<unknown, Refusal> => refusing(Effect.sync(() => strictJson(text)))

// Throws a refusal from synchronous checks; only valid inside `refusing`.
export const refuse = (message: string, status = 400, code = "invalid-request"): never => {
  throw new Refusal({ status, code, message })
}

// `string()`: text without NUL, and nonempty when asked.
export const text = (value: unknown, label: string, nonempty = false) => {
  if (typeof value !== "string" || value.includes("\0") || (nonempty && !value))
    return refuse(`${label} must be ${nonempty ? "non-empty " : ""}text without NUL`)
  return value
}

// A thrown `Refusal` becomes the typed failure; every other defect stays a defect.
export const refusing = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.catchDefect((defect) => (defect instanceof Refusal ? Effect.fail(defect) : Effect.die(defect))))

function validated(document: unknown): Graph {
  if (!isObject(document)) return refuse("A document must be a JSON object")
  text(get(document, "name", ""), "Name", true)
  const nodes = get(document, "nodes", [])
  if (!Array.isArray(nodes) || nodes.length > 1000) return refuse("Nodes must be a list of at most 1000 steps")
  const ids = new Set<string>()
  const taken = new Set<string>()
  const names = new Map<string, string>()
  nodes.forEach((node) => {
    if (!isObject(node)) return refuse("Invalid node")
    const id = text(get(node, "id"), "Node ID", true)
    const name = text(get(node, "name"), "Step name", true)
    if (ids.has(id) || taken.has(name)) return refuse("Node IDs and names must be unique")
    ids.add(id)
    taken.add(name)
    names.set(id, name)
    if (!isObject(get(node, "parameters", {}))) return refuse("Invalid node parameters")
    const position = get(node, "position")
    if (
      !Array.isArray(position) ||
      position.length !== 2 ||
      position.some((value) => typeof value !== "number" || !Number.isFinite(value))
    )
      return refuse("Invalid canvas position")
    text(get(node, "type"), "Step type", true)
  })
  const connections = get(document, "connections", {})
  const meta = get(document, "meta", {})
  if (!isObject(connections) || !isObject(meta)) return refuse("Connections and metadata must be objects")
  Object.values(connections).forEach((outputs) => {
    if (!isObject(outputs)) return refuse("Outputs must be an object of connections")
    Object.values(outputs).forEach((channels) => {
      if (!Array.isArray(channels) || channels.some((channel) => !Array.isArray(channel)))
        return refuse("Channels must be lists of connections")
      channels.flat().forEach((edge) => {
        if (!isObject(edge) || !Number.isInteger(get(edge, "index")))
          return refuse("A connection must declare its port")
        text(get(edge, "node"), "Connection target", true)
        text(get(edge, "type"), "Connection type", true)
      })
    })
  })
  const relay = get(meta, "relay", {})
  if (!isObject(relay)) return refuse("Relay metadata must be an object")
  const retained = get(relay, "sprint", {})
  if (
    !isObject(retained) ||
    !Array.isArray(get(retained, "work_packages", [])) ||
    !Array.isArray(get(retained, "macros", []))
  )
    return refuse("The retained sprint must hold lists of steps and phases")
  ;[get(retained, "work_packages", []), get(retained, "macros", [])].forEach((collection) => {
    const seen = new Set<string>()
    ;(collection as ReadonlyArray<unknown>).forEach((item) => {
      if (!isObject(item)) return refuse("Retained steps and phases must be objects")
      const id = text(get(item, "id"), "Retained ID", true)
      if (seen.has(id)) return refuse("Retained IDs must be unique")
      seen.add(id)
    })
  })
  if (!isObject(get(relay, "names", {}))) return refuse("Retained names must be an object")
  const tags = get(document, "tags", [])
  if (!Array.isArray(tags)) return refuse("Scopes must be a list")
  tags.forEach((tag) => text(isObject(tag) ? get(tag, "id") : tag, "Scope ID", true))
  const graph = document as unknown as Graph
  validateGroups(document, graph, ids, names)
  return graph
}

// Each phase must be one contiguous stretch of the chain; Relay macros are flat scopes.
function validateGroups(document: Loose, graph: Graph, ids: Set<string>, names: Map<string, string>) {
  const groups = get(document, "nodeGroups", [])
  if (!Array.isArray(groups)) return refuse("Phases must be a list")
  const grouped = new Set<string>()
  const groupIDs = new Set<string>()
  const edges = Object.entries(graph.connections ?? {}).flatMap(([source, outputs]) =>
    (outputs.main ?? []).flat().map((edge) => [source, edge.node] as const),
  )
  groups.forEach((group) => {
    if (!isObject(group) || !Array.isArray(group.nodeIds)) return refuse("Invalid phase")
    const id = text(get(group, "id"), "Phase ID", true)
    text(get(group, "name"), "Phase name", true)
    if (groupIDs.has(id)) return refuse("Phase IDs must be unique")
    groupIDs.add(id)
    const members = new Set(
      group.nodeIds.map((value: unknown) => {
        const member = text(value, "Grouped step ID", true)
        if (!ids.has(member) || grouped.has(member)) return refuse("A step belongs to at most one existing phase")
        grouped.add(member)
        return names.get(member)!
      }),
    )
    if (Object.hasOwn(group, "description")) text(group.description, "Phase protocol")
    if (!members.size) return
    const inside = edges.filter(([source, target]) => members.has(source) && members.has(target))
    const incoming = (name: string) => inside.filter(([, target]) => target === name).length
    const outgoing = (name: string) => inside.filter(([source]) => source === name).map(([, target]) => target)
    const roots = [...members].filter((name) => !incoming(name))
    const leaves = [...members].filter((name) => !outgoing(name).length)
    const linear =
      roots.length === 1 &&
      leaves.length === 1 &&
      [...members].every((name) => incoming(name) <= 1 && outgoing(name).length <= 1)
    const walk = (cursor: string | undefined, seen: Set<string>): Set<string> =>
      cursor === undefined || seen.has(cursor) ? seen : walk(outgoing(cursor)[0], seen.add(cursor))
    const contiguous =
      linear &&
      walk(roots[0], new Set()).size === members.size &&
      !edges.some(
        ([source, target]) =>
          (!members.has(source) && members.has(target) && target !== roots[0]) ||
          (members.has(source) && !members.has(target) && source !== leaves[0]),
      )
    if (!contiguous)
      return refuse(
        "A phase must be one contiguous stretch of the sequence. Interleaved phases need distinct phase declarations.",
        400,
        "unsupported-macro-topology",
      )
  })
}

// Directed edges, not array order, define the single sequential chain Relay executes.
function orderedChain(graph: Graph, nodes: ReadonlyArray<GraphNode>) {
  const byName = new Map(nodes.map((node) => [node.name, node]))
  const incoming = new Set<string>()
  const successors = new Map<string, string>()
  Object.entries(graph.connections ?? {}).forEach(([source, outputs]) => {
    if (!byName.has(source) || Object.keys(outputs).some((key) => key !== "main"))
      return refuse("Relay does not support this connection")
    const channels = outputs.main ?? []
    if (channels.slice(1).some((channel) => channel.length))
      return refuse("Relay accepts one sequential output per step")
    const edges = channels[0] ?? []
    if (edges.length > 1) return refuse("Remove branches before running the Relay sequence")
    edges.forEach((edge) => {
      if (edge.type !== "main" || edge.index !== 0) return refuse("Invalid port for the Relay sequence")
      if (!byName.has(edge.node) || incoming.has(edge.node))
        return refuse("A connection points to a missing step or to a step with several inputs")
      incoming.add(edge.node)
      successors.set(source, edge.node)
    })
  })
  const roots = [...byName.keys()].filter((name) => !incoming.has(name))
  if (roots.length !== 1) return refuse("Connect every step into one sequence")
  const walk = (current: string | undefined, ordered: GraphNode[]): GraphNode[] => {
    if (current === undefined) return ordered
    if (ordered.some((node) => node.name === current)) return refuse("Relay does not accept cycles between steps")
    return walk(successors.get(current), [...ordered, byName.get(current)!])
  }
  const ordered = walk(roots[0], [])
  if (ordered.length !== nodes.length) return refuse("Some steps are disconnected from the sequence")
  return ordered
}

// CPython's C json scanner with Relay's hooks. A repeated key or a NaN/Infinity constant is refused, and every
// message is Python's, with positions counted in code points as Python counts them. Scanning loops, rather than
// recursing per character or element, so long criteria cannot exhaust the stack; only nesting recurses, as in Python.
function strictJson(source: string): unknown {
  const chars = Array.from(source)
  const fail = (message: string, at: number): never => {
    const before = chars.slice(0, at)
    const line = before.filter((char) => char === "\n").length + 1
    return refuse(`Invalid JSON: ${message}: line ${line} column ${at - before.lastIndexOf("\n")} (char ${at})`)
  }
  const skip = (from: number, accept: (char: string) => boolean) => {
    let at = from
    while (at < chars.length && accept(chars[at]!)) at++
    return at
  }
  const blank = (at: number) => skip(at, (char) => SPACE.has(char))
  const isDigit = (char: string | undefined) => char !== undefined && char >= "0" && char <= "9"
  const digits = (at: number) => skip(at, isDigit)
  const word = (at: number, expected: string) => chars.slice(at, at + expected.length).join("") === expected
  const hex = (from: number, error: number) => {
    const quad = chars.slice(from, from + 4).join("")
    return /^[0-9a-fA-F]{4}$/.test(quad) ? parseInt(quad, 16) : fail("Invalid \\uXXXX escape", error)
  }

  const value = (at: number): [unknown, number] => {
    const char = chars[at]
    if (char === undefined) return fail("Expecting value", at)
    if (char === '"') return string(at + 1)
    if (char === "{") return object(at + 1)
    if (char === "[") return array(at + 1)
    if (char === "n" && word(at, "null")) return [null, at + 4]
    if (char === "t" && word(at, "true")) return [true, at + 4]
    if (char === "f" && word(at, "false")) return [false, at + 5]
    const constant = ["NaN", "Infinity", "-Infinity"].find((name) => name[0] === char && word(at, name))
    if (constant) return refuse(`Invalid JSON: Invalid JSON constant: ${constant}`)
    return number(at)
  }

  const number = (start: number): [unknown, number] => {
    const signed = chars[start] === "-" ? start + 1 : start
    if (signed >= chars.length) return fail("Expecting value", start)
    const lead = chars[signed]!
    const whole = lead >= "1" && lead <= "9" ? digits(signed + 1) : lead === "0" ? signed + 1 : -1
    if (whole < 0) return fail("Expecting value", start)
    const fraction = chars[whole] === "." && isDigit(chars[whole + 1]) ? digits(whole + 2) : whole
    const marked = chars[fraction] === "e" || chars[fraction] === "E"
    const sign = chars[fraction + 1] === "-" || chars[fraction + 1] === "+" ? fraction + 2 : fraction + 1
    // An exponent without digits is not part of the number.
    const end = marked && isDigit(chars[sign]) ? digits(sign) : fraction
    return [Number(chars.slice(start, end).join("")), end]
  }

  const string = (start: number): [string, number] => {
    let out = ""
    let end = start
    while (true) {
      const stop = skip(end, (char) => char !== '"' && char !== "\\" && char > "\u001f")
      if (stop >= chars.length) return fail("Unterminated string starting at", start - 1)
      if (chars[stop]! <= "\u001f") return fail("Invalid control character at", stop)
      out += chars.slice(end, stop).join("")
      if (chars[stop] === '"') return [out, stop + 1]
      if (stop + 1 === chars.length) return fail("Unterminated string starting at", start - 1)
      const escape = chars[stop + 1]!
      if (escape !== "u") {
        const mapped = ESCAPES[escape]
        if (mapped === undefined) return fail("Invalid \\escape", stop)
        out += mapped
        end = stop + 2
        continue
      }
      const after = stop + 6
      if (after >= chars.length) return fail("Invalid \\uXXXX escape", stop + 1)
      const high = hex(stop + 2, stop + 1)
      const paired =
        high >= 0xd800 &&
        high <= 0xdbff &&
        after + 6 < chars.length &&
        chars[after] === "\\" &&
        chars[after + 1] === "u"
      const low = paired ? hex(after + 2, after + 1) : 0
      const joined = low >= 0xdc00 && low <= 0xdfff
      out += String.fromCodePoint(joined ? 0x10000 + ((high - 0xd800) << 10) + (low - 0xdc00) : high)
      end = joined ? after + 6 : after
    }
  }

  // `object_pairs_hook=unique_json` sees the pairs once the object closed and refuses the first repeated key.
  const object = (start: number): [unknown, number] => {
    const pairs: [string, unknown][] = []
    let at = blank(start)
    while (chars[at] !== "}" || pairs.length) {
      if (chars[at] !== '"') return fail("Expecting property name enclosed in double quotes", at)
      const [key, afterKey] = string(at + 1)
      const colon = blank(afterKey)
      if (chars[colon] !== ":") return fail("Expecting ':' delimiter", colon)
      const [item, afterValue] = value(blank(colon + 1))
      pairs.push([key, item])
      at = blank(afterValue)
      if (chars[at] === "}") break
      if (chars[at] !== ",") return fail("Expecting ',' delimiter", at)
      const comma = at
      at = blank(at + 1)
      if (chars[at] === "}") return fail("Illegal trailing comma before end of object", comma)
    }
    const keys = new Set<string>()
    pairs.forEach(([key]) => {
      if (keys.has(key)) return refuse(`Invalid JSON: Duplicate JSON key: ${key}`)
      keys.add(key)
    })
    return [Object.fromEntries(pairs), at + 1]
  }

  const array = (start: number): [unknown, number] => {
    const items: unknown[] = []
    let at = blank(start)
    while (chars[at] !== "]" || items.length) {
      const [item, after] = value(at)
      items.push(item)
      at = blank(after)
      if (chars[at] === "]") break
      if (chars[at] !== ",") return fail("Expecting ',' delimiter", at)
      const comma = at
      at = blank(at + 1)
      if (chars[at] === "]") return fail("Illegal trailing comma before end of array", comma)
    }
    return [items, at + 1]
  }

  if (chars[0] === "\ufeff") return fail("Unexpected UTF-8 BOM (decode using utf-8-sig)", 0)
  const [result, end] = value(blank(0))
  const rest = blank(end)
  if (rest !== chars.length) return fail("Extra data", rest)
  return result
}

// `json.dumps(value, ensure_ascii=False, indent=2)`: the editor's text for a checklist.
function dumps(value: unknown, indent = ""): string {
  if (value === null || value === undefined) return "null"
  if (typeof value === "boolean" || typeof value === "number") return String(value)
  if (typeof value === "string") return quote(value)
  const inner = indent + "  "
  const entries = Array.isArray(value)
    ? value.map((item) => inner + dumps(item, inner))
    : Object.entries(value).map(([key, item]) => `${inner}${quote(key)}: ${dumps(item, inner)}`)
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"]
  return entries.length ? `${open}\n${entries.join(",\n")}\n${indent}${close}` : open + close
}

function quote(value: string) {
  const escaped = value.replace(
    /[\u0000-\u001f\\"]/g,
    (char) => ESCAPED[char] ?? "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"),
  )
  return `"${escaped}"`
}

// Python's `while name in taken: name += suffix`.
function disambiguate(name: string, taken: Set<string>, suffix: string): string {
  return taken.has(name) ? disambiguate(name + suffix, taken, suffix) : name
}

function isObject(value: unknown): value is Loose {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// `dict.get(key, fallback)`: only an own key counts.
function get(object: object, key: string, fallback?: unknown) {
  return Object.hasOwn(object, key) ? (object as Loose)[key] : fallback
}

// Python truthiness for JSON values.
function truthy(value: unknown) {
  if (Array.isArray(value)) return value.length > 0
  if (isObject(value)) return Object.keys(value).length > 0
  return Boolean(value)
}

const SPACE = new Set([" ", "\t", "\n", "\r"])
const ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
}
const ESCAPED: Record<string, string> = {
  "\\": "\\\\",
  '"': '\\"',
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
}
