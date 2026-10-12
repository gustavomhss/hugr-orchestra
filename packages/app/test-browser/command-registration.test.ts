import { expect, test } from "bun:test"
import "./real-ui-solid"
import {
  createComponent,
  createMemo,
  createResource,
  createRoot,
  enableScheduling,
  getOwner,
  runWithOwner,
  startTransition,
  Suspense,
} from "solid-js"
import { createStore } from "solid-js/store"

const { CommandProvider, useCommand } = await import("@/context/command")
const { PlatformProvider } = await import("@/context/platform")
const { SettingsProvider } = await import("@/context/settings")
const { LanguageProvider } = await import("@/context/language")
const { DialogProvider } = await import("@orchestra/ui/context/dialog")
const { createCommandRegistration } = await import("@/context/command-registration")

test("real CommandProvider keeps live accessors, removes disposed owners, and survives transition remounts", async () => {
  const shell = provider()
  const selected: string[] = []
  const mount = (id: string, key?: string) =>
    runWithOwner(shell.owner, () =>
      createRoot((dispose) => {
        const [state, setState] = createStore({ title: id })
        const options = () => [{ id, title: state.title, onSelect: () => selected.push(id) }]
        if (key) shell.command.register(key, options)
        if (!key) shell.command.register(options)
        return { dispose, setState }
      }),
    )!
  const base = mount("base", "session")
  const extra = mount("extra")
  expect(shell.command.options.map((option) => option.id)).toEqual(["extra", "base"])
  base.setState("title", "Updated")
  expect(shell.command.options.find((option) => option.id === "base")?.title).toBe("Updated")

  const overlay = mount("overlay", "session")
  expect(shell.command.options.map((option) => option.id)).toEqual(["overlay", "extra"])
  overlay.dispose()
  expect(shell.command.options.map((option) => option.id)).toEqual(["extra", "base"])
  shell.command.trigger("overlay")
  shell.command.trigger("base")
  expect(selected).toEqual(["base"])

  const route = runWithOwner(shell.owner, () =>
    createRoot((dispose) => {
      const [state, setState] = createStore({ session: "route-one" })
      const view = createMemo(() => {
        const session = state.session
        shell.command.register("route", () => [{ id: session, title: session }])
        return session
      })
      return { dispose, setState, view }
    }),
  )!
  expect(route.view()).toBe("route-one")
  await startTransition(() => route.setState("session", "route-two"))
  expect(shell.command.options.map((option) => option.id)).toEqual(["route-two", "extra", "base"])
  route.dispose()
  expect(shell.command.options.map((option) => option.id)).toEqual(["extra", "base"])

  const suspended = runWithOwner(shell.owner, () =>
    createRoot((dispose) => {
      const [state, setState] = createStore({ session: "cold" })
      const pending = { resolve: undefined as (() => void) | undefined }
      createComponent(Suspense, {
        get children() {
          const [resource] = createResource(
            () => state.session,
            (session) =>
              session === "cold"
                ? Promise.resolve(session)
                : new Promise<string>((resolve) => {
                    pending.resolve = () => resolve(session)
                  }),
          )
          return createMemo(() => {
            const session = state.session
            shell.command.register("route", () => [{ id: session, title: session }])
            return resource()
          })
        },
      })
      return { dispose, setState, pending }
    }),
  )!
  await Promise.resolve()
  const transition = startTransition(() => suspended.setState("session", "warm"))
  await Promise.resolve()
  suspended.pending.resolve!()
  await transition
  expect(shell.command.options.map((option) => option.id)).toEqual(["warm", "extra", "base"])
  suspended.dispose()

  await startTransition(() => {
    const remount = mount("remount", "session")
    expect(shell.command.options.map((option) => option.id)).toEqual(["remount", "extra"])
    remount.dispose()
  })
  expect(shell.command.options.map((option) => option.id)).toEqual(["extra", "base"])
  enableScheduling(queueMicrotask)
  const scheduled = { dispose: undefined as (() => void) | undefined }
  await startTransition(() => {
    scheduled.dispose = mount("scheduled", "session").dispose
    expect(shell.command.options.map((option) => option.id)).toEqual(["extra", "base"])
  })
  expect(shell.command.options.map((option) => option.id)).toEqual(["scheduled", "extra"])
  scheduled.dispose!()
  expect(shell.command.options.map((option) => option.id)).toEqual(["extra", "base"])
  enableScheduling(undefined)
  extra.dispose()
  base.dispose()
  expect(shell.command.options).toEqual([])
  shell.dispose()

  const fresh = provider()
  expect(fresh.command.options).toEqual([])
  runWithOwner(fresh.owner, () => fresh.command.register(() => [{ id: "fresh", title: "Fresh" }]))
  expect(fresh.command.options.map((option) => option.id)).toEqual(["fresh"])
  fresh.dispose()
})

test("invalid command callback data still raises rather than becoming an empty registration", () => {
  const shell = provider()
  expect(() =>
    runWithOwner(shell.owner, () =>
      shell.command.register(() => undefined as unknown as import("@/context/command").CommandOption[]),
    ),
  ).toThrow(TypeError)
  shell.dispose()
})

test("registration accessor identity survives Solid store proxies and becomes empty on disposal", () => {
  createRoot((dispose) => {
    const registration = createCommandRegistration("session", () => [{ id: "live", title: "Live" }])
    const [store] = createStore({ entry: registration.entry })
    expect(store.entry).not.toBe(registration.entry)
    expect(store.entry.options).toBe(registration.entry.options)
    expect(store.entry.options()).toEqual([{ id: "live", title: "Live" }])
    registration.dispose()
    expect(store.entry.options()).toEqual([])
    dispose()
  })
})

function provider() {
  return createRoot((dispose) => {
    const scope = {} as { command: ReturnType<typeof useCommand>; owner: NonNullable<ReturnType<typeof getOwner>> }
    createComponent(PlatformProvider, {
      value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
      get children() {
        return createComponent(SettingsProvider, {
          get children() {
            return createComponent(LanguageProvider, {
              locale: "en",
              get children() {
                return createComponent(DialogProvider, {
                  get children() {
                    return createComponent(CommandProvider, {
                      get children() {
                        scope.command = useCommand()
                        scope.owner = getOwner()!
                        return undefined
                      },
                    })
                  },
                })
              },
            })
          },
        })
      },
    })
    return { dispose, ...scope }
  })
}
