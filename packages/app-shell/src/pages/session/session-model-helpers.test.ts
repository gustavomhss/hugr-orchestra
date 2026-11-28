import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createPromptState } from "@/context/prompt-state"
import type { UserMessage } from "@/v2-wire"

import { resetSessionModel, restorePromptModel, restoreStoredSessionModel, syncPromptModel, syncSessionModel } from "./session-model-helpers"

const message = (input?: { agent?: string; model?: UserMessage["model"] }) =>
  ({
    id: "msg",
    sessionID: "session",
    role: "user",
    time: { created: 1 },
    agent: input?.agent ?? "build",
    model: input?.model ?? { providerID: "anthropic", modelID: "claude-sonnet-4" },
  }) as UserMessage

describe("syncSessionModel", () => {
  test("restores the last message through session state", () => {
    const calls: unknown[] = []

    syncSessionModel(
      {
        session: {
          restore(value) {
            calls.push(value)
          },
          reset() {},
        },
      },
      message({ model: { providerID: "anthropic", modelID: "claude-sonnet-4", variant: "high" } }),
    )

    expect(calls).toEqual([
      message({ model: { providerID: "anthropic", modelID: "claude-sonnet-4", variant: "high" } }),
    ])
  })
})

describe("resetSessionModel", () => {
  test("clears draft session state", () => {
    const calls: string[] = []

    resetSessionModel({
      session: {
        reset() {
          calls.push("reset")
        },
        restore() {},
      },
    })

    expect(calls).toEqual(["reset"])
  })
})

test("keeps starter text and leaves an implicit model choice absent", () => {
  createRoot((dispose) => {
    try {
      const prompt = createPromptState({ prompt: "starter text" })
      const local = {
        model: { current: () => undefined, intent: () => ({ model: undefined, variant: undefined }) },
        session: { restoreModel() { throw new Error("No stored model to restore") } },
      }
      expect(restorePromptModel(local, prompt)).toBe(false)
      syncPromptModel(local, prompt)
      expect(prompt.model.current()).toBeUndefined()
      expect(prompt.current()[0]).toMatchObject({ content: "starter text" })
    } finally {
      dispose()
    }
  })
})


describe("first stored Session model", () => {
  const ref = { providerID: "provider", id: "removed-model" }

  test.each([undefined, "", "default"])("restores the exact stored variant %p without a catalog model", (variant) => {
    const writes: unknown[][] = []
    const local = {
      model: { intent: () => ({ model: undefined, variant: undefined }) },
      session: { inherited: () => false, restoreModel(...args: unknown[]) { writes.push(args) } },
    }
    restoreStoredSessionModel(local, { ...ref, variant })
    expect(writes).toEqual([[{ providerID: ref.providerID, modelID: ref.id }, variant ?? null, true]])
  })

  test("keeps an explicit local model or variant instead of the stored Session model", () => {
    for (const intent of [
      { model: { providerID: "other", modelID: "chosen" }, variant: undefined },
      { model: undefined, variant: null },
    ]) {
      const local = {
        model: { intent: () => intent },
        session: { inherited: () => false, restoreModel() { throw new Error("Would overwrite the local choice") } },
      }
      restoreStoredSessionModel(local, ref)
    }
  })
})
