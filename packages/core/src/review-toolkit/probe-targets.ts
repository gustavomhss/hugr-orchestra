export * as ReviewProbeTargets from "./probe-targets"

import { Schema } from "effect"

const source = Schema.NonEmptyString.check(Schema.isMaxLength(8192))
const label = Schema.NonEmptyString.check(Schema.isMaxLength(128))
export const Property = Schema.Struct({
  language: Schema.Literals(["ts", "js"]),
  law: Schema.NonEmptyString.check(Schema.isMaxLength(1024)),
  source,
  // Xorshift uses a nonzero state; seed zero deterministically selects state one.
  seed: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2147483647 })),
  cases: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 256 })),
})
export type Property = typeof Property.Type
export const Interleave = Schema.Struct({
  language: Schema.Literals(["ts", "js"]),
  source,
  schedule: Schema.Array(label).check(Schema.isMinLength(2), Schema.isMaxLength(32)),
})
export type Interleave = typeof Interleave.Type

export const Mutants = Schema.Struct({
  path: Schema.NonEmptyString.check(Schema.isMaxLength(8192)),
  startLine: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
  endLine: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
})
export type Mutants = typeof Mutants.Type
