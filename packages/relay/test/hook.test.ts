import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { HookEvaluate } from "../src/hook/evaluate"

// WP9: pure hook evaluation. Every install is decoded through the frozen `RelayHook.Install` schema, so the graphs here
// are real snapshots; graph rules the schema leaves to the install writer (fan-out, cycles) are exercised as crafted
// input that must still terminate.

const decodeInstall = Schema.decodeUnknownSync(RelayHook.Install)

// `trigger` is `<operation>.<timing>`; `edges` is space-separated `from>to` (port 0) or `from:port>to`.
function install(
  installID: string,
  trigger: string,
  nodes: Record<string, { type: string; parameters: Record<string, string> }>,
  edges: string,
  record: { order?: number; enabled?: boolean } = {},
) {
  const [operation, timing] = trigger.split(".")
  return decodeInstall({
    installID,
    document: `doc-${installID}`,
    version: "v1",
    sha256: "0".repeat(64),
    order: record.order ?? 0,
    enabled: record.enabled ?? true,
    installedBy: "owner",
    installedAt: 0,
    snapshot: {
      schema: "relay.hook.v1",
      name: installID,
      nodes: [
        {
          id: "t",
          name: "Trigger",
          type: RelayHook.NodeType.trigger,
          position: [0, 0],
          parameters: { operation, timing },
        },
        ...Object.entries(nodes).map(([id, node]) => ({ id, name: id, position: [0, 0], ...node })),
      ],
      connections: edges
        .split(" ")
        .filter(Boolean)
        .map((edge) => {
          const [from, to] = edge.split(">")
          const [source, port] = from!.split(":")
          return { from: source, port: Number(port ?? 0), to }
        }),
      binding: "host-required",
      installed: false,
    },
  })
}

const when = (field: string, pattern: string) => ({
  type: RelayHook.NodeType.condition,
  parameters: { field, pattern },
})
const remind = (message: string) => ({ type: RelayHook.NodeType.remind, parameters: { message } })
const block = (message: string) => ({ type: RelayHook.NodeType.block, parameters: { message } })
const approve = (message: string) => ({ type: RelayHook.NodeType.approve, parameters: { message } })
const repair = (message: string) => ({ type: RelayHook.NodeType.repair, parameters: { message } })
const record = (message: string) => ({ type: RelayHook.NodeType.record, parameters: { message } })
const allow = (message = "") => ({ type: RelayHook.NodeType.allow, parameters: { message } })
const verify = (message: string, check: string) => ({ type: RelayHook.NodeType.verify, parameters: { message, check } })

const call = (key: string, rest: Partial<HookEvaluate.Invocation> = {}): HookEvaluate.Invocation => {
  const [operation, timing] = key.split(".") as [RelayHook.Operation, RelayHook.Timing]
  return { operation, timing, paths: [], ...rest }
}

// `<installID>:<nodeID>` per top-level step, in plan order.
const trace = (steps: ReadonlyArray<HookEvaluate.Step>) => steps.map((step) => `${step.installID}:${step.nodeID}`)
const fired = (installs: ReadonlyArray<RelayHook.Install>, invocation: HookEvaluate.Invocation) =>
  trace(HookEvaluate.plan(installs, invocation))

const TIMINGS = RelayHook.Timing.literals
const TOOL_OPERATIONS: ReadonlyArray<string> = RelayHook.ToolOperation.literals

describe("triggers", () => {
  // Every trigger the schema accepts, one install each, in this order.
  const TRIGGERS = [
    ...TOOL_OPERATIONS.flatMap((operation) => TIMINGS.map((timing) => `${operation}.${timing}`)),
    "session-start.after",
    "prompt.before",
    "session-idle.after",
  ]
  const installs = TRIGGERS.map((key, order) => install(key, key, { r: record(key) }, "t>r", { order }))

  test("fire per operation and timing", () => {
    const FIRES: Record<string, ReadonlyArray<string>> = {
      "read.before": ["read.before", "tool.before"],
      "read.after": ["read.after", "tool.after"],
      "edit.before": ["edit.before", "tool.before"],
      "edit.after": ["edit.after", "tool.after"],
      "write.before": ["write.before", "tool.before"],
      "write.after": ["write.after", "tool.after"],
      "command.before": ["command.before", "tool.before"],
      "command.after": ["command.after", "tool.after"],
      "tool.before": ["tool.before"],
      "tool.after": ["tool.after"],
      "session-start.before": [],
      "session-start.after": ["session-start.after"],
      "prompt.before": ["prompt.before"],
      "prompt.after": [],
      "session-idle.before": [],
      "session-idle.after": ["session-idle.after"],
    }
    // The table is exhaustive over the schema's operations and timings.
    const operations = [...TOOL_OPERATIONS, "session-start", "prompt", "session-idle"]
    expect(Object.keys(FIRES).sort()).toEqual(
      operations.flatMap((operation) => TIMINGS.map((timing) => `${operation}.${timing}`)).sort(),
    )
    expect(installs.length).toBe(13)
    Object.entries(FIRES).forEach(([key, expected]) => {
      const tool = TOOL_OPERATIONS.includes(key.split(".")[0]!) ? "some-tool" : undefined
      const messages = HookEvaluate.plan(installs, call(key, { tool })).map((step) => step.message)
      expect({ key, messages }).toEqual({ key, messages: [...expected] })
    })
  })

  test("each action node becomes one step at either timing", () => {
    const ACTIONS = [
      [remind("m"), "remind"],
      [block("m"), "block"],
      [approve("m"), "approve"],
      [verify("m", "true"), "verify"],
      [repair("m"), "repair"],
      [record("m"), "record"],
      [allow("m"), "allow"],
    ] as const
    // Block and Approve on `after` are refused by the install writer, not here: the plan still reports them.
    TIMINGS.forEach((timing) =>
      ACTIONS.forEach(([node, action]) =>
        expect(
          HookEvaluate.plan([install("h", `edit.${timing}`, { a: node }, "t>a")], call(`edit.${timing}`)),
        ).toStrictEqual([
          { installID: "h", nodeID: "a", action, message: "m", ...(action === "verify" ? { check: "true" } : {}) },
        ]),
      ),
    )
    expect(HookEvaluate.plan([install("h", "edit.before", { a: allow() }, "t>a")], call("edit.before"))).toStrictEqual([
      { installID: "h", nodeID: "a", action: "allow", message: "" },
    ])
  })

  test("a trigger with nothing connected fires nothing", () => {
    expect(fired([install("h", "edit.before", { a: remind("x") }, "")], call("edit.before"))).toEqual([])
  })
})

describe("graph walk", () => {
  // "No generated edits" from the spec (H2 example) with Allow on No, as the approved mock draws it.
  const generated = install(
    "gen",
    "edit.before",
    { c: when("path", "packages/sdk/js/src/generated/**"), b: block("Regenerate with build.ts"), a: allow() },
    "t>c c>b c:1>a",
  )

  test("a condition takes Yes (port 0) when it matches and No (port 1) when it does not", () => {
    const edit = (path: string) => call("edit.before", { tool: "edit", paths: [path] })
    expect(HookEvaluate.plan([generated], edit("packages/sdk/js/src/generated/types.gen.ts"))).toStrictEqual([
      { installID: "gen", nodeID: "b", action: "block", message: "Regenerate with build.ts" },
    ])
    expect(HookEvaluate.plan([generated], edit("packages/sdk/js/src/index.ts"))).toStrictEqual([
      { installID: "gen", nodeID: "a", action: "allow", message: "" },
    ])
  })

  test("an unconnected port ends the branch", () => {
    const yesOnly = install("y", "edit.before", { c: when("path", "src/**"), r: remind("src") }, "t>c c>r")
    expect(fired([yesOnly], call("edit.before", { paths: ["src/a.ts"] }))).toEqual(["y:r"])
    expect(fired([yesOnly], call("edit.before", { paths: ["lib/a.ts"] }))).toEqual([])
  })

  test("nested conditions walk a single path", () => {
    const nested = install(
      "n",
      "tool.before",
      { c1: when("tool", "*edit"), c2: when("path", "**/*.ts"), ts: remind("ts"), md: remind("md"), rest: record("r") },
      "t>c1 c1>c2 c1:1>rest c2>ts c2:1>md",
    )
    expect(fired([nested], call("edit.before", { tool: "multiedit", paths: ["a/b.ts"] }))).toEqual(["n:ts"])
    expect(fired([nested], call("edit.before", { tool: "edit", paths: ["a/b.md"] }))).toEqual(["n:md"])
    expect(fired([nested], call("read.before", { tool: "read", paths: ["a/b.ts"] }))).toEqual(["n:rest"])
  })

  test("actions run in edge order, whatever the node order", () => {
    const chain = install(
      "c",
      "command.after",
      { z: record("third"), y: repair("second"), x: remind("first") },
      "y>z t>x x>y",
    )
    const steps = HookEvaluate.plan([chain], call("command.after", { tool: "bash", command: "ls" }))
    expect(steps.map((step) => step.message)).toEqual(["first", "second", "third"])
  })

  test("crafted fan-out is walked depth-first in connection order", () => {
    const fan = install("f", "edit.before", { a: remind("a"), a2: remind("a2"), b: record("b") }, "t>a t>b a>a2")
    expect(fired([fan], call("edit.before"))).toEqual(["f:a", "f:a2", "f:b"])
  })

  test("a Verify continues on Pass and nests its Fail branch", () => {
    const gate = install(
      "g",
      "edit.after",
      { v: verify("Types must check.", "bun typecheck"), k: record("ok"), k2: remind("then"), r: repair("Fix.") },
      "t>v v>k k>k2 v:1>r",
    )
    expect(HookEvaluate.plan([gate], call("edit.after"))).toStrictEqual([
      {
        installID: "g",
        nodeID: "v",
        action: "verify",
        message: "Types must check.",
        check: "bun typecheck",
        onFail: [{ installID: "g", nodeID: "r", action: "repair", message: "Fix." }],
      },
      { installID: "g", nodeID: "k", action: "record", message: "ok" },
      { installID: "g", nodeID: "k2", action: "remind", message: "then" },
    ])
  })

  test("an unconnected Fail has no onFail; a connected Fail that fires nothing has an empty one", () => {
    const [unconnected] = HookEvaluate.plan(
      [install("p", "edit.before", { v: verify("m", "true") }, "t>v")],
      call("edit.before"),
    )
    expect(unconnected).toBeDefined()
    expect("onFail" in unconnected!).toBe(false)

    const routed = install(
      "q",
      "edit.before",
      { v: verify("m", "true"), c: when("path", "src/**"), b: block("src must pass") },
      "t>v v:1>c c>b",
    )
    expect(HookEvaluate.plan([routed], call("edit.before", { paths: ["lib/a.ts"] }))[0]!.onFail).toEqual([])
    expect(trace(HookEvaluate.plan([routed], call("edit.before", { paths: ["src/a.ts"] }))[0]!.onFail!)).toEqual([
      "q:b",
    ])
  })

  test("Fail branches nest", () => {
    const twice = install(
      "n",
      "write.before",
      {
        v1: verify("lint", "bun lint"),
        v2: verify("format", "bun fmt"),
        b: block("both failed"),
        a: allow("format ok"),
      },
      "t>v1 v1:1>v2 v2:1>b v2>a",
    )
    const [first] = HookEvaluate.plan([twice], call("write.before"))
    expect(first!.nodeID).toBe("v1")
    expect(first!.onFail!.map((step) => [step.nodeID, trace(step.onFail ?? [])])).toEqual([
      ["v2", ["n:b"]],
      ["a", []],
    ])
  })

  test("Block has no outputs", () => {
    expect(
      fired([install("b", "edit.before", { b: block("no"), r: remind("never") }, "t>b b>r")], call("edit.before")),
    ).toEqual(["b:b"])
  })

  test("snapshots the install writer refuses still terminate", () => {
    // A cycle, a dangling target, an edge into the trigger, and out-of-range ports on a Remind and a Condition.
    const crafted = install(
      "x",
      "edit.before",
      { r1: remind("r1"), r2: remind("r2"), c: when("path", "**"), r3: remind("r3") },
      "t>r1 r1>r2 r2>r1 r2>missing r2>t r1:1>r3 r2>c c:2>r3",
    )
    expect(fired([crafted], call("edit.before", { paths: ["a"] }))).toEqual(["x:r1", "x:r2"])
  })
})

describe("installs", () => {
  test("enabled installs run in install order, ties in file order", () => {
    const hook = (id: string, order: number, enabled = true) =>
      install(id, "read.before", { r: record(id) }, "t>r", { order, enabled })
    const installs = [hook("c", 2), hook("a1", 0), hook("off", 1, false), hook("b", 1), hook("a2", 0)]
    expect(fired(installs, call("read.before"))).toEqual(["a1:r", "a2:r", "b:r", "c:r"])
  })

  test("the plan is pure: frozen input, same answer every time", () => {
    const deepFreeze = <T>(value: T): T => {
      if (value && typeof value === "object") Object.values(value).forEach(deepFreeze)
      return Object.freeze(value)
    }
    const installs = deepFreeze([
      install("b", "edit.before", { c: when("path", "src/**"), b: block("x"), a: allow() }, "t>c c>b c:1>a", {
        order: 1,
      }),
      install("a", "tool.before", { v: verify("m", "true"), r: repair("r") }, "t>v v:1>r"),
    ])
    const invocation = deepFreeze(call("edit.before", { tool: "edit", paths: ["src/a.ts"] }))
    const first = HookEvaluate.plan(installs, invocation)
    expect(trace(first)).toEqual(["a:v", "b:b"])
    expect(HookEvaluate.plan(installs, invocation)).toStrictEqual(first)
  })
})

describe("apply_patch", () => {
  const generated = install(
    "gen",
    "edit.before",
    { c: when("path", "src/generated/**"), b: block("generated"), a: allow() },
    "t>c c>b c:1>a",
  )

  test("matches if any of its paths matches", () => {
    const patch = (...paths: ReadonlyArray<string>) => call("edit.before", { tool: "apply_patch", paths })
    expect(fired([generated], patch("README.md", "src/generated/types.gen.ts"))).toEqual(["gen:b"])
    expect(fired([generated], patch("src/generated/types.gen.ts", "README.md"))).toEqual(["gen:b"])
    expect(fired([generated], patch("README.md", "src/app.ts"))).toEqual(["gen:a"])
  })

  test("a patch that edits and adds: each operation sees its own paths, a tool trigger sees all, each install once", () => {
    const added = install("add", "write.before", { c: when("path", "src/generated/**"), b: block("new") }, "t>c c>b", {
      order: 1,
    })
    const any = install(
      "any",
      "tool.before",
      { c: when("event", "write.*"), r: remind("adds"), p: when("path", "src/generated/**"), k: record("generated") },
      "t>c c>r r>p p>k",
      { order: 2 },
    )
    const installs = [generated, added, any]
    const edit = { tool: "apply_patch", paths: ["src/app.ts"] }
    // The edit hook sees only src/app.ts, so it allows; the write hook sees the added file and blocks.
    expect(
      fired(installs, call("edit.before", { ...edit, also: [{ operation: "write", paths: ["src/generated/n.ts"] }] })),
    ).toEqual(["gen:a", "add:b", "any:r", "any:k"])
    // Without the added file, the write and event branches stay silent.
    expect(fired(installs, call("edit.before", edit))).toEqual(["gen:a"])
  })
})

describe("patterns", () => {
  test("path globs: ** crosses directories, * and ? stay inside one", () => {
    const ROWS = [
      ["src/generated/**", "src/generated/types.gen.ts", true],
      ["src/generated/**", "src/generated/a/b/c.ts", true],
      ["src/generated/**", "src/generatedX/a.ts", false],
      ["src/generated/**", "lib/src/generated/a.ts", false],
      ["**/*.gen.ts", "types.gen.ts", true],
      ["**/*.gen.ts", "a/b/types.gen.ts", true],
      ["src/**/a.ts", "src/a.ts", true],
      ["src/**/a.ts", "src/x/y/a.ts", true],
      ["src/*.ts", "src/a.ts", true],
      ["src/*.ts", "src/sub/a.ts", false],
      ["src/?.ts", "src/a.ts", true],
      ["src/?.ts", "src/ab.ts", false],
      ["**/*.{ts,tsx}", "app/view.tsx", true],
      ["**", ".env", true],
      ["src/*", "src/.env", true],
      ["src/a.ts", "src/a.ts", true],
      ["src/a.ts", "src/a.tsx", false],
      ["SRC/**", "src/a.ts", false],
    ] as const
    expect(ROWS.map(([pattern, value]) => [pattern, value, HookEvaluate.matches("path", pattern, value)])).toEqual(
      ROWS.map((row) => [...row]),
    )
  })

  test("path globs agree with Bun's own matcher, which HookGlob ports for Node", () => {
    // Each hand-picked row separates a HookGlob mutant the seeded rows missed; the seeded rows mix the same syntax.
    const nest = (depth: number) => "{".repeat(depth) + "a" + "}".repeat(depth)
    const curated: ReadonlyArray<readonly [string, string]> = [
      ...[9, 10, 11].map((depth) => [nest(depth), "a"] as const),
      ["{a,{b,{c,d}}}", "d"],
      ["{a\\,b,c}", "a,b"],
      ["{a\\,b}", "b"],
      ["{a\\}b,c}", "a}b"],
      ["{a,b\\}}", "a}"],
      ["src/{**/a,b}", "src/x/y/a"],
      ["src/{a,**/b}", "src/x/y/b"],
      ["[^.]", "a"],
      ["[^a]", "a"],
      ["[!a]", "b"],
      ["[a-c]", "b"],
      ["[z-a]", "b"],
      ["[é-ü]", "ö"],
      ["[😀-😂]", "😁"],
      ["[\\b]", "\b"],
      ["[\\]]", "]"],
      ["[\\é]", "é"],
      ["\\é", "é"],
      ["\\b", "\b"],
      ["\\n", "\n"],
      ["\\a", "a"],
      ["\\*", "*"],
      ["\\*", "a"],
      ["a\\\\b", "a\\b"],
      ["a/*", "a\\b"],
      ["a/b", "a\\b"],
      ["?", "é"],
      ["??", "é"],
      ["?", "\ud800"],
      ["é*", "éa"],
      ["**", ".env"],
      ["src/*", "src/.env"],
      ["*.{ts,tsx}", "a.tsx"],
      ["!src/**", "lib/a"],
      ["!!src/**", "src/a"],
      ["!", ""],
      ["!a", ""],
      ["[", "a"],
      ["[a", "a"],
      ["a\\", "a"],
      ["!a\\", "b"],
      ["a/**/*", "a"],
      ["**/", "a/"],
      ["**/", "aa"],
      ["a/**", "a"],
      ["a/**", "a/"],
      ["**/a", "a"],
      ["a**b", "axb"],
      ["a**b", "ax/b"],
      ["**a", "x/a"],
      ["a/**/**/b", "a/b"],
      ["a/**/**", "a/x/y"],
      ["**/**", "a"],
      ["****/**", ""],
    ]
    const ATOMS = ["src", "a", "b", "**", "*", "?", "a?", "*.ts", "*.{ts,tsx}", "{a,b}", "{a,{b,{c,d}}}", "{**/a,b}"]
    const MORE = ["[a-c]", "[!a]*", "[^.]", "[\\]a]", "[é-ü]", "[z-a]", "\\*", "\\b", "\\n", "\\a", ".env", "é*"]
    const ODD = ["x{y,{z,w}}", "", "!", "{", "}", ",", "[", "\\"]
    const NAMES = ["src", "a", "b", "c", "d", "x", "y", "z", "w", "a.ts", "b.tsx", ".env", "*", "é", "ü", "\b", "\n"]
    const atoms = [...ATOMS, ...MORE, ...ODD]
    const names = [...NAMES, "]", "ab", "", "a\\b"]
    const random = seeded(20261006)
    const some = (list: ReadonlyArray<string>, separator: string) =>
      Array.from({ length: 1 + random(4) }, () => list[random(list.length)]!).join(separator)
    const generated = Array.from(
      { length: 20_000 },
      () => [["", "", "", "!", "!!"][random(5)]! + some(atoms, random(4) === 0 ? "" : "/"), some(names, "/")] as const,
    )
    const rows = [...curated, ...generated]
    const differ = rows.filter(
      ([pattern, value]) => HookEvaluate.matches("path", pattern, value) !== new Bun.Glob(pattern).match(value),
    )
    expect(differ).toEqual([])
    // Both outcomes are well represented, so agreement is not two matchers that always say no.
    const matched = rows.filter(([pattern, value]) => new Bun.Glob(pattern).match(value)).length
    expect(matched).toBeGreaterThan(rows.length / 10)
    expect(matched).toBeLessThan(rows.length / 2)
  })

  test("tool, command and event use Orchestra's Wildcard", () => {
    const ROWS = [
      ["command", "git push*", "git push origin dev", true],
      ["command", "git push*", "git pushx", true],
      ["command", "git push *", "git push", true],
      ["command", "git push *", "git push --force", true],
      ["command", "git push *", "git pushx", false],
      ["command", "rm -rf *", "rm -rf /tmp/x", true],
      ["command", "*rm -rf*", "cd a && rm -rf b", true],
      ["command", "rm -rf *", "cd a && rm -rf b", false],
      ["command", "echo ?", "echo a", true],
      ["command", "echo ?", "echo ab", false],
      ["command", "a.b", "a.b", true],
      ["command", "a.b", "axb", false],
      ["command", "(x)+[y]", "(x)+[y]", true],
      ["command", "git push* | rm -rf *", "git push origin", false],
      ["command", "cat*", "cat <<EOF\nsecret\nEOF", true],
      ["command", "C:\\tools\\*", "C:/tools/x.exe", true],
      ["command", "*a*b*c", "xaybzc", true],
      ["command", "*a*b*c", "xcybza", false],
      ["command", "ab*ba", "aba", false],
      ["tool", "*edit", "multiedit", true],
      ["tool", "edit", "multiedit", false],
      ["tool", "apply_patch", "apply_patch", true],
      ["tool", "*", "webfetch", true],
      ["event", "*.before", "edit.before", true],
      ["event", "edit.*", "write.before", false],
      ["event", "session-*", "session-idle.after", true],
    ] as const
    expect(
      ROWS.map(([field, pattern, value]) => [field, pattern, value, HookEvaluate.matches(field, pattern, value)]),
    ).toEqual(ROWS.map((row) => [...row]))
  })

  test("Wildcard folds case on Windows only, like Orchestra's; path globs never do", () => {
    expect(HookEvaluate.matches("command", "GIT PUSH*", "git push origin")).toBe(process.platform === "win32")
    expect(HookEvaluate.matches("tool", "Edit", "edit")).toBe(process.platform === "win32")
    expect(HookEvaluate.matches("path", "SRC/**", "src/a.ts")).toBe(false)
  })

  test("many stars against a long model-written command stay linear", () => {
    // Orchestra's regex Wildcard needs over a minute for this pattern on 1,000 characters.
    const command = `${"ab".repeat(50_000)}d`
    const started = performance.now()
    expect(HookEvaluate.matches("command", "*a*b*c*a*b*c*d", command)).toBe(false)
    expect(HookEvaluate.matches("command", "*a*b*a*b*d", command)).toBe(true)
    expect(performance.now() - started).toBeLessThan(2_000)
  })
})

describe("session triggers", () => {
  test("session-start, prompt and session-idle fire with their event and no tool, path or command", () => {
    const start = install(
      "start",
      "session-start.after",
      {
        e: when("event", "session-start.after"),
        tl: when("tool", "*"),
        cm: when("command", "*"),
        pa: when("path", "**"),
        yes: remind("yes"),
        no: record("no"),
      },
      "t>e e>tl tl>yes tl:1>cm cm:1>pa pa:1>no",
    )
    // A tool, command or path condition takes No on a session trigger.
    expect(fired([start], call("session-start.after"))).toEqual(["start:no"])

    const prompt = install("prompt", "prompt.before", { a: approve("Confirm the prompt") }, "t>a")
    expect(HookEvaluate.plan([prompt, start], call("prompt.before"))).toStrictEqual([
      { installID: "prompt", nodeID: "a", action: "approve", message: "Confirm the prompt" },
    ])
  })

  test("a Run gate on session stop records on Pass and requires repair on Fail", () => {
    // The approved mock's "Typecheck when a session stops": Run gate → Pass: Record, Fail: Require repair.
    const stop = install(
      "stop",
      "session-idle.after",
      {
        g: verify("Type errors must be fixed.", "bun typecheck"),
        k: record("Typecheck passed."),
        r: repair("Fix them."),
      },
      "t>g g>k g:1>r",
    )
    const anyTool = install("tool", "tool.after", { r: record("tool") }, "t>r")
    expect(HookEvaluate.plan([stop, anyTool], call("session-idle.after"))).toStrictEqual([
      {
        installID: "stop",
        nodeID: "g",
        action: "verify",
        message: "Type errors must be fixed.",
        check: "bun typecheck",
        onFail: [{ installID: "stop", nodeID: "r", action: "repair", message: "Fix them." }],
      },
      { installID: "stop", nodeID: "k", action: "record", message: "Typecheck passed." },
    ])
    // Session triggers never fire on tool calls, and `tool` triggers never fire on session events.
    expect(fired([stop, anyTool], call("tool.after", { tool: "glob" }))).toEqual(["tool:r"])
  })
})

// A deterministic generator: the same rows on every run and every OS.
function seeded(seed: number) {
  const state = { seed }
  return (bound: number) => {
    state.seed = (state.seed * 1103515245 + 12345) % 2 ** 31
    return state.seed % bound
  }
}
