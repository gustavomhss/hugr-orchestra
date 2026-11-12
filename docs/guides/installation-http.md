# Local installation HTTP modules

An installation can mount an external HTTP module in the same Orchestra server. The module is loaded only when explicitly selected; it stays outside the Orchestra package and its generated clients.

```sh
orchestra serve --hostname localhost --port 4110 --installation /absolute/path/to/entry.ts
```

Use a fixed nonzero port and a loopback hostname (`localhost`, `127.0.0.1`, or `::1`). Do not register the instance as a service when running a separate homologation alongside your regular app. Existing instances are not restarted by this command. A port already in use fails rather than selecting a different redirect origin.

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

The factory receives the selected origin and runs before database migration or HTTP binding. Orchestra disposes the returned installation on startup failure and shutdown. Its handler receives requests at the exact mount and below it. Returning `undefined` inside that owned namespace produces 404; failures produce a sanitized 500. Root, API, OpenAPI and overlapping mounts are rejected. Orchestra's Host validation also covers installation routes.

An installation handler owns its authentication and authorization; the service password for Orchestra's API is not a business identity. Validate sessions and permissions on each business operation. Keep credentials outside the module source.

For a separate homologation, set dedicated `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME`, `ORCHESTRA_DB`, and `ORCHESTRA_CONFIG_DIR` in the child environment before importing Orchestra. Disable inherited credentials with `ORCHESTRA_INHERIT_CREDENTIALS=0` and provide a dedicated `ORCHESTRA_CREDENTIAL_KEY_FILE`. Use a private working directory and avoid pointing any of these paths at the regular installation. The optional module loader does not choose storage or perform this isolation for you.
