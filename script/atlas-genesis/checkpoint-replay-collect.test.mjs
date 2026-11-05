import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { test } from "node:test"
import { collectNetworkProof } from "./checkpoint-replay-collect.mjs"

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "atlas-replay-collection-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const source = join(root, "authoritative")
  const destination = join(root, "restricted-output")
  mkdirSync(source, { mode: 0o700 })
  mkdirSync(destination, { mode: 0o700 })
  writeFileSync(join(source, "network-positive.json"), '[{"dst":"default"}]\n', { mode: 0o600 })
  writeFileSync(join(source, "network-isolated.json"), '[]\n', { mode: 0o600 })
  return { root, source, destination }
}

test("network observations are collected byte-for-byte only into fresh runner-owned receipt paths", (t) => {
  const f = fixture(t)
  collectNetworkProof(f.source, f.destination)
  for (const name of ["network-positive.json", "network-isolated.json"]) {
    assert.deepEqual(readFileSync(join(f.destination, name)), readFileSync(join(f.source, name)))
  }
  assert.throws(() => collectNetworkProof(f.source, f.destination), { code: "EEXIST" })
})

test("a destination symlink planted by the restricted workload cannot overwrite its target", (t) => {
  const f = fixture(t)
  const protectedFile = join(f.root, "must-not-overwrite")
  writeFileSync(protectedFile, "original protected bytes\n", { mode: 0o600 })
  symlinkSync(protectedFile, join(f.destination, "network-positive.json"))
  assert.throws(() => collectNetworkProof(f.source, f.destination), { code: "EEXIST" })
  assert.equal(readFileSync(protectedFile, "utf8"), "original protected bytes\n")
})

test("authoritative receipts cannot be replaced by symlinks or false empty positive controls", (t) => {
  const f = fixture(t)
  writeFileSync(join(f.source, "network-positive.json"), '[]\n')
  assert.throws(() => collectNetworkProof(f.source, f.destination), /empty network positive control/)
  rmSync(join(f.source, "network-positive.json"))
  symlinkSync(join(f.source, "network-isolated.json"), join(f.source, "network-positive.json"))
  assert.throws(() => collectNetworkProof(f.source, f.destination), /unsafe network receipt/)
})

test("the planted-symlink oracle rejects the actual collector with exclusive creation removed", async (t) => {
  const oracle = (collect, f) => {
    const path = join(f.root, "protected-writable-target")
    writeFileSync(path, "untouched\n", { mode: 0o600 })
    symlinkSync(path, join(f.destination, "network-positive.json"))
    assert.throws(() => collect(f.source, f.destination), { code: "EEXIST" })
    assert.equal(readFileSync(path, "utf8"), "untouched\n")
  }
  oracle(collectNetworkProof, fixture(t))
  const f = fixture(t)
  const source = readFileSync(new URL("./checkpoint-replay-collect.mjs", import.meta.url), "utf8")
  const needle = 'flag: "wx"'
  assert.equal(source.split(needle).length, 2)
  writeFileSync(join(f.root, "mutant.mjs"), source.replace(needle, 'flag: "w"'))
  const mutant = await import(pathToFileURL(join(f.root, "mutant.mjs")).href)
  assert.throws(() => oracle(mutant.collectNetworkProof, f), assert.AssertionError)
})
