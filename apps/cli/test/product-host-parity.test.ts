import { expect, test } from "bun:test"
import path from "node:path"
import { productHost } from "./fixture/product-host"

// U9: every tool the Maestro prompt tells the model to call is registered in the composed V2 registry. A name held on
// V2 still registers (it is refused at call time), so each must be present. V2's Claude Code host sends the agent's own
// prompt and never `ClaudeHostOptions.append`, which only V1's host appends, so that text is not a V2 source.

const repo = path.resolve(import.meta.dir, "../../..")
const prompt = await Bun.file(path.join(repo, "packages/core/src/agent/prompt/maestro.txt")).text()

// Tools the prompt names without a family marker; `archie`, `general`, `linux` and the like are agents, not tools.
const bare = ["task", "read", "question", "webfetch"]
const promptNames = [
  ...bare,
  ...[...prompt.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)*(?:_\*)?)`/g)].map((match) => match[1]).filter((name) => name.includes("_")),
]

const host = await productHost()

// Lean recall is named by no prompt but belongs to the Lean profile of every agent.
const referenced = [...new Set([...promptNames, "lean_recall"])]

const wildcard = (name: string) => name.endsWith("*")
const missingFrom = (tools: readonly string[]) =>
  referenced.filter((name) =>
    wildcard(name) ? !tools.some((tool) => tool.startsWith(name.slice(0, -1))) : !tools.includes(name),
  )

test("the parity sources actually name tools", () => {
  // A source that parsed to nothing would make the guard vacuous.
  for (const name of ["maestro_*", "maestro_arsenal_*", "dock_*", "context_recall", "maestro_workflows", "question"])
    expect(promptNames).toContain(name)
})

test("every tool the prompts reference is registered in the composed registry", () => {
  expect(missingFrom(host.tools)).toEqual([])
})
