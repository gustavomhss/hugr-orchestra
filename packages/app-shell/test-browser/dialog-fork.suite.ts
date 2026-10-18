import { beforeAll, beforeEach, expect, mock, test } from "bun:test"
import { createRequire } from "node:module"
import { createComponent, createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createPromptState } from "@/context/prompt-state"
import { base64Encode } from "@orchestra/core/util/encode"

const sourceServer = "http://source.invalid"
const [route, setRoute] = createStore({ scope: "source", id: "original", pathname: "/source/original" })
const requested: unknown[] = []
const navigated: string[] = []
const restored: { scope: string; id?: string }[] = []
let fork = Promise.withResolvers<{ id: string }>()
let target = createPromptState()
let closed = 0
let select: (item: { id: string; text: string; time: string }) => Promise<void> | undefined
let DialogFork: typeof import("@/components/dialog-fork").DialogFork

beforeAll(async () => {
  const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
  Bun.plugin({
    name: "solid-fork-regression",
    setup(build) {
      build.onLoad({ filter: /dialog-fork\.tsx\?recovery$/ }, async (args) => {
        const file = args.path.replace(/\?recovery$/, "")
        const compiled = await solid("@babel/core").transformAsync(await Bun.file(file).text(), {
          filename: file,
          presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
          parserOpts: { plugins: ["jsx", "typescript"] },
          configFile: false,
          babelrc: false,
        })
        return { contents: compiled.code, loader: "ts" }
      })
    },
  })
  const source = {
    scope: "source",
    directory: "/shared/repo",
    api: {
      session: {
        fork: (input: unknown) => {
          requested.push(input)
          return fork.promise
        },
      },
    },
  }
  mock.module("@solidjs/router", () => ({
    useNavigate: () => (href: string) => navigated.push(href),
    useParams: () => ({
      get id() {
        return route.id
      },
    }),
    useLocation: () => ({
      get pathname() {
        return route.pathname
      },
    }),
  }))
  mock.module("@/context/sdk", () => ({
    useSDK: () => () => (route.scope === "source" ? source : { ...source, scope: "other" }),
  }))
  mock.module("@/context/server-sdk", () => ({
    useServerSDK: () => () => ({
      server: { type: "http", http: { url: route.scope === "source" ? sourceServer : "http://other.invalid" } },
    }),
  }))
  mock.module("@/context/sync", () => ({
    useSync: () => () => ({
      data: {
        message: { original: [{ id: "message", role: "user", time: { created: 1 } }] },
        part: {
          message: [
            { type: "text", text: "Fork source text", id: "part", messageID: "message", sessionID: "original" },
          ],
        },
      },
    }),
  }))
  mock.module("@/context/prompt", () => ({
    usePrompt: () => ({
      capture: (scope: { id?: string }) => {
        restored.push({ scope: route.scope, id: scope.id })
        return target
      },
    }),
  }))
  mock.module("@/context/language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }))
  mock.module("@/utils/toast", () => ({ showToast: () => undefined }))
  mock.module("@orchestra/ui/context/dialog", () => ({
    useDialog: () => ({
      close: () => {
        closed++
      },
    }),
  }))
  mock.module("@orchestra/ui/dialog", () => ({ Dialog: (props: { children: unknown }) => props.children }))
  mock.module("@orchestra/ui/list", () => ({
    List: (props: { onSelect: typeof select }) => {
      select = props.onSelect
      return null
    },
  }))
  const module = await import(`${Bun.resolveSync("@/components/dialog-fork", import.meta.dir)}?recovery`)
  DialogFork = module.DialogFork
})

beforeEach(() => {
  setRoute({ scope: "source", id: "original", pathname: "/source/original" })
  requested.length = 0
  navigated.length = 0
  restored.length = 0
  closed = 0
  fork = Promise.withResolvers<{ id: string }>()
  target = createPromptState()
})

test("fork restores into its own session and navigates the captured server route", async () => {
  const dispose = createRoot((dispose) => {
    createComponent(DialogFork, {})
    return dispose
  })
  const pending = select({ id: "message", text: "Fork source text", time: "" })
  fork.resolve({ id: "forked" })
  await pending
  expect(requested).toEqual([{ sessionID: "original", messageID: "message" }])
  expect(restored).toEqual([{ scope: "source", id: "forked" }])
  expect(target.current()[0]).toMatchObject({ content: "Fork source text" })
  expect(navigated).toEqual([`/server/${base64Encode(sourceServer)}/session/forked`])
  expect(closed).toBe(1)
  dispose()
})

test("a late fork cannot restore, close a new dialog, or navigate after a server change", async () => {
  const dispose = createRoot((dispose) => {
    createComponent(DialogFork, {})
    return dispose
  })
  const pending = select({ id: "message", text: "Fork source text", time: "" })
  setRoute({ scope: "other", pathname: "/other/original" })
  fork.resolve({ id: "forked" })
  await pending
  expect(restored).toEqual([])
  expect(navigated).toEqual([])
  expect(closed).toBe(0)
  dispose()
})

test("a dismissed fork dialog ignores its late completion", async () => {
  const dispose = createRoot((dispose) => {
    createComponent(DialogFork, {})
    return dispose
  })
  const pending = select({ id: "message", text: "Fork source text", time: "" })
  dispose()
  fork.resolve({ id: "forked" })
  await pending
  expect(restored).toEqual([])
  expect(navigated).toEqual([])
  expect(closed).toBe(0)
})
