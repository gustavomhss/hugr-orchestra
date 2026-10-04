#!/usr/bin/env bun

import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"

// Bun's Node stdin adapter lost pipe bytes under load. Keep the command runner
// on Node and inherit its descriptors directly; Bun only builds/launches it.
await mkdir(join(tmpdir(), "opencode"), { recursive: true })
const directory = await mkdtemp(join(tmpdir(), "opencode/linux-cli-"))
try {
  const built = await Bun.build({
    entrypoints: [resolve(import.meta.dir, "linux-workspace-cli.ts")],
    outdir: directory,
    naming: "cli.mjs",
    target: "node",
    format: "esm",
    external: ["@lydell/node-pty"],
  })
  if (!built.success || !built.outputs[0]) throw new Error("linux-cli-build-failed")
  const child = Bun.spawn(["node", built.outputs[0].path, ...process.argv.slice(2)], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, ORCHESTRA_LINUX_CONTEXT: resolve(import.meta.dir, "../resources/linux-runtime") },
  })
  process.once("SIGINT", () => child.kill("SIGINT"))
  process.once("SIGTERM", () => child.kill("SIGTERM"))
  process.exitCode = await child.exited
} finally {
  await rm(directory, { recursive: true, force: true })
}
