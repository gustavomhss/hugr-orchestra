// Tests for splitting one multi-arm `atlas mine` stdout. Run: node --test script/atlas-genesis/split-arms.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { splitArms } from "./split-arms.mjs"

const site = (rank, outcome, path) => `site: ${JSON.stringify({ rank, outcome, kind: "file", path })}`

const union = [
  "genesis: seeded 2 candidate fact(s) [union]; ratified 0",
  "cost: llmCalls 4 · budgetSpent 4",
  "mine: arms — advisory 2 · dependency 0 · count 0",
  "arm: advisory",
  site(1, "seeded", "packages/core/src/a.ts"),
  site(2, "abstained", "packages/core/src/b.ts"),
  "partial: resume at rank 2 — the budget ceiling was reached with sites left unvisited",
  site(3, "unvisited", "packages/core/src/c.ts"),
  "coverage: coverage CLOSES",
  "arm: dependency",
  site(1, "abstained", "packages/core/src/d.ts"),
  "coverage: coverage CLOSES",
  "arm: count",
  "coverage: coverage CLOSES — all 0 planned site(s) accounted for",
  "",
].join("\n")

test("a union stdout becomes one single-arm-shaped file per heading", () => {
  const parts = splitArms(union, { code: 1, arms: ["advisory", "dependency", "count"] })
  assert.deepEqual(
    parts.map((p) => p.arm),
    ["advisory", "dependency", "count"],
  )
  const advisory = parts[0]
  assert.equal(advisory.code, 1)
  assert.match(advisory.text, /^genesis: seeded 2 candidate fact\(s\)/)
  assert.match(advisory.text, /budgetSpent 2/)
  assert.match(advisory.text, /packages\/core\/src\/a\.ts/)
  assert.doesNotMatch(advisory.text, /packages\/core\/src\/d\.ts/)
  assert.equal(parts[1].code, 0)
  assert.match(parts[1].text, /budgetSpent 1/)
  assert.equal(parts[2].code, 0)
  assert.match(parts[2].text, /^genesis: seeded 0 /)
})

test("a single-arm render is copied onto the requested arm", () => {
  const stdout = `genesis: seeded 0 candidate fact(s); ratified 0\ncost: llmCalls 1 · budgetSpent 1\n${site(1, "abstained", "packages/core/src/a.ts")}\n`
  const parts = splitArms(stdout, { code: 1, arms: ["advisory"] })
  assert.equal(parts.length, 1)
  assert.equal(parts[0].arm, "advisory")
  assert.equal(parts[0].code, 1)
  assert.equal(parts[0].text, stdout)
})

test("a refusal with no arm heading is copied onto every requested arm at the process code", () => {
  const stdout = "status: rejected\nnext: the configured model command failed\n"
  const parts = splitArms(stdout, { code: 2, arms: ["advisory", "dependency"] })
  assert.equal(parts.length, 2)
  assert.deepEqual(
    parts.map((p) => p.code),
    [2, 2],
  )
  assert.equal(parts[0].text, stdout)
  assert.equal(parts[1].text, stdout)
})
