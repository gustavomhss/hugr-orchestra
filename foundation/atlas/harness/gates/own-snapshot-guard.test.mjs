import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const GATE = fileURLToPath(new URL("./own-snapshot-guard.mjs", import.meta.url))
const IMPLEMENTATION = join(ROOT, "packages", "retrieval", "dist", "src", "own-snapshot.js")
const contract = await import(pathToFileURL(IMPLEMENTATION).href)
let root

function runGate() {
  try {
    const out = execFileSync(process.execPath, [GATE], {
      encoding: "utf8",
      env: { ...process.env, OWN_SNAPSHOT_GUARD_ROOT: root, OWN_SNAPSHOT_GUARD_IMPL: IMPLEMENTATION },
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { code: 0, out }
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }
  }
}

function write(path, content) {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}

function snapshot() {
  const blob = execFileSync("git", ["hash-object", join(root, "packages/genesis/src/index.ts")], {
    encoding: "utf8",
  }).trim()
  return {
    schemaVersion: 1,
    snapshot: "genesis-v1",
    sourceRevision: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    units: [
      {
        unit: { level: "module", id: "packages/genesis", grounding: null },
        sourceBlobs: { "packages/genesis/src/index.ts": blob },
        pack: {
          unit: "Genesis owns bootstrap.",
          invariants: [
            {
              nodeId: "genesis:bootstrap",
              tier: "T1",
              claim: "Genesis bootstrap is deterministic.",
              freshness: "FRESH",
            },
          ],
          shape: { contents: ["packages/genesis/src/index.ts"], owner: "atlas-foundation", tier: "T1" },
          edges: { dependents: [], dependencies: [] },
          gotchas: [],
          memory: null,
          drill: {
            finer: [],
            refresh: { pull: "poke:own_packages_genesis" },
            complement: { pull: "relate:packages/genesis" },
          },
          grounding: { source: "tree" },
          tokenEstimate: 12,
          manifest: { pointers: [], truncated: false },
          pullReachable: [],
          advisory: [],
          advisoryDropped: 0,
        },
      },
    ],
  }
}

function materialize(value) {
  write("OWN-SNAPSHOT.json", `${JSON.stringify(value, null, 2)}\n`)
  const output = contract.materializeStaticOwnSnapshot(value)
  for (const file of [...output.skills, output.coverage]) write(file.path, file.content)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "own-snapshot-guard-"))
  write("packages/genesis/src/index.ts", "export const genesis = true;\n")
  execFileSync("git", ["-C", root, "init"], { stdio: "ignore" })
  execFileSync("git", ["-C", root, "add", "."], { stdio: "ignore" })
  execFileSync(
    "git",
    ["-C", root, "-c", "user.name=Own Test", "-c", "user.email=own@test.invalid", "commit", "-m", "seed"],
    { stdio: "ignore" },
  )
  materialize(snapshot())
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe("own-snapshot-guard", () => {
  it("passes clean snapshot projection", () => expect(runGate()).toMatchObject({ code: 0 }))
  it("fails missing snapshot", () => {
    rmSync(join(root, "OWN-SNAPSHOT.json"))
    expect(runGate().out).toMatch(/missing OWN-SNAPSHOT.json/)
  })
  it("fails changed skill prose", () => {
    const file = contract.materializeStaticOwnSnapshot(snapshot()).skills[0].path
    write(file, "changed")
    expect(runGate().out).toMatch(/static Own drift: .*SKILL.md/)
  })
  it("fails changed source blob", () => {
    write("packages/genesis/src/index.ts", "export const genesis = false;\n")
    expect(runGate().out).toMatch(/source blob drift: packages\/genesis -> packages\/genesis\/src\/index.ts/)
  })
  it("fails symlinked source anchor before hashing it", () => {
    write("packages/genesis/src/linked.ts", "export const genesis = true;\n")
    rmSync(join(root, "packages/genesis/src/index.ts"))
    symlinkSync("linked.ts", join(root, "packages/genesis/src/index.ts"))
    expect(runGate().out).toMatch(
      /source anchor is not a regular file: packages\/genesis -> packages\/genesis\/src\/index\.ts/,
    )
  })
  it("fails unit drift", () => {
    const value = snapshot()
    value.units[0].unit.id = "packages/other"
    write("OWN-SNAPSHOT.json", `${JSON.stringify(value)}\n`)
    expect(runGate().out).toMatch(/missing static Own file|unexpected static Own file|static Own drift/)
  })
  it("fails sourceRevision that cannot account for anchored blobs", () => {
    const value = snapshot()
    value.sourceRevision = "0000000000000000000000000000000000000000"
    write("OWN-SNAPSHOT.json", `${JSON.stringify(value)}\n`)
    expect(runGate().out).toMatch(/sourceRevision is not a Git commit reachable from HEAD/)
  })
  it("fails valid sourceRevision that is not an ancestor of HEAD", () => {
    const tree = execFileSync("git", ["-C", root, "rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim()
    const sourceRevision = execFileSync(
      "git",
      [
        "-C",
        root,
        "-c",
        "user.name=Own Test",
        "-c",
        "user.email=own@test.invalid",
        "commit-tree",
        tree,
        "-m",
        "unrelated",
      ],
      { encoding: "utf8" },
    ).trim()
    const value = snapshot()
    value.sourceRevision = sourceRevision
    write("OWN-SNAPSHOT.json", `${JSON.stringify(value)}\n`)
    expect(runGate().out).toMatch(/sourceRevision is not a Git commit reachable from HEAD/)
  })
  it("fails anchored blob drift even when current source matches declared blob", () => {
    const sourceRevision = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
    write("packages/genesis/src/index.ts", "export const genesis = false;\n")
    execFileSync("git", ["-C", root, "add", "packages/genesis/src/index.ts"], { stdio: "ignore" })
    execFileSync(
      "git",
      ["-C", root, "-c", "user.name=Own Test", "-c", "user.email=own@test.invalid", "commit", "-m", "change source"],
      { stdio: "ignore" },
    )
    const value = snapshot()
    value.sourceRevision = sourceRevision
    materialize(value)
    expect(runGate().out).toMatch(/snapshot revision blob drift: packages\/genesis -> packages\/genesis\/src\/index.ts/)
  })
  it("fails unexpected static Own file", () => {
    write(".opencode/skills/own/EXTRA.md", "unexpected\n")
    expect(runGate().out).toMatch(/unexpected static Own file: \.opencode\/skills\/own\/EXTRA.md/)
  })
  it("fails symlinked static Own skill instead of ignoring or following it", () => {
    const skill = contract.materializeStaticOwnSnapshot(snapshot()).skills[0].path
    const target = join(root, skill)
    write("linked-skill.md", readFileSync(target, "utf8"))
    rmSync(target)
    symlinkSync(join(root, "linked-skill.md"), target)
    expect(runGate().out).toMatch(/static Own tree contains symlink or special entry: .*SKILL\.md/)
  })
  it.each([
    ["empty", ""],
    ["malformed", "{"],
  ])("fails %s snapshot", (_label, content) => {
    write("OWN-SNAPSHOT.json", content)
    expect(runGate().out).toMatch(/OWN-SNAPSHOT.json is malformed, empty, or has invalid units\/source blobs/)
  })
  it("fails duplicate static Own path at verifier boundary", () => {
    const value = snapshot()
    const output = contract.materializeStaticOwnSnapshot(value)
    const files = [...output.skills, output.coverage, output.skills[0]]
    const result = contract.verifyStaticOwnSnapshot(value, files, (path) => value.units[0].sourceBlobs[path])
    expect(result).toMatchObject({ status: "HOLD" })
    expect(result.issues).toContain(`duplicate static Own file: ${output.skills[0].path}`)
  })
})
