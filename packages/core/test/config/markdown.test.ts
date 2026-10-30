import { describe, expect, test } from "bun:test"
import { ConfigMarkdown } from "@orchestra/core/config/markdown"

describe("ConfigMarkdown", () => {
  test("an unquoted colon reaches the fallback on every parse, not only the first", () => {
    // Unique text: gray-matter's cache is process-wide, so a shared fixture could be poisoned by another test.
    const content = `---\nname: colon-${crypto.randomUUID()}\ndescription: Run work: then check it.\n---\nBody\n`
    const first = ConfigMarkdown.parse(content)
    expect(first.data.description).toBe("Run work: then check it.")
    expect(ConfigMarkdown.parse(content).data).toEqual(first.data)
  })
})
