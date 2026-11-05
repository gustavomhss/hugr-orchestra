import { expect, test } from "bun:test"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Option, Schema } from "effect"

test("FCW01 canonical empty Create rejects scalar, array and extra-property input before domain acquisition", () => {
  expect(Schema.decodeUnknownOption(FabricContext.Create)({})).toEqual(Option.some({}))
  expect(Schema.encodeSync(FabricContext.Create)({})).toEqual({})
  for (const input of [null, undefined, 1, "", true, [], { unexpected: true }, { principal: "injected" },
    { path: "/synthetic" }, { storageID: "injected" }, { location: {} }, { unexpected: undefined }]) {
    expect(Option.isNone(Schema.decodeUnknownOption(FabricContext.Create)(input))).toBe(true)
  }
  // The canonical wire definition must remain usable by HttpApi/SDK generation.
  expect(Schema.toJsonSchemaDocument(FabricContext.Create)).toBeDefined()
})
