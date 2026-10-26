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

// The server SDK fixture below replaces a shared module for the rest of a `bun test` process, so the DOM lane runs in
// a child process of its own, like the Guardrails and Lean DOM lanes.
if (process.env.BOARD_DOM !== "1") {
  test("the Projects board reads the server's boards, follows board.changed and never shows a secret's value", async () => {
    await child(["--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path], {
      ...process.env, BOARD_DOM: "1",
    })
  }, 240000)
} else {
  const { createComponent, render } = await import("./lean-dom.test-helper")
  const { solidDom } = await import("./solid-dom")
  const { Orchestra } = await import("@orchestra/client")

  const now = Date.now()
  const base = {
    id: "prj_launch", key: "LCH", name: "Launch", goal: "Ship the first public build", targetDate: null, budgetUsd: null,
    repoProjectID: null, githubRepo: null, status: "active", pausedReason: null, autoAcceptIntake: false,
    githubState: "signed_out", githubError: null, githubSyncedAt: null,
  }
  const issue = (number: number, stage: string, extra: Record<string, unknown> = {}) => ({
    id: `iss_${number}`, number, ref: `LCH-${number}`, epic: null, title: `Issue ${number}`, body: "", type: "feature", stage,
    position: number, estimate: null, seat: null, sessionID: null, branch: null, prNumber: null, holdBeforeMerge: false,
    paused: false, stageEnteredAt: now, githubNumber: null, steps: [], dependsOn: [], ...extra,
  })
  const secretValue = "sk-live-board-fixture-never-render-0042"
  const state = {
    issues: [
      issue(1, "backlog"),
      issue(2, "ready"),
      issue(3, "building", {
        seat: "backend",
        steps: [
          { title: "Schema", status: "done", now: null },
          { title: "Handlers", status: "active", now: "wiring the routes" },
        ],
      }),
      issue(4, "shipped"),
      issue(5, "intake"),
      issue(6, "cut"),
    ],
    gets: 0,
    paused: false,
    refuse: false,
    writes: [] as { path: string; body: unknown }[],
  }
  const page = (number: number) => ({
    issue: state.issues.find((item) => item.number === number),
    questions: number === 3
      ? [{
          id: "bq_1", issue: 3, epic: null, text: "Which payment provider?", recommended: "stripe", costOfWaiting: null,
          blocking: true, status: "open", answerOption: null, answerText: null, answeredAt: null, timeCreated: now,
          options: [{ id: "stripe", label: "Stripe", consequence: null }, { id: "paddle", label: "Paddle", consequence: null }],
        }]
      : [],
    notes: [],
    // The server never sends a secret's value; the extra field proves the view would not print one if it did.
    attachments: [
      { id: "att_1", issue: number, kind: "secret", name: "STRIPE_TEST_KEY", mime: null, size: null, timeCreated: now, value: secretValue },
    ],
    activity: [{ id: "act_1", issue: number, actor: "maestro", action: "issue.move", reason: "Tests are green", before: null, after: null, undoes: null, undoneBy: null, timeCreated: now }],
    dependencies: { dependsOn: [], blocks: [] },
    trail: { state: "signed_out", message: "Sign in to GitHub to see this trail" },
  })
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const url = new URL(request.url)
    const project = { ...base, status: state.paused ? "paused" : "active" }
    // Every owner write is recorded so the tests can prove what reached the server, and what never did.
    if (request.method === "POST") {
      const text = await request.text()
      state.writes.push({ path: url.pathname, body: text ? JSON.parse(text) : null })
      if (url.pathname.endsWith("/undo") && state.refuse)
        return Response.json({ _tag: "BoardRefusedError", message: "A later change touched the same fields" }, { status: 409 })
      if (url.pathname === "/api/board/LCH/pause") state.paused = true
      if (url.pathname === "/api/board/LCH/resume") state.paused = false
      return Response.json({ activity: `bac_${state.writes.length}` })
    }
    if (url.pathname === "/api/board")
      return Response.json([{ project, stages: { backlog: 1, ready: 1, building: 1, shipped: 1 }, openQuestions: 0, health: "on_track" }])
    if (url.pathname === "/api/board/LCH") {
      state.gets++
      return Response.json({ project, epics: [], issues: state.issues, questions: [], cursor: null })
    }
    const match = url.pathname.match(/^\/api\/board\/LCH\/issue\/(\d+)$/)
    if (match) return Response.json(page(Number(match[1])))
    return new Response("not found", { status: 404 })
  } })

  const listeners = new Set<(event: { details: unknown }) => void>()
  // External context fixture only; the real generated client talks to the fixture server and the real view renders.
  mock.module(solidDom("@/context/server-sdk", import.meta.dir), () => ({
    useServerSDK: () => () => ({
      orchestra: Orchestra.make({ baseUrl: server.url.origin }),
      event: { listen(fn: (event: { details: unknown }) => void) {
        listeners.add(fn)
        return () => listeners.delete(fn)
      } },
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

  const mount = async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const dispose = render(() => createComponent(PlatformProvider, {
      value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
      get children() { return createComponent(LanguageProvider, { locale: "en", get children() {
        return createComponent(Board, {})
      } }) },
    }), host)
    await until(() => !!host.querySelector('.board-project[data-key="LCH"]'), host)
    host.querySelector<HTMLButtonElement>('.board-project[data-key="LCH"]')!.click()
    await until(() => !!host.querySelector(".board-grid"), host)
    const lane = (stage: string) =>
      [...host.querySelectorAll(`.board-col[data-stage="${stage}"] [data-ref]`)].map((item) => item.getAttribute("data-ref"))
    return { host, lane, done: () => (dispose(), host.remove()) }
  }

  test("each issue sits in its stage's column; intake is only counted and cut stays off the board", async () => {
    const view = await mount()
    expect([...view.host.querySelectorAll(".board-col")].map((col) => col.getAttribute("data-stage")))
      .toEqual(["backlog", "ready", "building", "review", "shipped"])
    expect(view.lane("backlog")).toEqual(["LCH-1"])
    expect(view.lane("ready")).toEqual(["LCH-2"])
    expect(view.lane("building")).toEqual(["LCH-3"])
    expect(view.lane("review")).toEqual([])
    expect(view.lane("shipped")).toEqual(["LCH-4"])
    expect(view.host.querySelector('[data-ref="LCH-5"]')).toBeNull()
    expect(view.host.querySelector('[data-ref="LCH-6"]')).toBeNull()
    expect(view.host.querySelector(".board-intake")?.textContent).toContain("1")
    // The building card shows the active step's now line and its seat by role letter.
    expect(view.host.querySelector('[data-ref="LCH-3"] .board-now')?.textContent).toContain("wiring the routes")
    expect(view.host.querySelector('[data-ref="LCH-3"] .board-seat')?.textContent).toBe("B")
    view.done()
  }, 20000)

  test("board.changed for this project refetches the board and moves the card", async () => {
    const view = await mount()
    const gets = state.gets
    state.issues = state.issues.map((item) => (item.number === 2 ? { ...item, stage: "building" } : item))
    // Another project's change does not refetch this board.
    listeners.forEach((listen) => listen({ details: { type: "board.changed", properties: { project: "prj_other" } } }))
    listeners.forEach((listen) => listen({ details: { type: "board.changed", properties: { project: base.id } } }))
    await until(() => view.lane("building").includes("LCH-2"), view.host)
    expect(state.gets).toBe(gets + 1)
    expect(view.lane("ready")).toEqual([])
    view.done()
  }, 20000)

  const peek = async (view: Awaited<ReturnType<typeof mount>>) => {
    view.host.querySelector<HTMLElement>('[data-ref="LCH-3"]')!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await until(() => !!view.host.querySelector(".board-peek .board-option"), view.host)
    const button = (text: string) =>
      [...view.host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === text)
    const type = (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      field.value = value
      field.dispatchEvent(new Event("input", { bubbles: true }))
    }
    // A write is done once the server saw it and the view left its busy state.
    const write = async (act: () => void) => {
      const before = state.writes.length
      act()
      await until(() => state.writes.length > before && !view.host.querySelector<HTMLButtonElement>(".board-controls .mx-btn")?.disabled, view.host)
      return state.writes.at(-1)!
    }
    return { button, type, write }
  }

  test("answers, notes, pauses, the merge hold and secrets go to the board API", async () => {
    const view = await mount()
    const ui = await peek(view)
    state.writes = []

    ui.type(view.host.querySelector<HTMLInputElement>(".board-question .board-input")!, "  go with the default  ")
    expect(await ui.write(() => view.host.querySelector<HTMLButtonElement>(".board-peek .board-option")!.click()))
      .toEqual({ path: "/api/board/LCH/question/bq_1/answer", body: { option: "stripe", text: "go with the default" } })

    ui.type(view.host.querySelector<HTMLTextAreaElement>(".board-composer textarea")!, "Use the test keys first")
    expect(await ui.write(() => ui.button("Add note")!.click()))
      .toEqual({ path: "/api/board/LCH/issue/3/note", body: { body: "Use the test keys first" } })
    await until(() => view.host.querySelector<HTMLTextAreaElement>(".board-composer textarea")!.value === "", view.host)

    expect((await ui.write(() => ui.button("Pause issue")!.click())).path).toBe("/api/board/LCH/issue/3/pause")
    expect(await ui.write(() => view.host.querySelector<HTMLButtonElement>('.board-hold [role="switch"]')!.click()))
      .toEqual({ path: "/api/board/LCH/issue/3/hold", body: { hold: true } })
    expect((await ui.write(() => ui.button("Pause project")!.click())).path).toBe("/api/board/LCH/pause")
    await until(() => !!ui.button("Resume project"), view.host)
    expect((await ui.write(() => ui.button("Resume project")!.click())).path).toBe("/api/board/LCH/resume")

    ui.button("Add secret")!.click()
    const [label, value] = [...view.host.querySelectorAll<HTMLInputElement>(".board-secret input")]
    expect(value.type).toBe("password")
    ui.type(label, "STRIPE_LIVE_KEY")
    ui.type(value, "rk-vault-only-value-0001")
    expect(await ui.write(() => ui.button("Save to vault")!.click())).toEqual({
      path: "/api/board/LCH/issue/3/attachment",
      body: { kind: "secret", name: "STRIPE_LIVE_KEY", value: "rk-vault-only-value-0001" },
    })
    await until(() => !view.host.querySelector(".board-secret"), view.host)
    expect(document.body.innerHTML).not.toContain("rk-vault-only-value-0001")
    view.done()
  }, 20000)

  test("a note holding a key is never sent; the key moves to the vault form instead", async () => {
    const view = await mount()
    const ui = await peek(view)
    state.writes = []
    // Split so the repo secret guard does not flag a fake token.
    const token = "ghp" + "_abcdefghijklmnopqrstuvwxyz0123"
    const draft = view.host.querySelector<HTMLTextAreaElement>(".board-composer textarea")!
    ui.type(draft, `Deploy with ${token} please`)
    ui.button("Add note")!.click()
    await until(() => !!view.host.querySelector(".board-caught"), view.host)
    expect(ui.button("Add note")!.disabled).toBe(true)

    ui.button("Store as secret")!.click()
    await until(() => !!view.host.querySelector(".board-secret"), view.host)
    expect(view.host.querySelector<HTMLTextAreaElement>(".board-composer textarea")!.value).toBe("Deploy with  please")
    const [label, value] = [...view.host.querySelectorAll<HTMLInputElement>(".board-secret input")]
    expect(value.value).toBe(token)
    ui.type(label, "GITHUB_TOKEN")
    expect((await ui.write(() => ui.button("Save to vault")!.click())).body).toEqual({ kind: "secret", name: "GITHUB_TOKEN", value: token })
    expect(state.writes.filter((item) => item.path.endsWith("/note"))).toEqual([])
    view.done()
  }, 20000)

  test("undo runs from the activity row and a refusal shows the server's reason inline", async () => {
    const view = await mount()
    const ui = await peek(view)
    state.writes = []
    state.refuse = true
    expect((await ui.write(() => ui.button("Undo")!.click())).path).toBe("/api/board/LCH/activity/act_1/undo")
    await until(() => !!view.host.querySelector(".board-peek .mx-error"), view.host)
    expect(view.host.querySelector(".board-peek .mx-error")?.textContent).toContain("A later change touched the same fields")
    state.refuse = false
    view.done()
  }, 20000)

  test("the peek shows a secret by its label and never prints its value, and Esc closes it", async () => {
    const view = await mount()
    const card = view.host.querySelector<HTMLElement>('[data-ref="LCH-3"]')!
    card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await until(() => !!view.host.querySelector('.board-peek .board-files [data-kind="secret"]'), view.host)
    expect(view.host.querySelector('.board-files [data-kind="secret"]')?.textContent).toContain("STRIPE_TEST_KEY")
    expect(view.host.querySelector(".board-peek")?.textContent).toContain("Tests are green")
    expect(view.host.querySelector(".board-peek")?.textContent).toContain("GitHub not synced")
    expect(view.host.querySelector(".board-peek")?.textContent).toContain("Sign in to GitHub to see this trail")
    expect(document.body.innerHTML).not.toContain(secretValue)

    view.host.querySelector(".board-root")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await until(() => !view.host.querySelector(".board-peek"), view.host)
    view.done()
    server.stop(true)
  }, 20000)
}
