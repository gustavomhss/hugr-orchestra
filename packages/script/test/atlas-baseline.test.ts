import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { WorkspacePaths } from "../src/workspace-paths"

test("host Atlas projection preserves old/new trees and refuses invalid or ambiguous baseline", async () => {
  const workspace = WorkspacePaths.make(import.meta.dir)
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-baseline-"))
  try {
    const git = (...args: string[]) => {
      const result = Bun.spawnSync(["git", "--no-replace-objects", ...args], { cwd: directory })
      expect(result.exitCode, result.stderr.toString()).toBe(0)
      return result.stdout.toString().trim()
    }
    const commit = () => {
      git("add", "--", "package.json", "foundation", "modules")
      git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "source")
      return git("rev-parse", "HEAD")
    }
    const helper = await Bun.file(path.join(workspace.domain("atlas"), "scripts/git-source-root.mjs")).bytes()
    await Bun.write(path.join(directory, "package.json"), '{"name":"fixture"}\n')
    await Bun.write(path.join(directory, "foundation/atlas/package.json"), '{"name":"atlas"}\n')
    await Bun.write(path.join(directory, "foundation/atlas/scripts/git-source-root.mjs"), helper)
    await Bun.write(path.join(directory, "modules/control.txt"), "control\n")
    git("init", "-q")
    const old = commit()
    const tree = git("rev-parse", `${old}:foundation/atlas`)
    git("mv", "foundation/atlas", "modules/atlas")
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "move")
    const moved = git("rev-parse", "HEAD")
    const project = (revision: string) => Bun.spawnSync(["node", path.join(workspace.root, "script/atlas-baseline.mjs"), revision], {
      cwd: path.join(directory, "modules/atlas"),
      env: { ...process.env, GITHUB_ENV: path.join(directory, "github-env") },
    })
    for (const revision of [old, moved]) {
      const result = project(revision)
      expect(result.exitCode, result.stderr.toString()).toBe(0)
      const receipt = JSON.parse(result.stdout.toString()) as { tree: string; base: string; prefix: string }
      expect(receipt.tree).toBe(tree)
      expect(git("rev-parse", `${receipt.base}^{tree}`)).toBe(tree)
      expect(await Bun.file(path.join(directory, "github-env")).text()).toContain(`EARS_COAMEND_BASE=${receipt.base}\n`)
    }
    const invalid = project("0000000000000000000000000000000000000000")
    expect(invalid.exitCode).not.toBe(0)
    const absent = git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit-tree", git("rev-parse", `${old}:modules`), "-m", "pre-import")
    const empty = project(absent)
    expect(empty.exitCode, empty.stderr.toString()).toBe(0)
    const emptyReceipt = JSON.parse(empty.stdout.toString()) as { prefix: null; tree: string }
    expect(emptyReceipt.prefix).toBeNull()
    expect(git("ls-tree", emptyReceipt.tree)).toBe("")
    await Bun.write(path.join(directory, "foundation/atlas/package.json"), '{"name":"atlas"}\n')
    const ambiguous = project(commit())
    expect(ambiguous.exitCode).not.toBe(0)
    expect(ambiguous.stderr.toString()).toContain("ATLAS_SOURCE_PREFIX_AMBIGUOUS")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
