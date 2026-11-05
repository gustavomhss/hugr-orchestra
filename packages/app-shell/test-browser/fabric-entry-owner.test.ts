import { expect, test } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Omni } from "@orchestra/core/omni"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import type { ServerConnection } from "../src/context/server"

if (process.env.FABRIC_ENTRY_OWNER_DOM !== "1") {
  test("Fabric context ownership acceptance in isolated browser lane", async () => {
    expectSpawn(import.meta.path)
    const before = Omni.snapshot()
    const result = await Effect.runPromise(AppProcess.Service.use((app) => app.run(
      ChildProcess.make(process.execPath, ["--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path], {
        cwd: path.resolve(import.meta.dir, ".."), env: { ...process.env, FABRIC_ENTRY_OWNER_DOM: "1" },
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

  test("FEN02 explicit pagination and resolve mount actual providers only at the returned context Location", async () => {
    const connection: ServerConnection.Http = { type: "http", http: { url: "http://fabric-pages.fixture", password: "synthetic-pages" } }
    const a = FabricEntryFixture.context("/managed/pages-a")
    const b = FabricEntryFixture.context("/managed/pages-b")
    const resolve = FabricEntryFixture.held(200, b)
    const cursors: (string | null)[] = []
    const f = await FabricEntryFixture.make({ servers: [connection], selected: FabricEntryFixture.key(connection),
      directory: "/wrong-git-selection", handle: (request) => {
        const url = new URL(request.url)
        expect(url.origin).toBe(connection.http.url)
        expect(request.method).toBe("GET")
        expect(request.headers.get("authorization")).toBe(`Basic ${btoa("orchestra:synthetic-pages")}`)
        expect(url.searchParams.has("location[directory]")).toBe(false)
        expect(url.searchParams.has("workspaceID")).toBe(false)
        if (url.pathname === "/api/fabric/contexts") {
          const after = url.searchParams.get("after")
          cursors.push(after)
          if (after === null) return Response.json({ items: [a.context], after: a.context.id })
          expect(after).toBe(a.context.id)
          return Response.json({ items: [b.context] })
        }
        if (url.pathname === "/api/fabric/contexts/preparing") return Response.json({ items: [] })
        expect(url.pathname).toBe(`/api/fabric/contexts/${b.context.id}`)
        expect(url.searchParams.get("generation")).toBe(String(b.context.generation))
        expect(request.headers.has("idempotency-key")).toBe(false)
        return resolve.response
      },
    })
    try {
      await f.until(() => f.host.textContent?.includes(a.context.id) === true
        && f.requests.some((request) => new URL(request.url).pathname.endsWith("/preparing")))
      expect(cursors).toEqual([null])
      expect(f.host.textContent).not.toContain(b.context.id)
      expect(f.mounts).toEqual([])
      f.button("list-more").click()
      await f.until(() => f.host.textContent?.includes(b.context.id) === true)
      expect(cursors).toEqual([null, a.context.id])
      expect(f.mounts).toEqual([])
      f.button("open", b.context.id).click()
      await resolve.reading
      expect(f.mounts).toEqual([])
      resolve.release()
      await f.until(() => f.mounts.filter((entry) => !entry.disposed).length === 2)
      expect(f.mounts.filter((entry) => !entry.disposed).map((entry) => [entry.kind, entry.directory]).sort())
        .toEqual([["models", b.location.directory], ["sdk", b.location.directory]])
      expect(f.mounts.every((entry) => entry.client === f.sdk(connection).orchestra)).toBe(true)
      expect(a.location.project.id).toBe(b.location.project.id)
      expect(a.context.id).not.toBe(b.context.id)
      expect(f.state.selection.directory).toBe("/wrong-git-selection")
      expect(f.errors).toEqual([])
    } finally {
      resolve.release()
      f.dispose()
    }
  }, 15000)

  test("FEN03 actual cache credential edits and context/server changes reject delivered late success and error publication", async () => {
    const one: ServerConnection.Http = { type: "http", http: { url: "http://fabric-owner-one.fixture", password: "synthetic-old" } }
    const two: ServerConnection.Http = { type: "http", http: { url: "http://fabric-owner-two.fixture", password: "synthetic-two" } }
    const a = FabricEntryFixture.context("/managed/owner-a")
    const b = FabricEntryFixture.context("/managed/owner-b")
    const c = FabricEntryFixture.context("/managed/owner-c")
    const d = FabricEntryFixture.context("/managed/owner-d")
    const e = FabricEntryFixture.context("/managed/owner-e")
    const heldB = FabricEntryFixture.held(200, b)
    const oldSuccess = FabricEntryFixture.held(200, a)
    const oldError = FabricEntryFixture.held(503, { _tag: "ServiceUnavailableError", message: "PRIVATE stale error" })
    const phases = { aReads: 0 }
    const f = await FabricEntryFixture.make({ servers: [one, two], selected: FabricEntryFixture.key(one),
      handle: (request) => {
        const url = new URL(request.url)
        const auth = request.headers.get("authorization")
        expect(request.method).toBe("GET")
        expect(url.searchParams.has("location[directory]")).toBe(false)
        const second = url.origin === two.http.url
        expect([one.http.url, two.http.url]).toContain(url.origin)
        if (second) expect(auth).toBe(`Basic ${btoa("orchestra:synthetic-two")}`)
        else expect([`Basic ${btoa("orchestra:synthetic-old")}`, `Basic ${btoa("orchestra:synthetic-new")}`]).toContain(auth)
        if (url.pathname.endsWith("/preparing")) return Response.json({ items: [] })
        if (url.pathname === "/api/fabric/contexts") return Response.json({ items: second ? [e.context]
          : auth === `Basic ${btoa("orchestra:synthetic-new")}` ? [c.context, d.context] : [a.context, b.context] })
        expect(url.searchParams.get("generation")).toBe("1")
        if (url.pathname.endsWith(`/${a.context.id}`)) {
          phases.aReads++
          return phases.aReads === 1 ? Response.json(a) : oldSuccess.response
        }
        if (url.pathname.endsWith(`/${b.context.id}`)) return heldB.response
        if (url.pathname.endsWith(`/${c.context.id}`)) return Response.json(c)
        if (url.pathname.endsWith(`/${d.context.id}`)) return oldError.response
        expect(url.pathname).toBe(`/api/fabric/contexts/${e.context.id}`)
        return Response.json(e)
      },
    })
    const active = () => f.mounts.filter((entry) => !entry.disposed)
    const at = (directory: string) => active().length === 2
      && active().every((entry) => entry.directory === directory)
      && active().some((entry) => entry.kind === "sdk") && active().some((entry) => entry.kind === "models")
    try {
      await f.until(() => f.host.textContent?.includes(b.context.id) === true)
      f.button("open", a.context.id).click()
      await f.until(() => at(a.location.directory))
      const originalClient = f.sdk(one).orchestra
      f.button("open", b.context.id).click()
      await heldB.reading
      expect(active()).toEqual([])
      expect(f.mounts.filter((entry) => entry.directory === a.location.directory).every((entry) => entry.disposed)).toBe(true)
      heldB.release()
      await f.until(() => at(b.location.directory))
      expect(active().every((entry) => entry.client === originalClient)).toBe(true)

      f.button("open", a.context.id).click()
      await oldSuccess.reading
      const lateSuccessRequest = f.requests.findLast((request) => new URL(request.url).pathname.endsWith(`/${a.context.id}`))!
      expect(active()).toEqual([])
      f.set("servers", [{ ...one, http: { ...one.http, password: "synthetic-new" } }, two])
      expect(FabricEntryFixture.key(f.state.servers[0]!)).toBe(FabricEntryFixture.key(one))
      const currentClient = f.sdk(one).orchestra
      expect(currentClient === originalClient).toBe(false)
      expect(lateSuccessRequest.signal.aborted).toBe(true)
      await f.until(() => f.host.textContent?.includes(c.context.id) === true)
      f.button("open", c.context.id).click()
      await f.until(() => at(c.location.directory))
      expect(active().every((entry) => entry.client === currentClient)).toBe(true)
      oldSuccess.release()
      await oldSuccess.delivered
      // A task boundary drains the generated JSON promise chain after the observed body read.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(at(c.location.directory)).toBe(true)
      expect(f.host.textContent).not.toContain(a.context.id)
      expect(f.host.textContent).not.toContain(b.context.id)
      expect(f.host.querySelector('[role="alert"]')).toBeNull()

      f.button("open", d.context.id).click()
      await oldError.reading
      expect(active()).toEqual([])
      f.set("selection", "server", FabricEntryFixture.key(two))
      await f.until(() => f.host.textContent?.includes(e.context.id) === true)
      f.button("open", e.context.id).click()
      await f.until(() => at(e.location.directory))
      const nextClient = f.sdk(two).orchestra
      oldError.release()
      await oldError.delivered
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(at(e.location.directory)).toBe(true)
      expect(active().every((entry) => entry.client === nextClient)).toBe(true)
      expect(f.host.querySelector('[role="alert"]')).toBeNull()
      expect(f.host.textContent).not.toContain("PRIVATE stale error")
      expect(f.host.outerHTML).not.toContain("synthetic-new")
      expect(f.requests.filter((request) => {
        const pathname = new URL(request.url).pathname
        return pathname.startsWith("/api/fabric/contexts/") && !pathname.endsWith("/preparing")
      }).map((request) => {
        const url = new URL(request.url)
        return [url.origin, url.pathname, request.headers.get("authorization")]
      })).toEqual([
        [one.http.url, `/api/fabric/contexts/${a.context.id}`, `Basic ${btoa("orchestra:synthetic-old")}`],
        [one.http.url, `/api/fabric/contexts/${b.context.id}`, `Basic ${btoa("orchestra:synthetic-old")}`],
        [one.http.url, `/api/fabric/contexts/${a.context.id}`, `Basic ${btoa("orchestra:synthetic-old")}`],
        [one.http.url, `/api/fabric/contexts/${c.context.id}`, `Basic ${btoa("orchestra:synthetic-new")}`],
        [one.http.url, `/api/fabric/contexts/${d.context.id}`, `Basic ${btoa("orchestra:synthetic-new")}`],
        [two.http.url, `/api/fabric/contexts/${e.context.id}`, `Basic ${btoa("orchestra:synthetic-two")}`],
      ])
      expect(f.errors).toEqual([])
    } finally {
      heldB.release()
      oldSuccess.release()
      oldError.release()
      f.dispose()
    }
  }, 15000)
}
