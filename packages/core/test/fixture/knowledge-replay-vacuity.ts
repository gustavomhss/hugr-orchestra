export * as KnowledgeReplayVacuity from "./knowledge-replay-vacuity"

import { mkdtempSync, realpathSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"

const SemanticRow = Schema.Record(Schema.String, Schema.Json)
export const modes = ["positive", "testName", "shape"] as const
export type Mode = typeof modes[number]
export const Proof = Schema.Struct({
  pid: Schema.Number, mode: Schema.String, produced: Schema.Number,
  source: SemanticRow, candidate: SemanticRow,
  sourceReverified: Schema.Number, sourceGate: Schema.Boolean, witnessPreserved: Schema.Boolean,
  before: Schema.Struct({ current: Schema.Number, cas: Schema.Number, sidecarsAbsent: Schema.Boolean }),
  boots: Schema.Array(Schema.Struct({ current: Schema.Number, staging: Schema.Number, cas: Schema.Number,
    row: SemanticRow, reverified: Schema.Number, rejected: Schema.Number, served: Schema.Number,
    stagingFiles: Schema.Record(Schema.String, Schema.String) })),
  childCleanup: Schema.Boolean,
})

export async function make(mode: Mode = "positive") {
  const root = mkdtempSync(path.join(tmpdir(), "atlas-replay-vacuity-"))
  return build(root, mode).catch((error: unknown) => {
    rmSync(root, { recursive: true, force: true })
    throw error
  })
}

async function build(root: string, mode: Mode = "positive") {
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
  }, astWarmup: true, scip: "actual serialized SCIP fixture; vacuity oracle is the real AST scan" }
  const entry = path.join(root, "entry.ts")
  const grammarOutcomes = await Promise.allSettled(["tree-sitter-typescript.wasm", "tree-sitter-tsx.wasm"].map(async (name) => {
    const resolved = realpathSync(Bun.resolveSync(`tree-sitter-typescript/${name}`, path.join(packages, "adapter-io")))
    const bytes = await Bun.file(resolved).arrayBuffer()
    await Bun.write(path.join(root, "node_modules/tree-sitter-typescript", name), bytes)
    return { name, resolved, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") }
  }))
  const grammarFailures = grammarOutcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected")
  if (grammarFailures.length) throw new AggregateError(grammarFailures.map((outcome) => outcome.reason), "Physical grammar preparation failed")
  const grammars = grammarOutcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : [])
  await Bun.write(entry, [
    `export { composeRuntime } from ${JSON.stringify(path.join(packages, "adapter-io/src/compose.ts"))}`,
    `export { makeFixRepo } from ${JSON.stringify(path.join(packages, "adapter-io/test/harness/fix-repo.ts"))}`,
    `export { makeFixScip } from ${JSON.stringify(path.join(packages, "adapter-io/test/harness/fix-scip.ts"))}`,
    `export { createDiskStore, rehydrateProjection } from ${JSON.stringify(path.join(packages, "adapter-io/src/store.ts"))}`,
    `export { readKnowledge, appendKnowledge } from ${JSON.stringify(path.join(packages, "adapter-io/src/knowledge-log.ts"))}`,
    `export { atlasDir, membersDir, knowledgeShardPath, blobPath } from ${JSON.stringify(path.join(packages, "adapter-io/src/layout.ts"))}`,
    `export { testVacuityKey } from ${JSON.stringify(path.join(packages, "knowledge/src/index.ts"))}`,
    `export { id } from ${JSON.stringify(path.join(packages, "kernel/src/index.ts"))}`,
    `export { runGit, headSha } from ${JSON.stringify(path.join(packages, "adapter-io/src/run-git.ts"))}`,
    `export { initAst } from ${JSON.stringify(path.join(packages, "adapter-io/src/ast.ts"))}`,
    `export { walkFileTree } from ${JSON.stringify(path.join(packages, "adapter-io/src/fs.ts"))}`,
    `export { readScipOrEmpty } from ${JSON.stringify(path.join(packages, "adapter-io/src/scip.ts"))}`,
    `export { deriveGroundingAxes, buildGate } from ${JSON.stringify(path.join(packages, "adapter-io/src/grounding-computer.ts"))}`,
    `export { buildTestVacuityFeed, buildTestVacuityLegs } from ${JSON.stringify(path.join(packages, "adapter-io/src/compose-test-vacuity.ts"))}`,
    `export { createTestVacuityProducer } from ${JSON.stringify(path.join(packages, "adapter-io/src/test-vacuity-source.ts"))}`,
    `export { reverifyTestVacuity } from ${JSON.stringify(path.join(packages, "adapter-io/src/reverify-store.ts"))}`,
  ].join("\n"))
  const built = await Bun.build({
    entrypoints: [entry], target: "node", format: "esm", external: [parserURL],
    plugins: [{ name: "canonical-actual-knowledge-vacuity", setup(builder) {
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
  const setup = { ...manifest, grammars, emitted: { parserURL,
    outputSha256: new Bun.CryptoHasher("sha256").update(output).digest("hex"),
    imports: output.split("\n").filter((line) => /\b(?:import|from)\b/.test(line) && line.includes(parserURL))
      .slice(0, 10).map((line) => line.slice(0, 500)),
  } }
  await Bun.write(Bun.stdout, `L4 vacuity setup: ${JSON.stringify(setup)}\n`)
  const bundle = path.join(root, "actual-atlas.mjs")
  await Bun.write(bundle, output)
  const actor = path.join(root, "actor.mjs")
  await Bun.write(actor, actorSource)
  await Bun.write(path.join(root, "manifest.json"), JSON.stringify(setup))
  return { root, manifest: setup,
    command: ChildProcess.make(process.execPath, [actor, bundle, root, mode], { cwd: source }),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  }
}

// The actor uses the production composition/feed/door and real HEAD AST; no injected proof verdict.
const actorSource = String.raw`import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const api = await import(pathToFileURL(process.argv[2]).href);
const owned = process.argv[3];
const mode = process.argv[4];
assert.ok(["positive", "testName", "shape"].includes(mode));
const saved = ["ATLAS_ACTOR", "ATLAS_RATIFY_TOKEN", "TMPDIR", "TMP", "TEMP"].map((key) => [key, process.env[key]]);
const cleanups = [];
const allocated = [];
const failures = [];
const unit = "src/vacuous.test.ts";
const testName = "swallows the rejection";
const content = "import { test, expect } from 'vitest';\ntest('swallows the rejection', () => {\n  try {\n    doThing();\n  } catch (e) {\n    expect(e).toBeInstanceOf(Error);\n  }\n});\n";
function copy(from, to) {
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
}
function semantic(row) {
  const { derivedAt, ...rest } = row;
  return rest;
}
function repo() {
  const result = api.makeFixRepo();
  cleanups.push(result.cleanup);
  allocated.push(result.repoPath);
  writeFileSync(path.join(result.repoPath, unit), content);
  api.runGit(result.repoPath, ["add", "--", unit]);
  api.runGit(result.repoPath, ["commit", "-q", "-m", "add actual vacuous test"]);
  return result.repoPath;
}
function verify(runtime) {
  const report = runtime.reverify();
  assert.equal(report.sealedProven, 1);
  assert.equal(report.reProven, 1);
  assert.equal(report.broken, 0);
  assert.equal(report.unverifiable, 0);
  return report.reProven;
}
async function run() {
  process.env.ATLAS_ACTOR = "bob";
  process.env.ATLAS_RATIFY_TOKEN = "bob";
  process.env.TMPDIR = owned;
  process.env.TMP = owned;
  process.env.TEMP = owned;
  try {
    await api.initAst();
    const source = repo();
    mkdirSync(api.atlasDir(source), { recursive: true });
    writeFileSync(path.join(api.atlasDir(source), "policy.json"), JSON.stringify({
      nearDup: { claimNormThreshold: 1 }, t0Heuristic: { keywords: [] }, authz: { scopes: { src: ["bob"] } },
    }));
    const index = api.makeFixScip();
    cleanups.push(index.cleanup);
    allocated.push(path.dirname(index.scipPath));
    copy(index.scipPath, path.join(api.atlasDir(source), "index.scip"));
    // SCIP is decoded by production; the vacuity oracle itself is the actual AST scan.
    const rawTree = api.walkFileTree(source);
    const scip = api.readScipOrEmpty(path.join(api.atlasDir(source), "index.scip"));
    const { axes } = api.deriveGroundingAxes(rawTree, scip);
    const feed = api.buildTestVacuityFeed(rawTree, axes);
    const units = feed.units();
    assert.equal(units.length, 1);
    assert.equal(units[0].path, unit);
    assert.equal(units[0].content, content);
    const runtime = api.composeRuntime(source);
    // composeRuntime uses buildTestVacuityLegs -> createTestVacuityProducer and its actual governed buildGate.
    assert.equal(typeof api.buildTestVacuityLegs, "function");
    assert.equal(typeof api.createTestVacuityProducer, "function");
    const produced = runtime.testVacuity();
    assert.equal(produced.length, 1);
    assert.equal(produced[0].admitted, true);
    assert.equal(produced[0].persisted, true);
    assert.equal(produced[0].testName, testName);
    assert.equal(produced[0].shape, "assertion-only-in-catch");
    const key = String(api.testVacuityKey(units[0].unitKey, testName));
    const disk = api.createDiskStore(path.join(api.atlasDir(source), "cas"));
    const projection = api.rehydrateProjection(disk);
    assert.equal(projection.current.size, 1);
    const row = projection.current.get(key);
    assert.ok(row);
    assert.equal(row.family, "test-vacuity");
    assert.equal(row.unitKey, units[0].unitKey);
    assert.equal(row.primaryAnchor, units[0].unitKey);
    assert.equal(row.testName, testName);
    assert.equal(row.shape, "assertion-only-in-catch");
    assert.equal(row.scope, "src");
    assert.equal(row.tier, "T2");
    assert.equal(row.seal, "proven");
    assert.deepEqual(row.claims, [row.shape + " test '" + testName + "' @ " + row.unitKey]);
    const fact = disk.get(row.contentHash);
    assert.ok(fact);
    assert.equal(String(api.id(fact)), row.contentHash);
    assert.equal(String(fact.id), key);
    assert.equal(fact.witness.testName, testName);
    assert.equal(fact.witness.shape, row.shape);
    const sourceGate = api.buildGate(axes).gateHolds(fact, api.headSha(source)) === "HOLDS";
    assert.equal(sourceGate, true);
    assert.equal(feed.replay(row.unitKey, testName, row.shape), "proven");
    const sourceReverified = verify(api.composeRuntime(source));
    const sourceLog = api.readKnowledge(source);
    assert.equal(sourceLog.rejected, 0);
    assert.equal(sourceLog.rows.size, 1);
    const entry = sourceLog.rows.get(key);
    assert.ok(entry);
    assert.deepEqual(semantic(entry.row), semantic(row));
    const sourceShard = readFileSync(api.knowledgeShardPath(source, "bob", key));
    const destination = repo();
    for (const name of ["policy.json", "index.scip"])
      copy(path.join(api.atlasDir(source), name), path.join(api.atlasDir(destination), name));
    const targetDisk = api.createDiskStore(path.join(api.atlasDir(destination), "cas"));
    assert.equal(existsSync(path.join(api.atlasDir(destination), "cas")), false);
    const beforeProjection = api.rehydrateProjection(targetDisk);
    const before = { current: beforeProjection.current.size, cas: beforeProjection.cas.size,
      sidecarsAbsent: !readdirSync(api.atlasDir(destination)).some((name) => /^(projection|staging)/.test(name)) };
    assert.deepEqual(before, { current: 0, cas: 0, sidecarsAbsent: true });
    const incomingFact = mode === "positive" ? fact : {
      ...fact,
      ...(mode === "testName" ? { testName: "forged different test" } : { shape: "no-assertion-in-test" }),
    };
    if (mode === "testName") incomingFact.id = api.testVacuityKey(incomingFact.unitKey, incomingFact.testName);
    const candidate = mode === "positive" ? semantic(row) : {
      ...semantic(row),
      nodeKey: String(api.testVacuityKey(incomingFact.unitKey, incomingFact.testName)),
      contentHash: String(api.id(incomingFact)), testName: incomingFact.testName, shape: incomingFact.shape,
      claims: [incomingFact.shape + " test '" + incomingFact.testName + "' @ " + incomingFact.unitKey],
    };
    assert.deepEqual(incomingFact.witness, fact.witness);
    const witnessPreserved = JSON.stringify(incomingFact.witness) === JSON.stringify(fact.witness);
    if (mode === "positive") {
      copy(api.knowledgeShardPath(source, "bob", key), api.knowledgeShardPath(destination, "bob", key));
      copy(api.blobPath(source, row.contentHash), api.blobPath(destination, row.contentHash));
    } else {
      assert.notEqual(candidate.contentHash, row.contentHash);
      assert.equal(candidate[mode], incomingFact[mode]);
      assert.notEqual(incomingFact[mode], incomingFact.witness[mode]);
      // Existing production reproof follows the witness: it is intentionally still true for this inconsistent fact.
      assert.equal(feed.replay(incomingFact.unitKey, incomingFact.witness.testName, incomingFact.witness.shape), "proven");
      assert.equal(api.reverifyTestVacuity(candidate.nodeKey, incomingFact, feed.replay).outcome, "re-proven");
      api.appendKnowledge(destination, { ...entry, row: candidate, at: "9998-01-01T00:00:00.000Z" }, incomingFact);
    }
    const copiedFiles = readdirSync(api.atlasDir(destination)).sort();
    assert.deepEqual(copiedFiles, ["blobs", "index.scip", "members", "policy.json"]);
    const originalBlob = readFileSync(api.blobPath(source, row.contentHash));
    const admitted = api.readKnowledge(destination);
    assert.equal(admitted.rejected, 0);
    assert.deepEqual(semantic(admitted.rows.get(candidate.nodeKey).row), candidate);
    assert.equal(targetDisk.get(candidate.contentHash), undefined);
    function boot() {
      const replay = api.composeRuntime(destination);
      const current = api.rehydrateProjection(targetDisk);
      const staging = targetDisk.commitStaging((value) => ({ out: value }));
      assert.equal(staging.settled, true);
      const positive = mode === "positive";
      assert.equal(current.current.size, positive ? 1 : 0);
      assert.equal(staging.out.current.size, positive ? 0 : 1);
      const selected = positive ? current : staging.out;
      const held = selected.current.get(candidate.nodeKey);
      assert.ok(held, "Original complete candidate must survive");
      assert.deepEqual(semantic(held), candidate);
      assert.equal(selected.cas.size, 1);
      assert.deepEqual(targetDisk.get(candidate.contentHash), incomingFact);
      const served = replay.testVacuities("");
      assert.equal(served.length, positive ? 1 : 0);
      const reverified = positive ? verify(replay) : replay.reverify().reProven;
      if (!positive) assert.equal(reverified, 0);
      const log = api.readKnowledge(destination);
      assert.equal(log.rejected, 0);
      assert.deepEqual(semantic(log.rows.get(candidate.nodeKey).row), candidate);
      const stagingFiles = Object.fromEntries(readdirSync(api.atlasDir(destination))
        .filter((name) => /^staging(?:\.[0-9]+)?\.json$/.test(name)).sort()
        .map((name) => [name, readFileSync(path.join(api.atlasDir(destination), name), "utf8")]));
      return { current: current.current.size, staging: staging.out.current.size, cas: selected.cas.size,
        row: semantic(held), reverified, rejected: log.rejected, served: served.length, stagingFiles };
    }
    const first = boot();
    const second = boot();
    assert.deepEqual(second, first, "Second identical boot must be idempotent, including original candidate/staging bytes");
    assert.deepEqual(readFileSync(api.blobPath(source, row.contentHash)), originalBlob);
    assert.deepEqual(disk.get(row.contentHash), fact);
    assert.deepEqual(readFileSync(api.knowledgeShardPath(source, "bob", key)), sourceShard);
    return { pid: process.pid, mode, produced: produced.length, source: semantic(row), candidate,
      sourceReverified, sourceGate, witnessPreserved, before, boots: [first, second] };
  } catch (error) {
    failures.push(error);
    throw error;
  } finally {
    const restores = saved.map(([key, value]) => () => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    const cleanupFailures = [...cleanups.reverse(), ...restores].flatMap((cleanup) => {
      try { cleanup(); return []; } catch (error) { return [error]; }
    });
    if (cleanupFailures.length) throw new AggregateError([...failures, ...cleanupFailures], "Actual vacuity fixture cleanup failed");
  }
}
const proof = await run();
allocated.forEach((directory) => assert.equal(existsSync(directory), false, "Actual repository survived cleanup"));
process.stdout.write(JSON.stringify({ ...proof, childCleanup: true }) + "\n");
`
