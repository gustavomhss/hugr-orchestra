# Governed finding authority before publication

Source audit of the scoped receipt path found that valid method/digests, check
facts and native outcomes did not bind the submitted findings to host verifier
results. A Standard lead could omit a confirmed P1 and publish APPROVE. The
existing card-only validator did not run inside governed recording.

`ReviewCardV2.validateFindings(findings, expected)` becomes the shared synchronous
finding validator. Its input is `ReadonlyArray<MaestroEvent.Review.Finding>`;
expected is `{quick: boolean, confirmed?: ReadonlyArray<Confirmed>}`. It strictly
decodes each as `ReviewResultV2.Finding`, requires unique ids and open status,
and preserves the existing exact host Confirmed comparison of id, path, ranges,
severity, class, node, lens, rule, trigger, rung history and evidence. Every host
confirmed id appears exactly once; no invented/substituted finding is allowed.
Standard/Deep require an authoritative confirmed list, including an empty one.
Quick accepts only P0/P1 with quote-only rung history and a quote whose path and
inclusive range equal the finding's path and range. Missing fields fail rather
than being inferred from prose. Errors remain `unverified-finding`.

`validate` uses that shared function; it retains its own routing, scope, check
facts and verdict checks. No fake card is constructed to authorize a receipt.

Host-local FinishAuthorization gains `routing`, optional `scope` (the already
held facts scope) and `confirmed` (undefined at Quick, the actual host list at
Standard/Deep). Scoped record requires scope, exact artifact base/head matching
it, and runs the shared validator before seal/publication. For Quick quote
evidence, it reads the actual blob with host Git at `scope.head:path`, from the
child's host location. Truncated, unreadable/non-UTF-8, reversed, empty or out-of-
blob ranges fail before any receipt or precision row. RecordReview's existing
added-line/cause, artifact and validation-check equality remain additional gates.
Legacy unscoped receipts retain their existing behavior; using a legacy method
inside a scoped finish cannot bypass any of these checks.

Acceptance must drive a fully valid scoped registered record: exact nonempty
outcomes, correct method/digests/artifact/validation checks and available required
checks, then omit or mutate a host-confirmed P1 and verify no receipt is published.
The positive exact finding must still record FIX_FIRST. Quick fabricated evidence
coordinates and non-quote rungs must fail, with a real in-range quote positive.
Rereview's persisted route authority is a separate required repair; this boundary
does not relabel an old model card as trusted host metadata.
