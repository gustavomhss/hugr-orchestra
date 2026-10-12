import { expect, test } from "bun:test"
import { createRequire } from "node:module"
import { createComponent, createRoot } from "solid-js"
import { createStore } from "solid-js/store"

const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
const helper = `${Bun.resolveSync("../../ui/src/context/helper.tsx", import.meta.dir)}?model-preferences`
const persist = `${Bun.resolveSync("../src/utils/persist.ts", import.meta.dir)}?model-preferences`
const [state, setState] = createStore({ directory: undefined as string | null | undefined })
Bun.plugin({
  name: "persisted-model-preferences-fixture",
  setup(build) {
    build.onResolve({ filter: /^model-preferences:/ }, (args) => ({
      path: args.path.slice("model-preferences:".length),
      namespace: "model-preferences",
    }))
    build.onLoad({ filter: /.*/, namespace: "model-preferences" }, (args) => ({
      loader: "object",
      exports:
        args.path === "platform"
          ? { usePlatform: () => ({ platform: "web" }) }
          : {
              useProviders: (directory?: () => string | null | undefined) => ({
                connected: () => {
                  const id = directory ? directory() : "/legacy"
                  return id === undefined
                    ? []
                    : [{ id: id ?? "global", name: id ?? "Global", models: { model: { id: "model", name: "Model" } } }]
                },
              }),
            },
    }))
    build.onLoad({ filter: /(?:models\.tsx|helper\.tsx|persist\.ts)\?model-preferences$/ }, async (args) => {
      const source = (await Bun.file(args.path.replace(/\?model-preferences$/, "")).text())
        .replace('"@orchestra/ui/context"', JSON.stringify(helper))
        .replace('"@/utils/persist"', JSON.stringify(persist))
        .replace('"@/hooks/use-providers"', '"model-preferences:providers"')
        .replace('"@/context/platform"', '"model-preferences:platform"')
      if (!args.path.includes(".tsx?")) return { contents: source, loader: "ts" }
      const result = await solid("@babel/core").transformAsync(source, {
        filename: args.path,
        presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
        parserOpts: { plugins: ["jsx", "typescript"] },
        configFile: false,
        babelrc: false,
      })
      return { contents: result.code, loader: "ts" }
    })
  },
})
const { ModelsProvider, ModelPreferencesProvider, useModels }: typeof import("../src/context/models") = await import(
  `${Bun.resolveSync("../src/context/models.tsx", import.meta.dir)}?model-preferences`
)
const { Persist, removePersisted }: typeof import("../src/utils/persist") = await import(persist)

test("parent and nested catalogs share real persisted hide preferences without overwriting each other", async () => {
  removePersisted(Persist.global("model"))
  const values: Array<ReturnType<typeof useModels>> = []
  const dispose = createRoot((dispose) => {
    createComponent(ModelsProvider, {
      get children() {
        values.push(useModels())
        return createComponent(ModelsProvider, {
          directory: () => state.directory,
          get children() {
            values.push(useModels())
            return undefined
          },
        })
      },
    })
    return dispose
  })
  const a = { providerID: "/legacy", modelID: "model" }
  const b = { providerID: "/chosen", modelID: "model" }
  try {
    await values[0].ready.promise
    expect(values[0].list().map((model) => model.provider.id)).toEqual(["/legacy"])
    expect(values[1].list()).toEqual([])
    values[0].setVisibility(a, false)
    expect(values[1].visible(a)).toBe(false)
    setState("directory", "/chosen")
    values[1].setVisibility(b, false)
    expect(values[0].visible(b)).toBe(false)
    expect(values[0].visible(a)).toBe(false)
    expect(JSON.parse(localStorage.getItem("orchestra.global.dat:model") ?? "null").user).toEqual([
      { ...a, visibility: "hide" },
      { ...b, visibility: "hide" },
    ])
    values[1].variant.set(b, "high")
    values[0].setVisibility(a, true)
    expect(values[1].variant.get(b)).toBe("high")
    expect(values[1].visible(a)).toBe(true)
  } finally {
    dispose()
  }
  const restored = createRoot((dispose) => {
    const values: Array<ReturnType<typeof useModels>> = []
    createComponent(ModelPreferencesProvider, {
      get children() {
        return createComponent(ModelsProvider, {
          directory: () => null,
          get children() {
            values.push(useModels())
            return undefined
          },
        })
      },
    })
    return { dispose, values }
  })
  try {
    await restored.values[0].ready.promise
    expect(restored.values[0].visible(a)).toBe(true)
    expect(restored.values[0].visible(b)).toBe(false)
    expect(restored.values[0].variant.get(b)).toBe("high")
    expect(restored.values[0].list().map((model) => model.provider.id)).toEqual(["global"])
  } finally {
    restored.dispose()
    removePersisted(Persist.global("model"))
  }
})
