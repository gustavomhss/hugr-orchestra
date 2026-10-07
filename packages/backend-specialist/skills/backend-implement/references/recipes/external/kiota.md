# kiota

## Applicability

The packet assigns an outbound API client generated from a local OpenAPI description, names the output directory as part of the write paths, and gives the language, class and namespace names (or an existing `kiota-lock.json` that holds them). The engine is kiota `1.35.0`, provided by the host and run only as `"$BACKEND_TOOLKIT_BIN/kiota"`; the host sets `KIOTA_OFFLINE_ENABLED` and `KIOTA_CLI_TELEMETRY_OPTOUT` for it.

## Non-trigger

- Server stubs, handlers or request validators: kiota generates clients only.
- A description fetched from a URL or a registry (`kiota search`, `download`, `login`): the shell has no network.
- Choosing the language, the client names, include or exclude filters, or the serializers. Those are supplied.
- A packet that forbids regeneration: never regenerate; a change that would need it is a `packet` blocker.

## Inputs

- The OpenAPI file path and every local file it references through `$ref`.
- The output directory, or its `kiota-lock.json` from an earlier generation.
- The project's Kiota runtime packages and the checks that compile and exercise the client.

## Steps

1. Existing client: check `kiotaVersion` in its `kiota-lock.json`. Any version other than `1.35.0` means the project pins another generator: report `engine-version-mismatch(project=<v>, bundled=1.35.0)` and do not regenerate.
2. Regenerate an existing client from its lock file, which keeps its language, names and filters:
   ```sh
   "$BACKEND_TOOLKIT_BIN/kiota" update --output <client-dir>
   ```
   For a new client, use the packet's values:
   ```sh
   "$BACKEND_TOOLKIT_BIN/kiota" generate --openapi <contract.yaml> --language <language> --class-name <ClientName> --namespace-name <namespace> --output <client-dir>
   ```
3. Regenerate only the client whose description the change touched. Kiota skips an unchanged description with unchanged parameters; that skip is a clean result.
4. Use `--clean-output` only when the packet assigns it and the output directory holds nothing but generated files: it deletes the directory first.
5. Read the diff: request builders, models and the lock file may move. Any change outside the output directory is a `packet` blocker.
6. Compile the project and run the packet's client checks against a local test endpoint.

## Tools and outputs

- The host fetches the engine on first use; the seat's shell has no network. Never install, download or substitute it (`dotnet tool install`, `brew`, a container, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- Generated and owned by kiota: everything under the output directory, including `kiota-lock.json`, which is committed with it. Never edit those files. Handwritten and yours: the code that constructs the client with the project's request adapter and authentication provider, and tests.
- Project prerequisites outside the toolkit: the language SDK and Kiota's runtime packages. `"$BACKEND_TOOLKIT_BIN/kiota" info --language <language>` lists the packages the generated code needs; installing them is a `packet` decision.

## Limits and checks

- A broken local `$ref` or an unreadable description fails generation: `project-prerequisite-missing:<path>`. Any other nonzero exit is `engine-failure:kiota:<exit>`. Description warnings (missing discriminator, unsupported format) are logged, not failures; quote them as risks.
- Generated models do not enforce `minLength`, `minimum` or `pattern`; validate before sending when the contract requires it.
- Checks: the client compiles, one call reaches a local endpoint with the expected method, path and body, and a declared error status maps to its generated error type.
