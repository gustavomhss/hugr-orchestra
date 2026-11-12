import assert from "node:assert/strict"
import { test } from "node:test"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, posix } from "node:path"
import { create } from "@bufbuild/protobuf"
import { deserializeSCIP, serializeSCIP, IndexSchema, DocumentSchema } from "@c4312/scip"
import { requireIndexedSourceBytes, requireUnchangedDocuments } from "../../../script/atlas-genesis/index-reuse.mjs"
import { scopeIndexes } from "./genesis-index-scope.mjs"

const bytes = Buffer.from("export const tracked = 1\n")
const hash = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
const tree = `100644 blob ${hash}\tsrc/tracked.ts\0`

function fixture(t, paths = ["src/tracked.ts", "src/generated.d.ts"], root = "") {
  const base = mkdtempSync(join(tmpdir(), "atlas-index-scope-"))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const directory = join(base, "index")
  const rawDirectory = join(base, "raw")
  mkdirSync(directory)
  writeFileSync(join(directory, "roots.json"), JSON.stringify({ "ts.scip": root }))
  const original = Buffer.from(serializeSCIP(create(IndexSchema, {
    documents: paths.map((relativePath) => create(DocumentSchema, { relativePath })),
  })))
  writeFileSync(join(directory, "ts.scip"), original)
  return { directory, rawDirectory, original }
}

test("real protobuf projection preserves raw bytes and names every non-revision document", (t) => {
  const f = fixture(t)
  const result = scopeIndexes(f.directory, f.rawDirectory, tree)
  assert.deepEqual(readFileSync(join(f.rawDirectory, "ts.scip")), f.original)
  const scoped = deserializeSCIP(readFileSync(join(f.directory, "ts.scip")))
  assert.deepEqual(scoped.documents.map((doc) => doc.relativePath), ["src/tracked.ts"])
  const original = deserializeSCIP(f.original)
  assert.deepEqual({ ...scoped, documents: [] }, { ...original, documents: [] })
  assert.equal(result.dumps[0].rawDocuments, 2)
  assert.equal(result.dumps[0].trackedDocuments, 1)
  assert.deepEqual(result.dumps[0].excluded.map((entry) => entry.path), ["src/generated.d.ts"])
  assert.match(result.dumps[0].excluded[0].documentSha256, /^[0-9a-f]{64}$/)
  requireIndexedSourceBytes(scoped.documents, tree, () => bytes)
  // A dirty TRACKED document is never filtered away to manufacture a passing byte check.
  assert.throws(() => requireIndexedSourceBytes(scoped.documents, tree, () => Buffer.from("dirty")), /bytes differ/)
  assert.throws(() => scopeIndexes(f.directory, f.rawDirectory, tree), /EEXIST/)
  assert.deepEqual(readFileSync(join(f.rawDirectory, "ts.scip")), f.original)
})

for (const fault of ["empty-tree", "empty-dumps", "empty-docs", "no-tracked-docs", "bad-root", "non-source"]) {
  test(`tracked-source projection refuses ${fault} without replacing raw evidence`, (t) => {
    const f = fixture(t, fault === "empty-docs" ? [] : fault === "no-tracked-docs" ? ["src/generated.d.ts"] : undefined,
      fault === "bad-root" ? "../outside" : "")
    if (fault === "empty-dumps") rmSync(join(f.directory, "ts.scip"))
    assert.throws(() => scopeIndexes(f.directory, f.rawDirectory,
      fault === "empty-tree" ? "" : fault === "non-source" ? tree.replace("100644 blob", "160000 commit") : tree),
    /index-scope:|missing indexed document list/)
    if (fault !== "empty-dumps") assert.deepEqual(readFileSync(join(f.directory, "ts.scip")), f.original)
  })
}

test("the production scope filter cannot silently keep generated documents", (t) => {
  const source = scopeIndexes.toString()
  const needle = "if (tracked.get(path) === true) return true"
  assert.equal(source.split(needle).length, 2)
  const mutant = Function("assert", "mkdirSync", "readFileSync", "readdirSync", "writeFileSync", "join", "posix", "deserializeSCIP", "serializeSCIP", "requireUnchangedDocuments", "digest",
    `return ${source.replace(needle, "if (true) return true")}`)(assert, mkdirSync, readFileSync, readdirSync, writeFileSync, join, posix, deserializeSCIP, serializeSCIP, requireUnchangedDocuments,
    (bytes) => createHash("sha256").update(bytes).digest("hex"))
  const oracle = (check) => {
    const f = fixture(t)
    check(f.directory, f.rawDirectory, tree)
    assert.deepEqual(deserializeSCIP(readFileSync(join(f.directory, "ts.scip"))).documents.map((doc) => doc.relativePath), ["src/tracked.ts"])
  }
  oracle(scopeIndexes)
  assert.throws(() => oracle(mutant), assert.AssertionError)
})
