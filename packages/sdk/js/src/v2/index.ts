export * from "./client.js"
export * from "./server.js"

import { createOrchestraClient } from "./client.js"
import { createOrchestraServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export * as data from "./data.js"

export async function createOrchestra(options?: ServerOptions) {
  const server = await createOrchestraServer({
    ...options,
  })

  const client = createOrchestraClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
