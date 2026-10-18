import { expect, test } from "bun:test"
import path from "node:path"
import { createRequire } from "node:module"
import ts from "typescript"
import { readBoundarySource } from "./mode-boundary-source"

// The two modes stay separate (specs/claude-code-engine.md, "Two modes"). Normal mode reaches Claude mode only through
// its entry point or the exact adapters in ADAPTER_EDGES, and Claude mode reaches normal mode only through INTERFACE, never
// through the loop itself. A fresh SourceFile per file supplies static/type-only imports, re-exports, import-equals,
// type import queries and direct import()/require() calls with strings or no-substitution templates. Comments/prose are inert;
// interpolated templates, computed specifiers and aliased/wrapped loaders are outside this syntactic guard's declared reach.
// Decoded separators and alias wildcard paths are normalized before checking final source-root containment.

const ORCHESTRA = path.resolve(import.meta.dir, "../..")
const SRC = path.join(ORCHESTRA, "src")
const CLAUDE_MODE = "claude-code"
const ENTRY = "claude-code/engine"

/** Reviewed runtime-audit adapters, scoped to the importing file and target module; never a host-directory allowance. */
const ADAPTER_EDGES = [
  {
    file: "server/routes/instance/httpapi/handlers/catalog.ts",
    target: "claude-code/sdk",
    reason: "Catalog status probes use the pinned SDK service.",
  },
  {
    file: "server/routes/instance/httpapi/handlers/catalog.ts",
    target: "claude-code/host/provider",
    reason: "Catalog availability adapts the host sign-in status.",
  },
  {
    file: "server/routes/instance/httpapi/handlers/provider.ts",
    target: "claude-code/host/provider",
    reason: "Legacy provider discovery adapts the host sign-in status.",
  },
  {
    file: "server/routes/instance/httpapi/handlers/provider.ts",
    target: "claude-code/sdk",
    reason: "Claude sign-in resolves the pinned SDK's CLI.",
  },
  {
    file: "server/routes/instance/httpapi/handlers/provider.ts",
    target: "claude-code/login",
    reason: "The Claude subscription sign-in route runs the CLI's own login.",
  },
  {
    file: "server/routes/instance/httpapi/handlers/provider.ts",
    target: "claude-code/executable",
    reason: "Claude sign-in locates the Claude Code executable.",
  },
  {
    file: "server/routes/instance/httpapi/handlers/provider.ts",
    target: "claude-code/host/options",
    reason: "Claude sign-in builds the host's CLI environment.",
  },
  {
    file: "server/routes/instance/httpapi/server.ts",
    target: "claude-code/sdk",
    reason: "Server composition supplies the SDK service for host catalog probes.",
  },
]

/** Normal-mode modules Claude mode may import: shared services and types, never the loop. Add one only with a reason. */
const INTERFACE = [
  "agent/agent", "config/config", "effect/instance-state", "permission", "snapshot", "session/schema", "session/session",
  "tool/external-directory", "tool/json-schema", "tool/registry", "tool/shell/scan", "tool/task", "tool/tool",
  // The Claude host's widgets: the question dock (AskUserQuestion), the todo dock (TodoWrite) and the retry row.
  "question", "session/status", "session/todo",
  // Which owner messages a turn hands Claude Code (the real requests and task returns), and the engine pausing
  // Orchestra's continuity on a session Claude Code compacts itself.
  "continuity/alias", "continuity/request-source", "continuity/service",
  // The host adapter (claude-code/host): seat definitions and skills for the generated plugin, Task's write-root
  // validation for task_grant, the skill playbooks, and the background process registry the `process` tool feeds.
  "maestro/seats", "maestro/seat-skill-root", "maestro/write-roots", "skill", "background/process",
  // The host hooks (host/{gate,delegation,hooks}.ts): the policy gate's ToolSafety profile, arsenal input bindings and
  // workflow HOLDs; the delegation records (seat registry, logical Task, authority, work result); the working memory
  // read after a compaction (plan, todos) and the archive the compaction summary goes to.
  "continuity/archive", "id/id", "maestro/arsenal-bindings", "maestro/arsenal-observations", "maestro/backend-work",
  "maestro/governed-task-reservation", "maestro/logical-task", "maestro/plan-revision", "maestro/route-grant",
  "maestro/session-authority", "maestro/workflow-binding", "session/todo",
  // The host session provides what resolving the served tools needs: the tool-output truncation service.
  "tool/truncate",
  // Native teardown/fork ownership callbacks and diff summaries shared with the normal loop.
  "session/lifecycle", "session/summary",
  // Native issued research frames and the qualification packet at Claude Agent settlement.
  "research/allowance", "maestro/discovery-result",
  // Reviewed runtime-audit additions: shared continuity/memory, provider configuration, location lifecycle,
  // event projection, Git operations and shell execution; none owns the normal provider loop.
  "tool/shell/execution", "continuity/model", "maestro/atlas-memory", "maestro/atlas-knowledge", "provider/provider", "event-v2-bridge", "git",
  "project/instance-store",
  // Native compaction restores a retained plan only after reading its durable owner-message admission record.
  // This shared persistence port does not invoke either mode's LLM loop.
  "maestro/admission-record",
  // The Claude sign-in runs the CLI's own `auth login` through the shared process spawner.
  "util/process",
]

/** Orchestra's own loop. Claude mode never imports it, whatever INTERFACE says. */
const LOOP = ["session/prompt", "session/llm", "session/processor"]

type File = { file: string; text: string; control?: { literal: string; target: string } }

test("the boundary rules catch a normal-mode import of a Claude-mode internal and a Claude-mode import of the loop", () => {
  const found = violations([
    { file: "session/other.ts", text: 'import { ClaudeCodeSDK } from "@/claude-code/sdk"',
      control: { literal: "@/claude-code/sdk", target: "claude-code/sdk" } },
    { file: "tool/other.ts", text: 'const lazy = () => import("../claude-code/tools")' },
    { file: "session/fine.ts", text: 'import type { ClaudeCode } from "@/claude-code/engine"' },
    { file: "claude-code/host/x.ts", text: 'export { LLM } from "@/session/llm"' },
    { file: "claude-code/y.ts", text: 'import { Foo } from "../worktree/foo"' },
    { file: "claude-code/z.ts", text: 'import { ClaudeCodeSDK } from "./sdk"' },
  ])
  expect(found).toEqual([
    "session/other.ts imports claude-code/sdk; normal mode may import only claude-code/engine",
    "tool/other.ts imports claude-code/tools; normal mode may import only claude-code/engine",
    "claude-code/host/x.ts imports session/llm, part of Orchestra's loop",
    "claude-code/y.ts imports worktree/foo, which is not in Claude mode's INTERFACE",
  ])
})

test("reviewed adapters allow only their exact module edges", () => {
  expect(
    violations(ADAPTER_EDGES.map((edge) => ({ file: edge.file, text: `import { Adapter } from "@/${edge.target}"` }))),
  ).toEqual([])
  for (const edge of ADAPTER_EDGES) {
    expect(violations([{ file: "session/unreviewed.ts", text: `import { Adapter } from "@/${edge.target}"` }])).toEqual(
      [`session/unreviewed.ts imports ${edge.target}; normal mode may import only ${ENTRY}`],
    )
    expect(violations([{ file: edge.file, text: 'import { Gate } from "@/claude-code/host/gate"' }])).toEqual([
      `${edge.file} imports claude-code/host/gate; normal mode may import only ${ENTRY}`,
    ])
  }
})

test("every normal-loop module remains forbidden from Claude mode", () => {
  for (const target of LOOP) {
    expect(violations([{ file: "claude-code/host/probe.ts", text: `const loop = require("@/${target}")` }])).toEqual([
      `claude-code/host/probe.ts imports ${target}, part of Orchestra's loop`,
    ])
  }
})

test("native memory may read the shared admission port, not neighboring modules or the normal loop", () => {
  expect(violations([{ file: "claude-code/host/memory.ts", text: 'import { readAdmission } from "@/maestro/admission-record"' }])).toEqual([])
  expect(violations([{ file: "claude-code/host/memory.ts", text: 'import { Other } from "@/maestro/admission-record-private"' }])).toEqual([
    "claude-code/host/memory.ts imports maestro/admission-record-private, which is not in Claude mode's INTERFACE",
  ])
  for (const target of LOOP) {
    expect(violations([{ file: "claude-code/host/memory.ts", text: `import { Loop } from "@/${target}"` }])).toEqual([
      `claude-code/host/memory.ts imports ${target}, part of Orchestra's loop`,
    ])
  }
})

test("the parser keeps static, type-only, re-export, dynamic and require edges while ignoring prose", () => {
  expect(
    imports({
      file: "session/probe.ts",
      text: [
        'import { SDK } from "@/claude-code/sdk"',
        'import type { Engine } from "@/claude-code/engine"',
        'export { Tools } from "../claude-code/tools.ts"',
        'const options = import("@/claude-code/host/options")',
        'const host = require("@/claude-code/host/provider")',
        '// import { Loop } from "@/session/llm"',
        "const prose = 'import { Loop } from \"@/session/prompt\"'",
      ].join("\n"),
    }),
  ).toEqual([
    "claude-code/sdk",
    "claude-code/engine",
    "claude-code/tools",
    "claude-code/host/options",
    "claude-code/host/provider",
  ])
})

test("the AST keeps side-effect, export-all, type re-export, import-equals and type query edges with normalized paths", () => {
  expect(imports({
    file: "session/probe.ts",
    text: [
      'import "@/claude-code/sdk.ts"',
      'export * from "../claude-code/tools/index.ts"',
      'export type { Engine } from "@/claude-code/engine"',
      'import Host = require("../claude-code/host/provider.ts")',
      'const lazy = import /* comment */ ("@/claude-code/host/../host/options.ts")',
      'type Gate = import("@/claude-code/host/gate").Gate',
    ].join("\n"),
  })).toEqual([
    "claude-code/sdk",
    "claude-code/tools",
    "claude-code/engine",
    "claude-code/host/provider",
    "claude-code/host/options",
    "claude-code/host/gate",
  ])
})

test("the AST keeps constant-template import and require edges across both mode boundaries", () => {
  for (const loader of ["import", "require"]) {
    expect(violations([{ file: "session/probe.ts", text: `const sdk = ${loader}(\`@/claude-code/sdk\`)` }])).toEqual([
      "session/probe.ts imports claude-code/sdk; normal mode may import only claude-code/engine",
    ])
    for (const target of LOOP) {
      expect(violations([{ file: "claude-code/host/probe.ts", text: `const loop = ${loader}(\`@/${target}\`)` }])).toEqual([
        `claude-code/host/probe.ts imports ${target}, part of Orchestra's loop`,
      ])
    }
  }
})

test("source-root re-entry aliases keep the same SDK, loop and private-module violations", () => {
  const cases = [
    { file: "session/probe.ts", target: "claude-code/sdk", problem: "session/probe.ts imports claude-code/sdk; normal mode may import only claude-code/engine" },
    ...LOOP.map((target) => ({ file: "claude-code/host/probe.ts", target, problem: `claude-code/host/probe.ts imports ${target}, part of Orchestra's loop` })),
    { file: "claude-code/host/probe.ts", target: "maestro/admission-record-private", problem: "claude-code/host/probe.ts imports maestro/admission-record-private, which is not in Claude mode's INTERFACE" },
  ]
  for (const item of cases) {
    for (const specifier of [`@/${item.target}`, `@/../src/${item.target}`]) {
      const source = { file: item.file, text: `import "${specifier}"` }
      expect(imports(source)).toEqual([item.target])
      expect(violations([source])).toEqual([item.problem])
    }
  }
  for (const specifier of ["@/../outside/private", "../../outside/private"]) {
    expect(imports({ file: "session/probe.ts", text: `import "${specifier}"` })).toEqual([])
  }
})

test("syntactic extraction failures name the importer and diagnostic while valid importless files stay valid", () => {
  for (const item of [
    { file: "session/broken.ts", text: "import { SDK } from ;", diagnostic: "TS1109: Expression expected." },
    { file: "session/broken.ts", text: 'const broken = `unterminated\nimport "@/claude-code/sdk"', diagnostic: "TS1160: Unterminated template literal." },
    { file: "session/broken.tsx", text: "const view = <div>", diagnostic: "TS17008: JSX element 'div' has no corresponding closing tag." },
    { file: "session/broken.d.ts", text: "export declare const value:", diagnostic: "TS1110: Type expected." },
  ]) {
    expect(() => imports(item)).toThrow(`Cannot extract imports from ${item.file}:\n${item.diagnostic}`)
  }
  for (const item of [
    { file: "session/empty.ts", text: "" },
    { file: "session/probe.ts", text: "export const value = 1" },
    { file: "session/probe.tsx", text: "export const view = <div />" },
    { file: "session/probe.d.ts", text: "export declare const value: number" },
    { file: "session/probe.d.ts", text: 'declare module "external" { export type Value = string }' },
  ]) {
    expect(imports(item)).toEqual([])
  }
})

test("literal separator variants agree with the compiler's alias mapping on POSIX and Windows models", () => {
  for (const platform of [path.posix, path.win32]) {
    const root = platform === path.posix ? "/review/orchestra" : "C:/review/orchestra"
    const src = platform.join(root, "src")
    const targets = ["claude-code/sdk", ...LOOP, "maestro/admission-record-private"]
    const files = new Set([...targets.map((target) => platform.join(src, `${target}.ts`)), platform.join(root, "outside/private.ts")].map((file) => file.replaceAll("\\", "/")))
    const host: ts.ModuleResolutionHost = {
      fileExists: (file) => files.has(file.replaceAll("\\", "/")),
      readFile: () => undefined,
      directoryExists: () => true,
      getCurrentDirectory: () => root,
    }
    const options = { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, paths: { "@/*": ["./src/*"] } }
    for (const target of targets) {
      const file = target === "claude-code/sdk" ? "session/probe.ts" : "claude-code/host/probe.ts"
      for (const specifier of [`@//${target}`, `@/${target.replaceAll("/", "\\")}`]) {
        const source = { file, text: `import ${JSON.stringify(specifier)}` }
        const resolved = ts.resolveModuleName(specifier, platform.join(src, file), options, host).resolvedModule
        expect(resolved).toBeDefined()
        const module = platform.relative(src, resolved!.resolvedFileName).replaceAll("\\", "/").replace(/\.ts$/, "")
        expect(module).toBe(target)
        expect(imports(source)).toEqual([module])
        expect(violations([source])).toEqual([target === "claude-code/sdk"
          ? `${file} imports ${target}; normal mode may import only ${ENTRY}`
          : LOOP.includes(target) ? `${file} imports ${target}, part of Orchestra's loop`
          : `${file} imports ${target}, which is not in Claude mode's INTERFACE`])
      }
    }
    for (const specifier of ["@//../outside/private", "@/..\\outside\\private"]) {
      const resolved = ts.resolveModuleName(specifier, platform.join(src, "session/probe.ts"), options, host).resolvedModule
      expect(resolved).toBeDefined()
      expect(platform.relative(src, resolved!.resolvedFileName).replaceAll("\\", "/")).toBe("../outside/private.ts")
      expect(imports({ file: "session/probe.ts", text: `import ${JSON.stringify(specifier)}` })).toEqual([])
    }
  }
})

test("the AST ignores prose and unsupported interpolated/computed loader spellings", () => {
  expect(imports({
    file: "session/probe.tsx",
    text: [
      '// import { SDK } from "@/claude-code/sdk"',
      'const prose = \'require("@/claude-code/host/provider")\'',
      'const view = <div>import("@/claude-code/host/options")</div>',
      'const computed = import(`@/claude-code/${name}`)',
      'const variable = require(specifier)',
      'const joined = require("@/claude-code/" + name)',
      'const wrapped = loader.require("@/claude-code/sdk")',
      'import "node:path"',
      'import "effect"',
    ].join("\n"),
  })).toEqual([])
})

test("normal mode imports only Claude mode's entry point, and Claude mode imports only its declared interface", async () => {
  const files = await sources()
  const claude = files.filter((item) => inClaudeMode(item.file))
  // Positive controls: the scan sees both modes and the one known crossing, session/prompt.ts -> claude-code/engine.
  expect(claude.length).toBeGreaterThan(5)
  expect(files.length - claude.length).toBeGreaterThan(200)
  expect(imports(files.find((item) => item.file === "session/prompt.ts")!)).toContain(ENTRY)
  const problems = violations(files)
  if (problems.length) throw new Error(["Claude mode / normal mode boundary broken:", ...problems].join("\n"))
  expect(LOOP.filter((module) => INTERFACE.includes(module))).toEqual([])
  // Ledger honesty: every INTERFACE entry is still used, so the list never grows stale.
  const used = new Set(claude.flatMap(imports))
  const memory = files.find((item) => item.file === "claude-code/host/memory.ts")!
  expect(imports(memory)).toContain("maestro/admission-record")
  expect(violations([{ ...memory, text: `${memory.text}\nimport { Loop } from "@/session/prompt"`,
    control: { literal: "@/session/prompt", target: "session/prompt" } }])).toContain(
    "claude-code/host/memory.ts imports session/prompt, part of Orchestra's loop",
  )
  expect(INTERFACE.filter((module) => !used.has(module))).toEqual([])
  expect(staleAdapterEdges(files)).toEqual([])
  for (const edge of ADAPTER_EDGES) {
    expect(edge.reason.trim().length).toBeGreaterThan(0)
    // Real-source mutation controls: removing an actual adapter must stale its exact ledger edge.
    expect(staleAdapterEdges(files.filter((item) => item.file !== edge.file))).toContain(
      `${edge.file} -> ${edge.target}`,
    )
    const source = files.find((item) => item.file === edge.file)!
    expect(
      violations([{ ...source, text: `${source.text}\nimport { Gate } from "@/claude-code/host/gate"` }]),
    ).toContain(`${edge.file} imports claude-code/host/gate; normal mode may import only ${ENTRY}`)
  }
})

function staleAdapterEdges(files: File[]) {
  return ADAPTER_EDGES.filter(
    (edge) => !files.some((item) => item.file === edge.file && imports(item).includes(edge.target)),
  ).map((edge) => `${edge.file} -> ${edge.target}`)
}

function violations(files: File[]) {
  return files.flatMap((item) => imports(item).flatMap((target) => {
    const from = inClaudeMode(item.file)
    const to = inClaudeMode(target)
    if (!from && to && target !== ENTRY && !ADAPTER_EDGES.some((edge) => edge.file === item.file && edge.target === target))
      return [`${item.file} imports ${target}; normal mode may import only ${ENTRY}`]
    if (from && !to && LOOP.includes(target)) return [`${item.file} imports ${target}, part of Orchestra's loop`]
    if (from && !to && !INTERFACE.includes(target)) return [`${item.file} imports ${target}, which is not in Claude mode's INTERFACE`]
    return []
  }))
}

/** The src-relative modules a file imports, without extension; package and node imports are dropped. */
function imports(item: File) {
  const parsed = readBoundarySource(item, SRC)
  const rows: { literal: string; normalized: string; branch: string; argument: string; absolute?: string; resolved?: string; target?: string }[] = []
  const targets = parsed.specifiers.flatMap((literal) => {
    const specifier = literal.replaceAll("\\", "/")
    const alias = specifier.startsWith("@/")
    const relative = !alias && specifier.startsWith(".")
    const argument = alias ? specifier.slice(2) : specifier
    const absolute = alias ? path.resolve(path.join(SRC, argument))
      : relative ? path.resolve(SRC, path.dirname(item.file), argument) : undefined
    const resolved = absolute === undefined ? undefined : path.relative(SRC, absolute).split(path.sep).join("/")
    const target = resolved === undefined || resolved === ".." || resolved.startsWith("../") || path.isAbsolute(resolved) ? undefined
      : resolved.replace(/\.(ts|tsx|js)$/, "").replace(/\/index$/, "")
    if (item.control) rows.push({ literal, normalized: specifier, branch: alias ? "alias" : relative ? "relative" : "package", argument, absolute, resolved, target })
    return target === undefined ? [] : [target]
  })
  if (item.control) {
    const row = rows.find((row) => row.literal === item.control?.literal)
    const defect = !row ? "MODE_BOUNDARY_RAW_LITERAL_FAILED" : row.branch !== "alias"
      ? "MODE_BOUNDARY_PREFIX_BRANCH_FAILED" : row.target !== item.control.target ? "MODE_BOUNDARY_NORMALIZED_TARGET_FAILED" : undefined
    if (defect) throw new Error(`${defect}: ${JSON.stringify({ file: item.file, control: item.control,
      runtime: { bun: Bun.version, platform: process.platform, typescript: ts.version,
        compiler: createRequire(import.meta.url).resolve("typescript"), scriptTarget: ts.ScriptTarget.Latest,
        scriptKind: item.file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        defaultIsPosix: path === path.posix, normalizeIsDefault: path.posix.normalize === path.normalize },
      inputMatches: parsed.source.text === item.text, statementKinds: parsed.source.statements.map((node) => node.kind), raw: parsed.specifiers, rows,
    })}`)
  }
  return targets
}

function inClaudeMode(module: string) {
  return module === CLAUDE_MODE || module.startsWith(CLAUDE_MODE + "/")
}

async function sources() {
  const files = await Array.fromAsync(new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: SRC }))
  return Promise.all(files.map(async (file) => ({ file: file.split(path.sep).join("/"), text: await Bun.file(path.join(SRC, file)).text() })))
}
