import assert from "node:assert/strict"
import { linkSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { test } from "node:test"
import { collectNetworkProof, collectReplayOutput, publishReplayOutput } from "./checkpoint-replay-collect.mjs"

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
  const needle = 'writeFileSync(join(destination, receipt.name), receipt.bytes, { flag: "wx", mode: 0o600 })'
  assert.equal(source.split(needle).length, 2)
  writeFileSync(join(f.root, "mutant.mjs"), source.replace(needle, needle.replace('flag: "wx"', 'flag: "w"')))
  const mutant = await import(pathToFileURL(join(f.root, "mutant.mjs")).href)
  assert.throws(() => oracle(mutant.collectNetworkProof, f), assert.AssertionError)
})

test("restricted output is published by its owner and collected into a fresh runner tree byte-for-byte", (t) => {
  const f = fixture(t)
  mkdirSync(join(f.source, "nested"), { mode: 0o700 })
  writeFileSync(join(f.source, "nested/data.json"), '{"original":true}\n', { mode: 0o600 })
  publishReplayOutput(f.source)
  assert.equal(lstatSync(f.source).mode & 0o777, 0o755)
  assert.equal(lstatSync(join(f.source, "nested/data.json")).mode & 0o777, 0o644)
  const output = join(f.root, "collected")
  collectReplayOutput(f.source, output, process.getuid())
  assert.deepEqual(readFileSync(join(output, "nested/data.json")), readFileSync(join(f.source, "nested/data.json")))
  assert.throws(() => collectReplayOutput(f.source, output, process.getuid()), { code: "EEXIST" })
})

test("publisher refuses planted symlinks and shared inodes without changing private-target permissions", (t) => {
  for (const fault of ["symlink", "hardlink"]) {
    const f = fixture(t)
    const target = join(f.root, "private-target")
    writeFileSync(target, "private\n", { mode: 0o600 })
    if (fault === "symlink") symlinkSync(target, join(f.source, "planted"))
    if (fault === "hardlink") linkSync(target, join(f.source, "planted"))
    assert.throws(() => publishReplayOutput(f.source))
    assert.equal(lstatSync(target).mode & 0o777, 0o600)
  }
})

test("descriptor-collection controls reject mutations removing no-follow, owner or link checks", async (t) => {
  const source = readFileSync(new URL("./checkpoint-replay-collect.mjs", import.meta.url), "utf8")
  const mutations = [
    { needle: "constants.O_NOFOLLOW", replacement: "0", fault: "symlink" },
    { needle: "stat.uid === uid", replacement: "true", fault: "owner" },
    { needle: "stat.nlink === 1", replacement: "true", fault: "hardlink" },
  ]
  const oracle = (collect, f, fault) => {
    const target = join(f.root, "private-target")
    writeFileSync(target, "private\n", { mode: 0o600 })
    if (fault === "symlink") symlinkSync(target, join(f.source, "planted"))
    if (fault === "hardlink") linkSync(target, join(f.source, "planted"))
    assert.throws(() => collect(f.source, join(f.root, "collected"),
      fault === "owner" ? process.getuid() + 1 : process.getuid()))
  }
  for (const mutation of mutations) {
    oracle(collectReplayOutput, fixture(t), mutation.fault)
    const f = fixture(t)
    assert.equal(source.split(mutation.needle).length, 2)
    writeFileSync(join(f.root, "mutant.mjs"), source.replace(mutation.needle, mutation.replacement))
    const mutant = await import(pathToFileURL(join(f.root, "mutant.mjs")).href)
    assert.throws(() => oracle(mutant.collectReplayOutput, f, mutation.fault), assert.AssertionError)
  }
})

test("artifact collection refuses symlinks, shared inodes and a foreign source UID", (t) => {
  for (const fault of ["symlink", "hardlink", "owner"]) {
    const f = fixture(t)
    const protectedFile = join(f.root, "private-runner-data")
    writeFileSync(protectedFile, "must stay private\n", { mode: 0o600 })
    if (fault === "symlink") symlinkSync(protectedFile, join(f.source, "planted"))
    if (fault === "hardlink") linkSync(protectedFile, join(f.source, "planted"))
    assert.throws(() => collectReplayOutput(f.source, join(f.root, "collected"),
      fault === "owner" ? process.getuid() + 1 : process.getuid()))
    assert.equal(readFileSync(protectedFile, "utf8"), "must stay private\n")
  }
})
