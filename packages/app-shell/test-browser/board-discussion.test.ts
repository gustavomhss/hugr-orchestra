import { afterEach, expect, test } from "bun:test"
import type { Page } from "@/orchestra/chapters/board/model"
import { createComponent, createStore, render } from "./lean-dom.test-helper"
import { solidDom } from "./solid-dom"

const { IssueDiscussion }: typeof import("@/orchestra/chapters/board/discussion") = await import(
  solidDom("@/orchestra/chapters/board/discussion", import.meta.dir)
)
const { LanguageProvider }: typeof import("@/context/language") = await import(
  solidDom("@/context/language", import.meta.dir)
)
const { PlatformProvider }: typeof import("@/context/platform") = await import(
  solidDom("@/context/platform", import.meta.dir)
)

const mounted: (() => void)[] = []
afterEach(() => mounted.splice(0).forEach((dispose) => dispose()))

function note(id: string, kind: Page["notes"][number]["kind"], body: string, timeCreated = 1): Page["notes"][number] {
  return { id, kind, body, issue: 10, author: kind ? "backend" : "owner", timeCreated }
}

function mount(notes: Page["notes"]) {
  const [state, setState] = createStore({ issue: "ORCH-10", notes })
  const host = document.createElement("div")
  document.body.appendChild(host)
  const dispose = render(
    () =>
      createComponent(PlatformProvider, {
        value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
        get children() {
          return createComponent(LanguageProvider, {
            locale: "en",
            get children() {
              return createComponent(IssueDiscussion, {
                get issueID() {
                  return state.issue
                },
                get notes() {
                  return state.notes
                },
                time: (value) => `time ${value}`,
                get children() {
                  return document.createElement("textarea")
                },
              })
            },
          })
        },
      }),
    host,
  )
  mounted.push(() => {
    dispose()
    host.remove()
  })
  const button = (label: string) => {
    const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.getAttribute("aria-label") === label || button.textContent?.trim() === label,
    )
    if (!found) throw new Error(`Button not found: ${label}\n${host.innerHTML}`)
    return found
  }
  return { host, button, setState }
}

test("comments and execution records have separate counts and no generated summary", () => {
  const view = mount([
    note("comment", null, "Please cover the Windows build.", 4),
    note("brief", "brief", "Private implementation packet", 2),
    note("return", "return", "The change is ready for review.", 3),
  ])
  expect(view.host.querySelector('[data-channel="comments"]')?.textContent).toContain("1")
  expect(view.host.querySelector('[data-channel="execution"]')?.textContent).toContain("2")
  expect(view.host.textContent).toContain("Please cover the Windows build.")
  expect(view.host.textContent).not.toContain("Private implementation packet")
  view.button("Execution").click()
  expect([...view.host.querySelectorAll("[data-note-id]")].map((row) => row.getAttribute("data-note-id"))).toEqual([
    "return",
    "brief",
  ])
  expect(view.host.textContent).not.toContain("Please cover the Windows build.")
  expect(view.host.querySelector("textarea")).not.toBeNull()
})

test("large records stay out of the list DOM; opening a record replaces the list with a reader", () => {
  const body = `Report introduction\n${"A long technical line.\n".repeat(600)}END_OF_REPORT`
  const view = mount([note("report", "return", body), note("brief", "brief", "Earlier brief", 0)])
  expect(view.host.querySelector('[data-channel="execution"][aria-pressed="true"]')).not.toBeNull()
  expect(view.host.textContent).not.toContain("END_OF_REPORT")
  view.host.querySelector<HTMLButtonElement>('[data-note-id="report"] button')!.click()
  expect(view.host.querySelector(".board-discussion-reader")?.textContent).toContain("END_OF_REPORT")
  expect(view.host.querySelector(".board-discussion-list")).toBeNull()
  view.button("Back to records").click()
  expect(view.host.querySelector(".board-discussion-reader")).toBeNull()
  expect(view.host.querySelector(".board-discussion-list")).not.toBeNull()
})

test("older records are deliberately revealed, and a different issue resets the reader and page", () => {
  const view = mount(Array.from({ length: 9 }, (_, index) => note(`n${index}`, "brief", `Brief ${index}`, index)))
  expect(view.host.querySelectorAll("[data-note-id]").length).toBe(4)
  view.button("Show 5 older records").click()
  expect(view.host.querySelectorAll("[data-note-id]").length).toBe(9)
  view.host.querySelector<HTMLButtonElement>('[data-note-id="n8"] button')!.click()
  expect(view.host.querySelector(".board-discussion-reader")).not.toBeNull()
  view.setState({ issue: "ORCH-11", notes: [note("new", null, "A different discussion.")] })
  expect(view.host.querySelector(".board-discussion-reader")).toBeNull()
  expect(view.host.textContent).toContain("A different discussion.")
  expect(view.host.textContent).not.toContain("Brief 8")
})

test("a refresh keeps the open record, but removing that record returns to the list", () => {
  const view = mount([note("first", "brief", "Read this brief.")])
  view.host.querySelector<HTMLButtonElement>('[data-note-id="first"] button')!.click()
  view.setState("notes", [
    note("first", "brief", "Read the updated brief."),
    note("next", "review", "Review arrived.", 2),
  ])
  expect(view.host.querySelector(".board-discussion-reader")?.textContent).toContain("Read the updated brief.")
  view.setState("notes", [note("next", "review", "Review arrived.", 2)])
  expect(view.host.querySelector(".board-discussion-reader")).toBeNull()
  expect(view.host.querySelector('[data-note-id="next"]')).not.toBeNull()
})

test("an empty conversation explains where machine records live and keeps the composer available", () => {
  const view = mount([note("system", "rework", "redispatched")])
  view.button("Comments").click()
  expect(view.host.textContent).toContain("No comments yet.")
  expect(view.host.textContent).toContain("Briefs, reports and reviews are in Execution.")
  expect(view.host.querySelector("textarea")).not.toBeNull()
  expect(view.host.textContent).not.toContain("redispatched")
})

test("the latest report is readable without opening a document, and previews cannot inject HTML", () => {
  const view = mount([
    note("comment", null, "Earlier comment.", 0),
    note("old", "brief", "Previous packet.", 1),
    note("new", "return", `${"Context ".repeat(25)}The requested change is ready. <img src=x onerror=alert(1)>`, 2),
  ])
  expect(view.host.querySelector('[data-channel="execution"][aria-pressed="true"]')).not.toBeNull()
  expect(view.host.querySelector('[data-note-id="new"][data-latest="true"]')?.textContent).toContain(
    "The requested change is ready.",
  )
  expect(view.host.querySelector('[data-note-id="new"]')?.textContent).toContain("Latest update")
  expect(view.host.querySelector("img")).toBeNull()
  expect(view.host.querySelector('[data-note-id="old"][data-latest="true"]')).toBeNull()
})

test("a short comment with many lines can still be opened in full", () => {
  const view = mount([note("multiline", null, "one\ntwo\nthree\nfour\nfive\nsix\nseven")])
  view.button("Read full comment").click()
  expect(view.host.querySelector(".board-discussion-reader")?.textContent).toContain("seven")
})

test("even a short single-line comment can be read in full when a narrow layout wraps it", () => {
  const body = "A short source line can wrap across more than six visual lines in a narrow issue pane. Its final words must remain accessible."
  const view = mount([note("wrapped", null, body)])
  view.host.style.width = "110px"
  view.button("Read full comment").click()
  expect(view.host.querySelector(".board-discussion-reader")?.textContent).toContain(body)
})
