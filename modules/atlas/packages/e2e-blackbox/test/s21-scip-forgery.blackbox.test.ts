// @atlas/e2e-blackbox — test/s21-scip-forgery.blackbox.test.ts  (S21 — the SHIPPED forged build input)
//
// NARRATIVE: a repository ships a HOSTILE `.atlas/index.scip`. That is not a hypothetical: commit 9d6290b
// refuses a git-TRACKED durable store (`.atlas/projection.json`, `.atlas/cas/**`) precisely because a
// COMMITTED artifact carries rows no door ever saw — and `.atlas/index.scip` is DELIBERATELY EXCLUDED from
// that refusal (`isDurableStorePath`), because it is a build input and is legitimately tracked. So the one
// governed input an attacker can put in the repo and have every reader believe is this file.
//
// It feeds `build(tree, scipOutput)` → `Axes`, and `Axes` is what the truth gate re-derives FRESHNESS
// against. This story drives the REAL `atlas` binary as a subprocess and asks the question in both
// directions, through the doors a user actually touches:
//   (i)   a genuinely grounded fact is ACCEPTED                                       (the honest baseline)
//   (ii)  after the cited code really changes, the same citation is REFUSED           (genuine drift)
//   (iii) with a forged `.scip` engineered to rescue it, it is STILL REFUSED          (no laundering)
//   (iv)  a genuinely fresh citation is STILL ACCEPTED with the forgery in place      (no denial-of-knowledge)
//   (v)   what the forgery DOES move: the dependency-mode blast radius, which is derived from the dump by
//         design. Asserted as the real, bounded consequence — not as a masked failure.
//
// Every EXECUTION and ASSERTION is black-box (subprocess). Product libs are touched ONLY to author the
// input facts and the forged dump — the same discipline as `adversarial-fixtures.ts`.
//
// SYNTHETIC: `src/target.ts` / `src/other.ts` and every symbol below are invented for this suite; the repo
// lives under `os.tmpdir()`.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { create } from "@bufbuild/protobuf"
import {
  serializeSCIP,
  IndexSchema,
  MetadataSchema,
  ToolInfoSchema,
  DocumentSchema,
  OccurrenceSchema,
  SymbolRole,
} from "@c4312/scip"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { subtreeHashOf } from "./adversarial-fixtures.js"
import { ACTOR, RATIFIER, emitFact, invLines, scopedPolicy } from "./support.js"
import type { GroundedFact } from "@atlas/knowledge"
import { draftFact } from "./support.js"

const TARGET = "src/target.ts"
const OTHER = "src/other.ts"
const ORIGINAL = "export function target() {\n  return 1;\n}\n"
const REWRITTEN = "export function target() {\n  return 999; // a real change to the cited unit\n}\n"

const CLAIM_BASE = "target returns one"
const CLAIM_STALE = "target is still one (authored against the OLD bytes)"
const CLAIM_AFTER = "target returns nine-nine-nine"
const CLAIM_OTHER = "other is the dependent unit"

/**
 * THE DISCRIMINANT of a CLI refusal — the reason NAME on the rendered `reason:` line, i.e. everything
 * between `reason: ` and the first `:` after it. The same discipline `adapter-io`'s `reasonOf` documents:
 * the refusal constants QUOTE EACH OTHER BY NAME in their rationale paragraphs, so a `toContain` assertion
 * on a reason string is satisfied by a DIFFERENT reason that merely mentions it. Equality on the name is
 * the contract; the prose is commentary.
 */
function reasonOfStdout(stdout: string): string {
  const line = stdout.split("\n").find((l) => l.startsWith("reason: ")) ?? ""
  return line.slice("reason: ".length).split(":")[0]!
}

/**
 * Overwrite the fixture's `.atlas/index.scip` with an adversarial dump. Every field is attacker-chosen:
 * the metadata names another repository, each `relativePath` is whatever the adversary declares, each
 * symbol NAME is free text (here: the STALE digest the attacker wants believed, and the victim's own
 * qualified path), each role bit is set at will, and each `range` is absurd. This is a REAL, decodable
 * SCIP protobuf — a dump that fails to decode degrades to the empty projection and proves nothing
 * (`scip-corrupt-guard.test.ts` already owns that path). This one is believed by the reader.
 */
function forgeScipInRepo(
  repoPath: string,
  docs: readonly { path: string; symbols: readonly { name: string; def: boolean }[] }[],
): void {
  const index = create(IndexSchema, {
    metadata: create(MetadataSchema, {
      projectRoot: "file:///not/this/repo",
      toolInfo: create(ToolInfoSchema, { name: "scip-typescript", version: "99.99.99" }),
    }),
    documents: docs.map((d) =>
      create(DocumentSchema, {
        relativePath: d.path,
        text: "// forged: this is not the source that was indexed\n",
        occurrences: d.symbols.map((s) =>
          create(OccurrenceSchema, {
            symbol: s.name,
            symbolRoles: s.def ? SymbolRole.Definition : 0,
            range: [0, 0, 999999, 999999],
          }),
        ),
      }),
    ),
  })
  writeFileSync(join(repoPath, ".atlas", "index.scip"), serializeSCIP(index))
}

let repo: FixtureRepo
let staleHash: string // the REAL subtreeHash of src/target.ts BEFORE the rewrite (the citation to launder)
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER
  repo = makeFixtureRepo({
    files: { [TARGET]: ORIGINAL, [OTHER]: "export const other = 2;\n" },
    policy: scopedPolicy("src"),
  })
  staleHash = subtreeHashOf(repo.repoPath, TARGET)
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S21 — a forged `.atlas/index.scip` cannot launder a stale fact into FRESH", () => {
  it("(i) BASELINE: a genuinely grounded fact is accepted and served", () => {
    const emitted = emitFact(repo, draftFact(repo, TARGET, "invariant", CLAIM_BASE).fact)
    expect(emitted.exitCode).toBe(0)
    expect(emitted.stdout).toContain("status: ok")

    const q = runAtlas(repo.repoPath, ["query", "src"])
    expect(q.exitCode).toBe(0)
    expect(q.stdout).toContain(CLAIM_BASE)
  })

  it("(ii) GENUINE DRIFT: after the cited unit really changes, the OLD citation is refused", () => {
    // the developer edits the cited unit — a real change to the bytes the anchor folds.
    repo.commit({ [TARGET]: REWRITTEN })
    // NON-VACUITY: the edit really moved the oracle. A fixture where the hash did not move would make
    // every assertion below pass for the wrong reason.
    expect(subtreeHashOf(repo.repoPath, TARGET)).not.toBe(staleHash)

    // a fact authored against the OLD bytes: same anchor, the STALE digest, a slot nothing occupies yet.
    const stale = staleFact()
    const r = emitFact(repo, stale)
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain("status: rejected")
    expect(reasonOfStdout(r.stdout)).toBe("ungrounded")
  })

  it("(iii) FORGERY: the hostile dump does NOT bring the stale citation back to life", () => {
    // The dump is engineered against this exact fact: it declares the victim's own path, plants the STALE
    // digest as a DEFINITION symbol, plants the victim's qualifiedPath as a symbol, and adds a document
    // whose relativePath IS the stale digest — every string the projection can carry, aimed at the anchor.
    forgeScipInRepo(repo.repoPath, [
      {
        path: TARGET,
        symbols: [
          { name: staleHash, def: true },
          { name: TARGET, def: true },
        ],
      },
      { path: staleHash, symbols: [{ name: staleHash, def: false }] },
      {
        path: OTHER,
        symbols: [
          { name: staleHash, def: false },
          { name: TARGET, def: false },
        ],
      },
    ])
    // NON-VACUITY: the forged dump is REACHING the runtime — proved by the dependency-mode door below,
    // which changes behaviour under exactly this file. If it were being ignored (unreadable/degraded to
    // empty), case (v) would not observe the edge and this suite would be asserting nothing.

    const r = emitFact(repo, staleFact())
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain("status: rejected")
    expect(reasonOfStdout(r.stdout)).toBe("ungrounded") // byte-for-byte the pre-forgery verdict

    // and nothing landed: the stale claim is absent from the read door.
    const q = runAtlas(repo.repoPath, ["query", "src"])
    expect(q.stdout).not.toContain(CLAIM_STALE)
  })

  it("(iv) REVERSE — no denial-of-knowledge: a genuinely fresh citation still commits under the forgery", () => {
    // The forged dump from (iii) is STILL on disk. A citation against the CURRENT bytes must be accepted:
    // a forgery that could knock a live fact over would be a denial-of-knowledge, the mirror of laundering.
    const fresh = draftFact(repo, TARGET, "gotcha", CLAIM_AFTER).fact
    const r = emitFact(repo, fresh)
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("status: ok")

    const q = runAtlas(repo.repoPath, ["query", "src"])
    expect(q.exitCode).toBe(0)
    expect(q.stdout).toContain(CLAIM_AFTER)
  })

  it("(v) WHAT THE FORGERY DOES MOVE: the dependency-mode blast radius follows the dump, by design", () => {
    // The dependency axis IS derived from the dump (`deriveEdges`) — that is its declared input, so this is
    // the honest consequence, recorded so the boundary of the finding is explicit rather than implied.
    const otherFact = draftFact(repo, OTHER, "invariant", CLAIM_OTHER).fact
    expect(emitFact(repo, otherFact).exitCode).toBe(0)

    // FORGERY A: "other depends on target" ⇒ the reverse closure of target contains other.
    forgeScipInRepo(repo.repoPath, [
      { path: TARGET, symbols: [{ name: "sym S", def: true }] },
      { path: OTHER, symbols: [{ name: "sym S", def: false }] },
    ])
    const withEdge = runAtlas(repo.repoPath, ["query", TARGET, "--by", "dependency"])
    expect(withEdge.exitCode).toBe(0)
    expect(withEdge.stdout).toContain(CLAIM_OTHER)

    // FORGERY B: the same repo, the same facts, a dump that declares no edge at all.
    forgeScipInRepo(repo.repoPath, [{ path: TARGET, symbols: [{ name: "sym S", def: true }] }])
    const noEdge = runAtlas(repo.repoPath, ["query", TARGET, "--by", "dependency"])
    expect(noEdge.exitCode).toBe(0)
    expect(invLines(noEdge.stdout)).toStrictEqual([])

    // The SCOPE door — the one that carries the freshness signal — is unmoved by either dump.
    const scoped = runAtlas(repo.repoPath, ["query", "src"])
    expect(scoped.stdout).toContain(CLAIM_OTHER)
    expect(scoped.stdout).toContain(CLAIM_AFTER)
  })
})

/** The fact authored against the PRE-edit bytes: the anchor is real, the cited digest is the stale one.
 *  Built by hand (not through the product `atlas draft` door, which reads the CURRENT hash) because the whole
 *  point is a citation the index no longer corroborates. */
function staleFact(): GroundedFact {
  const live = draftFact(repo, TARGET, "gotcha", CLAIM_STALE).fact
  const entry = live.grounding.entries[0]!
  const anchor = { ...entry.anchor, subtreeHash: staleHash as typeof entry.anchor.subtreeHash }
  return { ...live, claimNorm: CLAIM_STALE, grounding: { entries: [{ ...entry, anchor }] } } as GroundedFact
}
