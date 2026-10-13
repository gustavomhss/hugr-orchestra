import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createPromptInputV2Controller } from "@orchestra/session-ui/v2/prompt-input/interaction"
import type { PromptInputV2PersistedState } from "@orchestra/session-ui/v2/prompt-input/types"

test("empty V2 submission never reaches the submit-or-abort callback; explicit stop still works", () => {
  createRoot((dispose) => {
    const store = createStore<PromptInputV2PersistedState>({ prompt: [], context: { items: [] } })
    const actions: string[] = []
    const controller = createPromptInputV2Controller({
      store,
      commands: () => [],
      context: () => [],
      searchContextFiles: () => [],
      view: {
        submit: {
          stopping: () => true,
          working: () => true,
          onSubmit: () => actions.push("submit"),
          onStop: () => actions.push("stop"),
        },
      },
    })
    controller.submit()
    controller.onInput("  \n")
    controller.submit()
    expect(actions).toEqual([])
    controller.stop()
    expect(actions).toEqual(["stop"])
    controller.onInput("follow up")
    controller.submit()
    expect(actions).toEqual(["stop", "submit"])
    controller.onInput("")
    store[1]("context", "items", [{ key: "comment", type: "file", path: "a.ts", comment: "review this" }])
    controller.submit()
    expect(actions).toEqual(["stop", "submit", "submit"])
    dispose()
  })
})
