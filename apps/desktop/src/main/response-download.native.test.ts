import { expect } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../../../../packages/core/src/process"
import { LayerNode } from "../../../../packages/core/src/effect/layer-node"
import { testEffect } from "../../../../packages/core/test/lib/effect"
import { expectSpawn } from "../../../../packages/core/test/fixture/omni-expect"
import { installElectron } from "../../scripts/install-electron"

const it = testEffect(LayerNode.compile(AppProcess.node))

// Bootstrap Electron even when install scripts were ignored; missing Xvfb/native prerequisites fail the test.
it.live("actual Electron preload/frame IPC saves bounded bytes and cleans cancellation/crash", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  yield* Effect.promise(() => installElectron())
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
  const electronDirectory = dirname(createRequire(import.meta.url).resolve("electron/package.json"))
  const electron = join(
    electronDirectory,
    "dist",
    (yield* Effect.promise(() => readFile(join(electronDirectory, "path.txt"), "utf8"))).trim(),
  )
  const command = process.platform === "linux" ? "xvfb-run" : electron
  // xvfb-run folds Electron's stderr into stdout and keeps Xvfb's own errors in -e; report both on failure.
  const xvfbLog = join(root, "xvfb.log")
  const args = [...(process.platform === "linux" ? ["-a", "-e", xvfbLog, electron] : []), "--no-sandbox", join(root, "main.cjs")]
  console.log("Native response download command", { executable: command, args })
  const result = yield* proc.run(ChildProcess.make(command, args, {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, RESPONSE_DOWNLOAD_FIXTURE_ROOT: root }, extendEnv: false,
    stdin: "ignore", stdout: "pipe", stderr: "pipe",
  }), { timeout: "45 seconds", maxOutputBytes: 16 * 1024, maxErrorBytes: 32 * 1024 })
  const xvfb = process.platform === "linux" ? yield* Effect.promise(() => readFile(xvfbLog, "utf8").catch(() => "")) : ""
  expect(result.exitCode, [result.stderr.toString(), result.stdout.toString(), xvfb].join("\n")).toBe(0)
  expect(result.stdout.toString()).toContain("response-download-native:pass")
}), 180000)
