# Derived precision at the execution boundary

Core `review/precision-catalog.ts` exports `ReviewPrecisionCatalog.effective`
with input `{project: string, catalog: ReviewCatalog.Catalog,
batches: ReadonlyArray<ReviewLedger.Batch>}` and returns a Catalog.

For each explicit rule, compute its generation from the original pack/rule tuple
and derive status using the frozen ledger. A repository pack and all its rules
remain active. A wildcard mapping also synthesizes exact native descriptors for
native ids seen in the host batches for that pack, unless an explicit descriptor
already exists. Generation for a synthesized descriptor uses the native id in
the original wildcard mapping. Unseen wildcard-native rules remain probation;
unrelated historical packs and old generations do not reset a current rule.
Derived status is not input configuration and cannot reset its own generation.

Preserve all other catalog data and input objects. Mark a non-repository pack
dropped only if it has at least one rule, every effective descriptor is dropped,
and there is no non-dropped wildcard covering unseen native rules. The returned
catalog is a host execution snapshot, never a model-visible precision report.
The existing required-check policy still applies: no silent required-lane waiver.

The actual analyzer must disable each dropped native rule before invocation,
not merely filter its resulting output. Keep demoted rules running but artifact
only. Actual page results must exclude demoted and dropped retained items before
returning them to any model; a page with only held items is empty, not a read.

For the currently built scanners:

- Gitleaks 8.30.1: explicit host-owned TOML outside the reviewed tree, `[extend]`
  `useDefault = true`, and `disabledRules` containing exact dropped native ids.
  The tagged upstream README documents both config precedence and this field:
  https://github.com/gitleaks/gitleaks/blob/v8.30.1/README.md#configuration
  The lead retrieved that tagged text directly. The explicit config also prevents
  the target's `.gitleaks.toml` from disabling checks. Preserve redaction and exits.
- Squawk 2.67.0: the existing host TOML's `excluded_rules` receives exact dropped
  native ids. Preserve transaction assumptions, additive included rules, status-only
  locate, strict outcome parsing and all physical preflight restrictions.
- Ast-grep 0.45.3: omit dropped host rule definitions from the generated host rule
  file before scan. If no rule remains, emit a named not-run, never a fake scan pass.

No wildcard string is passed as an unverified native exclusion. No repository
command is disabled by statistical precision. Bind base scanner caches to the
effective rule selection/configuration; otherwise a dropped or changed rule could
reuse a report from a different execution configuration. Native controls must show
both that a known bad case fires before exclusion and that a different active rule
continues firing afterward. Absence-only scanner tests are insufficient.

G4 owns the pure effective-catalog module and tests. G3 owns scanner preparation,
invocation and native exclusion conformance. The lead owns public entrypoint
composition and actual history-snapshot wiring; neither isolated slice proves
the full route/execute/model-delivery seam. No caps, licences, sandbox permissions,
local execution bans or final-epic cadence change.
