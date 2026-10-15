# Labeled reader and shared-cost pilot

Baseline: `9cbfbc9c856b7a4e9205051a2ea53f06f2fb4344`, with the working label/cost
bundle. This follows the [recovered validation record](context-continuity-validation-recovery.md).
**Adoption remains blocked. G3 produced no accepted artifact or candidate QA.**

## Implementation and hypothesis

Reader v4 names the original typed source path next to each exact value. Its path
must equal the existing dictionary path. The ordered source/reason pairs stay in
those frames instead of being duplicated in the reader body. Internal body, exact
values and full source descriptors retain their original contract. Source paths
are labels, not invented semantic relationships or new retrieval capabilities.

Catalogue pricing charges the union of shared semantic values once in fixed cost.
Per-source hints reserve path/order, record bytes, catalogue-bounded dictionary
indices and possible retrieval locators. The decoder still checks the actual full
render against 6,000 estimated tokens. Production maintenance still has 60 seconds.
Forecasts must include the escaped notes/reference JSON, not visible prose length;
native JSON's literal U+2028/U+2029 representation otherwise undercounts the host's
six-character escapes. No schema/provenance check proves semantic completeness.

The preceding G2 audit separated selection omissions from reader failures on
visible facts. Its same accepted selection has a diagnostic forecast of 4,956
instead of 6,542 tokens; v4 renders at 4,490 instead of 4,470. This is a deterministic
representation/cost comparison, not a new quality score or regraded old artifact.

## Checks

- The combined continuity/source/request/recall suite passed 250 tests. The package
  typecheck completed separately after the combined shell deadline expired during
  its first invocation; the timed-out invocation was not counted as a pass.
- A cold independent review exercised the actual decoder/source/renderer using
  narrow Node controls, including mixed forecasts, index-width boundaries,
  foreign-parent checks, path/provenance mismatch and altered-cost controls.
- Shared charge, index width and named-path implementation mutations were detected.
  Internal exact values, typed paths, all eleven semantic fields and original
  physical retrieval locators remain checked separately from the reader projection.
- Full prior G1/G2 evidence and baseline receipts were preserved. G3 used a fresh
  persistent origin, reservation/forward ledger and receipt scope. Dry runs blocked
  forwarding and established exact regenerated parent SDK parity before reuse.

Local logs: `labeled-v4-tests.log`, `labeled-v4-typecheck-completed.log` under the
persistent recovery root. These do not represent a fresh Electron replay. The prior
PR36 CI run applies to its published head, not automatically to this working bundle.

## Actual G3 pilot

Generation: `restored-quality/quality-labeled-v4-g3/` under
`/Users/gustavoschneiter/Documents/HuGR/_recovery/context-continuity-20261002/`.
Exact provider/model/API: `openai/gpt-5.6-luna` / `gpt-5.6-luna`.
Source fingerprint:
`a0d85e5608f6abec745dd86c806bb1ba2facf33597db3134ea1a6d4ca0042038`.
Harness fingerprint:
`01f9fc69837f3b959202caf1bff6f0fd9177f784d4af445afbe147c3a2b9c8f9`.

| Round | Actual production result | Candidate QA |
| --- | --- | --- |
| Original | Completed response rejected `protected_over_budget` | Not executed |
| Holdout | Production fork timeout at 60 seconds; partial JSON retained | Not executed |

Two summary attempts were forwarded; neither was retried. Existing full baselines
29/30 and 30/30 were reused only after byte-identical regenerated parent SDK requests;
no new baseline call was needed. Gold and the frozen grader remained offline. No
response was repaired, applied retrospectively or graded after rejection. Candidate
quality, newly lost critical items and accepted savings are unavailable, not zero.

Original diagnostic render was 6,312 tokens: 34 exact extracts, 14 notes and 88
non-exact active sources. Its supplied forecast was 8,122, already over the limit.
Notes, exact framing and citations dominated bytes; active sources increased from
37 in G2 to 122. Initial observation selectors S008/S009 were unselected and uncited
despite selected siblings. Lower cost hints did not establish adequate selection.
Provider usage for the complete original response was 193,517 input and 2,630 output
tokens. These are provider measurements, distinct from host render estimates.

Holdout returned HTTP 200 and a 7,499-byte partial JSON body, without terminal usage.
The harness receipt duration was 60,320.376 ms; its first-event/text measurements are
receipt-clock offsets, not isolated provider execution latency. HTTP-start/model
duration is unavailable, so preprocessing versus model latency is not attributed.

Postflight diagnostics are separate under `restored-quality/postflight-g3/`; they
bind original bytes and use a larger diagnostic decode budget only to measure a
complete rejected render. That diagnostic is never production acceptance or QA.

## Remaining decision

The representation is mechanically validated, but the live pilot does not validate
the comprehension hypothesis. Selection still misses initial facts while overciting
other sources; input overhead and holdout deadline remain open. Further experiments
must change a measured cause and use a new generation, rather than retry this one.
