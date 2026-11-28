export * as KnowledgeReplayAdvisory from "./knowledge-replay-advisory"

import { mkdtempSync, realpathSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AtlasParser } from "./atlas-parser"

export const modes = [
  "single-legacy", "history", "history-missing-blob", "history-missing-support", "history-scope", "history-key",
  "current-missing", "witness-slot", "duplicate-claims", "supersededBy", "structural-invalid", "local-noop",
] as const
export type Mode = typeof modes[number]

// Metadata is already JSON-decoded; avoid recursive JSON expansion in matcher inference.
const Row = Schema.Record(Schema.String, Schema.Unknown)
export const Proof = Schema.Struct({
  pid: Schema.Number, mode: Schema.String, factIDs: Schema.Array(Schema.String), key: Schema.String,
  claims: Schema.Array(Schema.String), source: Row, candidate: Row, supportCandidate: Schema.optionalKey(Row),
  sourceReverified: Schema.Number, callerReceipts: Schema.Boolean,
  snapshots: Schema.Array(Schema.Struct({
    current: Schema.Number, staging: Schema.Number, row: Schema.optionalKey(Row), rows: Schema.Array(Row), generations: Schema.Array(Schema.String),
  })),
  currentBlobPresent: Schema.Boolean, historicalBlobPresent: Schema.Boolean, childCleanup: Schema.Boolean,
})

export async function make(mode: Mode) {
  const root = mkdtempSync(path.join(tmpdir(), "atlas-advisory-replay-"))
  return build(root, mode).catch((error: unknown) => {
    rmSync(root, { recursive: true, force: true })
    throw error
  })
}

async function build(root: string, mode: Mode) {
  const source = path.resolve(import.meta.dir, "../../../..")
  const boundary = path.join(source, "modules/atlas/boundary")
  const packages = path.resolve(boundary, "../packages")
  const metadataPath = path.join(await AtlasParser.directory(source), "package.json")
  const metadataBytes = await Bun.file(metadataPath).arrayBuffer()
  const metadata: unknown = await Bun.file(metadataPath).json()
  if (typeof metadata !== "object" || metadata === null || !("name" in metadata) || metadata.name !== "web-tree-sitter" ||
    !("version" in metadata) || metadata.version !== "0.23.2" || !("main" in metadata) || metadata.main !== "tree-sitter.js")
    throw new Error("Actual boundary parser must be web-tree-sitter@0.23.2 with main tree-sitter.js")
  const parser = realpathSync(path.join(path.dirname(metadataPath), "tree-sitter.js"))
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
    `export { createDiskStore, rehydrateProjection } from ${JSON.stringify(path.join(packages, "adapter-io/src/store.ts"))}`,
    `export { withKnowledgeLog, appendKnowledge, readKnowledge } from ${JSON.stringify(path.join(packages, "adapter-io/src/knowledge-log.ts"))}`,
    `export { atlasDir, blobPath, knowledgeShardPath } from ${JSON.stringify(path.join(packages, "adapter-io/src/layout.ts"))}`,
    `export { headSha } from ${JSON.stringify(path.join(packages, "adapter-io/src/run-git.ts"))}`,
    `export { walkFileTree } from ${JSON.stringify(path.join(packages, "adapter-io/src/fs.ts"))}`,
    `export { readScipOrEmpty } from ${JSON.stringify(path.join(packages, "adapter-io/src/scip.ts"))}`,
    `export { deriveGroundingAxes, buildGate } from ${JSON.stringify(path.join(packages, "adapter-io/src/grounding-computer.ts"))}`,
    `export { buildMineAdmission } from ${JSON.stringify(path.join(packages, "adapter-io/src/compose-mine-admission.ts"))}`,
    `export { createGovernedEmit } from ${JSON.stringify(path.join(packages, "adapter-io/src/governed-emit.ts"))}`,
    `export { admit } from ${JSON.stringify(path.join(packages, "genesis/src/admit-harness.ts"))}`,
    `export { nodeKey } from ${JSON.stringify(path.join(packages, "knowledge/src/index.ts"))}`,
    `export { id } from ${JSON.stringify(path.join(packages, "kernel/src/index.ts"))}`,
    `export { create } from "@bufbuild/protobuf"`,
    `export { serializeSCIP, IndexSchema, MetadataSchema, ToolInfoSchema, DocumentSchema, OccurrenceSchema, SymbolRole } from "@c4312/scip"`,
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
  await Bun.write(actor, actorSource)
  await Bun.write(path.join(root, "manifest.json"), JSON.stringify(setup))
  return { root, manifest,
    command: ChildProcess.make(process.execPath, [actor, bundle, root, mode], { cwd: source }),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  }
}

// Receipt fields below are explicit caller-supplied promoted input, not producer-minted or authenticated provenance.
const actorSource = String.raw`import assert from "node:assert/strict";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
    const util = path.join(source.repoPath, "src/util.ts");
    writeFileSync(util, readFileSync(util, "utf8") + "\nexport function missingHelper(): string { return 'helper'; }\n");
    mkdirSync(api.atlasDir(source.repoPath), { recursive: true });
    const policy = { t0Heuristic: { keywords: [] }, authz: {
      scopes: { src: ["bob"], other: ["bob"] }, anchors: { src: "src" },
    } };
    writeFileSync(path.join(api.atlasDir(source.repoPath), "policy.json"), JSON.stringify(policy));
    // Controlled serialized SCIP with two definitions actually present in util.ts and both refs present in app.ts.
    const targets = ["util/greet().", "util/missingHelper()."];
    const scipPath = path.join(api.atlasDir(source.repoPath), "index.scip");
    writeFileSync(scipPath, api.serializeSCIP(api.create(api.IndexSchema, {
      metadata: api.create(api.MetadataSchema, { projectRoot: "file:///fix-repo",
        toolInfo: api.create(api.ToolInfoSchema, { name: "atlas-fixture", version: "0" }) }),
      documents: [
        api.create(api.DocumentSchema, { relativePath: "src/util.ts", occurrences: targets.map((symbol) =>
          api.create(api.OccurrenceSchema, { symbol, symbolRoles: api.SymbolRole.Definition })) }),
        api.create(api.DocumentSchema, { relativePath: "src/app.ts", occurrences: targets.map((symbol) =>
          api.create(api.OccurrenceSchema, { symbol, symbolRoles: 0 })) }),
      ],
    })));
    const scip = api.readScipOrEmpty(scipPath);
    assert.equal(scip.documents.length, 2);
    const axes = api.deriveGroundingAxes(api.walkFileTree(source.repoPath), scip).axes;
    const admission = api.buildMineAdmission(axes, scip);
    const grounding = admission.reground({ kind: "file", qualifiedPath: "src/app.ts" });
    assert.equal(grounding.entries.length, 1);
    const site = { site: grounding.entries[0].anchor,
      signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }, ppr: 1, rank: 1 };
    const callerReceipts = mode.startsWith("history");
    const facts = targets.slice(0, callerReceipts ? 2 : 1).map((target, index) => {
      const admitted = api.admit({ kind: "predicate", site, slot: "dependency", target, scope: "src",
        nodeKey: site.site.qualifiedPath, claimNorm: "model proposal, never accepted as proof text", grounding, tier: "T2" }, admission.deps);
      assert.equal(admitted.outcome, "admitted");
      assert.equal(admitted.fact.kind, "advisory");
      assert.equal(admitted.fact.id, "src/app.ts");
      assert.equal(admitted.fact.seal, "proven");
      assert.equal(admitted.fact.predicateSlot, admitted.fact.witness.slot);
      assert.equal(admitted.fact.witness.target, target);
      // The host supplies the write scope and optional receipt, retaining every actual admission proof field.
      return { ...admitted.fact, scope: "src", ...(callerReceipts ? {
        provenance: { source: "fixture-caller-receipt-" + index, trusted: true },
      } : {}) };
    });
    const disk = api.createDiskStore(path.join(api.atlasDir(source.repoPath), "cas"), () => api.headSha(source.repoPath));
    const logged = api.withKnowledgeLog(disk, { repoPath: source.repoPath, seat: "bob" });
    const writer = api.createGovernedEmit({ store: logged, gate: api.buildGate(axes), policy,
      actor: "bob", ratifyToken: "bob", origin: "promoted" });
    const keys = facts.map((fact) => {
      const emitted = writer.emit(fact, api.headSha(source.repoPath));
      assert.equal(emitted.emitted, true, JSON.stringify(emitted));
      assert.notEqual(emitted.nodeKey, fact.id, "Path diagnostic ID must not replace projected hashed identity");
      assert.equal(emitted.nodeKey, String(api.nodeKey({ ...fact, slot: fact.predicateSlot })));
      assert.equal(emitted.id, String(api.id(fact)));
      verify(api.composeRuntime(source.repoPath));
      return emitted.nodeKey;
    });
    assert.equal(new Set(keys).size, 1);
    const key = keys[0];
    const sourceProjection = api.rehydrateProjection(disk);
    assert.equal(sourceProjection.current.size, 1);
    const row = sourceProjection.current.get(key);
    assert.ok(row);
    assert.deepEqual(row.claims, facts.map((fact) => fact.claimNorm));
    assert.equal(new Set(row.claims).size, facts.length);
    assert.equal(row.primaryAnchor, "src/app.ts");
    assert.equal(row.slot, "dependency");
    assert.equal(row.scope, "src");
    assert.equal(row.tier, "T2");
    assert.equal(row.seal, "proven");
    if (callerReceipts) assert.deepEqual(row.provenanceByClaim,
      Object.fromEntries(facts.map((fact) => [fact.claimNorm, fact.provenance])));
    if (!callerReceipts) assert.equal(row.provenanceByClaim, undefined);
    const sourceReverified = verify(api.composeRuntime(source.repoPath));
    const read = api.readKnowledge(source.repoPath);
    assert.equal(read.rejected, 0);
    assert.equal(read.lines.length, facts.length);
    assert.deepEqual(semantic(read.rows.get(key).row), semantic(row));
    const original = facts[facts.length - 1];
    const mutatedFact = mode === "witness-slot" ? { ...original, predicateSlot: "count" } : original;
    const candidate = { ...semantic(row), ...(mode === "witness-slot" ? {
      slot: "count", nodeKey: String(api.nodeKey({ ...mutatedFact, slot: "count" })), contentHash: String(api.id(mutatedFact)),
    } : {}), ...(mode === "duplicate-claims" ? { claims: [row.claims[0], row.claims[0]] } : {}),
      ...(mode === "supersededBy" ? { supersededBy: "b".repeat(64) } : {}),
      ...(mode === "structural-invalid" ? { claims: "not-an-array" } : {}),
      ...(mode === "local-noop" ? { claims: [...row.claims, "uncertified locally held claim"],
        sameAs: ["local-peer"], sameAsRetracted: ["local-peer"], answerRef: "c".repeat(64) } : {}),
    };
    const supportFact = mode === "history-scope" ? { ...facts[0], scope: "other" } : facts[0];
    const supportCandidate = mode === "history-scope" || mode === "history-key" ? {
      ...semantic(read.lines[0].row), ...(mode === "history-scope" ? {
        scope: "other", contentHash: String(api.id(supportFact)),
      } : { nodeKey: "incompatible-history-key" }),
    } : undefined;
    const destination = api.makeFixRepo();
    cleanups.push(destination.cleanup);
    allocated.push(destination.repoPath);
    copy(util, path.join(destination.repoPath, "src/util.ts"));
    for (const name of ["policy.json", "index.scip"])
      copy(path.join(api.atlasDir(source.repoPath), name), path.join(api.atlasDir(destination.repoPath), name));
    mkdirSync(path.join(api.atlasDir(destination.repoPath), "blobs"), { recursive: true });
    for (const fact of facts)
      copy(api.blobPath(source.repoPath, String(api.id(fact))), api.blobPath(destination.repoPath, String(api.id(fact))));
    const intact = ["single-legacy", "history", "history-missing-blob", "current-missing"].includes(mode);
    if (intact) cpSync(path.join(api.atlasDir(source.repoPath), "members"), path.join(api.atlasDir(destination.repoPath), "members"), { recursive: true });
    if (!intact) {
      if (mode === "history-scope" || mode === "history-key") {
        const prior = read.lines[0];
        assert.ok(supportCandidate);
        api.appendKnowledge(destination.repoPath, { ...prior, row: supportCandidate, at: "9998-01-01T00:00:00.000Z" }, supportFact);
      }
      api.appendKnowledge(destination.repoPath, { ...read.rows.get(key), row: candidate, at: "9999-01-01T00:00:00.000Z" }, mutatedFact);
    }
    if (mode === "history-missing-blob") rmSync(api.blobPath(destination.repoPath, String(api.id(facts[0]))));
    if (mode === "current-missing") rmSync(api.blobPath(destination.repoPath, row.contentHash));
    assert.deepEqual(readdirSync(api.atlasDir(destination.repoPath)).sort(), ["blobs", "index.scip", "members", "policy.json"]);
    const destinationDisk = api.createDiskStore(path.join(api.atlasDir(destination.repoPath), "cas"));
    assert.equal(api.rehydrateProjection(destinationDisk).current.size, 0);
    assert.equal(api.rehydrateProjection(destinationDisk).cas.size, 0);
    const currentBlobPresent = existsSync(api.blobPath(destination.repoPath, candidate.contentHash));
    const historicalBlobPresent = existsSync(api.blobPath(destination.repoPath, String(api.id(facts[0]))));
    const shards = [];
    function collect(directory) {
      readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) return collect(file);
        shards.push([file, readFileSync(file, "utf8")]);
      });
    }
    collect(path.join(api.atlasDir(destination.repoPath), "members"));
    if (mode === "local-noop") {
      // An exact local semantic no-op is preservation, explicitly not certification of these extra assertions.
      const settled = destinationDisk.commitProjection((projection) => ({ out: true, put: [original],
        next: { ...projection, current: new Map([[candidate.nodeKey, candidate]]), cas: new Set([candidate.contentHash]) } }));
      assert.equal(settled.settled, true);
    }
    const active = ["single-legacy", "history", "local-noop"].includes(mode);
    const absent = mode === "current-missing" || mode === "structural-invalid";
    const files = [];
    function boot() {
      const runtime = api.composeRuntime(destination.repoPath);
      const current = api.rehydrateProjection(destinationDisk);
      const staging = destinationDisk.commitStaging((projection) => ({ out: projection }));
      assert.equal(staging.settled, true);
      assert.equal(current.current.size, active ? 1 : 0);
      assert.equal(staging.out.current.size, active || absent ? 0 : mode === "history-key" ? 2 : 1);
      const selected = active ? current : staging.out;
      const held = selected.current.get(candidate.nodeKey);
      if (!absent) {
        assert.ok(held);
        assert.deepEqual(semantic(held), candidate);
      }
      const rows = [...selected.current.values()].map(semantic).sort((a, b) => a.nodeKey.localeCompare(b.nodeKey));
      assert.deepEqual(rows, absent ? [] : mode === "history-key"
        ? [candidate, supportCandidate].sort((a, b) => a.nodeKey.localeCompare(b.nodeKey)) : [candidate]);
      if (mode === "history-key") assert.equal(selected.cas.size, 2);
      if (active && mode !== "local-noop") verify(runtime);
      assert.deepEqual(runtime.relations("src/app.ts", "out"), []);
      const generations = readdirSync(api.atlasDir(destination.repoPath)).filter((name) => /^(?:staging|projection)(?:\.[0-9]+)?\.json$/.test(name)).sort();
      files.push(generations.map((name) => [name, readFileSync(path.join(api.atlasDir(destination.repoPath), name), "utf8")]));
      return { current: current.current.size, staging: staging.out.current.size, ...(held ? { row: semantic(held) } : {}), rows, generations };
    }
    const snapshots = [boot(), boot()];
    assert.deepEqual(snapshots[1], snapshots[0]);
    assert.deepEqual(files[1], files[0], "Identical second boot must not rewrite active or staged state");
    shards.forEach(([file, bytes]) => assert.equal(readFileSync(file, "utf8"), bytes, "Original committed log must remain immutable"));
    facts.forEach((fact) => assert.deepEqual(disk.get(String(api.id(fact))), fact));
    return { pid: process.pid, mode, factIDs: facts.map((fact) => fact.id), key, claims: row.claims,
      source: semantic(row), candidate, ...(supportCandidate ? { supportCandidate } : {}),
      sourceReverified, callerReceipts, snapshots, currentBlobPresent, historicalBlobPresent };
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
    if (failures.length > 0) throw new AggregateError([...originalFailure, ...failures], "Advisory fixture cleanup failed");
  }
}
const proof = run();
allocated.forEach((directory) => assert.equal(existsSync(directory), false, "Actual harness directory survived cleanup"));
process.stdout.write(JSON.stringify({ ...proof, childCleanup: true }) + "\n");
`
