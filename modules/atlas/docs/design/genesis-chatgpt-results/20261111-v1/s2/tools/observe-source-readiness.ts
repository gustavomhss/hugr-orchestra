// Read-only source readiness audit using the existing pinned Atlas observer, with real FS bytes.
// This is not ownership production, a synthetic test, semantic coverage or acceptance.
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, lstatSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const repo = resolve(Bun.argv[2]!)
const inventory = JSON.parse(readFileSync(Bun.argv[3]!, "utf8")) as { source_revision: string; entries: readonly { path: string; kind: string; blob: string; mode: string }[] }
const output = resolve(Bun.argv[4]!)
const { observeOwnershipInput } = await import(pathToFileURL(join(repo, "modules/atlas/packages/adapter-io/src/ownership-input.ts")).href)
const startedAt = new Date().toISOString()
const observations: unknown[] = []
const unavailable: unknown[] = []
const totals = { present: 0, absent: 0, unavailable: 0 }
for (const entry of inventory.entries) {
  if (entry.kind !== "blob") continue
  const key = `file:${entry.path}`
  const observed = observeOwnershipInput(repo, key) as { kind: keyof typeof totals; version?: string }
  totals[observed.kind]++
  const record = { key, blob: entry.blob, observed }
  observations.push(record)
  if (observed.kind !== "present") {
    const stat = lstatSync(join(repo, entry.path), { throwIfNoEntry: false })
    unavailable.push({ ...record, gitMode: entry.mode, bytes: stat?.size ?? null,
      metadataExplanation: entry.path.split("/").includes(".atlas") ? "path includes prohibited .atlas component" : entry.mode === "120000" ? "Git symlink" : stat === undefined ? "not materialized" : stat.size > 256000 ? "file exceeds observer's 256000-byte ceiling" : "unclassified",
      explanationLimit: "Metadata diagnosis only; the real observer returns the tri-state result, not this explanation." })
  }
}
const wire = JSON.stringify(observations) + "\n"
writeFileSync(join(output, "source-observer-results.json"), wire)
const report = {
  schema: "genesis-source-observer-readiness/v1", source_revision: inventory.source_revision,
  actual_head_revision: "2689c516d63488be37de678cc853dd4556fd5c13", candidate_revision: null,
  entry_point: "observeOwnershipInput(repo, file:key) from pinned ownership-input.ts", started_at: startedAt, finished_at: new Date().toISOString(),
  real_fs_seams: true, injection_seams_used: false, source_blobs_observed: observations.length, totals,
  non_present: unavailable, results_sha256: createHash("sha256").update(wire).digest("hex"), results_bytes: Buffer.byteLength(wire),
  production: "NOT_RUN", semantic_scope: "NOT_FROZEN", tests: "NOT_RUN", model_calls: 0,
  interpretation: "Operational source-readiness audit. A present version proves capturable bytes, not semantic authority or coverage. No refused path was replaced by empty content or silently excluded from campaign scope.",
}
writeFileSync(join(output, "source-observer-readiness.json"), JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify({ source_blobs_observed: observations.length, totals, non_present_count: unavailable.length, results_sha256: report.results_sha256 }))
