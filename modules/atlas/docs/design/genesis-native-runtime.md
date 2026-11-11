# Genesis native package adapter

This contributor entrypoint adapts `genesis-native-package/v1` into the existing
Atlas ownership objects and CAS. It leaves `ownership-pilot.ts` unchanged. The
transport itself grants no write authority, and preparation does not publish a
knowledge projection.

## Runtime and isolation

Use the Atlas workspace's declared dependencies and built package exports. The
entrypoint is TypeScript, executable with Bun. Keep each execution's source copy,
transport payload, `.atlas/cas`, projection and candidate output isolated from
other sessions. The repository root must be a real directory, with no symlink
alias; `.atlas` and its CAS root must also be real directories. The source copy
need not pretend to be a historical checkout: `observed_head` is the actual
observable Git HEAD, or `null` when unavailable.

Run these commands from `modules/atlas`. Arguments in angle brackets are operator
supplied paths, not literal values:

```sh
bun scripts/genesis-native.ts prepare <isolated-repo> <package-relative-path> <new-candidate-file>
bun scripts/genesis-native.ts publish <isolated-repo> <candidate-file> <approval-relative-path>
bun scripts/genesis-native.ts index <isolated-repo> <query-file>
bun scripts/genesis-native.ts read <isolated-repo> <query-file>
```

`prepare` writes the requested candidate file with exclusive creation (`wx`) and
prints the same prepared record. Choose a new filename for a new revision.
`package-relative-path` and `approval-relative-path` are relative to the isolated
repository. Candidate and query files are explicit filesystem paths. A body's
path is relative to its native package's directory; source and reference paths
are relative to the isolated repository. The adapter never fetches a URL.

`index` accepts exactly `{"scope":"...","need":"entry"}`. `read` accepts a
scope, positive integer `maxBytes`, exactly one of `key` or `need`, optional
`section`, and optional `historical:true`. Unknown fields, invalid needs and an
implicit or false historical flag are refused. Output is the actual Atlas port
response. Exit code 0 means that operation returned its ordinary result; code 2
means a governed or read HOLD/refusal; code 1 means invalid input or an execution
error. Preparation's exit code 0 is not publication or semantic acceptance.

## Exact preparation

Preparation validates required fields, unique artifact/input/criterion keys,
needs, numeric layers, authority scope, validity, body lengths/digests/UTF-8,
reference shapes and digests, source SHA-256 and Git blob identities, required
artifact coverage, roots, reachability, build dependency order and cycles.
Every captured source must be a declared `file:` input. The artifact's recipe
reference must also be a declared `file:` input. The package protocol reference
is added as a live input to each artifact.

The actual input observer supplies `OwnershipInput.version`. A second bounded
read must agree with that kernel identity and any captured source/recipe/protocol
digest; a final observation rejects input drift during preparation. Transport
SHA-256 and Git blob SHA values never stand in for those kernel identities.
Membership observation uses the existing strict Git observer and fails closed
when its complete result is unavailable. Absence and unavailable observations
both stop preparation, with distinct error names.

Bodies retain exact bytes, including BOM, decomposed Unicode and newline form.
Semantic metadata retains its supplied meaning: supported/blocked validity,
authority, gaps and evidence become `OwnershipResult` fields. Build dependencies
become `{key,result}` receipt dependencies. Navigation remains navigation.
The raw package and original reference bytes are also retained as existing
`OwnershipBody` objects in the same CAS and linked by the candidate.

The runtime contract contains the transport's criteria plus
`runtime-import-binding`. The candidate includes every result, observed input
and dependency identity, the runtime contract, roots, required keys, actual
working-copy identity, raw transport identity, preserved references and hashes
of the executing adapter modules. The candidate is stored in the existing CAS;
its kernel ID is the `candidate_id` to be judged.

Committed references are checked against the locally materialized bytes and
their declared content digest. This adapter does **not** establish that a blob
belongs to the declared historical commit. `reference_commit_verification` is
explicitly `external-capture-evidence-required`. Preserve the GitHub/source
capture evidence for that association and supply it to the binding reviewers.
This permits honestly identified reconstructed copies without fabricating HEAD
or historical Git objects.

## Separate binding approval

After preparation, the two actual independent local judges receive the exact
candidate, mapped objects, criteria, source-capture evidence and relevant runtime
evidence. Their semantic decisions are not automatically binding decisions.
The operator supplies one `genesis-native-binding-approval/v1` record containing:

| Field | Required content |
| --- | --- |
| `purpose` | Exactly `runtime-import-binding`. |
| `candidate_id`, `contract` | Exact IDs from the prepared candidate. |
| `reviewers` | Exactly two distinct actual judge IDs from this execution. |
| `decisions` | Exactly one decision from each of those IDs. |

Every decision contains `reviewer`, `purpose`, `candidate_id`, `contract`, a
`verdict` of `PASS`, and all criteria as `{id,verdict:"PASS"}`. Its `entries` must
contain exactly every candidate artifact as `{key,result,inputs}`, where
`result` is the candidate's artifact result and `inputs` is its `inputs_id`.
`request_ref` and `response_ref` preserve the original visible request and
response, using the native transport reference shape.

Use `decision_id_kind:"host-message"` only when the host actually exposed the
message ID. Otherwise use `decision_id_kind:"response-sha256"` with
`decision_id:"sha256:<response_ref.sha256>"`. The latter identifies preserved
response bytes and makes no claim of host message telemetry. Both identifier
kinds are explicitly labeled in the resulting review provenance.

The adapter validates the record and its reference bytes; it does **not**
authenticate reviewers or infer PASS from original prose. The operator must
retain the actual host-returned identities and faithfully transcribe the real
decisions. This is the existing local-runtime trust ceiling, not a new remote
authentication system. Synthetic fixture reviews are only test data.

`publish` reruns preparation and demands an identical candidate before it accepts
the binding record. Changed source, body, reference, recipe, observed HEAD,
metadata or adapter code requires new preparation and new exact binding.
Original approval/request/response bytes are retained in the same CAS. Generated
`OwnershipReview.provenance` labels itself as an adapter record, not original
judge prose. It points to those preserved bodies and the exact candidate.

## Governed publication and read authority

The adapter creates receipts and a manifest using existing types, then validates
every transported entry through `readOwnership`. A blocked entry remains blocked
and prevents publication, including an entry reachable only by navigation.
It constructs the ordinary ownership carrier using the existing grounding
derivation and asks `composeRuntime.check` before `atlas-emit`.

The host must independently provide a real `.atlas/policy.json` that authorizes
the actor for the scope, the existing store-provenance prerequisites, and any
ratify authority required by the existing doors. `composeRuntime` resolves the
actor from `ATLAS_ACTOR` or local Git identity and the token from
`ATLAS_RATIFY_TOKEN`; this entrypoint creates or changes none of them. Those
local identity claims are not cryptographically authenticated by Atlas.
Missing authority yields the original governed refusal; a binding PASS does not
override it. After an actual successful emit, use the real `index` and `read`
commands and preserve their outputs as independent operational evidence.

## Initial capability limits

- One complete selected package and one ownership scope per candidate. External
  `package_ref` build dependencies are explicitly refused because the current
  ownership manifest resolves dependencies within one scope. No dependency is
  silently dropped or relabeled as navigation.
- All required artifacts must exist and be reachable from roots through build
  or navigation links. Navigation targets in this release must be in the same
  package. Build predecessors must be earlier and supported, with preserved
  semantic review references. References themselves do not prove semantic PASS.
- Source/recipe/protocol file observations retain the existing 256,000-byte
  limit and exclusions for `.git`, `.atlas`, symlinks and unsupported input
  formats. Larger sources and excluded domains remain open coverage work; they
  are not omitted from the domain inventory to pass this importer.
- Transport/reference/body files are bounded to 8 MiB; file inputs retain the
  smaller observer bound. Non-NFC metadata is refused to match existing ownership
  shapes, while the UTF-8 body is kept byte-exact.
- Use an isolated, stable working directory. The bounded descriptor read checks
  path components before and after reading, but does not promise an adversarially
  atomic directory traversal against hostile concurrent renames.
- Incremental rebuild, cross-package composition, coherent rollback, crash
  recovery, migration and remote identity authentication are not implemented or
  proven by this entrypoint. The existing Atlas implementations remain available
  for separately scoped work and evidence.

The remote test file is `packages/adapter-io/test/genesis-native.test.ts`.
It exercises the real disk store, input observer and governed runtime using the
existing explicitly synthetic fixture authority. Run product tests only in the
repository's authorized GitHub Actions route. Package typechecking remains the
ordinary `bun typecheck` from `modules/atlas`. Passing fixtures does not supply
the real campaign's judge decisions or publication authority.
