# buf

## Applicability

The packet assigns a change to `.proto` files in a Buf module (`buf.yaml` present) and names lint, build or breaking-change checks. The engine is buf `1.73.0`, provided by the host and run only as `"$BACKEND_TOOLKIT_BIN/buf"`. This toolkit release covers `lint`, `build` and `breaking` only.

## Non-trigger

- Code generation for TypeScript: follow [protoc-gen-es](protoc-gen-es.md), the one generation plugin the toolkit ships. Any other plugin must be a project-pinned route that is already installed; otherwise return a `packet` blocker. Never fetch a plugin.
- Changing `buf.yaml` lint or breaking rules, module layout or `deps`. That configuration is supplied.
- Registry work: `buf push`, `buf dep update`, `buf registry ...`, `--against-registry`.

## Inputs

- The module or workspace directory holding `buf.yaml`, and the `.proto` files to change.
- The baseline for breaking checks: the packet's `--against` input, or by default the committed baseline (`HEAD`, which the packet's baseline commit equals).
- Whether breaking changes are allowed for this change, and which.

## Steps

1. Edit the `.proto` files the change needs. Run the commands below from the repository root, with `proto` standing for the module directory.
2. Compile: `"$BACKEND_TOOLKIT_BIN/buf" build proto`. Without `-o` it writes no image; a compile error stops here.
3. Lint: `"$BACKEND_TOOLKIT_BIN/buf" lint proto`. Fix findings inside the changed files; findings elsewhere are baseline, reported, not fixed.
4. Breaking check against the committed baseline:
   ```sh
   "$BACKEND_TOOLKIT_BIN/buf" breaking proto --against '.git#ref=HEAD,subdir=proto'
   ```
   A reported breaking change that the packet does not allow is reverted or returned as a `packet` blocker; never weaken the rules to pass. Never keep a baseline image in `$TMPDIR` between commands: under the sandbox it is a fresh directory for each command.
5. Run the packet's checks for code that consumes the schema.

## Tools and outputs

- The host fetches the engine on first use; the seat's shell has no network. Never install, download or substitute it (`go install`, `npx`, `brew`, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- Handwritten and yours: the `.proto` files. buf here produces only diagnostics; write an image (`build -o`) only when the packet names it as an artifact. Code generated earlier is not touched.
- `--error-format json` gives machine-readable findings when evidence must be quoted.

## Limits and checks

- Exit 100 means buf printed file annotations: lint findings, breaking changes or compile errors. Exit 0 is clean. Any other failure is `engine-failure:buf:<exit>`.
- Modules with `deps` need them in the local module cache. A sandboxed command starts with an empty cache and no network, so dependency resolution fails as `network-denied-by-profile`; without a sandbox, a missing cache is `project-prerequisite-missing:buf-deps`.
- A `buf.gen.yaml` that names a `remote:` plugin is `remote-plugin-unsupported`.
- Breaking checks compare schema and wire compatibility only; they say nothing about whether handlers behave the same.
