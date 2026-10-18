# Native execution command seams

W2 read facade/Source/HTTP handlers are assembled and package typechecked. Commands
now have concrete wire payloads in Schema `actions/command.ts`; provider discriminator
and native mode are explicit. GitLab pipeline retry means failed/canceled jobs,
not GitHub rerun-all. Command routes remain grouped by workflow/run/job/native source.

Provider writers own `actions/github/commands/**` or `actions/gitlab/commands/**`
plus focused tests. Each exports `ActionsGitHubCommands.make({transport,reader})` or
`ActionsGitLabCommands.make({transport,reader})` returning `ActionsContract.Commands`.
Factories are synchronous closures. `perform` runs only inside the lead's durable
Operations.execute owner callback. It cannot prepare/replay a lease or blindly retry.

`CommandResult` separates safe native acknowledgement from optional request-only
CommandOutput. Only acknowledgement enters durable receipt. Trigger/runner one-time
tokens and JIT material may be returned only to the owning request; duplicates read
receipt with no output. Never persist/hash/log secret execute payload or output.

Strict native payload decode rejects extras, provider/kind/target/ref mismatch before
remote writes. Every mutation target matches admitted identity and preconditions;
source/commit/attempt changes fail definitely_unsent. Native metadata/role/token
evidence cannot be invented. Known denied permission blocks; unknown stays unknown
and must not be promoted to an allowed capability. Provider authorization remains
authoritative for each explicit command.

GitHub uses immutable `repositories/<nativeID>` routing. Dispatch proves workflow
identity/default-branch workflow_dispatch eligibility and validates ref-bound inputs.
API2026-03-10 success200 carries workflow_run_id/run_url/html_url. Return exact native
runID; legacy empty204 is accepted-unattributed, never nearby-run correlation. Retry
retains original source/ref; missing native attempt metadata cannot be synthesized.

GitLab uses immutable projects/<nativeID>; branch/tag pipeline creation, native MR
launch and trigger-token launch are distinct. Version-sensitive inputs/source fields
use authenticated metadata observation, not client Provider.version. Job play/erase,
retry/cancel/delete/name updates retain native status and owning pipeline identity.

Lead owns all Schema/Protocol/native payload revisions, route and Core dispatch
assembly, generated clients and mutation admission lifetime. Files below400 lines;
actual preflight/one-write/returned-ID/error/unknown cases tested through test:ci,
with a meaningful observed mutant red/restored-green. No local tests/full-suite or
source commit/push/PR/merge authorization. Provider fixture success is not live
mutation permission or product qualification.
