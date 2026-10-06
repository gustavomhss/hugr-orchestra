import { expect, test } from "bun:test"
import { createRequire } from "node:module"
import path from "node:path"
import { createComponent, render } from "solid-js/web"
import type { AtOption } from "@/components/prompt-input/slash-popover"

// Bun compiles JSX for React, and other test files may already have loaded the UI components that way. Compile the
// popover and every .tsx it imports with Solid's own Babel preset under a ?solid specifier, so this test renders its own
// Solid copies of the real @-mention picker.
const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
Bun.plugin({
  name: "solid-prompt-popover",
  setup(build) {
    build.onLoad({ filter: /\.tsx\?solid$/ }, async (args) => {
      const file = args.path.replace(/\?solid$/, "")
      const result = await solid("@babel/core").transformAsync(await Bun.file(file).text(), {
        filename: file,
        presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
        parserOpts: { plugins: ["jsx", "typescript"] },
        configFile: false,
        babelrc: false,
      })
      const contents = result.code.replace(
        /(from\s+)(["'])([^"']+)\2/g,
        (match: string, lead: string, _quote: string, spec: string) => {
          const resolved = Bun.resolveSync(spec, path.dirname(file))
          // JSON-quote the path: Windows paths carry backslashes that a raw string literal would read as escapes.
          return resolved.endsWith(".tsx") ? `${lead}${JSON.stringify(`${resolved}?solid`)}` : match
        },
      )
      return { contents, loader: "ts" }
    })
  },
})
const { PromptPopover }: typeof import("@/components/prompt-input/slash-popover") = await import(
  `${Bun.resolveSync("@/components/prompt-input/slash-popover", import.meta.dir)}?solid`
)

// F1.11: a renamed seat is listed by its label and picked by its stable id, which the prompt part sends.
test("the @ picker shows a renamed seat's label and selects its id", () => {
  // Solid delegates click handlers to the document, so the picker must be attached to it.
  const host = document.body.appendChild(document.createElement("div"))
  const selected: AtOption[] = []
  const options: AtOption[] = [{ type: "agent", name: "backend", display: "Pikachu" }]
  const dispose = render(
    () =>
      createComponent(PromptPopover, {
        popover: "at",
        setSlashPopoverRef: () => {},
        atFlat: options,
        atKey: (item) => (item.type === "file" ? item.path : `${item.type}:${item.name}`),
        setAtActive: () => {},
        onAtSelect: (item) => selected.push(item),
        slashFlat: [],
        setSlashActive: () => {},
        onSlashSelect: () => {},
        slashMenu: false,
        slashMenuQuery: "",
        onSlashMenuInput: () => {},
        onSlashMenuKeyDown: () => {},
        commandKeybind: () => undefined,
        commandKeybindParts: () => [],
        newLayoutDesigns: true,
        t: (key) => key,
      }),
    host,
  )
  try {
    const button = host.querySelector("button")
    expect(button?.textContent).toBe("@Pikachu")
    button?.click()
    expect(selected.map((item) => item.name)).toEqual(["backend"])
  } finally {
    dispose()
    host.remove()
  }
})
