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
  const project = {
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
  }
  const page = (number: number) => ({
    issue: state.issues.find((item) => item.number === number),
    questions: [],
    notes: [],
    // The server never sends a secret's value; the extra field proves the view would not print one if it did.
    attachments: [
      { id: "att_1", issue: number, kind: "secret", name: "STRIPE_TEST_KEY", mime: null, size: null, timeCreated: now, value: secretValue },
    ],
    activity: [{ id: "act_1", issue: number, actor: "maestro", action: "issue.move", reason: "Tests are green", before: null, after: null, undoes: null, undoneBy: null, timeCreated: now }],
    dependencies: { dependsOn: [], blocks: [] },
    trail: { state: "signed_out", message: "Sign in to GitHub to see this trail" },
  })
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    const url = new URL(request.url)
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
    listeners.forEach((listen) => listen({ details: { type: "board.changed", properties: { project: project.id } } }))
    await until(() => view.lane("building").includes("LCH-2"), view.host)
    expect(state.gets).toBe(gets + 1)
    expect(view.lane("ready")).toEqual([])
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
