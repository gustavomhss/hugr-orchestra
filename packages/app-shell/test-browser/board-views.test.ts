import { expect, mock, test } from "bun:test"
import path from "node:path"

async function child(args: string[], env = process.env) {
  const proc = Bun.spawn([Bun.which("bun")!, ...args], {
    cwd: path.resolve(import.meta.dir, ".."), env, stdout: "pipe", stderr: "pipe", timeout: 180000, killSignal: "SIGKILL",
  })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  if (code !== 0) throw new Error(`${args.join(" ")} exited ${code}\n${out}\n${err}`)
  console.log(out + err)
}

// The server SDK fixture replaces a shared module for the rest of a `bun test` process, so this DOM lane runs in a
// child process of its own, like the board's own lane.
if (process.env.BOARD_VIEWS_DOM !== "1") {
  test("the board's overview, list, epic page and timeline read the server's forecast and plan", async () => {
    await child(["--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path], {
      ...process.env, BOARD_VIEWS_DOM: "1",
    })
  }, 240000)
} else {
  const { createComponent, render } = await import("./lean-dom.test-helper")
  const { solidDom } = await import("./solid-dom")
  const { Orchestra } = await import("@orchestra/client")
  const { range }: typeof import("@/orchestra/chapters/board/plan") = await import(
    solidDom("@/orchestra/chapters/board/plan", import.meta.dir)
  )

  const day = 24 * 60 * 60 * 1000
  const now = Date.now()
  const midnight = Math.floor(now / day) * day
  const target = midnight + 12 * day
  const accounts = { p50: midnight + 3 * day, p85: midnight + 5 * day }
  const payments = { p50: midnight + 10 * day, p85: midnight + 15 * day }
  const project = (key: string, name: string, status: string, extra: Record<string, unknown> = {}) => ({
    id: `prj_${key}`, key, name, goal: `${name} goal`, targetDate: null, budgetUsd: null, repoProjectID: null,
    githubRepo: null, status, pausedReason: null, autoAcceptIntake: false, githubState: "off", githubError: null,
    githubSyncedAt: null, ...extra,
  })
  const launch = project("LCH", "Launch", "active", { targetDate: target })
  const issue = (number: number, stage: string, extra: Record<string, unknown> = {}) => ({
    id: `iss_${number}`, number, ref: `LCH-${number}`, epic: null, title: `Issue ${number}`, body: "", type: "feature", stage,
    position: number, estimate: null, seat: null, sessionID: null, branch: null, prNumber: null, holdBeforeMerge: false,
    paused: false, stageEnteredAt: now, githubNumber: null, steps: [], dependsOn: [], ...extra,
  })
  const epic = (number: number, title: string, status = "open") => ({
    id: `epc_${number}`, number, ref: `LCH-E${number}`, title, goal: `${title} goal`, position: number, status,
    githubMilestone: null,
  })
  const issues = [
    // Accounts: four shipped on different days and one in review, so it is closest to done.
    issue(1, "shipped", { epic: 1, stageEnteredAt: now - 9 * day }),
    issue(2, "shipped", { epic: 1, stageEnteredAt: now - 7 * day }),
    issue(3, "shipped", { epic: 1, stageEnteredAt: now - 5 * day }),
    issue(4, "shipped", { epic: 1, stageEnteredAt: now - 3 * day }),
    issue(5, "review", { epic: 1, seat: "frontend", prNumber: 41 }),
    // Payments: one shipped, one building, one ready that waits on an issue outside the epic, one in backlog.
    issue(6, "shipped", { epic: 2, stageEnteredAt: now - 2 * day }),
    issue(7, "building", {
      epic: 2, seat: "backend",
      steps: [{ title: "Schema", status: "done", now: null }, { title: "Handlers", status: "active", now: "wiring refunds" }],
    }),
    issue(8, "ready", { epic: 2, dependsOn: ["LCH-12"] }),
    issue(9, "backlog", { epic: 2 }),
    // Docs: everything shipped.
    issue(10, "shipped", { epic: 3, stageEnteredAt: now - day }),
    issue(11, "backlog"),
    issue(12, "ready"),
    issue(13, "intake"),
    issue(14, "cut", { epic: 2 }),
  ]
  const forecast = {
    shipped: 6, remaining: 7, targetDate: target,
    forecast: { kind: "dates", ...payments, vsTarget: { p50: -2, p85: 3 } },
  }
  const snapshot = {
    project: launch,
    epics: [epic(1, "Accounts"), epic(2, "Payments"), epic(3, "Docs", "shipped")],
    issues,
    questions: [{
      id: "bq_8", issue: 8, epic: null, text: "Card or invoice first?", recommended: "card", costOfWaiting: null,
      blocking: true, status: "open", answerOption: null, answerText: null, answeredAt: null, timeCreated: now,
      options: [{ id: "card", label: "Card", consequence: null }, { id: "invoice", label: "Invoice", consequence: null }],
    }],
    cursor: null,
    forecast,
    epicForecasts: [
      { epic: 1, ref: "LCH-E1", shipped: 4, remaining: 1, forecast: { kind: "dates", ...accounts, vsTarget: null }, setsDate: false },
      { epic: 2, ref: "LCH-E2", shipped: 1, remaining: 3, forecast: { kind: "dates", ...payments, vsTarget: null }, setsDate: true },
      { epic: 3, ref: "LCH-E3", shipped: 1, remaining: 0, forecast: { kind: "done" }, setsDate: false },
    ],
    scope: [
      { at: now - 10 * day, scope: 10, shipped: 0, reason: null },
      { at: now - 4 * day, scope: 12, shipped: 3, reason: "Refunds joined after review" },
    ],
  }
  const summary = (item: ReturnType<typeof project>, stages: Record<string, number>, extra: Record<string, unknown> = {}) => ({
    project: item, stages, openQuestions: 0, health: "on_track",
    forecast: { shipped: stages.shipped ?? 0, remaining: 0, targetDate: null, forecast: { kind: "done" } }, ...extra,
  })
  const listed = [
    summary(launch, { backlog: 2, ready: 2, building: 1, review: 1, shipped: 6 }, { openQuestions: 1, forecast }),
    summary(project("DOC", "Docs site", "shipped"), { shipped: 4 }),
  ]
  const archived = summary(project("OLD", "Old pilot", "archived"), { shipped: 3 })
  const writes: string[] = []
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const url = new URL(request.url)
    if (request.method === "POST") {
      writes.push(url.pathname)
      return Response.json({ activity: `bac_${writes.length}` })
    }
    if (url.pathname === "/api/board")
      return Response.json(url.searchParams.get("archived") === "true" ? [...listed, archived] : listed)
    if (url.pathname === "/api/board/LCH") return Response.json(snapshot)
    return new Response("not found", { status: 404 })
  } })

  mock.module(solidDom("@/context/server-sdk", import.meta.dir), () => ({
    useServerSDK: () => () => ({
      orchestra: Orchestra.make({ baseUrl: server.url.origin }),
      event: { listen: () => () => {} },
    }),
  }))
  const { default: Board }: typeof import("@/orchestra/chapters/board/board") = await import(
    solidDom("@/orchestra/chapters/board/board", import.meta.dir)
  )
  const { PlatformProvider }: typeof import("@/context/platform") = await import(solidDom("@/context/platform", import.meta.dir))
  const { LanguageProvider }: typeof import("@/context/language") = await import(solidDom("@/context/language", import.meta.dir))

  const until = async (check: () => boolean, host: HTMLElement) => {
    const deadline = Date.now() + 8000
    while (!check()) {
      if (Date.now() > deadline) throw new Error(`timed out\n${host.innerHTML}`)
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  const text = (element: Element | null | undefined) => element?.textContent?.trim() ?? ""
  const button = (scope: ParentNode, label: string) =>
    [...scope.querySelectorAll<HTMLButtonElement>("button")].find((item) => text(item) === label)

  const mount = async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const dispose = render(() => createComponent(PlatformProvider, {
      value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
      get children() { return createComponent(LanguageProvider, { locale: "en", get children() {
        return createComponent(Board, {})
      } }) },
    }), host)
    await until(() => !!host.querySelector('.board-overview-row[data-key="LCH"]'), host)
    const open = async (view: "List" | "Timeline") => {
      host.querySelector<HTMLElement>('.board-overview-row[data-key="LCH"]')!.click()
      await until(() => !!host.querySelector(".board-head-end .board-segments"), host)
      button(host.querySelector(".board-head-end .board-segments")!, view)!.click()
    }
    return { host, open, done: () => (dispose(), host.remove()) }
  }

  test("the overview shows each project's forecast window, archives shipped work and brings archived projects back", async () => {
    const view = await mount()
    const row = view.host.querySelector('.board-overview-row[data-key="LCH"]')!
    expect(text(row.querySelector(".board-overview-figure b"))).toBe("50%")
    const window = row.querySelector(".board-window")!
    expect(text(window.previousElementSibling)).toContain(range(payments.p50, payments.p85, "en"))
    // P85 lands three days past the target, so the window reads late and holds the target tick.
    expect(window.getAttribute("data-late")).toBe("true")
    expect(window.querySelector(".board-window-target")).not.toBeNull()
    expect(text(row.querySelector(".board-overview-asks"))).toBe("1 question for you")
    expect(view.host.querySelector('.board-overview-row[data-key="OLD"]')).toBeNull()

    const doc = view.host.querySelector('.board-overview-row[data-key="DOC"]')!
    button(doc, "Archive")!.click()
    await until(() => writes.includes("/api/board/DOC/archive"), view.host)

    const segments = view.host.querySelector(".board-overview-bar .board-segments")!
    button(segments, "Archived")!.click()
    await until(() => !!view.host.querySelector('.board-overview-row[data-key="OLD"]'), view.host)
    expect([...view.host.querySelectorAll(".board-overview-row")].map((item) => item.getAttribute("data-key"))).toEqual(["OLD"])
    button(view.host.querySelector('.board-overview-row[data-key="OLD"]')!, "Unarchive")!.click()
    await until(() => writes.includes("/api/board/OLD/unarchive"), view.host)
    view.done()
  }, 20000)

  test("the list groups by epic closest to done, folds shipped rows, filters and regroups by stage", async () => {
    const view = await mount()
    await view.open("List")
    await until(() => !!view.host.querySelector(".board-table-row"), view.host)
    const table = view.host.querySelector(".board-table-view")!
    const groups = () => [...table.querySelectorAll(".board-table-group")]
    const refs = () => [...table.querySelectorAll(".board-table-row")].map((item) => item.getAttribute("data-ref"))
    expect(view.host.querySelector(".board-grid")?.hasAttribute("hidden")).toBe(true)

    expect(groups().map((group) => text(group.querySelector(".board-table-group-name")))).toEqual(["Accounts", "Payments", "Docs", "No epic"])
    expect(text(groups()[0].querySelector(".board-table-group-head > .board-count"))).toBe("4 of 5 shipped")
    expect(text(groups()[1].querySelector(".board-table-done"))).toBe(`done ${range(payments.p50, payments.p85, "en")}`)
    expect(refs()).toEqual(["LCH-5", "LCH-7", "LCH-8", "LCH-9", "LCH-12", "LCH-11"])
    expect(text(table.querySelector('[data-ref="LCH-8"] .board-table-asked'))).toBe("asked you")

    const fold = groups()[0].querySelector<HTMLButtonElement>(".board-table-fold")!
    expect(text(fold)).toBe("4 shipped")
    fold.click()
    await until(() => refs().includes("LCH-4"), view.host)
    expect(refs().slice(0, 5)).toEqual(["LCH-5", "LCH-4", "LCH-3", "LCH-2", "LCH-1"])

    const filters = table.querySelector(".board-filters")!
    expect(text(filters.querySelector('[data-tone="warm"]'))).toBe("Needs you1")
    filters.querySelector<HTMLButtonElement>('[data-tone="warm"]')!.click()
    await until(() => refs().length === 1, view.host)
    expect(refs()).toEqual(["LCH-8"])
    button(filters, "All12")!.click()

    button(table.querySelector(".board-table-bar > .board-segments")!, "Stage")!.click()
    await until(() => !!table.querySelector(".board-table-group[data-stage]"), view.host)
    expect(groups().map((group) => group.getAttribute("data-stage"))).toEqual(["review", "building", "ready", "backlog", "shipped"])
    expect(refs()).toEqual(["LCH-5", "LCH-7", "LCH-8", "LCH-12", "LCH-9", "LCH-11"])
    view.done()
  }, 20000)

  test("the epic page shows the epic's forecast, that it sets the date, what it waits on and Maestro's question", async () => {
    const view = await mount()
    await view.open("List")
    await until(() => !!view.host.querySelector(".board-table-epic"), view.host)
    button(view.host.querySelector(".board-table-view")!, "Payments")!.click()
    await until(() => !!view.host.querySelector("#board-epic-title"), view.host)
    const page = view.host.querySelector(".board-epic-page")!
    expect(text(page.querySelector("#board-epic-title"))).toBe("Payments")
    expect(text(view.host.querySelector(".board-crumb"))).toContain("Payments")
    expect(text(page.querySelector(".board-epic-figure"))).toBe(range(payments.p50, payments.p85, "en"))
    expect(page.querySelector(".board-epic-pole")?.getAttribute("data-sets")).toBe("true")
    expect(text(page.querySelector(".board-epic-pole"))).toBe("Sets the project's date")
    expect([...page.querySelectorAll(".board-epic-stage")].map((item) => item.getAttribute("data-stage")))
      .toEqual(["building", "ready", "backlog", "shipped"])
    expect([...page.querySelectorAll(".board-epic-main .board-table-row")].map((item) => item.getAttribute("data-ref")))
      .toEqual(["LCH-7", "LCH-8", "LCH-9"])
    expect(text(page.querySelector('[aria-labelledby="board-epic-waits"] .board-epic-item'))).toContain("LCH-12")
    expect(text(page.querySelector(".board-epic-ask"))).toContain("Card or invoice first?")
    expect(page.querySelector(".board-epic-calm")).toBeNull()
    expect(page.querySelector(".board-burnup")).not.toBeNull()

    // The crumb's project key leaves the epic and returns to the project in the view it was in.
    button(view.host.querySelector(".board-crumb")!, "LCH")!.click()
    await until(() => !view.host.querySelector(".board-epic-page"), view.host)
    expect(view.host.querySelector(".board-table-view")).not.toBeNull()
    view.done()
  }, 20000)

  test("the timeline draws a bar per epic over ISO weeks, marks the epic that sets the date and logs scope changes", async () => {
    const view = await mount()
    await view.open("Timeline")
    await until(() => !!view.host.querySelector(".board-timeline-epic"), view.host)
    const chart = view.host.querySelector(".board-timeline")!
    const weeks = [...chart.querySelectorAll(".board-timeline-week")].map((item) => text(item))
    expect(weeks.length).toBeGreaterThanOrEqual(3)
    weeks.forEach((label) => expect(label).toMatch(/week \d+$/))
    expect(chart.querySelector(".board-timeline-target")).not.toBeNull()
    expect(chart.querySelector(".board-timeline-today")).not.toBeNull()

    const rows = [...chart.querySelectorAll(".board-timeline-epic")]
    expect(rows.map((row) => text(row.querySelector(".board-timeline-epic-name")))).toEqual(["Accounts", "Payments", "Docs"])
    const tones = (row: Element) => [...row.querySelectorAll(".board-timeline-bar")].map((bar) => bar.getAttribute("data-tone"))
    expect(tones(rows[0])).toEqual(["shipped", "left", "cone"])
    expect(text(rows[0].querySelector(".board-timeline-tag"))).toBe(range(accounts.p50, accounts.p85, "en"))
    expect(text(rows[1].querySelector(".board-timeline-tag"))).toBe(`${range(payments.p50, payments.p85, "en")}sets the date`)
    expect(tones(rows[2])).toEqual(["shipped"])
    expect(text(rows[2].querySelector(".board-timeline-tag"))).toBe("All shipped")

    rows[1].querySelector<HTMLButtonElement>(".board-timeline-toggle")!.click()
    await until(() => chart.querySelectorAll(".board-timeline-issue").length > 0, view.host)
    expect([...chart.querySelectorAll(".board-timeline-issue[data-stage] .board-id")].map((item) => text(item)))
      .toEqual(["LCH-7", "LCH-8", "LCH-9"])

    const scope = chart.querySelector(".board-timeline-scope")!
    expect(text(scope.querySelector("h3 .board-count"))).toBe("3 of 12 shipped")
    expect(text(scope.querySelector(".board-scope-log b"))).toBe("+2")
    expect(text(scope.querySelector(".board-scope-log"))).toContain("Refunds joined after review")
    view.done()
    server.stop(true)
  }, 20000)
}
