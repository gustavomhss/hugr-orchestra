import { beforeAll, expect, mock, test } from "bun:test"
import { createRequire } from "node:module"
import { createComponent, createRenderEffect, createSignal, Suspense, type JSX } from "solid-js"
import { render } from "solid-js/web"
import type { RenderDiff } from "@/pages/session/v2/review-diff-kinds"

let ReviewPanelV2: typeof import("@/pages/session/v2/review-panel-v2").ReviewPanelV2

beforeAll(async () => {
  const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
  Bun.plugin({
    name: "solid-review-recovery",
    setup(build) {
      build.onLoad({ filter: /review-panel-v2\.tsx\?recovery$/ }, async (args) => {
        const file = args.path.replace(/\?recovery$/, "")
        const result = await solid("@babel/core").transformAsync(await Bun.file(file).text(), {
          filename: file,
          presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
          parserOpts: { plugins: ["jsx", "typescript"] },
          configFile: false,
          babelrc: false,
        })
        return { contents: result.code, loader: "ts" }
      })
    },
  })
  mock.module("@/context/sdk", () => ({
    useSDK: () => () => ({ client: { file: { read: async () => ({ data: "" }) } } }),
  }))
  mock.module("@/context/language", () => ({ useLanguage: () => ({ t: () => "" }) }))
  mock.module("@orchestra/ui/button", () => ({
    Button: (props: { onClick: () => void; children: string }) => {
      const button = document.createElement("button")
      button.textContent = props.children
      button.onclick = props.onClick
      return button
    },
  }))
  mock.module("@orchestra/session-ui/v2/session-review-v2", () => ({
    SESSION_REVIEW_V2_SIDEBAR_WIDTH_MAX: 400,
    SESSION_REVIEW_V2_SIDEBAR_WIDTH_MIN: 150,
    SessionReviewV2: (props: { sidebar: JSX.Element; preview: JSX.Element }) => [props.sidebar, props.preview],
    SessionReviewV2Sidebar: (props: { children: JSX.Element }) => props.children,
  }))
  mock.module("@/components/file-tree-v2", () => ({
    kindLabel: (kind: string) => kind,
    kindChange: (kind: string) => kind,
    default: (props: { allowed: string[]; onFileClick: (node: { path: string }) => void }) => {
      const list = document.createElement("aside")
      props.allowed.forEach((file) => {
        const button = document.createElement("button")
        button.textContent = file
        button.onclick = () => props.onFileClick({ path: file })
        list.append(button)
      })
      return list
    },
  }))
  mock.module("@orchestra/session-ui/v2/session-review-file-preview-v2", () => ({
    SessionReviewFilePreviewV2: (props: { diff: RenderDiff }) => {
      const preview = document.createElement("pre")
      createRenderEffect(() => {
        preview.textContent = props.diff.patch ?? "incomplete detail"
      })
      return preview
    },
  }))
  const module = await import(`${Bun.resolveSync("@/pages/session/v2/review-panel-v2", import.meta.dir)}?recovery`)
  ReviewPanelV2 = module.ReviewPanelV2
})

function fixture() {
  const files = ["a.ts", "b.ts"].map((file) => ({ file, additions: 1, deletions: 1, status: "modified" as const }))
  const jobs: { file: string; pending: PromiseWithResolvers<RenderDiff | undefined> }[] = []
  const host = document.body.appendChild(document.createElement("div"))
  const [active, select] = createSignal("a.ts")
  const dispose = render(
    () =>
      createComponent(Suspense, {
        fallback: "route suspended",
        get children() {
          return createComponent(ReviewPanelV2, {
            diffs: () => files,
            diffsReady: () => true,
            diffVersion: 1,
            get activeFile() {
              return active()
            },
            onSelectFile: select,
            diffStyle: "split",
            loadDiff: (file) => {
              const pending = Promise.withResolvers<RenderDiff | undefined>()
              jobs.push({ file, pending })
              return pending.promise
            },
            state: {
              sidebarOpened: () => true,
              sidebarWidth: () => 240,
              sidebarTransition: Object.assign(() => true, { promise: Promise.resolve() }),
              filter: () => "",
              setFilter: () => "",
              expandMode: () => "collapse",
              setExpandMode: () => undefined,
              resizeSidebar: () => undefined,
              toggleSidebar: () => undefined,
            },
          })
        },
      }),
    host,
  )
  return {
    host,
    jobs,
    select,
    dispose: () => {
      dispose()
      host.remove()
    },
    full: (file: string) => ({ ...files[0], file, patch: `@@ -1 +1 @@\n-before\n+${file} recovered\n` }),
  }
}

test("detail rejection stays local, preserves list, and retry replaces the incomplete preview", async () => {
  const view = fixture()
  const list = view.host.querySelector("aside")
  expect(list?.textContent).toBe("a.tsb.ts")
  expect(view.host.textContent).not.toContain("route suspended")
  view.jobs[0].pending.reject(new Error("detail unavailable"))
  await Promise.resolve()
  const error = view.host.querySelector('[role="alert"]')
  expect(error?.textContent).toContain("Could not load changes for a.ts.")
  expect(view.host.querySelector("aside")).toBe(list)
  error?.querySelector("button")?.click()
  expect(view.jobs.map((job) => job.file)).toEqual(["a.ts", "a.ts"])
  view.jobs[1].pending.resolve(view.full("a.ts"))
  await Promise.resolve()
  expect(view.host.querySelector('[role="alert"]')).toBeNull()
  expect(view.host.querySelector("pre")?.textContent).toContain("a.ts recovered")
  expect(view.host.querySelector("aside")).toBe(list)
  view.dispose()
})

test("a late detail failure cannot replace the next selected file", async () => {
  const view = fixture()
  view.select("b.ts")
  expect(view.jobs.map((job) => job.file)).toEqual(["a.ts", "b.ts"])
  view.jobs[1].pending.resolve(view.full("b.ts"))
  await Promise.resolve()
  view.jobs[0].pending.reject(new Error("old failure"))
  await Promise.resolve()
  expect(view.host.querySelector("pre")?.textContent).toContain("b.ts recovered")
  expect(view.host.querySelector('[role="alert"]')).toBeNull()
  view.dispose()
})

test("an incomplete detail response is a retryable error", async () => {
  const view = fixture()
  view.jobs[0].pending.resolve(undefined)
  await Promise.resolve()
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain("Could not load changes for a.ts.")
  expect(view.host.querySelector("pre")).toBeNull()
  view.dispose()
})
