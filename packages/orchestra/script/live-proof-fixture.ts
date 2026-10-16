#!/usr/bin/env bun
// Builds the Atlas → Relay live-proof fixture: a small Bun project whose money conversion rounds through floats,
// committed with a ratified Atlas territory catalog and static Own snapshot for the given Orchestra project ID.
//
//   bun packages/orchestra/script/live-proof-fixture.ts <dir> sources          # git repo, sources, origin/dev
//   bun packages/orchestra/script/live-proof-fixture.ts <dir> atlas <projectID> # catalog + Own snapshot for that project, committed
//
// The project ID is the one Orchestra assigns to <dir> (read it from a Session created there): the catalog is
// published for it and readAtlasSource holds provider-project-mismatch otherwise.
import path from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { $ } from "bun"
import { publishTerritoryCatalog } from "@orchestra/atlas-boundary"
import { materializeStaticOwnSnapshot, parseOwnSnapshot } from "@orchestra/atlas-boundary/materialize"

const dir = path.resolve(process.argv[2] ?? "")
const step = process.argv[3]
const git = (...args: string[]) => $`git -C ${dir} -c user.name=Fixture -c user.email=fixture@example.invalid -c commit.gpgsign=false ${args}`.quiet()

if (step === "sources") {
  mkdirSync(path.join(dir, "src"), { recursive: true })
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "money-fixture", private: true, type: "module" }, null, 2) + "\n")
  writeFileSync(path.join(dir, "src/money.ts"), [
    "// Converts a decimal amount to integer cents.",
    "export function cents(value: number) {",
    "  return Math.round(value * 100)",
    "}",
    "",
  ].join("\n"))
  writeFileSync(path.join(dir, "src/checkout.ts"), [
    'import { cents } from "./money"',
    "",
    "// Totals line amounts in cents.",
    "export function total(values: number[]) {",
    "  return values.reduce((sum, value) => sum + cents(value), 0)",
    "}",
    "",
  ].join("\n"))
  await $`git init -q -b dev ${dir}`.quiet()
  await git("add", "-A")
  await git("commit", "-q", "-m", "money fixture sources")
  // The validation review base is the merge-base with origin's default branch.
  await git("remote", "add", "origin", dir)
  await git("fetch", "-q", "origin")
  await git("remote", "set-head", "origin", "dev")
  console.log(`sources committed in ${dir}`)
  process.exit(0)
}

if (step !== "atlas" || !process.argv[4]) {
  console.error("usage: bun packages/orchestra/script/live-proof-fixture.ts <dir> sources | atlas <projectID>")
  process.exit(2)
}
const projectID = process.argv[4]
const sourceRevision = (await git("rev-parse", "HEAD").text()).trim()
const blob = async (file: string) => (await git("hash-object", "--no-filters", file).text()).trim()
const unit = (id: string, file: string, claim: string, blobID: string, dependencies: string[]) => ({
  unit: { level: "module", id, grounding: null },
  sourceBlobs: { [file]: blobID },
  pack: {
    unit: claim,
    invariants: [{ nodeId: `${id}:contract`, tier: "T1", claim, freshness: "FRESH" }],
    shape: { contents: [file], owner: "backend", tier: "T1" },
    edges: { dependents: [], dependencies },
    gotchas: [], advisory: [], memory: null,
    drill: { finer: [], refresh: { pull: `refresh:${id}` }, complement: { pull: `relate:${id}` } },
    grounding: { source: "tree" },
    tokenEstimate: 60,
    manifest: { pointers: [], truncated: false },
    pullReachable: [], advisoryDropped: 0,
  },
})
const snapshot = parseOwnSnapshot(JSON.stringify({
  schemaVersion: 1,
  snapshot: "live-proof-money-v1",
  sourceRevision,
  units: [
    unit("module/money", "src/money.ts", "money.cents converts a decimal amount to integer cents.", await blob("src/money.ts"), []),
    unit("module/checkout", "src/checkout.ts", "checkout.total sums line amounts through money.cents.", await blob("src/checkout.ts"), []),
  ],
}))
if (!snapshot) throw new Error("the canonical Own parser refused the fixture snapshot")
const materialized = materializeStaticOwnSnapshot(snapshot)
const atlas = path.join(dir, ".atlas")
mkdirSync(atlas, { recursive: true })
writeFileSync(path.join(atlas, "TERRITORY-CATALOG.json"), JSON.stringify(publishTerritoryCatalog(projectID, [
  { name: "money", owner: "backend", tier: "T1", globs: ["src/money.ts"] },
  { name: "checkout", owner: "backend", tier: "T1", globs: ["src/checkout.ts"] },
])))
writeFileSync(path.join(atlas, "OWN-SNAPSHOT.json"), JSON.stringify(snapshot))
for (const file of [...materialized.skills, materialized.coverage]) {
  mkdirSync(path.dirname(path.join(atlas, file.path)), { recursive: true })
  writeFileSync(path.join(atlas, file.path), file.content)
}
writeFileSync(path.join(dir, "orchestra.json"), JSON.stringify({ maestro: { atlas: { projectID, directory: ".atlas" } } }, null, 2) + "\n")
await git("add", "-A")
await git("commit", "-q", "-m", "ratified Atlas context for the live proof")
await git("fetch", "-q", "origin")
await git("update-ref", "refs/remotes/origin/dev", "HEAD")
console.log(`Atlas for ${projectID} committed in ${dir}`)
