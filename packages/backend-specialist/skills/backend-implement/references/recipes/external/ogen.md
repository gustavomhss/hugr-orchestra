# ogen

## Applicability

The packet assigns Go server interfaces or a Go client generated from a local OpenAPI description, names the generated package directory as part of the write paths, and gives its package name (or an existing `go:generate` line or `ogen.yml` that holds the options). The engine is ogen `1.24.0`, compiled by the host from its pinned source with its own Go toolchain and run only as `"$BACKEND_TOOLKIT_BIN/ogen"`.

## Non-trigger

- A description fetched from a URL: the shell has no network, so every `$ref` must resolve to a local file. Never set `allow_remote`.
- Choosing the package name, the target directory, the feature set or the operation filters. Those are supplied.
- A change that calls the existing generated interfaces without touching the description: nothing to generate.
- A packet that forbids regeneration or leaves the generated package outside the write paths: never regenerate; a change that would need it is a `packet` blocker.

## Inputs

- The OpenAPI file and every local file it references, the generated package directory and its package name.
- The project's `ogen.yml` (or `.ogen.yml`) and the `go:generate` line that runs ogen, when present.
- The `github.com/ogen-go/ogen` line in `go.mod`: the generated code imports ogen's runtime packages from it.

## Steps

1. Check the project's pin first. A `go.mod` that requires `github.com/ogen-go/ogen` at any version other than `v1.24.0` means the project pins another generator: report `engine-version-mismatch(project=<v>, bundled=1.24.0)` and do not regenerate. `ogen --version` prints `(devel)` for this build; it is not the version signal.
2. Edit only the parts of the description the change needs.
3. Generate from the directory that holds the config, with the packet's options:
   ```sh
   "$BACKEND_TOOLKIT_BIN/ogen" --target <pkg-dir> --package <name> --clean <openapi.yaml>
   ```
   Add `--config <path>` when the config is elsewhere. `--clean` removes only ogen's own `oas_*_gen.go` files in the target before writing.
4. The first run on a machine compiles the engine once; it can take a few minutes before generation starts. Later runs reuse that build. Do not interrupt it or retry in a loop.
5. Generate only what the change affects: run once per package whose description changed, never across every package in the repository.
6. Read the diff. Only `oas_*_gen.go` files in the target may move, and only for the operations and schemas the change touched. Any other change is a `packet` blocker.
7. Implement new handler methods in the handwritten layer, then compile and run the packet's checks.

## Tools and outputs

- The host fetches and builds the engine on first use; the seat's shell has no network. Never install, download or substitute it (`go install`, `go run github.com/ogen-go/ogen/cmd/ogen`, `brew`, a container, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- Generated and owned by ogen: every `oas_*_gen.go` and `oas_*_gen_test.go` in the target. Never edit them. Handwritten and yours: the type that implements the generated `Handler` (or wraps the generated `Client`), the server wiring, and tests.
- Project prerequisites outside the toolkit: the project's Go toolchain and the ogen runtime module in `go.mod`; adding or raising it is a `packet` decision.

## Limits and checks

- A broken local `$ref`, an unsupported schema construct or an invalid description fails generation with the position on stderr. A description defect is a `packet` blocker: quote it; never add `ignore_not_implemented` entries to get past it. Any other nonzero exit is `engine-failure:ogen:<exit>`.
- A new operation adds a method to the generated `Handler` interface, so the build breaks until the handwritten type implements it: that compile error is expected, not a reason to edit generated code.
- Checks: `go build` and `go vet` on the touched packages, the diff stays inside the target's generated files, and one raw request per touched operation reaches the handwritten implementation with the contracted status and body.
