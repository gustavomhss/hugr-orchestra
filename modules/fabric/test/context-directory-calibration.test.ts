import { expect, test } from "bun:test"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Effect, Exit } from "effect"
import { assertDirectoryFailure } from "./fixture/context-directory-error"

test("FSD00 calibrate canonical Failure properties through the actual Effect rejection path", async () => {
  const canonical = new FabricContext.Failure({ code: "unavailable", message: "Fabric context directory is unavailable" })
  const exit = await Effect.runPromise(Effect.exit(Effect.tryPromise({
    try: async () => { throw new Error("synthetic calibration error") },
    catch: () => canonical,
  })))
  if (Exit.isSuccess(exit)) throw new Error("Expected the actual canonical refusal")
  const reason = exit.cause.reasons[0]
  if (reason?._tag !== "Fail") throw new Error("Expected the actual typed refusal, not a defect")
  expect(reason.error).toBe(canonical)
  assertDirectoryFailure(canonical)
  expect(canonical.code).toBe("unavailable")
  expect(canonical.message).toBe("Fabric context directory is unavailable")
  expect(Object.hasOwn(canonical, "cause")).toBe(false)
  const own = Object.getOwnPropertyNames(canonical).sort()
  expect(own).toContain("code")
  expect(own).toContain("message")
  expect(own).toContain("_tag")
  console.info("canonical Fabric Failure calibration:", JSON.stringify({
    own: own.map((key) => ({ key, type: typeof Reflect.get(canonical, key) })),
    symbols: Object.getOwnPropertySymbols(canonical).map(String),
  }))
  for (const key of ["raw", Symbol("raw"), "cause"]) {
    const extra = new FabricContext.Failure({ code: "unavailable", message: canonical.message })
    Object.defineProperty(extra, key, { value: new Error("synthetic raw I/O detail"), enumerable: false })
    expect(() => assertDirectoryFailure(extra)).toThrow()
  }
})
