import { expect } from "bun:test"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Schema } from "effect"

export function assertDirectoryFailure(error: FabricContext.Failure) {
  const canonical = new FabricContext.Failure({ code: "unavailable", message: "Fabric context directory is unavailable" })
  expect(error.code).toBe(canonical.code)
  expect(error.message).toBe(canonical.message)
  expect(Object.hasOwn(error, "cause")).toBe(false)
  // Delegate the intrinsic Error shape to the actual canonical class/runtime.
  // Bun adds location metadata and Effect owns plainArgs; neither is a raw I/O cause.
  expect(Object.getOwnPropertyNames(error).sort()).toEqual(Object.getOwnPropertyNames(canonical).sort())
  expect(Object.getOwnPropertySymbols(error)).toEqual(Object.getOwnPropertySymbols(canonical))
  expect(Object.keys(Schema.encodeSync(FabricContext.Failure)(error)).sort()).toEqual(["_tag", "code", "message"])
}
