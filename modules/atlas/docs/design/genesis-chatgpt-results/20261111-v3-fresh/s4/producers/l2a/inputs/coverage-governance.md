# S4 population, governance, automation, and historical evidence

`S4:L1:coverage-governance` · execution `a2095d5a-1464-4c38-a222-6376974fc9c9`; source `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocol `ee2521a5b966bd505cc95bd1c733e09e12f33531`. This L1 body distinguishes census, derived output and historical receipts from current acceptance. **Observed** means inspected source/static file structure. **Intended** is documented design. Historical claims stay attributed to their source. No code, local product test, workflow, model call, publication or deployment was executed.

`coverage.json` contains one row per assigned path, including its Git blob, SHA-256, bytes, mode, classification, semantic group, inspection/depth reason, artifact keys and observer limits. `artifacts.json` contains the exact source register; every source line below is at the fixed source pin unless explicitly marked protocol. Prefixes: `AG/` = `script/atlas-genesis/`; `H/` = `modules/atlas/harness/`; `D/` = `modules/atlas/docs/`. 

## Population is complete; semantic depth is deliberately explicit

All **2,220** inventory paths have one matching row and one primary group. Their captured raw bytes were checked against byte length, SHA-256 and Git blob SHA-1 (`blob <length> NUL <bytes>`). This is an integrity/accounting check, not a product test or a claim that every file's behavior was understood. No symlink entries exist. Sorted repository paths, each with a final LF, hash to `0b99735199c8a9a4db61bf506dafe92acb76909dd9f9c48d8f521fb920c6cd1d`. Capture receipt SHA-256 is `a41b96c8633c7f4381eb8c1c21e4db42651bdca4925e0222a0e0a2340cc5d00b`; inventory SHA-256 is `3a24c33385bb1f302bf7136707461935378ce541f3fe15a0ff3a64c4be9c6877`. The generated coverage metadata records these computations and their encodings.

| Primary body/group | Preserved path counts | What the body establishes |
|---|---:|---|
| `atlas-engine` | 318 | Contracts 11; kernel 32; persist 46; index 51; grounding 25; knowledge 100; retrieval 26; memory 27. Selected identity, grounding, lifecycle, retrieval and memory mechanisms. |
| `atlas-host-genesis` | 658 | Adapter I/O 349; Genesis 64; CLI 160; tools 42; MCP 15; boundary 28. Selected composition, provenance, storage/ownership, mining and transport seams. |
| `continuity-rag` | 63 | Continuity 19 and RAG Studio 44, including their assigned specs/guides. Request reduction/archive and document diagnostic contracts. |
| This body, primary governance groups | 1,181 | Automation, harness/integration tests, generated UI design, docs, skills, historical records and repository support. |
| **Union** | **2,220** | Every row also links to this population/governance artifact. Cross-body navigation does not add build dependencies. |

Counts include tests/docs within each group. Classification separates executable components (383), test sources (687), fixtures (25), harness/probes, scripts/guards, generated outputs, design, instructions, historical evidence/data, config and event logs. No “non-code” category is omitted. Exact class totals are in the manifest and coverage summary.

Depth is explicit: excerpts support claims; other executables retain group context; tests retain their validation role; generated outputs retain the generator route; archives retain their origin. Integrity is checked throughout. None of these dispositions grants every branch or caller semantic sufficiency.

## Observer limits are not scope limits

The ownership observer refuses `.atlas`/`.git` segments, symlinks and file bodies larger than 256,000 bytes. A fixed-baseline Git capture can preserve such files even when that runtime observer cannot version them. These are eight preserved paths, not eight absent source inputs. [modules/atlas/packages/adapter-io/src/ownership-input.ts:21-190]

| Preserved path | Observer limitation |
|---|---|
| `.atlas/members/orch/memory/logbook.jsonl` | Refused path segment |
| `.atlas/project/board.jsonl` | Refused path segment |
| `.atlas/project/orientation.jsonl` | Refused path segment |
| `modules/atlas/harness/probes/__fixtures__/bench-driver-corpus/pkg-a/.atlas/index.scip` | Refused path segment; test fixture |
| `modules/atlas/harness/probes/__fixtures__/bench-driver-corpus/pkg-b/.atlas/index.scip` | Refused path segment; test fixture |
| `modules/atlas/boundary/src/generated/mine.js` | 397,146 captured bytes, over limit |
| `modules/atlas/boundary/src/generated/surface.js` | 557,017 captured bytes, over limit |
| `specs/atlas-ui/mock/data-real.js` | 2,302,009 captured bytes, over limit |

Structural inspection found four logbook records, 96 board records and nine orientation records, with event/hash/sequence/payload/supersession envelopes. These are historical committed data, not current session state, approval or publication. Their bytes/origins remain bound in coverage.

For a future runtime binding, a refused observer input must remain unavailable or be handled through an explicitly authorized compatible observer. Silently narrowing membership to omit these files, replacing unavailable with absent, or substituting a transport SHA-256 for a runtime input version would invalidate the comparison. Accepted L1A supplies the precise input/object boundary; the current evidence does not claim such a runtime binding exists. [protocol `references/transport.md`:16-39,105-149; `references/runtime.md`:30-65,74-127]

## Harness: useful guard intent, bounded measurement power

The harness is development tooling outside the product dependency path. Its README distinguishes gates that can fail CI, libraries that gates delegate to, and manually invoked probes. Ledgers pin invariant text and requirement clauses. Gate-directory policy requires a gate to fail on missing input and asks for planted-defect tests; a file that succeeds without inspecting anything belongs in a library. These are declared maintenance obligations, not results of this execution. [H/README.md:3-23,31-59]

The captured guards cover layer direction, reference models, specification and command drift, ID/ADR/requirement citation integrity, EARS co-amendment, documented transcripts, transport-service gates and exact Own snapshots. The nested Atlas CI file invokes them and names the reference-model/wiring distinction. Integration packages `e2e` and `e2e-blackbox` are preserved separately from production components; their tests are potential regression evidence, not live proof. [modules/atlas/.github/workflows/ci.yml:39-54; coverage.json groups `governance.harness` and `governance.integration-tests`]

The reference-model guard is especially important for maintenance: it declares exported specification models with zero production value callers and names shipped counterparts. `tools/guard.ts` maps to adapter store, `tools/emit.ts` to governed emit, retrieval pack to host retrieval-model; pure persist reconstruction remains a reference. A change to an isolated helper can leave the actual command unchanged. The guard measures direct reachability and acknowledges that closed import rings and dead exports inside otherwise live files can escape that measure. Its historical commentary and declared module counts are not a substitute for rerunning it at a new revision. [H/gates/reference-model-guard.mjs:4-56,117-136,194-236]

Probes include staleness/recall, concurrency, metered/fake model and adjudication instruments; captured JSON/JSONL/TSV reports preserve their original context. An old agreement score does not establish fresh independent semantic judgment. The harness README references `.github/workflows/test.yml`; that name is source documentation and was not verified as the currently effective outer CI route here. Likewise nested `modules/atlas/.github/workflows/ci.yml` is a preserved standalone contract; its location must not be confused with a root workflow execution receipt. [H/README.md:9-14,25-29; modules/atlas/.github/workflows/ci.yml:1-34]

## Legacy Genesis automation: fixed inputs, bounded continuation, sampled judgment

The 92 `script/atlas-genesis` paths cover indexing, model transport, checkpoint/continuation, retained candidates, frontier/summary, judgment, publication, scanning, calibration and tests/data. This specific operational pipeline is not a generic native Genesis importer; uninspected recovery variants retain depth limits.

**Index and baseline identity.** `index-reuse.mjs` has a reviewed-change whitelist and checks a nonempty indexed document set, unchanged normalized paths, exact Git tree bytes and tracked link targets with cycle protection. It binds reuse to an immutable source revision rather than “the latest artifact.” `script/atlas-baseline.mjs` derives the module's historical source root and can create a synthetic comparison commit/tree for CI, including an empty-tree fallback. Such a comparison commit is machinery for a gate, not the original source revision or evidence that this producer ran Git reconstruction. [AG/index-reuse.mjs:15-100; script/atlas-baseline.mjs:1-23]

**Checkpoint contract.** Checkpoint snapshots admit only named staging/CAS/per-arm plan/report/continuation paths, check files and symlinks, bind a revision/run/attempt/index/budget/arms/wrapper/profile identity, and validate canonical base64, file SHA-256, CAS identity, sequence and prior-envelope hash. Compression is bounded and credentials are scanned before packaging. These checks preserve a particular interrupted operation's state; they do not approve its knowledge. [AG/checkpoint.mjs:19-64,67-163,230-246]

Continuation policy requires exact source identity, retry request, budget, arms, index/retained runs, wrapper/profile, settings and seed hashes; a separate completed successful proof receipt must match repository/workflow/event/branch/run/attempt/head and nonexpired artifact identity. It hardcodes pool width eight and subscription auth mode and freezes a clone of the accepted policy. That specificity matters: this function is not a general “resume any successful run” permission. How every HTTP/remote/compiled worker handles all failures remains a semantic gap outside the inspected core. [AG/checkpoint-continuation-policy.mjs:4-48,51-70]

**Sampled judge.** `judge.mjs` samples all eligible candidates below 20, otherwise a bounded 10% sample clamped to 20–60. It accepts exactly one JSON verdict line (`true|false|unverifiable`, boolean non-obvious flag, bounded reason), counts failed calls, and passes only a nonempty sample meeting true-rate 0.88, true-and-non-obvious 0.4 and failed-share ≤0.1. Source fields include the cited excerpt and, for dependency/count, restored index evidence. These are declared pipeline thresholds; no measured accuracy is asserted here. [AG/judge.mjs:24-40,103-145,194-212]

The workflow explicitly says this is not independent-model calibration. It prepares prompts, runs up to three request jobs in parallel, retries malformed answers once and makes the score binding only on publish runs. That sampled candidate judge is not the two independent reviewers of these fresh L1 artifacts, and its archived verdicts cannot be reused as current acceptance. [.github/workflows/atlas-genesis.yml:1323-1338]

**Calibration evidence.** The real-data evaluator pins corpus/source Git blobs, evaluator/helper/prompt hashes and a fixed calibration/held-out partition; preparation excludes references and validates the corpus before writing prompts. Reference checking validates ID coverage and verbatim source spans, explicitly not semantic label correctness. Scoring requires distinct reference producer IDs, rechecks prompt reconstruction, maps missing/malformed calls to unverifiable and retains their denominators. Its report says the references are fallible, blinding is instructional rather than access-isolated, proposer/judge are not independently modeled, and one fixed corpus cannot establish general accuracy. Preserved freeze/reference/result JSON records remain historical data with those limits. [AG/realdata-evaluate.mjs:35-72,86-135,185-238]

## Workflow publication is a separate operation with a concrete output

The root `atlas-genesis` workflow is dispatch-only. Its publish job requires `publish` plus successful mining and successful binding judgment; a skipped judge does not publish. The publish actor and ratifier token are expressly self-asserted strings, not a secret identity. It plans eligible parent keys, holds judged false/unverifiable candidates, excludes quarantine, promotes planned keys and checks actual settled output instead of trusting an exit code alone. [.github/workflows/atlas-genesis.yml:13-27,1396-1410,1455-1480; AG/publish-plan.mjs:79-145]

It then exports units, requires at least one exportable unit, materializes Own, checks that excluded fact identities do not leak into the snapshot/skills/catalog, and writes a binary patch for those paths. The configured output is an uploaded patch artifact; the header assigns opening a PR to Maestro. This evidence does not equate making a patch with merging or activating it. A known-credential scanner gates upload; it matches supplied credential values plus declared shapes, fails on unavailable scan inputs and reports only affected files. No scan or live credentials were used in this L1 work. [.github/workflows/atlas-genesis.yml:1-11,1495-1529,1552-1568; AG/publish-plan.mjs:120-145,193-208; AG/secret-scan.mjs:11-50,54-69]

The other root workflows have separate jobs: `atlas-pilot` is a change-scoped ownership regression/mutation/boundary evidence lane; `atlas-guard` checks relevant PR changes against Own source anchors but being a required merge check is an external setting; `atlas-worklist` writes/upload stale-source worklists after dev pushes/dispatch and does not repair without a store. The nested release workflow declares itself draft, packs tarballs and has publishing explicitly disabled. No present branch-protection state, successful CI run or deployment is established by these YAML files. [.github/workflows/atlas-pilot.yml:1-38,146-164; .github/workflows/atlas-guard.yml:1-7,65-79; .github/workflows/atlas-worklist.yml:1-10,44-71; modules/atlas/.github/workflows/release.yml:1-44]

## Generated UI, design, skills and archives have different authority

The 162 UI-spec paths comprise 143 design/build materials and 19 prototype files. The mock README calls it an interactive design preview: default Illustrated mode adds marked examples, actions are simulated and never touch a store. Its “real” data is generated from a named older local Atlas store; import statements stand in for SCIP dependencies. `extract.py` hardcodes that local repository origin and writes static JS. A display of ratification, memory or health in this prototype is not a live product receipt. [specs/atlas-ui/mock/README.md:1-31,59-71; specs/atlas-ui/mock/extract.py:1-104]

`data-real.js` and `data-spawns.js` are retained as generated datasets; the latter's stated origin is earlier continuity-run evidence. Bulk bytes are preserved by origin, not reread as current user instructions. The Atlas boundary's 18 generated JS/declaration files are different: executable consumer bundles with a source-entry mapping and a byte-parity generator. The three generated Own artifacts are another category: reviewable snapshots/skills whose source freshness and exact rendered membership have their own guard. No generation/parity/freshness run is claimed for any category. [specs/atlas-ui/mock/README.md:12-31,64-70; modules/atlas/boundary/script/build.ts:1-85; modules/atlas/packages/retrieval/src/own-snapshot.ts:192-262]

Atlas's 673 documentation paths include 23 ADR files, 75 other design documents, 57 references, 85 requirement files, 17 method files and the historical results/prompts. They preserve decisions, amendments, old baselines and contradictory status text. ADR-0008 records why mining must use staging and later corrections to stale implementation statements. ADR-0011 is still headed Proposed and contains historical measurements plus a later note deleting unwired escalation code. Read a dated measurement as a dated claim; reconcile current behavior with the pinned implementation. Two files have the ADR-0016 prefix, so the full path matters. [D/adr/ADR-0008-mining-writes-to-staging-not-to-knowledge.md:3-25,50-71; D/adr/ADR-0011-the-model-is-an-operator-supplied-command.md:3-19,28-48; coverage.json]

Root Atlas maintenance/ownership/usage skills coexist with older `.claude` methods and generated Own skills. The current skills state actor-env limits, raw memory replay, unauthenticated folders, pending host writers and design/code differences; historical commands are source data, not execution authority. The older policy-lock document discusses a different repository and historical team/protection measurements; it cannot establish today's access settings for `gustavomhss/hugr-orchestra`. [.orchestra/skills/atlas-ownership/SKILL.md:31-45,58-70; .orchestra/skills/atlas-maintenance/SKILL.md:125-141; D/governance/policy-lock.md:10-58]

Prior campaign result/prompt directories, consultation transcripts and probe/evaluation records remain exact-origin evidence. Their bodies were not imported as new reviewer opinions, instructions or runtime receipts. Accepted L1A is navigation for identity/publication; its exact body remains unchanged. L1B's four bodies have empty build dependencies and fresh request/response references. No L2 result exists in this unit.

## What a maintainer can safely conclude

This finite population is preserved; companion bodies distinguish live paths, reference models, stale evidence, unavailable observation, proved absence, candidates and published carriers. Depth gaps remain for unread historical conversations, tests/recovery branches, generated parity and external host/CI enforcement. Independent review and later runtime binding/publication require their own evidence; this bounded L1 union is not whole-domain completion.
