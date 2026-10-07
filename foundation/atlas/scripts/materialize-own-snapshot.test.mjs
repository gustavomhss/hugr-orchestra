import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { replaceOwnTargets } from "./materialize-own-snapshot.mjs"

const SCRIPT = fileURLToPath(new URL("./materialize-own-snapshot.mjs", import.meta.url))
const CONTRACT = `
export function parseOwnSnapshot(text) {
  try {
    const value = JSON.parse(text);
    return value?.schemaVersion === 1 && typeof value.sourceRevision === 'string' && Array.isArray(value.units) && value.units.length > 0 ? value : undefined;
  } catch { return undefined; }
}
export function exportOwnSnapshot(input) {
  if (input.units.some((entry) => entry.pack.freshness !== 'FRESH')) throw new Error('packs must be fresh');
  return { schemaVersion: 1, ...input };
}
export function materializeStaticOwnSnapshot(snapshot) {
  const skills = snapshot.units.map(({ unit }) => ({
    path: \`.opencode/skills/own/\${Buffer.from(unit.id).toString('base64url')}/SKILL.md\`,
    content: \`skill:\${unit.id}:\${snapshot.snapshot}\\n\`,
  }));
  return {
    skills,
    coverage: { path: '.opencode/skills/own/OWN-COVERAGE.json', content: JSON.stringify({ units: snapshot.units.map((entry) => entry.unit.id).sort() }) + '\\n' },
  };
}
`

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "own-writer-"))
  git(root, ["init", "-q"])
  git(root, ["config", "user.email", "test@example.com"])
  git(root, ["config", "user.name", "Test"])
  mkdirSync(join(root, "src"))
  writeFileSync(join(root, "src", "unit.txt"), "reviewed\n")
  writeFileSync(join(root, "contract.mjs"), CONTRACT)
  git(root, ["add", "src/unit.txt"])
  git(root, ["commit", "-qm", "source"])
  const revision = git(root, ["rev-parse", "HEAD"])
  const blob = git(root, ["hash-object", "--", "src/unit.txt"])
  return { root, revision, blob }
}

function snapshot(fx, units = ["unit/one"], name = "reviewed-v1") {
  return {
    schemaVersion: 1,
    snapshot: name,
    sourceRevision: fx.revision,
    units: units.map((id) => ({
      unit: { id },
      sourceBlobs: { "src/unit.txt": fx.blob },
      pack: { freshness: "FRESH" },
    })),
  }
}

function run(root, args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, OWN_SNAPSHOT_MATERIALIZE_IMPL: join(root, "contract.mjs") },
  })
}

function tree(root, relativePath) {
  const base = join(root, relativePath)
  const out = new Map()
  function walk(path, rel) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      const child = join(path, entry.name)
      if (entry.isDirectory()) walk(child, childRel)
      else out.set(childRel, readFileSync(child))
    }
  }
  walk(base, "")
  return [...out].map(([path, bytes]) => [path, bytes.toString("hex")])
}

function writeSnapshot(root, path, value) {
  const destination = join(root, path)
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`)
}

test("clean write materializes reviewed snapshot and full skill tree", (t) => {
  const fx = fixture()
  t.after(() => rmSync(fx.root, { recursive: true, force: true }))
  const value = snapshot(fx)
  writeSnapshot(fx.root, "reviewed.json", value)

  const result = run(fx.root, ["reviewed.json"])

  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(join(fx.root, "OWN-SNAPSHOT.json"), "utf8"), `${JSON.stringify(value, null, 2)}\n`)
  assert.equal(
    readFileSync(join(fx.root, ".opencode/skills/own/dW5pdC9vbmU/SKILL.md"), "utf8"),
    "skill:unit/one:reviewed-v1\n",
  )
  assert.equal(
    readFileSync(join(fx.root, ".opencode/skills/own/OWN-COVERAGE.json"), "utf8"),
    '{"units":["unit/one"]}\n',
  )
})

test("review export rejects stale packs and preserves prior outputs", (t) => {
  const fx = fixture()
  t.after(() => rmSync(fx.root, { recursive: true, force: true }))
  mkdirSync(join(fx.root, ".opencode/skills/own/old"), { recursive: true })
  writeFileSync(join(fx.root, "OWN-SNAPSHOT.json"), "prior snapshot bytes\n")
  writeFileSync(join(fx.root, ".opencode/skills/own/old/SKILL.md"), "prior skill bytes\n")
  const value = snapshot(fx)
  value.units[0].pack.freshness = "STALE"
  writeSnapshot(fx.root, "reviewed.json", value)
  const beforeSnapshot = readFileSync(join(fx.root, "OWN-SNAPSHOT.json"))
  const beforeTree = tree(fx.root, ".opencode/skills/own")

  const result = run(fx.root, ["reviewed.json"])

  assert.equal(result.status, 1)
  assert.match(result.stderr, /reviewed snapshot export rejected: packs must be fresh/)
  assert.deepEqual(readFileSync(join(fx.root, "OWN-SNAPSHOT.json")), beforeSnapshot)
  assert.deepEqual(tree(fx.root, ".opencode/skills/own"), beforeTree)
})

test("second install rename failure restores prior snapshot and skill tree", (t) => {
  const root = mkdtempSync(join(tmpdir(), "own-replace-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const paths = {
    snapshotTarget: join(root, "OWN-SNAPSHOT.json"),
    snapshotTemp: join(root, ".OWN-SNAPSHOT.json.tmp"),
    snapshotBackup: join(root, ".OWN-SNAPSHOT.json.bak"),
    skillsTarget: join(root, "own"),
    skillsTemp: join(root, ".own.tmp"),
    skillsBackup: join(root, ".own.bak"),
  }
  writeFileSync(paths.snapshotTarget, "prior snapshot\n")
  writeFileSync(paths.snapshotTemp, "next snapshot\n")
  mkdirSync(join(paths.skillsTarget, "old"), { recursive: true })
  writeFileSync(join(paths.skillsTarget, "old/SKILL.md"), "prior skill\n")
  mkdirSync(join(paths.skillsTemp, "next"), { recursive: true })
  writeFileSync(join(paths.skillsTemp, "next/SKILL.md"), "next skill\n")
  const beforeSnapshot = readFileSync(paths.snapshotTarget)
  const beforeTree = tree(root, "own")

  assert.throws(
    () =>
      replaceOwnTargets(paths, {
        lstatSync,
        rmSync,
        renameSync(from, to) {
          if (from === paths.skillsTemp && to === paths.skillsTarget) throw new Error("injected second install failure")
          renameSync(from, to)
        },
      }),
    /replacement failed: injected second install failure/,
  )
  assert.deepEqual(readFileSync(paths.snapshotTarget), beforeSnapshot)
  assert.deepEqual(tree(root, "own"), beforeTree)
})

test("source mutation refuses stale input and preserves prior output bytes", (t) => {
  const fx = fixture()
  t.after(() => rmSync(fx.root, { recursive: true, force: true }))
  mkdirSync(join(fx.root, ".opencode/skills/own/old"), { recursive: true })
  writeFileSync(join(fx.root, "OWN-SNAPSHOT.json"), "prior snapshot bytes\n")
  writeFileSync(join(fx.root, ".opencode/skills/own/old/SKILL.md"), "prior skill bytes\n")
  writeSnapshot(fx.root, "reviewed.json", snapshot(fx))
  const beforeSnapshot = readFileSync(join(fx.root, "OWN-SNAPSHOT.json"))
  const beforeTree = tree(fx.root, ".opencode/skills/own")
  writeFileSync(join(fx.root, "src/unit.txt"), "mutated after review\n")

  const result = run(fx.root, ["reviewed.json"])

  assert.equal(result.status, 1)
  assert.match(result.stderr, /current source blob mismatch: unit\/one -> src\/unit\.txt/)
  assert.deepEqual(readFileSync(join(fx.root, "OWN-SNAPSHOT.json")), beforeSnapshot)
  assert.deepEqual(tree(fx.root, ".opencode/skills/own"), beforeTree)
})

test("symlinked source anchor is refused before hashing", (t) => {
  const fx = fixture()
  t.after(() => rmSync(fx.root, { recursive: true, force: true }))
  writeSnapshot(fx.root, "reviewed.json", snapshot(fx))
  writeFileSync(join(fx.root, "src/linked.txt"), "reviewed\n")
  rmSync(join(fx.root, "src/unit.txt"))
  symlinkSync("linked.txt", join(fx.root, "src/unit.txt"))

  const result = run(fx.root, ["reviewed.json"])

  assert.equal(result.status, 1)
  assert.match(result.stderr, /source anchor is not a regular file: unit\/one -> src\/unit\.txt/)
})

test("symbolic source revision is refused even when injected contract accepts it", (t) => {
  const fx = fixture()
  t.after(() => rmSync(fx.root, { recursive: true, force: true }))
  const value = snapshot(fx)
  value.sourceRevision = "HEAD"
  writeSnapshot(fx.root, "reviewed.json", value)

  const result = run(fx.root, ["reviewed.json"])

  assert.equal(result.status, 1)
  assert.match(result.stderr, /sourceRevision is not an immutable lowercase full Git OID: HEAD/)
})

test("replacement removes obsolete skills", (t) => {
  const fx = fixture()
  t.after(() => rmSync(fx.root, { recursive: true, force: true }))
  writeSnapshot(fx.root, "first.json", snapshot(fx, ["unit/one", "obsolete"]))
  assert.equal(run(fx.root, ["first.json"]).status, 0)
  writeSnapshot(fx.root, "second.json", snapshot(fx, ["unit/one"], "reviewed-v2"))

  const result = run(fx.root, ["second.json"])

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(
    tree(fx.root, ".opencode/skills/own")
      .map(([path]) => path)
      .sort(),
    ["OWN-COVERAGE.json", "dW5pdC9vbmU/SKILL.md"],
  )
})

test("backup cleanup failure preserves successful install and returns warning", (t) => {
  const root = mkdtempSync(join(tmpdir(), "own-cleanup-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const paths = {
    snapshotTarget: join(root, "OWN-SNAPSHOT.json"),
    snapshotTemp: join(root, ".OWN-SNAPSHOT.json.tmp"),
    snapshotBackup: join(root, ".OWN-SNAPSHOT.json.bak"),
    skillsTarget: join(root, "own"),
    skillsTemp: join(root, ".own.tmp"),
    skillsBackup: join(root, ".own.bak"),
  }
  writeFileSync(paths.snapshotTarget, "prior snapshot\n")
  writeFileSync(paths.snapshotTemp, "next snapshot\n")
  mkdirSync(paths.skillsTarget)
  writeFileSync(join(paths.skillsTarget, "old.md"), "prior skill\n")
  mkdirSync(paths.skillsTemp)
  writeFileSync(join(paths.skillsTemp, "new.md"), "next skill\n")

  const warnings = replaceOwnTargets(paths, {
    lstatSync,
    renameSync,
    rmSync(path, options) {
      if (path === paths.snapshotBackup) throw new Error("injected cleanup failure")
      rmSync(path, options)
    },
  })

  assert.equal(readFileSync(paths.snapshotTarget, "utf8"), "next snapshot\n")
  assert.deepEqual(
    tree(root, "own").map(([path]) => path),
    ["new.md"],
  )
  assert.deepEqual(warnings, ["snapshot backup cleanup failed: injected cleanup failure"])
})

test("snapshot input inside .atlas is refused without reading it", (t) => {
  const fx = fixture()
  t.after(() => rmSync(fx.root, { recursive: true, force: true }))
  writeSnapshot(fx.root, ".atlas/reviewed.json", snapshot(fx))

  const result = run(fx.root, [".atlas/reviewed.json"])

  assert.equal(result.status, 1)
  assert.match(result.stderr, /refusing snapshot input inside \.atlas/)
})

test("requires exactly one input argument", (t) => {
  const fx = fixture()
  t.after(() => rmSync(fx.root, { recursive: true, force: true }))
  assert.equal(run(fx.root, []).status, 1)
  assert.equal(run(fx.root, ["one.json", "two.json"]).status, 1)
})
