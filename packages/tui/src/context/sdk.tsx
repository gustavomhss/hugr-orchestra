import { Orchestra } from "@orchestra/client"
import { createSessionActions } from "./session-actions"
import { createCatalog } from "./catalog"
import type { GlobalEvent } from "../compat/schema"
import { createSimpleContext } from "./helper"
import { batch, createSignal, onCleanup, onMount } from "solid-js"

export type EventSource = {
  subscribe: (handler: (event: GlobalEvent) => void) => Promise<() => void>
}

export const { use: useSDK, provider: SDKProvider } = createSimpleContext({
  name: "SDK",
  init: (props: {
    url: string
    directory?: string
    fetch?: typeof fetch
    headers?: RequestInit["headers"]
    events?: EventSource
  }) => {
    const abort = new AbortController()
    let sse: AbortController | undefined

    // The V2 client serves session actions, the catalog the store bootstraps from, and the event stream.
    const v2 = Orchestra.make({ baseUrl: props.url, fetch: props.fetch, headers: props.headers })
    const actions = createSessionActions(v2)
    const catalog = createCatalog(v2)
    // True while the event stream is down and being retried. Embedded event sources have no stream to observe.
    const [offline, setOffline] = createSignal(false)

    const handlers = new Set<(event: GlobalEvent) => void>()
    const emitter = {
      emit(_type: "event", event: GlobalEvent) {
        for (const handler of handlers) handler(event)
      },
      on(_type: "event", handler: (event: GlobalEvent) => void) {
        handlers.add(handler)
        return () => {
          handlers.delete(handler)
        }
      },
    }

    let queue: GlobalEvent[] = []
    let timer: Timer | undefined
    let last = 0
    const retryDelay = 1000
    const maxRetryDelay = 30000

    const flush = () => {
      if (queue.length === 0) return
      const events = queue
      queue = []
      timer = undefined
      last = Date.now()
      // Batch all event emissions so all store updates result in a single render
      batch(() => {
        for (const event of events) {
          emitter.emit("event", event)
        }
      })
    }

    const handleEvent = (event: GlobalEvent) => {
      queue.push(event)
      const elapsed = Date.now() - last

      if (timer) return
      // If we just flushed recently (within 16ms), batch this with future events
      // Otherwise, process immediately to avoid latency
      if (elapsed < 16) {
        timer = setTimeout(flush, 16)
        return
      }
      flush()
    }

    function startSSE() {
      sse?.abort()
      const ctrl = new AbortController()
      sse = ctrl
      ;(async () => {
        let attempt = 0
        while (true) {
          if (abort.signal.aborted || ctrl.signal.aborted) break

          // The V2 stream carries native events; the store handlers still take the legacy GlobalEvent envelope.
          await (async () => {
            for await (const event of v2.events.subscribe({ signal: ctrl.signal })) {
              if (ctrl.signal.aborted) break
              setOffline(false)
              handleEvent({
                directory: event.location?.directory ?? props.directory ?? "",
                workspace: event.location?.workspaceID,
                payload: { id: event.id, type: event.type, properties: event.data } as GlobalEvent["payload"],
              })
            }
          })().catch(() => {})
          if (!abort.signal.aborted && !ctrl.signal.aborted) setOffline(true)

          if (timer) clearTimeout(timer)
          if (queue.length > 0) flush()
          attempt += 1
          if (abort.signal.aborted || ctrl.signal.aborted) break

          // Exponential backoff
          const backoff = Math.min(retryDelay * 2 ** (attempt - 1), maxRetryDelay)
          await new Promise((resolve) => setTimeout(resolve, backoff))
        }
      })().catch(() => {})
    }

    onMount(async () => {
      if (props.events) {
        const unsub = await props.events.subscribe(handleEvent)
        onCleanup(unsub)
        return
      }
      startSSE()
    })

    onCleanup(() => {
      abort.abort()
      sse?.abort()
      if (timer) clearTimeout(timer)
      handlers.clear()
    })

    return {
      // The V2 Orchestra client.
      api: v2,
      actions,
      catalog,
      offline,
      directory: props.directory,
      event: emitter,
      fetch: props.fetch ?? fetch,
      url: props.url,
    }
  },
})
