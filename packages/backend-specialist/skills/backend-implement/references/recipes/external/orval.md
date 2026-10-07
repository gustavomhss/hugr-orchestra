# orval

## Applicability

The packet assigns a TypeScript client, Zod schemas or mocks generated from a local OpenAPI description, names the output paths as part of the write paths, and supplies the project's Orval config (`orval.config.ts`, `.js` or `.mjs`) or the values for a new one. The engine is Orval `8.39.0` on the toolkit's own Node.js, provided by the host and run only as `"$BACKEND_TOOLKIT_BIN/orval"`.

Source: adapted from Orval's official skill (MIT), <https://github.com/orval-labs/orval/tree/master/skills/orval>, and <https://orval.dev/llms.txt>.

## Non-trigger

- Server handlers or request validation wired into routes: Orval writes the client side and schemas only; the handler code is yours.
- A description fetched from a URL: the shell has no network.
- Choosing the client flavour (`fetch`, `axios`, `react-query`, `zod`, ...), the mode (`single`, `split`, `tags`) or the output layout. Those are supplied.
- A packet that forbids regeneration: never regenerate; a change that would need it is a `packet` blocker.

## Inputs

- The OpenAPI file path and every local file it references through `$ref`.
- The Orval config and the project name inside it to regenerate, or the packet's input, output target and client.
- The project's runtime packages the client imports, and the checks that compile and exercise it.

## Steps

1. Check the project's own `orval` pin in `package.json` or its lock file. A version other than `8.39.0` means the project pins another generator: report `engine-version-mismatch(project=<v>, bundled=8.39.0)` and do not regenerate.
2. Regenerate from the project's config, limited to the project the change touched:
   ```sh
   "$BACKEND_TOOLKIT_BIN/orval" --config orval.config.ts --project <name>
   ```
   Without a config, use the packet's values:
   ```sh
   "$BACKEND_TOOLKIT_BIN/orval" --input <contract.yaml> --output <client-dir>/<file>.ts --client <client>
   ```
   Never pass `--watch`. With a config, never override its `client`, `mode` or `mock` with flags.
3. Use `output.clean` only when the packet assigns it and the output directory holds nothing but generated files: it deletes them first.
4. Read the diff: models, operations and mocks may move. Function and hook names come from each operation's `operationId`, so a renamed or missing `operationId` renames exports; an export rename the change did not intend is a `packet` blocker. The `mode` sets which files move: `single` one file, `split` separate schema and mock files, `tags` and `tags-split` one file or folder per OpenAPI tag. Any change outside the named outputs is a `packet` blocker.
5. Compile the project and run the packet's client checks against a local test endpoint.

## Tools and outputs

- The host fetches the engine and its Node.js on first use; the seat's shell has no network. Never install, download or substitute it (`npx orval`, `npm install`, the project's `node_modules/.bin/orval`, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- Generated and owned by Orval: everything under the configured outputs. Never edit those files. Handwritten and yours: the code that calls the client, any custom `mutator` the config names, and tests.
- Project prerequisites outside the toolkit: the packages the generated code imports (`axios`, `@tanstack/*-query`, `zod`, `msw`) and any formatter or command the config enables (`prettier`, `biome`, `hooks.afterAllFilesWrite`). A missing one is `project-prerequisite-missing:<package>`; installing it is a `packet` decision.

## Limits and checks

- A broken local `$ref`, an unreadable description or a config that fails to load stops generation: `project-prerequisite-missing:<path>`. Any other nonzero exit is `engine-failure:orval:<exit>`. Description warnings are logged, not failures; quote them as risks.
- A config `input.target` that is a URL cannot run here: `network-denied-by-profile`.
- Generated types are not runtime validation; only the `zod` client parses responses.
- Checks: the client compiles, one call reaches a local endpoint with the expected method, path and body, and a declared error status reaches the caller as the generated error type.
