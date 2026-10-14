import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const atlas = dirname(dirname(fileURLToPath(import.meta.url)))
const implementation = join(atlas, "packages/retrieval/dist/src/own-snapshot.js")
const materializer = join(atlas, "scripts/materialize-own-snapshot.mjs")
const guard = join(atlas, "harness/gates/own-snapshot-guard.mjs")

test("actual Own projection retains old revision/blobs across relocation and refuses changed current source", (t) => {
  const repository = mkdtempSync(join(tmpdir(), "atlas-own-history-"))
  t.after(() => rmSync(repository, { recursive: true, force: true }))
  const oldRoot = join(repository, "foundation/atlas")
  const newRoot = join(repository, "modules/atlas")
  const git = (args) => execFileSync("git", ["--no-replace-objects", "-C", repository, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], { encoding: "utf8" }).trim()
  const snapshot = JSON.parse(readFileSync(join(atlas, "OWN-SNAPSHOT.json"), "utf8"))
  mkdirSync(oldRoot, { recursive: true })
  writeFileSync(join(oldRoot, "package.json"), '{"name":"atlas"}\n')
  for (const unit of snapshot.units) {
    for (const path of Object.keys(unit.sourceBlobs)) {
      mkdirSync(dirname(join(oldRoot, path)), { recursive: true })
      writeFileSync(join(oldRoot, path), readFileSync(join(atlas, path)))
    }
  }
  git(["init", "-q"])
  git(["add", "--", "foundation/atlas"])
  git(["commit", "-qm", "reviewed source"])
  snapshot.sourceRevision = git(["rev-parse", "HEAD"])
  for (const unit of snapshot.units) {
    for (const path of Object.keys(unit.sourceBlobs)) unit.sourceBlobs[path] = git(["hash-object", join(oldRoot, path)])
  }
  const input = join(repository, "reviewed.json")
  const bytes = JSON.stringify(snapshot, null, 2) + "\n"
  writeFileSync(input, bytes)
  const run = (root, script, args = []) => spawnSync(process.execPath, [script, ...args], {
    cwd: root, encoding: "utf8", env: { ...process.env, OWN_SNAPSHOT_GUARD_ROOT: root,
      OWN_SNAPSHOT_GUARD_IMPL: implementation, OWN_SNAPSHOT_MATERIALIZE_IMPL: implementation },
  })
  const first = run(oldRoot, materializer, [input])
  assert.equal(first.status, 0, first.stderr)
  const initial = run(oldRoot, guard)
  assert.equal(initial.status, 0, initial.stderr)
  const tree = (root) => readdirSync(join(root, ".orchestra/skills/own"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile()).map((entry) => [relative(join(root, ".orchestra/skills/own"), join(entry.parentPath, entry.name)), readFileSync(join(entry.parentPath, entry.name)).toString("hex")]).sort()
  const projected = tree(oldRoot)
  mkdirSync(join(repository, "modules"))
  git(["mv", "foundation/atlas", "modules/atlas"])
  git(["add", "--", "modules/atlas"])
  git(["commit", "-qm", "relocate source"])
  const moved = run(newRoot, guard)
  assert.equal(moved.status, 0, moved.stderr)
  git(["replace", snapshot.sourceRevision, "HEAD"])
  const original = run(newRoot, guard)
  assert.equal(original.status, 0, original.stderr)
  const replaced = run(newRoot, materializer, [input])
  assert.equal(replaced.status, 0, replaced.stderr)
  assert.equal(readFileSync(join(newRoot, "OWN-SNAPSHOT.json"), "utf8"), bytes)
  assert.deepEqual(tree(newRoot), projected)
  const anchor = Object.keys(snapshot.units[0].sourceBlobs)[0]
  writeFileSync(join(newRoot, anchor), "changed current source\n")
  const stale = run(newRoot, guard)
  assert.notEqual(stale.status, 0)
  assert.match(stale.stderr, /source blob drift/)
  const refused = run(newRoot, materializer, [input])
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /current source blob mismatch/)
  assert.deepEqual(tree(newRoot), projected)
})
