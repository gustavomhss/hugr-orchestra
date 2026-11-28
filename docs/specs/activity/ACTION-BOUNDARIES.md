# Activity Monitor action boundaries

The action workflow follows R8–R17 and R19 of the original requirements. The first action change adds a Core ledger for authoritative target observations, the IN/OUT state projection, and the quarantine postcondition checks. Runtime routes and controls require the authority and adapters described here. [Requirements](https://github.com/gustavomhss/hugr-orchestra/blob/c808922d1cb69053e8e63cefceab8f6a46f8b0a1/docs/specs/activity/REQUIREMENTS.md)

## Target generation

A producer records a durable observation keyed by its target ID. Membership, identity, dirty status, and eligibility are facts of that observation. The ledger issues a decimal generation and advances it when those facts change. Reordering the same members preserves the generation. The ledger keeps unavailable targets so a later observation cannot reuse an old generation.

A capture returns the whole selected set in its requested order if every binding is current and eligible for the requested action. Unknown or unavailable identity, duplicate selections, and stale generations invalidate the whole capture. A capture supplies evidence for confirmation. The effect adapter still needs to compare authoritative live facts immediately before acting, including changes that occurred between ledger observations.

## Human confirmation

The existing HTTP principal identifies a client. The packaged Desktop's owned sidecar establishes a per-launch capability over private child stdin and authenticates loopback requests and responses. For arming quarantine, Desktop main fetches the canonical preview and shows its action, targets, and generations in a native dialog. Main submits the preview ID after an affirmative response from the dialog. Ordinary HTTP credentials and agent preview requests cannot enter that flow.

The private channel authenticates the peer for an instance. The dialog supplies the human confirmation inside the trusted Desktop main process. The server consumes the preview once and revalidates the exact observed targets inside the same transaction that commits the receipt. A confirmed arm has no filesystem or process effect. The normal authenticated GET displays current and stale receipts. Runtime effects require their own authority and adapter.

The owned Linux sidecar checks registered Git worktree copies through a signed, explicit IN/OUT inspection. The live verifier checks the candidate and registered Git worktree before the dialog and again before committing the receipt. An incomplete Linux process view refuses eligibility. These readings observe the running system and do not reserve the filesystem object for a later Apply.

Arm and Apply are separate confirmations. Arm persists the selection and leaves the source in place. Apply consumes a fresh native confirmation for one exact Arm receipt, target and generation. The server rechecks registration when reserving the attempt, revalidates the live object, and holds the authority's source lease through settlement. It stores the origin, destination and pinned native identity before calling the effect. A conflicting claim or changed evidence refuses the action. An interrupted or ambiguous attempt stays Unknown across restart and blocks another attempt against the same source.

## Filesystem effects

The storage adapter must revalidate claimant and proof, root containment, source identity, and destination before effect. Quarantine uses same-volume, no-replace rename. Restore verifies the original path is free and verifies the same object at the original path afterward. An occupied original stays visible. Empty requires a separate confirmation of the complete quarantine selection. A refused or unknown active item blocks that selection, and move records stay outside it.

IN/OUT marks Out only after a second authoritative read finds the expected identity at the destination and confirms source absence. Ambiguity stays Unknown with the existing data available for investigation.

On Linux, Apply requires the dedicated `orchestra-activity-custody` service inside the initial PID namespace. The service runs with administrative authority and exposes only the signed Activity methods over its Unix socket. Desktop and its regular sidecar run as ordinary users. The custody credential is delivered to Desktop main in a root-owned inherited file descriptor and closed before Desktop starts renderer or sidecar processes. Desktop main retains the credential in protected process memory and uses it only after checking the calling window and its native decisions. The regular server, renderer and delegated commands never receive the credential.

An administrator provisions the protected root, registers its managed Git worktrees and controls the custody database. The root and its private `repositories`, `worktrees` and `quarantine` directories live on a supported local mount. Eligible sources are direct `.turbo` and `node_modules` directories in registered worktrees within that root, with the worktree and source also root-owned and restricted to their owner. Omni walks the path without following symlinks, verifies the permissions and mount identity, and passes open parent directory descriptors to the same-mount no-replace rename. It syncs both parents before reporting acceptance. The broker uses a disk-backed SQLite ledger with full synchronous commits.

The administrator controls the binaries and launcher, protects Desktop from same-user tracing during startup, and keeps the custody tree inaccessible to untrusted workloads. The broker retires each launch credential on disk before opening its socket. The owned Desktop admits the credential only in a Wayland session with sandboxing enabled. The host compositor must keep input injection outside the authority of ordinary commands. Completion still requires the live process reading and the independent postcondition read.

Verification binds the protected native source identity to the observed generation before Arm. A previously armed object needs a fresh verification and Arm if its evidence changes. Regular worktrees can still be armed. Apply stays unavailable for them and for installations without this dedicated profile. Orchestra does not elevate Desktop or provision the profile.

## Omni effects

Process controls address the supervisor-owned tree identity and compare the current generation and membership. A sampled PID and an observation record ID carry no control authority. The existing whole-tree stop interface does not encode the selective membership required after a partial suspension.

Suspend requires a recoverable durable mark of the exact members that stopped. Resume reaches only those members with current identities and the bound generation. An unsupported or incomplete inspection refuses admission. Qualification requires real fixture trees and process-lifecycle evidence for each advertised platform, including the Windows Job path and Unix descendants that exit or leave the owned tree.

## Hosted qualification

Core tests exercise exact generation capture, independence of agent requests from plan counts, and verification of quarantine postconditions. Later gates cover approval, restart recovery, racing observations and claims, real filesystem identity and no-replace behavior, and Omni controls on supported systems. Browser coverage must include no effect on mount, filter, or refresh, and a separate confirmation for every irreversible act.
