export * as KnowledgeReplayBinding from "./knowledge-replay-binding"

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"

const Row = Schema.Struct({
  nodeKey: Schema.String, family: Schema.Literal("relation"), contentHash: Schema.String,
  claims: Schema.Array(Schema.String), primaryAnchor: Schema.String,
  endpointA: Schema.String, endpointB: Schema.String, relationKind: Schema.Literal("depends-on"),
  scope: Schema.Literal("src"), tier: Schema.Literal("T2"), seal: Schema.Literal("proven"),
})

export const Proof = Schema.Struct({
  pid: Schema.Number, exportsChecked: Schema.Number,
  derived: Schema.Struct({ resolved: Schema.Number, proven: Schema.Number, persisted: Schema.Number, refused: Schema.Number }),
  before: Schema.Struct({ held: Schema.Number, casAbsent: Schema.Boolean, sidecarsAbsent: Schema.Boolean }),
  source: Row, replayed: Row, second: Row,
  reverified: Schema.Array(Schema.Number), nodeCounts: Schema.Array(Schema.Number),
  restoredHash: Schema.String, logRejected: Schema.Array(Schema.Number), childCleanup: Schema.Boolean,
})

export async function make() {
  const root = mkdtempSync(path.join(tmpdir(), "atlas-replay-binding-"))
  return build(root).catch((error: unknown) => {
    rmSync(root, { recursive: true, force: true })
    throw error
  })
}

async function build(root: string) {
  const source = path.resolve(import.meta.dir, "../../../..")
  const boundary = path.join(source, "modules/atlas/boundary")
  const packages = path.resolve(boundary, "../packages")
  const parser = Bun.resolveSync("web-tree-sitter", boundary)
  const metadata: unknown = await Bun.file(Bun.resolveSync("web-tree-sitter/package.json", boundary)).json()
  if (typeof metadata !== "object" || metadata === null || !("version" in metadata) || typeof metadata.version !== "string")
    throw new Error("Actual pinned parser package metadata unavailable")
  const manifest = { parser: { resolved: parser, version: metadata.version }, astWarmup: false, scip: "controlled serialized protobuf" }
  const entry = path.join(root, "entry.ts")
  await Bun.write(entry, [
    `export { composeRuntime } from ${JSON.stringify(path.join(packages, "adapter-io/src/compose.ts"))}`,
    `export { makeFixRepo } from ${JSON.stringify(path.join(packages, "adapter-io/test/harness/fix-repo.ts"))}`,
    `export { makeFixScip } from ${JSON.stringify(path.join(packages, "adapter-io/test/harness/fix-scip.ts"))}`,
    `export { createDiskStore, rehydrateProjection } from ${JSON.stringify(path.join(packages, "adapter-io/src/store.ts"))}`,
    `export { readKnowledge } from ${JSON.stringify(path.join(packages, "adapter-io/src/knowledge-log.ts"))}`,
    `export { atlasDir, membersDir, knowledgeShardPath, blobPath } from ${JSON.stringify(path.join(packages, "adapter-io/src/layout.ts"))}`,
    `export { relationKey } from ${JSON.stringify(path.join(packages, "knowledge/src/index.ts"))}`,
    `export { id } from ${JSON.stringify(path.join(packages, "kernel/src/index.ts"))}`,
  ].join("\n"))
  const built = await Bun.build({
    entrypoints: [entry], target: "node", format: "esm",
    plugins: [{ name: "canonical-actual-knowledge-replay", setup(builder) {
      builder.onResolve({ filter: /^@atlas\// }, (args) => ({
        path: path.join(packages, args.path.slice("@atlas/".length), "src/index.ts"),
      }))
      builder.onResolve({ filter: /^@noble\/hashes\// }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
      builder.onResolve({ filter: /^@bufbuild\/protobuf(\/.*)?$/ }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
      builder.onResolve({ filter: /^@c4312\/scip$/ }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
      // Same pinned external as the official builder, made absolute for this owned OS-temp output.
      builder.onResolve({ filter: /^web-tree-sitter$/ }, (args) => ({ path: Bun.resolveSync(args.path, boundary), external: true }))
    } }],
  })
  if (!built.success || built.outputs.length !== 1 || built.outputs[0] === undefined)
    throw new Error(`Actual compose fixture build failed: ${built.logs.join("\n")}`)
  const bundle = path.join(root, "actual-atlas.mjs")
  await Bun.write(bundle, built.outputs[0])
  const actor = path.join(root, "actor.mjs")
  await Bun.write(actor, actorSource)
  await Bun.write(path.join(root, "manifest.json"), JSON.stringify(manifest))
  return { root, manifest,
    command: ChildProcess.make(process.execPath, [actor, bundle, root], { cwd: source }),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  }
}

// Fixed test actor: all policies/paths are fixture-owned; no request supplies code or a proof verdict.
const actorSource = String.raw`import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const api = await import(pathToFileURL(process.argv[2]).href);
const owned = process.argv[3];
const names = ["composeRuntime", "makeFixRepo", "makeFixScip", "createDiskStore", "rehydrateProjection",
  "readKnowledge", "atlasDir", "membersDir", "knowledgeShardPath", "blobPath", "relationKey", "id"];
names.forEach((name) => assert.equal(typeof api[name], "function", name));
const saved = ["ATLAS_ACTOR", "ATLAS_RATIFY_TOKEN", "TMPDIR", "TMP", "TEMP"].map((key) => [key, process.env[key]]);
const cleanups = [];
const allocated = [];
const originalFailure = [];
function copy(from, to) {
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
}
function semantic(row) {
  const { derivedAt, ...value } = row;
  return value;
}
function verify(runtime) {
  const report = runtime.reverify();
  assert.equal(report.sealedProven, 1);
  assert.equal(report.reProven, 1);
  assert.equal(report.broken, 0);
  assert.equal(report.unverifiable, 0);
  return report.reProven;
}
function edges(runtime, key) {
  const expected = [{ nodeKey: key, relationKind: "depends-on", endpointA: "src/app.ts", endpointB: "src/util.ts", seal: "proven" }];
  assert.deepEqual(runtime.relations("src/app.ts", "out"), expected);
  assert.deepEqual(runtime.relations("src/util.ts", "in"), expected);
}
function run() {
  process.env.ATLAS_ACTOR = "bob";
  process.env.ATLAS_RATIFY_TOKEN = "bob";
  process.env.TMPDIR = owned;
  process.env.TMP = owned;
  process.env.TEMP = owned;
  try {
    const source = api.makeFixRepo();
    cleanups.push(source.cleanup);
    allocated.push(source.repoPath);
    const scip = api.makeFixScip();
    cleanups.push(scip.cleanup);
    allocated.push(path.dirname(scip.scipPath));
    mkdirSync(api.atlasDir(source.repoPath), { recursive: true });
    writeFileSync(path.join(api.atlasDir(source.repoPath), "policy.json"), JSON.stringify({
      nearDup: { claimNormThreshold: 1 }, t0Heuristic: { keywords: [] }, authz: { scopes: { src: ["bob"] } },
    }));
    copy(scip.scipPath, path.join(api.atlasDir(source.repoPath), "index.scip"));
    const runtime = api.composeRuntime(source.repoPath);
    const derived = runtime.deriveRelations();
    assert.equal(derived.resolvedEdgeCount, 1);
    assert.equal(derived.proven, 1);
    assert.equal(derived.persisted, 1);
    assert.equal(derived.refused, 0);
    const key = String(api.relationKey("src/app.ts", "depends-on", "src/util.ts"));
    const disk = api.createDiskStore(path.join(api.atlasDir(source.repoPath), "cas"));
    const sourceProjection = api.rehydrateProjection(disk);
    assert.equal(sourceProjection.current.size, 1);
    const row = sourceProjection.current.get(key);
    assert.ok(row);
    assert.equal(row.nodeKey, key);
    assert.equal(row.family, "relation");
    assert.deepEqual(row.claims, ["src/app.ts\0depends-on\0src/util.ts"]);
    assert.equal(row.primaryAnchor, "src/app.ts");
    assert.equal(row.endpointA, "src/app.ts");
    assert.equal(row.endpointB, "src/util.ts");
    assert.equal(row.relationKind, "depends-on");
    assert.equal(row.tier, "T2");
    assert.equal(row.scope, "src");
    assert.equal(row.seal, "proven");
    const fact = disk.get(row.contentHash);
    assert.ok(fact);
    assert.equal(String(api.id(fact)), row.contentHash);
    assert.equal(derived.rows[0].key, key);
    assert.equal(derived.rows[0].id, row.contentHash);
    edges(runtime, key);
    const sourceVerified = verify(runtime);
    const sourceLog = api.readKnowledge(source.repoPath);
    assert.equal(sourceLog.rejected, 0);
    assert.equal(sourceLog.rows.size, 1);
    assert.deepEqual(semantic(sourceLog.rows.get(key).row), semantic(row));

    const destination = api.makeFixRepo();
    cleanups.push(destination.cleanup);
    allocated.push(destination.repoPath);
    assert.notEqual(destination.repoPath, source.repoPath);
    for (const name of ["policy.json", "index.scip"])
      copy(path.join(api.atlasDir(source.repoPath), name), path.join(api.atlasDir(destination.repoPath), name));
    copy(api.knowledgeShardPath(source.repoPath, "bob", key), api.knowledgeShardPath(destination.repoPath, "bob", key));
    copy(api.blobPath(source.repoPath, row.contentHash), api.blobPath(destination.repoPath, row.contentHash));
    assert.deepEqual(readdirSync(api.atlasDir(destination.repoPath)).sort(), ["blobs", "index.scip", "members", "policy.json"]);
    assert.ok(existsSync(api.membersDir(destination.repoPath)));
    const destinationCas = path.join(api.atlasDir(destination.repoPath), "cas");
    assert.equal(existsSync(destinationCas), false);
    const fresh = api.createDiskStore(destinationCas);
    const held = api.rehydrateProjection(fresh);
    assert.equal(held.current.size, 0);
    assert.equal(held.cas.size, 0);
    assert.equal(readdirSync(api.atlasDir(destination.repoPath)).some((name) => /^(projection|staging)/.test(name)), false);
    const destinationLog = api.readKnowledge(destination.repoPath);
    assert.equal(destinationLog.rejected, 0);
    assert.equal(destinationLog.rows.size, 1);
    assert.deepEqual(readFileSync(api.blobPath(destination.repoPath, row.contentHash)), readFileSync(api.blobPath(source.repoPath, row.contentHash)));
    const replayedRuntime = api.composeRuntime(destination.repoPath);
    const replayedProjection = api.rehydrateProjection(fresh);
    assert.equal(replayedProjection.current.size, 1);
    const replayed = replayedProjection.current.get(key);
    assert.ok(replayed);
    assert.deepEqual(semantic(replayed), semantic(row));
    edges(replayedRuntime, key);
    const restored = fresh.get(row.contentHash);
    assert.deepEqual(restored, fact);
    assert.equal(String(api.id(restored)), row.contentHash);
    const replayVerified = verify(replayedRuntime);
    const secondRuntime = api.composeRuntime(destination.repoPath);
    const secondProjection = api.rehydrateProjection(fresh);
    assert.equal(secondProjection.current.size, 1);
    const second = secondProjection.current.get(key);
    assert.ok(second);
    assert.deepEqual(semantic(second), semantic(replayed));
    assert.deepEqual([...secondProjection.cas].sort(), [...replayedProjection.cas].sort());
    edges(secondRuntime, key);
    const secondVerified = verify(secondRuntime);
    assert.deepEqual(semantic(api.readKnowledge(destination.repoPath).rows.get(key).row), semantic(row));
    return { pid: process.pid, exportsChecked: names.length,
      derived: { resolved: derived.resolvedEdgeCount, proven: derived.proven, persisted: derived.persisted, refused: derived.refused },
      before: { held: held.current.size, casAbsent: true, sidecarsAbsent: true },
      source: semantic(row), replayed: semantic(replayed), second: semantic(second),
      reverified: [sourceVerified, replayVerified, secondVerified],
      nodeCounts: [sourceProjection.current.size, replayedProjection.current.size, secondProjection.current.size],
      restoredHash: String(api.id(restored)), logRejected: [sourceLog.rejected, destinationLog.rejected] };
  } catch (error) {
    originalFailure.push(error);
    throw error;
  } finally {
    const restorations = saved.map(([key, value]) => () => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    const failures = [...cleanups.reverse(), ...restorations].flatMap((cleanup) => {
      try { cleanup(); return []; } catch (error) { return [error]; }
    });
    if (failures.length > 0) throw new AggregateError([...originalFailure, ...failures], "Actual fixture cleanup failed");
  }
}
const proof = run();
allocated.forEach((directory) => assert.equal(existsSync(directory), false, "Actual harness directory survived cleanup"));
process.stdout.write(JSON.stringify({ ...proof, childCleanup: true }) + "\n");
`
