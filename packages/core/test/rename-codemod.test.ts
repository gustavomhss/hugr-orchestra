import { afterEach, describe, expect, test } from "bun:test"
import { chmod, lstat, mkdir, mkdtemp, readlink, rm, stat, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const script = path.resolve(import.meta.dir, "../../../script/rename-codemod.ts")
const repos: string[] = []
// Linux always runs these cases. Windows skips only when its symlink privilege probe is denied.
const canSymlink = process.platform !== "win32" || await symlinkPermission()

async function symlinkPermission() {
  const cwd = await mkdtemp(path.join(tmpdir(), "rename-symlink-probe-"))
  const allowed = await symlink("missing", path.join(cwd, "link"), "file").then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "EPERM" || error.code === "EACCES") return false
      throw error
    },
  )
  await rm(cwd, { recursive: true, force: true })
  return allowed
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((cwd) => rm(cwd, { recursive: true, force: true })))
})

function git(cwd: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  return result.stdout.toString()
}

async function repo(files: Record<string, string>) {
  const cwd = await mkdtemp(path.join(tmpdir(), "rename-codemod-"))
  repos.push(cwd)
  git(cwd, "init", "-q")
  await Promise.all(Object.entries(files).map(([file, text]) => Bun.write(path.join(cwd, file), text)))
  git(cwd, "add", "--", ...Object.keys(files))
  // An index is enough for ls-files and git mv; no commits or git config changes needed.
  return cwd
}

function run(cwd: string, dry = false) {
  const result = Bun.spawnSync(
    [
      process.execPath, script, "--allow-dirty", "--skip-regen", "--report", path.join(cwd, "report.md"),
      ...(dry ? ["--dry-run"] : []),
    ],
    { cwd, stdout: "pipe", stderr: "pipe" },
  )
  return { code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() }
}

describe("rename codemod CLI", () => {
  test("preview and execution share directory, nested directory and executable moves", async () => {
    const files = {
      "packages/opencode/bin/opencode": "#!/usr/bin/env bun\nconsole.log('OpenCode')\n",
      "packages/opencode/opencode-data/Opencode.txt": "OpenCode\n",
      "packages/opencode/NOTICE": "OpenCode copyright\n",
    }
    const dry = await repo(files)
    const real = await repo(files)
    for (const cwd of [dry, real]) {
      await chmod(path.join(cwd, "packages/opencode/bin/opencode"), 0o755)
      git(cwd, "update-index", "--chmod=+x", "packages/opencode/bin/opencode")
    }
    const preview = run(dry, true)
    const applied = run(real)
    expect(preview.code, preview.output).toBe(0)
    expect(applied.code, applied.output).toBe(0)
    const report = await Bun.file(path.join(dry, "report.md")).text()
    expect(report.split("## preview scope")[0]).toBe(await Bun.file(path.join(real, "report.md")).text())
    expect(report).toContain("Generators not run; generated-output residue omitted.")
    expect(report).toContain("packages/opencode -> packages/orchestra")
    expect(report).toContain("packages/orchestra/opencode-data -> packages/orchestra/orchestra-data")
    expect(report).toContain("packages/orchestra/bin/opencode -> packages/orchestra/bin/orchestra")
    expect(report).toContain(
      "packages/orchestra/orchestra-data/Opencode.txt -> packages/orchestra/orchestra-data/Orchestra.txt",
    )
    expect(await Bun.file(path.join(real, "packages/orchestra/bin/orchestra")).text()).toBe(
      "#!/usr/bin/env bun\nconsole.log('Orchestra')\n",
    )
    expect(await Bun.file(path.join(real, "packages/orchestra/NOTICE")).text()).toBe(files["packages/opencode/NOTICE"])
    expect(git(real, "ls-files", "--stage")).toContain("100755")
    if (process.platform !== "win32")
      expect((await stat(path.join(real, "packages/orchestra/bin/orchestra"))).mode & 0o111).toBe(0o111)
    for (const [file, text] of Object.entries(files))
      expect(await Bun.file(path.join(dry, file)).text()).toBe(text)
    expect(git(dry, "ls-files").split("\n").filter(Boolean).sort()).toEqual(Object.keys(files).sort())
    const rerun = run(real)
    expect(rerun.code, rerun.output).toBe(0)
    expect(rerun.output).toContain("0 paths moved, 0 files rewritten")
  })

  test("final-path masks preserve legacy branches and provider text in dry and real runs", async () => {
    const files = {
      "packages/app/e2e/opencode/chapter-workspaces.spec.ts": 'opencode/legacy\nOpenCode\n',
      "packages/opencode/test/project/worktree.test.ts": '`opencode/${name}`\nOpenCode\n',
      "packages/core/src/plugin/provider/opencode.ts": '"opencode"\n"OpenCode Console"\nOpenCode\n',
    }
    const dry = await repo(files)
    const real = await repo(files)
    const preview = run(dry, true)
    const applied = run(real)
    expect(preview.code, preview.output).toBe(0)
    expect(applied.code, applied.output).toBe(0)
    expect((await Bun.file(path.join(dry, "report.md")).text()).split("## preview scope")[0]).toBe(
      await Bun.file(path.join(real, "report.md")).text(),
    )
    expect(await Bun.file(path.join(real, "packages/app/e2e/orchestra/chapter-workspaces.spec.ts")).text()).toBe(
      'opencode/legacy\nOrchestra\n',
    )
    expect(await Bun.file(path.join(real, "packages/orchestra/test/project/worktree.test.ts")).text()).toBe(
      '`opencode/${name}`\nOrchestra\n',
    )
    expect(await Bun.file(path.join(real, "packages/core/src/plugin/provider/opencode.ts")).text()).toBe(
      '"opencode"\n"OpenCode Console"\nOrchestra\n',
    )
  })

  test("preview census sees protection lost when rewritten context exceeds the ledger window", async () => {
    // The connected-provider lookbehind permits 40 chars. OpenCode -> Orchestra adds one.
    const text = `connected ${"x".repeat(29)} OpenCode "opencode"\n`
    const dry = await repo({ "context.ts": text })
    const real = await repo({ "context.ts": text })
    for (const result of [run(dry, true), run(real)]) {
      expect(result.code).toBe(1)
      expect(result.output).toContain("protected strings: 1 before, 0 after, 1 changed")
      expect(result.output).toContain("A protected string changed.")
    }
    expect(await Bun.file(path.join(dry, "context.ts")).text()).toBe(text)
    expect(await Bun.file(path.join(real, "context.ts")).text()).toBe(
      `connected ${"x".repeat(29)} Orchestra "opencode"\n`,
    )
  })

  test("preview rejects old mixed-case residue outside the ledger", async () => {
    const cwd = await repo({ "name.ts": "oPeNcOdE\n" })
    const result = run(cwd, true)
    expect(result.code).toBe(1)
    expect(result.output).toContain("name.ts:1: oPeNcOdE")
    expect(result.output).toContain("Old names remain outside the ledger.")
    const binary = await repo({ "oPeNcOdE.bin": "\0binary" })
    const pathResult = run(binary, true)
    expect(pathResult.code).toBe(1)
    expect(pathResult.output).toContain("oPeNcOdE.bin: path")
  })

  test("preview omits generated residue explicitly; real run still checks it", async () => {
    const files = { "packages/client/src/generated/api.ts": "OpenCode\n" }
    const dry = await repo(files)
    const real = await repo(files)
    const preview = run(dry, true)
    expect(preview.code, preview.output).toBe(0)
    expect(preview.output).toContain("generators not run; generated-output residue omitted from preview")
    const applied = run(real)
    expect(applied.code).toBe(1)
    expect(applied.output).toContain("Old names remain outside the ledger.")
  })

  test("frozen fixture text or path changes refuse before edits", async () => {
    for (const file of ["packages/x/test/golden/input.json", "packages/relay/test/fixtures/opencode.bin"]) {
      for (const dry of [true, false]) {
        const cwd = await repo({
          [file]: file.endsWith(".bin") ? "\0binary" : '"OpenCode"\n',
          "opencode.ts": "OpenCode\n",
        })
        const index = git(cwd, "ls-files", "--stage")
        const result = run(cwd, dry)
        expect(result.code).toBe(1)
        expect(result.output).toContain("in frozen fixtures; nothing was changed.")
        expect(git(cwd, "ls-files", "--stage")).toBe(index)
        expect(await Bun.file(path.join(cwd, "opencode.ts")).text()).toBe("OpenCode\n")
      }
    }
  })

  test("final and nested untracked destination collisions refuse before any move or write", async () => {
    for (const untracked of [false, true]) {
      for (const dry of [true, false]) {
        const cwd = await repo({
          "opencode-first/name.ts": "OpenCode\n",
          "packages/opencode/bin/opencode": "OpenCode\n",
          ...(!untracked ? { "packages/orchestra/bin/orchestra": "occupied\n" } : {}),
        })
        if (untracked) await Bun.write(path.join(cwd, "packages/opencode/bin/orchestra"), "occupied\n")
        const index = git(cwd, "ls-files", "--stage")
        const result = run(cwd, dry)
        expect(result.code).toBe(1)
        expect(result.output).toContain("Cannot move")
        expect(git(cwd, "ls-files", "--stage")).toBe(index)
        expect(await Bun.file(path.join(cwd, "opencode-first/name.ts")).text()).toBe("OpenCode\n")
        expect(await Bun.file(path.join(cwd, "packages/opencode/bin/opencode")).text()).toBe("OpenCode\n")
      }
    }
  })

  test("missing tracked files fail by name in preview and execution", async () => {
    for (const dry of [true, false]) {
      const cwd = await repo({ "missing.ts": "OpenCode\n", "opencode.ts": "OpenCode\n" })
      await rm(path.join(cwd, "missing.ts"))
      const result = run(cwd, dry)
      expect(result.code).toBe(1)
      expect(result.output).toContain("Unreadable tracked file missing.ts:")
      expect(await Bun.file(path.join(cwd, "opencode.ts")).text()).toBe("OpenCode\n")
    }
  })

  test("leading-dash filenames share preview and real move plans", async () => {
    const files = { "-opencode.ts": "OpenCode\n" }
    const dry = await repo(files)
    const real = await repo(files)
    for (const result of [run(dry, true), run(real)]) expect(result.code, result.output).toBe(0)
    expect((await Bun.file(path.join(dry, "report.md")).text()).split("## preview scope")[0]).toBe(
      await Bun.file(path.join(real, "report.md")).text(),
    )
    expect(await Bun.file(path.join(real, "-orchestra.ts")).text()).toBe("Orchestra\n")
    expect(await Bun.file(path.join(dry, "-opencode.ts")).text()).toBe("OpenCode\n")
  })

  test.skipIf(!canSymlink)("dangling destination refuses before an early directory move", async () => {
    for (const dry of [true, false]) {
      const cwd = await repo({ "opencode-first/name.ts": "OpenCode\n", "opencode.ts": "OpenCode\n" })
      await symlink("missing", path.join(cwd, "orchestra.ts"), "file")
      const index = git(cwd, "ls-files", "--stage")
      const result = run(cwd, dry)
      expect(result.code).toBe(1)
      expect(result.output).toContain("Cannot move opencode.ts: orchestra.ts already exists.")
      expect(git(cwd, "ls-files", "--stage")).toBe(index)
      expect(await Bun.file(path.join(cwd, "opencode-first/name.ts")).text()).toBe("OpenCode\n")
      expect((await lstat(path.join(cwd, "orchestra.ts"))).isSymbolicLink()).toBe(true)
    }
  })

  test.skipIf(!canSymlink)("affected tracked symlink source, target or content refuses before edits", async () => {
    for (const kind of ["source", "target", "content"]) {
      for (const dry of [true, false]) {
        const source = kind === "source" ? "opencode-link.ts" : "link.ts"
        const target = kind === "target" ? "opencode-target.ts" : "target.ts"
        const text = kind === "content" ? "OpenCode\n" : "unchanged\n"
        const cwd = await repo({ [target]: text, "opencode-first/name.ts": "OpenCode\n" })
        await symlink(target, path.join(cwd, source), "file")
        git(cwd, "add", "--", source)
        const index = git(cwd, "ls-files", "--stage")
        const result = run(cwd, dry)
        expect(result.code).toBe(1)
        expect(result.output).toContain(
          `Tracked symlink ${source} requires explicit rename handling; nothing was changed.`,
        )
        expect(git(cwd, "ls-files", "--stage")).toBe(index)
        expect(await Bun.file(path.join(cwd, "opencode-first/name.ts")).text()).toBe("OpenCode\n")
        expect(await Bun.file(path.join(cwd, target)).text()).toBe(text)
        expect(await readlink(path.join(cwd, source))).toBe(target)
      }
    }
  })

  test.skipIf(!canSymlink)("unaffected custom-elements symlink stays accepted and intact", async () => {
    for (const dry of [true, false]) {
      const cwd = await repo({ "packages/ui/src/custom-elements.d.ts": "export {}\n", "opencode.ts": "OpenCode\n" })
      const source = "packages/app/src/custom-elements.d.ts"
      await mkdir(path.dirname(path.join(cwd, source)), { recursive: true })
      await symlink("../../ui/src/custom-elements.d.ts", path.join(cwd, source), "file")
      git(cwd, "add", "--", source)
      const result = run(cwd, dry)
      expect(result.code, result.output).toBe(0)
      expect((await lstat(path.join(cwd, source))).isSymbolicLink()).toBe(true)
      expect(path.resolve(path.dirname(path.join(cwd, source)), await readlink(path.join(cwd, source)))).toBe(
        path.join(cwd, "packages/ui/src/custom-elements.d.ts"),
      )
      expect(await Bun.file(path.join(cwd, source)).text()).toBe("export {}\n")
    }
  })
})
