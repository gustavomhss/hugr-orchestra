import "./httpapi-exercise/environment"
import { expect, test } from "bun:test"
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
  const web = app()
  try {
    const missing = await send(web, "/api/inbox?location[directory]=/definitely-missing-inbox")
    expect(missing.status).toBe(200)
    const listed = await missing.json()
    expect(Array.isArray(listed.data)).toBe(true)

    const home = await send(web, "/api/inbox?location[directory]=")
    expect(home.status).toBe(200)
    expect(Array.isArray((await home.json()).data)).toBe(true)

    const refused = await send(web, "/api/skill/catalog?location[directory]=/definitely-missing-inbox")
    expect(refused.status).toBe(400)
    expect(await refused.json()).toMatchObject({ _tag: "InvalidRequestError", kind: "location_not_found" })
  } finally {
    await web.dispose()
  }
})

function send(web: ReturnType<typeof app>, path: string) {
  return web.handler(new Request(`http://localhost${path}`), Context.makeUnsafe<unknown>(new Map()))
}
