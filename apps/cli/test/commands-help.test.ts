import { describe, expect, test } from "bun:test"
import { Commands } from "../src/commands/commands"

describe("top-level help", () => {
  test("hides the internal commands but keeps them defined and runnable", () => {
    for (const name of ["api", "debug", "acp", "toolkit"] as const) {
      expect(Commands.commands[name].spec.hidden).toBe(true)
    }
  })

  test("keeps the commands people and scripts use visible", () => {
    for (const name of ["run", "web", "serve", "attach"] as const) {
      expect(Commands.commands[name].spec.hidden).toBe(false)
    }
  })
})
