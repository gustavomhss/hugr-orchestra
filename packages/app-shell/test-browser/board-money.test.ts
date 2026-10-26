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
// child process of its own, like the board's other lanes.
if (process.env.BOARD_MONEY_DOM !== "1") {
  test("the board's money, decisions, settings and proof panels read the server's report", async () => {
    await child(["--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path], {
      ...process.env, BOARD_MONEY_DOM: "1",
    })
  }, 240000)
} else {
  const { createComponent, render } = await import("./lean-dom.test-helper")
  const { solidDom } = await import("./solid-dom")
  const { Orchestra } = await import("@orchestra/client")

  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const usd = (value: number) => ({ kind: "usd", usd: value })
  const spend = (extra: Record<string, unknown> = {}) => ({ models: usd(0), infra: usd(0), byModel: [], usd: 0, partial: false, ...extra })
  const report = (budget: Record<string, unknown>) => ({
    project: spend({
      models: usd(15), infra: usd(3), usd: 18, partial: true,
      byModel: [{ model: "sonnet", usd: 4 }, { model: "opus", usd: 9 }, { model: "haiku", usd: 2 }],
    }),
    budget: { budgetUsd: 60, spentUsd: 18, percent: 30, state: "ok", forecastUsd: 42, forecastPercent: 70, ...budget },
    cards: [
      { ...spend({ models: usd(2.4), usd: 2.4 }), issue: 61, ref: "LCH-61", epic: 1, seat: "backend", flagged: true, epicMedianUsd: 0.8 },
      { ...spend({ models: usd(1), usd: 1 }), issue: 58, ref: "LCH-58", epic: 1, seat: "frontend", flagged: false, epicMedianUsd: 1 },
    ],
    epics: [{ ...spend({ usd: 6 }), epic: 1, ref: "LCH-E1" }],
    seats: [{ ...spend({ usd: 8 }), seat: "backend" }],
    infraSyncedAt: now,
  })
  const live = { budget: {} as Record<string, unknown>, settingsError: false }
  const decisions = [
    {
      id: "dec_old", issue: 58, epic: null, date: now - 3 * day, question: "Ship 1.1 on Electron 33",
      options: [{ id: "yes", label: "Ship it", consequence: "On time" }, { id: "wait", label: "Wait", consequence: "A week later" }],
      recommended: "yes", chosen: "yes", chosenLabel: "Ship it", text: null, answeredBy: "owner",
      outcome: "applied, no result yet", outcomeAt: null, supersedes: null, overturnedBy: "dec_new",
    },
    {
      id: "dec_new", issue: 58, epic: null, date: now - day, question: "Ship 1.1 on Electron 33",
      options: [{ id: "yes", label: "Ship it", consequence: "On time" }, { id: "wait", label: "Wait", consequence: "A week later" }],
      recommended: "yes", chosen: "wait", chosenLabel: "Wait", text: "Windows installer fails", answeredBy: "owner",
      outcome: "applied, no result yet", outcomeAt: null, supersedes: "dec_old", overturnedBy: null,
    },
  ]
  const proof = {
    issue: 58, ref: "LCH-58", banner: null,
    pr: { number: 958, state: "open", merged: false, commits: 3, lastSha: "a41c9e2f00d" },
    ci: {
      checks: [
        { name: "lint", status: "completed", conclusion: "success" },
        { name: "e2e windows", status: "completed", conclusion: "failure" },
      ],
      failing: "e2e windows",
    },
    attempts: { n: 2, of: 3 }, guardrail: { rule: "no-secrets", summary: "Keys never leave in a note." },
    crashReason: null, verifiedAt: now, decidedBy: decisions[1],
  }
  const project = {
    id: "prj_LCH", key: "LCH", name: "Launch", goal: "Ship", targetDate: Date.UTC(2026, 10, 6), budgetUsd: 60, repoProjectID: null,
    githubRepo: null, status: "active", pausedReason: null, autoAcceptIntake: false, githubState: "off", githubError: null,
    githubSyncedAt: null,
  }
  const card = (number: number) => ({
    id: `iss_${number}`, number, ref: `LCH-${number}`, epic: 1, title: `Card ${number}`, body: "", type: "feature", stage: "review",
    position: number, estimate: null, seat: "frontend", sessionID: null, branch: null, prNumber: 958, holdBeforeMerge: false,
    paused: false, stageEnteredAt: now, githubNumber: null, steps: [], dependsOn: [],
  })
  const snapshot = {
    project,
    epics: [{ id: "epc_1", number: 1, ref: "LCH-E1", title: "Signing", goal: "g", position: 1, status: "open", githubMilestone: null }],
    issues: [card(58), card(61)], questions: [], cursor: null,
    forecast: { shipped: 0, remaining: 2, targetDate: null, forecast: { kind: "insufficient", shipped: 0, needed: 5 } },
    epicForecasts: [], scope: [],
  }
  const writes: { path: string; body: unknown }[] = []
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const url = new URL(request.url)
    if (request.method === "POST") {
      writes.push({ path: url.pathname, body: await request.json().catch(() => null) })
      if (url.pathname.endsWith("/settings") && live.settingsError)
        return Response.json({ _tag: "BudgetPausedError", message: "The budget is reached. Raise it to start new work." }, { status: 409 })
      return Response.json({ activity: `bac_${writes.length}` })
    }
    if (url.pathname === "/api/board")
      return Response.json([{ project, stages: { review: 2 }, openQuestions: 0, health: "on_track", forecast: snapshot.forecast }])
    if (url.pathname === "/api/board/LCH") return Response.json(snapshot)
    if (url.pathname === "/api/board/LCH/spend") return Response.json(report(live.budget))
    if (url.pathname === "/api/board/LCH/decisions") return Response.json(decisions)
    if (url.pathname.endsWith("/proof")) return Response.json(proof)
    const found = url.pathname.match(/^\/api\/board\/LCH\/issue\/(\d+)$/)
    if (found)
      return Response.json({
        issue: snapshot.issues.find((item) => item.number === Number(found[1])), questions: [], notes: [], attachments: [],
        activity: [], dependencies: { dependsOn: [], blocks: [] }, trail: { state: "signed_out", message: "Sign in to GitHub to see this trail" },
      })
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
    host.querySelector<HTMLElement>('.board-overview-row[data-key="LCH"]')!.click()
    await until(() => !!host.querySelector(".money-chip"), host)
    return { host, done: () => (dispose(), host.remove()) }
  }

  test("the spend chip opens the money panel: bar, bands, unmetered items and a muted outlier", async () => {
    live.budget = {}
    const view = await mount()
    expect(text(view.host.querySelector(".money-chip"))).toBe("$18 of $60")
    view.host.querySelector<HTMLElement>(".money-chip")!.click()
    await until(() => !!view.host.querySelector(".money-hero"), view.host)
    expect(text(view.host.querySelector(".money-figure"))).toContain("$18")
    expect(view.host.querySelector(".money-hero")?.getAttribute("data-state")).toBe("ok")
    expect(view.host.querySelector(".money-meter i")?.getAttribute("style")).toContain("30%")
    expect(text(view.host.querySelector(".money-forecast"))).toContain("$42 · 70% of the budget")
    expect(text(view.host.querySelector(".money-bands"))).toContain("$15")
    const cards = [...view.host.querySelectorAll(".money-card")]
    expect(cards.map((item) => item.getAttribute("data-flagged"))).toEqual(["true", "false"])
    expect(text(cards[0])).toContain("$2.40")
    expect(text(cards[0])).toContain("More than 3x the usual")
    view.done()
  }, 20000)

  test("past the budget the header reads Paused · budget", async () => {
    live.budget = { spentUsd: 61, percent: 101.7, state: "paused" }
    const view = await mount()
    expect(text(view.host.querySelector(".money-chip"))).toBe("Paused · budget")
    expect(view.host.querySelector(".money-chip")?.getAttribute("data-state")).toBe("paused")
    live.budget = {}
    view.done()
  }, 20000)

  test("decisions show both versions of an overturned decision and overturn through the server", async () => {
    const view = await mount()
    button(view.host, "Decisions")!.click()
    await until(() => view.host.querySelectorAll(".money-decision").length === 2, view.host)
    const rows = [...view.host.querySelectorAll(".money-decision")]
    expect(rows.map((item) => item.getAttribute("data-decision"))).toEqual(["dec_new", "dec_old"])
    expect(text(rows[0])).toContain("Replaces the decision of")
    expect(text(rows[1])).toContain("Replaced by the decision of")
    expect(rows[1].getAttribute("data-overturned")).toBe("true")
    expect(text(rows[0])).toContain("applied, no result yet")
    expect(button(rows[1], "Overturn")).toBeUndefined()
    button(rows[0], "Overturn")!.click()
    await until(() => !!rows[0].querySelector('input[type="radio"]'), view.host)
    rows[0].querySelector<HTMLInputElement>('input[type="radio"]')!.click()
    rows[0].querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }))
    await until(() => writes.some((item) => item.path === "/api/board/LCH/decision/dec_new"), view.host)
    expect(writes.at(-1)?.body).toMatchObject({ option: "yes" })
    view.done()
  }, 20000)

  test("settings save only what changed and show the server's refusal in its own words", async () => {
    const view = await mount()
    button(view.host, "Settings")!.click()
    await until(() => !!view.host.querySelector(".money-settings"), view.host)
    const inputs = view.host.querySelectorAll<HTMLInputElement>(".money-settings input")
    expect(inputs[0].value).toBe("2026-11-06")
    expect(inputs[1].value).toBe("60")
    inputs[1].value = "80"
    inputs[1].dispatchEvent(new Event("input", { bubbles: true }))
    view.host.querySelector(".money-settings")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }))
    await until(() => writes.some((item) => item.path === "/api/board/LCH/settings"), view.host)
    expect(writes.at(-1)?.body).toEqual({ budget_usd: 80 })

    live.settingsError = true
    inputs[1].value = "90"
    inputs[1].dispatchEvent(new Event("input", { bubbles: true }))
    view.host.querySelector(".money-settings")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }))
    await until(() => text(view.host.querySelector(".money-settings .mx-error")).includes("Raise it to start new work"), view.host)
    live.settingsError = false
    inputs[1].value = "-3"
    inputs[1].dispatchEvent(new Event("input", { bubbles: true }))
    view.host.querySelector(".money-settings")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }))
    await until(() => text(view.host.querySelector(".money-settings .mx-error")).includes("zero or more"), view.host)
    view.done()
  }, 20000)

  test("a card's detail shows its proof and the Decided by link jumps to the decision", async () => {
    const view = await mount()
    view.host.querySelector<HTMLElement>('[data-ref="LCH-58"]')!.click()
    await until(() => !!view.host.querySelector(".money-proof"), view.host)
    const block = view.host.querySelector(".money-proof")!
    expect(text(block)).toContain("#958")
    expect(text(block)).toContain("a41c9e2")
    expect(text(block.querySelector(".money-ci-line"))).toBe("e2e windows is failing")
    expect(block.querySelector(".money-checks li")?.getAttribute("data-state")).toBe("fail")
    expect(text(block)).toContain("Attempt 2 of 3")
    expect(text(block)).toContain("Keys never leave in a note.")
    button(block, "See the decision: Ship 1.1 on Electron 33")!.click()
    await until(() => view.host.querySelector('[data-decision="dec_new"]')?.getAttribute("data-focus") === "true", view.host)
    view.done()
  }, 20000)
}
