export * as UpstreamResult from "./upstream-result"

import { Option, Schema } from "effect"

export const SCHEMA = "upstream-work-result-v1"
export const TAG = "upstream-result"

// These are worker claims, not identity, approved scope or artifact-content verification.
export const Card = Schema.Struct({
  outcome: Schema.Literals(["done", "blocked"]),
  artifacts: Schema.Array(Schema.Struct({
    kind: Schema.Literals(["product", "architecture", "specification", "plan", "roadmap", "epic", "issue", "task", "work-package", "brief"]),
    path: Schema.optionalKey(Schema.NonEmptyString),
  })),
  blockers: Schema.Array(Schema.Struct({
    kind: Schema.Literals(["assignment", "context", "permission", "safety-hold", "tool", "check-unavailable"]),
    reason: Schema.NonEmptyString,
    code: Schema.optionalKey(Schema.String),
    ref: Schema.optionalKey(Schema.String),
  })),
  risks: Schema.Array(Schema.String),
  nextActions: Schema.Array(Schema.String),
})
export type Card = typeof Card.Type

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(Card))

export function parse(text: string): Card | undefined {
  const lines = text.split(/\r?\n/)
  const blocks: { text: string; end: number }[] = []
  const state: { fence?: { delimiter: string; start: number; card: boolean } } = {}
  // Track supported outer code fences; only a complete terminal result block carries proposal claims.
  lines.forEach((line, index) => {
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (!fence) return
    if (state.fence) {
      if (fence[1][0] !== state.fence.delimiter[0] || fence[1].length < state.fence.delimiter.length || !/^[ \t]*$/.test(fence[2])) return
      if (state.fence.card) blocks.push({ text: lines.slice(state.fence.start + 1, index).join("\n"), end: index })
      state.fence = undefined
      return
    }
    if (fence[1][0] === "`" && fence[2].includes("`")) return
    state.fence = { delimiter: fence[1], start: index, card: fence[1] === "```" && fence[2].replace(/^[ \t]+|[ \t]+$/g, "") === TAG }
  })
  if (state.fence?.card || blocks.length !== 1) return
  if (lines.slice(blocks[0].end + 1).some((line) => !/^[ \t]*$/.test(line))) return
  return Option.getOrUndefined(decode(blocks[0].text, { onExcessProperty: "error" }))
}
