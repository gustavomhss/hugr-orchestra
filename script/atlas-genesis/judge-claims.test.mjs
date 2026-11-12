// Remote only: build Atlas before running this file. Read the real candidate store, not a copied projection.
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { createDiskStore } from "../../modules/atlas/packages/adapter-io/dist/src/index.js"
import { id } from "../../modules/atlas/packages/kernel/dist/src/index.js"
import { nodeKey, normalizeCheck, upsert } from "../../modules/atlas/packages/knowledge/dist/src/index.js"
import { main, sample, score, stagedFacts } from "./judge.mjs"
import { computePlan, judgeEvidenceProblems, leaks } from "./publish-plan.mjs"

const PROMPT = "a".repeat(64)
const grounding = { entries: [{ path: "src/cache.ts", anchor: {
  kind: "file", qualifiedPath: "src/cache.ts", subtreeHash: "b".repeat(64),
} }] }
const first = { kind: "advisory", id: "src/cache.ts", tier: "T2", scope: "atlas:mined",
  claimNorm: "reads touch recency", derivation: "the hit branch calls touch", grounding }
const second = { ...first, claimNorm: "misses leave recency unchanged", derivation: "the miss returns before touch" }
const KEY = String(nodeKey(first))
const FACTS = [first, second].map((fact) => ({
  id: `${KEY}:${id(fact)}`, nodeKey: KEY, contentHash: String(id(fact)), fact,
}))

function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), "atlas-judge-claims-"))
  t.after(() => rmSync(repo, { recursive: true, force: true }))
  mkdirSync(join(repo, "modules"))
  symlinkSync(fileURLToPath(new URL("../../modules/atlas", import.meta.url)), join(repo, "modules/atlas"), "dir")
  mkdirSync(join(repo, "src"))
  writeFileSync(join(repo, "src/cache.ts"), "export const cache = new Map()\n")
  const store = createDiskStore(join(repo, ".atlas/cas"))
  const answer = '```atlas-fact\n{"facts":[{"claim":"reads touch recency"},{"claim":"misses leave recency unchanged"}]}\n```'
  const answerRef = String(id(answer))
  const committed = store.commitStaging((snapshot) => ({
    next: [first, second].reduce((projection, fact) => upsert(projection, {
      nodeKey: KEY, family: "advisory", contentHash: String(id(fact)), claimNorm: fact.claimNorm,
      tier: "T2", scope: "atlas:mined", primaryAnchor: "src/cache.ts", answerRef,
      claimEvidenceByClaim: { [fact.claimNorm]: { factRef: String(id(fact)), answerRef } },
    }).store, snapshot),
    put: [answer, first, second], out: undefined,
  }))
  assert.equal(committed.settled, true)
  return { repo, store, answerRef }
}

test("judge enumerates both independently resolvable claims at one place, with distinct sample IDs", async (t) => {
  const f = fixture(t)
  const candidates = await stagedFacts(f.repo)
  assert.deepEqual(candidates, FACTS)
  assert.deepEqual(sample(candidates.map((entry) => ({ ...entry, arm: "advisory" })), "fixed").map((entry) => entry.id).sort(), FACTS.map((entry) => entry.id).sort())
})

test("a valid legacy predicate uses the actual normalized-check identity implementation", async (t) => {
  const f = fixture(t)
  const { claimNorm, ...base } = first
  const fact = { ...base, kind: "predicate", predicateSlot: "invariant", check: { kind: "index-query", query: "references(cache).count >= 1" } }
  const key = String(nodeKey({ ...fact, slot: fact.predicateSlot }))
  const contentHash = String(id(fact))
  assert.equal(f.store.commitStaging((projection) => ({
    out: true, put: [fact], next: { ...projection, current: new Map([[key, {
      nodeKey: key, family: "predicate", contentHash, claims: [normalizeCheck(fact.check)],
      primaryAnchor: "src/cache.ts", scope: "atlas:mined", tier: "T2", slot: fact.predicateSlot,
    }]]) },
  })).settled, true)
  assert.deepEqual(await stagedFacts(f.repo), [{ id: key, nodeKey: key, contentHash, fact }])
  assert.equal(f.store.commitStaging((projection) => ({
    out: true, next: { ...projection, current: new Map([[key, { ...projection.current.get(key), claimEvidenceByClaim: null }]]) },
  })).settled, true)
  await assert.rejects(stagedFacts(f.repo), /invalid claim receipt/)
})

test("judge refuses an unreadable non-representative claim receipt instead of silently judging only the latest", async (t) => {
  const f = fixture(t)
  const hash = String(id(first))
  rmSync(join(f.repo, ".atlas/cas", hash.slice(0, 2), hash))
  await assert.rejects(stagedFacts(f.repo), /claim|receipt|CAS/i)
})

for (const fault of ["missing entry", "sibling fact", "missing answer", "corrupt answer"]) {
  test(`judge validates each claim and its answer receipt: ${fault}`, async (t) => {
    const f = fixture(t)
    if (fault === "missing answer" || fault === "corrupt answer") {
      const path = join(f.repo, ".atlas/cas", f.answerRef.slice(0, 2), f.answerRef)
      if (fault === "missing answer") rmSync(path)
      if (fault === "corrupt answer") writeFileSync(path, '"tampered receipt"')
    }
    if (fault === "missing entry" || fault === "sibling fact") {
      const changed = f.store.commitStaging((snapshot) => {
        const row = snapshot.current.get(KEY)
        const receipts = { ...row.claimEvidenceByClaim }
        if (fault === "missing entry") delete receipts[first.claimNorm]
        if (fault === "sibling fact") receipts[first.claimNorm] = receipts[second.claimNorm]
        return { out: true, next: { ...snapshot, current: new Map([[KEY, { ...row, claimEvidenceByClaim: receipts }]]) } }
      })
      assert.equal(changed.settled, true)
    }
    await assert.rejects(stagedFacts(f.repo), /claim|receipt|CAS|answer/i)
  })
}

test("actual prepare and score commands preserve per-claim parent and CAS identities on disk", async (t) => {
  const f = fixture(t)
  const dir = join(f.repo, "judge")
  assert.equal(await main(["prepare", dir, "--repo", f.repo, "--seed", "fixed"]), 0)
  const meta = JSON.parse(readFileSync(join(dir, "sample.json")))
  assert.equal(meta.facts.length, 2)
  for (const entry of FACTS) {
    assert.deepEqual(meta.facts.find((row) => row.id === entry.id), {
      id: entry.id, nodeKey: KEY, contentHash: entry.contentHash, arm: "advisory",
    })
  }
  for (const [i, entry] of meta.facts.entries()) {
    const stem = String(i).padStart(3, "0")
    assert.ok(readFileSync(join(dir, `${stem}.prompt`), "utf8").includes(FACTS.find((fact) => fact.id === entry.id).fact.claimNorm))
    writeFileSync(join(dir, `${stem}.out`), '{"verdict":"true","nonObvious":true,"reason":"synthetic command control"}\n')
  }
  assert.equal(await main(["score", dir, "--binding"]), 0)
  assert.deepEqual(judgeEvidenceProblems({
    sample: readFileSync(join(dir, "sample.json"), "utf8"),
    jsonl: readFileSync(join(dir, "judge.jsonl"), "utf8"),
    verdict: readFileSync(join(dir, "judge-verdict.json"), "utf8"),
  }), [])
})

for (const verdict of ["false", "unverifiable"]) test(`one ${verdict} claim holds its entire place and every sibling receipt stays excluded`, () => {
  const judged = FACTS.map((entry, i) => ({ id: entry.id, nodeKey: KEY, verdict: i === 0 ? verdict : "true" }))
  const plan = computePlan(FACTS, judged)
  assert.deepEqual(plan.promote, [])
  assert.deepEqual(plan.held, [KEY])
  assert.equal(plan.excluded.length, 1)
  for (const token of [KEY, ...FACTS.flatMap((entry) => [entry.id, entry.contentHash])])
    assert.ok(plan.excluded[0].ids.includes(token), `excluded sibling token ${token}`)
  for (const hash of FACTS.map((entry) => entry.contentHash))
    assert.equal(leaks(plan.excluded, [{ path: "snapshot.json", text: JSON.stringify({ factRef: hash }) }]).length, 1)
})

test("a quarantined claim excludes every sibling receipt at its place", () => {
  const quarantined = computePlan([{ ...FACTS[0], fact: { ...first, quarantine: "unproven" } }, FACTS[1]], [])
  assert.deepEqual(quarantined.promote, [])
  assert.deepEqual(quarantined.quarantined, [KEY])
  assert.equal(quarantined.excluded.length, 1)
  for (const token of [KEY, ...FACTS.flatMap((entry) => [entry.id, entry.contentHash])])
    assert.ok(quarantined.excluded[0].ids.includes(token), `quarantined sibling token ${token}`)
  for (const hash of FACTS.map((entry) => entry.contentHash))
    assert.equal(leaks(quarantined.excluded, [{ path: "snapshot.json", text: JSON.stringify({ factRef: hash }) }]).length, 1)
})

test("passing individual claims promote their parent only once; legacy single-claim IDs still work", () => {
  const plan = computePlan(FACTS, FACTS.map((entry) => ({ id: entry.id, nodeKey: KEY, verdict: "true" })))
  assert.deepEqual(plan.promote, [KEY])
  assert.deepEqual(plan.held, [])
  assert.deepEqual(plan.units, ["src"])
  assert.deepEqual(plan.excluded, [])
  const legacy = { id: KEY, contentHash: FACTS[0].contentHash, fact: first }
  assert.deepEqual(computePlan([legacy], [{ id: KEY, verdict: "true" }]).promote, [KEY])
})

function evidence(records = FACTS.map((entry) => ({
  id: entry.id, nodeKey: KEY, contentHash: entry.contentHash, arm: "advisory",
  verdict: "true", nonObvious: true, reason: "source supports it", failed: false,
}))) {
  return {
    jsonl: records.map((record) => JSON.stringify(record)).join("\n") + "\n",
    verdict: JSON.stringify(score(records, PROMPT)),
    sample: JSON.stringify({ promptHash: PROMPT, facts: FACTS.map((entry) => ({
      id: entry.id, nodeKey: KEY, contentHash: entry.contentHash, arm: "advisory",
    })) }),
  }
}

test("publication reconciles exact per-claim sample identity and recomputes the bar instead of trusting pass:true", () => {
  assert.deepEqual(judgeEvidenceProblems(evidence()), [])
  const records = evidence().jsonl.trim().split("\n").map((line) => JSON.parse(line))
  const duplicate = evidence([records[0], records[0]])
  assert.ok(judgeEvidenceProblems(duplicate).length > 0, "same count with duplicate claim IDs must refuse")
  const wrongParent = evidence([{ ...records[0], nodeKey: "c".repeat(64) }, records[1]])
  assert.ok(judgeEvidenceProblems(wrongParent).length > 0, "parent mismatch must refuse")
  const wrongRef = evidence([{ ...records[0], contentHash: "d".repeat(64) }, records[1]])
  assert.ok(judgeEvidenceProblems(wrongRef).length > 0, "individual receipt mismatch must refuse")
  const failed = evidence(records.map((record) => ({ ...record, verdict: "unverifiable" })))
  failed.verdict = evidence().verdict
  assert.ok(judgeEvidenceProblems(failed).length > 0, "copied passing summary cannot conceal a failing actual sample")
  const wrongPrompt = evidence()
  wrongPrompt.sample = JSON.stringify({ ...JSON.parse(wrongPrompt.sample), promptHash: "e".repeat(64) })
  assert.ok(judgeEvidenceProblems(wrongPrompt).length > 0, "judge and sample must bind the same prompt")
})

async function mutation(file, needle, replacement) {
  const url = new URL(file, import.meta.url)
  const source = readFileSync(url, "utf8")
  assert.equal(source.split(needle).length, 2, `unique production mutation target: ${file}`)
  const changed = source.replace(needle, replacement).replaceAll("import.meta.url", JSON.stringify(url.href))
  const resolved = ["./judge.mjs", "./judge-source.mjs", "./judge-index.mjs"].reduce((text, module) =>
    text.replaceAll(`from "${module}"`, `from ${JSON.stringify(new URL(module, url).href)}`), changed)
  return import(`data:text/javascript;base64,${Buffer.from(resolved).toString("base64")}`)
}

test("production mutation: judging only the representative claim cannot satisfy the two-claim assertion", async (t) => {
  const f = fixture(t)
  const oracle = async (reader) => assert.deepEqual(await reader(f.repo), FACTS)
  await oracle(stagedFacts)
  const changed = await mutation("./judge.mjs", "const entries = row.claims.map((claim) => {", "const entries = row.claims.slice(-1).map((claim) => {")
  await assert.rejects(() => oracle(changed.stagedFacts), { code: "ERR_ASSERTION" })
})

test("production mutation: a valid sibling CAS fact cannot stand in for another claim", async (t) => {
  const f = fixture(t)
  assert.equal(f.store.commitStaging((projection) => {
    const row = projection.current.get(KEY)
    return { out: true, next: { ...projection, current: new Map([[KEY, { ...row,
      claimEvidenceByClaim: { ...row.claimEvidenceByClaim, [first.claimNorm]: row.claimEvidenceByClaim[second.claimNorm] },
    }]]) } }
  }).settled, true)
  const oracle = async (reader) => assert.rejects(reader(f.repo), /claim does not match CAS fact/)
  await oracle(stagedFacts)
  const changed = await mutation("./judge.mjs", "factClaim === claim && ", "")
  await assert.rejects(() => oracle(changed.stagedFacts), { code: "ERR_ASSERTION" })
})

test("production mutation: missing individual answer bytes cannot pass receipt preflight", async (t) => {
  const f = fixture(t)
  rmSync(join(f.repo, ".atlas/cas", f.answerRef.slice(0, 2), f.answerRef))
  const oracle = async (reader) => assert.rejects(reader(f.repo), /CAS answer unavailable/)
  await oracle(stagedFacts)
  const changed = await mutation("./judge.mjs", 'typeof store.get(receipt.answerRef) === "string"', "true")
  await assert.rejects(() => oracle(changed.stagedFacts), { code: "ERR_ASSERTION" })
})

test("production mutation: holding only the failed leaf cannot publish its same-place sibling", async () => {
  const judged = FACTS.map((entry, i) => ({ id: entry.id, verdict: i ? "true" : "false" }))
  const oracle = (plan) => assert.deepEqual(plan(FACTS, judged).promote, [])
  oracle(computePlan)
  const changed = await mutation("./publish-plan.mjs", "const parentOf = (entry) => entry.nodeKey ?? entry.id", "const parentOf = (entry) => entry.id")
  assert.throws(() => oracle(changed.computePlan), { code: "ERR_ASSERTION" })
})

test("production mutation: copied passing summaries cannot replace scoring actual verdicts", async () => {
  const records = evidence().jsonl.trim().split("\n").map((line) => ({ ...JSON.parse(line), verdict: "unverifiable" }))
  const files = { ...evidence(records), verdict: evidence().verdict }
  const oracle = (check) => assert.ok(check(files).length > 0, "recompute the actual bar")
  oracle(judgeEvidenceProblems)
  const changed = await mutation("./publish-plan.mjs", "const actual = score(records, sample.promptHash)", "const actual = verdict")
  assert.throws(() => oracle(changed.judgeEvidenceProblems), { code: "ERR_ASSERTION" })
})
