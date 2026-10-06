import { describe, expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import path from "node:path"
import { Effect } from "effect"
import type { RelayAuthoring } from "@opencode-ai/schema/relay-authoring"
import type { RelaySprint } from "@opencode-ai/schema/relay-sprint"
import { AuthoringGraph } from "../src/authoring/graph"
import { AuthoringHook } from "../src/authoring/hook"
import { AuthoringLint } from "../src/authoring/lint"

// G1 authoring goldens (test/golden/generate/authoring.py): input.json `{op, ...}` and output.json or refusal.json.
// `checksum` and `store` cases belong to the store (WP8, store.test.ts).
const GOLDENS = path.join(import.meta.dir, "golden", "authoring")
const OPS = ["compile", "roundtrip", "project", "hook", "isHook", "validate", "loads", "nodeTypes", "lint"]

interface Input {
  readonly op: string
  readonly document?: unknown
  readonly skills?: Record<string, { id: string; content: string; sha256: string }>
  readonly name?: string
  // Raw oracle JSON; project checks it the way Python does, so a non-sprint is refused, not cast away.
  readonly sprint?: RelaySprint.Sprint
  readonly text?: string
  readonly allowUngated?: boolean
}

const cases = await Promise.all(
  readdirSync(GOLDENS, { withFileTypes: true })
    // Each case is a folder; GENERATOR.json beside them records the generator's tool versions.
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map(async (name) => {
      const dir = path.join(GOLDENS, name)
      const input: Input = await Bun.file(path.join(dir, "input.json")).json()
      const refused = Bun.file(path.join(dir, "refusal.json"))
      const expected = (await refused.exists())
        ? { refusal: await refused.json() }
        : { output: await Bun.file(path.join(dir, "output.json")).json() }
      return { name, input, expected }
    }),
)
const owned = cases.filter((entry) => OPS.includes(entry.input.op))

// What an authoring golden records: the output, or the refusal's status, code and exact message.
function settle<A>(effect: Effect.Effect<A, AuthoringGraph.Refusal>) {
  return Effect.runSync(
    Effect.match(effect, {
      onFailure: (refusal) => ({ refusal: { status: refusal.status, code: refusal.code, message: refusal.message } }),
      onSuccess: (output) => ({ output }),
    }),
  )
}

function run(input: Input) {
  if (input.op === "compile") return settle(AuthoringGraph.compile(input.document, catalog(input.skills)))
  if (input.op === "roundtrip")
    return settle(
      AuthoringGraph.project(input.name!, input.sprint!).pipe(
        Effect.flatMap((document) => AuthoringGraph.compile(document)),
      ),
    )
  if (input.op === "project") return settle(AuthoringGraph.project(input.name!, input.sprint!))
  if (input.op === "hook") return settle(AuthoringHook.compile(input.document))
  if (input.op === "isHook") return { output: AuthoringHook.isHook(input.document) }
  if (input.op === "validate") return settle(AuthoringGraph.validate(input.document).pipe(Effect.as(null)))
  if (input.op === "loads") return settle(AuthoringGraph.loads(input.text!))
  if (input.op === "nodeTypes")
    return { output: { workflow: AuthoringGraph.nodeTypes(), hook: AuthoringHook.nodeTypes() } }
  const findings = AuthoringLint.lint(input.sprint, { allowUngated: input.allowUngated })
  // relay-spec lint exits 1 when any finding is an error.
  return { output: { findings, exit: findings.some((finding) => finding.severity === "error") ? 1 : 0 } }
}

// The generator's catalog: an unknown skill is refused the way Orchestra's catalog refuses it.
function catalog(skills: Input["skills"]): AuthoringGraph.SkillResolver | undefined {
  if (!skills) return undefined
  return (skill) =>
    Object.hasOwn(skills, skill)
      ? Effect.succeed(skills[skill]!)
      : Effect.fail(
          new AuthoringGraph.Refusal({ status: 404, code: "skill-unavailable", message: "Skill unavailable" }),
        )
}

// W7-1: the Python hook catalog plus the additive relay.hook.v1 vocabulary, and nothing else.
function additive(expected: unknown) {
  const catalogs = expected as { workflow: unknown; hook: RelayAuthoring.NodeTypeDescriptor[] }
  const operations = [
    { value: "tool", label: "Any tool" },
    { value: "session-start", label: "Session start" },
    { value: "prompt", label: "Prompt" },
    { value: "session-idle", label: "Session stop" },
  ]
  const hook = catalogs.hook.map((descriptor) => {
    if (descriptor.type === "relay.hookVerify") return { ...descriptor, outputs: ["Pass", "Fail"] }
    if (descriptor.type !== "relay.hookEventTrigger") return descriptor
    return {
      ...descriptor,
      parameters: descriptor.parameters.map((parameter) =>
        parameter.name === "operation" ? { ...parameter, options: [...parameter.options!, ...operations] } : parameter,
      ),
    }
  })
  const allow = {
    type: "relay.hookAllow",
    label: "Allow",
    inputs: 1,
    outputs: ["main"],
    parameters: [{ name: "message", label: "Note", type: "text", default: "" }],
  }
  return { workflow: catalogs.workflow, hook: [...hook, allow] }
}

describe("authoring goldens", () => {
  test("the goldens reach every owned operation and the named acceptance cases", () => {
    expect(owned.length).toBeGreaterThan(150)
    expect(new Set(owned.map((entry) => entry.input.op))).toEqual(new Set(OPS))
    // Only the store's cases are left to WP8.
    expect(new Set(cases.filter((entry) => !owned.includes(entry)).map((entry) => entry.input.op))).toEqual(
      new Set(["checksum", "store"]),
    )
    cases.forEach((entry) =>
      expect([entry.name, "refusal" in entry.expected]).toEqual([entry.name, entry.name.includes("-refused-")]),
    )
    const names = owned.map((entry) => entry.name)
    ;[
      "compile-refused-branch",
      "compile-refused-bare-branch",
      "compile-refused-cycle",
      "compile-refused-bare-cycle",
      "compile-refused-noncontiguous",
      "project-refused-noncontiguous",
      "hook-refused-cycle",
      "hook-refused-after-block",
      "hook-refused-after-approve",
      "node-types",
    ].forEach((name) => expect(names).toContain(name))
  })

  owned.forEach((entry) =>
    test(entry.name, () => {
      const actual = JSON.parse(JSON.stringify(run(entry.input)))
      const expected =
        entry.input.op === "nodeTypes"
          ? { output: additive((entry.expected as { output: unknown }).output) }
          : entry.expected
      expect(actual).toEqual(expected)
      // Python's key order too: a hook's sha256 is taken over its export as compiled.
      expect(JSON.stringify(actual)).toBe(JSON.stringify(expected))
    }),
  )
})

function refusal(message: string) {
  return { refusal: { status: 400, code: "invalid-request", message } }
}

// The hook of relay_authoring's own tests: an edit guard that blocks generated files and records the rest.
function hook() {
  return {
    name: "Protect generated files",
    nodes: [
      node("event", "Before edit", "relay.hookEventTrigger", { operation: "edit", timing: "before" }),
      node("condition", "Generated file?", "relay.hookCondition", { field: "path", pattern: "src/generated/**" }),
      node("block", "Block change", "relay.hookBlock", { message: "Edit the source contract and regenerate." }),
      node("record", "Record", "relay.hookRecord", { message: "File is outside the generated tree." }),
    ],
    connections: {
      "Before edit": { main: [[edge("Generated file?")]] },
      "Generated file?": { main: [[edge("Block change")], [edge("Record")]] },
    } as Record<string, { main: ReturnType<typeof edge>[][] }>,
  }
}

function node(id: string, name: string, type: string, parameters: Record<string, unknown>) {
  return { id, name, type, position: [0, 0], parameters } as Record<string, unknown>
}

function edge(target: string) {
  return { node: target, type: "main", index: 0 }
}

describe("W7-1: the additive relay.hook.v1 vocabulary", () => {
  test("Allow takes a branch and may carry no note", () => {
    const document = hook()
    document.nodes[3] = node("allow", "Allow", "relay.hookAllow", {})
    document.connections["Generated file?"]!.main[1] = [edge("Allow")]
    const result = settle(AuthoringHook.compile(document))
    expect(result).toMatchObject({ output: { schema: "relay.hook.v1", installed: false } })
    const exported = (result as { output: { nodes: ReadonlyArray<{ id: string; parameters: unknown }> } }).output
    expect(exported.nodes.find((item) => item.id === "allow")!.parameters).toEqual({ message: "" })
    // Every other action still needs its message.
    document.nodes[2]!.parameters = {}
    expect(settle(AuthoringHook.compile(document))).toEqual(refusal("Message must be non-empty text without NUL"))
  })

  test("Run gate continues on Pass and on Fail, each port its own edge", () => {
    const document = hook()
    document.nodes[1] = node("gate", "Run gate", "relay.hookVerify", {
      message: "Types must hold.",
      check: "bun typecheck",
    })
    document.nodes[2] = node("remind", "Remind", "relay.hookRemind", { message: "Checked." })
    document.nodes[3] = node("repair", "Repair", "relay.hookRepair", { message: "Fix the types." })
    document.connections = {
      "Before edit": { main: [[edge("Run gate")]] },
      "Run gate": { main: [[edge("Remind")], [edge("Repair")]] },
    }
    expect(settle(AuthoringHook.compile(document))).toMatchObject({
      output: {
        connections: [
          { from: "event", port: 0, to: "gate" },
          { from: "gate", port: 0, to: "remind" },
          { from: "gate", port: 1, to: "repair" },
        ],
      },
    })
    // A third port is still out of range.
    document.connections["Run gate"]!.main.push([])
    expect(settle(AuthoringHook.compile(document))).toEqual(refusal("Invalid output port for this action"))
  })

  test("tool and session triggers accept only their own timings", () => {
    const timed = (operation: string, timing: string, action = "relay.hookRecord") => {
      const document = hook()
      document.nodes[0]!.parameters = { operation, timing }
      document.nodes[2]!.type = action
      return settle(AuthoringHook.compile(document))
    }
    expect(timed("tool", "before")).toHaveProperty("output")
    expect(timed("tool", "after")).toHaveProperty("output")
    expect(timed("session-start", "after")).toHaveProperty("output")
    expect(timed("session-idle", "after")).toHaveProperty("output")
    expect(timed("prompt", "before", "relay.hookBlock")).toHaveProperty("output")
    expect(timed("session-start", "before")).toEqual(refusal("Choose the event operation and timing"))
    expect(timed("prompt", "after")).toEqual(refusal("Choose the event operation and timing"))
    expect(timed("session-idle", "after", "relay.hookBlock")).toEqual(
      refusal("Block and approval need an event before the effect"),
    )
    expect(timed("delete", "before")).toEqual(refusal("Choose the event operation and timing"))
  })

  test("the catalog lists the additions and keeps the Python entries", () => {
    const catalog = new Map(AuthoringHook.nodeTypes().map((descriptor) => [descriptor.type, descriptor]))
    expect(catalog.get("relay.hookVerify")!.outputs).toEqual(["Pass", "Fail"])
    expect(catalog.get("relay.hookAllow")).toMatchObject({ label: "Allow", inputs: 1, outputs: ["main"] })
    expect(catalog.get("relay.hookBlock")!.outputs).toEqual([])
    expect(catalog.get("relay.hookCondition")!.outputs).toEqual(["Yes", "No"])
    const operations = catalog.get("relay.hookEventTrigger")!.parameters.find((item) => item.name === "operation")!
    expect(operations.options!.map((option) => option.value)).toEqual([
      "read",
      "edit",
      "write",
      "command",
      "tool",
      "session-start",
      "prompt",
      "session-idle",
    ])
  })
})

describe("W7-2: the export is relay.hook.v1 exactly", () => {
  test("a field the schema does not define is refused, not exported", () => {
    const extraKey = hook()
    extraKey.nodes[3] = { ...extraKey.nodes[3], notes: "kept by an editor" }
    const extraParameter = hook()
    extraParameter.nodes[2]!.parameters = { message: "Blocked.", check: "left over" }
    const message = "The hook holds fields that relay.hook.v1 does not define"
    expect(settle(AuthoringHook.compile(extraKey))).toEqual(refusal(message))
    expect(settle(AuthoringHook.compile(extraParameter))).toEqual(refusal(message))
    // The authored key order is kept: install hashes the export as compiled.
    const exported = settle(AuthoringHook.compile(hook())) as { output: { nodes: ReadonlyArray<object> } }
    expect(Object.keys(exported.output)).toEqual(["schema", "name", "nodes", "connections", "binding", "installed"])
    expect(Object.keys(exported.output.nodes[0]!)).toEqual(["id", "name", "type", "position", "parameters"])
  })
})

describe("W7-3: the compiled plan is a Relay sprint", () => {
  test("a retained field the sprint schema refuses is refused at compile", async () => {
    const sprint = { work_packages: [{ id: "a", title: "A", checklist: [{ id: "c", cmd: "test -s out" }] }] }
    const projected = await Effect.runPromise(AuthoringGraph.project("Plan", sprint))
    expect(settle(AuthoringGraph.compile(projected))).toHaveProperty("output")
    const retained = projected.meta.relay!.sprint!.work_packages[0] as Record<string, unknown>
    retained.self_check = "not a list"
    expect(settle(AuthoringGraph.compile(projected))).toEqual(
      refusal("The retained plan holds fields a Relay sprint cannot carry"),
    )
  })
})

describe("W7-4: lint names a WP by text", () => {
  test("a WP ID that is not text is reported by its Python str()", () => {
    const findings = AuthoringLint.lint({ work_packages: [{ id: 5, checklist: [] }, { checklist: [] }] })
    expect(findings.map((finding) => finding.wp)).toEqual(["5", "?"])
    expect(findings.map((finding) => finding.category)).toEqual(["ungated", "ungated"])
  })
})
