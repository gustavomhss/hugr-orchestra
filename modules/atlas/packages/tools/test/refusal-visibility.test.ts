// @atlas/tools — test/refusal-visibility.test.ts   (F2/F5 — a governed refusal is NEVER a silent success)
//
// THE PROPERTY, STATED: *a governed write door that fails closed (`emitted:false` / `linked:false`) surfaces
// as a REJECTED verdict carrying the door's own reason — never as `ok:true`.* `src/handler.ts` names it
// ("MUST surface as a rejected `Verdict`, legible on BOTH user doors (MCP `isError:true`, CLI exit 2), never
// a silent `ok:true` an agent reads as success (F2/F5)") and implements it in ONE line, `isFailClosedWrite`.
//
// Nothing in `packages/tools/test` stated it. The mutant `typeof data === 'object'` → `!==` collapses
// `isFailClosedWrite` to `false` for every object, i.e. EVERY governance refusal renders as success. At the
// audit's base it left the package green; at THIS commit it is caught — but only as an incidental clause of
// `error-attribution.test.ts`'s CONTROL case, whose title is about a MISSING ARGUMENT, not about refusal
// visibility. A law whose only detector is another test's control case is one refactor away from silence.
//
// The DISCRIMINANT (the text before the first `:`) is compared for EQUALITY, and the class through
// `faultOf`. Refusal prose in this repo quotes other refusal constants BY NAME (ADR-0007), so a substring
// assertion cannot tell one gate's refusal from another's.

import { describe, expect, it } from "vitest"
import { faultOf } from "../src/fault.js"
import { createHandler, WRITE_PATHS } from "../src/handler.js"
import type { ToolLeg } from "../src/handler.js"
import type { EmitOut, LinkOut, MemoryEmitOut, Tool, ToolData, Verdict } from "../src/types.js"

/** THE DISCRIMINANT — everything before the first `:` (mirrors adapter-io's `reasonOf`, ADR-0007). */
const reasonOf = (rejected: string | undefined): string => (rejected ?? "").split(":")[0]!

/** The refusals the REAL doors ship, transcribed as they are minted (`adapter-io/src/governed-emit.ts` /
 *  `governed-link.ts` / `wire.ts`'s `atlas-memory-emit` leg lead with a discriminant). Only the discriminant
 *  is contract; the prose is commentary. */
const UNGROUNDED = "ungrounded: the citation did not re-derive at source@sha"
const UNAUTHORIZED = "unauthorized for target: the actor holds no scope covering both endpoints"
const SCANNER_UNAVAILABLE = "scanner-unavailable: no NAMED scanner is configured"

/** Schema-valid arguments per write door, so `handle` reaches the LEG (class (a) is decided up front). */
const ARGS: Record<"atlas-emit" | "atlas-link" | "atlas-memory-emit", unknown> = {
  "atlas-emit": { node: { claim: "ACME ARR 2024 = $4.2M" }, at: "deadbeef" },
  "atlas-link": { a: "k:one", b: "k:two" },
  "atlas-memory-emit": { entry: { rule: "r", scope: "s", frecency: 1 } },
}

/** The fail-closed return of each governed door, and the refusal it carries. One row per WRITE_PATH — the
 *  cardinality is asserted below, so this table can never silently stop covering a door. */
const FAIL_CLOSED: readonly (readonly [Tool, ToolData, string])[] = [
  ["atlas-emit", { emitted: false, rejected: UNGROUNDED } satisfies EmitOut, "ungrounded"],
  ["atlas-link", { linked: false, rejected: UNAUTHORIZED } satisfies LinkOut, "unauthorized for target"],
  [
    "atlas-memory-emit",
    { admitted: false, refusal: "scanner-unavailable", rejected: SCANNER_UNAVAILABLE } satisfies MemoryEmitOut,
    "scanner-unavailable",
  ],
]

/** The SUCCESS return of each governed door — the positive control that separates "refusals are visible"
 *  from "everything is reported as a refusal". */
const ADMITTED: readonly (readonly [Tool, ToolData])[] = [
  ["atlas-emit", { emitted: true } satisfies EmitOut],
  ["atlas-link", { linked: true, a: "k:one", b: "k:two" } satisfies LinkOut],
  [
    "atlas-memory-emit",
    {
      admitted: true,
      record: { owner: "a", kind: "project", entry: { rule: "r", scope: "s", frecency: 1 } },
    } satisfies MemoryEmitOut,
  ],
]

const run = (tool: Tool, data: ToolData): Verdict<ToolData> => {
  const leg: ToolLeg = () => data
  return createHandler({ [tool]: leg }).handle(tool, ARGS[tool as "atlas-emit" | "atlas-link" | "atlas-memory-emit"])
}

describe("F2/F5 — a fail-closed governed write is a REJECTION, never a silent ok", () => {
  it("the table below covers EVERY governed write door (no door drops out of coverage silently)", () => {
    expect(WRITE_PATHS.length).toBe(3)
    expect([...FAIL_CLOSED.map(([t]) => t)].sort()).toEqual([...WRITE_PATHS].sort())
    expect([...ADMITTED.map(([t]) => t)].sort()).toEqual([...WRITE_PATHS].sort())
  })

  it.each(FAIL_CLOSED)(
    "%s failing closed ⇒ ok:false, class `refused`, the DOOR's own reason",
    (tool, data, discriminant) => {
      const v = run(tool, data)

      // THE PROPERTY. `ok` is the machine value every transport renders from (MCP `isError`, CLI exit code):
      // if this is `true` the agent reads a refused write as a successful one — the F2/F5 failure itself.
      expect(v.ok).toBe(false)
      // …as a deliberate refusal, not a crash and not the caller's bad arguments.
      expect(faultOf(v)).toBe("refused")
      // …carrying the DOOR's reason verbatim, identified by its discriminant (equality, never substring:
      // `UNAUTHORIZED` literally contains the word "scope", and `UNGROUNDED` the words "did not re-derive").
      expect(reasonOf(v.rejected)).toBe(discriminant)
      // …with the record still riding the verdict, which is what lets the CLI classify it exit 2 (a governance
      // rejection) rather than exit 1 (an error). Dropping `data` here is a silent downgrade of that channel.
      expect(v.data).toEqual(data)
      // …and guidance on the reject path (TOOLS-4).
      expect(v.guidance.next).not.toBe("")
      expect(v.guidance.invariant).not.toBe("")
    },
  )

  it.each(ADMITTED)(
    "CONTROL — %s SUCCEEDING is still ok:true (the guard refuses writes, not results)",
    (tool, data) => {
      const v = run(tool, data)

      expect(v.ok).toBe(true)
      expect(faultOf(v)).toBeUndefined()
      expect(v.rejected).toBeUndefined()
      expect(v.data).toEqual(data)
    },
  )

  it("a NON-write tool returning an object is untouched by the refusal guard", () => {
    // The guard keys off `emitted:false`/`linked:false`, not off "is an object" — a read tool's result must
    // not be re-classified as a governance refusal.
    const leg: ToolLeg = () => ({ covered: "src", size: 3 }) as unknown as ToolData
    const v = createHandler({ "atlas-query": leg }).handle("atlas-query", { scope: "src" })

    expect(v.ok).toBe(true)
    expect(faultOf(v)).toBeUndefined()
  })
})

describe("F2/F5 — the fallback reason NAMES THE WRITE KIND when the door set none", () => {
  // A door that fails closed without minting a reason still has to produce an operator-legible one, and the
  // two doors are different failures: `emitted:false` is a GROUNDING refusal, `linked:false` is a sameAs
  // GOVERNANCE refusal. The `d.emitted === false ? … : …` selector is the only thing that distinguishes
  // them, and nothing asserted it — the `!==` mutant (which hands an emit refusal the link message and vice
  // versa) survived the whole package. Cosmetic is not the same as unobservable: this string is what an
  // operator reads when a door fails closed silently.
  it("an emit that fails closed with no reason is reported as an EMIT failure", () => {
    const v = run("atlas-emit", { emitted: false } satisfies EmitOut)

    expect(v.ok).toBe(false)
    expect(v.rejected).toBe("emit failed closed (ungrounded)")
  })

  it("a link that fails closed with no reason is reported as a LINK failure", () => {
    const v = run("atlas-link", { linked: false } satisfies LinkOut)

    expect(v.ok).toBe(false)
    expect(v.rejected).toBe("link failed closed")
  })

  it("a memory-emit that fails closed with no reason is reported as a MEMORY WRITE failure (WP-11.W8)", () => {
    const v = run("atlas-memory-emit", { admitted: false } satisfies MemoryEmitOut)

    expect(v.ok).toBe(false)
    expect(v.rejected).toBe("memory write failed closed")
  })
})
