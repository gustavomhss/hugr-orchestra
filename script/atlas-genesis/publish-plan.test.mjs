// Tests for the atlas-genesis publish plan. Run: node --test script/atlas-genesis/publish-plan.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  computePlan,
  judgeEvidenceProblems,
  leaks,
  promoteProblems,
  subjectFile,
  unitOf,
} from "./publish-plan.mjs"

// Real-shaped identities: a staging row key and a fact `id` are 64-hex nodeKeys; a CAS address is 64-hex too.
const hex = (c) => c.repeat(64)
const fact = (path, id, extra = {}) => ({
  kind: "advisory",
  id,
  tier: "T2",
  claimNorm: `about ${path}`,
  grounding: { entries: [{ anchor: { qualifiedPath: `${path}::f` }, path }] },
  ...extra,
})
const staged = [
  { id: hex("1"), contentHash: hex("a"), fact: fact("packages/core/src/a.ts", hex("1")) },
  { id: hex("2"), contentHash: hex("b"), fact: fact("packages/core/src/b.ts", hex("2")) },
  { id: hex("3"), contentHash: hex("c"), fact: fact("README.ts", hex("3")) },
  // a quarantined row is staged under a DERIVED key; its fact bytes keep the intrinsic nodeKey
  { id: hex("4"), contentHash: hex("d"), fact: fact("packages/app/src/q.ts", hex("9"), { quarantine: "abstained-proof" }) },
  { id: hex("5"), contentHash: hex("e"), fact: fact("packages/cli/src/x.ts", hex("5")) },
  { id: hex("6"), contentHash: hex("f"), fact: fact("packages/cli/src/y.ts", hex("6")) },
]
const judged = [
  { id: hex("1"), verdict: "true" },
  { id: hex("5"), verdict: "false" },
  { id: hex("6"), verdict: "unverifiable" },
  { id: hex("7"), verdict: "false" }, // judged but no longer staged: not held
]

test("plan: hold judge-false and unverifiable, never promote quarantined, promote the rest", () => {
  const plan = computePlan(staged, judged)
  assert.deepEqual(plan.promote, [hex("1"), hex("2"), hex("3")])
  assert.deepEqual(plan.held, [hex("5"), hex("6")])
  assert.deepEqual(plan.quarantined, [hex("4")])
  assert.deepEqual(plan.units, [".", "packages/core/src"])
  assert.deepEqual(
    plan.excluded.map((e) => [e.id, e.why, e.ids]),
    [
      [hex("4"), "quarantined", [hex("4"), hex("9"), hex("d")]], // row key, fact id, CAS address
      [hex("5"), "judged false", [hex("5"), hex("e")]],
      [hex("6"), "held", [hex("6"), hex("f")]],
    ],
  )
})

test("subjectFile and unitOf", () => {
  assert.equal(subjectFile(fact("a/b.ts", "x")), "a/b.ts")
  assert.equal(subjectFile({ grounding: { entries: [{ anchor: { qualifiedPath: "x/y.py::f" } }] } }), "x/y.py")
  assert.equal(subjectFile({}), undefined)
  assert.equal(unitOf("a/b/c.ts"), "a/b")
  assert.equal(unitOf("c.ts"), ".")
})

const ok = (n) =>
  [
    "status: ok",
    `promote: ${n} of ${n} staged candidate(s) promoted; 0 refused`,
    ...Array.from({ length: n }, (_, i) => `  promoted k${i} -> c${i}`),
  ].join("\n")

test("promote check: a clean pass of every planned key is the only success", () => {
  assert.deepEqual(promoteProblems(ok(3), 3), [])
  assert.deepEqual(promoteProblems(ok(2), 3), ["2 promoted, 3 planned"])
})

test("promote check: a staging read refusal fails", () => {
  const out = "status: rejected\nnext: promote read nothing — the staging sidecar refused (unreadable). …\n"
  assert.deepEqual(promoteProblems(out, 3), ["promote read nothing: the staging read refused"])
})

test("promote check: a planned key that is not staged fails", () => {
  const out = `${ok(2)}\n  not staged kX — no staged candidate has this nodeKey`
  assert.deepEqual(promoteProblems(out, 3), ["planned key kX is not staged", "2 promoted, 3 planned"])
})

test("promote check: ANY refusal fails (quarantined rows are never in the plan); a reason with ': ' parses", () => {
  const out = [
    "promote: 2 of 3 staged candidate(s) promoted; 1 refused",
    "  promoted k0 -> c0",
    "  promoted k1 -> c1",
    "  refused k2: unratified: no valid ratifier: named",
  ].join("\n")
  assert.deepEqual(promoteProblems(out, 3), ["refused k2: unratified: no valid ratifier: named", "2 promoted, 3 planned"])
  assert.deepEqual(promoteProblems("promote: 3 of 3 staged candidate(s) promoted; 1 refused", 3), ["1 refused, no row named"])
  assert.deepEqual(promoteProblems("status: ok\n", 1), ["no `promote:` summary line in the output"])
})

test("judge evidence: missing, failing or incomplete evidence stops the publish", () => {
  const sample = JSON.stringify({ facts: [{ id: "a" }, { id: "b" }] })
  const jsonl = '{"id":"a"}\n{"id":"b"}\n'
  const pass = JSON.stringify({ pass: true })
  assert.deepEqual(judgeEvidenceProblems({ jsonl, verdict: pass, sample }), [])
  assert.match(judgeEvidenceProblems({ verdict: pass, sample })[0], /judge\.jsonl is missing/)
  assert.match(judgeEvidenceProblems({ jsonl, sample })[0], /judge-verdict\.json is missing/)
  assert.deepEqual(judgeEvidenceProblems({ jsonl, verdict: JSON.stringify({ pass: false }), sample }), [
    "judge-verdict.json does not record a pass",
  ])
  assert.deepEqual(judgeEvidenceProblems({ jsonl: '{"id":"a"}\n', verdict: pass, sample }), [
    "judge.jsonl has 1 record(s) for 2 sampled fact(s)",
  ])
})

/** An OWN-SNAPSHOT.json in the shape the retrieval contract validates (own-snapshot.ts): a unit's pack carries
 *  `invariants[].nodeId` and `facts[].id`, both nodeKeys. */
const snapshotNaming = (ids) =>
  JSON.stringify({
    version: 1,
    sourceRevision: "0".repeat(40),
    units: [
      {
        unit: { id: "packages/core/src", level: "module", grounding: {} },
        pack: {
          unit: "packages/core/src",
          invariants: [{ nodeId: ids[0], claim: "c", tier: "T2", freshness: "FRESH" }],
          facts: ids.slice(1).map((id) => ({ id, kind: "advisory", claimNorm: "c", tier: "T2", freshness: "FRESH" })),
        },
        sourceBlobs: { "packages/core/src/a.ts": "e".repeat(40) },
      },
    ],
  })

test("leaks: an excluded fact named by any of its ids, as an exact token, in the snapshot or a skill", () => {
  const { excluded } = computePlan(staged, judged)
  assert.deepEqual(leaks(excluded, [{ path: "OWN-SNAPSHOT.json", text: snapshotNaming([hex("1"), hex("2")]) }]), [])
  assert.deepEqual(
    leaks(excluded, [
      { path: "OWN-SNAPSHOT.json", text: snapshotNaming([hex("1"), hex("9")]) }, // quarantined, by its fact id
      { path: ".orchestra/skills/own/core/SKILL.md", text: `- ${hex("5")}: judged false` },
    ]).map((l) => [l.id, l.why, l.at]),
    [
      [hex("4"), "quarantined", "OWN-SNAPSHOT.json"],
      [hex("5"), "judged false", ".orchestra/skills/own/core/SKILL.md"],
    ],
  )
})

test("leaks: no false positive when an excluded id is only part of a longer token", () => {
  const { excluded } = computePlan(staged, judged)
  const longer = `${hex("5")}ff`
  assert.deepEqual(leaks(excluded, [{ path: "OWN-SNAPSHOT.json", text: snapshotNaming([hex("1"), longer]) }]), [])
})
