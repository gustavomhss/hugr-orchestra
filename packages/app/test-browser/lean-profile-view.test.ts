import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

async function child(args: string[], env = process.env) {
  const proc = Bun.spawn([Bun.which("bun")!, ...args], {
    cwd: path.resolve(import.meta.dir, ".."),
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 180000,
    killSignal: "SIGKILL",
  })
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0) throw new Error(`${args.join(" ")} exited ${code}\n${out}\n${err}`)
  console.log(out + err)
}

if (process.env.LEAN_PROFILE_VIEW_DOM !== "1") {
  test("selected-profile Lean DOM in browser lane", async () => {
    await child(["--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path], {
      ...process.env,
      LEAN_PROFILE_VIEW_DOM: "1",
    })
  }, 240000)
  test("actual app and Lean DOM fixture types", async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), "lean-view-types-"))
    try {
      const app = path.resolve(import.meta.dir, "..")
      const config = path.join(scratch, "tsconfig.json")
      await Bun.write(
        config,
        JSON.stringify({
          extends: path.join(app, "tsconfig.json"),
          compilerOptions: {
            composite: false,
            declaration: false,
            emitDeclarationOnly: false,
            noEmit: true,
            rootDir: path.resolve(app, "../.."),
            tsBuildInfoFile: path.join(scratch, "types.tsbuildinfo"),
          },
          include: [
            path.join(app, "src"),
            path.join(app, "package.json"),
            import.meta.path,
            path.join(import.meta.dir, "lean-profile-view.test-helper.ts"),
            path.join(import.meta.dir, "lean-project-metrics.test-helper.ts"),
          ],
        }),
      )
      await child(["typecheck", config])
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  }, 240000)
} else {
  const { info, history, mount } = await import("./lean-profile-view.test-helper")
  const { loadLocaleDict } = await import("@/context/language")
  const settle = () => Bun.sleep(0)

  test("native page mounts all catalogue items, paired signed and missing values; filters and labels", async () => {
    const data = info()
    const screen = mount({ data })
    try {
      expect(!!screen.host.querySelector('[data-mx-page="orchestra-lean"]')).toBe(true)
      expect(screen.host.querySelector("h1")?.textContent).toBe("Lean")
      expect(screen.host.textContent).toContain("Profile one")
      expect(screen.host.querySelectorAll("[data-lean-item]")).toHaveLength(32)
      expect([...screen.host.querySelectorAll("tbody bdi")].slice(0, 5).map((node) => node.textContent)).toEqual([
        "Cargo",
        "Go",
        "pytest",
        "Jest",
        "Vitest",
      ])
      expect(screen.host.querySelector('[data-lean-total="bytes"]')?.textContent).toBe("+1 KiB")
      expect(screen.host.querySelector('[data-lean-total="tokens"]')?.textContent).toBe("-4")
      for (const id of ["cargo", "go", "pytest", "jest", "vitest"] as const) {
        expect(screen.row(id).querySelector('[data-lean-value="bytes"]')?.textContent).toBe("0")
        expect(screen.row(id).querySelector('[data-lean-value="tokens"]')?.textContent).toBe("0")
        expect(screen.switch(id).getAttribute("aria-label")).toContain("for this profile")
      }
      expect(screen.row("jest").textContent).toContain("Plaintext preserved")
      expect(screen.row("vitest").textContent).toContain("Plaintext preserved")
      screen.set("data", {
        ...data,
        savings: { ...data.savings, tokenCalls: 1 },
        items: data.items.map((item) =>
          item.id === "cargo"
            ? { ...item, savings: { bytesSaved: null, tokensSaved: null, calls: 1, tokenCalls: 0 } }
            : item,
        ),
      })
      expect(screen.host.querySelector('[data-lean-total="tokens"]')?.textContent).toBe("Unavailable")
      expect(screen.row("cargo").querySelector('[data-lean-value="bytes"]')?.textContent).toBe("Unavailable")
      expect(screen.row("cargo").querySelector('[data-lean-value="tokens"]')?.textContent).toBe("Unavailable")
      const search = screen.host.querySelector<HTMLInputElement>('input[type="search"]')!
      search.value = "pytest"
      search.dispatchEvent(new Event("input", { bubbles: true }))
      expect(screen.host.querySelectorAll("[data-lean-item]")).toHaveLength(1)
      const category = screen.host.querySelector("select")!
      category.value = "build"
      category.dispatchEvent(new Event("change", { bubbles: true }))
      expect(screen.host.textContent).toContain("No items match these filters.")
    } finally {
      screen.close()
    }
  })

  test("pending writes keep original confirmation; failure visible; other item stays independent", async () => {
    const write = Promise.withResolvers<void>()
    const updates: unknown[] = []
    const screen = mount({
      onUpdate(value) {
        updates.push(value)
        screen.set("pending", new Set(["cargo"]))
        return write.promise
      },
    })
    try {
      screen.switch("cargo").click()
      expect(updates).toEqual([{ itemID: "cargo", enabled: false }])
      expect(screen.switch("cargo").disabled).toBe(true)
      expect(screen.switch("cargo").getAttribute("aria-checked")).toBe("true")
      expect(screen.switch("pytest").disabled).toBe(false)
      expect(screen.row("cargo").getAttribute("aria-busy")).toBe("true")
      screen.switch("cargo").click()
      expect(updates).toHaveLength(1)
      write.reject(new Error("write denied"))
      await settle()
      screen.set("pending", new Set())
      expect(screen.host.querySelector('[role="alert"]')?.textContent).toContain("Could not save this change")
      expect(screen.switch("cargo").getAttribute("aria-checked")).toBe("true")
      const data = info()
      screen.set("data", {
        ...data,
        items: data.items.map((item) => (item.id === "cargo" ? { ...item, enabled: false } : item)),
      })
      expect(screen.switch("cargo").getAttribute("aria-checked")).toBe("false")
      expect(screen.switch("pytest").getAttribute("aria-checked")).toBe("true")
      screen.set("pending", new Set(["profile"]))
      expect(screen.host.querySelector<HTMLButtonElement>('.lean-control [role="switch"]')?.disabled).toBe(true)
      expect(screen.switch("pytest").disabled).toBe(true)
    } finally {
      screen.close()
    }
  })

  test("execution disclosure resets on actual profile ID; stale history never crosses profiles", async () => {
    const requests: string[] = []
    const sessions: string[] = []
    const screen = mount({
      history: history(),
      onHistory(id) {
        requests.push(id)
      },
      onOpenSession(id) {
        sessions.push(id)
      },
    })
    try {
      screen.open("cargo")
      expect(requests).toEqual(["cargo"])
      const execution = screen.host.querySelector("[data-lean-execution]")!
      expect(execution.querySelector("code")?.textContent).toBe("cargo test --workspace")
      expect(execution.querySelector("time")?.getAttribute("datetime")).toBe("2025-01-01T00:00:00.000Z")
      expect(execution.textContent).toContain("Completed")
      expect(execution.querySelector('[data-lean-value="bytes"]')?.textContent).toBe("+1,024")
      expect(execution.querySelector('[data-lean-value="tokens"]')?.textContent).toBe("-4")
      execution.querySelector<HTMLButtonElement>("button")!.click()
      expect(sessions).toEqual(["session-one"])
      screen.host.querySelector<HTMLButtonElement>(".lean-detail header button")!.focus()
      screen.host
        .querySelector(".lean-detail")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      expect(document.activeElement?.id).toBe("lean-trigger-cargo")
      expect(screen.row("cargo").querySelector("button")?.getAttribute("aria-expanded")).toBe("false")
      screen.open("cargo")
      screen.set("profileName", "Profile two")
      screen.set("data", info("profile-two"))
      expect(!!screen.host.querySelector(".lean-detail")).toBe(false)
      expect(screen.host.textContent).toContain("Profile two")
      screen.open("cargo")
      expect(!!screen.host.querySelector("[data-lean-execution]")).toBe(false)
      expect(screen.host.textContent).toContain("Execution history is unavailable for this item.")
      screen.set("history", history(info("profile-two")))
      expect(!!screen.host.querySelector("[data-lean-execution]")).toBe(true)
      screen.set("history", { ...history(info("profile-two")), itemID: "pytest" })
      expect(!!screen.host.querySelector("[data-lean-execution]")).toBe(false)
    } finally {
      screen.close()
    }
  })

  test("loading, unsupported, empty and paused states keep honest metrics and controls", () => {
    const screen = mount({ data: undefined, loading: true })
    try {
      for (const metric of ["bytes", "tokens"])
        expect(screen.host.querySelector(`[data-lean-total="${metric}"]`)?.textContent).toBe("Loading…")
      expect(!!screen.host.querySelector('[role="switch"]')).toBe(false)
      screen.set("loading", false)
      screen.set("error", "Backend capability unavailable")
      expect(screen.host.querySelector('[role="alert"]')?.textContent).toBe("Backend capability unavailable")
      expect(screen.host.querySelector('[data-lean-total="bytes"]')?.textContent).toBe("Unavailable")
      expect(screen.host.querySelector('[data-lean-total="tokens"]')?.textContent).toBe("Unavailable")
      screen.set("error", undefined)
      screen.set("data", { ...info(), items: [] })
      expect(screen.host.textContent).toContain("No Lean items are available for this profile.")
      screen.set("data", { ...info(), enabled: false, complete: false })
      expect(screen.host.textContent).toContain("Lean is off for this profile")
      expect(screen.host.textContent).toContain("History is bounded")
      expect(screen.host.querySelector('[data-lean-total="bytes"]')?.textContent).toBe("+1 KiB")
    } finally {
      screen.close()
    }
  })

  test("Portuguese page keeps paired labels and preservation language", async () => {
    await loadLocaleDict("br")
    const screen = mount({}, "br")
    try {
      expect(screen.host.textContent).toContain("Bytes economizados")
      expect(screen.host.textContent).toContain("Tokens economizados estimados")
      expect(screen.row("vitest").textContent).toContain("Texto preservado")
      expect(screen.switch("pytest").getAttribute("aria-label")).toBe("Ativar pytest neste perfil")
      screen.set("data", { ...info(), savings: { ...info().savings, tokenCalls: 1 } })
      expect(screen.host.querySelector(".lean-summary [data-lean-coverage]")?.textContent).toBe(
        "Execuções com estimativa: 1/2",
      )
    } finally {
      screen.close()
    }
  })

  test("mixed token coverage stays visible with unavailable values; exact byte titles and negative tones", () => {
    const data = info()
    const partial = { ...data.savings, tokensSaved: null, tokenCalls: 1 }
    const screen = mount({
      data: {
        ...data,
        savings: partial,
        items: data.items.map((item) => (item.id === "cargo" ? { ...item, savings: partial } : item)),
      },
    })
    try {
      expect(screen.host.querySelector('[data-lean-total="tokens"]')?.textContent).toBe("Unavailable")
      expect(screen.row("cargo").querySelector('[data-lean-value="tokens"]')?.textContent).toBe("Unavailable")
      expect(screen.host.querySelector(".lean-summary [data-lean-coverage]")?.textContent).toBe(
        "Executions with estimates: 1/2",
      )
      expect(screen.row("cargo").querySelector("[data-lean-coverage]")?.textContent).toBe(
        "Executions with estimates: 1/2",
      )
      screen.set("data", { ...screen.props.data!, savings: { ...partial, tokenCalls: 0 } })
      expect(screen.host.querySelector(".lean-summary [data-lean-coverage]")?.textContent).toBe(
        "Executions with estimates: 0/2",
      )
      const negative = { ...data.savings, bytesSaved: -1310720, tokensSaved: -9 }
      screen.set("data", {
        ...data,
        savings: negative,
        items: data.items.map((item) =>
          item.id === "cargo"
            ? { ...item, savings: negative }
            : item.id === "pytest"
              ? { ...item, savings: data.savings }
              : item,
        ),
      })
      const bytes = screen.host.querySelector('[data-lean-total="bytes"]')!
      expect(bytes.textContent).toBe("-1.25 MiB")
      expect(bytes.getAttribute("title")).toBe("Exact UTF-8 bytes: -1,310,720")
      expect(bytes.getAttribute("aria-label")).toBe(bytes.getAttribute("title"))
      expect(bytes.getAttribute("data-tone")).toBe("negative")
      expect(screen.host.querySelector('[data-lean-total="tokens"]')?.getAttribute("data-tone")).toBe("negative")
      expect(screen.row("cargo").querySelector('[data-lean-value="bytes"]')?.textContent).toBe("-1.25 MiB")
      expect(screen.row("cargo").querySelector('[data-lean-value="bytes"]')?.getAttribute("title")).toBe(
        bytes.getAttribute("title"),
      )
      expect(screen.row("pytest").querySelector('[data-lean-value="bytes"]')?.getAttribute("data-tone")).toBe("default")
      expect(screen.row("pytest").querySelector('[data-lean-value="tokens"]')?.getAttribute("data-tone")).toBe(
        "negative",
      )
      expect(screen.row("pytest").querySelector('[data-lean-value="tokens"]')?.textContent).toBe("-4")
      expect(screen.host.querySelectorAll("[data-lean-coverage]")).toHaveLength(0)
    } finally {
      screen.close()
    }
  })

  test("A to B to A clears save errors and rejects late failures; dispatch stays synchronous before profile microtasks", async () => {
    const first = Promise.withResolvers<void>()
    const late = Promise.withResolvers<void>()
    const waits = [first, late]
    const profiles: string[] = []
    const screen = mount({
      onUpdate() {
        profiles.push(screen.props.data!.scope.profileID)
        return waits.shift()!.promise
      },
    })
    try {
      screen.switch("cargo").click()
      expect(profiles).toEqual(["profile-one"])
      first.reject(new Error("first write denied"))
      await settle()
      expect(screen.host.querySelector('[role="alert"]')?.textContent).toContain("Could not save this change")
      screen.set("data", info())
      expect(!!screen.host.querySelector('[role="alert"]')).toBe(true)
      screen.set("data", info("profile-two"))
      screen.set("data", info())
      expect(!!screen.host.querySelector('[role="alert"]')).toBe(false)
      screen.switch("cargo").click()
      screen.set("data", info("profile-two"))
      expect(profiles).toEqual(["profile-one", "profile-one"])
      queueMicrotask(() => screen.set("data", info()))
      late.reject(new Error("late write denied"))
      await settle()
      expect(screen.props.data?.scope.profileID).toBe("profile-one")
      expect(!!screen.host.querySelector('[role="alert"]')).toBe(false)
      expect(screen.switch("cargo").getAttribute("aria-checked")).toBe("true")
    } finally {
      screen.close()
    }
  })
}
