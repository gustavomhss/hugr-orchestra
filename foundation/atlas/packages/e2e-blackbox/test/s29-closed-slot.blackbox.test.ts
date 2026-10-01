// @atlas/e2e-blackbox — test/s29-closed-slot.blackbox.test.ts  (S29 — a fact whose predicateSlot is not one of the 13)
//
// NARRATIVE: a user (or an agent) authors a perfectly grounded, authorized, ratified fact and declares a
// `predicateSlot` the closed vocabulary does not contain. What does the shipped product do?
//
// THE ANSWER, MEASURED ON THIS TREE BEFORE THE FIX (#152), was: it accepted it. Exit 0, `status: ok`, a
// durable node. And the acceptance was not benign — `nodeKey = hash(primaryAnchorId ‖ predicateSlot)`, so the
// same claim at the same anchor minted DIFFERENT addresses per slot spelling:
//
//   slot 'invariant'           → some id A   (accepted, exit 0)
//   slot 'free-text-whatever'  → some id B   (accepted, exit 0)   ← the defect
//   slot absent                → some id C   (accepted, exit 0)
//   with A, B and C all DISTINCT — which is the whole harm.
//
// The three ids are deliberately NOT quoted here. An earlier revision named specific digests and claimed
// they were "MEASURED ON THIS TREE"; cold review rebuilt master from scratch, drove the real binary over
// THIS story's own fixture, and got different ones — the quoted values came from a fixture nothing in the
// repo records, and no reader could re-derive them. The DISTINCTNESS reproduces exactly and is the claim
// that matters; the digests are a pure function of (path, bytes, claim, scope, tier) and belong to whatever
// fixture produced them. Re-derive by checking out any commit before this one, building, and running the
// three cases below.
//
// That is what closedness exists to prevent: "same topic" is decidable only because the vocabulary is FINITE
// (atlas-knowledge:150), so a free-text slot never collides, `nodeKey` never forces UPDATE/union, and the
// store proliferates parallel nodes at one anchor that never merge. The rule was written down in THREE places
// — the `PredicateSlot` union (types.ts, a type, erased at runtime), `PREDICATE_SLOTS`/`isKnownSlot`
// (router.ts, KNOW-15i) and `CLOSED_SLOTS`/`isClosedSlot` (template.ts, KNOW-10) — and enforced in NONE:
// both runtime membership guards had zero production callers.
//
// WHY THIS STORY AND NOT ONLY A UNIT TEST. The unit suites were ALREADY green on `isClosedSlot('free-text')
// === false` — that is precisely the shape of green this repo has been burned by. The guard was correct and
// nothing called it. Only the binary can answer whether the product refuses; this story asks the binary.
//
// ABSENT IS DELIBERATELY STILL ACCEPTED, and the last case pins that as a decision rather than leaving it to
// be discovered as a hole. MEASURED 2026-08-04 across 300 model calls in two runs: ZERO stored facts carry a
// `predicateSlot` — genesis's only two fact constructors never set it — so fail-closed-on-absent would refuse
// every `atlas mine` and `atlas promote` write from the first day, and `predicateSlot` is R3-OPTIONAL on the
// frozen type, so requiring it is a `cv` bump, not a gate wiring. The argument lives in
// `knowledge/src/write/closed-slot.ts`; this case is its executable statement.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { existsSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { ACTOR, RATIFIER, invLines, scopedPolicy } from "./support.js"
import { draftFact } from "./support.js"

const SRC = "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n"

/** THE DISCRIMINANT — the reason NAME, everything before the first `:`, compared for EQUALITY. Never a
 *  substring: refusal prose in this repo quotes other refusal constants BY NAME, so `toContain` is satisfied
 *  by any paragraph that merely mentions the reason it is supposed to be pinning. */
const reasonOf = (rejected: string | undefined): string => (rejected ?? "").split(":")[0]!

/** The name the closed-slot guard gives its refusal (`knowledge/src/write/closed-slot.ts`). */
const CLOSED_SLOT_VIOLATION = "closed-slot-violation"

/** The `reason: …` line of a CLI outcome, without its label. */
function reasonLine(stdout: string): string {
  const line = stdout.split("\n").find((l) => l.startsWith("reason: "))
  return line === undefined ? "" : line.slice("reason: ".length)
}

let repo: FixtureRepo
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env["ATLAS_ACTOR"]
  priorRatify = process.env["ATLAS_RATIFY_TOKEN"]
  process.env["ATLAS_ACTOR"] = ACTOR
  process.env["ATLAS_RATIFY_TOKEN"] = RATIFIER
  repo = makeFixtureRepo({ files: { "src/greet.ts": SRC }, policy: scopedPolicy("src") })
})

afterAll(() => {
  process.env["ATLAS_ACTOR"] = priorActor
  process.env["ATLAS_RATIFY_TOKEN"] = priorRatify
  repo.cleanup()
})

/** The published sidecar generations — the only evidence that a write went durable. */
function generations(): string[] {
  const dir = join(repo.repoPath, ".atlas")
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /^projection\.\d+\.json$/.test(f))
        .sort()
    : []
}

/** A grounded fact at `src/greet.ts` whose citation re-derives FRESH, with `predicateSlot` OVERRIDDEN to
 *  whatever the case wants — including a value the frozen type forbids, which is the whole point: the wire
 *  is `JSON.parse` + a cast, so the type stops nothing and this is exactly what an author can send. */
function factWithSlot(slot: string | undefined, claim: string): Record<string, unknown> {
  const base = draftFact(repo, "src/greet.ts", "invariant", claim).fact as unknown as Record<string, unknown>
  if (slot === undefined) {
    const { predicateSlot: _dropped, ...rest } = base
    return rest
  }
  return { ...base, predicateSlot: slot }
}

/** Write the fact to a file and drive the REAL `atlas emit` subprocess over it. */
function emitRaw(name: string, fact: Record<string, unknown>): ReturnType<typeof runAtlas> {
  const path = join(repo.repoPath, `s29-${name}.json`)
  writeFileSync(path, JSON.stringify(fact))
  return runAtlas(repo.repoPath, ["emit", path, `--at=${repo.sha()}`])
}

describe("S29 — a fact whose predicateSlot is outside the closed 13", () => {
  it("CONTROL: an IN-VOCABULARY slot is ACCEPTED and goes durable — the refusal below discriminates", () => {
    const run = emitRaw("control", factWithSlot("invariant", "greet returns a greeting"))
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("status: ok")
    expect(generations()).toStrictEqual(["projection.1.json"])
  })

  it("an OUT-OF-VOCABULARY slot is REFUSED at exit 2, nothing persisted (RED before #152: exit 0, accepted)", () => {
    const before = generations()
    const run = emitRaw("outofvocab", factWithSlot("free-text-whatever", "greet is friendly"))
    // Exit 2 / `status: rejected`, like every other governed refusal at this door — NOT exit 1. That
    // distinction was itself measured: the guard raises, and a raw throw reaches `deriveStatus` with no
    // `EmitOut` record, so the first wiring of this gate shipped `exit 1 · status: error` with the right
    // reason. `commitRefusalOf` re-files it as the decision it always was (the same repair task #136 made
    // for the canonical-form violation one gate over).
    expect(run.exitCode).toBe(2)
    expect(run.stdout).toContain("status: rejected")
    expect(reasonOf(reasonLine(run.stdout))).toBe(CLOSED_SLOT_VIOLATION)
    expect(run.stderr).toBe("") // an uncaught throw would land here — it does not
    // THE REASON IS ACTIONABLE: it names the OFFENDING VALUE and the CLOSED VOCABULARY, not just a verdict.
    const reason = reasonLine(run.stdout)
    expect(reason).toContain("'free-text-whatever'")
    for (const s of [
      "invariant",
      "contract",
      "precondition",
      "postcondition",
      "sideeffect",
      "ownership",
      "perf-bound",
      "security-property",
      "gotcha",
      "rationale",
      "dependency",
      "count",
      "definition",
    ]) {
      expect(reason).toContain(`'${s}'`)
    }
    expect(generations()).toStrictEqual(before) // nothing went durable
  })

  it("the refused slot left NO node behind — the address it would have minted is unreadable", () => {
    const run = runAtlas(repo.repoPath, ["query", "src"])
    expect(run.exitCode).toBe(0)
    const rows = invLines(run.stdout)
    // eslint-disable-next-line no-console
    console.log({ servedRows: rows }) // ITEMS, never a bare count
    expect(rows.some((l) => l.includes("greet is friendly"))).toBe(false) // the refused claim is absent
    expect(rows.some((l) => l.includes("greet returns a greeting"))).toBe(true) // the control survived
  })

  it("an ABSENT slot is STILL ACCEPTED — the stated NARROWING, pinned so it is a decision not a hole", () => {
    const before = generations()
    const run = emitRaw("noslot", factWithSlot(undefined, "greet takes one argument"))
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("status: ok")
    expect(generations().length).toBe(before.length + 1) // it DID go durable
    // and it is not an accident of the fixture: the field really is absent on the wire.
    expect("predicateSlot" in factWithSlot(undefined, "x")).toBe(false)
  })

  it("the store still SERVES after the refusal — nothing was left half-applied", () => {
    const run = runAtlas(repo.repoPath, ["query", "src"])
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("status: ok")
  })
})
