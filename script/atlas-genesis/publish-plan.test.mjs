// Tests for the atlas-genesis publish plan. Run: node --test script/atlas-genesis/publish-plan.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { computePlan, leaks, subjectFile, unexpectedRefusals, unitOf } from "./publish-plan.mjs"

const fact = (path, extra = {}) => ({
  kind: "advisory",
  grounding: { entries: [{ anchor: { qualifiedPath: `${path}::f` }, path }] },
  ...extra,
})
const staged = [
  { id: "k-ok-1", contentHash: "c-ok-1", fact: fact("packages/core/src/a.ts") },
  { id: "k-ok-2", contentHash: "c-ok-2", fact: fact("packages/core/src/b.ts") },
  { id: "k-ok-3", contentHash: "c-ok-3", fact: fact("README.ts") },
  { id: "k-quar", contentHash: "c-quar", fact: fact("packages/app/src/q.ts", { quarantine: "abstained-proof" }) },
  { id: "k-false", contentHash: "c-false", fact: fact("packages/cli/src/x.ts") },
  { id: "k-unver", contentHash: "c-unver", fact: fact("packages/cli/src/y.ts") },
]
const judged = [
  { id: "k-ok-1", verdict: "true" },
  { id: "k-false", verdict: "false" },
  { id: "k-unver", verdict: "unverifiable" },
  { id: "k-gone", verdict: "false" }, // judged but no longer staged: not held
]

test("plan: hold judge-false and unverifiable, never promote quarantined, promote the rest", () => {
  const plan = computePlan(staged, judged)
  assert.deepEqual(plan.promote, ["k-ok-1", "k-ok-2", "k-ok-3"])
  assert.deepEqual(plan.held, ["k-false", "k-unver"])
  assert.deepEqual(plan.quarantined, ["k-quar"])
  assert.deepEqual(plan.units, [".", "packages/core/src"]) // only promoted facts' parent directories
  assert.deepEqual(
    plan.excluded.map((e) => [e.id, e.why]),
    [
      ["k-quar", "quarantined"],
      ["k-false", "judged false"],
      ["k-unver", "held"],
    ],
  )
})

test("subjectFile and unitOf", () => {
  assert.equal(subjectFile(fact("a/b.ts")), "a/b.ts")
  assert.equal(subjectFile({ grounding: { entries: [{ anchor: { qualifiedPath: "x/y.py::f" } }] } }), "x/y.py")
  assert.equal(subjectFile({}), undefined)
  assert.equal(unitOf("a/b/c.ts"), "a/b")
  assert.equal(unitOf("c.ts"), ".")
})

test("refusals: only a quarantined refusal is allowed; held rows are not refusals", () => {
  const out = [
    "promote: 2 of 4 staged candidate(s) promoted; 2 refused",
    "  promoted k-ok-1 -> c1",
    "  refused k-quar: quarantined: admitted only because a sound proof abstained",
    "  held k-false",
  ].join("\n")
  assert.deepEqual(unexpectedRefusals(out), [])
  assert.deepEqual(unexpectedRefusals(`${out}\n  refused k-x: unratified: no valid ratifier`), ["k-x: unratified: no valid ratifier"])
})

test("leaks: an excluded fact named by nodeKey or contentHash anywhere is a leak", () => {
  const { excluded } = computePlan(staged, judged)
  assert.deepEqual(leaks(excluded, [{ path: "OWN-SNAPSHOT.json", text: '{"facts":["k-ok-1","c-ok-2"]}' }]), [])
  assert.deepEqual(
    leaks(excluded, [
      { path: "OWN-SNAPSHOT.json", text: '{"facts":["k-ok-1","c-false"]}' },
      { path: ".orchestra/skills/own/x/SKILL.md", text: "- k-quar: something" },
    ]).map((l) => [l.id, l.why, l.at]),
    [
      ["k-false", "judged false", "OWN-SNAPSHOT.json"],
      ["k-quar", "quarantined", ".orchestra/skills/own/x/SKILL.md"],
    ],
  )
})
