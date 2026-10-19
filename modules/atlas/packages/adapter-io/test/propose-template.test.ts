// @atlas/adapter-io — test/propose-template.test.ts  (D39: the bundled template text is the shipped .md, byte for byte)
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { shippedTemplatePath } from "../src/prompt.js"
import { PROPOSE_TEMPLATE } from "../src/propose-template.js"

describe("PROPOSE_TEMPLATE", () => {
  it("is prompts/propose.md byte for byte", () => {
    expect(PROPOSE_TEMPLATE).toBe(readFileSync(shippedTemplatePath(), "utf8"))
  })
})
