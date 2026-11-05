import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createReplyDrafts } from "../src/orchestra/chapters/board/reply-drafts"

test("reply acknowledgments use identity and edit revision, not equal text or the currently selected question", () => {
  createRoot((dispose) => {
    const drafts = createReplyDrafts()
    drafts.edit("ONE", "question", "Original")
    const sent = drafts.capture("ONE", "question")
    drafts.edit("TWO", "question", "Other project")
    drafts.edit("ONE", "different", "Other question")
    drafts.edit("ONE", "question", "Changed")
    drafts.edit("ONE", "question", "Original")
    drafts.acknowledge(sent)
    expect(drafts.read("ONE", "question")).toBe("Original")
    expect(drafts.read("TWO", "question")).toBe("Other project")
    expect(drafts.read("ONE", "different")).toBe("Other question")
    drafts.acknowledge(drafts.capture("ONE", "question"))
    expect(drafts.read("ONE", "question")).toBe("")
    drafts.edit("ONE", "question", "New after acknowledgment")
    drafts.acknowledge(sent)
    expect(drafts.read("ONE", "question")).toBe("New after acknowledgment")
    expect(createReplyDrafts().read("TWO", "question")).toBe("")
    dispose()
  })
})
