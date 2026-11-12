# Activity monitor — acceptance extensions

These cases close explicit clauses already present in REQUIREMENTS.md and
DESIGN.md. They do not introduce product requirements. The original 367 A cases
remain unchanged. Neither that file's historical “red” header nor this list is
an executed test result. Every case below is pending executable mapping and
hosted evidence; none is claimed passing.

## Coverage criticism corrections

- S01 (R12 R13): membership changes, path identity changes and dirty-state changes each write a strictly newer ledger generation. Reused or decreasing tokens fail. A PID is not the generation.
- S02 (R12 R19): switch EN and pt-BR; Ready, Armed, Held, Refused, Out and Unknown retain their exact English spelling in rows, confirmation and footer.
- S03 (R12 R19): aggregates cannot receive requests or expose action rows, even if their children all pass proofs.
- S04 (R12): a refused step keeps its request visible beside the refusal, outside the accepted counts/bytes.
- S05 (R13): arming through every exposed route requires person authority and the exact object ID and generation presented. Agent or other unauthorized callers, missing identity or stale tokens refuse without effects.
- S06 (R13 R15): a valid suspension mark cannot authorize resume when confirmation binds another object ID or generation. Reusing X's token on Y refuses.
- S07 (R13 R17): confirming attestation for X cannot attest Y with the same token. Confirmation ID, generation and statement type must all match.
- S08 (R13 R17): confirming cost acceptance for X cannot accept Y's cost with the same token. Confirmation ID, generation and cost statement must all match.
- S09 (R17): cost acceptance for a foreign object cannot authorize removal, even with the matching phrase and no live claimant.
- S10 (R18): displaying the ceiling's sampled value requires the metric name “sum of residents” and disclosure that shared pages count once per process. Disclosure alone with another metric name fails.
- S11 (R19): there is one chapter; tabs and top counts remain visible; changing tabs replaces the category panel rather than stacking categories.
- S12 (R19): competitor copy and generated interface explanations fail. Class labels are measured class words and action labels are verbs; no model-written note is requested or rendered.
- S13 (R1): a reader executable name cannot replace the named metric/source semantics; the UI identifies the reading, its value and age, or explicitly unread.
- S14 (R1 DESIGN): per-PID stall percentages are never published. ANE/media counters never produce invented energy readings.
- S15 (R6): the selected-tree hypothesis has exactly two allowed emissions: insufficient and compatible with logical leak. Any third class fails, even if it is not one of the explicitly forbidden examples.
- S16 (R12 R19): a Docker object cannot enter IN/OUT as a plan step, even when the interface exposes no effect button.

## First implementation wave: registered worktree disk readings

These named cases specialize R1, R2, R10, R11, R19 and R20. They are an
executable-suite specification, not an executable suite yet.

- G01 (R2 R10 R20): migrate a populated old registry, preserve every existing field and unrelated row, and backfill distinct nonempty registrationIDs. Fresh/upgraded schemas enforce the same constraints; repeated internal reads and restart preserve the IDs. Existing public list/get output is unchanged.
- G02 (R10 R20): remove and reinsert the same project/path/strategy entirely between observer queries, with equal timestamps. The persisted registrationID differs. A strategy git_worktree → other → git_worktree round trip also produces a distinct token, without observing its intermediate state.
- G03 (R10 R20): actual identity-changing producer transactions replace registrationID, ignored duplicate/no-op leaves it unchanged, and rollback publishes no token change. Audit every production writer; a path that changes identity without renewal fails. Collector reads cannot write the registry.
- G04 (R10 R20): internal listRegistrations/getRegistration expose persisted tokens consistently through actual transaction/restart paths; unknown/removed rows stay absent. Duplicate or missing tokens fail constraints; path, timestamp and rowid cannot manufacture an incarnation token.
- W01 (R1 R20): a new registered row has absent attempt/logical readings. Cached snapshots perform no filesystem reads; only an explicit read measures the row, using existing metadata budgets and gap semantics.
- W02 (R1 R11 R20): an actual nested fixture with a hardlink returns logical path bytes, source and timestamp; a subsequent symlink/missing-path/budget partial attempt preserves the last complete bytes and timestamp. No unique or reclaimable total is inferred.
- W03 (R2 R10 R20): refreshing preserves readings only for the same project+directory+persisted registrationID, removes absent registrations, isolates identical paths across projects and publishes copies. Same-path recreation and strategy ABA entirely between observations create unread rows with new reading IDs; equal timestamps do not preserve the old row. Collector reads mutate no registration or fixture content.
- W04 (R1 R20): same-row concurrent reads coalesce and different rows are independent. Hold an actual old read, recreate its registration without an intervening observer refresh, then reconcile and release the old result: it cannot resurrect or populate the replacement. Test strategy ABA, unknown/retired IDs and server reset. Every committed row/attempt change advances exact snapshotRevision; immutable full snapshots include all changes through that revision.
- W05 (R10 R19): authenticated inventory returns only ProjectDirectories entries with strategy git_worktree; root/main/copy and unregistered paths cannot become measurement targets. The server resolves paths from its registry, never a submitted path.
- W06 (R1 R20): both endpoints require authentication, invalid/retired IDs refuse and GET never walks. Manual reads check the persisted incarnation before walking and before publication; same-path recreation or strategy ABA during the walk rejects the old result. Serialized authoritative registry queries prevent older inventory results reverting newer registrations; pre/post checks cannot reuse an inventory query admitted earlier. Responses preserve exact snapshotRevision strings.
- W07 (R1 R2 R11): an actual HTTP request measures an owned fixture through the real registry, collector and schema codec; generated Client decodes the same shape with omission-based optional fields. No provenance means blank owner; unique and use-proof claims remain absent.
- W08 (R10 R20): failed registry lookup returns an explicit HTTP failure; it cannot publish an empty successful inventory. No worktree create/delete/remove, cleanup, process inspection or process action occurs. Client retention after that failure is verified by W12.
- W09 (R1 R19 R20): mounting/refreshing reads inventory only; walking requires that row's button. Requests capture category/server context. Retired-context responses are ignored. Within the same context/instance, hold GET revision 0/unread, finish manual read revision 1, then release GET: bytes, timestamp, attempt and membership cannot regress. Deliver different-row full POST snapshots 2 before 1: retain both results from 2. Equal revisions are reading no-ops; compare decimal revisions exactly above Number.MAX_SAFE_INTEGER.
- W10 (R1 R11 R20): unread, complete and partial-retry rows render logical reading/age correctly. Old complete value keeps its original increasing age; the latest attempt shows its own gaps/age. Equal/older snapshots cannot reset either age anchor. Server-clock offset cannot corrupt reading age. Missing/invalid revisions report protocol failure, never empty success.
- W11 (R2 R19): selection, sorting, filtering, refresh and category changes never invent owner. A filter miss differs from an empty successful registry; unique stays “não colapsei” and use proof stays unproved.
- W12 (R19): EN/pt-BR formatter tests and isolated actual-HTTP browser inspection confirm substituted values, English tab names, keyboard operation and narrow readable layout. Current failures show inline error and console.error while preserving values. A superseded request's late failure cannot replace the newer outcome for that operation/target; success on another row cannot hide a current failed action. This is not a packaged-Electron or installed-app acceptance claim.

## Evidence policy

Original A cases and S cases form the product acceptance inventory. G/W cases
are bounded implementation checks, not substitutes for that inventory. A W
pass may support an A/S obligation only through an explicit evidence link.
Source review, prose coverage, structural mapping, typechecks and hosted
runtime tests are distinct evidence types. Manual visual inspection is named
as such; it does not manufacture an automated DOM result.
