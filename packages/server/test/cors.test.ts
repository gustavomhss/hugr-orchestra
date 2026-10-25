import { describe, expect, test } from "bun:test"
import { Layer } from "effect"
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http"
import { corsLayer } from "../src/cors"

// The CORS layer createRoutes applies: the server's allowed origins, the desktop renderer among them.
const handler = HttpRouter.toWebHandler(
  Layer.mergeAll(HttpRouter.add("GET", "/api/health", HttpServerResponse.text("ok")), corsLayer()).pipe(
    Layer.provide(HttpServer.layerServices),
  ),
  { disableLogger: true },
)

function preflight(origin: string) {
  return handler.handler(
    new Request("http://127.0.0.1:4096/api/health", {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "GET", "access-control-request-headers": "authorization" },
    }),
  )
}

describe("V2 server CORS", () => {
  test("allows the desktop renderer origin, with Vary: Origin", async () => {
    const response = await preflight("oc://renderer")
    expect([200, 204]).toContain(response.status)
    expect(response.headers.get("access-control-allow-origin")).toBe("oc://renderer")
    expect((response.headers.get("vary") ?? "").toLowerCase()).toContain("origin")
    const get = await handler.handler(
      new Request("http://127.0.0.1:4096/api/health", { headers: { origin: "oc://renderer" } }),
    )
    expect(get.headers.get("access-control-allow-origin")).toBe("oc://renderer")
  })

  test("refuses an origin outside the allowed list", async () => {
    const response = await preflight("https://evil.example")
    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })
})
