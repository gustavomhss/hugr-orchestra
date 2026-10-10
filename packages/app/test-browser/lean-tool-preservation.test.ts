import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { AssistantMessage, Session, ToolPart } from "@orchestra/sdk/v2/client"

if (process.env.LEAN_WRAPPER_DOM !== "1") {
  for (const name of ["production wrapper benchmark", "rejected Lean wrapper removed preserves output and errors"]) {
    test(name, async () => {
      const child = Bun.spawn([process.execPath, "--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path, "-t", name], {
        env: { ...process.env, LEAN_WRAPPER_DOM: "1" }, stdout: "pipe", stderr: "pipe", timeout: 120000,
      })
      const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      if (code !== 0) throw new Error(`${name} exited ${code}\n${out}\n${err}`)
      console.log(out + err)
    }, 180000)
  }
  test("actual app and production wrapper fixture types", async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), "lean-wrapper-types-"))
    try {
      const app = path.resolve(import.meta.dir, "..")
      const config = path.join(scratch, "tsconfig.json")
      await Bun.write(config, JSON.stringify({ extends: path.join(app, "tsconfig.json"), compilerOptions: {
        composite: false, declaration: false, emitDeclarationOnly: false, noEmit: true,
        rootDir: path.resolve(app, "../.."), tsBuildInfoFile: path.join(scratch, "types.tsbuildinfo"),
      }, include: [path.join(app, "src"), path.join(app, "package.json"), import.meta.path,
        path.join(import.meta.dir, "lean-project-metrics.test-helper.ts")],
      }))
      const child = Bun.spawn([process.execPath, "typecheck", config], { cwd: app, stdout: "pipe", stderr: "pipe", timeout: 120000 })
      const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      if (code !== 0) throw new Error(`Wrapper fixture typecheck exited ${code}\n${out}\n${err}`)
      console.log(out + err)
    } finally { await rm(scratch, { recursive: true, force: true }) }
  }, 180000)
} else {
  const { createComponent, render, decision } = await import("./lean-project-metrics.test-helper")
  Bun.plugin({ name: "lean-wrapper-assets", setup(build) {
    build.onLoad({ filter: /\?(worker&)?url$/ }, (args) => ({ contents: `export default ${JSON.stringify(args.path)}`, loader: "js" }))
  } })
  const { PART_MAPPING, ToolRegistry } = await import("../../session-ui/src/components/message-part")
  const { DataProvider } = await import("../../session-ui/src/context/data")
  const { LanguageProvider } = await import("@/context/language")
  const { PlatformProvider } = await import("@/context/platform")
  const { LeanMetrics } = await import("@orchestra/schema/lean-metrics")
  const session: Session = { id: "session", projectID: "repo", directory: "/repo", slug: "fixture", title: "fixture", version: "fixture", time: { created: 1, updated: 1 } }
  const message: AssistantMessage = { id: "message", sessionID: "session", role: "assistant", parentID: "user",
    providerID: "provider", modelID: "model", mode: "build", agent: "build", path: { cwd: "/repo", root: "/repo" },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: 1, completed: 2 } }
  const metric = decision("call", { owner: { projectID: "repo", location: "/repo", sessionID: "session", callID: "call" } })
  const part: ToolPart = { id: "part", sessionID: "session", messageID: "message", callID: "call", type: "tool", tool: "bash",
    state: { status: "completed", input: { command: "unknown-command --literal 'unchanged input'" },
      output: "UNKNOWN OUTPUT\nline 2 ✓\n", title: "fixture", metadata: { lean: metric }, time: { start: 1, end: 2 } } }
  function mount(current: ToolPart) {
    const host = document.createElement("div")
    document.body.append(host)
    const data = { session: [session], message: { session: [message] }, part: { message: [current] }, session_status: {}, session_diff: {} }
    const dispose = render(() => createComponent(PlatformProvider, {
      value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} }, get children() {
        return createComponent(LanguageProvider, { locale: "en", get children() {
          return createComponent(DataProvider, { data, directory: "/repo", get children() {
            return createComponent(PART_MAPPING.tool!, { part: current, message, defaultOpen: true, deferToolContent: false })
          } })
        } })
      },
    }), host)
    return { host, close() { dispose(); host.remove() } }
  }

  test("production wrapper benchmark", async () => {
    expect(ToolRegistry.render("bash")).toBeDefined()
    expect(LeanMetrics.decode(metric)).toBeDefined()
    const times: number[] = []
    let panels = 0
    for (let n = 0; n < 15; n++) {
      const start = performance.now()
      const screen = mount(part)
      times.push(performance.now() - start)
      expect(screen.host.querySelector('[data-component="tool-part-wrapper"]')).not.toBeNull()
      expect(screen.host.querySelector('[data-slot="bash-pre"] code')?.textContent).toBe("$ unknown-command --literal 'unchanged input'\n\nUNKNOWN OUTPUT\nline 2 ✓\n")
      panels += screen.host.querySelectorAll('[data-component="lean-tool-metrics"]').length
      screen.close()
      await Bun.sleep(0)
    }
    times.sort((a, b) => a - b)
    console.log(`WRAPPER_BENCH ${JSON.stringify({ renderer: "production PART_MAPPING.tool + bash", host: "CI Happy DOM", samples: times.length,
      medianMs: times[7], p95Ms: times[14], leanPanels: panels })}`)
  })

  test("rejected Lean wrapper removed preserves output and errors", () => {
    expect(LeanMetrics.decode(metric)).toBeDefined()
    const screen = mount(part)
    try {
      expect(screen.host.querySelector('[data-component="tool-part-wrapper"]')).not.toBeNull()
      expect(screen.host.querySelector('[data-slot="bash-pre"] code')?.textContent).toBe("$ unknown-command --literal 'unchanged input'\n\nUNKNOWN OUTPUT\nline 2 ✓\n")
      expect(!!screen.host.querySelector('[data-component="lean-tool-metrics"]')).toBe(false)
    } finally { screen.close() }
    const failed = mount({ ...part, state: { status: "error", input: part.state.input,
      error: "literal failure diagnostic ✓", metadata: { lean: metric }, time: { start: 1, end: 2 } } })
    try {
      expect(failed.host.querySelector('[data-component="tool-part-wrapper"]')).not.toBeNull()
      expect(failed.host.querySelector('[data-slot="tool-error-card-content"]')?.textContent).toBe("literal failure diagnostic ✓")
      expect(!!failed.host.querySelector('[data-component="lean-tool-metrics"]')).toBe(false)
    } finally { failed.close() }
  })
}
