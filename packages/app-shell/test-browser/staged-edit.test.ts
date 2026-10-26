import { expect, test } from "bun:test"
import { solidDom } from "./real-ui-solid"
import { createComponent } from "solid-js"
import { render } from "solid-js/web"
import { createStore } from "solid-js/store"
import type { ComponentProps, JSX } from "solid-js"

const { ToolRegistry }: typeof import("@orchestra/session-ui/message-part") = await import(solidDom("@orchestra/session-ui/message-part", import.meta.dir))
const { FileComponentProvider }: typeof import("@orchestra/ui/context/file") = await import(solidDom("@orchestra/ui/context/file", import.meta.dir))
const { I18nProvider }: typeof import("@orchestra/ui/context/i18n") = await import(solidDom("@orchestra/ui/context/i18n", import.meta.dir))
const { EDIT_REVIEW_COPY }: typeof import("@orchestra/ui/i18n/edit-review") = await import(solidDom("@orchestra/ui/i18n/edit-review", import.meta.dir))
const { DataProvider }: typeof import("@orchestra/session-ui/context") = await import(solidDom("@orchestra/session-ui/context", import.meta.dir))

test("real generic Edit renderer holds staged edits without filediff metadata and restores an unstaged diff", () => {
  const Edit = ToolRegistry.render("edit")!
  expect(Edit).toBeDefined()
  const host = document.body.appendChild(document.createElement("div"))
  const rendered: Record<string, unknown>[] = []
  const [state, setState] = createStore({
    metadata: { staged: true } as {
      staged: boolean
      filediff?: { file: string; before: string; after: string; additions: number; deletions: number }
    },
  })
  const dispose = render(
    () =>
      withData(() =>
        createComponent(FileComponentProvider, {
          component: (props: Record<string, unknown>) => {
            rendered.push(props)
            const diff = document.createElement("div")
            diff.dataset.testid = "real-diff-control"
            return diff
          },
          get children() {
            return createComponent(Edit, {
              tool: "edit",
              status: "completed",
              input: { filePath: "/workspace/file.ts", oldString: "old", newString: "new" },
              get metadata() {
                return state.metadata
              },
              defaultOpen: true,
              deferContent: false,
            })
          },
        }),
      ),
    host,
  )
  try {
    expect(host.textContent).toContain("Awaiting review")
    expect(host.querySelector('[data-component="edit-content"]')).toBeNull()
    expect(rendered).toHaveLength(0)

    setState("metadata", "filediff", {
      file: "/workspace/file.ts",
      before: "old\n",
      after: "new\n",
      additions: 1,
      deletions: 1,
    })
    expect(host.textContent).toContain("Awaiting review")
    expect(host.querySelector('[data-component="diff-changes"]')).toBeNull()
    expect(rendered).toHaveLength(0)

    setState("metadata", "staged", false)
    expect(host.textContent).not.toContain("Awaiting review")
    expect(host.querySelector('[data-component="diff-changes"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="real-diff-control"]')).not.toBeNull()
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.at(-1)?.mode).toBe("diff")
    expect(rendered.at(-1)?.fileDiff).toBeDefined()

    setState("metadata", "filediff", undefined)
    expect(host.querySelector('[data-testid="real-diff-control"]')).not.toBeNull()
    expect(rendered.at(-1)?.before).toMatchObject({ name: "/workspace/file.ts", contents: "old" })
    expect(rendered.at(-1)?.after).toMatchObject({ name: "/workspace/file.ts", contents: "new" })

    setState("metadata", "staged", true)
    expect(host.textContent).toContain("Awaiting review")
    expect(host.querySelector('[data-testid="real-diff-control"]')).toBeNull()
  } finally {
    dispose()
    host.remove()
  }
})

test("staged Edit uses translated feature copy through the shared i18n provider", () => {
  const Edit = ToolRegistry.render("edit")!
  const keys: string[] = []
  const host = document.body.appendChild(document.createElement("div"))
  const value: ComponentProps<typeof I18nProvider>["value"] = {
    locale: () => "en",
    t: (key) => {
      keys.push(key)
      return key === "ui.messagePart.edit.awaitingReview" ? "Translated held edit" : key
    },
    plural: (key) => key,
  }
  const dispose = render(
    () =>
      withData(() =>
        createComponent(I18nProvider, {
          value,
          get children() {
            return createComponent(FileComponentProvider, {
              component: () => {
                throw new Error("A held edit must not render a file diff")
              },
              get children() {
                return createComponent(Edit, {
                  tool: "edit",
                  status: "completed",
                  metadata: { staged: true },
                  input: { filePath: "/workspace/file.ts" },
                })
              },
            })
          },
        }),
      ),
    host,
  )
  try {
    expect(host.textContent).toContain("Translated held edit")
    expect(keys).toContain("ui.messagePart.edit.awaitingReview")
    expect(EDIT_REVIEW_COPY["ui.messagePart.edit.awaitingReview"]).toBe("Awaiting review")
  } finally {
    dispose()
    host.remove()
  }
})

function withData(children: () => JSX.Element) {
  return createComponent(DataProvider, {
    directory: "/workspace",
    data: { session: [], session_status: {}, message: {}, part: {} },
    get children() {
      return children()
    },
  })
}
