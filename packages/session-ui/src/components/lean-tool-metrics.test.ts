import { expect, test } from "bun:test"
import { createRequire } from "node:module"
import type { LeanMetrics } from "../../../schema/src/lean-metrics"
import type { ToolPart } from "@orchestra/sdk/v2"

// Keep browser conditions and HappyDOM isolated from the package's non-DOM tests.
if (process.env.LEAN_TOOL_METRICS_DOM !== "1") {
  test("real Solid DOM Lean metrics", async () => {
    const child = Bun.spawn([
      process.execPath, "--conditions=browser", "test", "--preload", "../app/happydom.ts", import.meta.path,
    ], { env: { ...process.env, LEAN_TOOL_METRICS_DOM: "1" }, stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ])
    console.log(stdout + stderr)
    expect(code).toBe(0)
  }, 120_000)
  test("changed UI packages typecheck in CI", async () => {
    for (const cwd of [".", "../ui"]) {
      const child = Bun.spawn([process.execPath, "typecheck"], { cwd, stdout: "pipe", stderr: "pipe" })
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
      ])
      console.log(`${cwd}: ${stdout}${stderr}`)
      expect(code).toBe(0)
    }
  }, 120_000)
} else {
  // Use the existing UI compiler, not Bun's React JSX transform. No component/decoder mock.
  const solid = createRequire(Bun.resolveSync("vite-plugin-solid", `${import.meta.dir}/../../../ui`))
  Bun.plugin({
    name: "lean-tool-metrics-solid-dom",
    setup(build) {
      // Match Vite's asset URL imports; this test never starts a markdown worker.
      build.onLoad({ filter: /\?(worker&)?url$/ }, (args) => ({
        contents: `export default ${JSON.stringify(args.path)}`, loader: "js",
      }))
      build.onLoad({ filter: /\.tsx$/ }, async (args) => {
        const result = await solid("@babel/core").transformAsync(await Bun.file(args.path).text(), {
          filename: args.path,
          presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
          parserOpts: { plugins: ["jsx", "typescript"] },
          configFile: false,
          babelrc: false,
        })
        return { contents: result.code, loader: "ts" }
      })
    },
  })
  const { createSignal, createComponent } = await import("solid-js")
  const { render } = await import("solid-js/web")
  const { I18nProvider } = await import("@orchestra/ui/context/i18n")
  const { LeanToolMetrics } = await import("./lean-tool-metrics")
  const { LeanMetrics } = await import("../../../schema/src/lean-metrics")
  const en = await import("@orchestra/ui/i18n/en")
  const br = await import("@orchestra/ui/i18n/br")
  const metric: LeanMetrics.Decision = {
    version: 1, scope: "standard-registry",
    owner: { projectID: "repo-alpha", location: "/workspace/alpha", sessionID: "ses_alpha", callID: "call_alpha" },
    model: { provider: "provider", id: "model" }, engine: "hugr-lean@0.2.0:4e46ae0534937bdf",
    producer: "native-shell", eligible: true, status: "applied", reason: "reduced", filterProfile: "git-status",
    bytes: { before: 1200, after: 600, saved: 600 },
    tokens: { kind: "estimated", counter: "chars-per-token-4", before: 300, after: 150, saved: 150 },
    durationMs: 1.25,
  }
  if (!LeanMetrics.decode(metric)) test.todo("WP-M dependency: valid completed metadata renders through real decoder", () => {})

  function mount(initial = metric, locale = "en") {
    const host = document.createElement("div")
    const [record, update] = createSignal(initial)
    const [language, setLanguage] = createSignal(locale)
    const dispose = render(() => createComponent(I18nProvider, {
      value: {
        locale: language,
        t: (key, params) => {
          const dictionary: Record<string, string> = language() === "pt-BR" ? br.dict : en.dict
          return (dictionary[key] ?? en.dict[key]!).replace(/{{\s*(\w+)\s*}}/g, (_, key) => String(params?.[key] ?? ""))
        },
        plural: () => { throw new Error("No plural copy in Lean tool metrics") },
      },
      get children() { return createComponent(LeanToolMetrics, { get metric() { return record() } }) },
    }), host)
    const value = (slot: string) => host.querySelector(`[data-slot="${slot}"]`)?.textContent
    return { host, update, setLanguage, value, dispose }
  }

  test("renders repository scope, exact bytes, explicitly estimated tokens, counter and projection latency", () => {
    const view = mount()
    expect(view.host.querySelector("section")?.getAttribute("aria-label")).toBe("Lean · Repository/project: repo-alpha")
    expect(view.host.querySelector("section")?.firstElementChild?.textContent).toContain("repo-alpha")
    expect(view.value("bytes-before")).toBe("1,200")
    expect(view.value("bytes-after")).toBe("600")
    expect(view.value("bytes-saved")).toBe("600")
    expect(view.value("percent-saved")).toBe("50%")
    expect(view.value("tokens-before")).toBe("300")
    expect(view.value("tokens-after")).toBe("150")
    expect(view.value("tokens-saved")).toBe("150")
    expect([...view.host.querySelectorAll("dt")].map((node) => node.textContent)).toContain("Estimated tokens before")
    expect(view.host.querySelector('[data-slot="tokens-before"]')?.getAttribute("title")).toBe("Local estimate, not an exact token count")
    expect(view.host.querySelector('[data-slot="bytes-before"]')?.getAttribute("title")).toContain("Exact UTF-8")
    expect(view.value("token-counter")).toBe("chars-per-token-4")
    expect(view.value("status")).toBe("Applied")
    expect(view.value("reason")).toBe("reduced")
    expect(view.value("filter-profile")).toBe("git-status")
    expect(view.value("duration")).toBe("1.25 ms")
    view.dispose()
  })

  test("updates same component across two repositories without stale values or profile confusion", () => {
    const view = mount({ ...metric, orchestraProfile: "orchestra-alpha" })
    view.update({ ...metric, owner: { ...metric.owner, projectID: "repo-beta" },
      orchestraProfile: "orchestra-beta", filterProfile: "pytest", status: "normalized", reason: "normalized",
      bytes: { before: 100, after: 25, saved: 75 },
      tokens: { kind: "estimated", counter: "chars-per-token-4", before: 25, after: 7, saved: 18 }, durationMs: 2.5 })
    expect(view.host.querySelector("section")?.getAttribute("aria-label")).toContain("repo-beta")
    expect(view.value("bytes-before")).toBe("100")
    expect(view.value("bytes-after")).toBe("25")
    expect(view.value("percent-saved")).toBe("75%")
    expect(view.value("tokens-after")).toBe("7")
    expect(view.value("tokens-saved")).toBe("18")
    expect(view.value("status")).toBe("Normalized")
    expect(view.value("reason")).toBe("normalized")
    expect(view.value("duration")).toBe("2.5 ms")
    expect(view.value("filter-profile")).toBe("pytest")
    expect(view.host.textContent).toContain("Lean filter profile")
    expect(view.host.textContent).not.toContain("repo-alpha")
    expect(view.host.textContent).not.toContain("orchestra-beta")
    view.dispose()
  })

  test("keeps signed negative token savings, zero estimates and unavailable distinct; zero denominator is not 100%", () => {
    const view = mount({ ...metric, tokens: { kind: "estimated", counter: "chars-per-token-4", before: 2, after: 3, saved: -1 } })
    expect(view.value("tokens-saved")).toBe("-1")
    view.update({ ...metric, bytes: { before: 0, after: 0, saved: 0 },
      tokens: { kind: "estimated", counter: "chars-per-token-4", before: 0, after: 0, saved: 0 } })
    expect(view.value("percent-saved")).toBe("Not applicable (zero bytes before)")
    expect(view.value("tokens-before")).toBe("0")
    expect(view.value("tokens-after")).toBe("0")
    expect(view.value("tokens-saved")).toBe("0")
    view.update({ ...metric, tokens: { kind: "unavailable" }, filterProfile: undefined, status: "passthrough", reason: "disabled" })
    expect(view.value("tokens-unavailable")).toBe("Unavailable")
    expect(view.value("tokens-before")).toBeUndefined()
    expect(view.value("token-counter")).toBeUndefined()
    expect(view.value("filter-profile")).toBe("Unavailable")
    expect(view.value("status")).toBe("Passed through")
    expect(view.value("reason")).toBe("disabled")
    view.dispose()
  })

  test("Portuguese labels, number formatting and live locale changes preserve estimate framing", () => {
    const view = mount(metric, "pt-BR")
    expect(view.host.querySelector("section")?.getAttribute("aria-label")).toBe("Lean · Repositório/projeto: repo-alpha")
    expect(view.host.textContent).toContain("Tokens estimados economizados (com sinal)")
    expect(view.host.textContent).toContain("Perfil de filtro Lean")
    expect(view.value("bytes-before")).toBe("1.200")
    expect(view.value("duration")).toBe("1,25 ms")
    expect(view.value("status")).toBe("Aplicado")
    expect(view.host.querySelector('[data-slot="tokens-before"]')?.getAttribute("title")).toContain("Estimativa local")
    view.setLanguage("en")
    expect(view.host.textContent).toContain("Estimated tokens saved (signed)")
    expect(view.value("duration")).toBe("1.25 ms")
    view.dispose()
  })

  test("actual ToolPartDisplay preserves output and hides invalid or incomplete metadata", async () => {
    const { PART_MAPPING, ToolRegistry } = await import("./message-part")
    const { DataProvider } = await import("../context/data")
    ToolRegistry.register({ name: "lean-dom-test", render: (props) => {
      const node = document.createElement("span")
      node.textContent = props.output ?? "pending"
      return node
    } })
    const part: ToolPart = { id: "part_alpha", sessionID: "ses_alpha", messageID: "msg_alpha", callID: "call_alpha",
      type: "tool", tool: "lean-dom-test",
      state: { status: "completed", input: {}, output: "original output", title: "result", metadata: {}, time: { start: 0, end: 1 } } }
    const host = document.createElement("div")
    const [current, update] = createSignal(part)
    const dispose = render(() => createComponent(DataProvider, {
      directory: "/workspace/alpha",
      data: { session: [], session_status: {}, session_diff: {}, message: {}, part: {} },
      get children() { return createComponent(PART_MAPPING.tool!, {
        get part() { return current() },
        message: { id: "msg_alpha", sessionID: "ses_alpha", role: "user", time: { created: 0 },
          agent: "backend", model: { providerID: "provider", modelID: "model" } },
      }) },
    }), host)
    expect(host.querySelector('[data-component="tool-part-wrapper"]')).not.toBeNull()
    expect(host.textContent).toContain("original output")
    for (const lean of [undefined, null, { version: 99 }, { ...metric, bytes: { before: -1 } }]) {
      update({ ...part, state: { ...part.state, status: "completed", input: {}, output: "original output", title: "result", metadata: { lean }, time: { start: 0, end: 1 } } })
      expect(host.querySelector('[data-component="lean-tool-metrics"]')).toBeNull()
    }
    update({ ...part, state: { status: "running", input: {}, metadata: { lean: metric }, time: { start: 0 } } })
    expect(host.querySelector('[data-component="lean-tool-metrics"]')).toBeNull()
    // Positive wrapper visibility is checked only with WP-M's real decoder; never substitute a stub.
    update({ ...part, state: { status: "completed", input: {}, output: "original output", title: "result", metadata: { lean: metric }, time: { start: 0, end: 1 } } })
    if (LeanMetrics.decode(metric)) expect(host.querySelector('[data-component="lean-tool-metrics"]')).not.toBeNull()
    expect(host.textContent).toContain("original output")
    dispose()
  })
}
