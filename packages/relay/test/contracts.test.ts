import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { RelayLedger } from "@orchestra/schema/relay-ledger"
import { RelaySprint } from "@orchestra/schema/relay-sprint"

// The frozen WP0 contracts decode what the Python Relay actually wrote. Exact shape is proven with
// `onExcessProperty: "error"` wherever the schema does not pin its own option.
const root = path.join(import.meta.dir, "..")
const exact = { onExcessProperty: "error" } as const

const ARM_EVENTS = new Set<string>(RelayLedger.ArmEvent.literals)

// Every Python-written line routes to exactly one line schema: its event, and for dispositions whether it is the arm's
// or the CLI's envelope.
function lineSchema(line: Record<string, unknown>) {
  if (line.event === "checklist-item") return RelayLedger.ChecklistItemLine
  if (line.event === "regression-item") return RelayLedger.RegressionItemLine
  if (typeof line.event === "string" && ARM_EVENTS.has(line.event))
    return "arm" in line ? RelayLedger.ArmEnvelopeLine : RelayLedger.GateEnvelopeLine
  throw new Error(`no fixture route for event ${String(line.event)}`)
}

async function fixtureLines() {
  const dir = path.join(root, "test/fixtures")
  const files = [...new Bun.Glob("*.ledger.jsonl").scanSync(dir)].sort()
  const lines = await Promise.all(
    files.map(async (file) =>
      (await Bun.file(path.join(dir, file)).text())
        .split("\n")
        .filter((text) => text.trim())
        .map((text) => ({ file, value: JSON.parse(text) as Record<string, unknown> })),
    ),
  )
  return { files, lines: lines.flat() }
}

describe("sprint", () => {
  test("decodes the SPEC §2 example sprint", async () => {
    const spec = await Bun.file(path.join(root, "SPEC.md")).text()
    const section = spec.slice(spec.indexOf("### Concrete ARM-compatible sprint"))
    const block = section.match(/```json\r?\n([\s\S]*?)\r?\n```/)
    expect(block).not.toBeNull()
    const sprint = Schema.decodeUnknownSync(RelaySprint.Sprint)(JSON.parse(block![1]!))
    expect(sprint.work_packages.map((wp) => wp.id)).toEqual(["write-result", "write-summary"])
    expect(sprint.work_packages[1]!.checklist![1]!.context).toEqual(["SUMMARY.md", "result.json"])
    expect(sprint.macros![0]!.id).toBe("build")
  })

  test("decodes every shipped profile", async () => {
    const files = [...new Bun.Glob("*.sprint.json").scanSync(path.join(root, "profiles"))].sort()
    expect(files.length).toBe(6)
    const sprints = await Promise.all(files.map((file) => Bun.file(path.join(root, "profiles", file)).json()))
    sprints.forEach((value) =>
      expect(Schema.decodeUnknownSync(RelaySprint.Sprint)(value).work_packages.length).toBeGreaterThan(0),
    )
  })

  test("keeps fields the runtime ignores and rejects what it cannot run", () => {
    const decode = Schema.decodeUnknownSync(RelaySprint.Sprint)
    const sprint = decode(
      { work_packages: [{ id: "a", model: "x", checklist: [{ id: "c", cmd: "true", type: "shell" }] }] },
      exact,
    )
    expect(sprint.work_packages[0]).toMatchObject({ model: "x" })
    expect(sprint.work_packages[0]!.checklist![0]).toMatchObject({ type: "shell" })
    expect(() => decode({ work_packages: [{ id: "" }] })).toThrow()
    expect(() => decode({ work_packages: [{ id: "a\u0000b" }] })).toThrow()
    expect(() => decode({ work_packages: [{ id: "a", kind: "loop" }] })).toThrow()
    expect(() => decode({ work_packages: [{ id: "a", checklist: [{ id: "c", host_check: "-bad" }] }] })).toThrow()
  })
})

describe("ledger", () => {
  test("decodes every line of every fixture with its exact line schema", async () => {
    const fixtures = await fixtureLines()
    expect(fixtures.files.length).toBe(15)
    fixtures.lines.forEach((line) => {
      const decoded = Schema.decodeUnknownSync(lineSchema(line.value))(line.value, exact)
      expect(Object.keys(decoded)).toEqual(Object.keys(line.value))
      expect(Schema.decodeUnknownSync(RelayLedger.Entry)(line.value, exact)).toEqual(decoded)
    })
    const kinds = new Set(fixtures.lines.map((line) => `${line.value.event}${"arm" in line.value ? "" : " (cli)"}`))
    expect([...kinds].sort()).toEqual([
      "advance-reveal",
      "advance-reveal (cli)",
      "checklist-item",
      "checklist-item (cli)",
      "compaction-hint",
      "gate-fail",
      "gate-fail (cli)",
      "gate-fail-repeat",
      "regression-item",
      "regression-item (cli)",
      "sprint-complete",
      "sprint-complete (cli)",
    ])
  })

  test("refuses a fixture line with an unknown field or a missing chain suffix", async () => {
    const line = (await fixtureLines()).lines.find((entry) => entry.value.event === "checklist-item")!.value
    expect(() => Schema.decodeUnknownSync(RelayLedger.Entry)({ ...line, extra: 1 }, exact)).toThrow()
    const unsealed = Object.fromEntries(Object.entries(line).filter((entry) => entry[0] !== "h"))
    expect(() => Schema.decodeUnknownSync(RelayLedger.Entry)(unsealed, exact)).toThrow()
  })

  // The fixtures hold seven event kinds. The other Python kinds are written only at runtime, so their lines are built
  // here from the jq templates in bin/relay-arm-hook.sh; G1/G2 replace them with generated goldens.
  test("decodes the arm's other record kinds as their jq templates write them", () => {
    const seal = { gen: 0, prev: "GENESIS", seq: 0, mac: "sha256", h: "a".repeat(64) }
    const sha = "b".repeat(64)
    const lines = [
      { ts: 1, arm: "t", event: "cap-risk", cap: 3, chain_min: 5, work_packages: 4 },
      { ts: 1, arm: "t", wp: "w", event: "human-release", reason: "owner: fixed the fixture" },
      { ts: 1, arm: "t", wp: "w", event: "unknown-kind", kind: "human" },
      { ts: 1, arm: "t", wp: "w", event: "inject", file: "(inline)", sha },
      { ts: 1, arm: "t", wp: "w", event: "inject-missing", file: "" },
      {
        ts: 1,
        arm: "t",
        wp: "w",
        event: "blocked-claim",
        reason: "no network",
        sha,
        honored: true,
        corroborated: "unavailable",
        graded_by: "judge:unavailable",
      },
      { ts: 1, arm: "t", wp: "?", i: -1, event: "position-lost", retry: 0, fails: "", reg: "", round: "", repeat: 0 },
    ]
    lines.forEach((body) => {
      const decoded = Schema.decodeUnknownSync(RelayLedger.Entry)({ ...body, ...seal }, exact)
      expect(decoded.event).toBe(body.event as typeof decoded.event)
    })
  })
})

describe("hook", () => {
  const v1 = {
    schema: "relay.hook.v1",
    name: "Protect generated files",
    nodes: [
      {
        id: "t",
        name: "Before edit file",
        type: "relay.hookEventTrigger",
        position: [0, 0],
        parameters: { operation: "edit", timing: "before" },
      },
      {
        id: "c",
        name: "Path matches",
        type: "relay.hookCondition",
        position: [1, 0],
        parameters: { field: "path", pattern: "src/generated/**" },
      },
      {
        id: "b",
        name: "Block change",
        type: "relay.hookBlock",
        position: [2, 0],
        parameters: { message: "Regenerate instead." },
      },
      { id: "a", name: "Allow", type: "relay.hookAllow", position: [2, 1], parameters: { message: "" } },
    ],
    connections: [
      { from: "t", port: 0, to: "c" },
      { from: "c", port: 0, to: "b" },
      { from: "c", port: 1, to: "a" },
    ],
    binding: "host-required",
    installed: false,
  }

  test("decodes an export with Allow and a session trigger, strictly", () => {
    const decode = Schema.decodeUnknownSync(RelayHook.V1)
    expect(decode(v1).nodes.length).toBe(4)
    const idle = {
      ...v1,
      nodes: [
        {
          ...v1.nodes[0],
          name: "On session stop",
          parameters: { operation: "session-idle", timing: "after" },
        },
        {
          id: "g",
          name: "Run gate",
          type: "relay.hookVerify",
          position: [1, 0],
          parameters: { message: "Type errors must be fixed.", check: "bun typecheck" },
        },
      ],
      connections: [{ from: "t", port: 0, to: "g" }],
    }
    expect(decode(idle).nodes[1]!.type).toBe("relay.hookVerify")
    expect(() => decode({ ...v1, extra: true })).toThrow()
    expect(() =>
      decode({ ...idle, nodes: [{ ...idle.nodes[0], parameters: { operation: "session-idle", timing: "before" } }] }),
    ).toThrow()
    expect(() => decode({ ...v1, nodes: [{ ...v1.nodes[2], parameters: { message: "x", check: "true" } }] })).toThrow()
    expect(RelayHook.Outputs["relay.hookVerify"]).toEqual(["Pass", "Fail"])
  })

  test("decodes the installs file strictly", () => {
    const install = {
      installID: "h-1",
      document: "doc",
      version: "v",
      sha256: "c".repeat(64),
      order: 0,
      enabled: true,
      installedBy: "owner",
      installedAt: 1,
      snapshot: v1,
    }
    expect(Schema.decodeUnknownSync(RelayHook.Installs)({ installs: [install] }).installs.length).toBe(1)
    expect(() => Schema.decodeUnknownSync(RelayHook.Installs)({ installs: [{ ...install, note: "" }] })).toThrow()
  })
})

describe("arm", () => {
  test("tokens cannot escape the arms directory", () => {
    const valid = Schema.is(RelayArm.Token)
    expect(["run-1", "arm-0f.a_b"].every(valid)).toBe(true)
    expect([".", "..", "a..b", "a/b", ""].some(valid)).toBe(false)
  })

  test("the parked HOLD code is typed beside the existing ones", () => {
    expect(RelayArm.CompletionHold.literals).toContain("completion-parked-awaiting-owner")
    expect(RelayArm.CompletionHold.literals).toContain("completion-checks-not-passing")
  })
})
