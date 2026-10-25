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
// a child process of its own, like the Lean DOM lanes.
if (process.env.GUARDRAILS_DOM !== "1") {
  test("the Guardrails view runs the guards through the server and presents the report", async () => {
    await child(["--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path], {
      ...process.env, GUARDRAILS_DOM: "1",
    })
  }, 240000)
} else {
  const { createComponent, render } = await import("./lean-dom.test-helper")
  const { solidDom } = await import("./solid-dom")
  const { Orchestra } = await import("@orchestra/client")
  const { rules, scenarios }: typeof import("@/orchestra/chapters/guardrails/fixture") = await import(
    solidDom("@/orchestra/chapters/guardrails/fixture", import.meta.dir)
  )
  const { groupFindings }: typeof import("@/orchestra/chapters/guardrails/model") = await import(
    solidDom("@/orchestra/chapters/guardrails/model", import.meta.dir)
  )

  // The first rule ships without a summary, as rule files may until one is written.
  const served = rules.map((rule, index) => (index === 0 ? { ...rule, summary: null } : rule))
  const location = { directory: "/work/project", project: { id: "prj_1", directory: "/work/project" } }
  const state = { run: "blocked" as keyof typeof scenarios | "no-engine", runs: 0, directories: [] as string[] }
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    const url = new URL(request.url)
    state.directories.push(url.searchParams.toString())
    if (url.pathname === "/api/guardrail/rules") return Response.json({ location, data: { rules: served, errors: [] } })
    if (url.pathname !== "/api/guardrail/run") return new Response("not found", { status: 404 })
    state.runs++
    if (state.run === "no-engine")
      return Response.json(
        { name: "GuardrailError", data: { kind: "no-engine", message: "script/guards is missing in /work/project" } },
        { status: 400 },
      )
    return Response.json({ location, data: scenarios[state.run] })
  } })

  // External context fixture only; the real generated client talks to the fixture server and the real view renders.
  mock.module(solidDom("@/context/server-sdk", import.meta.dir), () => ({
    useServerSDK: () => () => ({ orchestra: Orchestra.make({ baseUrl: server.url.origin }) }),
  }))
  const { default: Guardrails }: typeof import("@/orchestra/chapters/guardrails/guardrails") = await import(
    solidDom("@/orchestra/chapters/guardrails/guardrails", import.meta.dir)
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

  const mount = () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const dispose = render(() => createComponent(PlatformProvider, {
      value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
      get children() { return createComponent(LanguageProvider, { locale: "en", get children() {
        return createComponent(Guardrails, { directory: "/work/project" })
      } }) },
    }), host)
    const tab = (name: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((item) => item.textContent?.startsWith(name))
    return { host, tab, done: () => (dispose(), host.remove()) }
  }

  test("a blocked change leads to its first gate and the way forward its rule allows", async () => {
    state.run = "blocked"
    const view = mount()
    await until(() => !!view.host.querySelector('.gr-status[data-kind="blocked"]'), view.host)
    expect(state.directories.every((query) => query.includes("work%2Fproject"))).toBe(true)
    // No fixture note in production: these findings came from the server.
    expect(view.host.querySelector(".mx-note")).toBeNull()
    const gates = scenarios.blocked.findings.filter((finding) => finding.severity === "gate").length
    expect(view.host.querySelector(".gr-count-gate")?.textContent).toBe(`${gates}`)

    const first = groupFindings(scenarios.blocked.findings)[0].items[0]
    ;[...view.host.querySelectorAll<HTMLButtonElement>(".gr-status-actions .mx-btn")]
      .find((button) => button.textContent === "Go to the first")
      ?.click()
    await until(() => !!view.host.querySelector(".gr-detail-top h3"), view.host)
    expect(view.host.querySelector(".gr-detail-top h3")?.textContent).toBe(first.rule)
    const clearedBy = served.find((rule) => rule.id === first.rule)?.clearedBy
    const lines = [...view.host.querySelectorAll(".gr-way .gr-copyline code")].map((code) => code.textContent)
    if (clearedBy === "fix") expect(lines).toEqual([])
    if (clearedBy === "ignore") expect(lines).toEqual([expect.stringStartingWith(`guardrail-ignore: ${first.rule} `)])
    if (clearedBy === "approval") expect(lines).toEqual([`guardrail-approved:${first.rule}`])

    // Escape returns to the fired rules, one line per rule.
    view.host.querySelector(".gr-root")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await until(() => !!view.host.querySelector(".gr-fired"), view.host)
    const fired = new Set(scenarios.blocked.findings.map((finding) => finding.rule))
    expect(view.host.querySelectorAll(".gr-fired-row")).toHaveLength(fired.size)
    view.done()
  }, 20000)

  test("the Rules tab lists the server's rules, filters them and opens one", async () => {
    state.run = "clean"
    const view = mount()
    await until(() => !!view.host.querySelector('.gr-status[data-kind="clean"]'), view.host)
    view.tab("Rules")?.click()
    await until(() => view.host.querySelectorAll(".gr-rule").length === served.length, view.host)

    const search = view.host.querySelector<HTMLInputElement>(".gr-search input")!
    search.value = served[1].id
    search.dispatchEvent(new Event("input", { bubbles: true }))
    await until(() => view.host.querySelectorAll(".gr-rule").length < served.length, view.host)
    expect([...view.host.querySelectorAll(".gr-rule code")].map((code) => code.textContent)).toContain(served[1].id)

    // A rule without a summary shows its message and nothing in the summary's place.
    search.value = served[0].id
    search.dispatchEvent(new Event("input", { bubbles: true }))
    await until(() => !!view.host.querySelector(".gr-rule"), view.host)
    ;[...view.host.querySelectorAll<HTMLButtonElement>(".gr-rule")]
      .find((button) => button.querySelector("code")?.textContent === served[0].id)
      ?.click()
    await until(() => !!view.host.querySelector(".gr-detail .gr-message"), view.host)
    expect(view.host.querySelector(".gr-detail .gr-message")?.textContent).toBe(served[0].message)
    expect(rules[0].summary).toBeTruthy()
    expect(view.host.querySelector(".gr-detail")?.textContent).not.toContain(rules[0].summary!)
    view.done()
  }, 20000)

  test("an engine that cannot run reads as disconnected with its reason, and Check again reruns it", async () => {
    state.run = "no-engine"
    const view = mount()
    await until(() => !!view.host.querySelector(".gr-failure"), view.host)
    expect(view.host.querySelector(".mx-empty strong")?.textContent).toBe("The guards could not run on this project")
    expect(view.host.querySelector(".gr-failure")?.textContent).toBe("script/guards is missing in /work/project")
    expect(view.host.querySelector(".gr-status")).toBeNull()

    const runs = state.runs
    state.run = "warnings"
    ;[...view.host.querySelectorAll<HTMLButtonElement>(".mx-empty .mx-btn")]
      .find((button) => button.textContent === "Check again")
      ?.click()
    await until(() => !!view.host.querySelector('.gr-status[data-kind="warnings"]'), view.host)
    expect(state.runs).toBe(runs + 1)
    expect(view.host.querySelector(".gr-failure")).toBeNull()
    view.done()
    server.stop(true)
  }, 20000)
}
