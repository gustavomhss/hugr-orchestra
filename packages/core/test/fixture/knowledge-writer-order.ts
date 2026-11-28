export * as KnowledgeWriterOrder from "./knowledge-writer-order"

import { expect } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"

type Grounding = {
  readonly entries: readonly {
    readonly anchor: { readonly kind: "symbol"; readonly qualifiedPath: string; readonly subtreeHash: string }
    readonly path: string
  }[]
}
export type Fact = {
  readonly kind: "advisory"
  readonly id: string
  readonly tier: "T2"
  readonly claimNorm: string
  readonly grounding: Grounding
  readonly freshness: "FRESH"
  readonly claims: readonly never[]
  readonly authoring: "ADVISORY"
  readonly scope: "core"
  readonly predicateSlot: "invariant"
  readonly seal: "proven"
}
type Candidate = {
  readonly claimText: string
  readonly claimNorm: string
  readonly grounding: Grounding
  readonly slot: "invariant"
  readonly tier: "T2"
  readonly provenance: { readonly source: string; readonly trusted: boolean }
}
export type Row = {
  readonly nodeKey: string
  readonly family: "advisory"
  readonly contentHash: string
  readonly claims: readonly string[]
  readonly scope: string
  readonly primaryAnchor: string
  readonly slot: "invariant"
  readonly tier: "T2"
  readonly seal: "proven"
}
type Projection = { readonly current: ReadonlyMap<string, Row>; readonly cas: ReadonlySet<string> }
type Decision<T> = { readonly out: T; readonly next?: Projection; readonly put?: readonly Fact[] }
type Commit<T> = { readonly settled: true; readonly out: T } | { readonly settled: false; readonly refusal: string }
type Disk = {
  readonly put: (fact: Fact) => string
  readonly get: (hash: string) => unknown
  readonly commitProjection: <T>(decide: (projection: Projection) => Decision<T>) => Commit<T>
}
type Entry = { readonly seat: string; readonly row: Row; readonly at: string; readonly base?: string }
type Api = {
  readonly createDiskStore: (casPath: string) => Disk
  readonly rehydrateProjection: (disk: Disk) => Projection
  readonly withKnowledgeLog: (
    disk: Disk,
    options: { readonly repoPath: string; readonly seat: string; readonly now: () => string },
  ) => Disk
  readonly readKnowledge: (repoPath: string) => { readonly rows: ReadonlyMap<string, Entry>; readonly rejected: number }
  readonly replayKnowledge: (
    repoPath: string,
    disk: Disk,
    rules: typeof policy,
    reproven: (row: Row, fact: Fact) => boolean,
  ) => { readonly applied: number; readonly staged: number; readonly missing: number; readonly rejected: number }
  readonly id: (fact: object) => string
  readonly knowledgeShardPath: (repoPath: string, seat: string, key: string) => string
  readonly nodeKey: (candidate: Candidate) => string
  readonly primaryAnchorId: (candidate: Candidate) => string
  readonly familyOf: (fact: Fact) => "advisory" | undefined
  readonly claimNormOf: (fact: Fact, family: "advisory") => string
  readonly resolveWriteIdentity: (fact: Fact, candidate: Candidate) => { primaryAnchor: string; targetKey: string }
}

export const policy = { t0Heuristic: { keywords: [] }, authz: { scopes: { core: ["backend"] } } }

export async function make() {
  const root = mkdtempSync(path.join(tmpdir(), "knowledge-writers-"))
  return build(root).catch((error: unknown) => {
    rmSync(root, { recursive: true, force: true })
    throw error
  })
}

async function build(root: string) {
  const boundary = path.resolve(import.meta.dir, "../../../../modules/atlas/boundary")
  const packages = path.resolve(boundary, "../packages")
  const entry = path.join(root, "entry.ts")
  await Bun.write(entry, [
    `export { createDiskStore, rehydrateProjection } from ${JSON.stringify(path.join(packages, "adapter-io/src/store.ts"))}`,
    `export { withKnowledgeLog, readKnowledge } from ${JSON.stringify(path.join(packages, "adapter-io/src/knowledge-log.ts"))}`,
    `export { replayKnowledge } from ${JSON.stringify(path.join(packages, "adapter-io/src/knowledge-replay.ts"))}`,
    `export { knowledgeShardPath } from ${JSON.stringify(path.join(packages, "adapter-io/src/layout.ts"))}`,
    `export { id } from ${JSON.stringify(path.join(packages, "kernel/src/index.ts"))}`,
    `export { nodeKey, primaryAnchorId } from ${JSON.stringify(path.join(packages, "knowledge/src/write/router.ts"))}`,
    `export { familyOf, claimNormOf, resolveWriteIdentity } from ${JSON.stringify(path.join(packages, "adapter-io/src/governed-emit-identity.ts"))}`,
  ].join("\n"))
  const built = await Bun.build({
    entrypoints: [entry], target: "node", format: "esm",
    plugins: [{
      name: "canonical-knowledge-writer-order",
      setup(builder) {
        builder.onResolve({ filter: /^@atlas\// }, (args) => ({
          path: path.join(packages, args.path.slice("@atlas/".length), "src/index.ts"),
        }))
        builder.onResolve({ filter: /^@noble\/hashes\// }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
      },
    }],
  })
  expect(built.success, `Knowledge writer source bundle: ${built.logs.join("\n")}`).toBe(true)
  expect(built.outputs).toHaveLength(1)
  const output = built.outputs[0]
  if (!output) throw new Error("Knowledge writer bundle unavailable")
  const bundle = path.join(root, "knowledge.mjs")
  await Bun.write(bundle, output)
  const loaded: unknown = await import(pathToFileURL(bundle).href)
  if (typeof loaded !== "object" || loaded === null) throw new Error("Knowledge writer exports unavailable")
  ;["createDiskStore", "rehydrateProjection", "withKnowledgeLog", "readKnowledge", "replayKnowledge", "id", "knowledgeShardPath",
    "nodeKey", "primaryAnchorId", "familyOf", "claimNormOf", "resolveWriteIdentity"]
    .forEach((name) => expect(typeof Reflect.get(loaded, name), name).toBe("function"))
  const api = loaded as Api
  const actor = path.join(root, "writer.mjs")
  await Bun.write(actor, `import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const api = await import(pathToFileURL(process.argv[2]).href);
const input = JSON.parse(process.argv[3]);
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const publish = (file, value) => {
  const temporary = file + "." + process.pid + ".tmp";
  writeFileSync(temporary, JSON.stringify(value));
  renameSync(temporary, file);
};
const raw = api.createDiskStore(input.cas);
const instrumented = {
  ...raw,
  commitProjection(decide) {
    const result = raw.commitProjection(decide);
    if (input.role === "G1" && result.settled) {
      assert(JSON.stringify(api.rehydrateProjection(raw).current.get(input.row.nodeKey)) === JSON.stringify(input.row), "G1 must be actually published before its barrier");
      publish(input.committed, { pid: process.pid, row: input.row });
      const deadline = Date.now() + 20000;
      const pause = new Int32Array(new SharedArrayBuffer(4));
      while (!existsSync(input.release)) {
        assert(Date.now() < deadline, "G1 release barrier timed out");
        Atomics.wait(pause, 0, 0, 10);
      }
      assert(readFileSync(input.release, "utf8") === "G2_LOGGED", "G1 needs the parent's acknowledged G2 log release");
    }
    return result;
  },
};
const writer = api.withKnowledgeLog(instrumented, { repoPath: input.repo, seat: "backend", source: {}, now: () => input.at });
const result = writer.commitProjection((projection) => {
  const observed = projection.current.get(input.row.nodeKey);
  assert(JSON.stringify(observed) === JSON.stringify(input.before), input.role + " must observe the exact preceding generation inside its real decision");
  return {
    out: { row: input.row, before: observed ?? null },
    // Explicit singleton replacement tests log ordering, not the governed advisory claim-union operation.
    next: { ...projection, current: new Map([...projection.current, [input.row.nodeKey, input.row]]), cas: new Set([...projection.cas, input.row.contentHash]) },
    put: [input.fact],
  };
});
assert(result.settled, input.role + " real projection commit was refused");
assert(JSON.stringify(writer.get(input.row.contentHash)) === JSON.stringify(input.fact), "writer must read back its actual CAS bytes");
const shard = api.knowledgeShardPath(input.repo, "backend", input.row.nodeKey);
const entries = readFileSync(shard, "utf8").trim().split("\\n").map((line) => JSON.parse(line).payload);
assert(entries.some((entry) => JSON.stringify(entry.row) === JSON.stringify(input.row) && entry.at === input.at), "writer must finish its actual log append before acknowledging");
publish(input.logged, { pid: process.pid, ...result.out });
process.stdout.write(JSON.stringify({ role: input.role, pid: process.pid, logged: true }) + "\\n");
`)
  return {
    root, api,
    fact(claimNorm: string) {
      // Synthetic citation bytes and controlled replay isolate L5 ordering; this does not qualify index reproof or L4 trust.
      const candidate: Candidate = { claimText: claimNorm, claimNorm, slot: "invariant", tier: "T2",
        provenance: { source: "knowledge-writer-order fixture", trusted: false },
        grounding: { entries: [{ anchor: { kind: "symbol", qualifiedPath: "src/knowledge.ts::publish",
          subtreeHash: api.id({ fixture: "knowledge-writer-order anchor" }) }, path: "src/knowledge.ts" }] } }
      const fact: Fact = { kind: "advisory", id: api.nodeKey(candidate), tier: candidate.tier, claimNorm,
        grounding: candidate.grounding, freshness: "FRESH", claims: [], authoring: "ADVISORY", scope: "core",
        predicateSlot: candidate.slot, seal: "proven" }
      const family = api.familyOf(fact)
      if (family !== "advisory") throw new Error("Knowledge fixture must resolve as an advisory")
      const identity = api.resolveWriteIdentity(fact, candidate)
      expect(identity.targetKey).toBe(fact.id)
      expect(identity.primaryAnchor).toBe(api.primaryAnchorId(candidate))
      const row: Row = { nodeKey: identity.targetKey, family, contentHash: api.id(fact),
        claims: [api.claimNormOf(fact, family)], scope: fact.scope, primaryAnchor: identity.primaryAnchor,
        slot: fact.predicateSlot, tier: fact.tier, seal: fact.seal }
      return { fact, row }
    },
    fresh() {
      const repo = mkdtempSync(path.join(root, "repo-"))
      const control = mkdtempSync(path.join(root, "control-"))
      return { repo, control, cas: path.join(repo, ".atlas", "cas"),
        committed: path.join(control, "G1_COMMITTED"), release: path.join(control, "release") }
    },
    participant(f: { repo: string; control: string; cas: string; committed: string; release: string }, role: "G1" | "G2",
      fact: Fact, row: Row, at: string, before?: Row) {
      const logged = path.join(f.control, `${role}_LOGGED`)
      return { logged, command: ChildProcess.make(process.execPath,
        [actor, bundle, JSON.stringify({ ...f, role, fact, row, at, before, logged })],
        { cwd: f.repo, stdin: "ignore", stdout: "pipe", stderr: "pipe" }) }
    },
    entries(repo: string, key: string) {
      return readFileSync(api.knowledgeShardPath(repo, "backend", key), "utf8").trim().split("\n")
        .map((line) => JSON.parse(line) as { payload: Entry }).map((event) => event.payload)
    },
    dispose: () => rmSync(root, { recursive: true, force: true }),
  }
}

export function waitForFile(file: string) {
  return Effect.gen(function* () {
    const deadline = Date.now() + 15_000
    while (!existsSync(file)) {
      if (Date.now() >= deadline) return yield* Effect.die(new Error(`Knowledge writer barrier timed out: ${path.basename(file)}`))
      yield* Effect.sleep("10 millis")
    }
    return JSON.parse(readFileSync(file, "utf8")) as { pid: number; row: Row; before?: Row | null }
  })
}

export function release(file: string) {
  if (existsSync(file)) {
    expect(readFileSync(file, "utf8")).toBe("G2_LOGGED")
    return
  }
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  writeFileSync(temporary, "G2_LOGGED", { flag: "wx" })
  try {
    renameSync(temporary, file)
  } finally {
    rmSync(temporary, { force: true })
  }
}
