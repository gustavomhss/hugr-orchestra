import { describe, expect, test } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber } from "effect"
import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { forwardInitializationFailure } from "./initialization"
import { readWslExpectedVersion } from "./cli-version"
import { nativeT } from "./native-translations"
import { verifyPackagedCli } from "../../scripts/cli-packaging"

describe("desktop initialization", () => {
  const failure = new Error("sidecar startup failed")
  const expectFailure = (exit: Exit.Exit<unknown, unknown>) => {
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) return
    expect(Cause.squash(exit.cause)).toBe(failure)
  }

  test("forwards loading task failures before renderer initialization", () => {
    const exit = Effect.runSync(
      Effect.gen(function* () {
        const initialization = yield* Deferred.make<never, unknown>()
        yield* forwardInitializationFailure(initialization)(Effect.die(failure)).pipe(Effect.exit)
        return yield* Deferred.await(initialization).pipe(Effect.exit)
      }),
    )

    expectFailure(exit)
  })

  test("forwards loading task failures while renderer initialization waits", () => {
    const exit = Effect.runSync(
      Effect.gen(function* () {
        const initialization = yield* Deferred.make<never, unknown>()
        const waiting = yield* Deferred.await(initialization).pipe(Effect.exit, Effect.forkChild)
        yield* forwardInitializationFailure(initialization)(Effect.die(failure)).pipe(Effect.exit)
        return yield* Fiber.join(waiting)
      }),
    )

    expectFailure(exit)
  })
})

test("Windows WSL version binds descriptor and agrees with effective package metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "orchestra-wsl-version-"))
  const bytes = Buffer.from("owned staged artifact")
  const targets = ["windows-x64-baseline", "linux-arm64", "linux-x64-baseline"]
  await Promise.all(targets.map((target) => writeFile(join(directory, `orchestra-${target}`), bytes)))
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify({
      schema: 1,
      version: "1.18.27-owned-artifact",
      artifacts: targets.map((target) => ({
        target,
        file: `orchestra-${target}`,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      })),
    }),
  )
  return readWslExpectedVersion("win32", directory, "42.3.3-electron-dev")
    .then(async (version) => {
      expect(version).toBe("1.18.27-owned-artifact")
      await verifyPackagedCli(directory, "win32", "x64", version)
      await expect(verifyPackagedCli(directory, "win32", "x64", "42.3.3-electron-dev")).rejects.toThrow("version")
    })
    .finally(() => rm(directory, { recursive: true, force: true }))
})

test("unselected WSL platforms do not read development CLI resources", async () => {
  const directory = join(tmpdir(), "orchestra-cli-not-staged", "manifest-missing")
  expect(await readWslExpectedVersion("linux", directory, "1.18.27-node-sidecar")).toBe("1.18.27-node-sidecar")
  expect(await readWslExpectedVersion("darwin", directory, "1.18.27-node-sidecar")).toBe("1.18.27-node-sidecar")
})

test("missing Windows development resources fail with named existing localized bootstrap error", async () => {
  const directory = await mkdtemp(join(tmpdir(), "orchestra-wsl-no-artifacts-"))
  return readWslExpectedVersion("win32", directory, "42.3.3-electron-dev")
    .then(
      () => {
        throw new Error("Missing CLI resources unexpectedly accepted")
      },
      (error: unknown) =>
        expect(error).toMatchObject({
          name: "OwnedCliBootstrapError",
          message: nativeT("desktop.recovery.loadFailed"),
          cause: { code: "ENOENT" },
        }),
    )
    .finally(() => rm(directory, { recursive: true, force: true }))
})
