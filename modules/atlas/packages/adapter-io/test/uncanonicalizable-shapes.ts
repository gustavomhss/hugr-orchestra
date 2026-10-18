// @atlas/adapter-io — test/uncanonicalizable-shapes.ts  (the EIGHT canonical-form violations, as fixtures)
//
// The `@atlas/tools` reference model (`guard.ts` `createGuard`/`createGovernedStore`) pins its fail-closed
// leg over eight shapes that `@atlas/kernel` `id` cannot canonicalize. That reference model has ZERO
// production callers — the durable write door the CLI actually uses is `adapter-io/src/store.ts`. This
// module is the SHARED fixture set so the SHIPPED store can be driven with the SAME eight shapes and the
// two answers compared, instead of the shipped law being inferred from the reference model's.
//
// ── THE NFC CASE IS BYTE-SENSITIVE, AND IT WENT VACUOUS ONCE ALREADY ─────────────────────────────────────
// U+0063 U+0061 U+0066 U+00E9 (precomposed) and U+0063 U+0061 U+0066 U+0065 U+0301 (decomposed) render
// IDENTICALLY and survive no tool that normalizes a source file. MEASURED during this seat: a probe
// written with the two RAW literals
// had its decomposed one silently recomposed in transit — `od -c` showed `c a f 303 251` on BOTH lines —
// and the case reported `emitted: true` as a PASS, because with one key there is no collision to reject.
// The literals below are therefore written as ASCII `\u` ESCAPES: a normalizer has nothing to normalize in
// a `\u0301`, so the premise cannot be edited away by accident. {@link assertPremise} then EXECUTES the
// premise (`id` must throw) for every shape, so if any of them ever stops being uncanonicalizable the
// suites that depend on it fail LOUDLY instead of passing vacuously.

import { expect } from "vitest"
import { id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"

/** The precomposed presentation — U+00E9. ASCII-escaped so no editor/normalizer can rewrite it. */
export const NFC_KEY = "caf\u00e9"
/** The decomposed presentation — U+0065 U+0301. `NFC_KEY !== NFD_KEY` in JS, yet both normalize to one. */
export const NFD_KEY = "cafe\u0301"

/** One canonical-form violation: a NAME, and the offending VALUE placed in a fresh object each time.
 *  `build` is a factory (never a shared constant) so the cyclic shape cannot leak between cases and so a
 *  suite that mutates a fixture cannot poison the next assertion. */
export interface Shape {
  readonly name: string
  /** A fresh object that `id` must refuse. */
  build(): CasObject
  /** The same violation injected as ONE EXTRA PROPERTY on a caller-supplied record — the shape a real
   *  payload takes when the violation rides in on an otherwise well-formed fact. */
  inject(base: Record<string, unknown>): Record<string, unknown>
}

/** A cyclic value — `id` recurses until the stack is exhausted (a `RangeError`, not a thrown `Error`). */
function cyclic(): Record<string, unknown> {
  const o: Record<string, unknown> = { k: "x" }
  o["self"] = o
  return o
}

/** Inject the two NFC-colliding keys. Written through a computed-key literal so BOTH survive: they are
 *  distinct JS strings, so `Object.keys` returns two entries and the canonicalizer must reject the pair. */
function injectNfc(base: Record<string, unknown>): Record<string, unknown> {
  return { ...base, [NFC_KEY]: 1, [NFD_KEY]: 2 }
}

/** A shape whose violation is a single scalar `v` on a fresh record. */
function scalar(name: string, v: unknown): Shape {
  return {
    name,
    build: () => ({ k: "x", v }) as CasObject,
    inject: (base) => ({ ...base, atlasProbeValue: v }),
  }
}

/** THE EIGHT. Order and names mirror the reference-model suite so the two tables can be read side by side. */
export const SHAPES: readonly Shape[] = [
  scalar("float", 1.5),
  scalar("non-finite", Number.POSITIVE_INFINITY),
  scalar("NaN", Number.NaN),
  scalar("bigint", BigInt(10)),
  scalar("symbol", Symbol("probe")),
  scalar("function", () => 1),
  {
    name: "cyclic",
    build: () => cyclic() as CasObject,
    inject: (base) => {
      const o: Record<string, unknown> = { ...base }
      o["atlasProbeSelf"] = o
      return o
    },
  },
  {
    name: "nfc-key-collision",
    build: () => injectNfc({ k: "x" }) as CasObject,
    inject: injectNfc,
  },
]

/**
 * THE PREMISE, EXECUTED. Every shape above must be one `id` genuinely REFUSES — otherwise every "the store
 * refused it" assertion downstream is a tautology over a value that was never a violation.
 *
 * The NFC pair gets a second, sharper premise: the two literals must be `!==` as JS strings AND equal after
 * `normalize('NFC')`. That is the exact property a source-file normalization destroys, and it is asserted
 * here rather than left to the reader's eyes.
 */
export function assertPremise(): void {
  expect(NFC_KEY).not.toBe(NFD_KEY)
  expect(NFC_KEY.normalize("NFC")).toBe(NFD_KEY.normalize("NFC"))
  expect(Object.keys(injectNfc({})).length).toBe(2)
  for (const shape of SHAPES) {
    const built = shape.build()
    expect(() => id(built), `PREMISE BROKEN: id() accepts the '${shape.name}' shape`).toThrow()
    const injected = shape.inject({ k: "x" }) as CasObject
    expect(() => id(injected), `PREMISE BROKEN: id() accepts '${shape.name}' as an injected property`).toThrow()
  }
}
