import { test } from "bun:test"
import { value } from "@lucy/workspace"
import { workspaceValue, ordinary } from "ordinary-external"
import { workspaceValue as nestedValue, ordinary as nestedOrdinary } from "nested-external"
test("reviewed", () => {
  console.log("DIRECT=" + value)
  console.log("TRANSITIVE=" + workspaceValue)
  console.log("NESTED=" + nestedValue)
  console.log("ORDINARY=" + ordinary)
  console.log("NESTED_PACKAGE=" + nestedOrdinary)
})
