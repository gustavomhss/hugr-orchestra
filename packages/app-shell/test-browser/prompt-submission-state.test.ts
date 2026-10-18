import { describe, expect, test } from "bun:test"
import { createPromptState } from "@/context/prompt"
import { createPromptSubmissionState } from "@/components/prompt-input/submission-state"

describe("prompt submission state", () => {
  test("context-only edits transfer current unsent state, not the submitted snapshot", () => {
    const source = createPromptState({ prompt: "submitted" })
    const destination = createPromptState()
    source.context.add({ type: "file", path: "removed.ts", comment: "old" })
    const submission = createPromptSubmissionState({
      target: source,
      prompt: source.current(),
      context: source.context.items().slice(),
    })
    source.context.remove(source.context.items()[0].key)
    source.context.add({ type: "file", path: "added.ts", comment: "new" })
    submission.retarget(destination)
    submission.clear("comments")
    expect(submission.context.map((item) => [item.path, item.comment])).toEqual([["removed.ts", "old"]])
    expect(destination.context.items().map((item) => [item.path, item.comment])).toEqual([["added.ts", "new"]])
    expect(destination.current()[0]).toMatchObject({ content: "" })
    submission.restore()
    expect(destination.context.items().map((item) => item.path)).toEqual(["added.ts"])
  })

  test("submitted payload is immutable and nested context edits survive promotion", () => {
    const source = createPromptState({ prompt: "submitted" })
    const destination = createPromptState()
    source.context.add({
      type: "file",
      path: "changed.ts",
      comment: "original",
      selection: { startLine: 1, endLine: 2 },
    })
    const submission = createPromptSubmissionState({
      target: source,
      prompt: source.current(),
      context: source.context.items().slice(),
    })
    source.store[1]("context", "items", 0, "comment", "edited")
    source.store[1]("context", "items", 0, "selection", "endLine", 9)
    source.store[1]("prompt", 0, "content", "mutated input")
    submission.retarget(destination)
    submission.clear("comments")
    expect(submission.prompt[0]).toMatchObject({ content: "submitted" })
    expect(submission.context[0]).toMatchObject({ comment: "original", selection: { endLine: 2 } })
    expect(destination.context.items()[0]).toMatchObject({ comment: "edited", selection: { endLine: 9 } })
    expect(destination.current()[0]).toMatchObject({ content: "mutated input" })
  })

  test("failed restoration treats new context independently of text", () => {
    const source = createPromptState({ prompt: "submitted" })
    const destination = createPromptState()
    source.context.add({ type: "file", path: "submitted.ts", comment: "old" })
    const submission = createPromptSubmissionState({
      target: source,
      prompt: source.current(),
      context: source.context.items().slice(),
    })
    submission.retarget(destination)
    submission.clear("comments")
    destination.context.add({ type: "file", path: "later.ts", comment: "new" })
    expect(submission.restore()?.prompt[0]).toMatchObject({ content: "submitted" })
    expect(destination.context.items().map((item) => item.path)).toEqual(["later.ts"])
  })

  test("preserves a draft already typed into the created session", () => {
    const draft = createPromptState({ prompt: "first prompt" })
    const session = createPromptState({ prompt: "new session draft" })
    const submission = createPromptSubmissionState({ target: draft, prompt: draft.current(), context: [] })
    submission.retarget(session)
    submission.clear()
    expect(session.current()[0]).toMatchObject({ content: "new session draft" })
    expect(submission.restore()).toBeUndefined()
  })

  test("keeps edits made during admission in the promoted composer", () => {
    const draft = createPromptState({ prompt: "first prompt" })
    const session = createPromptState()
    const submission = createPromptSubmissionState({ target: draft, prompt: draft.current(), context: [] })
    draft.set([{ type: "text", content: "typed while creating", start: 0, end: 20 }])
    submission.retarget(session)
    submission.clear()
    expect(session.current()[0]).toMatchObject({ content: "typed while creating" })
    expect(submission.restore()).toBeUndefined()
  })

  test("does not clear or restore over edits made before admission finishes", () => {
    const draft = createPromptState({ prompt: "first prompt" })
    const submission = createPromptSubmissionState({ target: draft, prompt: draft.current(), context: [] })
    draft.set([{ type: "text", content: "new draft", start: 0, end: 9 }])
    submission.clear()
    expect(draft.current()[0]).toMatchObject({ content: "new draft" })
    expect(submission.restore()).toBeUndefined()
  })

  test("keeps failed submission restoration with the prompt where it started", () => {
    const target = createPromptState()
    const submission = createPromptSubmissionState({
      target,
      prompt: [{ type: "text", content: "prompt-A", start: 0, end: 8 }],
      context: [{ key: "file:src/index.ts:undefined:undefined", type: "file", path: "src/index.ts" }],
    })

    expect(submission.restore()).toEqual({
      target,
      prompt: [{ type: "text", content: "prompt-A", start: 0, end: 8 }],
      context: [{ key: "file:src/index.ts:undefined:undefined", type: "file", path: "src/index.ts" }],
    })
  })

  test("moves first-submit restoration and context to the promoted session", () => {
    const draft = createPromptState()
    draft.context.add({ type: "file", path: "src/index.ts" })
    const session = createPromptState()
    const submission = createPromptSubmissionState({
      target: draft,
      prompt: [{ type: "text", content: "first prompt", start: 0, end: 12 }],
      context: draft.context.items(),
    })

    submission.retarget(session)

    expect(submission.restore()).toEqual({
      target: session,
      prompt: [{ type: "text", content: "first prompt", start: 0, end: 12 }],
      context: [{ key: "file:src/index.ts:undefined:undefined", type: "file", path: "src/index.ts" }],
    })
    expect(session.context.items()).toHaveLength(1)
    expect(session.context.items()[0]).toMatchObject({ type: "file", path: "src/index.ts" })
  })

  test("clears the original first-submit prompt after retargeting", () => {
    const workspace = createPromptState()
    const session = createPromptState()
    workspace.set([{ type: "text", content: "first prompt", start: 0, end: 12 }])
    const submission = createPromptSubmissionState({
      target: workspace,
      prompt: workspace.current(),
      context: [],
    })

    submission.retarget(session)
    submission.clear()

    expect(workspace.current()[0]).toMatchObject({ type: "text", content: "" })
    expect(session.current()[0]).toMatchObject({ type: "text", content: "" })
  })

  test("does not restore over a prompt edited after submission", () => {
    const target = createPromptState()
    target.set([{ type: "text", content: "submitted", start: 0, end: 9 }])
    const submission = createPromptSubmissionState({
      target,
      prompt: target.current(),
      context: [],
    })

    submission.clear()
    target.set([{ type: "text", content: "new draft", start: 0, end: 9 }])

    expect(submission.restore()).toBeUndefined()
    expect(target.current()[0]).toMatchObject({ type: "text", content: "new draft" })
  })
})
