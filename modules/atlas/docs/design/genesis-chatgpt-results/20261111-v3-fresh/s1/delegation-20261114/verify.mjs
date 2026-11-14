import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
};
const legacyPath = resolve(option("--legacy", join(here, "..", "coverage.json")));
const outputPath = resolve(option("--output", join(here, "validation.json")));
const json = async path => JSON.parse(await readFile(path, "utf8"));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const roster = await json(join(here, "roster.json"));
const partition = await json(join(here, "partition.json"));
const dependency = await json(join(here, "dependencies.json"));
const legacy = await json(legacyPath);
const legacyRows = Array.isArray(legacy) ? legacy : legacy.entries;
const byPath = new Map(legacyRows.map(row => [row.path, row]));
requireThat(legacyRows.length === 2236 && byPath.size === 2236, "Legacy population is not 2236 unique paths");
requireThat(roster.subslices.length === 5, "Expected exactly five subslices");
requireThat(roster.criteria.length === 50 && new Set(roster.criteria).size === 50, "Expected 50 unique inherited criteria");
const expectedCounts = { "S1-01": 555, "S1-02": 424, "S1-03": 462, "S1-04": 472, "S1-05": 323 };
const seen = new Map();
const owners = new Map();
const branches = new Set();
const prefixes = new Set();
const evidence = [];
for (const sub of roster.subslices) {
  requireThat(/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/.test(sub.branch), "Invalid branch name: " + sub.branch);
  requireThat(!branches.has(sub.branch), "Duplicate branch: " + sub.branch);
  requireThat(!prefixes.has(sub.output_prefix), "Duplicate output prefix");
  branches.add(sub.branch);
  prefixes.add(sub.output_prefix);
  const local = join(here, sub.mission.split("/").slice(-2)[0]);
  const mission = await json(join(local, "mission.json"));
  const inputs = await json(join(local, "inputs.json"));
  const bytes = await readFile(join(local, "sources.jsonl"));
  const text = bytes.toString("utf8");
  requireThat(text.endsWith("\n") && !text.endsWith("\n\n"), "JSONL requires exactly one final LF");
  const sources = text.slice(0, -1).split("\n").map(line => JSON.parse(line));
  requireThat(mission.id === sub.id && inputs.subslice_id === sub.id, "Identity mismatch");
  requireThat(mission.branch === sub.branch && mission.output_prefix === sub.output_prefix, "Authority mismatch");
  requireThat(mission.source_revision === roster.source_revision, "Source revision mismatch");
  requireThat(mission.protocol_revision === roster.protocol_revision, "Protocol revision mismatch");
  requireThat(mission.transport_session === "S1" && mission.transport_scope === "orchestra.s1", "Transport identity changed");
  requireThat(mission.execution_state === "NOT_STARTED", "Preparation implies execution");
  requireThat(sources.length === expectedCounts[sub.id] && sub.source_count === sources.length, "Wrong source count: " + sub.id);
  requireThat(inputs.bodies.length === mission.owned_legacy_artifact_keys.length, "Body reference count mismatch");
  for (const key of mission.owned_legacy_artifact_keys) {
    requireThat(!owners.has(key), "Duplicate artifact owner: " + key);
    requireThat(partition.primary_source_ownership[key] === sub.id, "Artifact allocation mismatch");
    owners.set(key, sub.id);
  }
  for (const row of sources) {
    requireThat(!seen.has(row.path), "Overlapping source: " + row.path);
    requireThat(/^[0-9a-f]{40}$/.test(row.git_blob_sha), "Invalid source blob");
    const original = byPath.get(row.path);
    requireThat(original !== undefined, "Added source outside S1: " + row.path);
    requireThat(original.git_blob_sha === row.git_blob_sha, "Changed source identity: " + row.path);
    requireThat((original.artifact_key ?? original.legacy_artifact_key) === row.legacy_artifact_key, "Changed original artifact assignment");
    requireThat(mission.owned_legacy_artifact_keys.includes(row.legacy_artifact_key), "Source routed to wrong subslice");
    seen.set(row.path, sub.id);
  }
  evidence.push({
    id: sub.id, source_count: sources.length,
    legacy_artifact_count: mission.owned_legacy_artifact_keys.length,
    source_inventory_sha256: hash(bytes),
    source_set_sha256: hash(sources.map(row => row.path).sort().join("\n") + "\n"),
    branch: sub.branch, output_prefix: sub.output_prefix
  });
}
requireThat(seen.size === byPath.size && [...byPath.keys()].every(path => seen.has(path)), "Incomplete union");
requireThat(owners.size === 36, "Expected 36 historical artifacts");
const originalKeys = new Set(legacyRows.map(row => row.artifact_key ?? row.legacy_artifact_key));
requireThat(originalKeys.size === 36 && [...originalKeys].every(key => owners.has(key)), "Artifact union mismatch");
requireThat(dependency.historical_consumer_owners.length === 9, "Missing historical consumer ownership");
requireThat(new Set(dependency.historical_consumer_owners.map(row => row.case_id)).size === 9, "Duplicate historical consumer ownership");
requireThat(dependency.union.owner === "S1_COORDINATION" && dependency.union.target_branch === "genesis-fresh-s1", "Missing intermediate integration owner");
for (const id of ["C-N01-host", "C-N01-session", "C-N02", "C-N05", "oversized-inputs", "core-entry"]) {
  requireThat(dependency.obligations.some(row => row.id === id), "Missing inherited obligation: " + id);
}
const report = {
  schema: "genesis-s1-subdivision-validation/v1",
  verified_at_utc: new Date().toISOString(),
  state: "PASS_MECHANICAL_PARTITION_ONLY",
  source_revision: roster.source_revision,
  inherited_s1_revision: roster.inheritance_revision,
  input_inventory_ref: roster.source_inventory,
  total_unique_sources: seen.size, total_unique_legacy_artifacts: owners.size,
  missing_sources: 0, overlapping_sources: 0, unowned_legacy_artifacts: 0,
  criteria_preserved: roster.criteria.length, historical_consumer_cases_assigned: 9,
  whole_source_set_sha256: hash([...seen.keys()].sort().join("\n") + "\n"),
  digest_encoding: "UTF-8 paths sorted by JS default code-unit ordering, joined with LF plus one trailing LF",
  subslices: evidence,
  native_production_started: false,
  semantic_judgments_performed: false,
  product_tests_or_ci_run: false,
  atlas_operations_performed: false,
  product_code_changed_by_preparation: false,
  limits: [
    "This verifies the partition and preparation, not semantic sufficiency, runtime or campaign completion.",
    "Source identities are inherited from the pinned S1 coverage inventory; source content was not re-mined.",
    "Formal repository check:guards is not represented by this mechanical validation."
  ]
};
await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
