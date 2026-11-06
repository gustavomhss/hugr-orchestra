import { expect, test } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Omni } from "@orchestra/core/omni"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import type { ServerConnection } from "../src/context/server"

if (process.env.FABRIC_ENTRY_ACTIONS_DOM !== "1") {
  test("Fabric context intent acceptance in isolated browser lane", async () => {
    expectSpawn(import.meta.path)
    const before = Omni.snapshot()
    const result = await Effect.runPromise(AppProcess.Service.use((app) => app.run(
      ChildProcess.make(process.execPath, ["--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path], {
        cwd: path.resolve(import.meta.dir, ".."), env: { ...process.env, FABRIC_ENTRY_ACTIONS_DOM: "1" },
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

  test("FEN04 explicit creates preserve delivery intent across ambiguous retry but never across owner exit", async () => {
    const one: ServerConnection.Http = { type: "http", http: { url: "http://fabric-intent-one.fixture", password: "synthetic-one" } }
    const two: ServerConnection.Http = { type: "http", http: { url: "http://fabric-intent-two.fixture", password: "synthetic-two" } }
    const saved = new Map<string, ReturnType<typeof FabricEntryFixture.context>>()
    const posts: { key: string; body: unknown; origin: string }[] = []
    const resolved: string[] = []
    const firstStarted = Promise.withResolvers<void>()
    const failFirst = Promise.withResolvers<void>()
    const nextStarted = Promise.withResolvers<void>()
    const failNext = Promise.withResolvers<void>()
    const f = await FabricEntryFixture.make({ servers: [one, two], selected: FabricEntryFixture.key(one),
      handle: async (request) => {
        const url = new URL(request.url)
        expect([one.http.url, two.http.url]).toContain(url.origin)
        expect(request.headers.get("authorization")).toBe(`Basic ${btoa(url.origin === one.http.url ? "orchestra:synthetic-one" : "orchestra:synthetic-two")}`)
        if (url.pathname.endsWith("/preparing")) return Response.json({ items: [] })
        if (url.pathname === "/api/fabric/contexts" && request.method === "GET")
          return Response.json({ items: url.origin === one.http.url ? [...saved.values()].map((info) => info.context) : [] })
        if (url.pathname === "/api/fabric/contexts" && request.method === "POST") {
          const key = request.headers.get("idempotency-key") ?? ""
          const body: unknown = await request.json()
          expect(key.trim().length).toBeGreaterThan(0)
          expect(body).toEqual({})
          posts.push({ key, body, origin: url.origin })
          if (!saved.has(key)) saved.set(key, FabricEntryFixture.context(`/managed/intent-${saved.size}`))
          if (posts.length === 1) {
            firstStarted.resolve()
            await failFirst.promise
            throw new TypeError("PRIVATE ambiguous transport failure")
          }
          if (posts.length === 2) return Response.json(saved.get(key)!)
          expect(posts.length).toBe(3)
          nextStarted.resolve()
          await failNext.promise
          throw new TypeError("PRIVATE abandoned intent failure")
        }
        expect(request.method).toBe("GET")
        const info = [...saved.values()].find((item) => url.pathname === `/api/fabric/contexts/${item.context.id}`)
        expect(info).toBeDefined()
        expect(url.searchParams.get("generation")).toBe(String(info!.context.generation))
        resolved.push(info!.context.id)
        return Response.json(info)
      },
    })
    try {
      await f.until(() => !!f.host.querySelector('button[data-fabric-action="create"]:not(:disabled)'))
      f.navigate("/")
      await f.until(() => f.host.querySelector('[data-component="orchestra-chapter"]') === null)
      f.navigate("/orchestra/fabric")
      await f.until(() => !!f.host.querySelector('button[data-fabric-action="create"]:not(:disabled)'))
      expect(posts).toEqual([])
      expect(resolved).toEqual([])
      f.button("create").click()
      await firstStarted.promise
      expect(f.button("create").disabled).toBe(true)
      f.button("create").click()
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(posts).toHaveLength(1)
      expect(saved.size).toBe(1)
      expect(f.mounts).toEqual([])
      failFirst.resolve()
      await f.until(() => !!f.host.querySelector('button[data-fabric-action="retry-create"]'))
      expect(f.host.querySelector('[role="alert"]')).not.toBeNull()
      expect(f.host.textContent).not.toContain("PRIVATE ambiguous transport failure")
      f.button("retry-create").click()
      const admitted = [...saved.values()][0]!
      await f.until(() => f.mounts.filter((entry) => !entry.disposed && entry.directory === admitted.location.directory).length === 2)
      expect(posts).toHaveLength(2)
      expect(posts[1]).toEqual(posts[0])
      expect(saved.size).toBe(1)
      expect(resolved).toEqual([admitted.context.id])
      f.navigate("/")
      await f.until(() => f.mounts.every((entry) => entry.disposed)
        && f.host.querySelector('[data-component="orchestra-chapter"]') === null)
      f.navigate("/orchestra/fabric")
      await f.until(() => !!f.host.querySelector('button[data-fabric-action="create"]:not(:disabled)'))
      expect(posts).toHaveLength(2)
      f.button("create").click()
      await nextStarted.promise
      expect(posts).toHaveLength(3)
      expect(posts[2]!.key).not.toBe(posts[0]!.key)
      expect(saved.size).toBe(2)
      f.set("selection", "server", FabricEntryFixture.key(two))
      await f.until(() => !!f.host.querySelector('button[data-fabric-action="create"]:not(:disabled)')
        && f.requests.some((request) => new URL(request.url).origin === two.http.url))
      failNext.resolve()
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(posts).toHaveLength(3)
      expect(posts.every((post) => post.origin === one.http.url)).toBe(true)
      expect(f.host.querySelector('button[data-fabric-action="retry-create"]')).toBeNull()
      expect(f.host.textContent).not.toContain("PRIVATE abandoned intent failure")
      expect(f.mounts.every((entry) => entry.disposed)).toBe(true)
      expect(f.errors).toEqual([])
    } finally {
      failFirst.resolve()
      failNext.resolve()
      f.dispose()
    }
  }, 15000)

  test("FEN05 all public refusal classes recover manually and preparing cancellation retains its own delivery key", async () => {
    const connection: ServerConnection.Http = { type: "http", http: { url: "http://fabric-refusal.fixture", password: "synthetic-refusal" } }
    const a = FabricEntryFixture.context("/managed/refusal-a")
    const b = FabricEntryFixture.context("/managed/refusal-b")
    const preparing = FabricEntryFixture.context("/managed/unpublished-never-mounted")
    const state = { status: 200, removed: false }
    const resolutions: string[] = []
    const removes: { key: string; body: unknown }[] = []
    const removeStarted = Promise.withResolvers<void>()
    const failRemove = Promise.withResolvers<void>()
    const accepted = FabricEntryFixture.held(200, { id: preparing.context.id, generation: preparing.context.generation + 1 })
    const refusals = [
      [401, "UnauthorizedError"], [403, "ForbiddenError"], [409, "ConflictError"], [503, "ServiceUnavailableError"],
    ] as const
    const f = await FabricEntryFixture.make({ servers: [connection], selected: FabricEntryFixture.key(connection),
      handle: async (request) => {
        const url = new URL(request.url)
        expect(url.origin).toBe(connection.http.url)
        expect(request.headers.get("authorization")).toBe(`Basic ${btoa("orchestra:synthetic-refusal")}`)
        if (url.pathname === "/api/fabric/contexts/preparing") return Response.json({ items: state.removed ? [] : [preparing.context] })
        if (url.pathname === "/api/fabric/contexts") {
          expect(request.method).toBe("GET")
          return Response.json({ items: [a.context, b.context] })
        }
        if (url.pathname === "/api/fabric/contexts/remove") {
          expect(request.method).toBe("POST")
          const key = request.headers.get("idempotency-key") ?? ""
          const body: unknown = await request.json()
          expect(body).toEqual(preparing.context)
          expect(key.trim().length).toBeGreaterThan(0)
          removes.push({ key, body })
          if (removes.length === 1) {
            removeStarted.resolve()
            await failRemove.promise
            throw new TypeError("PRIVATE ambiguous cancellation")
          }
          expect(removes.length).toBe(2)
          state.removed = true
          return accepted.response
        }
        expect(request.method).toBe("GET")
        const info = [a, b].find((item) => url.pathname === `/api/fabric/contexts/${item.context.id}`)
        expect(info).toBeDefined()
        expect(url.searchParams.get("generation")).toBe(String(info!.context.generation))
        resolutions.push(info!.context.id)
        if (state.status === 200) return Response.json(info)
        const tag = refusals.find(([status]) => status === state.status)![1]
        return Response.json({ _tag: tag, message: "PRIVATE synthetic refusal" }, { status: state.status })
      },
    })
    try {
      await f.until(() => f.host.textContent?.includes(a.context.id) === true
        && f.host.textContent.includes(preparing.context.id))
      expect(f.host.querySelector(`button[data-fabric-action="open"][data-context-id="${preparing.context.id}"]`)).toBeNull()
      expect(f.mounts).toEqual([])
      for (const [index, [status]] of refusals.entries()) {
        const target = index % 2 === 0 ? a : b
        state.status = status
        f.button("open", target.context.id).click()
        await f.until(() => !!f.host.querySelector('[role="alert"]')
          && !!f.host.querySelector('button[data-fabric-action="retry-resolve"]'))
        expect(f.mounts.filter((entry) => !entry.disposed)).toEqual([])
        expect(f.host.textContent).not.toContain("PRIVATE synthetic refusal")
        expect(f.host.textContent).not.toContain("stack")
        state.status = 200
        f.button("retry-resolve").click()
        await f.until(() => f.mounts.filter((entry) => !entry.disposed && entry.directory === target.location.directory).length === 2)
        expect(resolutions.slice(-2)).toEqual([target.context.id, target.context.id])
        expect(f.host.querySelector('[role="alert"]')).toBeNull()
      }
      f.button("cancel-preparation", preparing.context.id).click()
      await removeStarted.promise
      expect(f.button("cancel-preparation", preparing.context.id).disabled).toBe(true)
      f.button("cancel-preparation", preparing.context.id).click()
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(removes).toHaveLength(1)
      failRemove.resolve()
      await f.until(() => !!f.host.querySelector('button[data-fabric-action="retry-remove"]'))
      expect(f.host.textContent).not.toContain("PRIVATE ambiguous cancellation")
      f.button("retry-remove").click()
      await accepted.reading
      expect(f.host.querySelector(`button[data-fabric-action="cancel-preparation"][data-context-id="${preparing.context.id}"]`)).not.toBeNull()
      accepted.release()
      await f.until(() => f.host.querySelector(`button[data-fabric-action="cancel-preparation"][data-context-id="${preparing.context.id}"]`) === null
        && f.host.querySelector('button[data-fabric-action="retry-remove"]') === null)
      expect(removes).toHaveLength(2)
      expect(removes[1]).toEqual(removes[0])
      expect(f.mounts.some((entry) => entry.directory === preparing.location.directory)).toBe(false)
      expect(f.requests.filter((request) => request.method === "POST").every((request) => new URL(request.url).pathname.endsWith("/remove"))).toBe(true)
      expect(f.errors).toEqual([])
    } finally {
      failRemove.resolve()
      accepted.release()
      f.dispose()
    }
  }, 15000)
}
