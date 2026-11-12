/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { ArgsProvider } from "../../../../src/context/args"
import { KVProvider, useKV } from "../../../../src/context/kv"
import { ProjectProvider, useProject } from "../../../../src/context/project"
import { SDKProvider, useSDK, type EventSource } from "../../../../src/context/sdk"
import type { GlobalEvent } from "../../../../src/types"
import { SyncProvider, useSync } from "../../../../src/context/sync"
import { PermissionProvider } from "../../../../src/context/permission"
import { ExitProvider } from "../../../../src/context/exit"
import { createEventSource, createFetch, type FetchHandler, directory } from "../../../fixture/tui-sdk"
import { TestTuiContexts } from "../../../fixture/tui-environment"
import { json } from "../../../fixture/tui-sdk"
export { createEventSource, createFetch, directory, eventSource, json, worktree } from "../../../fixture/tui-sdk"

export async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

type Ctx = { kv: ReturnType<typeof useKV>; project: ReturnType<typeof useProject>; sync: ReturnType<typeof useSync> }

export async function mount(
  override?: FetchHandler,
  state?: string,
  args?: { auto?: boolean },
  transport?: { url: string },
  options?: {
    waitComplete?: boolean
    delaySync?: boolean
    events?: EventSource
  },
) {
  const requests: URL[] = []
  const calls = createFetch((url) => {
    requests.push(url)
    const result = override?.(url)
    if (result) return result
    if (url.pathname === "/api/permission/request" || url.pathname === "/api/question/request")
      return json({ data: [] })
  })
  const events = createEventSource()
  let sync!: ReturnType<typeof useSync>
  let project!: ReturnType<typeof useProject>
  let kv!: ReturnType<typeof useKV>
  let sdk!: ReturnType<typeof useSDK>
  const received: GlobalEvent[] = []
  const mounts = { count: 0 }
  let done!: () => void
  const ready = new Promise<void>((resolve) => {
    done = resolve
  })
  const sdkReady = Promise.withResolvers<void>()
  const [lifecycle, setLifecycle] = createStore({ sync: !options?.delaySync })

  function Probe() {
    const ctx: Ctx = { kv: useKV(), project: useProject(), sync: useSync() }
    mounts.count++
    onMount(() => {
      sync = ctx.sync
      project = ctx.project
      kv = ctx.kv
      done()
    })
    return <box />
  }

  function SDKProbe() {
    sdk = useSDK()
    onCleanup(sdk.event.on("event", (event) => received.push(event)))
    onMount(() => sdkReady.resolve())
    return (
      <Show when={lifecycle.sync}>
        <SyncProvider>
          <Probe />
        </SyncProvider>
      </Show>
    )
  }

  const app = await testRender(() => (
    <TestTuiContexts paths={state ? { state } : undefined}>
      <ArgsProvider auto={args?.auto}>
        <KVProvider>
          <SDKProvider
            url={transport?.url ?? "http://test"}
            directory={directory}
            fetch={transport ? fetch : calls.fetch}
            events={options?.events ?? (transport ? undefined : events.source)}
          >
            <PermissionProvider>
              <ProjectProvider>
                <ExitProvider exit={() => {}}>
                  <SDKProbe />
                </ExitProvider>
              </ProjectProvider>
            </PermissionProvider>
          </SDKProvider>
        </KVProvider>
      </ArgsProvider>
    </TestTuiContexts>
  ))

  await sdkReady.promise
  if (!options?.delaySync) await ready
  if (!options?.delaySync && options?.waitComplete !== false)
    await wait(() => sync.status === "complete").catch((error) => {
      console.error("sync fixture bootstrap did not complete", {
        status: sync.status,
        offline: sdk.offline(),
        received: received.map((event) => event.payload.type),
      })
      app.renderer.destroy()
      throw error
    })
  return {
    app,
    emit: events.emit,
    get kv() {
      return kv
    },
    get project() {
      return project
    },
    get sync() {
      return sync
    },
    sdk,
    received,
    mounts,
    requests,
    session: calls.session,
    async startSync() {
      setLifecycle("sync", true)
      await ready
    },
  }
}
