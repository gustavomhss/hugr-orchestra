import { expect } from "bun:test"
import { existsSync } from "node:fs"
import path from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "../../../../../packages/core/test/fixture/omni-expect"
import { tmpdirScoped } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node, CrossSpawnSpawner.node])))

it.live("compiled runtime loader parses late source without external node_modules and preserves import-shaped data", () => Effect.gen(function* () {
  const directory = yield* tmpdirScoped()
  const processes = yield* AppProcess.Service
  // Fresh compiler process avoids inheriting runtime plugins installed by earlier TUI tests.
  const binary = path.join(directory, process.platform === "win32" ? "runtime-import.exe" : "runtime-import")
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      ["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR"].includes(key.toUpperCase()))),
    HOME: directory, USERPROFILE: directory, XDG_CONFIG_HOME: directory,
  }
  yield* Effect.promise(() => Bun.write(path.join(directory, "bunfig.toml"), ""))
  const build = Bun.spawn([process.execPath, "build", path.join(import.meta.dir, "runtime-import-compiled.fixture.ts"),
    "--no-env-file", "--config", path.join(directory, "bunfig.toml"), "--compile", "--outfile", binary,
    "--no-compile-autoload-bunfig", "--no-compile-autoload-dotenv", "--compile-exec-argv=--no-install"],
    { cwd: directory, env, stdout: "pipe", stderr: "pipe", timeout: 20000 })
  const built = yield* Effect.promise(() => Promise.all([build.exited, new Response(build.stdout).text(), new Response(build.stderr).text()]))
  expect({ code: built[0], stderr: built[2], stdout: built[1] }).toMatchObject({ code: 0 })
  expect(existsSync(binary), JSON.stringify({ stdout: built[1], stderr: built[2] })).toBe(true)

  const fixture = path.join(directory, "late.ts")
  yield* Effect.promise(() => Bun.write(fixture, 'export { RGBA } from "@opentui/core"\nexport const prose = ' +
    JSON.stringify(['import { RGBA } from "@opentui/core"', 'require("@opentui/core")', "🦣 café 日本語"])))
  // The executable and late module cannot resolve the parser from a neighboring dependency tree.
  expect(existsSync(path.resolve(import.meta.dir, "../../../../../node_modules"))).toBe(true)
  const root = path.parse(directory).root
  const segments = path.relative(root, directory).split(path.sep)
  for (const parent of [root, ...segments.map((_, index) => path.join(root, ...segments.slice(0, index + 1)))]) {
    expect(existsSync(path.join(parent, "node_modules"))).toBe(false)
  }
  expectSpawn(import.meta.path)
  const result = yield* processes.run(ChildProcess.make(binary, [fixture], { cwd: directory, env, extendEnv: false }), { timeout: 6000 })
  expect({ code: result.exitCode, stdout: result.stdout.toString().replace(/\r\n/g, "\n"), stderr: result.stderr.toString() }).toEqual({
    code: 0, stdout: "COMPILED_RUNTIME_IMPORT_SYNTAX_OK\n", stderr: "",
  })
}))
