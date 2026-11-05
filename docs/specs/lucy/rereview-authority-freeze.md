# Governed rereview: host round authority

## Corrected cross-platform contract (supersedes the private-store proposal)

The private-store proposal below is withdrawn: its Unix-only safety boundary
would newly refuse governed Windows receipts. No platform regression or waiver
is authorized. Preserve any prototype branch; do not integrate that design.

Retain routing in the same durable receipt that already carries the validated
findings. Add optional `hostRound` to `MaestroEvent.Review.ReceivedV2.data`:
`{version: "host-round-v1", executionTier: string, routing: string}`. `routing` contains JSON for the
strict Core `ReviewRouting.Record`; Schema must not depend on Core. This is
optional only for decoding historical receipts, not a fallback trust source.
The receipt's existing artifact, method and digests bind the snapshot. No new
cache, table, migration, event stream, seal format or filesystem requirement.

`MaestroReviewRecords.ReviewInput` gains internal optional `hostRouting`. The
registered record tool supplies it only from scoped finish authority, after all
existing finding, scope, outcome and check gates. This is not a tool parameter;
the model cannot submit `hostRound` or `hostRouting`. Before publication, the
record helper strictly decodes that routing and requires its method, routing
digest and catalog digest to match the bound receipt inputs, then serializes it
into the wanted receipt. Existing immutable event identity/conflict checks apply
to the snapshot too. Legacy unscoped recording remains unchanged without it.

`executionTier` is the actual `tier.id` captured by the fanout's existing
`runTier(input.catalog, ...)`, not inferred later from an ambient catalog. Carry
it in host finish authority and internal recording input; require the method to
equal the snapshot profile plus this captured execution tier. An unbuilt Deep
raise currently runs Standard, and making Deep built later must not invalidate
that historical receipt or silently rewrite its original executed tier. Neither
the model nor a later global catalog supplies this value.

The newest code receipt is the continuation anchor. Rereview reads and strictly
decodes its `hostRound.routing` and requires exact method/routing/catalog digest
agreement. Its already-validated receipt findings are the only prior finding
source. Strictly decode routed finding records again; missing/malformed snapshot
or binding mismatch fails explicitly before child creation. Never parse a prior
assistant card or select an older receipt because the newest lacks authority.
The newest receipt must have verdict `FIX_FIRST` (design §5's rereview profile).
An APPROVE or REJECT round does not select an older FIX_FIRST receipt or start a
new continuation; refuse it explicitly before creating children.
Internal fanout `firstRound` is `{routing, findings, reviewed, executionTier}`. Preserve the
original tier, open-finding handling and same-head refusal.

The request's rereview tier pin and the fanout's actual `runTier` selection use
that retained `executionTier`. The original requested routing snapshot remains
unchanged; a later catalog making a previously unbuilt requested tier available
does not escalate this continuation's actual execution tier.

The current catalog may supply configuration only for the exact retained built
tier. If that id is absent or no longer built, refuse explicitly with
`retained-tier-unavailable` before analyzer execution or child creation. Never
pass a retained executed id through the new-request fallback resolver (`runs`),
which could silently reinterpret historical Standard execution as Quick. This
pins executed identity, not an archival copy of every tier budget. New-request
Deep fallback is unchanged.

Because this adds public receipt data, the lead must run the Client generator
remotely from `packages/client`, recover its exact generated outputs and run
targeted Schema/Core/Maestro acceptance and typecheck. No generated file is edited
by hand. Windows controls must prove receipt publication has no new Unix-store
dependency. Other acceptance requirements below still apply with durable receipt
snapshots replacing private files. No partial design is declared implemented.

## Withdrawn private-store proposal (decision history only)

The newest code receipt is the continuation anchor. Its prior assistant card is
untrusted presentation and must supply neither routing nor open findings.

Reuse the existing strict first-writer `ReviewPRFactsV2` private store; do not add
a new public event field, database migration or independent file publisher. A
governed round's candidate is SHA-256 over the JSON tuple
`["governed-round-v1", parentSessionID, validationRecordID, stage, reviewedHead,
method, routingDigest, canonicalCatalogDigest]`. Canonical catalog digest removes
one optional `sha256:` prefix. The host derives all fields from finish authority
and bound validation/stage; the model cannot select a candidate or store path.
The store remains `analysisStore("pr_" + candidate)`, compatible with the existing
private-store basename checks. The namespace in the hash separates PR candidates.

Before a scoped governed receipt can publish, after outcome seal and check
authorization, save the host routing, method, scope, confirmed records, check
facts and sealed outcomes through that existing writer. No card or verdict enters
the saved facts. Rejected later artifact/validation checks may leave inert facts;
without a matching published receipt they cannot anchor a rereview. A conflicting
first writer refuses publication. Do not recover by replacing corrupt facts.

For rereview, select the newest actual code receipt for the parent and validation,
derive its candidate from the receipt's bound method/digests/head, and read the
strict host facts. Missing or corrupt facts fail with a named round-authority
failure; do not parse an assistant card, choose an older receipt or rerun a model.
Require exact saved method, routing digest, catalog digest and scope base/head
matching the receipt. Revalidate receipt findings against the saved host-confirmed
list (Quick keeps its quote-only rule); use only the receipt's validated findings
and the saved routing to continue. The prior card is never a fallback.

Change the internal fanout `firstRound` input to `{routing, findings, reviewed}`;
it currently consumes only routing and open findings from the old card. Preserve
same-head refusal, original tier and open-finding handling. Other result/card
validation, provider turns, lens caps and check/outcome authority stay unchanged.

This store is the existing OS-managed temporary replay store, not an archival
service. Eviction is an explicit unavailable continuation, never permission to
trust old model presentation. Legacy receipts without retained host facts require
a new validation; they are not silently upgraded.

Acceptance must drive registered governed requests and receipt recording with
valid host facts, then alter or omit the prior assistant card's routing/findings.
The rereview must retain the saved tier and actual receipt's open findings. An
absent card must not block a valid host-backed round. Missing/corrupt/conflicting
facts must fail before child creation/provider admission. Same-head remains
unaddressed. The lead owns remote controls and card-authority removal mutations.
