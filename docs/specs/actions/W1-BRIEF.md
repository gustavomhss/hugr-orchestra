# W1 frozen source seams

Baseline `e8319438e5cfb7a8039915ce6e8c2cf6ef390f6d` / tree
`dabd6316bbe10134cc6f5ea6749ac096a3a06da1`.

Canonical wire namespace is `@orchestra/schema/actions`; source lives in the lead
worktree `packages/schema/src/actions.ts` and `actions/**`. Root Schema typecheck
completed after these definitions. Core contract/error are
`packages/core/src/actions/{contract,error}.ts`.

Bindings worker owns `actions/binding.ts` + `actions/state.ts` and focused tests.
Its exported `make` acquires services and returns `ActionsContract.Bindings`;
constructor input is `{directory,workspaceID?,projectID,stateDirectory,resolve}`;
`resolve` is `ActionsContract.BindingResolver`, supplied by the lead from transport.
The worker validates the actual named git remote/host/path before asking the resolver.
The resolver returns immutable native project ID, canonical path and CLI account;
the client never supplies a native ID or sign-in identity. Host data
state is outside the repository. Opaque stable binding IDs and immutable native
project IDs are not guessed from display names. Complete binding/policy round-trips,
expected revisions and explicit host/Location validation are mandatory.

Transport worker owns `actions/transport/**` and focused tests. Export `make` from
`actions/transport.ts` returning `ActionsContract.Transport`. AppProcess request
argument arrays/JSON stdin/host options, normalized CLI env and deadlines; structured
HTTP headers + schema JSON decode; raw bytes through inherited spawner. Constructor
is `{directory}`. `resolve(provider,projectPath)` reads the exact native project and
current account on that explicit host. `upload(binding,request,{filename,bytes})`
streams GitLab multipart stdin (`glab api --form file=@-`; CLI support checked),
without leaking values into argv or buffering complete files. No direct
child_process, runtime dependency inversion or line-decoded artifact output.

Operations worker owns `actions/operations/**`, SQL table model and focused tests;
lead owns migration generation/registry. `make` acquires Database and returns
ActionsContract.Operations, with trusted Location constructor input. Prepare lease
24h, resolved retention30d, unknown protection, single CAS claim, owner-request
scope and durable unknown finalization. No background replay/Session coordinator.

Client bytes worker owns handwritten `src/actions-transfer.ts`; lead owns Client
contract/group/generation/export integration. The worker freezes its configured
auth/fetch/location interface from actual Client options, preserving ReadableStream
body and explicit upload/download target DTOs. No whole-buffer binary fallback.

Workers read these frozen source files. Interface revisions are lead-owned; return
exact proposed change instead of inventing another variant. Every implementation
has real failure-case tests through test:ci; no local test suites or heavy per-edit CI.

## Operation readback amendment

Provider callback success is `OperationAcknowledgement` (only native run/job/resource
IDs, attempt and explicit unattributed flag). Strict-decode before durable storage;
never store raw provider JSON. Errors optionally carry `SendDisposition`:
`definitely_unsent | definitely_rejected | unknown`. Only an explicit definitive
disposition permits a rejected receipt; absent disposition remains unknown.
`Operations.reconcile(binding,id,observe)` is read-only provider observation, never
re-execution. Observation is `pending | confirmed | rejected` plus optional safe
acknowledgement. Reconcile preserves admitted intent and cannot invent a run ID or
turn any receipt back into an executable lease. Native-ID proof is adapter-owned;
unattributed dispatch remains pending rather than guessing nearby runs.

Policy read/update returns `PolicyState` with the current `BindingRef` and policy.
Policy replacement increments binding revision under the same keyed lock, so
competing policy edits cannot silently overwrite each other. Callers receive the
new revision explicitly. Git inspections must clear inherited repository/config
overrides and remove only output terminators, preserving path whitespace.
