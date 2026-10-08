# kopium

## Applicability

The packet assigns Rust types for a Kubernetes custom resource generated from a CustomResourceDefinition file it supplies, and names the generated module as a write path. The engine is kopium `0.24.1`, built by the host from its pinned crate and run only as `"$BACKEND_TOOLKIT_BIN/kopium"`.

## Non-trigger

- A CRD that is only in a cluster: kopium's cluster mode needs network and credentials. Only a local CRD file is in scope.
- Choosing the module path, the CRD version to use, the schema mode or the extra derives. Those are supplied, or read from the existing generated file's header.
- Rust types that define a new CRD (`#[derive(CustomResource)]` written by hand): that is handwritten code, not generation.
- A packet that leaves the generated module outside the write paths: never regenerate; a change that would need it is a `packet` blocker.

## Inputs

- The CRD YAML file and, when it serves several versions, the version to generate (`--api-version`).
- The generated module path and its existing header, which records the kopium command and version that wrote it.
- The project's `Cargo.toml`: the generated code uses `kube` with its `derive` feature, `serde`, `k8s-openapi`, and `schemars` when deriving `JsonSchema`.

## Steps

1. Check the project's pin first. An existing generated module whose header names a kopium version other than `0.24.1` means the project pins another generator: report `engine-version-mismatch(project=<v>, bundled=0.24.1)` and do not regenerate.
2. Generate with the options the header or the packet records:
   ```sh
   temporary="$(mktemp "$TMPDIR/kopium.XXXXXX")"
   "$BACKEND_TOOLKIT_BIN/kopium" -f <crd.yaml> --api-version <version> --derive Default --docs > "$temporary" && mv "$temporary" src/<module>.rs
   ```
   `--schema derived` (or `-A`, which also adds `--derive JsonSchema` and `--docs`) only when the packet assigns a schema that compiles on its own. The native shell's `$TMPDIR` is scoped to that command; create and move the temporary file in the same call. Never choose a fixed host path such as `/tmp/<module>.rs` or a sibling outside the packet's write paths. Move over the module only after a zero exit, so a failed run never truncates it.
3. The first run on a machine compiles the engine once; it can take several minutes. Later runs reuse that build. Do not interrupt it or retry in a loop.
4. Read the diff. Only the generated module may move, and only for the fields the CRD change touched.
5. Use the types from handwritten code, then compile and run the packet's checks.

## Tools and outputs

- The host fetches and builds the engine on first use; the seat's shell has no network. Never install, download or substitute it (`cargo install kopium`, `cargo binstall`, `brew`, a container, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim. Windows hosts report `unsupported-target:needs-msvc-linker`.
- Generated and owned by kopium: the whole output module. Never edit it; customize a struct by eliding it with `-e <Struct>` and writing that struct by hand elsewhere, only when the packet assigns it.
- Project prerequisites outside the toolkit: the crates above in `Cargo.toml`; adding one is a `packet` decision.

## Limits and checks

- A CRD without a structural `openAPIV3Schema`, or with constructs kopium cannot map, fails with the cause on stderr: quote it and return a `packet` blocker. Use `--relaxed` only when the packet assigns it. Any other nonzero exit is `engine-failure:kopium:<exit>`.
- kopium replaces recognized `Condition` and `ObjectReference` shapes with the `k8s-openapi` types; keep that unless the packet says otherwise.
- The types mirror the CRD schema, not the controller's behavior.
- Checks: `cargo check` (or the packet's compile command) on the crate that includes the module, and the diff stays inside the generated module.
