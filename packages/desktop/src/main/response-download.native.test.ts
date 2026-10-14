import { expect } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../../../core/src/process"
import { LayerNode } from "../../../core/src/effect/layer-node"
import { testEffect } from "../../../core/test/lib/effect"
import { expectSpawn } from "../../../core/test/fixture/omni-expect"

const it = testEffect(LayerNode.compile(AppProcess.node))

// Final CI needs installed Electron plus a GUI session (e.g. xvfb on Linux). Never skip missing native prerequisites.
it.live("actual Electron preload/frame IPC saves bounded bytes and cleans cancellation/crash", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const root = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), "orchestra-response-download-native-"))),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  )
  yield* Effect.promise(async () => {
    await mkdir(join(root, "profile"))
    for (const [entry, name, target, format] of [
      [join(import.meta.dir, "response-download.native.fixture.ts"), "main.cjs", "node", "cjs"],
      [join(import.meta.dir, "../preload/index.ts"), "preload.cjs", "node", "cjs"],
      [join(import.meta.dir, "../renderer/response-download.native.fixture.ts"), "renderer.js", "browser", "esm"],
    ] as const) {
      const build = await Bun.build({ entrypoints: [entry], outdir: root, naming: name, target, format, external: ["electron"], write: true })
      if (!build.success) throw new Error(build.logs.map(String).join("\n"))
    }
    await writeFile(join(root, "fixture.html"), '<!doctype html><script type="module" src="renderer.js"></script>')
  })
  const proc = yield* AppProcess.Service
  const executable: string = createRequire(import.meta.url)("electron")
  const result = yield* proc.run(ChildProcess.make(executable, ["--no-sandbox", join(root, "main.cjs")], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, RESPONSE_DOWNLOAD_FIXTURE_ROOT: root }, extendEnv: false,
    stdin: "ignore", stdout: "pipe", stderr: "pipe",
  }), { timeout: "45 seconds", maxOutputBytes: 16 * 1024, maxErrorBytes: 32 * 1024 })
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  expect(result.stdout.toString()).toContain("response-download-native:pass")
}), 60000)
