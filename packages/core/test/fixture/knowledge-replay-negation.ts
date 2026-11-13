export * as KnowledgeReplayNegation from "./knowledge-replay-negation"

import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"

const JsonObject = Schema.Record(Schema.String, Schema.Json)
export const Proof = Schema.Struct({
  pid: Schema.Number, kind: Schema.Literal("promoted-input seal-preservation"),
  builderMintedSeal: Schema.Boolean, promoted: Schema.Number,
  source: JsonObject, replayed: JsonObject, second: JsonObject,
  fact: JsonObject, restored: JsonObject,
  reverified: Schema.Array(Schema.Number), publicNegations: Schema.Array(Schema.Number),
  rowSealAbsent: Schema.Array(Schema.Boolean), rejected: Schema.Array(Schema.Number),
  before: Schema.Struct({ current: Schema.Number, cas: Schema.Number, sidecarsAbsent: Schema.Boolean }),
  fixtureSCIPSHA256: Schema.String, childCleanup: Schema.Boolean,
})

export async function make() {
  if (!process.env.RUNNER_OS) throw new Error("Negation source bundling and runtime qualification require hosted execution")
  const root = mkdtempSync(path.join(tmpdir(), "atlas-replay-negation-"))
  return build(root).catch((error: unknown) => {
    rmSync(root, { recursive: true, force: true })
    throw error
  })
}

async function build(root: string) {
  const source = path.resolve(import.meta.dir, "../../../..")
  const boundary = path.join(source, "modules/atlas/boundary")
  const packages = path.resolve(boundary, "../packages")
  const metadataPath = path.join(boundary, "node_modules/web-tree-sitter/package.json")
  const metadataBytes = await Bun.file(metadataPath).arrayBuffer()
  const metadata: unknown = await Bun.file(metadataPath).json()
  if (typeof metadata !== "object" || metadata === null || !("name" in metadata) || metadata.name !== "web-tree-sitter" ||
    !("version" in metadata) || metadata.version !== "0.23.2" || !("main" in metadata) || metadata.main !== "tree-sitter.js")
    throw new Error("Negation fixture needs the actual web-tree-sitter@0.23.2 tree-sitter.js entry")
  const parser = realpathSync(path.join(boundary, "node_modules/web-tree-sitter/tree-sitter.js"))
  if (!statSync(parser).isFile()) throw new Error("Actual pinned parser entry must be a regular file")
  const parserURL = pathToFileURL(parser).href
  // initAst's runtime require.resolve must use the installed grammar even though this bundle lives in tmp.
  const grammar = realpathSync(path.join(source, "packages/core/node_modules/tree-sitter-typescript"))
  mkdirSync(path.join(root, "node_modules"))
  symlinkSync(grammar, path.join(root, "node_modules/tree-sitter-typescript"), process.platform === "win32" ? "junction" : "dir")
  const fixture = path.join(packages, "adapter-io/test/fixtures/neg-collapsed-local")
  const manifest = { parser: { resolved: parser, version: metadata.version,
    packageSha256: new Bun.CryptoHasher("sha256").update(metadataBytes).digest("hex"),
    entrySha256: new Bun.CryptoHasher("sha256").update(await Bun.file(parser).arrayBuffer()).digest("hex"),
  }, fixtureSCIPSHA256: new Bun.CryptoHasher("sha256")
    .update(await Bun.file(path.join(fixture, "collapsed-local.scip")).arrayBuffer()).digest("hex") }
  const entry = path.join(root, "entry.ts")
  await Bun.write(entry, [
    `export { composeRuntime } from ${JSON.stringify(path.join(packages, "adapter-io/src/compose.ts"))}`,
    `export { initAst, astWarmed } from ${JSON.stringify(path.join(packages, "adapter-io/src/ast.ts"))}`,
    `export { createDiskStore, rehydrateProjection } from ${JSON.stringify(path.join(packages, "adapter-io/src/store.ts"))}`,
    `export { readKnowledge } from ${JSON.stringify(path.join(packages, "adapter-io/src/knowledge-log.ts"))}`,
    `export { atlasDir, knowledgeShardPath, blobPath } from ${JSON.stringify(path.join(packages, "adapter-io/src/layout.ts"))}`,
    `export { runGit, headSha } from ${JSON.stringify(path.join(packages, "adapter-io/src/run-git.ts"))}`,
    `export { buildNegation } from ${JSON.stringify(path.join(packages, "genesis/src/admit-negation.ts"))}`,
    `export { id } from ${JSON.stringify(path.join(packages, "kernel/src/index.ts"))}`,
  ].join("\n"))
  const built = await Bun.build({
    entrypoints: [entry], target: "node", format: "esm", external: [parserURL],
    plugins: [{ name: "canonical-negation-replay", setup(builder) {
      builder.onResolve({ filter: /^@atlas\// }, (args) => ({
        path: path.join(packages, args.path.slice("@atlas/".length), "src/index.ts"),
      }))
      builder.onResolve({ filter: /^@noble\/hashes\// }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
      builder.onResolve({ filter: /^@bufbuild\/protobuf(\/.*)?$/ }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
      builder.onResolve({ filter: /^@c4312\/scip$/ }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
      builder.onResolve({ filter: /^tree-sitter-typescript\/tree-sitter-(typescript|tsx)\.wasm$/ }, (args) => ({
        path: Bun.resolveSync(args.path, path.join(source, "packages/core")), external: true,
      }))
      builder.onResolve({ filter: /^web-tree-sitter$/ }, () => ({ path: "parser", namespace: "atlas-pinned-parser" }))
      builder.onLoad({ filter: /.*/, namespace: "atlas-pinned-parser" }, () => ({
        contents: `import Parser from ${JSON.stringify(parserURL)}; export default Parser;`, loader: "js",
      }))
    } }],
  })
  if (!built.success || built.outputs.length !== 1 || built.outputs[0] === undefined)
    throw new Error(`Actual negation fixture build failed: ${built.logs.join("\n")}`)
  const output = await built.outputs[0].text()
  if (!output.includes(parserURL) || /\b(?:from|import)\s*["']web-tree-sitter["']/.test(output))
    throw new Error("Negation fixture must import the physical parser URL, not a bare parser module")
  const bundle = path.join(root, "actual-atlas.mjs")
  await Bun.write(bundle, output)
  const actor = path.join(root, "actor.mjs")
  await Bun.write(actor, actorSource)
  await Bun.write(path.join(root, "manifest.json"), JSON.stringify({ ...manifest,
    outputSHA256: new Bun.CryptoHasher("sha256").update(output).digest("hex") }))
  return { root, manifest,
    command: ChildProcess.make(process.execPath, [actor, bundle, root, fixture],
      { cwd: source, stdin: "ignore", stdout: "pipe", stderr: "pipe" }),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  }
}

// This supplies a proven INPUT seal to the actual promoted door. It does not claim that buildNegation mints it.
const actorSource = String.raw`import assert from "node:assert/strict";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const api = await import(pathToFileURL(process.argv[2]).href);
const owned = process.argv[3];
const fixture = process.argv[4];
const scope = "packages/other/src";
const target = "scip-typescript npm @atlas/other 0.0.0 src/companion.ts/helper().";
const source = path.join(owned, "source");
const destination = path.join(owned, "destination");
const saved = ["ATLAS_ACTOR", "ATLAS_RATIFY_TOKEN", "TMPDIR", "TMP", "TEMP"].map((key) => [key, process.env[key]]);
function semantic(row) {
  const { derivedAt, ...value } = row;
  return value;
}
function copy(from, to) {
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
}
function repo(directory) {
  cpSync(path.join(fixture, "repo"), directory, { recursive: true });
  writeFileSync(path.join(directory, ".gitignore"), ".atlas/cas/\n.atlas/projection*.json\n.atlas/staging*.json\n");
  api.runGit(directory, ["init", "--initial-branch=base"]);
  for (const [key, value] of [["core.autocrlf", "false"], ["core.fsmonitor", "false"], ["commit.gpgsign", "false"],
    ["user.email", "negation-fixture@example.invalid"], ["user.name", "Negation acceptance"]])
    api.runGit(directory, ["config", key, value]);
  api.runGit(directory, ["add", "."]);
  api.runGit(directory, ["commit", "-m", "test: frozen negation source"]);
}
function verify(runtime) {
  const report = runtime.reverify();
  assert.equal(report.sealedProven, 1);
  assert.equal(report.reProven, 1);
  assert.equal(report.broken, 0);
  assert.equal(report.unverifiable, 0);
  return report.reProven;
}
function visible(runtime, key) {
  const read = runtime.negations(scope);
  assert.deepEqual(read.abstentions, []);
  assert.deepEqual(read.negations, [{ nodeKey: key, relationKind: "calls", target, scope, freshness: "FRESH" }]);
  return read.negations.length;
}
async function run() {
  const failures = [];
  process.env.ATLAS_ACTOR = "bob";
  process.env.ATLAS_RATIFY_TOKEN = "bob";
  process.env.TMPDIR = owned;
  process.env.TMP = owned;
  process.env.TEMP = owned;
  try {
    await api.initAst();
    assert.equal(api.astWarmed(), true, "Both production grammars must be loaded before composing real closure feeds");
    repo(source);
    mkdirSync(api.atlasDir(source), { recursive: true });
    writeFileSync(path.join(api.atlasDir(source), "policy.json"), JSON.stringify({
      t0Heuristic: { keywords: [] }, authz: { scopes: { [scope]: ["bob"] }, anchors: { [scope]: scope } },
    }));
    copy(path.join(fixture, "collapsed-local.scip"), path.join(api.atlasDir(source), "index.scip"));
    const runtime = api.composeRuntime(source);
    const anchors = runtime.anchors(scope + "/companion.ts");
    const anchor = anchors.units.find((unit) => unit.kind === "file" && unit.qualifiedPath === scope + "/companion.ts");
    assert.ok(anchor, "Use the actual HEAD anchor, never a fabricated subtree hash");
    const built = api.buildNegation({ kind: "negation", relationKind: "calls", target, scope, tier: "T2",
      site: { site: { kind: "file", qualifiedPath: anchor.qualifiedPath, subtreeHash: anchor.subtreeHash },
        signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }, ppr: 0, rank: 1 } });
    assert.equal(Object.hasOwn(built, "seal"), false, "The builder is not a proven-seal minter");
    const input = { ...built, seal: "proven" };
    const key = String(built.id);
    const sourceDisk = api.createDiskStore(path.join(api.atlasDir(source), "cas"));
    const hash = String(api.id(input));
    const staged = sourceDisk.commitStaging((projection) => ({ out: 1,
      next: { ...projection, current: new Map([[key, { nodeKey: key, family: "negation", contentHash: hash, claims: [], scope, tier: "T2" }]]),
        cas: new Set([hash]) }, put: [input] }));
    assert.equal(staged.settled, true);
    assert.deepEqual(sourceDisk.get(hash), input);
    const promoted = runtime.promote(api.headSha(source));
    assert.equal(promoted.read, true);
    assert.equal(promoted.candidates, 1);
    assert.equal(promoted.promoted, 1, JSON.stringify(promoted));
    assert.equal(promoted.refused, 0);
    const projection = api.rehydrateProjection(sourceDisk);
    assert.equal(projection.current.size, 1);
    assert.equal(projection.cas.size, 1);
    assert.equal(projection.abstained?.size ?? 0, 0);
    const row = projection.current.get(key);
    assert.ok(row);
    assert.deepEqual(semantic(row), { nodeKey: key, family: "negation", contentHash: row.contentHash,
      claims: ["NOT(" + target + " calls)@" + scope], primaryAnchor: scope, endpointB: target,
      relationKind: "calls", scope, tier: "T2" });
    assert.equal(Object.hasOwn(row, "seal"), false, "Actual negation row intentionally has no seal carrier");
    const fact = sourceDisk.get(row.contentHash);
    assert.ok(fact);
    assert.equal(fact.seal, "proven");
    assert.equal(String(api.id(fact)), row.contentHash);
    assert.deepEqual(fact.grounding.entries.map((entry) => [entry.anchor.kind, entry.anchor.qualifiedPath, entry.path]),
      [["directory", scope, scope]]);
    assert.ok(fact.grounding.entries[0].anchor.subtreeHash.length > 0);
    assert.ok(fact.edgeModel.length > 0);
    const sourceRuntime = api.composeRuntime(source);
    const sourceVerified = verify(sourceRuntime);
    const sourceVisible = visible(sourceRuntime, key);
    const log = api.readKnowledge(source);
    assert.equal(log.rejected, 0);
    assert.equal(log.rows.size, 1);
    assert.deepEqual(semantic(log.rows.get(key).row), semantic(row));

    repo(destination);
    for (const name of ["policy.json", "index.scip"])
      copy(path.join(api.atlasDir(source), name), path.join(api.atlasDir(destination), name));
    copy(api.knowledgeShardPath(source, "bob", key), api.knowledgeShardPath(destination, "bob", key));
    copy(api.blobPath(source, row.contentHash), api.blobPath(destination, row.contentHash));
    assert.deepEqual(readdirSync(api.atlasDir(destination)).sort(), ["blobs", "index.scip", "members", "policy.json"]);
    const destinationCas = path.join(api.atlasDir(destination), "cas");
    assert.equal(existsSync(destinationCas), false);
    const disk = api.createDiskStore(destinationCas);
    const before = api.rehydrateProjection(disk);
    assert.equal(before.current.size, 0);
    assert.equal(before.cas.size, 0);
    assert.equal(readdirSync(api.atlasDir(destination)).some((name) => /^(projection|staging)/.test(name)), false);
    const copiedLog = api.readKnowledge(destination);
    assert.equal(copiedLog.rejected, 0);
    assert.deepEqual(copiedLog.rows.get(key).row, log.rows.get(key).row);
    assert.deepEqual(readFileSync(api.blobPath(destination, row.contentHash)), readFileSync(api.blobPath(source, row.contentHash)));
    const replayedRuntime = api.composeRuntime(destination);
    const replayedProjection = api.rehydrateProjection(disk);
    assert.equal(replayedProjection.current.size, 1);
    const replayed = replayedProjection.current.get(key);
    assert.ok(replayed);
    assert.deepEqual(semantic(replayed), semantic(row));
    assert.equal(Object.hasOwn(replayed, "seal"), false);
    const restored = disk.get(row.contentHash);
    assert.deepEqual(restored, fact);
    const replayVerified = verify(replayedRuntime);
    const replayVisible = visible(replayedRuntime, key);
    const secondRuntime = api.composeRuntime(destination);
    const secondProjection = api.rehydrateProjection(disk);
    assert.equal(secondProjection.current.size, 1);
    const second = secondProjection.current.get(key);
    assert.ok(second);
    assert.deepEqual(semantic(second), semantic(replayed));
    assert.deepEqual([...secondProjection.cas], [...replayedProjection.cas]);
    assert.equal(Object.hasOwn(second, "seal"), false);
    const secondVerified = verify(secondRuntime);
    const secondVisible = visible(secondRuntime, key);
    const secondLog = api.readKnowledge(destination);
    assert.equal(secondLog.rejected, 0);
    assert.deepEqual(secondLog.rows.get(key).row, copiedLog.rows.get(key).row);
    return { pid: process.pid, kind: "promoted-input seal-preservation", builderMintedSeal: false, promoted: promoted.promoted,
      source: semantic(row), replayed: semantic(replayed), second: semantic(second), fact, restored,
      reverified: [sourceVerified, replayVerified, secondVerified], publicNegations: [sourceVisible, replayVisible, secondVisible],
      rowSealAbsent: [row, replayed, second].map((value) => !Object.hasOwn(value, "seal")),
      rejected: [log.rejected, copiedLog.rejected, secondLog.rejected],
      before: { current: before.current.size, cas: before.cas.size, sidecarsAbsent: true },
      fixtureSCIPSHA256: new Bun.CryptoHasher("sha256").update(readFileSync(path.join(fixture, "collapsed-local.scip"))).digest("hex") };
  } catch (error) {
    failures.push(error);
    throw error;
  } finally {
    const actions = [() => rmSync(source, { recursive: true, force: true }), () => rmSync(destination, { recursive: true, force: true }),
      ...saved.map(([key, value]) => () => { if (value === undefined) delete process.env[key]; else process.env[key] = value; })];
    const cleanupFailures = actions.flatMap((cleanup) => { try { cleanup(); return []; } catch (error) { return [error]; } });
    if (cleanupFailures.length > 0) throw new AggregateError([...failures, ...cleanupFailures], "Negation fixture cleanup failed");
  }
}
const proof = await run();
assert.equal(existsSync(source), false);
assert.equal(existsSync(destination), false);
process.stdout.write(JSON.stringify({ ...proof, childCleanup: true }) + "\n");
`
