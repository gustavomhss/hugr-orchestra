import { expect, spyOn, test } from "bun:test"
import { createScopedFetch } from "./scoped-fetch"

test.each(["owner", "request", "init"] as const)("scoped fetch retains %s signal and rejects pre-aborted dispatch", async (source) => {
  const controllers = { owner: new AbortController(), request: new AbortController(), init: new AbortController() }
  const requests: Request[] = []
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    requests.push(new Request(input, init))
    return new Response(null)
  }, { preconnect: fetch.preconnect })
  const scoped = createScopedFetch(fetcher, controllers.owner.signal)
  const request = new Request("https://synthetic.invalid", { signal: controllers.request.signal })
  await scoped(request, { signal: controllers.init.signal })
  expect(requests).toHaveLength(1)
  expect(requests[0].signal.aborted).toBe(false)
  const reason = new Error(`synthetic ${source} aborted`)
  controllers[source].abort(reason)
  expect(requests[0].signal.aborted).toBe(true)
  await expect(Promise.resolve().then(() => scoped(request, { signal: controllers.init.signal }))).rejects.toBe(reason)
  expect(requests).toHaveLength(1)
})

test.each(["owner", "request", "init"] as const)("scoped fetch races signal-ignoring transport on %s abort and discards late response", async (source) => {
  const controllers = { owner: new AbortController(), request: new AbortController(), init: new AbortController() }
  const started = Promise.withResolvers<void>()
  const response = Promise.withResolvers<Response>()
  const signals: AbortSignal[] = []
  // Deliberately ignores cancellation: the wrapper must settle before this transport does.
  const fetcher = Object.assign(async (_input: string | URL | Request, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal)
    started.resolve()
    return response.promise
  }, { preconnect: fetch.preconnect })
  const scoped = createScopedFetch(fetcher, controllers.owner.signal)
  const pending = scoped(new Request("https://synthetic.invalid", { signal: controllers.request.signal }), {
    signal: controllers.init.signal,
  }).catch((error: unknown) => error)
  await started.promise
  expect(signals).toHaveLength(1)
  const remove = spyOn(signals[0], "removeEventListener")
  try {
    const reason = new Error(`synthetic ${source} disposed during fetch`)
    controllers[source].abort(reason)
    expect(await Promise.race([pending, Bun.sleep(200).then(() => "still fetching")])).toBe(reason)
    expect(signals[0].aborted).toBe(true)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove.mock.calls[0][0]).toBe("abort")
    response.resolve(Response.json({ synthetic: "late response" }))
    expect(await pending).toBe(reason)
  } finally {
    response.resolve(new Response(null))
    remove.mockRestore()
  }
})

test("scoped fetch removes its cancellation listener after successful transport", async () => {
  const lifetime = new AbortController()
  const started = Promise.withResolvers<void>()
  const response = Promise.withResolvers<Response>()
  const signals: AbortSignal[] = []
  const fetcher = Object.assign(async (_input: string | URL | Request, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal)
    started.resolve()
    return response.promise
  }, { preconnect: fetch.preconnect })
  const pending = createScopedFetch(fetcher, lifetime.signal)("https://synthetic.invalid")
  await started.promise
  expect(signals).toHaveLength(1)
  const remove = spyOn(signals[0], "removeEventListener")
  try {
    const value = new Response(null)
    response.resolve(value)
    expect(await pending).toBe(value)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove.mock.calls[0][0]).toBe("abort")
    expect(signals[0].aborted).toBe(false)
  } finally {
    response.resolve(new Response(null))
    remove.mockRestore()
  }
})
