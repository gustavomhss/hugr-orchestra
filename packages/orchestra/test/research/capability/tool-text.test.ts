import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { CapabilitySupport } from "./support"

// JE-AC-M2: every research tool the seat holds declares, in at most 120 words, its line unit, what an empty result means,
// what it retains and its named failure. The descriptions are read from the registry, as the model receives them.
const TOOLS = ["code_query", "code_search", "code_locate", "inquiry"]
const DECLARED = [["line unit", /^Lines: \S/m], ["empty result", /^Empty: \S/m], ["retained", /^Retains: \S/m], ["named failure", /^Fails: [a-z_]+/m]] as const
const words = (text: string) => text.trim().split(/\s+/).length

describe("JE-AC-M2: the seat's tool descriptions declare the four things in at most 120 words", () => {
  // Mutation control: delete the `Fails:` line of src/tool/code-query.txt (or add 20 words to any description); the
  // declared-item and word-cap assertions then name the tool and go red.
  CapabilitySupport.it.instance("each research tool text has line unit, empty meaning, retention and named failure within the cap", () => Effect.gen(function* () {
    const fixture = yield* CapabilitySupport.dispatch()
    const found = TOOLS.map((id) => ({ id, text: fixture.tools.find((tool) => tool.id === id)?.description }))
    expect(found.filter((tool) => tool.text === undefined).map((tool) => tool.id)).toEqual([])

    expect(found.flatMap((tool) => DECLARED.filter(([, pattern]) => !pattern.test(tool.text!)).map(([name]) => `${tool.id}: no ${name}`))).toEqual([])
    expect(found.filter((tool) => words(tool.text!) > 120).map((tool) => `${tool.id}: ${words(tool.text!)} words`)).toEqual([])
    yield* fixture.sessions.remove(fixture.authority.id)
  }))
})
