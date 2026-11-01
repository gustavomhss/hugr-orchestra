import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { Layer } from "effect"
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http"
import { WebUi } from "../src/web-ui"

const html = '<html><script id="oc-theme-preload-script">window.theme=1</script><div id="root"></div></html>'

async function app() {
  const root = await mkdtemp(path.join(tmpdir(), "web-ui-"))
  await mkdir(path.join(root, "assets"))
  await writeFile(path.join(root, "index.html"), html)
  await writeFile(path.join(root, "assets", "app.js"), "console.log(1)")
  await writeFile(path.join(path.dirname(root), "secret.txt"), "outside")
  const handler = HttpRouter.toWebHandler(
    Layer.mergeAll(HttpRouter.add("GET", "/api/health", HttpServerResponse.text("api")), WebUi.layer(root)).pipe(
      Layer.provide(HttpServer.layerServices),
    ),
    { disableLogger: true },
  )
  return { root, get: (pathname: string) => handler.handler(new Request(`http://127.0.0.1:4096${pathname}`)) }
}

describe("WebUi", () => {
  test("serves index.html at / with a CSP that allows only the inline theme preload script", async () => {
    const { get } = await app()
    const response = await get("/")
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(html)
    expect(response.headers.get("content-type")).toContain("text/html")
    expect(response.headers.get("content-security-policy")).toMatch(/script-src 'self' 'wasm-unsafe-eval' 'sha256-[A-Za-z0-9+/=]+'/)
  })

  test("serves assets with their own type and falls back to index.html for client routes", async () => {
    const { get } = await app()
    const asset = await get("/assets/app.js")
    expect(await asset.text()).toBe("console.log(1)")
    expect(asset.headers.get("content-type")).toContain("javascript")
    expect(await (await get("/session/ses_1")).text()).toBe(html)
  })

  test("never reads outside the root and leaves API routes to the API", async () => {
    const { get } = await app()
    expect(await (await get("/..%2Fsecret.txt")).text()).toBe(html)
    expect(await (await get("/api/health")).text()).toBe("api")
  })

  test("answers 400, not 500, for a path with a malformed percent escape", async () => {
    const { get } = await app()
    expect((await get("/%")).status).toBe(400)
    expect((await get("/assets/%E0%A4%A")).status).toBe(400)
    expect((await get("/assets/app.js")).status).toBe(200)
  })

  test("resolveRoot picks the first directory that has an index.html", async () => {
    const { root } = await app()
    expect(await WebUi.resolveRoot([undefined, "/nonexistent", root])).toBe(root)
    expect(await WebUi.resolveRoot(["/nonexistent"])).toBeUndefined()
  })
})
