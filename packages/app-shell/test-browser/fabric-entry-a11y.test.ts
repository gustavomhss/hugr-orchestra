import { expect, test } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Omni } from "@orchestra/core/omni"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import type { ServerConnection } from "../src/context/server"

if (process.env.FABRIC_ENTRY_A11Y_DOM !== "1") {
  test("Fabric native entry DOM accessibility in isolated browser lane", async () => {
    expectSpawn(import.meta.path)
    const before = Omni.snapshot()
    const result = await Effect.runPromise(AppProcess.Service.use((app) => app.run(
      ChildProcess.make(process.execPath, ["--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path], {
        cwd: path.resolve(import.meta.dir, ".."), env: { ...process.env, FABRIC_ENTRY_A11Y_DOM: "1" },
      }), { timeout: 60000 },
    )).pipe(Effect.provide(LayerNode.compile(AppProcess.node))))
    const output = result.stdout.toString() + result.stderr.toString()
    expect(result.exitCode, output).toBe(0)
    expect(output).toMatch(/\b[1-9]\d* pass\b/)
    expect(output).not.toMatch(/\b[1-9]\d* skip\b/)
    expect(Omni.snapshot().spawns).toBeGreaterThan(before.spawns)
    expect(Omni.snapshot().delegations).toBe(before.delegations)
    console.log(output)
  }, 90000)
} else {
  const { FabricEntryFixture } = await import("./fabric-entry-fixture")
  const { solidDom } = await import("./solid-dom")
  const { navigation, breadcrumbLabel }: typeof import("../src/orchestra/navigation") =
    await import(solidDom("../src/orchestra/navigation", import.meta.dir))
  const { currentRoute }: typeof import("../src/context/layout-route") =
    await import(solidDom("../src/context/layout-route", import.meta.dir))

  // Happy DOM proves names/focus and the app's Escape handler, not native Tab/Enter, paint or theme contrast.
  // Real keyboard, dark/light and visual craft remain explicitly judged gates in CONTEXT-ENTRY-WAVE.
  test("FEN06 native kit, navigation names and local-only confirmation preserve DOM focus without hidden effects", async () => {
    expect(navigation.filter((item) => String(item.id) === "lean")).toHaveLength(1)
    const entries = navigation.filter((item) => String(item.id) === "fabric")
    expect(entries, "FEN06 Fabric navigation entry is not registered").toHaveLength(1)
    const route = currentRoute(`/orchestra/${entries[0]!.id}`, "")
    expect(route).toEqual({ type: "chapter", chapter: "fabric" })
    expect(breadcrumbLabel(route)).toBe(entries[0]!.label)

    const connection: ServerConnection.Http = { type: "http", http: {
      url: "http://fabric-a11y.fixture", password: "synthetic-private-password",
    } }
    const info = FabricEntryFixture.context("/managed/a11y")
    const initial = FabricEntryFixture.held(200, { items: [] })
    const store = { created: false, removed: false, lists: 0 }
    const removes: unknown[] = []
    const f = await FabricEntryFixture.make({ servers: [connection], selected: FabricEntryFixture.key(connection),
      handle: async (request) => {
        const url = new URL(request.url)
        expect(url.origin).toBe(connection.http.url)
        if (url.pathname === "/api/fabric/contexts" && request.method === "GET") {
          store.lists++
          if (store.lists === 1) return initial.response
          return Response.json({ items: store.created && !store.removed ? [info.context] : [] })
        }
        if (url.pathname === "/api/fabric/contexts/preparing") return Response.json({ items: [] })
        if (url.pathname === "/api/fabric/contexts" && request.method === "POST") {
          expect(await request.json()).toEqual({})
          expect(request.headers.get("idempotency-key")?.trim().length).toBeGreaterThan(0)
          store.created = true
          return Response.json(info)
        }
        if (url.pathname === "/api/fabric/contexts/remove") {
          expect(request.method).toBe("POST")
          const body: unknown = await request.json()
          removes.push(body)
          expect(body).toEqual(info.context)
          expect(request.headers.get("idempotency-key")?.trim().length).toBeGreaterThan(0)
          store.removed = true
          return Response.json({ id: info.context.id, generation: info.context.generation + 1 })
        }
        expect(url.pathname).toBe(`/api/fabric/contexts/${info.context.id}`)
        expect(request.method).toBe("GET")
        expect(url.searchParams.get("generation")).toBe(String(info.context.generation))
        return Response.json(info)
      },
    })
    const dialog = () => document.querySelector<HTMLElement>('[data-component="dialog"] [role="dialog"], [data-component="dialog"] [role="alertdialog"]')
    try {
      await initial.reading
      expect(f.mounts).toEqual([])
      expect(f.host.querySelector('[aria-busy="true"], [role="status"]')).not.toBeNull()
      initial.release()
      await f.until(() => !!f.host.querySelector('button[data-fabric-action="create"]:not(:disabled)'))
      const page = f.host.querySelector<HTMLElement>(".mx-page")
      expect(page).not.toBeNull()
      expect(page!.getAttribute("aria-labelledby")).toBeTruthy()
      expect(f.host.querySelector("h1")?.textContent).toBe("Fabric Studio")
      const create = f.button("create")
      expect(create.textContent?.trim()).toBeTruthy()
      expect(create.type).toBe("button")
      create.focus()
      expect(document.activeElement).toBe(create)
      expect(f.requests.every((request) => request.method === "GET")).toBe(true)
      create.click()
      await f.until(() => f.mounts.filter((entry) => !entry.disposed && entry.directory === info.location.directory).length === 2)
      const revoke = f.button("revoke-context", info.context.id)
      expect(revoke.textContent?.trim() || revoke.getAttribute("aria-label")).toBeTruthy()
      revoke.focus()
      revoke.click()
      await f.until(() => dialog() !== null)
      expect(removes).toEqual([])
      const current = dialog()!
      const describedBy = current.getAttribute("aria-describedby")?.split(/\s+/).filter(Boolean) ?? []
      const description = describedBy.map((id) => document.getElementById(id)?.textContent ?? "").join(" ")
      expect(current.getAttribute("aria-labelledby")).toBeTruthy()
      expect(description).toContain("only revokes the local context")
      expect(description).toContain("does not delete files or Microsoft Fabric data")
      await f.until(() => dialog()?.contains(document.activeElement) === true)
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await f.until(() => dialog() === null && document.activeElement === revoke)
      expect(removes).toEqual([])
      revoke.click()
      await f.until(() => dialog() !== null)
      const confirm = f.button("confirm-remove")
      expect(confirm.textContent?.trim() || confirm.getAttribute("aria-label")).toBeTruthy()
      confirm.click()
      await f.until(() => removes.length === 1 && dialog() === null
        && f.mounts.every((entry) => entry.disposed))
      expect(removes).toEqual([info.context])
      expect(f.requests.some((request) => request.method === "DELETE")).toBe(false)
      expect(f.host.outerHTML).not.toContain("synthetic-private-password")
      expect(f.errors).toEqual([])
    } finally {
      initial.release()
      f.dispose()
    }
  }, 15000)
}
