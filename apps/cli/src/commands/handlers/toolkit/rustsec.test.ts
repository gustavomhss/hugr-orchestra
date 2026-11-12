import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Option } from "effect"
import { Command } from "effect/unstable/cli"
import { NodeServices } from "@effect/platform-node"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { Global } from "@orchestra/core/global"
import { Commands } from "../../commands"
import prefetch from "./prefetch"
import { withCapturedStdout } from "../test-support"

test("cargo-audit can be explicitly prefetched while default backend selection stays unchanged", async () => {
  const invoke = (engines: string[]) => prefetch({ engines, target: Option.none(), json: true }).pipe(
    Effect.provideService(BackendToolkit.Target, { unsupported: "test-host" }),
    Effect.result,
    Effect.runPromise,
  )
  const requested = await withCapturedStdout(async () => { await invoke(["cargo-audit"]) })
  expect(JSON.parse(requested)).toEqual([expect.objectContaining({ engine: "cargo-audit", status: "unsupported", reason: "test-host" })])
  const defaults = await withCapturedStdout(async () => { await invoke([]) })
  expect(JSON.parse(defaults).some((state: { engine: string }) => state.engine === "cargo-audit")).toBe(false)
})

test("rustsec rejects unknown flags and operands before any refresh handler executes", async () => {
  const calls = { count: 0 }
  const command = Commands.commands.toolkit.commands.rustsec.spec.pipe(Command.withHandler(() => Effect.sync(() => { calls.count += 1 })))
  for (const args of [["--not-a-rustsec-option"], ["unexpected-project-path"]]) {
    const result = await Effect.runPromise(Command.runWith(command, { version: "0.0.0" })(args).pipe(
      Effect.result,
      Effect.provide(NodeServices.layer),
    ))
    expect(result._tag).toBe("Failure")
    expect(calls.count).toBe(0)
  }
})

test("rustsec reports an unqualified host without opening a project or acquiring a pin", async () => {
  const handler = await import("./rustsec")
  const scope = await mkdtemp(join(tmpdir(), "rustsec-unqualified-"))
  const toolkit = join(scope, "toolkit")
  const rustsec = join(Global.Path.cache, "rustsec")
  const before = await readdir(rustsec).then((names) => names.sort(), () => undefined)
  try {
    const result = await Effect.runPromise(handler.default({ operands: [] }).pipe(
      Effect.provideService(BackendToolkit.Target, { unsupported: "test-host" }),
      Effect.provideService(BackendToolkit.Root, toolkit),
      Effect.result,
      Effect.provide(NodeServices.layer),
    ))
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(String(result.failure)).toContain("native-runtime-unqualified")
    expect(await readdir(toolkit).then(() => false, () => true)).toBe(true)
    expect(await readdir(rustsec).then((names) => names.sort(), () => undefined)).toEqual(before)
  } finally {
    await rm(scope, { recursive: true, force: true })
  }
})
