import { expect } from "bun:test"
import { Cause, Effect } from "effect"
import { BackendToolkitAcquisition } from "../src/backend-toolkit/acquisition"
import { BackendToolkitDiagnostics } from "../src/backend-toolkit/diagnostics"
import { it } from "./lib/effect"

it.live("shared acquisition settles typed failure, defect, cleanup rejection and interruption, then retries", () =>
  Effect.gen(function* () {
    const attempts = BackendToolkitAcquisition.make<string>(250, (cause) => Cause.hasInterrupts(cause)
      ? "acquisition-interrupted" : BackendToolkitDiagnostics.details(Cause.pretty(cause)) ?? "details-redacted")
    for (const [key, work, expected] of [
      ["typed", Effect.fail("typed-failure"), "typed-failure"],
      ["defect", Effect.die(new Error("defect-failure")), "defect-failure"],
      ["cleanup", Effect.void.pipe(Effect.ensuring(Effect.promise(() => Promise.reject(new Error("cleanup-failure"))))), "cleanup-failure"],
      ["interrupt", Effect.interrupt, "acquisition-interrupted"],
    ] as const) {
      const state = { runs: 0 }
      const failing = Effect.sync(() => state.runs++).pipe(Effect.andThen(work))
      const results = yield* Effect.all(Array.from({ length: 3 }, () => attempts.once(key, failing)), { concurrency: "unbounded" }).pipe(Effect.timeout("3 seconds"))
      expect(new Set(results).size).toBe(1)
      expect(results[0]).toContain(expected)
      expect(results[0]?.length).toBeLessThanOrEqual(4096)
      expect(state.runs).toBe(1)
      expect(attempts.get(key)).toHaveProperty("failed")
      expect(yield* attempts.once(key, Effect.void)).toBe(results[0])
      yield* Effect.sleep("300 millis")
      expect(yield* attempts.once(key, Effect.sync(() => state.runs++))).toBeUndefined()
      expect(state.runs).toBe(2)
      expect(attempts.get(key)).toBeUndefined()
    }
  }), 10_000,
)

it.live("a throwing diagnostic formatter still settles and allows later acquisition", () =>
  Effect.gen(function* () {
    const attempts = BackendToolkitAcquisition.make<never>(0, () => { throw new Error("formatter defect") })
    expect(yield* attempts.once("formatter", Effect.die("failure")).pipe(Effect.timeout("3 seconds"))).toBe("acquisition-diagnostics-unavailable")
    expect(attempts.get("formatter")).toHaveProperty("failed")
    expect(yield* attempts.once("formatter", Effect.void)).toBeUndefined()
  }), 10_000,
)

it.live("diagnostics inspect ANSI-split tokens and actual ordinary secret values before truncation", () =>
  Effect.sync(() => {
    const token = `ghp_\x1b[31m${"x".repeat(36)}\x1b[0m`
    expect(BackendToolkitDiagnostics.details(`failure ${token}${" harmless".repeat(1000)}`, {})).toBeUndefined()
    expect(BackendToolkitDiagnostics.details(`failure ordinary-secret-value${" harmless".repeat(1000)}`, { HOST_SECRET: "ordinary-secret-value" })).toBeUndefined()
    expect(BackendToolkitDiagnostics.details("\x1b[31mordinary installer failure\x1b[0m", {})).toBe("ordinary installer failure")
    expect(BackendToolkitDiagnostics.details("download:404", { ACTIONS_AUTHENTICATION_LEVEL: "0" })).toBe("download:404")
  expect(BackendToolkitDiagnostics.details("download:404", { ORCHESTRA_INHERIT_CREDENTIALS: "0" })).toBe("download:404")
    expect(BackendToolkitDiagnostics.details("download:404", { HOST_SECRET: "0" })).toBeUndefined()
    expect(BackendToolkitDiagnostics.details("bounded ".repeat(1000), {})?.length).toBeLessThanOrEqual(4096)
    const env = BackendToolkitDiagnostics.environment("/private/staging", { HOST_SECRET: "ordinary-secret-value", PATH: "compiler-path", TMPDIR: "/private/tmp" })
    expect(env).not.toHaveProperty("HOST_SECRET")
    expect(env).toMatchObject({ PATH: "compiler-path", TMPDIR: "/private/tmp", HOME: "/private/staging/.installer-home" })
  }),
)
