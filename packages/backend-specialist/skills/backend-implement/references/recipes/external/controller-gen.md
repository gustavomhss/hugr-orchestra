# controller-gen

## Applicability

The packet assigns a change to Go API types of a Kubernetes operator (`+kubebuilder:` and `+groupName` markers on `*_types.go`, or `+kubebuilder:rbac` markers on a reconciler) and names the generated outputs as write paths: deepcopy files, CRD manifests, RBAC roles or webhook manifests. The engine is controller-gen `0.22.0` from kubernetes-sigs/controller-tools, provided by the host and run only as `"$BACKEND_TOOLKIT_BIN/controller-gen"`.

## Non-trigger

- Choosing the API group, version, kind, scope, storage version or conversion strategy. Those are supplied.
- Typed clientsets, listers or informers (code-generator), and scaffolding a new API or project (kubebuilder, operator-sdk).
- Applying the generated manifests to a cluster. Only files change here.
- A packet that leaves the generated files outside the write paths: never regenerate; a change that would need it is a `packet` blocker.

## Inputs

- The API package directory and the types the change touches, with their markers.
- The project's generation command: the `manifests` and `generate` targets in its `Makefile`, or a `go:generate` line, which hold the generator list, the header file and the output directories.
- The controller-tools pin: `CONTROLLER_TOOLS_VERSION` in the `Makefile`, or `sigs.k8s.io/controller-tools` in `go.mod` or a tools module.

## Steps

1. Check the project's pin first. Any pin other than `v0.22.0` means the project uses another generator: report `engine-version-mismatch(project=<v>, bundled=0.22.0)` and do not regenerate.
2. Edit the types and markers the change needs. Explain a marker with `"$BACKEND_TOOLKIT_BIN/controller-gen" crd -ww` instead of guessing its arguments.
3. Run the project's own arguments with the engine in place of `$(CONTROLLER_GEN)`. Never run the `make` target itself: it installs controller-gen over the network. For a standard layout:
   ```sh
   "$BACKEND_TOOLKIT_BIN/controller-gen" object:headerFile="hack/boilerplate.go.txt" paths="./api/..."
   "$BACKEND_TOOLKIT_BIN/controller-gen" rbac:roleName=manager-role crd webhook paths="./..." output:crd:artifacts:config=config/crd/bases
   ```
   Narrow `paths` to the packages the change touched when the packet allows it.
4. Read the diff. Only the generated files for the touched types may move: `zz_generated.deepcopy.go`, the CRD YAML of those kinds, `config/rbac/role.yaml` for changed RBAC markers, and webhook manifests for changed webhook markers. Any other change is a `packet` blocker.
5. Compile and run the packet's checks.

## Tools and outputs

- The host fetches the engine on first use; the seat's shell has no network. Never install, download or substitute it (`go install`, `go run sigs.k8s.io/controller-tools/cmd/controller-gen`, `make controller-gen`, `brew`, a copy in `bin/`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- Generated and owned by controller-gen: `zz_generated.*.go`, the CRD bases, the generated RBAC role and webhook manifests. Never edit them. Handwritten and yours: the types, their markers and the reconciler.
- controller-gen loads packages through the project's Go toolchain. It needs `go` on `PATH` and every module in the local module cache; a missing toolchain is `project-prerequisite-missing:go` and a module it cannot load is `project-prerequisite-missing:go-modules`.

## Limits and checks

- A malformed or unknown marker fails with the file and line on stderr: fix the marker inside scope. Any other nonzero exit is `engine-failure:controller-gen:<exit>`.
- A field without `+optional` or `omitempty` becomes required in the CRD schema; a removed or retyped field in a served version is a breaking API change the packet must allow.
- Generated CRDs describe structure only; they do not prove the controller handles the new fields.
- Checks: `go build ./...` and `go vet` on the touched packages, the diff stays inside the generated outputs of the touched types, and, when the packet assigns a manifest check, the [kubeconform](kubeconform.md) recipe passes on the regenerated manifests.
