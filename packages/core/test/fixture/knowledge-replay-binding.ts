export * as KnowledgeReplayBinding from "./knowledge-replay-binding"

import { mkdtempSync, realpathSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
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

export const attacks = [
  "key", "family", "claim-empty", "claim-add", "claim-replace", "scope", "tier", "anchor",
  "endpointA", "endpointB", "relationKind", "provenance", "sameAs", "sameAsRetracted", "answerRef",
  "unknown-carrier", "scope-fact",
] as const

export type Attack = typeof attacks[number] | "same-hash" | "derivedAt"

const SemanticRow = Schema.Record(Schema.String, Schema.Json)
export const AttackProof = Schema.Struct({
  pid: Schema.Number, mode: Schema.String, source: Row, candidate: SemanticRow,
  changedCandidate: Schema.optionalKey(SemanticRow),
  derived: Schema.Struct({ resolved: Schema.Number, proven: Schema.Number, persisted: Schema.Number, refused: Schema.Number }),
  sourceReverified: Schema.Number,
  snapshots: Schema.Array(Schema.Struct({
    current: Schema.Number, staging: Schema.Number, cas: Schema.Number, row: SemanticRow,
    edges: Schema.Array(Schema.Number), generations: Schema.Array(Schema.String),
  })),
  rejected: Schema.Array(Schema.Number), childCleanup: Schema.Boolean,
  watermark: Schema.optionalKey(Schema.Struct({ incoming: Schema.String, local: Schema.String, second: Schema.String, head: Schema.String })),
})

export async function make(attack?: Attack) {
  const root = mkdtempSync(path.join(tmpdir(), "atlas-replay-binding-"))
  return build(root, attack).catch((error: unknown) => {
    rmSync(root, { recursive: true, force: true })
    throw error
  })
}

async function build(root: string, attack?: Attack) {
  const source = path.resolve(import.meta.dir, "../../../..")
  const boundary = path.join(source, "modules/atlas/boundary")
  const packages = path.resolve(boundary, "../packages")
  const metadataPath = path.join(boundary, "node_modules/web-tree-sitter/package.json")
  const metadataBytes = await Bun.file(metadataPath).arrayBuffer()
  const metadata: unknown = await Bun.file(metadataPath).json()
  if (typeof metadata !== "object" || metadata === null || !("name" in metadata) || metadata.name !== "web-tree-sitter" ||
    !("version" in metadata) || metadata.version !== "0.23.2" || !("main" in metadata) || metadata.main !== "tree-sitter.js")
    throw new Error("Actual boundary parser must be web-tree-sitter@0.23.2 with main tree-sitter.js")
  const parser = realpathSync(path.join(boundary, "node_modules/web-tree-sitter/tree-sitter.js"))
  if (!statSync(parser).isFile()) throw new Error("Actual pinned parser entry is not a regular file")
  const parserURL = pathToFileURL(parser).href
  const manifest = { parser: { resolved: parser, version: metadata.version, package: metadataPath,
    packageSha256: new Bun.CryptoHasher("sha256").update(metadataBytes).digest("hex"),
    entrySha256: new Bun.CryptoHasher("sha256").update(await Bun.file(parser).arrayBuffer()).digest("hex"),
  }, astWarmup: false, scip: "controlled serialized protobuf" }
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
    ...(attack === undefined ? [] : [
      `export { appendKnowledge } from ${JSON.stringify(path.join(packages, "adapter-io/src/knowledge-log.ts"))}`,
      `export { headSha } from ${JSON.stringify(path.join(packages, "adapter-io/src/run-git.ts"))}`,
    ]),
  ].join("\n"))
  const built = await Bun.build({
    entrypoints: [entry], target: "node", format: "esm", external: [parserURL],
    plugins: [{ name: "canonical-actual-knowledge-replay", setup(builder) {
      builder.onResolve({ filter: /^@atlas\// }, (args) => ({
        path: path.join(packages, args.path.slice("@atlas/".length), "src/index.ts"),
      }))
      builder.onResolve({ filter: /^@noble\/hashes\// }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
      builder.onResolve({ filter: /^@bufbuild\/protobuf(\/.*)?$/ }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
      builder.onResolve({ filter: /^@c4312\/scip$/ }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
      // The bridge's literal external is already absolute; no bare external rewrite is assumed.
      builder.onResolve({ filter: /^web-tree-sitter$/ }, () => ({ path: "parser", namespace: "atlas-pinned-parser" }))
      builder.onLoad({ filter: /.*/, namespace: "atlas-pinned-parser" }, () => ({
        contents: `import Parser from ${JSON.stringify(parserURL)}; export default Parser;`, loader: "js",
      }))
    } }],
  })
  if (!built.success || built.outputs.length !== 1 || built.outputs[0] === undefined)
    throw new Error(`Actual compose fixture build failed: ${built.logs.join("\n")}`)
  const output = await built.outputs[0].text()
  if (!output.includes(parserURL) || /\b(?:from|import)\s*["']web-tree-sitter["']/.test(output))
    throw new Error("Actual compose fixture must emit the pinned parser URL without a bare static parser import")
  const setup = { ...manifest, emitted: { parserURL,
    outputSha256: new Bun.CryptoHasher("sha256").update(output).digest("hex"),
    imports: output.split("\n").filter((line) => /\b(?:import|from)\b/.test(line) && line.includes(parserURL))
      .slice(0, 10).map((line) => line.slice(0, 500)),
  } }
  await Bun.write(Bun.stdout, `L4 replay setup: ${JSON.stringify(setup)}\n`)
  const bundle = path.join(root, "actual-atlas.mjs")
  await Bun.write(bundle, output)
  const actor = path.join(root, "actor.mjs")
  await Bun.write(actor, attack === undefined ? actorSource : attackActorSource)
  await Bun.write(path.join(root, "manifest.json"), JSON.stringify(setup))
  return { root, manifest,
    command: ChildProcess.make(process.execPath, [actor, bundle, root, ...(attack === undefined ? [] : [attack])], { cwd: source }),
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
    const sourceVerified = verify(api.composeRuntime(source.repoPath));
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

// This actor owns only finite mutations; the positive actor above remains the qualified default control.
const attackActorSource = String.raw`import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const api = await import(pathToFileURL(process.argv[2]).href);
const owned = process.argv[3];
const mode = process.argv[4];
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
    // Both scopes authorize the seat: only the explicit anchor owner distinguishes them.
    writeFileSync(path.join(api.atlasDir(source.repoPath), "policy.json"), JSON.stringify({
      t0Heuristic: { keywords: [] }, authz: { scopes: { src: ["bob"], other: ["bob"] }, anchors: { src: "src" } },
    }));
    copy(scip.scipPath, path.join(api.atlasDir(source.repoPath), "index.scip"));
    const produced = api.composeRuntime(source.repoPath).deriveRelations();
    assert.equal(produced.resolvedEdgeCount, 1);
    assert.equal(produced.proven, 1);
    assert.equal(produced.persisted, 1);
    assert.equal(produced.refused, 0);
    const key = String(api.relationKey("src/app.ts", "depends-on", "src/util.ts"));
    const sourceDisk = api.createDiskStore(path.join(api.atlasDir(source.repoPath), "cas"));
    const sourceProjection = api.rehydrateProjection(sourceDisk);
    assert.equal(sourceProjection.current.size, 1);
    const row = sourceProjection.current.get(key);
    assert.ok(row);
    assert.equal(row.family, "relation");
    assert.deepEqual(row.claims, ["src/app.ts\0depends-on\0src/util.ts"]);
    assert.equal(row.primaryAnchor, "src/app.ts");
    assert.equal(row.endpointA, "src/app.ts");
    assert.equal(row.endpointB, "src/util.ts");
    assert.equal(row.relationKind, "depends-on");
    assert.equal(row.scope, "src");
    assert.equal(row.tier, "T2");
    assert.equal(row.seal, "proven");
    const fact = sourceDisk.get(row.contentHash);
    assert.ok(fact);
    assert.equal(String(api.id(fact)), row.contentHash);
    const sourceReverified = verify(api.composeRuntime(source.repoPath));
    const sourceLog = api.readKnowledge(source.repoPath);
    assert.equal(sourceLog.rejected, 0);
    assert.equal(sourceLog.rows.size, 1);
    const entry = sourceLog.rows.get(key);
    assert.ok(entry);
    assert.deepEqual(semantic(entry.row), semantic(row));
    const peer = String(api.relationKey("src/util.ts", "depends-on", "src/app.ts"));
    const mutations = {
      key: { nodeKey: peer }, family: { family: "advisory" },
      "claim-empty": { claims: [] }, "claim-add": { claims: [...row.claims, "unsupported assertion"] },
      "claim-replace": { claims: ["unsupported assertion"] }, scope: { scope: "other" }, tier: { tier: "T1" },
      anchor: { primaryAnchor: "src/util.ts" }, endpointA: { endpointA: "src/util.ts" },
      endpointB: { endpointB: "src/app.ts" }, relationKind: { relationKind: "calls" },
      provenance: { provenanceByClaim: { [row.claims[0]]: { source: "forged-replay", trusted: true } } },
      sameAs: { sameAs: [peer] }, sameAsRetracted: { sameAsRetracted: [peer] }, answerRef: { answerRef: "a".repeat(64) },
      "unknown-carrier": { unsupportedCarrier: "forged-replay" },
      "same-hash": { claims: [...row.claims, "unsupported first assertion"] },
      derivedAt: { derivedAt: "attacker-controlled-watermark" }, "scope-fact": { scope: "other" },
    };
    assert.ok(Object.hasOwn(mutations, mode), "Unknown finite attack selector");
    const incomingFact = mode === "scope-fact" ? { ...fact, scope: "other" } : fact;
    const candidate = { ...semantic(row), ...mutations[mode], contentHash: String(api.id(incomingFact)) };
    if (mode !== "scope-fact") assert.equal(candidate.contentHash, row.contentHash);
    if (mode === "scope-fact") {
      assert.equal(incomingFact.scope, candidate.scope);
      assert.notEqual(candidate.contentHash, row.contentHash);
    }
    const destination = api.makeFixRepo();
    cleanups.push(destination.cleanup);
    allocated.push(destination.repoPath);
    for (const name of ["policy.json", "index.scip"])
      copy(path.join(api.atlasDir(source.repoPath), name), path.join(api.atlasDir(destination.repoPath), name));
    copy(api.blobPath(source.repoPath, row.contentHash), api.blobPath(destination.repoPath, row.contentHash));
    const disk = api.createDiskStore(path.join(api.atlasDir(destination.repoPath), "cas"));
    assert.equal(existsSync(path.join(api.atlasDir(destination.repoPath), "cas")), false);
    assert.equal(api.rehydrateProjection(disk).current.size, 0);
    assert.equal(api.rehydrateProjection(disk).cas.size, 0);
    assert.equal(readdirSync(api.atlasDir(destination.repoPath)).some((name) => /^(projection|staging)/.test(name)), false);
    // Only the mutated entry travels, with the real append door computing its public event hash.
    api.appendKnowledge(destination.repoPath, { ...entry, row: candidate, at: "9998-01-01T00:00:00.000Z" }, incomingFact);
    assert.deepEqual(readdirSync(api.atlasDir(destination.repoPath)).sort(), ["blobs", "index.scip", "members", "policy.json"]);
    assert.deepEqual(readFileSync(api.blobPath(source.repoPath, row.contentHash)), readFileSync(api.blobPath(destination.repoPath, row.contentHash)));
    assert.deepEqual(disk.get(candidate.contentHash), undefined);
    const admittedLog = api.readKnowledge(destination.repoPath);
    assert.equal(admittedLog.rejected, 0);
    assert.equal(admittedLog.rows.size, 1);
    assert.deepEqual(admittedLog.rows.get(candidate.nodeKey).row, candidate);
    const rejected = [];
    const fileSnapshots = [];
    function boot(expected) {
      const runtime = api.composeRuntime(destination.repoPath);
      const current = api.rehydrateProjection(disk);
      const staging = disk.commitStaging((projection) => ({ out: projection }));
      assert.equal(staging.settled, true, "Read actual staging through its read-only decision");
      const selected = mode === "derivedAt" ? current : staging.out;
      assert.equal(current.current.size, mode === "derivedAt" ? 1 : 0);
      assert.equal(staging.out.current.size, mode === "derivedAt" ? 0 : 1);
      const held = selected.current.get(expected.nodeKey);
      assert.ok(held, "The complete candidate must survive in its intended store");
      assert.deepEqual(semantic(held), semantic(expected));
      assert.equal(selected.cas.size, 1);
      assert.deepEqual(disk.get(expected.contentHash), incomingFact);
      const edges = [runtime.relations("src/app.ts", "out"), runtime.relations("src/util.ts", "in"),
        runtime.relations(expected.endpointA, "out"), runtime.relations(expected.endpointB, "in")].map((list) => list.length);
      assert.deepEqual(edges, mode === "derivedAt" ? [1, 1, 1, 1] : [0, 0, 0, 0]);
      const log = api.readKnowledge(destination.repoPath);
      assert.equal(log.rejected, 0);
      assert.deepEqual(log.rows.get(expected.nodeKey).row, expected);
      rejected.push(log.rejected);
      const generations = readdirSync(api.atlasDir(destination.repoPath)).filter((name) => /^staging(?:\.[0-9]+)?\.json$/.test(name)).sort();
      fileSnapshots.push(generations.map((name) => [name, readFileSync(path.join(api.atlasDir(destination.repoPath), name), "utf8")]));
      return { current: current.current.size, staging: staging.out.current.size, cas: selected.cas.size,
        row: semantic(held), edges, generations, watermark: held.derivedAt };
    }
    const first = boot(candidate);
    const second = boot(candidate);
    assert.deepEqual(second, first, "Second identical boot must not change the candidate or staging generations");
    assert.deepEqual(fileSnapshots[1], fileSnapshots[0], "Second boot must not rewrite staging bytes");
    const snapshots = [first, second];
    const changed = mode === "same-hash" ? { ...candidate, claims: [...row.claims, "unsupported second assertion"] } : undefined;
    if (changed) {
      assert.equal(changed.contentHash, candidate.contentHash);
      api.appendKnowledge(destination.repoPath, { ...entry, row: changed, at: "9999-01-01T00:00:00.000Z",
        base: JSON.stringify(semantic(candidate)) }, incomingFact);
      snapshots.push(boot(changed), boot(changed));
      assert.notDeepEqual(snapshots[2].row, snapshots[0].row, "Same hash must not hide changed semantic candidate");
      assert.deepEqual(snapshots[3], snapshots[2]);
      assert.deepEqual(fileSnapshots[3], fileSnapshots[2]);
      assert.notDeepEqual(fileSnapshots[2], fileSnapshots[1], "Changed candidate must publish a staging generation");
    }
    const head = mode === "derivedAt" ? api.headSha(destination.repoPath) : undefined;
    if (mode === "derivedAt") {
      assert.match(head, /^[a-f0-9]{40}$/);
      assert.equal(first.watermark, head);
      assert.equal(second.watermark, head);
      assert.notEqual(first.watermark, candidate.derivedAt);
      verify(api.composeRuntime(destination.repoPath));
    }
    assert.deepEqual(sourceDisk.get(row.contentHash), fact, "Attacks must never edit the original proof blob");
    return { pid: process.pid, mode, source: semantic(row), candidate,
      ...(changed ? { changedCandidate: changed } : {}),
      derived: { resolved: produced.resolvedEdgeCount, proven: produced.proven, persisted: produced.persisted, refused: produced.refused },
      sourceReverified, snapshots: snapshots.map(({ watermark, ...snapshot }) => snapshot), rejected,
      ...(mode === "derivedAt" ? { watermark: { incoming: candidate.derivedAt, local: first.watermark, second: second.watermark, head } } : {}) };
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
    if (failures.length > 0) throw new AggregateError([...originalFailure, ...failures], "Attack fixture cleanup failed");
  }
}
const proof = run();
allocated.forEach((directory) => assert.equal(existsSync(directory), false, "Actual harness directory survived cleanup"));
process.stdout.write(JSON.stringify({ ...proof, childCleanup: true }) + "\n");
`
