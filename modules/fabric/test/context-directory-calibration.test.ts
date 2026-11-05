import { expect, test } from "bun:test"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Effect, Exit } from "effect"

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
})
