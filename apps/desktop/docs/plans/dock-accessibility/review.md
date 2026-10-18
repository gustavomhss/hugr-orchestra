# Planning review record

Date: 2026-09-30. Baseline: `5e4bea3b519c04cebfb787e98dfa171f5771d25c`.
Scope: prospective planning documents, not native implementation or runtime/performance evidence.

The lead consolidated five disjoint read-only research assignments. Two independently contextualized reviewers examined separate artifact slices: contract/runtime handoff and execution/validation. Both returned planning approval after the revisions below; that approval authorizes no merge and establishes no executed native case.

## Decisions corrected during review

| Finding | Adopted correction | Implementation proof |
| --- | --- | --- |
| Requiring runtime to discover accessibility roots duplicates this bridge | Helper performs indexed discovery/proposes serializable roots; runtime confirms launch/window associations | W0 ownership probes; N04 scope/portal ambiguity |
| libatspi eager Cache.GetItems/proxy retention escapes Python caps | Direct typed Gio.DBusConnection calls; eager whole-tree calls prohibited; runtime helper-only envelope and external costs explicit | W0 outgoing trace/retention/resource probes; N07/P01/P04 |
| FIFO single-flight would block cancel or release its slot too early | Separate bounded control lane; caller settlement, control acknowledgement, guest terminal result and reaping are distinct | N09 races and no-replay oracle |
| Control overtaking could make queued sequence numbers stale | Allocate monotone IDs/sequences at actual wire serialization | N09 overtaking/replay controls |
| Output budget would make later siblings unreachable | Bounded live tree continuation, root revalidation, fresh page refs and cursor-stale outcome | N07 pagination/invalidated-cursor cases |
| Event detection could imply an atomic tree snapshot | Coverage and consistency are distinct; all observations are non-atomic | N07 changed-tree/false-atomic control |
| Existing RPC/plugin could reduce native errors to message strings | Freeze native admission/error/cancel envelopes and preserve code/outcome through actual tools | N10 provider/EOF/outer timeout/ToolContext.abort faults |
| Test scope and performance thresholds could be ambiguous | Independent sender/tab/generation/profile/runtime/binding controls; baseline calibration then frozen policy before candidate verdicts | N04 manifest; P01–P05 policy/provenance |

The lead checked load-bearing repository anchors and primary wire/Gio/AT-SPI sources. The pinned library's cache behavior was verified by targeted source inspection; direct-wire XML and asynchronous Gio API documentation support the revised boundary. Those inspections are design evidence, not experimental confirmation of provider behavior.

## Explicitly pending execution evidence

- W0: actual deployed Gio/wire behavior, toolkit interfaces/actions, exporter/root correlation, Unicode/text verification, path reuse and lifecycle delivery.
- W0/runtime owner: helper-only resource supervision, decoder/event retention, process-channel lifecycle, window/portal association and handoff acknowledgement.
- W1: executable schemas/import paths, exact numeric structural limits, bounded proposal/cursor/abort-marker lifetimes, source/golden synchronization and source freeze before workers dispatch.
- W2–W5: actual real-app/mutation cases, required CI execution, baseline/instrument calibration, numeric performance acceptance policy and packaged joint-runtime evidence.

The primary deliverable is [plan.md](plan.md), with [contract.md](contract.md), [validation.md](validation.md) and [handoff.md](handoff.md). The original [brief.md](brief.md) remains a historical assignment record and is explicitly superseded by the final design.
