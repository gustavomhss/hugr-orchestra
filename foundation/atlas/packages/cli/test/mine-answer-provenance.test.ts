// @atlas/cli — test/mine-answer-provenance.test.ts  (#195 b — the mined answer's CAS receipt, end to end)
//
// The mine emit path (`decideStaging`) must, for a fact the gate admitted from a model claim:
//   (b) put the SCRUBBED answer to CAS and stamp `answerRef` (its CAS id) on the row — resolvable back, and
//       its OWN tamper-evidence: `id(fetchedBytes) === answerRef` (store.get re-hashes on read).
//   (c) SCRUB BEFORE CAS — a secret in the answer never reaches CAS raw (the billy-critical property).
//   + additive tolerance — a fact with NO rawAnswer (human write / test double) carries NO `answerRef`.
//   + identity — `rawAnswer` is a NON-IDENTITY transport field: contentHash/nodeKey are byte-identical with
//     or without it (it is stripped before any hash).

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { emptyStore } from "@atlas/knowledge"
import { createDiskStore } from "@atlas/adapter-io"
import type { CasPath } from "@atlas/adapter-io"
import { asHash, id } from "@atlas/kernel"
import { scrub } from "@atlas/persist"
import { decideStaging } from "../src/mine-decide.js"
import { A, ZERO_SIGNALS, factFor } from "./mine-fixtures.js"
import type { Candidate, Fact } from "@atlas/genesis"

const cand: Candidate = { site: A, signals: ZERO_SIGNALS, ppr: 1, rank: 0 }
/** A fact as the gate hands it to the emit path, optionally carrying the mine-gate transport field `rawAnswer`. */
const minedFact = (claim: string, rawAnswer?: string): Fact =>
  (rawAnswer !== undefined ? { ...factFor(cand, claim), rawAnswer } : factFor(cand, claim)) as unknown as Fact

const dirs: string[] = []
const freshStore = () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-mine-answer-"))
  dirs.push(dir)
  return createDiskStore(dir as unknown as CasPath)
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe("decideStaging — #195 b the mined answer receipt", () => {
  it("(b) stamps answerRef, resolves the SCRUBBED answer in CAS, and re-hashes to answerRef (tamper-evidence)", () => {
    const store = freshStore()
    const dec = decideStaging(emptyStore(), [minedFact("greet greets", "greet returns a greeting")], new Map())
    for (const o of dec.put!) store.put(o) // the pass makes CAS bytes durable before the row publishes

    const row = [...dec.next!.current.values()][0]!
    expect(row.answerRef).toBeDefined()

    const content = store.get(asHash(row.answerRef!))
    expect(content).toBe("greet returns a greeting") // exactly the (scrubbed, here secret-free) answer bytes
    // the CAS id IS the digest: re-hashing the fetched bytes reproduces answerRef. No separate answerDigest.
    expect(id(content as string) as unknown as string).toBe(row.answerRef)
  })

  it("(c) SCRUB-BEFORE-CAS — a secret in the answer is redacted before it reaches CAS (billy)", () => {
    const store = freshStore()
    const secret = "ghp_SYNTHETICNOTAREALTOKEN01" // a synthetic GitHub-token SHAPE (redacted by @atlas/persist scrub)
    const answer = `the fix is to use ${secret} as the key`
    // independent oracle: scrub really removes it (guards against a fixture that was never a secret shape).
    expect(Buffer.from(scrub(Buffer.from(answer, "utf8"))).toString("utf8")).not.toContain(secret)

    const dec = decideStaging(emptyStore(), [minedFact("use the key", answer)], new Map())

    // the RAW secret never appears anywhere in the CAS objects this pass will store.
    expect(JSON.stringify(dec.put!)).not.toContain(secret)
    for (const o of dec.put!) store.put(o)
    const row = [...dec.next!.current.values()][0]!
    const stored = store.get(asHash(row.answerRef!)) as string
    expect(stored).not.toContain(secret) // the secret did NOT reach CAS
    expect(stored).toContain("[REDACTED]") // it was redacted at source, record preserved
  })

  it("additive tolerance — a fact with NO rawAnswer carries NO answerRef (human write / test double)", () => {
    const dec = decideStaging(emptyStore(), [minedFact("no answer here")], new Map())
    const row = [...dec.next!.current.values()][0]!
    expect(row.answerRef).toBeUndefined()
  })

  it("identity — rawAnswer is a non-identity transport field: contentHash/nodeKey are unchanged by it", () => {
    const withAnswer = decideStaging(emptyStore(), [minedFact("same claim", "an answer envelope")], new Map())
    const without = decideStaging(emptyStore(), [minedFact("same claim")], new Map())
    const rw = [...withAnswer.next!.current.values()][0]!
    const ro = [...without.next!.current.values()][0]!
    expect(rw.nodeKey).toBe(ro.nodeKey)
    expect(rw.contentHash).toBe(ro.contentHash) // the receipt never entered the fact's content hash
    expect(rw.answerRef).toBeDefined()
    expect(ro.answerRef).toBeUndefined()
  })
})
