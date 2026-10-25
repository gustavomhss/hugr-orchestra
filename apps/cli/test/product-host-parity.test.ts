import { expect, test } from "bun:test"
import path from "node:path"
import { productHost } from "./fixture/product-host"

// U9: every tool the Maestro prompt and the Claude Code engine's appended prompt tell the model to call is registered
// in the composed V2 registry. A name held on V2 still registers (it is refused at call time), so each must be present.

const repo = path.resolve(import.meta.dir, "../../..")
const prompt = await Bun.file(path.join(repo, "packages/core/src/agent/prompt/maestro.txt")).text()

// Tools the prompt names without a family marker; `archie`, `general`, `linux` and the like are agents, not tools.
const bare = ["task", "read", "question", "webfetch"]
const promptNames = [
  ...bare,
  ...[...prompt.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)*(?:_\*)?)`/g)].map((match) => match[1]).filter((name) => name.includes("_")),
]

// Booting the host first resolves core's import cycles from `serve`'s order; the engine's options load after it.
const host = await productHost()
const { ClaudeHostOptions } = await import("@orchestra/engine-claude-code/host/options")
const { ResearchSeatTools } = await import("@orchestra/core/research/seat-tools")
// The engine's text for Maestro with a research seat present, so its conditional lines are rendered too.
const engineText = ClaudeHostOptions.append("maestro", { archie: "archie", backend: "backend", research: ResearchSeatTools.SEAT })
const engineNames = [...engineText.matchAll(/mcp__orchestra__([a-z][a-z0-9_]*\*?)/g)].map((match) => match[1])

// Lean recall is named by no prompt but belongs to the Lean profile of every agent.
const referenced = [...new Set([...promptNames, ...engineNames, "lean_recall"])]

// Names the engine's V1-era text calls that V2 does not register. Each entry is a defect to fix, not a pass: the test
// below fails the moment one registers, so the entry is removed with the fix.
const missing = ["process", "task_grant"]

const wildcard = (name: string) => name.endsWith("*")
const missingFrom = (tools: readonly string[]) =>
  referenced.filter((name) =>
    wildcard(name) ? !tools.some((tool) => tool.startsWith(name.slice(0, -1))) : !tools.includes(name),
  )

test("the parity sources actually name tools", () => {
  // A source that parsed to nothing would make the guard vacuous.
  for (const name of ["maestro_*", "maestro_arsenal_*", "dock_*", "context_recall", "maestro_workflows", "question"])
    expect(promptNames).toContain(name)
  for (const name of ["maestro_*", "atlas_*", "dock_*", "context_recall", "maestro_request_review", "task", "process"])
    expect(engineNames).toContain(name)
})

test("every tool the prompts reference is registered in the composed registry", () => {
  expect(missingFrom(host.tools).toSorted()).toEqual(missing.toSorted())
})
