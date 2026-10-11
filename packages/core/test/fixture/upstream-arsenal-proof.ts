import { expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"

export async function upstreamDriftProof(mode: "missing" | "nonpure", boundary: "catalog" | "describe" | "execute") {
  const root = path.resolve(import.meta.dirname, "../..")
  const originals = await Promise.all(
    [
      path.join(root, "src/tool/maestro-arsenal.ts"),
      path.join(root, "src/tool/upstream-arsenal.ts"),
      path.resolve(root, "../maestro-arsenal/src/registry.ts"),
    ].map(async (file) => ({ file, bytes: await Bun.file(file).text() })),
  )
  // Package-local artifacts preserve dependency resolution on isolated Linux and hoisted Windows installs.
  await using artifacts = {
    path: await fs.mkdtemp(path.join(root, ".upstream-arsenal-proof-")),
    async [Symbol.asyncDispose]() {
      await fs.rm(this.path, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 })
    },
  }
  const snapshot = path.join(artifacts.path, "package")
  const marker = path.join(artifacts.path, "operation-entered")
  const config = path.join(artifacts.path, "bunfig.toml")
  await Bun.write(
    config,
    "[test]\npreload = " +
      JSON.stringify([
        path.resolve(root, "../../script/test-guard.ts"),
        path.join(root, "test/fixture/upstream-arsenal-registry.ts"),
        path.join(root, "test/preload.ts"),
      ]) +
      "\n",
  )
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      `--config=${config}`,
      "./test/fixture/upstream-arsenal-runtime.ts",
      "--timeout",
      "60000",
    ],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 90000,
      env: {
        ...process.env,
        ORCHESTRA_UPSTREAM_SNAPSHOT: snapshot,
        ORCHESTRA_UPSTREAM_OPERATION_MARKER: marker,
        ORCHESTRA_UPSTREAM_DRIFT: mode,
        ORCHESTRA_UPSTREAM_BOUNDARY: boundary,
      },
    },
  )
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  const diagnostics = `actual ${boundary} / ${mode} registry drift\n${stdout}\n${stderr}`
  expect(child.signalCode, diagnostics).toBeNull()
  expect(exit, diagnostics).toBe(0)
  expect(stderr, diagnostics).toMatch(/\b1 pass\b/)
  expect(stderr, diagnostics).not.toMatch(/\b[1-9]\d* skip\b/)
  expect(stdout, diagnostics).toContain(
    JSON.stringify({
      upstreamDrift: { mode, boundary, realBackendControl: true, backendEnteredAfterDenial: false },
    }),
  )
  for (const original of originals) expect(await Bun.file(original.file).text(), original.file).toBe(original.bytes)
}
