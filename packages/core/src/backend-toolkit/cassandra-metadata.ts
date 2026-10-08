export * as BackendToolkitCassandra from "./cassandra-metadata"

import path from "path"
import { createHash } from "crypto"
import { readFile, writeFile } from "fs/promises"
import { Effect } from "effect"
import { PinnedArtifact } from "../pinned-artifact"

// Apache-2.0, scylladb/gocql v1.15.3, revision e35803084ebafd200e3f7fd74a5be5dfdb409b2d.
// Public module sum: h1:0vJT5pm7g5v8/pCs3tuXuRAfSRWvc1kib8J846Z+Z4g=.
// The whole verified module (including LICENSE and notices) stays private to this engine's staging directory.
export const artifact = {
  url: "https://proxy.golang.org/github.com/scylladb/gocql/@v/v1.15.3.zip",
  integrity: "sha256-h+5UlJ6dhZVFcKZjNXwjEdXUoFZ4gCx9GGdF9A3Ev7E=",
  format: "zip",
  entries: [{ from: "github.com/scylladb/gocql@v1.15.3", to: "driver" }],
} as const satisfies PinnedArtifact.Artifact

export const BEFORE = "f378e73b05f84f325cccea3e20291a7802406dede1c1ced1bd9477602b67db1a"
export const AFTER = "a9c4427039563b57c9b2597ceeb6aa603b50fb34c918823336aaca1b24d5d111"
const MODULE = "88e0b9f90ed4a25ae3b4caf8ef44fd6b4d773b1ac6c18ea3b8d4adab3ada0954"
const REPLACED_MODULE = "813bf43cbf7732310489d0cc6dbe046e144af305952c1d2ab3eeeaa4734aac40"
const SUM = "05120abdde922346d67397c8bf7b5aafa0a1e5291fa051d4567c2a0d7d4d6621"

// Exact catalog-guard prototype. Hashes, not Go spelling heuristics, authorize this single insertion.
const GUARD = '\n\t// Cassandra has the standard schema catalog but not Scylla\'s optional extension table.\n' +
  '\titer = session.control.querySystem(`SELECT table_name FROM system_schema.tables WHERE keyspace_name = ? AND table_name = ?`, "system_schema", "scylla_tables")\n' +
  '\tvar extensionTableName string\n' +
  '\thasScyllaTables := iter.Scan(&extensionTableName)\n' +
  '\tif err := iter.Close(); err != nil {\n' +
  '\t\treturn nil, fmt.Errorf("error querying scylla table schema availability: %v", err)\n' +
  '\t}\n' +
  '\tif !hasScyllaTables {\n' +
  '\t\treturn tables, nil\n' +
  '\t}\n'

export function patch(source: Uint8Array) {
  requireHash(source, BEFORE, "driver-source")
  const anchor = '\n\tstmt = `SELECT * FROM system_schema.scylla_tables WHERE keyspace_name = ? AND table_name = ?`'
  const patched = Buffer.from(Buffer.from(source).toString("utf8").replace(anchor, `${GUARD}${anchor}`))
  requireHash(patched, AFTER, "patched-driver-source")
  return patched
}

/** Runs only inside the pinned artifact installer, before the readonly Go build. Never touches a module cache. */
export const prepare = Effect.fn("BackendToolkitCassandra.prepare")(function* (staging: string) {
  const driver = yield* read(path.join(staging, "driver", "metadata_scylla.go"), "driver-source")
  const module = yield* read(path.join(staging, "src", "go.mod"), "generator-module")
  const sum = yield* read(path.join(staging, "src", "go.sum"), "generator-sum")
  const prepared = yield* Effect.try({
    try: () => {
      requireHash(module, MODULE, "generator-module")
      requireHash(sum, SUM, "generator-sum")
      const replaced = Buffer.from(module.toString("utf8").replace(
        "replace github.com/gocql/gocql => github.com/scylladb/gocql v1.15.3",
        "replace github.com/gocql/gocql => ../driver",
      ))
      requireHash(replaced, REPLACED_MODULE, "replaced-generator-module")
      return { driver: patch(driver), module: replaced }
    },
    catch: (error) => error instanceof PinnedArtifact.Failed ? error : hold("source-invalid"),
  })
  yield* Effect.tryPromise({
    try: async () => {
      await writeFile(path.join(staging, "driver", "metadata_scylla.go"), prepared.driver)
      await writeFile(path.join(staging, "src", "go.mod"), prepared.module)
      await writeFile(path.join(staging, "driver", "ORCHESTRA-MODIFICATIONS.txt"),
        "Orchestra cassandra1: metadata_scylla.go changed to check the standard catalog before reading optional Scylla metadata.\n" +
        `Upstream scylladb/gocql v1.15.3 (Apache-2.0); source SHA-256 ${BEFORE}; modified SHA-256 ${AFTER}.\n`)
    },
    catch: () => hold("write"),
  })
})

function requireHash(bytes: Uint8Array, expected: string, name: string) {
  if (createHash("sha256").update(bytes).digest("hex") !== expected) throw hold(`${name}-hash-mismatch`)
}

const read = (file: string, name: string) => Effect.tryPromise({ try: () => readFile(file), catch: () => hold(`${name}-unreadable`) })
const hold = (reason: string) => new PinnedArtifact.Failed({ cause: `compatibility:cassandra-metadata:${reason}` })
