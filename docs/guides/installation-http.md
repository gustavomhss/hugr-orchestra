# Local installation HTTP modules

An installation can mount an external HTTP module in the same Orchestra server. Orchestra loads the module in its own process only when explicitly selected. Use a module you trust. It stays outside the Orchestra package and its generated clients.

```sh
orchestra serve --hostname localhost --port 4110 --installation /absolute/path/to/entry.ts
```

Use a fixed nonzero port and a loopback hostname (`localhost`, `127.0.0.1`, or `::1`). With `localhost`, Orchestra binds the numeric IPv4 loopback address and passes the selected hostname to the factory. For a separate homologation alongside your regular app, use the command shown without `--register` to leave the current service registration intact. A port already in use fails rather than selecting a different redirect origin.

The entry must be an absolute local `.ts`, `.mts`, `.js`, or `.mjs` file with a default asynchronous factory:

```ts
export default async function installation(context: { origin: string }) {
  return {
    mount: "/installation",
    async handler(request: Request) {
      return new Response(`Installation at ${context.origin}`)
    },
    async dispose() {
      // Close only resources acquired by this installation.
    },
  }
}
```

The factory receives the selected origin and runs before database migration or HTTP binding. The factory cleans up resources it acquires before rejecting. Once it returns a valid installation, Orchestra awaits `dispose` on startup failure or graceful shutdown.

The handler receives requests at the exact mount and below it. Returning `undefined` produces 404 in that namespace. Handler rejections produce a sanitized 500. Root, built-in namespaces (`/api`, `/experimental`, and `/openapi.json`), and overlapping mounts are rejected, regardless of capitalization. HTTP methods forbidden by Fetch receive 405 when they reach the router. The Bun listener rejects OPTIONS requests with a body in installation routes. A client disconnect aborts the request signal, including while streaming a response.

Orchestra applies its Host policy to installation routes. The module sets CORS, request body limits, authentication and authorization for its own routes. Use the module's business identities to validate sessions and permissions. Keep credentials outside the module source.

For a separate homologation, set dedicated `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME`, `ORCHESTRA_DB`, and `ORCHESTRA_CONFIG_DIR` in the child environment before importing Orchestra. Disable inherited credentials with `ORCHESTRA_INHERIT_CREDENTIALS=0` and provide a dedicated `ORCHESTRA_CREDENTIAL_KEY_FILE`. Use a private working directory and avoid pointing any of these paths at the regular installation. The optional module loader does not choose storage or perform this isolation for you.
