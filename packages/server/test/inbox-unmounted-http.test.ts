import "./httpapi-exercise/environment"
import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRoutes } from "@orchestra/server/routes"
import { Context, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"

function app() {
  return HttpRouter.toWebHandler(createRoutes().pipe(Layer.provide(HttpServer.layerServices)), {
    disableLogger: true,
    memoMap: Layer.makeMemoMapUnsafe(),
  })
}

test("a missing or empty directory still lists the installation inbox", async () => {
  const root = await mkdtemp(join(tmpdir(), "inbox-unmounted-http-"))
  const directory = join(root, "missing")
  const web = app()
  try {
    await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" })
    const missing = await send(web, "/api/inbox", directory)
    expect(missing.status).toBe(200)
    const listed = await missing.json()
    expect(Array.isArray(listed.data)).toBe(true)

    const home = await send(web, "/api/inbox", "")
    expect(home.status).toBe(200)
    expect(Array.isArray((await home.json()).data)).toBe(true)

    const refused = await send(web, "/api/skill/catalog", directory)
    expect(refused.status).toBe(400)
    expect(await refused.json()).toMatchObject({ _tag: "InvalidRequestError", kind: "location_not_found", field: "location.directory" })
  } finally {
    try { await web.dispose() } finally { await rm(root, { recursive: true, force: true }) }
  }
})

test("a file-valued first Location acquisition refuses the skill catalog with the declared location error", async () => {
  const root = await mkdtemp(join(tmpdir(), "location-file-http-"))
  const directory = join(root, "ordinary-file")
  const web = app()
  try {
    await writeFile(directory, "This owned file is not a Location directory.")
    expect((await stat(directory)).isFile()).toBe(true)
    const refused = await send(web, "/api/skill/catalog", directory)
    expect(refused.status).toBe(400)
    expect(await refused.json()).toMatchObject({ _tag: "InvalidRequestError", kind: "location_not_found", field: "location.directory" })
  } finally {
    try { await web.dispose() } finally { await rm(root, { recursive: true, force: true }) }
  }
})

test("a cached Location still serves its skill catalog after its owned directory is removed", async () => {
  const root = await mkdtemp(join(tmpdir(), "location-cached-http-"))
  const directory = join(root, "project")
  const web = app()
  try {
    await mkdir(directory)
    const first = await send(web, "/api/skill/catalog", directory)
    expect(first.status).toBe(200)
    const acquired = await first.json()
    expect(typeof acquired.location.directory).toBe("string")
    expect(acquired).toHaveProperty("data")
    await rm(directory, { recursive: true })
    await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" })
    // Reuse the exact web handler, memo map and directory ref; this is not a fresh Location acquisition.
    const cached = await send(web, "/api/skill/catalog", directory)
    expect(cached.status).toBe(200)
    const retained = await cached.json()
    expect(retained.location.directory).toBe(acquired.location.directory)
    expect(retained).toHaveProperty("data")
  } finally {
    try { await web.dispose() } finally { await rm(root, { recursive: true, force: true }) }
  }
})

function send(web: ReturnType<typeof app>, path: string, directory: string) {
  const url = new URL(`http://localhost${path}`)
  url.searchParams.set("location[directory]", directory)
  return web.handler(new Request(url), Context.makeUnsafe<unknown>(new Map()))
}
