# kubeconform

## Applicability

The packet assigns a check that Kubernetes manifests the change wrote (plain YAML or JSON, including generated CRDs) conform to their schemas, and supplies those schemas as local files. The engine is kubeconform `0.8.0`, provided by the host and run only as `"$BACKEND_TOOLKIT_BIN/kubeconform"`.

## Non-trigger

- Helm charts or Kustomize overlays that have not been rendered: validate only rendered output the packet supplies or the change wrote. Rendering is outside this recipe.
- Manifests the change did not touch: they are baseline, not part of this check.
- Server-side admission: CEL validation rules, webhooks, policy engines and quotas need a cluster, which this check never contacts.
- Best-practice linting (resource limits, probes, security context). kubeconform checks schemas only.

## Inputs

- The manifest files or directories the change wrote.
- The schema directories the packet supplies: the Kubernetes JSON schemas for its target version, and one JSON schema per custom resource kind.
- The target Kubernetes version and whether the check is strict, when the packet names them.

## Steps

1. Point every schema lookup at the supplied directories. Without `-schema-location`, kubeconform fetches schemas from GitHub, which the seat cannot reach.
2. Validate the changed files:
   ```sh
   "$BACKEND_TOOLKIT_BIN/kubeconform" -strict -summary -output text \
     -schema-location '<k8s-schemas>/{{ .NormalizedKubernetesVersion }}-standalone{{ .StrictSuffix }}/{{ .ResourceKind }}{{ .KindSuffix }}.json' \
     -schema-location '<crd-schemas>/{{ .Group }}/{{ .ResourceKind }}_{{ .ResourceAPIVersion }}.json' \
     <changed files or dirs>
   ```
   Add `-kubernetes-version <version>` when the packet names one; adjust each template to the layout the packet's schema directories actually use. Drop `-strict` only when the packet says so.
3. Fix each invalid resource the change wrote, then run the same command again. Use `-output json` when the evidence must be quoted.

## Tools and outputs

- The host fetches the engine on first use; the seat's shell has no network. Never install, download or substitute it (`go install`, `brew`, a container, a copy on `PATH`), and never fetch schemas.
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- kubeconform writes nothing; it reports per resource. Yours: the manifests the change wrote. Generated manifests are fixed in their source (types, markers, templates), never by hand.

## Limits and checks

- Exit 0 means every resource was valid or skipped. Exit 1 means at least one resource was `invalid` (a schema violation) or an `error` (unparsable YAML or no schema found). Report the summary line.
- `could not find schema for <Kind>` means the packet's schemas do not cover that kind: return a `packet` blocker naming it. Never add `-ignore-missing-schemas`, `-skip` or `-reject` unless the packet assigns them.
- Do not pass `-cache` or `-insecure-skip-tls-verify`; both exist only for remote schemas.
- A pass proves structure against the supplied schemas, not that the API server will accept the object or that the workload runs.
