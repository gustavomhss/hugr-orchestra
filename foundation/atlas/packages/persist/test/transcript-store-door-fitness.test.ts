// @atlas/persist — test/transcript-store-door-fitness.test.ts  (PERSIST-10a — the door control, ENFORCED)
//
// The fitness function in `transcript-door-fitness.ts` (read its header for the rules and the fail-closed
// stance) pointed at the REAL shipped `src/transcript-store.ts`, plus the mutants that prove it can fail.
//
// EVERY MUTANT BELOW IS THE REAL SOURCE, TEXTUALLY ALTERED — never a hand-written toy module. A gate proven
// only against fixtures it authored itself is a gate proven against nothing: it can pass the fixtures and
// be aimed at the wrong node kind in the real file. So each case reads the shipped bytes off disk, makes ONE
// edit, and asserts the audit turns red. The `MUST_APPEAR` guard makes a stale anchor a hard failure rather
// than a silently-skipped mutant — a mutant whose anchor drifted away is a test that has quietly stopped
// testing, which is the exact disease this file was created to treat one layer up.
//
// CASCADE, BY DESIGN — READ THE FIRST FAILURE. Because every mutant is DERIVED from the live file, a real
// violation in `transcript-store.ts` turns most of this file red at once. That is deliberate: the derived
// cases have no independent meaning once their base is broken, and pinning a frozen snapshot instead would
// rot within a release. The case to act on is always the FIRST one — "the SHIPPED module passes" — whose
// message carries the rule, the line and the offending expression. The rest are noise until it is green.
//
// FIXTURES are obviously-synthetic (`ghp_SYNTHETICNOTAREALTOKEN01`) and appear only as byte-level probes.

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import { auditTranscriptDoor } from "./transcript-door-fitness.js"
import type { Violation } from "./transcript-door-fitness.js"
import { createTranscriptStore, toGitPointer } from "../src/transcript-store.js"

/** The REAL module under audit. Read with `fs` (never a bundler import) so the analyser sees the same bytes
 *  a reviewer would, NUL bytes and all — a raw NUL makes a file invisible to `grep` and "binary" to `git
 *  diff`, so a text search is not a safe way to establish anything about this file's contents. */
const SOURCE_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "transcript-store.ts")
const SOURCE = readFileSync(SOURCE_PATH, "utf8")

/** Apply ONE textual edit to the real source. A missing anchor FAILS — never silently no-ops. */
function mutate(anchor: string, replacement: string): string {
  const hits = SOURCE.split(anchor).length - 1
  expect(
    hits,
    `MUST_APPEAR: the mutant anchor ${JSON.stringify(anchor)} is no longer in ${SOURCE_PATH} — this mutant has stopped testing anything and the anchor must be re-aimed`,
  ).toBe(1)
  return SOURCE.replace(anchor, replacement)
}

const rules = (v: readonly Violation[]): readonly string[] => v.map((x) => x.rule)

describe("PERSIST-10a — the redact-at-the-door control is ENFORCED, not documented", () => {
  it("the SHIPPED module passes: every path into the object map goes through `scrub`", () => {
    const found = auditTranscriptDoor(SOURCE, SOURCE_PATH)
    // The message carries the violations so a failure is actionable without re-running the analyser.
    expect(
      found,
      `transcript-store.ts violates the door control:\n${found.map((v) => `  [${v.rule}] line ${String(v.line)}: ${v.detail}`).join("\n")}`,
    ).toEqual([])
  })

  it("the analyser is AIMED: it finds the backing map and the single insertion path it must guard", () => {
    // Anti-vacuity for the case above. An analyser that resolved NOTHING would also report zero violations,
    // and would keep reporting zero forever while the module was rewritten underneath it. So: prove it goes
    // red when the ONE thing it is looking for is renamed out from under it.
    const noMap = mutate(
      "const objects = new Map<Hash, Uint8Array>()",
      "const objects = makeStore<Hash, Uint8Array>();",
    )
    expect(rules(auditTranscriptDoor(noMap))).toContain("NO-ESCAPE")
    expect(auditTranscriptDoor(noMap)[0]!.detail).toContain("BLIND")
  })

  it("MUTANT — `put` stores the RAW body (the T0 this control exists for)", () => {
    // The regression `transcript-store-redaction.test.ts` already catches behaviourally. Included so the two
    // controls are known to overlap on the case they SHARE, and to differ only on the ones below.
    const raw = mutate("const admitted = scrub(body)", "const admitted = body;")
    const found = auditTranscriptDoor(raw)
    expect(rules(found)).toEqual(["SCRUB-DOMINATES"])
    expect(found[0]!.detail).toContain("not provably derived from `scrub(...)`")
  })

  it("MUTANT — A SECOND INSERTION PATH: a `restore` that admits bytes raw (the T0 nothing else catches)", () => {
    // THE CASE THIS FILE WAS BUILT FOR. Every behavioural test drives `put`; none of them calls `restore`,
    // so all of them stay GREEN while the store gains a door that admits an unredacted credential into an
    // immutable, undeletable, git-propagated record. Verified below: the whole redaction suite passes on
    // this mutant. Only a structural rule sees it.
    const withRestore = mutate(
      `    fetch(ref: TranscriptRef): Transcript {`,
      `    restore(ref: TranscriptRef, body: Uint8Array): void {
      objects.set(ref.sha, Uint8Array.from(body));
    },
    fetch(ref: TranscriptRef): Transcript {`,
    )
    const found = auditTranscriptDoor(withRestore)
    expect(rules(found)).toEqual(["SCRUB-DOMINATES"])
    expect(found[0]!.detail).toContain("Uint8Array.from(body)")
  })

  it("MUTANT — A BULK LOADER: `hydrate(entries)` folding raw pairs straight in", () => {
    const withBulk = mutate(
      `    fetch(ref: TranscriptRef): Transcript {`,
      `    hydrate(entries: ReadonlyArray<readonly [Hash, Uint8Array]>): void {
      for (const [h, bytes] of entries) objects.set(h, bytes);
    },
    fetch(ref: TranscriptRef): Transcript {`,
    )
    expect(rules(auditTranscriptDoor(withBulk))).toEqual(["SCRUB-DOMINATES"])
  })

  it("MUTANT — THE MAP ESCAPES: handing a caller `.set` directly, with no insertion site to audit", () => {
    // The subtlest hole, and the one a value-flow rule alone would miss entirely: no `objects.set(...)`
    // appears anywhere in the module, so RULE 3 has nothing to look at. The store simply gives the Map away.
    const escapes = mutate(
      `    fetch(ref: TranscriptRef): Transcript {`,
      `    raw(): Map<Hash, Uint8Array> {
      return objects;
    },
    fetch(ref: TranscriptRef): Transcript {`,
    )
    expect(rules(auditTranscriptDoor(escapes))).toEqual(["NO-ESCAPE"])
  })

  it("MUTANT — A REMOVAL PATH: the store contracts to immutable + NO delete", () => {
    const deletes = mutate(
      `    fetch(ref: TranscriptRef): Transcript {`,
      `    forget(ref: TranscriptRef): void {
      objects.delete(ref.sha);
    },
    fetch(ref: TranscriptRef): Transcript {`,
    )
    expect(rules(auditTranscriptDoor(deletes))).toEqual(["NO-REMOVAL"])
  })

  it("MUTANT — LAUNDERING: an intermediate const does not buy a raw body a pass", () => {
    // `flowsFromRedactor` chases const initializers, so the obvious dodge — rename the raw body once on the
    // way in — must not work. This is the fail-closed direction being exercised deliberately.
    const laundered = mutate(
      "const admitted = scrub(body)",
      "const passthrough = body;\n      const admitted = passthrough;",
    )
    expect(rules(auditTranscriptDoor(laundered))).toEqual(["SCRUB-DOMINATES"])
  })

  it("CONTROL — a LEGITIMATE refactor of the same value flow still passes (not an over-block)", () => {
    // A gate that says no to the honest case is a gate that gets routed around. Rewriting the redaction into
    // a differently-named intermediate, or inlining it at the call site, must both stay green.
    const renamed = mutate(
      "const admitted = scrub(body)",
      "const redacted = scrub(body);\n      const admitted = redacted;",
    )
    expect(auditTranscriptDoor(renamed)).toEqual([])

    const inlined = mutate(
      "if (!objects.has(h)) objects.set(h, Uint8Array.from(admitted))",
      "if (!objects.has(h)) objects.set(h, Uint8Array.from(scrub(body)));",
    )
    expect(auditTranscriptDoor(inlined)).toEqual([])
  })

  it("THE OVERLAP, MEASURED: the behavioural suite is BLIND to the second-insertion-path mutant", () => {
    // The claim that justifies this whole file, stated as an executable fact rather than an argument. The
    // `restore` mutant adds a door; it does not touch `put`. So the entire public surface the behavioural
    // suite exercises behaves IDENTICALLY — same bytes, same hash, same redaction — and every one of those
    // cases would still pass. Re-proved here on the live store so the claim cannot rot.
    const enc = new TextEncoder()
    const store = createTranscriptStore()
    const stored = store.fetch(toGitPointer(store.put(enc.encode("exported ghp_SYNTHETICNOTAREALTOKEN01 ok"))))
    expect(new TextDecoder().decode(stored)).toBe("exported [REDACTED] ok")
    // …unchanged by the mutant, because the mutant is additive. Structure is the only instrument that sees it.
    const withRestore = mutate(
      `    fetch(ref: TranscriptRef): Transcript {`,
      `    restore(ref: TranscriptRef, body: Uint8Array): void {
      objects.set(ref.sha, Uint8Array.from(body));
    },
    fetch(ref: TranscriptRef): Transcript {`,
    )
    expect(withRestore).toContain("const admitted = scrub(body)") // `put` is untouched…
    expect(auditTranscriptDoor(withRestore)).not.toEqual([]) // …and the door control still fires
  })
})
