import { describe, expect, test } from "bun:test"
import { SlashCommand } from "@orchestra/core/slash-command"

describe("SlashCommand.expand", () => {
  test("fills numbered placeholders, the last one taking the rest", () => {
    expect(SlashCommand.expand("Compare $1 with $2", `main "feature branch" extra`)).toBe(
      "Compare main with feature branch extra",
    )
    expect(SlashCommand.expand("Use $1 and $2", "only")).toBe("Use only and")
  })

  test("fills $ARGUMENTS verbatim", () => {
    expect(SlashCommand.expand("Review $ARGUMENTS now", "src/a.ts $1")).toBe("Review src/a.ts $1 now")
  })

  test("appends arguments to a template without placeholders", () => {
    expect(SlashCommand.expand("Summarize the diff", "briefly")).toBe("Summarize the diff\n\nbriefly")
    expect(SlashCommand.expand("Summarize the diff", "  ")).toBe("Summarize the diff")
  })
})
