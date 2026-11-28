import { Orchestra } from "@orchestra/client"
import { createSessionActions } from "./session-actions"
import { createCatalog } from "./catalog"
import type { GlobalEvent } from "../types"
import { createSimpleContext } from "./helper"
import { isDemoRequest } from "./demo"
import { batch, createSignal, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"

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
    const transportBinding = { url: props.url, directory: props.directory, fetch: props.fetch,
      headers: JSON.stringify([...new Headers(props.headers).entries()]) }
    let sse: AbortController | undefined

    // The V2 client serves session actions, the catalog the store bootstraps from, and the event stream.
    const v2 = Orchestra.make({ baseUrl: props.url, fetch: props.fetch, headers: props.headers })
    const actions = createSessionActions(v2)
    const catalog = createCatalog(v2)
    // True while the event stream is down and being retried. Embedded event sources have no stream to observe.
    const [offline, setOffline] = createSignal(false)
    const [connectionEpoch, setConnectionEpoch] = createSignal(0)
    const [globalModelEpoch, setGlobalModelEpoch] = createSignal(0)
    const [modelEpochs, setModelEpochs] = createStore<Record<string, number>>({})

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

    const handleEvent = (event: GlobalEvent, hasLocation = true) => {
      if (abort.signal.aborted) return
      if (event.payload.type === "catalog.updated" || event.payload.type === "integration.connection.updated") {
        if (!hasLocation || (event.workspace === undefined && (!event.directory || event.directory === "global"))) {
          setGlobalModelEpoch((value) => value + 1)
        } else {
          setModelEpochs(JSON.stringify([event.directory, event.workspace]), (value) => (value ?? 0) + 1)
        }
      }
      // Recovery owners may mount after this greeting, and all observers must see its new epoch.
      if (event.payload.type === "server.connected") setConnectionEpoch((value) => value + 1)
      queue.push(event)
      // Selection and placement changes immediately affect whether a pending Send can write.
      if (event.payload.type === "session.next.agent.switched" || event.payload.type === "session.next.model.switched" ||
          event.payload.type === "session.next.moved" || event.payload.type === "session.next.deleted") {
        if (timer) clearTimeout(timer)
        flush()
        return
      }
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
              batch(() => {
                setOffline(false)
                handleEvent({
                  directory: event.location?.directory ?? props.directory ?? "",
                  workspace: event.location?.workspaceID,
                  durable: event.durable,
                  payload: { id: event.id, type: event.type, data: event.data } as GlobalEvent["payload"],
                }, event.location !== undefined)
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

    function releaseEvents(release: () => void, phase: "dispose" | "late") {
      try {
        release()
      } catch {
        // A delegated cleanup cannot prevent our own teardown or reject an unobserved subscription continuation.
        console.error("tui event unsubscribe failed", { phase })
      }
    }

    let unsubscribe: (() => void) | undefined
    onMount(() => {
      const source = props.events
      if (source) {
        void Promise.resolve().then(() => source.subscribe(handleEvent)).then((release) => {
          if (abort.signal.aborted) return releaseEvents(release, "late")
          unsubscribe = release
        }, (error) => {
          if (!abort.signal.aborted) console.error("tui event subscription failed", error)
        })
        return
      }
      startSSE()
    })

    onCleanup(() => {
      abort.abort()
      sse?.abort()
      if (timer) clearTimeout(timer)
      handlers.clear()
      queue = []
      const release = unsubscribe
      unsubscribe = undefined
      if (release) releaseEvents(release, "dispose")
    })

    // Replies to the requests the mini-mode demo made up are answered here instead of by the server.
    const answerLocally = (type: string, data: Record<string, unknown>) =>
      emitter.emit("event", {
        directory: props.directory ?? "",
        payload: { id: `demo_evt_${type}`, type, data },
      } as GlobalEvent)
    const api = {
      ...v2,
      permissions: {
        ...v2.permissions,
        reply: (input: Parameters<typeof v2.permissions.reply>[0], options?: Parameters<typeof v2.permissions.reply>[1]) =>
          isDemoRequest(input.requestID)
            ? Promise.resolve(
                answerLocally("permission.v2.replied", { sessionID: input.sessionID, requestID: input.requestID, reply: input.reply }),
              )
            : v2.permissions.reply(input, options),
      },
      questions: {
        ...v2.questions,
        reply: (input: Parameters<typeof v2.questions.reply>[0], options?: Parameters<typeof v2.questions.reply>[1]) =>
          isDemoRequest(input.requestID)
            ? Promise.resolve(
                answerLocally("question.v2.replied", { sessionID: input.sessionID, requestID: input.requestID, answers: input.answers }),
              )
            : v2.questions.reply(input, options),
        reject: (input: Parameters<typeof v2.questions.reject>[0], options?: Parameters<typeof v2.questions.reject>[1]) =>
          isDemoRequest(input.requestID)
            ? Promise.resolve(answerLocally("question.v2.rejected", { sessionID: input.sessionID, requestID: input.requestID }))
            : v2.questions.reject(input, options),
      },
    }

    return {
      // The V2 Orchestra client.
      api,
      actions,
      catalog,
      offline,
      connectionEpoch,
      modelExecutionEpoch(location: { directory?: string; workspace?: string } = { directory: props.directory }) {
        return globalModelEpoch() + (modelEpochs[JSON.stringify([location.directory, location.workspace])] ?? 0)
      },
      binding: () => ({ url: props.url, directory: props.directory, headers: props.headers, fetch: props.fetch,
        active: props.url === transportBinding.url && props.directory === transportBinding.directory &&
          props.fetch === transportBinding.fetch && JSON.stringify([...new Headers(props.headers).entries()]) === transportBinding.headers }),
      directory: props.directory,
      event: emitter,
      fetch: props.fetch ?? fetch,
      url: props.url,
    }
  },
})
