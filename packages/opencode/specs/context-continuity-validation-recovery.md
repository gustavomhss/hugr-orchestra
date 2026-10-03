# Context Continuity: recovered bundle validation

Date: 2026-10-03. Implementation baseline:
`37666c8acd71164adb3b686aa0cec5a191aaa609`, with the reader-v3 working bundle.

**Mechanical checks and the complete private Electron replay passed. Luna semantic
quality remains adoption-blocked. This record does not authorize a merge.**

## Recovery and execution policy

Persistent evidence root:
`/Users/gustavoschneiter/Documents/HuGR/_recovery/context-continuity-20261002/`.
The former temporary evidence directories disappeared. Historical reports and
authored patches survived in a session-scoped archive; this does not recover every
old response body, screenshot or full provider receipt. The incomplete global DB
backup is not a restorable database snapshot.

Frozen corpora, gold and grader were recovered with their original byte hashes.
The original gold SHA-256 is
`d4dccc4180146480634113eeac2b5536dcb207a5df19f75c43aebddace2271dc`;
the holdout gold SHA-256 is
`7d783887cc7b173b031572e7e9a5812ee117ab141fb118fdd95908d316463ef8`.
Hash controls reject altered bytes. Gold stays in a separate offline grading
process, outside inference inputs.

The restored historical native-v4 harness remains blocked by missing full lineage
receipts. New generations have independent durable attempt/forward witnesses;
missing ledgers never authorize retries. Existing historical paid attempts were
not replayed. Heavy runtime checks, package typecheck and source builds ran
sequentially; prototype work reused already-paid selections offline.

## Runtime since the historical validation record

- Native JSON schema is implemented through the SDK and prepared native Responses
  request. Eligible source/reason combinations, finite selectors, scoped receipt
  branches and local strict decoding remain distinct from semantic completeness.
- Mixed structured-response refusals invalidate maintenance. Ordinary parent
  requests retain their own role, hooks and generation policy.
- Dev was integrated at `da2b75aff12e21c9974ebc5be41ae138302de40b`. This is the
  integrated baseline, not a claim of synchronization with a newer remote dev.
- Producer wire omits only host integrity digests; domain hashes in values remain.
- The initialization inventory prompt and collapsed Janitor positioning are
  implemented. The repaired full UI was executed rather than inferred from the
  earlier focused browser regression.
- `render.ts` emits closed `continuity_exact_v3` frames and dictionary-indexed
  semantic provenance. All eleven semantic fields, literal values and domain
  hashes remain visible. Internal materialized descriptors retain every physical
  locator and integrity digest. Declared `reference_only` sources alone publish
  original physical lookup locators; the reader projection does not fabricate
  hidden metadata. See the [contract](context-continuity-contract.md#10-current-runtime-wire-and-cost-hints).
- Cost hints conservatively charge per-source dictionary entries, index width and
  possible recall mappings. Shared values render once. The actual complete-render
  guard remains 6,000 estimated tokens and the production deadline remains 60s.

## Actual new Luna outcomes

All calls used `openai/gpt-5.6-luna`, API ID `gpt-5.6-luna`, through the production
provider/fork stack. No plaintext fallback, repaired response grading or expanded
production bounds were used.

| Generation | Actual outcome |
| --- | --- |
| `quality-bundle-20261002-g1` | Four calls: two fresh matched baselines and two summaries. Baselines scored 29/30 and 30/30. Both actual forks rejected `protected_over_budget`; no candidate QA. |
| `quality-bundle-reader-v3-g2` | Three calls: original summary, original candidate QA and holdout summary. Original artifact was accepted at 4,470 estimated render tokens; candidate scored 24/30 versus 29/30, with four newly lost critical items. Holdout hit the production 60s fork deadline; no holdout candidate QA. |

G2 reused G1's complete baseline receipts only after actual regenerated parent SDK
bytes matched exactly. Baseline request, model, native tail/question, permissions
and generation-parameter parity were checked; no additional baseline calls were
made. Original baseline SDK hash:
`6c4396a4b0733ecdef5a33624ada58194a9076f1f160c87731c390fc235dd4cd`.
Holdout baseline SDK hash:
`e2f470c958c144d4afcf42490dc9fd4941c8a42975548bc37ac7e3bb680d68a3`.

New critical losses were `q02 seed_snapshot`, `q06 base_revision`,
`q18 proof_bundle_checksum`, and `q29 base_and_current_hash`. Accepted literal
copying and transport parity did not establish adequate fact selection. Holdout
quality is unavailable, not a zero score. No extension was authorized or executed.

The G1 offline grader initially failed because its rejection writer overwrote
summary scope annotations. Original receipts were preserved; separate postflight
verification bound them to immutable claims, witnesses and raw/request hashes.
G2 stamps scope at receipt creation and validates every writer, including rejection.
This harness repair did not turn either G1 rejection into an accepted artifact.

Offline diagnostics on the same rejected G1 selections measured 10,859/14,098
tokens for the first compact renderer. Shared whole-provenance groups still did
not fit. The capability-scoped semantic dictionary prototype measured 5,696/5,819
tokens before integration. These are representation diagnostics, not candidate QA
or retrospectively accepted artifacts.

G2 runtime/dirty-source fingerprint:
`93f2828c354247a55be4a3034e1aeb8ac9b39425242600824cf412bc24126e31`.
Evidence: `restored-quality/quality-bundle-reader-v3-g2/evidence/`, including
`quality-report.json`, `preparation.json`, full receipts/raw text, baseline reuse
bindings and accepted artifact fidelity records.

## Complete private Electron UI

Generation: `restored-ui/replay/run-reader-v3-37666c8acd-04/`.
`final-report.json` records `FULL_RESTORED_UI_EXECUTED`; `ui-evidence.json` records
`PASS`, including real DOM creation/model selection, held-parent race, incremental
memory, maintenance failure preservation, Stop, next Send, durable history,
reload and Home reopening.

Both opaque historical retrieval and published-locator retrieval used the real
builtin `context_recall`, original own-session GET message/part IDs and actual DOM
Allow Once approvals. A real parent Read completed. Wire mutants changed captured
data and failed the oracle; positive controls were rechecked. Marker detection
covered persistent/removed/old-text/old-accessibility forms in the real renderer.
Absence findings are limited to that calibrated run.

One sequential backend/Electron source build was reused across four UI attempts.
The first two stopped in the recovered harness bootstrap, before Electron. The
third passed the original scenarios but failed an added pointer check against an
empty composer; Send is correctly disabled there. The corrected harness checks
the actual enabled Send after filling, preserving the original DOM hit-test.
All failed generations and cleanup receipts remain preserved.

UI full-source/dirty-tree fingerprint:
`4827a226657a596fd4a756628bdf94a258e1e9c0a02d28c26fd5594fa776694d`.
This has a different scope from G2's quality fingerprint. Build/source receipts
bind the actual outputs to those bytes. Cleanup recorded departure of the owned
native-control, harness and Electron process groups, not a host-wide census.

UI provider was deterministic and free, with synthetic threshold usage. It used
OpenAI-compatible Chat Completions prompt-JSON fallback. Separate native mutants
validated prepared production Responses wire, not native HTTP/Electron execution.
Neither scope is Luna semantic quality evidence.

## Scoped checks and remaining gate

From `packages/opencode`, the final continuity/request/recall bundle completed
224 tests with no failures. `GOMAXPROCS=2 bun typecheck` completed without errors
after correcting the citation helper's input type. Earlier typecheck timeouts and
failed legacy-format assertions were not reported as green.

Logs: `reader-v3-runtime-tests.log`, `reader-v3-typecheck-restored.log`.
These are scoped local checks; they do not establish full-workspace or current-head
CI success. Documentation added after execution must be distinguished from the
tested runtime bytes.

Adoption still requires baseline-equivalent semantic retention, repeated accepted
original/holdout comparisons and reliable production deadline completion. Schema,
literal fidelity, budget reduction and complete UI success do not replace that gate.
