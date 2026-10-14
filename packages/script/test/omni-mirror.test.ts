import { expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const repository = resolve(import.meta.dir, "../../..")
const script = resolve(repository, "script/omni-mirror.sh")
const baseline = "d051d34691a88a752560518737deee1b598d5c96"
const split = "415038bd22e37059fcd7fa20c2c96507b2e92c18"
const legacy = "e96ca6257abe867d43aa9ce80ffbb3e2a90b6add"

function git(directory: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", "-C", directory, ...args], { stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return result.stdout.toString().trim()
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "omni-mirror-"))
  const source = join(directory, "source")
  const mirror = join(directory, "mirror.git")
  const cloned = Bun.spawnSync(["git", "clone", "--shared", "--no-checkout", repository, source], { stdout: "pipe", stderr: "pipe" })
  if (cloned.exitCode !== 0) throw new Error(cloned.stderr.toString())
  git(source, "checkout", "--detach", baseline)
  git(directory, "init", "--bare", mirror)
  git(source, "update-ref", "refs/omni-test/split", split)
  git(source, "--git-dir", mirror, "fetch", source, "refs/omni-test/split:refs/heads/main")
  return { directory, source, mirror }
}

function run(source: string, mirror: string, target: string, file = script, ...args: string[]) {
  return Bun.spawnSync(["bash", file, target, mirror, ...args], { cwd: source, stdout: "pipe", stderr: "pipe" })
}

function replay(source: string, mirror: string, target: string) {
  const result = run(source, mirror, target, script, "--push")
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return git(source, "--git-dir", mirror, "rev-parse", "refs/heads/main")
}

test("pre-move replay keeps the legacy deterministic mirror SHA", async () => {
  const fixtureState = await fixture()
  try {
    const oldMirror = join(fixtureState.directory, "legacy.git")
    git(fixtureState.source, "init", "--bare", oldMirror)
    git(fixtureState.source, "--git-dir", oldMirror, "fetch", fixtureState.source, "refs/omni-test/split:refs/heads/main")
    const oracle = join(fixtureState.directory, "legacy.sh")
    const source = Bun.spawnSync(["git", "-C", repository, "show", `${legacy}:script/omni-mirror.sh`], { stdout: "pipe", stderr: "pipe" })
    if (source.exitCode !== 0) throw new Error(source.stderr.toString())
    await Bun.write(oracle, source.stdout)
    await Bun.write(join(fixtureState.source, "packages/omni/fixture-old.txt"), "old-layout delta\n")
    git(fixtureState.source, "add", "--", "packages/omni/fixture-old.txt")
    git(fixtureState.source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "old-prefix change")
    const target = git(fixtureState.source, "rev-parse", "HEAD")
    const current = replay(fixtureState.source, fixtureState.mirror, target)
    const legacyResult = run(fixtureState.source, oldMirror, target, oracle, "--push")
    expect(legacyResult.exitCode).toBe(0)
    expect(current).toBe(git(fixtureState.source, "--git-dir", oldMirror, "rev-parse", "refs/heads/main"))
    expect(current).not.toBe(split)
  } finally {
    await rm(fixtureState.directory, { recursive: true, force: true })
  }
})

test("relocation is tree-neutral, new-prefix replay resumes, reruns, and tags both layouts", async () => {
  const fixtureState = await fixture()
  try {
    const oldMirrorCommit = replay(fixtureState.source, fixtureState.mirror, baseline)
    await mkdir(join(fixtureState.source, "native"))
    git(fixtureState.source, "mv", "packages/omni", "native/omni")
    git(fixtureState.source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "move Omni")
    const moved = git(fixtureState.source, "rev-parse", "HEAD")
    expect(replay(fixtureState.source, fixtureState.mirror, moved)).toBe(oldMirrorCommit)
    await Bun.write(join(fixtureState.source, "native/omni/fixture.txt"), "new prefix\n")
    git(fixtureState.source, "add", "--", "native/omni/fixture.txt")
    git(fixtureState.source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "change Omni")
    const changed = git(fixtureState.source, "rev-parse", "HEAD")
    const newMirrorCommit = replay(fixtureState.source, fixtureState.mirror, changed)
    expect(newMirrorCommit).not.toBe(oldMirrorCommit)
    expect(git(fixtureState.source, "--git-dir", fixtureState.mirror, "rev-parse", `${newMirrorCommit}^{tree}`))
      .toBe(git(fixtureState.source, "rev-parse", `${changed}:native/omni`))
    expect(replay(fixtureState.source, fixtureState.mirror, moved)).toBe(newMirrorCommit)
    expect(replay(fixtureState.source, fixtureState.mirror, changed)).toBe(newMirrorCommit)
    for (const [name, target, expected] of [["old", baseline, oldMirrorCommit], ["new", changed, newMirrorCommit]]) {
      const result = run(fixtureState.source, fixtureState.mirror, target, script, "--tag", `fixture-${name}`)
      expect(result.exitCode).toBe(0)
      expect(git(fixtureState.source, "--git-dir", fixtureState.mirror, "rev-parse", `refs/tags/fixture-${name}`)).toBe(expected)
    }
  } finally {
    await rm(fixtureState.directory, { recursive: true, force: true })
  }
})

test("malformed and ambiguous source placements fail instead of being skipped", async () => {
  const fixtureState = await fixture()
  try {
    replay(fixtureState.source, fixtureState.mirror, baseline)
    git(fixtureState.source, "rm", "-r", "--", "packages/omni")
    await Bun.write(join(fixtureState.source, "packages/omni"), "not a tree\n")
    git(fixtureState.source, "add", "--", "packages/omni")
    git(fixtureState.source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "corrupt Omni")
    const corrupt = run(fixtureState.source, fixtureState.mirror, git(fixtureState.source, "rev-parse", "HEAD"), script, "--push")
    expect(corrupt.exitCode).not.toBe(0)

    git(fixtureState.source, "checkout", "--detach", baseline)
    await mkdir(join(fixtureState.source, "native"), { recursive: true })
    await cp(join(fixtureState.source, "packages/omni"), join(fixtureState.source, "native/omni"), { recursive: true })
    git(fixtureState.source, "add", "--", "native/omni")
    git(fixtureState.source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "duplicate Omni")
    const ambiguous = run(fixtureState.source, fixtureState.mirror, git(fixtureState.source, "rev-parse", "HEAD"), script, "--push")
    expect(ambiguous.exitCode).not.toBe(0)

    const main = git(fixtureState.source, "--git-dir", fixtureState.mirror, "rev-parse", "refs/heads/main")
    const foreignTree = git(fixtureState.source, "--git-dir", fixtureState.mirror, "rev-parse", `${split}:crates`)
    const foreign = Bun.spawnSync(["git", "-C", fixtureState.source, "--git-dir", fixtureState.mirror,
      "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit-tree", foreignTree, "-p", main], {
      input: `Orchestra-Commit: ${baseline}\n`, stdout: "pipe", stderr: "pipe",
    })
    if (foreign.exitCode !== 0) throw new Error(foreign.stderr.toString())
    git(fixtureState.source, "--git-dir", fixtureState.mirror, "update-ref", "refs/heads/main", foreign.stdout.toString().trim())
    expect(run(fixtureState.source, fixtureState.mirror, baseline, script, "--push").exitCode).not.toBe(0)
  } finally {
    await rm(fixtureState.directory, { recursive: true, force: true })
  }
})
