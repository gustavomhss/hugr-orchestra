import { expect, test } from "bun:test"
import path from "node:path"
import ts from "typescript"

// The two modes stay separate (specs/claude-code-engine.md, "Two modes"). Normal mode reaches Claude mode only through
// its entry point, and Claude mode reaches normal mode only through the shared services listed in INTERFACE, never
// through the loop itself. Imports are parsed, not grepped: static, type-only, re-exports, dynamic import() and require.

const ORCHESTRA = path.resolve(import.meta.dir, "../..")
const SRC = path.join(ORCHESTRA, "src")
const CLAUDE_MODE = "claude-code"
const ENTRY = "claude-code/engine"

/** Normal-mode modules Claude mode may import: shared services and types, never the loop. Add one only with a reason. */
const INTERFACE = [
  "agent/agent", "config/config", "effect/instance-state", "permission", "provider/provider", "snapshot",
  "session/instruction", "session/prompt-guard", "session/schema", "session/session", "session/system",
  "tool/external-directory", "tool/json-schema", "tool/registry", "tool/shell/scan", "tool/task", "tool/tool",
  // Orchestra's archive and continuity records, which the native transcript store keeps in step.
  "continuity/alias", "continuity/archive-format", "continuity/masking", "continuity/memory-types", "continuity/request-source",
  "continuity/service", "continuity/trigger",
  // The host adapter (claude-code/host): seat definitions and skills for the generated plugin, Task's write-root
  // validation for task_grant, the skill playbooks, and the background process registry the `process` tool feeds.
  "maestro/seats", "maestro/seat-skill-root", "maestro/write-roots", "skill", "background/process",
  // The host hooks (host/{gate,delegation,hooks}.ts): the policy gate's ToolSafety profile, arsenal input bindings and
  // workflow HOLDs; the delegation records (seat registry, logical Task, authority, work result); the working memory
  // read after a compaction (plan, todos) and the archive the compaction summary goes to.
  "continuity/archive", "id/id", "maestro/arsenal-bindings", "maestro/arsenal-observations", "maestro/backend-work",
  "maestro/governed-task-reservation", "maestro/logical-task", "maestro/plan-revision", "maestro/route-grant",
  "maestro/session-authority", "maestro/workflow-binding", "session/todo",
]

/** Orchestra's own loop. Claude mode never imports it, whatever INTERFACE says. */
const LOOP = ["session/prompt", "session/llm", "session/processor"]

type File = { file: string; text: string }

test("the boundary rules catch a normal-mode import of a Claude-mode internal and a Claude-mode import of the loop", () => {
  const found = violations([
    { file: "session/other.ts", text: 'import { ClaudeCodeSDK } from "@/claude-code/sdk"' },
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
  expect(INTERFACE.filter((module) => !used.has(module))).toEqual([])
})

function violations(files: File[]) {
  return files.flatMap((item) => imports(item).flatMap((target) => {
    const from = inClaudeMode(item.file)
    const to = inClaudeMode(target)
    if (!from && to && target !== ENTRY) return [`${item.file} imports ${target}; normal mode may import only ${ENTRY}`]
    if (from && !to && LOOP.includes(target)) return [`${item.file} imports ${target}, part of Orchestra's loop`]
    if (from && !to && !INTERFACE.includes(target)) return [`${item.file} imports ${target}, which is not in Claude mode's INTERFACE`]
    return []
  }))
}

/** The src-relative modules a file imports, without extension; package and node imports are dropped. */
function imports(item: File) {
  return ts.preProcessFile(item.text, true, true).importedFiles.flatMap((ref) => {
    const specifier = ref.fileName
    const resolved = specifier.startsWith("@/") ? specifier.slice(2)
      : specifier.startsWith(".") ? path.posix.join(path.posix.dirname(item.file), specifier) : undefined
    if (resolved === undefined || resolved.startsWith("..")) return []
    return [resolved.replace(/\.(ts|tsx|js)$/, "").replace(/\/index$/, "")]
  })
}

function inClaudeMode(module: string) {
  return module === CLAUDE_MODE || module.startsWith(CLAUDE_MODE + "/")
}

async function sources() {
  const files = await Array.fromAsync(new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: SRC }))
  return Promise.all(files.map(async (file) => ({ file: file.split(path.sep).join("/"), text: await Bun.file(path.join(SRC, file)).text() })))
}
