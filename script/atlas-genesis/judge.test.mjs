// Tests for the atlas-genesis judge's pure parts. Run: node --test script/atlas-genesis/judge.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { allocate, armOf, factFields, parseVerdict, renderPrompt, sample, sampleSize, score } from "./judge.mjs"

const facts = (arm, n) => Array.from({ length: n }, (_, i) => ({ id: `${arm}-${String(i).padStart(4, "0")}`, arm }))

test("sampleSize: all under 20, else 10% bounded to [20, 60]", () => {
  assert.equal(sampleSize(0), 0)
  assert.equal(sampleSize(19), 19)
  assert.equal(sampleSize(20), 20)
  assert.equal(sampleSize(199), 20)
  assert.equal(sampleSize(201), 21) // ceil(20.1)
  assert.equal(sampleSize(600), 60)
  assert.equal(sampleSize(5000), 60)
})

test("allocate: proportional, ≥1 per arm that staged, never above what an arm staged, sums to n", () => {
  assert.deepEqual(allocate({ advisory: 300, dependency: 90, count: 10 }, 40), { advisory: 30, count: 1, dependency: 9 })
  const q = allocate({ advisory: 1000, dependency: 1, count: 0 }, 20)
  assert.deepEqual(q, { advisory: 19, dependency: 1 }) // the small arm keeps its one; the empty arm gets none
  assert.deepEqual(allocate({ a: 3, b: 2 }, 5), { a: 3, b: 2 })
  for (const counts of [{ a: 7, b: 7, c: 7 }, { a: 50, b: 13, c: 2 }]) {
    const n = 20
    const quota = allocate(counts, n)
    assert.equal(Object.values(quota).reduce((s, x) => s + x, 0), n)
    for (const [arm, k] of Object.entries(quota)) assert.ok(k >= 1 && k <= counts[arm])
  }
})

test("sample: deterministic for one seed, different for another, stratified by arm", () => {
  const eligible = [...facts("advisory", 300), ...facts("dependency", 90), ...facts("count", 10)]
  const a = sample(eligible, "12345")
  assert.deepEqual(sample([...eligible].reverse(), "12345"), a) // input order does not matter
  assert.equal(a.length, 40)
  assert.notDeepEqual(sample(eligible, "67890"), a)
  const perArm = (s) => Object.fromEntries(["advisory", "count", "dependency"].map((arm) => [arm, s.filter((e) => e.arm === arm).length]))
  assert.deepEqual(perArm(a), { advisory: 30, count: 1, dependency: 9 })
  assert.equal(sample(facts("advisory", 7), "1").length, 7) // under 20: every fact
  assert.equal(sample(facts("advisory", 5000), "1").length, 60) // capped
})

test("armOf: the sound slot names its arm; any other slot is semantic; no slot is advisory", () => {
  assert.equal(armOf({ kind: "advisory" }), "advisory")
  assert.equal(armOf({ kind: "advisory", predicateSlot: "dependency", seal: "proven" }), "dependency")
  assert.equal(armOf({ kind: "advisory", predicateSlot: "count" }), "count")
  assert.equal(armOf({ kind: "advisory", predicateSlot: "gotcha", seal: "justified" }), "semantic")
})

test("parseVerdict: exactly one valid line; anything else is null (⇒ retry, then unverifiable)", () => {
  assert.deepEqual(parseVerdict('{"verdict":"true","nonObvious":true,"reason":"line 12 shows it"}\n'), {
    verdict: "true",
    nonObvious: true,
    reason: "line 12 shows it",
  })
  assert.equal(parseVerdict(`{"verdict":"false","nonObvious":false,"reason":"${"x".repeat(300)}"}`).reason.length, 200)
  for (const bad of [
    "",
    "TRUE",
    '{"verdict":"maybe","nonObvious":true,"reason":"r"}',
    '{"verdict":"true","nonObvious":"yes","reason":"r"}',
    '{"verdict":"true","nonObvious":true}',
    'Sure!\n{"verdict":"true","nonObvious":true,"reason":"r"}',
    "{not json",
  ])
    assert.equal(parseVerdict(bad), null, JSON.stringify(bad))
})

const records = (t, tNonObvious, f, u, failed = 0) => [
  ...Array.from({ length: t }, (_, i) => ({ verdict: "true", nonObvious: i < tNonObvious, failed: false })),
  ...Array.from({ length: f }, () => ({ verdict: "false", nonObvious: false, failed: false })),
  ...Array.from({ length: u }, (_, i) => ({ verdict: "unverifiable", nonObvious: false, failed: i < failed })),
]

test("score: the bar at and around its boundaries", () => {
  const atBar = score(records(22, 10, 3, 0), "h") // 22/25 = 0.88, 10/25 = 0.40
  assert.equal(atBar.trueRate, 0.88)
  assert.equal(atBar.trueNonObviousRate, 0.4)
  assert.equal(atBar.pass, true)
  assert.equal(score(records(21, 10, 4, 0), "h").pass, false) // 0.84 true
  assert.equal(score(records(22, 9, 3, 0), "h").pass, false) // 0.36 non-obvious
  // failed calls: 2 of 20 = 10% passes, 3 of 20 does not (true/non-obvious kept above the bar)
  assert.equal(score(records(18, 9, 0, 2, 2), "h").pass, true)
  assert.equal(score(records(18, 9, 0, 2, 2), "h").failedCalls, 2)
  assert.equal(score([...records(18, 9, 0, 2, 2), { verdict: "unverifiable", nonObvious: false, failed: true }], "h").pass, false)
  const empty = score([], "h")
  assert.equal(empty.n, 0)
  assert.equal(empty.pass, false) // nothing judged ⇒ nothing may be published
  assert.equal(empty.promptHash, "h")
})

test("factFields + renderPrompt: the claim, its subject and cited source — never the derivation", () => {
  const repo = mkdtempSync(join(tmpdir(), "atlas-judge-"))
  try {
    mkdirSync(join(repo, "src"), { recursive: true })
    writeFileSync(join(repo, "src/pay.ts"), ["// header", "export function charge(): number {", "  return 1", "}"].join("\n"))
    const fields = factFields(repo, {
      kind: "advisory",
      claimNorm: "charge() always returns 1",
      derivation: "SECRET REASONING",
      grounding: { entries: [{ anchor: { qualifiedPath: "src/pay.ts::charge" }, path: "src/pay.ts" }] },
    })
    const prompt = renderPrompt("{{KIND}}|{{SUBJECT}}|{{CLAIM}}|{{SOURCE}}|{{RELATED}}", fields)
    assert.match(prompt, /^advisory\|src\/pay\.ts::charge\|charge\(\) always returns 1\|/)
    assert.match(prompt, /2: export function charge\(\): number \{/)
    assert.doesNotMatch(prompt, /SECRET REASONING/)
    assert.match(prompt, /\(none\)$/)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
