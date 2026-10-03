import { expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

test("real generator reproduces committed bytes and rejects every generated-file mismatch or absence", async () => {
  const root = path.resolve(import.meta.dir, "../../..")
  const fixture = await realpath(await mkdtemp(path.join(tmpdir(), "atlas-boundary-build-")))
  const base = path.join(fixture, "packages/atlas-boundary")
  const files = ["boundary.js", "boundary.d.ts", "materialize.js", "materialize.d.ts"]
  const run = async (check: boolean) => {
    const child = Bun.spawn([process.execPath, "script/build.ts", ...(check ? ["--check"] : [])], {
      cwd: base,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    return { exit, diagnostic: stdout + stderr }
  }
  try {
    await mkdir(base, { recursive: true })
    await cp(path.join(root, "foundation/atlas/packages"), path.join(fixture, "foundation/atlas/packages"), {
      recursive: true,
      filter: (file) => path.basename(file) !== "node_modules",
    })
    await Promise.all(
      ["script", "src/generated", "package.json"].map((file) =>
        cp(path.join(root, "packages/atlas-boundary", file), path.join(base, file), { recursive: true }),
      ),
    )
    await symlink(path.join(root, "node_modules"), path.join(fixture, "node_modules"), "junction")
    const installed = path.join(root, "packages/atlas-boundary/node_modules")
    await symlink(
      (await Bun.file(path.join(installed, "@noble/hashes/package.json")).exists())
        ? installed
        : path.join(root, "node_modules"),
      path.join(base, "node_modules"),
      "junction",
    )
    const expected = await Promise.all(files.map((file) => Bun.file(path.join(base, "src/generated", file)).text()))
    expect(await run(false)).toEqual({ exit: 0, diagnostic: "" })
    expect(await Promise.all(files.map((file) => Bun.file(path.join(base, "src/generated", file)).text()))).toEqual(
      expected,
    )
    expect(await run(true)).toEqual({ exit: 0, diagnostic: "" })
    for (const file of files) {
      const target = path.join(base, "src/generated", file)
      const content = await Bun.file(target).text()
      // Whitespace-only drift must still fail: the contract is bytes, not equivalent JavaScript or declarations.
      await Bun.write(target, content + " ")
      const result = await run(true)
      expect(result.exit).not.toBe(0)
      expect(result.diagnostic).toContain(`Stale generated Atlas boundary: ${target}`)
      await Bun.write(target, content)
      await rm(target)
      const missing = await run(true)
      expect(missing.exit).not.toBe(0)
      expect(missing.diagnostic).toContain(`Missing generated Atlas boundary: ${target}`)
      await Bun.write(target, content)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
}, 120_000)
