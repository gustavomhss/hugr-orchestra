import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { withCapturedStdout } from "../test-support"
import status from "./status"
import prefetch from "./prefetch"

// A host with no supported target makes every engine "unsupported" without touching the disk or the network.
const unsupportedHost = <A, E>(effect: Effect.Effect<A, E, never>) =>
  effect.pipe(Effect.provideService(BackendToolkit.Target, { unsupported: "test-host" } as never), Effect.runPromise)

async function run(effect: Effect.Effect<void, unknown, never>) {
  const result = { out: "", error: undefined as unknown }
  result.out = await withCapturedStdout(async () => {
    await unsupportedHost(effect).catch((error) => {
      result.error = error
    })
  })
  return result
}

describe("toolkit", () => {
  test("status prints every engine and fails when none is usable", async () => {
    const result = await run(status({ json: false, research: false, worktree: Option.none() }) as never)
    expect(result.out).toContain("unsupported: test-host")
    expect(String(result.error)).toContain("backend toolkit not usable:")
  })

  test("status --json prints the backend state array", async () => {
    const result = await run(status({ json: true, research: false, worktree: Option.none() }) as never)
    expect(JSON.parse(result.out)).toEqual(expect.arrayContaining([expect.objectContaining({ status: "unsupported", reason: "test-host" })]))
  })

  test("prefetch rejects an unknown engine and an unknown target before fetching anything", async () => {
    await expect(unsupportedHost(prefetch({ engines: ["nope"], target: Option.none(), json: false }) as never)).rejects.toThrow(
      'Unknown engine "nope"',
    )
    await expect(unsupportedHost(prefetch({ engines: [], target: Option.some("amiga"), json: false }) as never)).rejects.toThrow(
      'Unknown target "amiga"',
    )
  })
})
