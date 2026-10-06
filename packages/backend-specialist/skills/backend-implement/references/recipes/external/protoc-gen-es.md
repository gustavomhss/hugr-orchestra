# protoc-gen-es

## Applicability

The packet assigns TypeScript or JavaScript code generated from `.proto` files in a Buf module (`buf.yaml` present), names the output directory as part of the write paths, and gives the plugin options (`target=ts`, `import_extension=js`, ...) or a `buf.gen.yaml` that holds them. The engine is protoc-gen-es `2.16.0` on the toolkit's own Node.js, run only as a local plugin of the toolkit's buf: `"$BACKEND_TOOLKIT_BIN/protoc-gen-es"` driven by `"$BACKEND_TOOLKIT_BIN/buf" generate`.

## Non-trigger

- Lint, build or breaking checks of the schema: that is the [buf](buf.md) recipe.
- RPC service stubs for Connect or gRPC (`protoc-gen-connect-es` and similar): no such plugin ships with the toolkit.
- A `buf.gen.yaml` plugin entry with `remote:`: the shell has no network.
- Changing the schema's package layout, managed mode or plugin options. Those are supplied.

## Inputs

- The module directory holding `buf.yaml`, and the `.proto` files the change touched.
- The output directory and plugin options, or the project's `buf.gen.yaml`.
- The project's `@bufbuild/protobuf` version and the checks that compile and exercise the generated code.

## Steps

1. Check the header of an existing generated file. It names `protoc-gen-es v2.16.0` when this engine produced it. Any other version means the project pins another generator: report `engine-version-mismatch(project=<v>, bundled=2.16.0)` and do not regenerate.
2. With a project `buf.gen.yaml` whose entry is `local: protoc-gen-es`, let buf find the toolkit's plugin first on `PATH`:
   ```sh
   PATH="$BACKEND_TOOLKIT_BIN:$PATH" "$BACKEND_TOOLKIT_BIN/buf" generate proto
   ```
   Without one, pass the packet's values as an inline template, naming the plugin by its path:
   ```sh
   "$BACKEND_TOOLKIT_BIN/buf" generate proto --template "{version: v2, plugins: [{local: '$BACKEND_TOOLKIT_BIN/protoc-gen-es', out: <out-dir>, opt: [target=ts]}]}"
   ```
   An entry that runs the plugin another way (`npx`, `node_modules/.bin`) is a project route, not this recipe: return a `packet` blocker.
3. Use `clean: true` only when the packet assigns it and the output directory holds nothing but generated files: buf deletes it first.
4. Read the diff: one `_pb.ts` (or `_pb.js` and `_pb.d.ts`) per changed `.proto` file. Any change outside the output directory is a `packet` blocker.
5. Compile the project and run the packet's checks that encode and decode the changed messages.

## Tools and outputs

- The host fetches the engine, its Node.js and buf on first use; the seat's shell has no network. Never install, download or substitute them (`npx`, `npm install`, `brew`, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- Generated and owned by the plugin: everything under the output directory. Never edit those files. Handwritten and yours: the code that builds and reads the messages, and tests.
- Project prerequisite outside the toolkit: `@bufbuild/protobuf` at `2.16.0`, which the generated code imports. A missing package is `project-prerequisite-missing:@bufbuild/protobuf`; another version is `engine-version-mismatch(project=<v>, bundled=2.16.0)`. Installing or changing it is a `packet` decision.

## Limits and checks

- buf reports compile errors in the `.proto` files before the plugin runs; fix them as in the [buf](buf.md) recipe. Modules with `deps` need the local module cache: `network-denied-by-profile` under the sandbox, `project-prerequisite-missing:buf-deps` without one.
- Any other nonzero exit is `engine-failure:protoc-gen-es:<exit>`.
- Generated messages check field types, not business rules; validate values the contract constrains.
- Checks: the project compiles, and a message round-trips through `toBinary` and `fromBinary` with the changed fields intact.
