# Lucy go-live coverage matrix

Every row remains open until the exact hosted test names, result and source identity are attached. The filenames below are proof targets, not claims that their tests pass or completely cover the observation. Missing coverage requires an acceptance test before closure.

## Capabilities

| ID | Required observation | Proof targets |
| --- | --- | --- |
| G-C1 | governed/PR diff returns exact-source boundresult/receipt and refuses stale/wrongscope | modules/maestro/coordination/test/lucy-governed-round.test.ts; modules/maestro/coordination/test/lucy-pr-entry.test.ts |
| G-C2 | plan intent/acceptance/invariants/assumptions cite source or nothingfound; badplan unsupportedclaims notconfirmed | modules/maestro/coordination/test/lucy-governed-checks.test.ts; modules/maestro/coordination/test/lucy-review-result.test.ts |
| G-C3 | rereview carries exactpriorfinding and retains/updatesdisposition withoutduplicateexecution | modules/maestro/coordination/test/lucy-tier-retention.test.ts; modules/maestro/coordination/test/lucy-governed-round.test.ts |
| G-C4 | independent verifier receives finding+code only; unprovedcandidates arequestions; no selfconfirmation | modules/maestro/coordination/test/v2-review-fanout.test.ts; modules/maestro/coordination/test/lucy-finding-policy.test.ts |
| G-C5 | actual installedmutant plus failbefore/passafter/testadequacy publicdispatch; fake/pass-onlyproof rejected | modules/maestro/coordination/test/advanced-review-binding.test.ts |
| G-C6 | deterministicinterleave and property shrinking publicdispatch; stress is notpromoted asdeterministicproof | modules/maestro/coordination/test/advanced-review-binding.test.ts |
| G-C7 | API/wire/data overlay routes compatibility lens; quote/probe/evidencebound; oldreceipt/schema replayunchanged | packages/core/test/review/route.test.ts; modules/maestro/coordination/test/lucy-receipt.test.ts |
| G-C8 | security/supplychain routes correctpacks/handoff; actualofflineadvisoryfixture and missingdbrefusal retained | packages/core/test/review/route.test.ts; modules/maestro/coordination/test/lucy-check-policy.test.ts |
| G-C9 | change/provenanceoverlays and exactreleasebytes/sourceSHA checked; absentproof explicitnotrun | modules/maestro/coordination/test/release-scope.test.ts; modules/maestro/coordination/test/advanced-review-binding.test.ts |
| G-C10 | maintainability lens requires measurabledirection/evidence; preexistingdebt/taste cannotbeconfirmedblockingfinding | modules/maestro/coordination/test/lucy-finding-policy.test.ts; packages/core/test/review/route.test.ts |
| G-C11 | UIoverlay routes experience/a11y/state evidence; reproduciblemeasuredstate fixture or explicitnotexamined; noinferredUXpass | packages/core/test/review/route.test.ts; modules/maestro/coordination/test/lucy-review-card.test.ts |
| G-C12 | artifact publicrequest, existing artifact+security/agents leaves, zero variants, noverdict/receipt; R20behavioralevalnotexamined ownerpermission; no behavior-safeclaim | A01; A02; A03; A05; G-C12 |
| G-C13 | repositoryaudit fullsourceboundreport timebox max3variants/halfnoise fixreview and exactcoverage | A01; A02; A03; A04; A05 |
| G-C14 | diligence reportP0-P3 mapsdealbreaker/price/condition/observation, variants0, humanquestions | A01; A02; A03; A05 |
| G-C15 | compliance productionroute evidence/confidence/humandecisions and allG10openquestions; fourpacks+Conftest/ScanCode/REUSE accounted | C01; C02; C03; T01 |
| G-C16 | everyQ1toolrow assigned actualcapability/backend/invocation/platform and positive/refusalproof; nosubstringalias/droppedrequirements | T01; T02; T03 |

## Framework extensions

Source: [build-plan §4](build-plan.md). Each extension keeps its own observation; one generic end-to-end test cannot close the entire set.

| ID | Required observation | Proof target |
| --- | --- | --- |
| G-E1 | onlyactualreviewtoolgrants/read-only code/context; allowlistedconfinedanalyzers/probes | modules/maestro/coordination/test/lucy-tools.test.ts |
| G-E2 | readonlyatlas_context/sessionboundroots withAtlasMemoryfalse | modules/maestro/coordination/test/lucy-atlas-scope.test.ts |
| G-E3 | strictreview-result/work-result assembly onplainTask, malformedcardstaysunparsed | modules/maestro/coordination/test/lucy-review-result.test.ts |
| G-E4 | allin-scopeprofiles+tiers publicrequest hostroutesbase rules, A/C reports distinctgovernedreceipt | modules/maestro/coordination/test/v2-review-fanout.test.ts |
| G-E5 | fullfinding/routing/catalog/item/outcomemethod exactreceiptidentityandlegacyreplay | modules/maestro/coordination/test/lucy-receipt.test.ts |
| G-E6 | queueincludesboundreviews/refusesopenFIX_FIRST/REJECT | modules/maestro/coordination/test/v2-workflow-review.test.ts |
| G-E7 | actualSARIFnormalization andreadonlyLSP positive/unsafe/failure fixtures | packages/core/test/lsp-read-diagnostics.test.ts |
| G-E8 | validation rejects reviewer asroutedworker beforesessionwork | modules/maestro/coordination/test/lucy-tools.test.ts |
| G-E9 | testsabilitylistsreal lucytools noemptydeadability | modules/maestro/coordination/test/lucy-tools.test.ts |
| G-E10 | actualscratchcapture faithful/read-bound/dependencyshadow/writepolicies | packages/core/test/review/route.test.ts |
| G-E11 | perSessiongrantintersection/entry/load/toolbudgets, allenginehosts; nooffrouteskill/noauthortranscript | modules/maestro/coordination/test/v2-review-fanout.test.ts |
| G-E12 | catalogpure deterministicdigestroute/nodesreachability validated inCLI+desktoppackaging | modules/maestro/coordination/test/seat-skills-build.test.ts |
| G-E13 | receiptboundprecision/outcomes exactlyonce derivesrulestate andretainsfallback | modules/maestro/coordination/test/lucy-precision-routing.test.ts |

## Tool row closure

Each of the 83 original names retains: original requirement, actual form, mechanism, invocation, platform, positive proof, negative proof, public route proof, state and any explicit owner disposition. A source card, substring match, generic mechanism or missing prerequisite cannot close a row. New source constraints hold the affected package until a compatible design or explicit owner scope decision exists.

## Final proof

[The campaign plan](go-live-plan.md) owns package gates, production packaging, operating guidance and the final exact-source epic. Historical deliveries are regression inputs. No pending required row is treated as a live capability.
