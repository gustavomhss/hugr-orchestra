# Parity exceptions

Every place the TS engine diverges from a golden, with its reason and the test that pins the TS behaviour. A golden
mismatch that is not listed here fails. The owner reviews this file before the Python Relay is retired.

| ID | Golden or exit path | Divergence | Reason | Test |
|---|---|---|---|---|
| W7-1 | authoring hook compile; the hook node catalog | TS accepts and lists the additive `relay.hook.v1` vocabulary that Python refuses ("Hooks accept an event, conditions and hook actions…", "Invalid output port for this action", "Choose the event operation and timing"): the `relay.hookAllow` node with an optional note, a second Verify output (Pass, Fail), and the `tool`, `session-start` (after), `prompt` (before) and `session-idle` (after) operations. | Owner decisions 2 and 5 (2026-10-06), frozen in `RelayHook`. | `authoring.test.ts` "W7-1" |
| W7-2 | authoring hook compile | A hook carrying a field `relay.hook.v1` does not define (an extra node key or parameter, a non-numeric `typeVersion`) is refused with "The hook holds fields that relay.hook.v1 does not define"; Python exports it. | Installs decode the snapshot strictly, so the export is refused before publish instead of at install. | `authoring.test.ts` "W7-2" |
| W7-3 | authoring workflow compile | A compiled plan that `RelaySprint.Sprint` cannot decode (a retained `self_check` that is not a list of text, a non-boolean `blocking`, …) is refused with "The retained plan holds fields a Relay sprint cannot carry"; Python compiles it. | The compiled sprint is what the arm loads, and the TS arm decodes it strictly. | `authoring.test.ts` "W7-3" |
| W7-4 | lint findings | A WP `id` that is not text is reported in `wp` as Python's `str()` of it (`5` becomes `"5"`); Python copies the raw value. | `Finding.wp` is text; only an undecodable plan has such an ID. | `authoring.test.ts` "W7-4" |
