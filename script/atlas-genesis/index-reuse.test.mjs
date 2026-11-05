import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { posix } from "node:path"
import { test } from "node:test"
import { requireIndexedSourceBytes, requireReusableChanges, requireUnchangedDocuments } from "./index-reuse.mjs"

test("reuse accepts identical trees and the closed maintenance scope, not source/dependency changes", () => {
  requireReusableChanges([])
  const allowed = ["modules/atlas/packages/cli/src/mine.ts", "script/atlas-genesis/grok-text.sh",
    ".github/workflows/atlas-genesis.yml", ".orchestra/skills/atlas-maintenance/SKILL.md", "docs/guides/atlas-genesis.md"]
  requireReusableChanges(allowed)
  // Positive controls against every claimed excluded scope: adding one real source path must refuse.
  for (const path of ["packages/schema/src/schema.ts", "modules/relay/lib/main.py", "native/omni/src/lib.rs",
    "package.json", "bun.lock", "tsconfig.json", "modules/atlas-elsewhere/index.ts",
    "docs/guides/atlas-genesis.md\npackages/core/src/index.ts"]) {
    assert.throws(() => requireReusableChanges([...allowed, path]), /indexed or unreviewed paths changed/)
  }
  assert.throws(() => requireReusableChanges(["modules/atlas/../../packages/core/src/index.ts"]), /invalid change list/)
  assert.throws(() => requireReusableChanges(undefined), /invalid change list/)
})

test("the document alias regression rejects an exact-string comparison mutant", () => {
  const source = requireUnchangedDocuments.toString()
  const target = "posix.normalize(doc.relativePath)"
  assert.equal(source.split(target).length, 2)
  const mutant = Function("assert", "posix", "requireReusableChanges",
    `return ${source.replace(target, "doc.relativePath")}`)(assert, posix, requireReusableChanges)
  const acceptance = (check) => assert.throws(() => check(
    ["modules/atlas/packages/cli/src/mine.ts"], [{ relativePath: "./modules/atlas/packages/cli/src/mine.ts" }],
  ), /indexed document changed/)
  acceptance(requireUnchangedDocuments)
  assert.throws(() => acceptance(mutant), assert.AssertionError)
})

test("a maintenance exemption cannot hide a path actually present in the restored index", () => {
  const path = "modules/atlas/packages/cli/src/mine.ts"
  requireUnchangedDocuments([path], [{ relativePath: "packages/schema/src/schema.ts" }])
  assert.throws(() => requireUnchangedDocuments([path], [{ relativePath: path }]), /indexed document changed/)
  for (const alias of [`./${path}`, `modules/atlas/../atlas/packages/cli/src/mine.ts`, `modules//atlas/packages/cli/src/mine.ts`]) {
    assert.throws(() => requireUnchangedDocuments([path], [{ relativePath: alias }]), /indexed document changed/)
  }
  requireUnchangedDocuments([path], [{ relativePath: "./packages/schema/src/schema.ts" }])
  for (const invalid of ["../outside.ts", "/absolute.ts", "C:/outside.ts", "modules\\atlas.ts", ".", "foo\0.ts"]) {
    assert.throws(() => requireUnchangedDocuments([], [{ relativePath: invalid }]), /invalid indexed document identity/)
  }
  assert.throws(() => requireUnchangedDocuments([], []), /missing indexed document list/)
})

test("fresh index source bytes must match tracked HEAD even for untracked or ignored documents", () => {
  const path = "src/source.ts"
  const bytes = Buffer.from("export const source = '界'\n")
  const hash = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
  const tree = `100644 blob ${hash}\t${path}\0`
  const docs = [{ relativePath: path }]
  requireIndexedSourceBytes(docs, tree, () => bytes)
  assert.throws(() => requireIndexedSourceBytes(docs, tree, () => Buffer.from("dirty source")), /bytes differ from revision/)
  assert.throws(() => requireIndexedSourceBytes([{ relativePath: "untracked.ts" }], tree, () => bytes), /not tracked source/)
  assert.throws(() => requireIndexedSourceBytes(docs, tree.replace("100644", "120000"), () => bytes), /not tracked source/)
  assert.throws(() => requireIndexedSourceBytes([], tree, () => bytes), /missing indexed document list/)
  assert.throws(() => requireIndexedSourceBytes(docs, "", () => bytes), /missing Git tree/)
  const source = requireIndexedSourceBytes.toString()
  const needle = "assert.equal(actual, entry.hash,"
  assert.equal(source.split(needle).length, 2)
  const mutant = Function("assert", "createHash", "posix", "requireUnchangedDocuments",
    `return ${source.replace(needle, "assert.equal(actual, actual,")}`)(assert, createHash, posix, requireUnchangedDocuments)
  const oracle = (check) => assert.throws(() => check(docs, tree, () => Buffer.from("dirty source")), /bytes differ from revision/)
  oracle(requireIndexedSourceBytes)
  assert.throws(() => oracle(mutant), assert.AssertionError)
})
