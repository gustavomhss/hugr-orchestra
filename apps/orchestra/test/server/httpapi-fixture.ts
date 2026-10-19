import { Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { disposeMiddleware } from "../../src/server/routes/instance/httpapi/lifecycle"

// Each fixture owns its handler scope and service identities. Closing it must not retire Server.Default's handler.
export function httpApiFixture() {
  const memoMap = Layer.makeMemoMapUnsafe()
  return {
    ...HttpRouter.toWebHandler(HttpApiApp.createRoutes(), {
      disableLogger: true,
      memoMap,
      middleware: disposeMiddleware,
    }),
    memoMap,
  }
}
