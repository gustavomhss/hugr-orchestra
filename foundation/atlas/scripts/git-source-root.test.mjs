import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { atlasRevisionSource } from "./git-source-root.mjs"

const GATE = fileURLToPath(new URL("../harness/gates/ears-coamend-guard.mjs", import.meta.url))

function git(root, args) {
  return execFileSync("git", ["-C", root, "-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "atlas-source-root-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  git(root, ["init", "-q"])
  return { root, source: (revision, options, cwd = root) => atlasRevisionSource(revision, (args) => git(cwd, args), options) }
}

function commit(root, message) {
  const files = git(root, ["ls-files", "-co", "--exclude-standard", "-z"]).split("\0").filter(Boolean)
  if (files.length) git(root, ["add", "--", ...files])
  git(root, ["commit", "--allow-empty", "-q", "-m", message])
  return git(root, ["rev-parse", "HEAD"]).trim()
}

test("resolves historical old and new roots after exact relocation, independent of caller cwd", (t) => {
  const fx = fixture(t)
  mkdirSync(join(fx.root, "foundation/atlas"), { recursive: true })
  writeFileSync(join(fx.root, "foundation/atlas/package.json"), '{"name":"atlas"}\n')
  writeFileSync(join(fx.root, "foundation/atlas/source.txt"), "same bytes\n")
  const old = commit(fx.root, "old root")
  mkdirSync(join(fx.root, "modules"))
  git(fx.root, ["mv", "foundation/atlas", "modules/atlas"])
  const current = commit(fx.root, "relocate root")

  assert.deepEqual(fx.source(old, undefined, join(fx.root, "modules/atlas")), { revision: old, prefix: "foundation/atlas", tree: git(fx.root, ["rev-parse", `${old}:foundation/atlas`]).trim() })
  assert.deepEqual(fx.source(current, undefined, join(fx.root, "modules/atlas")), { revision: current, prefix: "modules/atlas", tree: git(fx.root, ["rev-parse", `${current}:modules/atlas`]).trim() })
})

test("resolves standalone Atlas and reports ambiguous, missing, invalid, and non-tree sources", (t) => {
  const standalone = fixture(t)
  writeFileSync(join(standalone.root, "package.json"), '{"name":"atlas"}\n')
  const standaloneRevision = commit(standalone.root, "standalone")
  assert.equal(standalone.source(standaloneRevision).prefix, "")

  const ambiguous = fixture(t)
  for (const prefix of ["foundation/atlas", "modules/atlas"]) {
    mkdirSync(join(ambiguous.root, prefix), { recursive: true })
    writeFileSync(join(ambiguous.root, prefix, "package.json"), '{"name":"atlas"}\n')
  }
  const ambiguousRevision = commit(ambiguous.root, "ambiguous")
  assert.throws(() => ambiguous.source(ambiguousRevision), (error) => error.code === "ATLAS_SOURCE_PREFIX_AMBIGUOUS")

  const missing = fixture(t)
  writeFileSync(join(missing.root, "unrelated.txt"), "unrelated\n")
  const missingRevision = commit(missing.root, "missing")
  mkdirSync(join(missing.root, "modules/atlas"), { recursive: true })
  assert.throws(() => missing.source(missingRevision, undefined, join(missing.root, "modules/atlas")), (error) => error.code === "ATLAS_SOURCE_PREFIX_MISSING")
  assert.throws(() => missing.source("not-a-commit"), (error) => error.code === "ATLAS_SOURCE_GIT_FAILED")

  const notTree = fixture(t)
  mkdirSync(join(notTree.root, "modules"))
  writeFileSync(join(notTree.root, "modules/atlas"), "blob\n")
  const notTreeRevision = commit(notTree.root, "non-tree")
  assert.throws(() => notTree.source(notTreeRevision), (error) => error.code === "ATLAS_SOURCE_PREFIX_NOT_TREE")
})

test("allowEmpty accepts only an actually empty projected baseline", (t) => {
  const empty = fixture(t)
  const emptyRevision = commit(empty.root, "empty")
  assert.deepEqual(empty.source(emptyRevision, { allowEmpty: true }), { revision: emptyRevision, prefix: "", tree: git(empty.root, ["rev-parse", `${emptyRevision}^{tree}`]).trim() })
  assert.throws(() => empty.source(emptyRevision), (error) => error.code === "ATLAS_SOURCE_PREFIX_MISSING")

  const populated = fixture(t)
  writeFileSync(join(populated.root, "unrelated.txt"), "not empty\n")
  const populatedRevision = commit(populated.root, "populated")
  mkdirSync(join(populated.root, "modules/atlas"), { recursive: true })
  assert.throws(() => populated.source(populatedRevision, { allowEmpty: true }, join(populated.root, "modules/atlas")), (error) => error.code === "ATLAS_SOURCE_PREFIX_MISSING")
})

test("EARS gate passes an unchanged corpus across relocation and catches an unpaired clause edit", (t) => {
  const fx = fixture(t)
  const block = (clause) =>
    `### REQ-A-1 — t\nsource: INV-X @ reference/x.md#x\nThe tool shall return a single band.\nnormative-clause: "${clause}"\n`
  const oldPath = "foundation/atlas/docs/requirements/req-atlas.md"
  mkdirSync(join(fx.root, "foundation/atlas/docs/requirements"), { recursive: true })
  writeFileSync(join(fx.root, oldPath), `## Requirements\n\n${block("return a single band")}\n`)
  const base = commit(fx.root, "seed Atlas requirements")
  mkdirSync(join(fx.root, "modules"))
  git(fx.root, ["mv", "foundation/atlas", "modules/atlas"])
  commit(fx.root, "relocate Atlas unchanged")

  const run = () => spawnSync(process.execPath, [GATE], {
    cwd: fx.root,
    encoding: "utf8",
    env: { ...process.env, EARS_COAMEND_ROOT: join(fx.root, "modules/atlas"), EARS_COAMEND_BASE: base, CI: "true" },
  })
  const unchanged = run()
  assert.equal(unchanged.status, 0, unchanged.stderr)

  writeFileSync(join(fx.root, "modules/atlas/docs/requirements/req-atlas.md"), `## Requirements\n\n${block("return two bands")}\n`)
  const changed = run()
  assert.notEqual(changed.status, 0)
  assert.match(`${changed.stdout}${changed.stderr}`, /REQ-A-1/)
})
