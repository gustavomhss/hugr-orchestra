import { afterEach, expect, test } from "bun:test"
import { McpOAuthCallback } from "@orchestra/core/mcp/oauth-callback"
import { callbackAddress } from "./oauth-authority-fixture"

afterEach(() => McpOAuthCallback.stop())

function observe(promise: Promise<string>) {
  return promise.then(
    (code) => ({ code }),
    (error: unknown) => ({ error }),
  )
}

function scheduler() {
  const callbacks: Array<() => void> = []
  const cancelled: number[] = []
  return {
    callbacks,
    cancelled,
    scheduleTimeout: (onTimeout: () => void, _delayMs: number) => {
      const index = callbacks.length
      callbacks.push(onTimeout)
      cancelled.push(0)
      return () => {
        cancelled[index]++
      }
    },
  }
}

test("cancelling captured callback A never cancels newer B with the same manager name", async () => {
  const address = await callbackAddress()
  await McpOAuthCallback.ensureRunning(address)
  const a = observe(McpOAuthCallback.waitForCallback("state-A", "same-manager"))
  const b = observe(McpOAuthCallback.waitForCallback("state-B", "same-manager"))
  McpOAuthCallback.cancelPending("same-manager", "state-A")
  const response = await fetch(`${address}?state=state-B&code=code-B`)
  expect(response.status).toBe(200)
  expect(await b).toEqual({ code: "code-B" })
  expect(await a).toMatchObject({ error: expect.any(Error) })
})

test("late A registration/completion never erases cancellation authority for B", async () => {
  const address = await callbackAddress()
  await McpOAuthCallback.ensureRunning(address)
  const b = observe(McpOAuthCallback.waitForCallback("state-B", "same-manager"))
  const a = observe(McpOAuthCallback.waitForCallback("state-A", "same-manager"))
  expect((await fetch(`${address}?state=state-A&code=code-A`)).status).toBe(200)
  expect(await a).toEqual({ code: "code-A" })
  McpOAuthCallback.cancelPending("same-manager", "state-B")
  // Use the real listener as the observable registry boundary; no private map inspection.
  if (McpOAuthCallback.isRunning()) expect((await fetch(`${address}?state=state-B&code=code-B`)).status).toBe(400)
  expect(await b).toMatchObject({ error: expect.any(Error) })
})

test("contract: firing timeout A after B registration settles only A, then B remains exactly cancellable", async () => {
  const address = await callbackAddress()
  await McpOAuthCallback.ensureRunning(address)
  const clock = scheduler()
  const a = observe(
    McpOAuthCallback.waitForCallback("state-A", "same-manager", { scheduleTimeout: clock.scheduleTimeout }),
  )
  // Baseline has no scheduler API: fail here, before exercising an uncontrolled five-minute timer.
  expect(clock.callbacks).toHaveLength(1)
  const b = observe(
    McpOAuthCallback.waitForCallback("state-B", "same-manager", { scheduleTimeout: clock.scheduleTimeout }),
  )
  clock.callbacks[0]()
  clock.callbacks[0]()
  expect(await a).toMatchObject({ error: expect.any(Error) })
  McpOAuthCallback.cancelPending("same-manager", "state-B")
  expect(await b).toMatchObject({ error: expect.any(Error) })
  await McpOAuthCallback.stop()
  expect(clock.cancelled).toEqual([1, 1])
})

test("contract: duplicate OAuth state rejects without replacing its first waiter or scheduling another timeout", async () => {
  const address = await callbackAddress()
  await McpOAuthCallback.ensureRunning(address)
  const clock = scheduler()
  const first = observe(
    McpOAuthCallback.waitForCallback("duplicate-state", "same-manager", { scheduleTimeout: clock.scheduleTimeout }),
  )
  expect(clock.callbacks).toHaveLength(1)
  const duplicate = Promise.resolve().then(() =>
    McpOAuthCallback.waitForCallback("duplicate-state", "same-manager", { scheduleTimeout: clock.scheduleTimeout }),
  )
  await expect(duplicate).rejects.toBeInstanceOf(Error)
  expect(clock.callbacks).toHaveLength(1)
  expect((await fetch(`${address}?state=duplicate-state&code=first-code`)).status).toBe(200)
  expect(await first).toEqual({ code: "first-code" })
  await McpOAuthCallback.stop()
  expect(clock.cancelled).toEqual([1])
})
