# ADR-0022 — Doctor audits the store it diagnoses: a fifth, storage-layer leg

**Status:** ACCEPTED — owner-ratified 2026-08-31. The fork was put to the owner explicitly, as "ADR +
amendment" against a standalone `atlas verify-cas` command and against a harness-only probe; the owner chose
the amendment.

**A correction to the record, because the ratification was made on incomplete information.** The `atlas
doctor index` precedent below — a doctor sub-command deliberately kept OUT of the frozen `DoctorApi` — was
found while implementing, AFTER the owner had already chosen. It is the strongest case against this ADR and
it is written up as rejected alternative (a) rather than quietly omitted. It was re-examined on its merits
and did not change the decision, for the reason stated there (MCP reachability, plus the boundary that
precedent itself draws). Had it changed the decision, the right move would have been to go back to the owner,
not to reinterpret their answer.

**Amends:** `DoctorApi` (`packages/tools/src/doctor.ts`), frozen at FOUR read legs by TOOLS-12, to FIVE.
**Does NOT amend:** INV-TOOLS-1 / ADR-0003. `GOVERNANCE_SURFACE` stays 6; `WRITE_PATHS` stays 3. The new
leg reads, holds no store handle beyond the read-only `DoctorSource` port, and returns no write.
**Relates:** ADR-0006 (`READ_SURFACE`, of which `atlas-doctor` is a member — the leg is therefore reachable
over MCP by construction, which is the property that decided this fork); the `.gitignore` TRAVEL-BY-REPROOF
decision (task #196), whose whole premise this leg is the missing instrument for.

## Context

Atlas's `.gitignore` deliberately **un-ignores** `.atlas/cas/` and `.atlas/projection.json`, against a
deny-by-default rule that ignores every other child of `.atlas/`. The comment records the reasoning:
projection and CAS **MAY travel**, because `atlas verify-store` replays sealed facts through the sound
oracle, so "trust moved from the committer to the oracle".

That argument has a hole this ADR closes. `verify-store` re-proves the **facts**; nothing re-proves the
**bytes**. A CAS is content-addressed — an object's filename IS the hash of its content — so an object that
has been truncated, corrupted, hand-edited, or half-written by an interrupted process is detectable
mechanically and locally, with no index, no model, and no network. Until now nothing in the product performed
that check. The one command whose entire job is "tell me what is wrong with this store" could not answer the
cheapest, most objective question available about it.

The immediate trigger was a decision the owner delegated: this repository is carrying 1320 uncommitted CAS
objects (5.2 MB) that the ignore rules say are allowed to travel, and 660 staged advisory candidates. The
honest answer to "should these be committed" is not a judgement call — it is a measurement, and the
measurement did not exist. An ADR whose motivation is "we were about to decide something blind" is a better
ADR than one motivated by symmetry.

## Decision

`DoctorApi` grows a fifth read leg, `casIntegrity()`, returning a `CasIntegrity` receipt on `DoctorOut`.
It answers four disjoint questions about the on-disk CAS and the sidecars that reference it:

| bucket       | meaning                                                   | how it is decided                                 |
| ------------ | --------------------------------------------------------- | ------------------------------------------------- |
| `objects`    | value files present under `<cas>/<h[0:2]>/<h>`            | a walk of the CAS root                            |
| `corrupt`    | the bytes do NOT hash to the address they are filed under | re-canonicalize + `id()`, compare to the filename |
| `unreadable` | the bytes are not parseable as a `CasObject` at all       | `JSON.parse` failure                              |
| `missing`    | a hash a sidecar references with no value file on disk    | referenced set minus present set                  |
| `orphan`     | a value file no sidecar references                        | present set minus referenced set                  |

**The verdict is derived, never stored.** `casIntegrity()` recomputes every address from the bytes it finds;
it consults no manifest of "what should be there" other than the sidecars themselves. This is the same
TRAVEL-BY-REPROOF discipline `verify-store` applies one layer up: the receipt is re-derivable by anyone
holding the directory, which is what makes a committed CAS checkable by its recipient rather than trusted.

**`orphan` is REPORTED, never acted on.** An orphan is not necessarily a defect — the CAS is append-only and
content-keyed, so a superseded object legitimately outlives the sidecar that referenced it. The leg counts
them and stops. A doctor that offered to delete them would be a write door wearing a diagnosis costume, and
TOOLS-12's whole point is that doctor persists nothing.

**Exit code stays 0.** Doctor is advisory on every leg. `verify-store` is the command whose exit code is a
governance signal; making a second one behave that way would put two merge gates in the tree with different
domains and no ADR saying which wins.

## Rejected alternatives

**(a) A sixth CLI sub-command over its own provider, leaving `DoctorApi` frozen — the `index` precedent.**
This is real precedent and it was the strongest competing option: `atlas doctor index` already sits at the
CLI, dispatched over its own injected provider, explicitly so that "the frozen `DoctorApi` (four read legs,
no more) is untouched". Rejected on the boundary that precedent itself draws. `index` is at the CLI because
it reads **the file tree and the SCIP dump** — things that are not the durable store at all. CAS integrity
reads the durable store's own bytes. Putting it beside `index` would say the two are the same kind of check,
and they are not: one asks whether an external artifact was built, the other audits the subject of every
other doctor leg. The practical consequence decides it — `DoctorApi` legs are reachable over MCP through
`atlas-doctor` (ADR-0006); a CLI-side leg is not. An integrity check that only one transport can reach is
half-shipped, and this repository has a name for a door that exists but cannot be reached from where it
matters.

**(b) Fold it into `verify-store`.** Wrong domain and wrong exit-code semantics. `verify-store` re-proves
`seal:'proven'` facts against the live index; it refuses to run at all in a directory with no `.atlas/`. A
corrupt CAS is a question you ask precisely when you do not yet know whether the store is usable, and folding
it in would put a byte-level fault behind a fact-level gate that may never get to run.

**(c) A harness probe, no product surface.** Cheapest, and it was on the table. Rejected because the audience
is wrong: a probe answers the question for us, once. The people who need this answer are whoever receives a
travelling CAS — and by the `.gitignore` decision, that is the whole point of letting it travel.

## Consequences

- `DoctorApi` is FIVE legs. The compile-time `_doctorConforms` differential-vs-oracle binding pins it, so a
  sixth cannot arrive without amending this ADR.
- `DoctorSource` grows one read method, `casAudit()`. The port stays surface-free of mutation, so doctor
  remains structurally incapable of persisting.
- `createDoctorSource` takes the CAS root path. It is passed from the composition root, which already holds
  it (`compose.ts`, `CAS_REL`) — no second source of truth for where the CAS lives.
- `atlas doctor cas` joins `DOCTOR_SUBCOMMANDS`. The shipped COMMAND count is unchanged (28) — `doctor` is
  one command with sub-commands — so `command-doc-guard`'s surface correspondence is untouched.
- **A known limit, stated rather than discovered later:** the leg audits addresses, not semantics. An object
  whose bytes hash correctly but whose CONTENT is a lie is `ok` here and always will be; that is the fact
  layer's question, and `verify-store` is the door that asks it. The two legs are complementary and neither
  subsumes the other.
