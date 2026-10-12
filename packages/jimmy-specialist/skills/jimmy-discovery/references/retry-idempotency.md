# Retry, replay and effect identity

Read when repeated attempts, lost responses, reconciliation, redelivery or duplicate effects matter. A contract's idempotent operation does not make every surrounding effect exactly once.

## Establish the vocabulary

Distinguish logical operation, user input, request attempt, durable admission, provider turn, publication, transport delivery, consumer effect and acknowledgment. Name the identity used at each stage. Reusing a display label or generating a new request ID may create a new operation rather than retry the old one.

Follow the actual key from producer to destination. Inspect namespace, payload comparison, delivery mode and version conditions. Exact retry may reconcile only when key, payload and scope match; conflicting reuse can be refused. Ask what happens when the response is lost after a durable effect, and whether replay returns the same receipt or reexecutes work.

## Delimit the guarantee

Locate the reconciliation/deduplication store, durable constraints, retention window and concurrency policy. Does it protect admission, provider execution, external publication or destination effects? Inspect the wrapper, alternate caller and destination instead of extending the strongest headline across all stages.

HTTP safe/idempotent method semantics in RFC 9110 do not determine application idempotency-key handling. Queue delivery guarantees depend on reservation, acknowledgment and destination policy. A timeout says the response was not obtained; it does not prove the effect failed.

Read [transactions](data-transactions.md) if effect and completion recording cross a commit boundary. Candidate explanations for duplicate observations include two identities, two admissions, republication after lost response, lease overlap and redelivery of one publication. These predict different evidence; a duplicate log line alone does not select a cause.

## Choose a discriminator

Compare per-operation identity, attempt/commit/publication/delivery counts and destination dedupe results in admitted observations. Define the examined time window and retained coverage before counting or claiming absence. Positive-control the detector with a known event of the relevant kind; sampling and lost logs can invalidate a negative.

If observation is unavailable, propose one bounded executor probe, such as losing the response after effect while retrying identical input. Specify controls with changed identity or conflicting payload only when they distinguish the contract, exact resources/effects and cleanup. Do not claim the proposed trace happened or run an arbitrary command.

## Record and explain

A finding can state “local reconciliation does not establish external uniqueness” as a bounded inference with its bridge; it cannot state “production duplicates” without observation. Preserve contrary evidence of destination deduplication or an alternate protected path. Narrow a finding when that evidence changes its scope; do not erase history.

Close with the guarantee, its identity/retention/scope conditions, sustained cause if supported and exact missing discriminator. Use [explanation](../../jimmy-research/writing/explanation.md); recommendations remain conditional, not an accepted redesign.
