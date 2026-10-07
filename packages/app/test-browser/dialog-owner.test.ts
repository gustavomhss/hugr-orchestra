import { describe, expect, test } from "bun:test"
import { createRequire } from "node:module"
import { createComponent, createRoot, getOwner, runWithOwner, type Owner } from "solid-js"

// Bun compiles .tsx with the React JSX transform, so compile the dialog context with the app's own
// Solid compiler. A distinct specifier keeps a React-compiled copy loaded by another test file out.
const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
Bun.plugin({
  name: "solid-dialog-context",
  setup(build) {
    build.onLoad({ filter: /[\\/]packages[\\/]ui[\\/]src[\\/]context[\\/]dialog\.tsx\?solid$/ }, async (args) => {
      const result = await solid("@babel/core").transformAsync(
        await Bun.file(args.path.replace(/\?solid$/, "")).text(),
        {
          filename: args.path,
          presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
          parserOpts: { plugins: ["jsx", "typescript"] },
          configFile: false,
          babelrc: false,
        },
      )
      return { contents: result.code, loader: "ts" }
    })
  },
})
const { DialogProvider, useDialog }: typeof import("@opencode-ai/ui/context/dialog") = await import(
  `${Bun.resolveSync("@opencode-ai/ui/context/dialog", import.meta.dir)}?solid`
)

describe("owned dialogs", () => {
  test("a stale owner or disposer cannot remove a newer owner's dialog", async () => {
    const shell = provider()
    const first = shell.consumer()
    const second = shell.consumer()
    const view = shell.consumer()
    const stale = { dispose: undefined as (() => void) | undefined }
    await first.dialog.showOwned((dispose) => {
      stale.dispose = dispose
      return document.createElement("div")
    })
    expect(view.dialog.active?.owner).toBe(first.owner)
    await second.dialog.showOwned(() => document.createElement("div"))
    const current = view.dialog.active
    expect(current?.owner).toBe(second.owner)

    expect(stale.dispose).toBeDefined()
    stale.dispose?.()
    first.dispose()
    expect(view.dialog.active).toBe(current)

    // Positive control: the owner of the current dialog does remove it.
    second.dispose()
    expect(view.dialog.active).toBeUndefined()
    shell.dispose()
  })

  test("removing one dialog keeps the others", async () => {
    const shell = provider()
    const base = shell.consumer()
    const view = shell.consumer()
    const top = { dispose: undefined as (() => void) | undefined }
    await base.dialog.showOwned(() => document.createElement("div"))
    const bottom = view.dialog.active
    await view.dialog.push((dispose) => {
      top.dispose = dispose
      return document.createElement("div")
    })
    const above = view.dialog.active
    expect(above).not.toBe(bottom)

    base.dispose()
    expect(view.dialog.active).toBe(above)

    top.dispose?.()
    expect(view.dialog.active).toBeUndefined()
    shell.dispose()
  })
})

// Each consumer is its own root under the provider, so tests can dispose owners independently.
function provider() {
  return createRoot((dispose) => {
    const scope = { owner: undefined as Owner | null | undefined }
    createComponent(DialogProvider, {
      get children() {
        scope.owner = getOwner()
        return undefined
      },
    })
    return {
      dispose,
      consumer: () =>
        runWithOwner(scope.owner!, () =>
          createRoot((dispose) => ({ dialog: useDialog(), owner: getOwner(), dispose })),
        )!,
    }
  })
}
