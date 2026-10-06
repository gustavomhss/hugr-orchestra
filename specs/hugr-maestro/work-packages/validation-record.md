<!-- maestro-work-contract:v1 -->

# WP: ValidationRecord And Lucy Receipt

Target: `maestro-dev` at `e87a1223b4`. Consumer: Wave 2 authorization and Wave 3 governed Task. This packet creates no PlanRevision record and does not make Task dispatchable.

## Definition of Done

- `packages/schema/src/maestro-event.ts` defines versioned durable `Validation.Recorded` and `Review.Received` events, both aggregated by `sessionID`.
- `packages/opencode/src/maestro/validation-record.ts` writes and reads immutable records through `Database` and `EventV2Bridge`; it imports `roster` and `lookupRouteGrant` from current Maestro authority and defines no parallel seat, route, grant, or policy lists.
- Validation hashes exact UTF-8 work-card bytes internally. Caller cannot supply or override the work-card hash, roster hash, grant hash, or review-policy hash.
- Validation accepts exactly one non-Maestro routed roster seat, validates nonempty deterministically ordered named checks, and persists `VALID`, `INVALID`, or `HOLD`.
- Lucy review loads exact validation record, verifies exact work-card hash, accepts only Lucy native identity, rejects self-review, accepts artifact card/diff/check evidence only, and persists `APPROVE`, `FIX_FIRST`, or `REJECT` with cited findings for non-approval verdicts.
- Retry with byte-identical binding returns existing receipt. Changed payload under same deterministic identity fails named conflict; it never overwrites event data.
- Tools expose validation only to Maestro native identity and review only to Lucy native identity. Configurable display names do not authorize either tool.
- Tests include SQLite/EventV2 durable readback. Existing restart smoke remains green.

## Invariants

- No `PlanRevision` table, event, module, fallback field, or synthetic plan identity exists.
- Typed `roster.ts` and `route-grant.ts` remain sole team/route authority. Unknown, malformed, Maestro, or non-routed member is HOLD/INVALID before persistence.
- Review identity is stable member ID `lucy`; author/routed member never reviews own record.
- Review request contains work card, diff, and named check evidence. It contains no author transcript, prompt history, model output, or arbitrary conversation messages.
- Every receipt binds session, project, immutable card hash, route/grant/roster/review-policy revision hashes, actor identity, method version, and deterministic event identity.
- Existing approval and generic Task behavior remains unchanged. New receipts are evidence only until separate authorization/dispatch WPs consume them.
- Event schema inventory and durable manifest include new events exactly once with versioned type names.

## Quality Standards

- Owner files: `packages/schema/src/maestro-event.ts`, `packages/opencode/src/maestro/validation-record.ts`, `packages/opencode/src/tool/maestro-validation.ts`, `packages/opencode/src/tool/registry.ts`, and focused tests only.
- Do not edit generated SDK/client sources. Run `bun run generate` from `packages/client` only if public Protocol or Server HttpApi changes; this packet changes neither.
- Use Effect `Schema`, `Database`, and `EventV2Bridge`; no in-memory authority cache, metadata map, `any`, or broad catch.
- Tests run from `packages/opencode`: focused validation/tool tests, `test:maestro-restart`, native runtime proof, then `bun typecheck`. Schema manifest tests run from `packages/schema`.
- Before landing, mutate work-card hash binding and reviewer identity/route check separately; each focused test must fail, then restore.
- Cold reviewer reads full diff, verifies target parentage and file list, and rejects any wrong-worktree artifact.

## Completeness Criteria

- Valid routed backend specialist/Patty/Rosie card with `VALID` checks persists and reads exact bytes/hash after SQLite readback.
- Unknown, malformed, Maestro, and non-routed member fail before EventV2 publish.
- Empty, duplicate, unsorted, malformed, or failed/HOLD check set produces named invalid/hold result according to frozen validator rule.
- Changed work-card byte, project, session, route grant, roster revision, reviewer policy, validator version, or review verdict cannot reuse old receipt.
- Exact retry is idempotent; changed retry conflicts; concurrent/repeated persistence cannot overwrite prior receipt.
- Lucy `APPROVE` requires zero findings; `FIX_FIRST`/`REJECT` require one or more cited path/positive-line/message findings.
- Lucy cannot review her own routed work; non-Lucy, renamed-config identity, author transcript, missing diff, missing check evidence, and card/hash mismatch reject before persistence.
- Maestro-only validation and Lucy-only review tools reject every other native/custom caller without writing receipts.
- Durable event manifest count and restart smoke remain valid.

## Success Criteria

- Wave 2 can read one exact durable `ValidationRecord` plus independent Lucy receipt without reconstructing authority from model tool parameters.
- Evidence survives process restart and is sufficient to bind future direct-user authorization to exact card, route, and review state.
- Runtime proof demonstrates a real SQLite/EventV2 receipt and a real unauthorized caller denial; no completion claim rests only on pure functions or mocks.
