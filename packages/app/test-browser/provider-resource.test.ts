import { expect, test } from "bun:test"
import { createResource, createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createProviderResource, refetchProviderResource } from "../src/hooks/provider-catalog"
import { formatServerError } from "../src/utils/server-errors"

for (const cause of [new Error("integration unavailable"), new Error(""), undefined, null, ""]) {
  test(`unavailable integration stays local and retries (${String(cause)})`, async () => {
    const state = { fail: true }
    const scope = createRoot((dispose) => ({
      dispose,
      integration: createProviderResource(
        () => "openrouter",
        async () => {
          if (state.fail) throw cause
          return { id: "openrouter", methods: [{ type: "key" }] }
        },
      ),
    }))
    try {
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(scope.integration.loading()).toBe(false)
      expect(() => scope.integration.data()).not.toThrow()
      expect(scope.integration.data()).toBeUndefined()
      expect(scope.integration.error()).toEqual({ cause })
      expect(formatServerError(scope.integration.error()?.cause, undefined, "Request failed")).not.toBe("")
      state.fail = false
      await scope.integration.retry()
      expect(scope.integration.error()).toBeUndefined()
      expect(scope.integration.data()?.id).toBe("openrouter")
    } finally {
      scope.dispose()
    }
  })
}

test("delayed discovery cannot leak into an unresolved or different directory", async () => {
  const pending = Promise.withResolvers<string[]>()
  const scope = createRoot((dispose) => {
    const [state, setState] = createStore({ directory: "/a" as string | undefined })
    const resource = createProviderResource(
      () => state.directory,
      async (directory) => (directory === "/a" ? pending.promise : [directory]),
    )
    return { dispose, resource, setState }
  })
  try {
    const first = scope.resource.retry()
    scope.setState("directory", undefined)
    pending.resolve(["/a"])
    await first
    expect(scope.resource.data()).toBeUndefined()
    expect(scope.resource.error()).toBeUndefined()
    scope.setState("directory", "/b")
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(scope.resource.loading()).toBe(false)
    expect(scope.resource.data()).toEqual(["/b"])
  } finally {
    pending.resolve([])
    scope.dispose()
  }
})

test("chapter refresh rejects Solid's swallowed resource error so auth completion cannot close its dialog", async () => {
  const state = { fail: false }
  const scope = createRoot((dispose) => {
    const [resource, actions] = createResource(async () => {
      if (state.fail) throw new Error("catalog unavailable")
      return { providers: ["opencode"] }
    })
    return { resource, actions, dispose }
  })
  try {
    await new Promise((resolve) => setTimeout(resolve, 0))
    state.fail = true
    await expect(refetchProviderResource(scope.resource, scope.actions, () => "Request failed")).rejects.toThrow(
      "catalog unavailable",
    )
    state.fail = false
    await expect(refetchProviderResource(scope.resource, scope.actions, () => "Request failed")).resolves.toEqual({
      providers: ["opencode"],
    })
  } finally {
    scope.dispose()
  }
})
