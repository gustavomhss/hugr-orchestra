# Activity Monitor action boundaries

The action workflow follows R8–R17 and R19 of the original requirements. The first action change adds a Core ledger for authoritative target observations, the IN/OUT state projection, and the quarantine postcondition checks. Runtime routes and controls require the authority and adapters described here. [Requirements](https://github.com/gustavomhss/hugr-orchestra/blob/c808922d1cb69053e8e63cefceab8f6a46f8b0a1/docs/specs/activity/REQUIREMENTS.md)

## Target generation

A producer records a durable observation keyed by its target ID. Membership, identity, dirty status, and eligibility are facts of that observation. The ledger issues a decimal generation and advances it when those facts change. Reordering the same members preserves the generation. The ledger keeps unavailable targets so a later observation cannot reuse an old generation.

A capture returns the whole selected set in its requested order if every binding is current and eligible for the requested action. Unknown or unavailable identity, duplicate selections, and stale generations invalidate the whole capture. A capture supplies evidence for confirmation. The effect adapter still needs to compare authoritative live facts immediately before acting, including changes that occurred between ledger observations.

## Human confirmation

The existing HTTP principal identifies a client. The Desktop-owned sidecar offers a separate boundary for a person to confirm an action. A proposed implementation establishes a per-launch capability over private child stdin, then authenticates loopback requests and responses. The Desktop main process fetches the canonical preview and shows its action, targets, and generations in a native dialog. Only main submits the approved binding. Ordinary HTTP credentials and agent preview requests cannot enter that flow.

Arm and Apply are separate confirmations. Arm persists the selection and leaves the source in place. Apply consumes the exact confirmed binding and acquires a durable claim over the whole set before effects. A conflicting claim, changed evidence, expiry, or mismatched epoch refuses admission. An interrupted attempt that might have started an effect becomes Unknown. The executor will need restart and replay coverage before exposing either confirmation.

## Filesystem effects

The storage adapter must revalidate claimant and proof, root containment, source identity, and destination before effect. Quarantine uses same-volume, no-replace rename. Restore verifies the original path is free and verifies the same object at the original path afterward. An occupied original stays visible. Empty requires a separate confirmation of the complete quarantine selection. A refused or unknown active item blocks that selection, and move records stay outside it.

IN/OUT marks Out only after a second authoritative read finds the expected identity at the destination and confirms source absence. Ambiguity stays Unknown with the existing data available for investigation. A directory rename primitive that protects the destination still needs a strategy for concurrent source replacement.

## Omni effects

Process controls address the supervisor-owned tree identity and compare the current generation and membership. A sampled PID and an observation record ID carry no control authority. The existing whole-tree stop interface does not encode the selective membership required after a partial suspension.

Suspend requires a recoverable durable mark of the exact members that stopped. Resume reaches only those members with current identities and the bound generation. An unsupported or incomplete inspection refuses admission. Qualification requires real fixture trees and process-lifecycle evidence for each advertised platform, including the Windows Job path and Unix descendants that exit or leave the owned tree.

## Hosted qualification

Core tests exercise exact generation capture, independence of agent requests from plan counts, and verification of quarantine postconditions. Later gates cover approval, restart recovery, racing observations and claims, real filesystem identity and no-replace behavior, and Omni controls on supported systems. Browser coverage must include no effect on mount, filter, or refresh, and a separate confirmation for every irreversible act.
