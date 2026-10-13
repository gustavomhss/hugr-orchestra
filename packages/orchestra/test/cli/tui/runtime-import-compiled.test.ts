import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "../../fixture/fixture"

test("compiled runtime loader parses late source without external node_modules and preserves import-shaped data", async () => {
  await using tmp = await tmpdir()
  // Fresh compiler process avoids inheriting runtime plugins installed by earlier TUI tests.
  const binary = path.join(tmp.path, process.platform === "win32" ? "runtime-import.exe" : "runtime-import")
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      ["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR"].includes(key.toUpperCase()))),
    HOME: tmp.path, USERPROFILE: tmp.path, XDG_CONFIG_HOME: tmp.path,
  }
  await Bun.write(path.join(tmp.path, "bunfig.toml"), "")
  const build = Bun.spawn([process.execPath, "build", path.join(import.meta.dir, "runtime-import-compiled.fixture.ts"),
    "--no-env-file", "--config", path.join(tmp.path, "bunfig.toml"), "--compile", "--outfile", binary,
    "--no-compile-autoload-bunfig", "--no-compile-autoload-dotenv", "--compile-exec-argv=--no-install"],
    { cwd: tmp.path, env, stdout: "pipe", stderr: "pipe", timeout: 20000 })
  const built = await Promise.all([build.exited, new Response(build.stdout).text(), new Response(build.stderr).text()])
  expect({ code: built[0], stderr: built[2], stdout: built[1] }).toMatchObject({ code: 0 })
  expect(existsSync(binary), JSON.stringify({ stdout: built[1], stderr: built[2] })).toBe(true)

  const fixture = path.join(tmp.path, "late.ts")
  await Bun.write(fixture, 'export { RGBA } from "@opentui/core"\nexport const prose = ' +
    JSON.stringify(['import { RGBA } from "@opentui/core"', 'require("@opentui/core")', "🦣 café 日本語"]))
  // The executable and late module cannot resolve the parser from a neighboring dependency tree.
  expect(existsSync(path.resolve(import.meta.dir, "../../../../../node_modules"))).toBe(true)
  const root = path.parse(tmp.path).root
  const segments = path.relative(root, tmp.path).split(path.sep)
  for (const parent of [root, ...segments.map((_, index) => path.join(root, ...segments.slice(0, index + 1)))]) {
    expect(existsSync(path.join(parent, "node_modules"))).toBe(false)
  }
  const child = Bun.spawn([binary, fixture], { cwd: tmp.path, stdout: "pipe", stderr: "pipe", timeout: 6000,
    env })
  const result = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect({ code: result[0], stdout: result[1].replace(/\r\n/g, "\n"), stderr: result[2] }).toEqual({
    code: 0, stdout: "COMPILED_RUNTIME_IMPORT_SYNTAX_OK\n", stderr: "",
  })
})
