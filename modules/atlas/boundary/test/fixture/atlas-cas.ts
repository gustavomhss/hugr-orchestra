export * as AtlasCas from "./atlas-cas"

import path from "node:path"
import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { expect } from "bun:test"

// Narrow vocabulary at the dynamically bundled test boundary, not another storage implementation.
export type Fact = Readonly<Record<string, unknown>>
export type Row = {
  readonly nodeKey: string
  readonly family: "advisory"
  readonly contentHash: string
  readonly claims: readonly string[]
  readonly scope?: string
}
export type Projection = { readonly current: ReadonlyMap<string, Row>; readonly cas: ReadonlySet<string> }
type Decision<T> = { readonly out: T; readonly next?: Projection; readonly put?: readonly Fact[] }
type Commit<T> = { readonly settled: true; readonly out: T } | { readonly settled: false; readonly refusal: string }
export type Disk = {
  readonly put: (fact: Fact) => string
  readonly get: (hash: string) => unknown
  readonly commitProjection: <T>(decide: (projection: Projection) => Decision<T>) => Commit<T>
  readonly commitStaging: <T>(decide: (projection: Projection) => Decision<T>) => Commit<T>
  readonly loadProjection: () => Projection | undefined
}
type Policy = {
  readonly t0Heuristic: { readonly keywords: readonly string[] }
  readonly authz: { readonly scopes: Readonly<Record<string, readonly string[]>> }
}
type Replay = { readonly applied: number; readonly staged: number; readonly missing: number; readonly rejected: number }
type Api = {
  readonly createDiskStore: (casPath: string) => Disk
  readonly rehydrateProjection: (disk: Disk) => Projection
  readonly withKnowledgeLog: (
    disk: Disk,
    options: { readonly repoPath: string; readonly seat: string; readonly source: Readonly<Record<string, string>> },
  ) => Disk
  readonly readKnowledge: (repoPath: string) => {
    readonly rows: ReadonlyMap<string, { readonly row: Row }>
    readonly rejected: number
  }
  readonly replayKnowledge: (
    repoPath: string,
    disk: Disk,
    policy: Policy,
    reproven: (row: Row, fact: Fact) => boolean,
  ) => Replay
  readonly id: (fact: Fact) => string
  readonly emptyStore: () => Projection
  readonly blobPath: (repoPath: string, hash: string) => string
}

const boundary = path.resolve(import.meta.dir, "../..")
const repository = path.resolve(boundary, "../../..")
const packages = path.join(repository, "modules/atlas/packages")
const exports = [
  "createDiskStore",
  "rehydrateProjection",
  "withKnowledgeLog",
  "readKnowledge",
  "replayKnowledge",
  "id",
  "emptyStore",
  "blobPath",
] as const

export async function make() {
  const root = mkdtempSync(path.join(tmpdir(), "atlas-cas-acceptance-"))
  const api = await bundle(root).catch((error: unknown) => {
    rmSync(root, { recursive: true, force: true })
    throw error
  })
  return {
    root,
    api,
    fresh: () => {
      const repo = mkdtempSync(path.join(root, "case-"))
      const cas = path.join(repo, "clone", "cas")
      return { repo, cas, disk: api.createDiskStore(cas) }
    },
    dispose: () => rmSync(root, { recursive: true, force: true }),
  }
}

async function bundle(root: string): Promise<Api> {
  const entry = path.join(root, "entry.ts")
  await Bun.write(
    entry,
    [
      `export { createDiskStore, rehydrateProjection } from ${JSON.stringify(path.join(packages, "adapter-io/src/store.ts"))}`,
      `export { withKnowledgeLog, readKnowledge } from ${JSON.stringify(path.join(packages, "adapter-io/src/knowledge-log.ts"))}`,
      `export { replayKnowledge } from ${JSON.stringify(path.join(packages, "adapter-io/src/knowledge-replay.ts"))}`,
      `export { blobPath } from ${JSON.stringify(path.join(packages, "adapter-io/src/layout.ts"))}`,
      `export { id } from ${JSON.stringify(path.join(packages, "kernel/src/index.ts"))}`,
      `export { emptyStore } from ${JSON.stringify(path.join(packages, "knowledge/src/index.ts"))}`,
    ].join("\n"),
  )
  const built = await Bun.build({
    entrypoints: [entry],
    target: "node",
    format: "esm",
    external: ["web-tree-sitter"],
    plugins: [
      {
        name: "canonical-atlas-cas-acceptance",
        setup(builder) {
          // These are the canonical source and pinned dependency resolutions used by script/build.ts.
          builder.onResolve({ filter: /^@atlas\// }, (args) => ({
            path: path.join(packages, args.path.slice("@atlas/".length), "src/index.ts"),
          }))
          builder.onResolve({ filter: /^@noble\/hashes\// }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
          builder.onResolve({ filter: /^@bufbuild\/protobuf(\/.*)?$/ }, (args) => ({
            path: Bun.resolveSync(args.path, boundary),
          }))
          builder.onResolve({ filter: /^@c4312\/scip$/ }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
        },
      },
    ],
  })
  expect(built.success, `CAS fixture build failed: ${built.logs.join("\n")}`).toBe(true)
  expect(built.outputs).toHaveLength(1)
  const output = built.outputs[0]
  if (!output) throw new Error("CAS fixture produced no bundle")
  const file = path.join(root, "atlas-cas.mjs")
  await Bun.write(file, output)
  const loaded: unknown = await import(pathToFileURL(file).href)
  if (typeof loaded !== "object" || loaded === null) throw new Error("CAS fixture exports are unavailable")
  exports.forEach((name) => expect(typeof Reflect.get(loaded, name), `CAS fixture export ${name}`).toBe("function"))
  return loaded as Api
}

export const valuePath = (cas: string, hash: string) => path.join(cas, hash.slice(0, 2), hash)
export const policy: Policy = { t0Heuristic: { keywords: [] }, authz: { scopes: { core: ["backend"] } } }

export function inventory(root: string) {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map((entry) => entry.replaceAll("\\", "/"))
    .sort()
}

export function seed(api: Api, repo: string, key: string, fact: Fact, scope = "core") {
  const writer = api.withKnowledgeLog(api.createDiskStore(path.join(repo, "writer", "cas")), {
    repoPath: repo,
    seat: "backend",
    source: {},
  })
  const row: Row = { nodeKey: key, family: "advisory", contentHash: api.id(fact), claims: [], scope }
  const committed = writer.commitProjection((projection) => ({
    out: row,
    next: {
      ...projection,
      current: new Map([...projection.current, [key, row]]),
      cas: new Set([...projection.cas, row.contentHash]),
    },
    put: [fact],
  }))
  expect(committed.settled, "CAS fixture knowledge seed must really commit").toBe(true)
  expect(writer.get(row.contentHash)).toEqual(fact)
  expect(api.readKnowledge(repo).rows.get(key)?.row).toEqual(row)
  return row
}

export function staged(disk: Disk) {
  const read = disk.commitStaging((projection) => ({ out: projection }))
  expect(read.settled, "CAS fixture staging read must succeed").toBe(true)
  if (!read.settled) throw new Error("CAS fixture staging read was refused")
  return read.out
}
