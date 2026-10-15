# openapi-generator

## Applicability

The packet assigns server stubs or an API client generated from a local OpenAPI description, names the output directory as part of the write paths, and gives the generator name and its options (or an existing config file that holds them). The engine is OpenAPI Generator `7.25.0`, provided by the host with its own Java runtime and run only as `"$BACKEND_TOOLKIT_BIN/openapi-generator"`.

## Non-trigger

- A description fetched from a URL or a registry: the shell has no network, so every `$ref` must resolve to a local file.
- Choosing the generator, the package names, the template set or the additional properties. Those are supplied.
- A project that generates with another tool, or whose generation is wired into its build (a Gradle or Maven plugin, an npm script): use that entrypoint, not this engine.
- A packet that forbids regeneration: never regenerate; a change that would need it is a `packet` blocker.

## Inputs

- The OpenAPI file path and every local file it references through `$ref`.
- The output directory with its `.openapi-generator-ignore` and `.openapi-generator/` metadata, or the packet's generator, options and config file for a first generation.
- The project's checks that compile and exercise the generated code.

## Steps

1. Existing output: read `.openapi-generator/VERSION`, and `generator-cli.version` in `openapitools.json` when present. Any version other than `7.25.0` means the project pins another generator: report `engine-version-mismatch(project=<v>, bundled=7.25.0)` and do not regenerate.
2. Validate the description before generating:
   ```sh
   "$BACKEND_TOOLKIT_BIN/openapi-generator" validate -i <contract.yaml>
   ```
3. Preview, then generate with the packet's generator and options:
   ```sh
   "$BACKEND_TOOLKIT_BIN/openapi-generator" generate -i <contract.yaml> -g <generator> -o <out-dir> -c <config.yaml> --dry-run
   "$BACKEND_TOOLKIT_BIN/openapi-generator" generate -i <contract.yaml> -g <generator> -o <out-dir> -c <config.yaml> --minimal-update
   ```
   The dry run writes nothing and lists each file with its state (`w` write, `n` write if changed, `i` ignored, `s` skipped). A file outside the output directory, or a file the change does not affect, means the scope is wrong: narrow it before writing.
4. Generate only what the change affects. Limit the run with `--global-property apis=<Tag>,models=<A>:<B>` to the tags and schemas the change touched; supporting files are then skipped unless `supportingFiles` is listed too. `--minimal-update` leaves unchanged files untouched.
5. Never edit `.openapi-generator-ignore` to hide a conflict. A handwritten file the generator would overwrite is a `packet` blocker unless the ignore file already protects it.
6. Read the diff, then compile the project and run the packet's checks.

## Tools and outputs

- The host fetches the engine and its runtime on first use; the seat's shell has no network. Never install, download or substitute it (`npm i @openapitools/openapi-generator-cli`, `brew`, a system `java -jar`, a container, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- Generated and owned by the generator: every file `.openapi-generator/FILES` lists. Never edit those files. Handwritten and yours: the files the ignore file protects (server implementations behind the generated interfaces, client wiring), and tests.
- Project prerequisites outside the toolkit: the target language's SDK and the runtime libraries the generated code imports; adding them is a `packet` decision.

## Limits and checks

- A broken local `$ref` or an unreadable description fails generation: `project-prerequisite-missing:<path>`. A `validate` error is a contract defect: quote it and return a `packet` blocker; never pass `--skip-validate-spec` to get past it. Any other nonzero exit is `engine-failure:openapi-generator:<exit>`. Warnings about unused or unsupported features are logged, not failures; quote them as risks.
- Generated server stubs decode and route; most do not enforce `minLength`, `minimum` or `pattern`. Validate in the handwritten layer when the contract requires it.
- Checks: the project compiles, the diff stays inside the files the dry run listed, and one raw request per touched operation reaches the handwritten implementation with the contracted status and body.
