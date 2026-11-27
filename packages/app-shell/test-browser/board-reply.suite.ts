import { expect, test } from "bun:test"

type View = {
  host: HTMLDivElement
  lane: (stage: string) => (string | null)[]
  done: () => void
}

type Fixture = {
  state: {
    asks: Record<string, unknown>[]
    nextAsks: Record<string, unknown>[]
    otherProject: boolean
    deferWrite: string | undefined
    finishWrite: ((fail?: boolean) => void) | undefined
    writes: { path: string; body: unknown }[]
    listCalls: number
  }
  now: number
  base: { id: string }
  page: (number: number) => { questions: Record<string, unknown>[] }
  mount: () => Promise<View>
  peek: (view: View) => Promise<{ type: (field: HTMLInputElement | HTMLTextAreaElement, value: string) => void }>
  until: (check: () => boolean, host: HTMLElement) => Promise<void>
  listeners: Set<(event: { details: unknown }) => void>
}

export function boardReplyTests(fixture: Fixture) {
  test("question replies survive refresh and remount, and acknowledge only the submitted revision", async () => {
    const view = await fixture.mount()
    const ui = await fixture.peek(view)
    const reply = () => view.host.querySelector<HTMLInputElement>(".board-question input")!
    ui.type(reply(), "Keep this reply")
    const original = reply()
    fixture.listeners.forEach((fn) => fn({ details: { type: "board.changed", properties: { project: fixture.base.id } } }))
    await fixture.until(() => reply() !== original, view.host)
    expect(reply().value).toBe("Keep this reply")
    view.host.querySelector(".board-root")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await fixture.until(() => !view.host.querySelector(".board-peek"), view.host)
    await fixture.peek(view)
    expect(reply().value).toBe("Keep this reply")
    fixture.state.deferWrite = "/answer"
    view.host.querySelector<HTMLButtonElement>(".board-question .board-option")!.click()
    await fixture.until(() => !!fixture.state.finishWrite, view.host)
    expect(fixture.state.writes.at(-1)).toEqual({ path: "/api/board/LCH/question/bq_1/answer", body: { option: "stripe", text: "Keep this reply" } })
    ui.type(reply(), "Newer reply")
    ui.type(reply(), "Keep this reply") // Even A→B→A is a new revision.
    const pending = reply()
    fixture.state.finishWrite!()
    await fixture.until(() => reply() !== pending, view.host)
    expect(reply().value).toBe("Keep this reply")
    fixture.state.finishWrite = undefined
    view.host.querySelector<HTMLButtonElement>(".board-question .board-option")!.click()
    await fixture.until(() => !!fixture.state.finishWrite, view.host)
    const matching = reply()
    fixture.state.finishWrite!()
    await fixture.until(() => reply() !== matching, view.host)
    expect(reply().value).toBe("")
    ui.type(reply(), "Retain on refusal")
    fixture.state.finishWrite = undefined
    view.host.querySelector<HTMLButtonElement>(".board-question .board-option")!.click()
    await fixture.until(() => !!fixture.state.finishWrite, view.host)
    fixture.state.finishWrite!(true)
    await fixture.until(() => !!document.querySelector(".board-write-status"), view.host)
    expect(reply().value).toBe("Retain on refusal")
    view.done()
  }, 30000)

  test("issue and inbox share their reply and acknowledge after dismissal without refreshing the disposed inbox", async () => {
    fixture.state.asks = fixture.page(3).questions
    const view = await fixture.mount()
    const ui = await fixture.peek(view)
    ui.type(view.host.querySelector<HTMLInputElement>(".board-question input")!, "Shared reply")
    view.host.querySelector<HTMLButtonElement>(".board-needs")!.click()
    await fixture.until(() => !!view.host.querySelector(".board-inbox-draft"), view.host)
    expect(view.host.querySelector<HTMLInputElement>(".board-inbox-draft")!.value).toBe("Shared reply")
    fixture.state.deferWrite = "/answer"
    view.host.querySelector<HTMLButtonElement>(".board-inbox-item .board-option")!.click()
    await fixture.until(() => !!fixture.state.finishWrite, view.host)
    view.host.querySelector<HTMLButtonElement>(".board-inbox .board-crumb button")!.click()
    await fixture.until(() => !!view.host.querySelector(".board-grid"), view.host)
    await fixture.peek(view)
    const reply = () => view.host.querySelector<HTMLInputElement>(".board-question input")!
    const lists = fixture.state.listCalls
    expect(lists).toBeGreaterThan(0)
    fixture.state.finishWrite!()
    // Shared acknowledgment remains observable after unmount; no disposed load is used as a completion oracle.
    await fixture.until(() => reply().value === "", view.host)
    expect(fixture.state.listCalls).toBe(lists)
    ui.type(reply(), "New reply after leaving inbox")
    const original = reply()
    fixture.listeners.forEach((fn) => fn({ details: { type: "board.changed", properties: { project: fixture.base.id } } }))
    await fixture.until(() => reply() !== original, view.host)
    expect(reply().value).toBe("New reply after leaving inbox")
    view.done()
    const fresh = await fixture.mount()
    await fixture.peek(fresh)
    expect(fresh.host.querySelector<HTMLInputElement>(".board-question input")!.value).toBe("")
    fresh.done()
  }, 30000)

  test("inbox replies are isolated by project and question and survive pending answers and remount", async () => {
    const question = (id: string, text: string) => ({
      id, issue: 3, epic: null, text, recommended: "eu", costOfWaiting: null,
      blocking: true, status: "open", answerOption: null, answerText: null, answeredAt: null, timeCreated: fixture.now,
      options: [{ id: "eu", label: "EU", consequence: "" }],
    })
    fixture.state.asks = [question("bq_9", "First question"), question("bq_10", "Second question")]
    fixture.state.nextAsks = [question("bq_9", "Other project question")]
    fixture.state.otherProject = true
    const view = await fixture.mount()
    view.host.querySelector<HTMLButtonElement>(".board-needs")!.click()
    await fixture.until(() => view.host.querySelectorAll(".board-inbox-item").length === 3, view.host)
    const row = (text: string) => [...view.host.querySelectorAll<HTMLElement>(".board-inbox-item")].find((item) => item.textContent?.includes(text))!
    const reply = () => view.host.querySelector<HTMLInputElement>(".board-inbox-draft")!
    const type = (value: string) => { reply().value = value; reply().dispatchEvent(new Event("input", { bubbles: true })) }
    row("First question").click()
    type("First draft")
    row("Second question").click()
    expect(reply().value).toBe("")
    type("Second draft")
    row("Other project question").click()
    expect(reply().value).toBe("")
    type("Other project draft")
    row("First question").click()
    expect(reply().value).toBe("First draft")
    fixture.state.deferWrite = "/answer"
    row("First question").querySelector<HTMLButtonElement>(".board-option")!.click()
    await fixture.until(() => !!fixture.state.finishWrite, view.host)
    expect(fixture.state.writes.at(-1)).toEqual({ path: "/api/board/LCH/question/bq_9/answer", body: { option: "eu", text: "First draft" } })
    row("Second question").click()
    type("New second draft")
    fixture.state.finishWrite!()
    await fixture.until(() => !row("Second question").querySelector<HTMLButtonElement>(".board-option")!.disabled, view.host)
    expect(row("Second question").dataset.open).toBe("true")
    expect(reply().value).toBe("New second draft")
    view.host.querySelector<HTMLButtonElement>(".board-inbox .board-crumb button")!.click()
    await fixture.until(() => !!view.host.querySelector(".board-needs"), view.host)
    view.host.querySelector<HTMLButtonElement>(".board-needs")!.click()
    await fixture.until(() => view.host.querySelectorAll(".board-inbox-item").length === 3, view.host)
    row("Second question").click()
    expect(reply().value).toBe("New second draft")
    row("First question").click()
    expect(reply().value).toBe("")
    row("Other project question").click()
    expect(reply().value).toBe("Other project draft")
    const filter = (label: string) => [...view.host.querySelectorAll<HTMLButtonElement>(".board-intake-theme")].find((item) => item.textContent?.startsWith(label))!
    filter("NXT").click()
    expect(view.host.querySelectorAll(".board-inbox-item").length).toBe(1)
    expect(reply().value).toBe("Other project draft")
    fixture.state.deferWrite = undefined
    const keyed = fixture.state.writes.length
    view.host.querySelector(".board-inbox")!.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }))
    await fixture.until(() => fixture.state.writes.length > keyed && !row("Other project question").querySelector<HTMLButtonElement>(".board-option")!.disabled, view.host)
    expect(fixture.state.writes.length).toBe(keyed + 1)
    expect(fixture.state.writes.at(-1)).toEqual({ path: "/api/board/NXT/question/bq_9/answer", body: { option: "eu", text: "Other project draft" } })
    filter("All").click()
    row("First question").click()
    const collapsed = fixture.state.writes.length
    row("Second question").querySelector<HTMLButtonElement>(".board-option")!.click()
    await fixture.until(() => fixture.state.writes.length > collapsed && !row("Second question").querySelector<HTMLButtonElement>(".board-option")!.disabled, view.host)
    expect(fixture.state.writes.at(-1)).toEqual({ path: "/api/board/LCH/question/bq_10/answer", body: { option: "eu", text: "New second draft" } })
    expect(row("First question").dataset.open).toBe("true")
    row("Second question").click()
    expect(reply().value).toBe("")
    type("In-flight draft")
    fixture.state.deferWrite = "/answer"
    fixture.state.finishWrite = undefined
    row("Second question").querySelector<HTMLButtonElement>(".board-option")!.click()
    await fixture.until(() => !!fixture.state.finishWrite, view.host)
    type("Revised in-flight draft")
    const refreshed = fixture.state.listCalls
    fixture.state.finishWrite!()
    await fixture.until(() => fixture.state.listCalls > refreshed && !row("Second question").querySelector<HTMLButtonElement>(".board-option")!.disabled, view.host)
    expect(reply().value).toBe("Revised in-flight draft")
    view.done()
  }, 30000)
}
