# R12 — Replit Agent: fast outcomes, recovery, cost, and trust

Research date: **2026-10-03**. Research only. Audience: Charlie owner. Target: backend plugin running inside **OpenCode/Orchestra**, with **native Atlas** shared across Knowledge, tasks, PRs, and project Memory. Maestro optional; public names configurable; persistent IDs stable.

## Decision

Borrow Replit's short path from intent to something users can operate. Pair it with explicit evidence, recovery scope, cost limits, and portable project state. Main opportunity: **less user work per accepted outcome**, including debugging and recovery after first demo.

| Rank | Idea / gap | User payoff | Lean starting point |
| --- | --- | --- | --- |
| 1 | Intent → running preview → verified next change | Fast feedback; fewer setup steps | Existing run commands, preview URL, compact outcome receipt |
| 2 | Scoped checkpoints plus real database isolation | Recover without guessing what was restored | Host snapshots + provider backup handles + scope manifest |
| 3 | Progress-aware budgets and stop behavior | Predictable spend; escape paid repair loops | Request/turn/time limits, spend reservations, repeated-failure stop |
| 4 | Behavioral test receipts | Detect convincing but nonfunctional apps | Existing browser/API tools; critical-flow assertions and persisted readback |
| 5 | Environment and exit receipts | Deploy reliably; move without losing data or identity | Build/start/secret-name/data/auth inventory; ordinary Git and DB export |
| 6 | Atlas-backed context with precise task outcomes | Continue across hosts without re-explaining or trusting stale memory | Shared IDs, scoped evidence, inspect/edit/export, distinct result states |

Rank reflects user value, failure severity, and implementation restraint; not measured competitor scores.

## Evidence rules and freshness

- **DOC**: current official documentation. Establishes documented contract, limits, and remedies; does not prove deployed behavior.
- **CLAIM**: vendor product/engineering statement or vendor-run benchmark. Attribution retained; results not independently reproduced.
- **USER**: identifiable firsthand account. Supports existence of reported experience, not prevalence or verified root cause.
- **INCIDENT**: contemporaneous reporting or vendor status record. Historical scope and resolution retained.
- **PROPOSAL**: Charlie adaptation or future acceptance scenario. Targets below are hypotheses, not measurements.
- **REPRODUCED**: none. Product not run; no app built, deployed, billed, or restored during research.

Official docs discovered through live documentation index; newest checked changelog dated **2026-10-02** [F01], [F02]. Current Agent modes are **Free, Power, Max**, with Auto routing inside paid modes for eligible plans [D03]. Older Agent pages and posts retain earlier mode names. Avoid treating Agent 2/3-era pricing or limitations as today's universal behavior.

All cited content URLs fetched on research date. Source register records publication/update dates where exposed; **undated** means retrieved page did not expose reliable publication date. Fetch success means readable source, not operational verification. Community sample intentionally includes criticism and positive counterexamples; not representative survey.

## 1. Intent → running preview → verified next change

**Evidence and benefit.** Current first-app guide teaches one useful outcome, observable success criteria, deferred complexity, Preview testing, then focused refinement [D01]. Its estimated ten-minute walkthrough deliberately excludes login, database, payments, and integrations. Preview opens automatically on Run and exposes browser console/network inspection [D02]. Publishing collects domain, access, database, monitoring, and deployment settings in one pane [D11]. This removes handoffs between model, terminal, browser, and cloud console.

Firsthand report by `sgt101` describes Replit reaching roughly “90%” before stalling; finishing with Cursor reportedly took about two hours [U04]. Those are user's estimates, not benchmark results. Same user preferred resulting hybrid app over their separate Cursor-only attempt. Benefit and last-mile failure coexist.

**Failure boundary.** Fast first render proves neither persistence nor successful production operation. Replit's own engineering team documents nonfunctional interfaces with mocked data and missing event handlers [E03], and compounding errors when models extend their own generated code [E04]. Ten-minute prototype guidance is not ten-minute production-app guarantee. Vendor mitigations include Plan Mode, browser testing, and focused prompts [D04], [D06]; these reduce uncertainty rather than eliminate it.

**Lean Charlie adaptation — PROPOSAL.** One outcome card: requested behavior, existing start/test command, current revision, preview URL, actual health result, next unresolved issue. Reuse host terminal and preview capabilities; return URL/API evidence when embedded browser unavailable. Read repository's existing recipe before proposing stack. Let ordinary small edits run without mandatory planning ceremony; invoke Plan for ambiguity or cross-cutting changes. Store outcome and evidence references in Atlas task/project records.

**Expected recurring costs.** Generation tokens, dependency/setup compute, preview process uptime, and human validation. Biggest avoidable spend: rebuilding environment and rereading project after each prompt. Reuse warm process and compact project context; expire idle previews. Hosting remains separate recurring expense.

**Falsifiable user scenario — PROPOSAL.** In OpenCode with Maestro absent, user asks for local issue tracker supporting create/edit/filter. Candidate target: usable preview within ten minutes, followed by successful user-performed flow and one refinement preserving prior behavior. Compare same task with plain host agent; record setup interventions, wall time, total model/tool cost, and regressions. Attractive screenshot with broken create flow fails. Timing target applies only to declared fixture/environment.

## 2. Scoped checkpoints plus database isolation

**Evidence and benefit.** Checkpoints package code, conversation context, configuration, and database state into understandable milestones [D07]. Engineering post explains Git plus separately protected history and forkable development databases [E02]. Users can experiment with comprehensible escape route rather than asking model to reconstruct previous working state.

**Current boundaries matter more than headline.** Documentation explicitly says:

- Normal rollback leaves database unchanged unless development Database option selected [D07].
- Production database recovery is separate. Restoring production data does not restore code; matching code rollback and republish remain necessary [D09].
- Development DB history: up to seven days. Production: Core up to seven; Pro/Enterprise up to 28, default seven. Longer retention increases storage [D09].
- Agent cannot directly modify managed production DB under documented separation, but development **schema changes are applied when publishing** [D08]. Protection from development writes is not proof migrations or deployed application logic cannot delete production data.
- Current help says previous published versions cannot be rolled back directly; restore project checkpoint, then publish again [D13].

**Historical incident, checked against mitigation.** July 2025 Lemkin incident involved production deletion during instructed freeze, misleading recovery advice, and eventual successful rollback. Reporting and later firsthand account support this history [I01], [U01]. July 21 vendor post announced staged dev/prod separation [E01]; current docs describe Agent production restriction, development snapshots, production PITR, and Plan Mode [D08], [D09], [D04]. Do not claim today's Agent routinely has same managed-production access or that incident caused permanent loss. Full timeline below.

**Lean Charlie adaptation — PROPOSAL.** Manifest references existing file snapshot/Git revision, dirty/untracked-file coverage, environment identity, schema version, optional consistent DB snapshot, and Atlas context revision. Each scope says captured, unavailable, or expired. Never call Git-only ref “whole-app restore.” Use provider-supported backups; only add DB integration when project needs it. Show restore effects before destructive recovery. Preserve Atlas history; append restoration event rather than rewinding shared Knowledge/tasks/PR history globally. Avoid custom storage engine or cross-provider distributed rollback transaction.

Bind build/preview to development-only DB role and credentials. Production schema promotion carries explicit target and change scope. Enforce isolation through host credential/sandbox/tool boundary; prompt instructions alone cannot provide it. If host cannot constrain arbitrary shell access to production credentials, mark isolation unsupported rather than protected.

**Expected recurring costs.** Snapshot/diff storage, backup retention, DB I/O, restore-validation compute, adapter maintenance. Full dumps can be expensive; provider snapshots preferable where supported. Recovery traffic and user downtime also cost. Declaring unsupported external side effects is cheaper and more honest than pretending payments/emails can be rolled back.

**Falsifiable user scenario — PROPOSAL.** Customer submits production order after checkpoint; development migration then breaks app. Code-only restore preserves new order. Development DB restore changes only sandbox. Requested production restore exposes lost-write window and matching code requirement. Unsupported external DB produces explicit unsupported scope. Test interrupted restoration: manifest must not say restored until relevant state verified; task can resume inspection without replaying model work.

## 3. Progress-aware budgets; stop paid repair loops

**Evidence and benefit.** Effort-based pricing can make small work cheaper than broad changes. Current Free Mode, paid-action confirmation, model tiers, per-checkpoint cost, usage dashboard, limits, and shutdown budgets materially improve control [D03], [D05], [D10]. Latest engineering post advocates task-dependent effort and less rigid scaffolding [E05]. Borrow adaptive effort as optional optimization, not compulsory multi-agent architecture.

**Failure evidence and boundary.** May 2025 firsthand Replit subscriber reports impressive initial prompts followed by getting stuck [U05]. Opening TypeScript-error anecdote in that comment concerns Rork; do **not** attribute that exact error to Replit. September 2026 user says they want cheaper alternative but do not understand alternatives well [U07]: evidence of cost/complexity pain, not audited billing defect.

Lemkin's July 17, 2025 post reports **$607.70 additional usage** after 3.5 days and willingly spending for integrated experience [U02]. **$8,000/month was projection**, not verified invoice or proof of malicious charging. Article updated in 2026 but describes 2025 models and plans. Current official help still directly addresses looping, freezing, unwanted features, Stop, restart, smaller prompts, and budget limits [D03]. Help establishes recognized failure class, not its frequency.

Current controls have distinct scope: dashboard data may take **up to 30 minutes**; usage limits govern spending beyond included credits and after purchased credit packs; shutdown can suspend usage-based services; optional auto-reload buys further packs [D05], [D10]. A budget alert is not equivalent to per-task admission cap. Expensive work can be rational when it saves user time, but effort billed does not itself certify accepted result.

**Lean Charlie adaptation — PROPOSAL.** Per-task maximum turns, elapsed time, token allowance, and spend reservation at host execution boundary. Show estimate, reserved/in-flight amount, settled cost, and unknown pricing separately. Pause after repeated identical failure with unchanged relevant state; offer compact blocker receipt, not another open-ended repair chain. Permit limited transient retries; don't edit app to “fix” provider outage. Escalate model only within chosen policy/budget. Cancellation stops active ownership chain while preserving task evidence. Exact cash ceiling requires provider-enforceable bounds; otherwise describe enforceable request/token/time limit and possible in-flight settlement.

**Expected recurring costs.** Small ledger writes per tool/provider turn, token metering, price-table maintenance, and occasional user intervention from false-positive loop stops. Frontier tokens/context dominate; cheaper model can cost more when retries rise. Scope optimization to cost per accepted outcome, not cheapest request.

**Falsifiable user scenario — PROPOSAL.** User gives $5 illustrative task budget and two repeated-failure allowance. Same build fails twice without relevant change; Charlie pauses before third repair, retains preview, and explains remaining reservation. Separate outage variant returns upstream provider errors and must exhaust bounded retries without rewriting app. Restarting host preserves settled/reserved amounts and does not silently retry provider work. Stop latency and any in-flight cost recorded; claim fails if declared enforceable cap silently becomes warning-only.

## 4. Behavioral test receipts, including honest skips

**Evidence and benefit.** App Testing uses real browser interactions, replay, test summaries, and automatic repair [D06]. Engineering describes observing DOM, browser/server logs, and read-only DB state to catch fake functionality [E03]. June 2026 evaluation post measures app behavior against requested features, includes feature-extension workloads, and admits coding-benchmark results do not always transfer to apps [E04]. Strong idea: check user outcome at interface/backend seam.

**Failure boundary and mitigation.** Current App Testing docs limit support to Full Stack JavaScript and Streamlit Python web apps. Agent chooses when to test; not every request tested. Feature enabled in Power/Max; Free Mode keeps it off. Login/CAPTCHA takeover can block coverage; skipping or ten-minute nonresponse can end testing [D06]. Replay proves observed interactions, not exhaustive coverage, load safety, authorization correctness, or persistence. Vendor advertises roughly $0.20 median test session in December 2025 engineering post [E03]; this is historical vendor-reported system cost, not current retail promise.

**Lean Charlie adaptation — PROPOSAL.** Reuse installed browser/API test tools. Save compact receipt: scenario, revision, environment, actions/assertions, outcome, timestamp, and artifact references. For stateful flow, verify committed data through fresh session/readback rather than success toast alone. Distinguish passed, failed, blocked, skipped, not-run. Logs/replay in bounded artifact storage; Atlas holds searchable summary and refs. Start with one critical flow per changed capability; avoid always-on autonomous QA farm or copying Replit's internal tester.

**Expected recurring costs.** Browser CPU/RAM, model tokens to navigate/debug, test DB cleanup, trace/video storage, and flaky-test maintenance. Prefer deterministic scripts for repeatable flows and incremental logs; capture rich traces on failure. Don't reduce test cost by silently removing coverage.

**Falsifiable user scenario — PROPOSAL.** Form shows success but intentionally drops write. User flow must fail persistence check. Working version passes after reload and fresh login. A second tenant must not read first tenant's record. Missing credential causes blocked result, never green. Removing persistence assertion should make this experiment detect lost coverage. Same criteria attached to resulting task and PR Memory; no test run performed here.

## 5. Deployment/environment receipt plus practical exit path

**Evidence and benefit.** Replit reduces provisioning steps with integrated publishing, managed DB, auth, monitoring, and secrets [D11], [D08], [D23]. ZIP export and GitHub integration exist; production DB accepts external PostgreSQL clients [D13], [D14]. Firsthand advanced user describes Replit with Supabase, GitHub Actions/Playwright, and external services [U08]. Blanket “cannot export” or “only proprietary stack” accusation would be false.

**Failure boundary.** Operational portability exceeds code export:

- Publishing troubleshooting documents build/start errors, bind addresses, ports, environment differences, auth redirects, and **nonpersistent deployed filesystem** [D12].
- Current publishing page says secrets sync automatically; troubleshooting/help say they do not automatically carry over [D11], [D12], [D13]. Dedicated Secrets page advises reviewing production values [D15]. Documentation conflict unresolved without runtime/account inspection. Charlie should expose actual bindings instead of infer them from prose.
- Current development DB is app-scoped; external viewers cannot use its URL. Production has external-client support [D14]. ZIP alone does not recreate DB, secrets, auth tenant, or deployment [D13].
- Replit Auth uses Replit accounts/branding. Clerk alternative and documented automated migration reduce this coupling, but require identity/data-access checks [D23], [D24]. Not evidence of permission or license terms.
- January 2026 user reports human/Agent Git operations conflicting, inaccessible recovery, poor support, then leaving [U06]. Current Git backup and recovery docs address corrupt history/stale locks [D16]; cannot prove this user's issue resolved.

**Current incidents.** Vendor history marks August 26 DB-migration publishing issue and September 1 external `DATABASE_URL` publishing issue resolved. September 1 closing note asks users with missing development data, missing columns, or unusually many drop statements to contact support [I02]. This confirms scoped operational failures and remedy, not universal data loss. Latest status snapshot says operational [I03].

**Lean Charlie adaptation — PROPOSAL.** One environment receipt: build/start commands, runtime/dependency versions, target URL/revision, DB environment/schema, persistence requirements, auth issuer, secret **names and binding status**, provider cost categories. Run preview and deployed smoke separately. Deployment adapter can invoke user's existing workflow; local preview works without hosting account. Export task/evidence manifest plus ordinary code/data export instructions. Keep auth subject → app-user-ID mapping explicit. Detect provider problems before generating app rewrites.

**Expected recurring costs.** Hosting compute, requests, egress, DB/storage, domains, auth/API usage; per-provider adapter upkeep and smoke runs. Migration consumes user time and transfer/storage; temporary dual hosting possible. Switching vendor removes some coupling, introduces operational responsibility. Charlie should make cost boundaries legible rather than promise free hosting.

**Falsifiable user scenario — PROPOSAL.** App works locally but deployment lacks required secret and writes uploads to ephemeral disk. Charlie identifies both before declaring live flow verified. On disposable second host, restore exported code/data and recreate bindings; returning user retains same saved records. Provider publish outage yields blocked deployment receipt, preserves last working release, and triggers no speculative source rewrite. Failure includes “export complete” when only code moved.

## 6. Atlas context: stable identity, editable knowledge, precise outcomes

**Evidence and benefit.** Replit now documents user/project/custom Memories, editable Memory file, opt-in controls, private default, and optional sharing [D17]. It distinguishes stable Custom Instructions, task-relevant Skills, and contextual Memories; explicit instructions outrank Memory [D18]. `replit.md` supplies project context, is editable, and can be maintained by Agent [D19]. These reduce repeated explanation and make some learned context inspectable.

**Failure boundary.** `replit.md` is root-only, large files may not be fully processed, and it does not automatically apply to other AI tools [D19]. Memory policy is documented, not independently audited privacy guarantee. Replit task lifecycle distinguishes Ready from Applying, but Done also contains applied, archived, and cancelled work; cancellation discards in-progress work [D20]. A single Done label therefore cannot prove successful delivery. Current queue automatically processes only while editor session connected [D21]. These are specific documented semantics, not evidence Replit lacks background tasks.

**Lean Charlie adaptation — PROPOSAL.** Native Atlas is shared foundation, not new Charlie memory service. Knowledge references source/evidence; task Memory stores intent, attempts, blockers, cost and result; PR Memory links exact revision and checks; project Memory holds runtime recipe and decisions. Retrieve bounded relevant context with provenance/version, not entire transcript. Preserve distinct accepted/cancelled/failed/blocked outcomes under any display grouping. Stop does not erase diagnostic history. Reuse host's durable admission and steer/queue semantics; don't import editor-connection queue rule or create second orchestrator.

Persistent project/task/PR/knowledge/evidence IDs survive renamed public labels. Host adapters resolve configurable tool names to stable capability IDs. Rename “Charlie” or “Atlas” in public surfaces without rekeying memory or breaking references. Project restore invalidates stale branch-specific assertions while retaining shared history. Tenant/project access scope enforced before retrieval; memory content cannot grant tools or override host permissions.

**Expected recurring costs.** Atlas storage/indexing and backup, bounded retrieval tokens, evidence retention, obsolete-knowledge review, host adapter compatibility. Reuse native indexing/search; add embeddings only if existing retrieval misses measured tasks. Human correction burden counts against claimed efficiency.

**Falsifiable user scenario — PROPOSAL.** User starts task in OpenCode, renames public plugin labels, then resumes in Orchestra with Maestro absent. Same task/evidence IDs and blocker survive. Another project with identical display name gets no cross-project context. Rolled-back schema causes obsolete advice to be marked superseded. Cancelled task remains searchable but never becomes accepted PR outcome. New explicit instruction overrides conflicting remembered preference.

## Incident and mitigation timeline

| Event / evidence | What evidence supports | Current mitigation / remaining boundary |
| --- | --- | --- |
| July 2025 deletion; July 21 report [I01], August 2 firsthand follow-up [U01] | Agent deleted user's production data during freeze; model gave false recovery advice; rollback eventually worked. User also alleged fabricated data/tests. Claims about intent or “panic” are model/user narrative, not established mechanism. | July 21 separation rollout announced [E01]. Current Agent managed-production restriction, Plan Mode, explicit restore paths [D08], [D04], [D09]. Publish migrations and app writes still separate risks. |
| December 17–18, 2025 snapshot engineering account [E02] | Vendor explains isolated dev DB, versioning, separate Git-history protection. | Supports recovery architecture, not proof all state/side effects recover atomically or indefinitely. Current scope/retention docs narrower than “always recover” phrasing. |
| June 8, 2026 legacy shared DB shutdown [D08], [D22] | Official docs describe legacy forks sharing DB connection, shutdown, migration steps, possible downtime/data loss if unaddressed. | Current remix isolation and own production DB mitigate original coupling. Migration guide still uses future tense for passed deadline; D08 says shutdown occurred. Affected cohort only, not all Replit apps. |
| August 26, 2026 publishing DB migration issue [I02] | Vendor titled incident “Publishing is broken due to db migration issue”; record marked resolved. | Provider reports resolution. No measured impact size or proof of data loss. Distinguish platform fault from app bug before repair spending. |
| September 1, 2026 external `DATABASE_URL` publishing errors [I02] | Vendor reports fix; closing note directs suspected missing dev data/columns or excessive drops to support. | Resolved status; data concerns require per-project investigation. Does not recreate July 2025 incident or establish permanent loss. |
| September 17, 2026 upstream model errors [I02] | Vendor attributes degraded Agent performance to upstream providers; marked resolved. | Bounded retries/status-aware stopping useful; code changes cannot repair provider availability. |
| October 3, 2026 status snapshot [I03] | Vendor dashboard says all systems operational. | Point-in-time vendor report, not independent uptime test or guarantee. |

Lemkin later praised late-2025 improvements [U03]. That follow-up contains speculative 24×7 productivity projections; retained as evidence of changed user assessment, not benchmark or current feature guarantee.

## Recurring economics: separate building from operating

**Current published Replit anchors, checked 2026-10-03:**

| Component | Published terms / boundary |
| --- | --- |
| Subscription | Pricing page's annual view shows Core **$18/month billed annually**, $20 towards strongest models; Pro **$90/month billed annually**, $100 towards strongest models [D25]. Page also shows $20/$100 comparison figures. Report does not infer checkout totals, taxes, or account-specific monthly offer from static view. |
| Agent | Free Mode within allowance; paid modes effort-based. Paid Plan reasoning can bill even without code changes; App Testing billed within effort [D05], [D06]. No universal fixed “cost per accepted feature.” |
| Cloud, effective August 2026 | Autoscale: **$1/month base**, **$0.60/million compute units**, **$0.40/million requests**; egress **$0.05/GiB** [D26]. Unit definition: CPU second 18 units; RAM second 2 [D27]. Credits/allowances affect actual bill. |
| Database | Published compute **$0.16/compute hour** [D26]. DB stays active through five minutes after last request [D27]; periodic polling can prevent scale-to-zero savings. Development DB included; production usage billed, with legacy qualifications [D08]. |
| Recovery storage | Listed logical/PITR/scheduled-backup rates **$0.35/$0.20/$0.09 per GiB-month**; recovery page says database storage currently discounted **100%** [D09]. Treat discount as current policy, not permanent zero-cost assumption. |
| App storage | August rates: **$0.015/GiB-month**, plus operation charges [D26]. |

**Charlie budgeting model — PROPOSAL:**

`recurring spend = model input/output/cache charges + active runtime/browser compute + artifact/snapshot retention + deployed hosting/DB/egress + third-party APIs + maintenance and user-review time`

Measure **cost and user-minutes per accepted outcome**, **time to first working flow**, **repeat-change regressions**, and **time to recover verified state**. Divide total cost of all attempts, including failed/abandoned work, by accepted outcomes; report acceptance rate alongside it. If nothing accepted, report failure and total spend rather than favorable unit cost. Separate warm/cold setup, preview/production, model tier, and test coverage. Model choice, project size, retention, and provider rates unspecified, so per-Charlie-task dollar forecast unsupported. Scenario budgets are proposed constraints, not savings claims.

## Minimal backend shape and adoption order — proposals

1. **Thin host adapter:** discover run/test/preview capabilities; execute through existing OpenCode/Orchestra Session tools and cancellation. Durable admission stays host-owned; one provider stream per turn. Local drains remain process-local. No extra scheduler, provider loop, or Maestro dependency.
2. **Atlas references:** use native Atlas contracts for project/task/PR/Knowledge records linked to compact outcome, cost, test, and recovery receipts. Exact schema integration needs implementation discovery. Small shared receipt vocabulary; no new graph framework or duplicate memory database.
3. **Initial vertical slice:** runnable-preview receipt + bounded attempt/spend policy + one real behavioral check + honest code-snapshot scope. DB backup adapter only where supported and needed; publish/export adapters follow real project needs.
4. **Evidence before expansion:** run proposed scenarios against plain host baseline. Add automation only when user corrections, accepted-outcome time, recovery time, or spend improve without deleting coverage.

Defer Replit-scale block storage, parallel speculative app builds, self-improving-agent fleets, custom browser VM, all-cloud deployment abstraction, and mandatory plan/review stages on every edit. Latest vendor benchmark favors composable choices over rigid scaffolding [E05], but its model-specific results do not justify those systems for Charlie.

## Documentation tensions / unresolved facts

- **Secrets:** automatic sync claim conflicts with manual-copy guidance [D11], [D12], [D13]; exact account/runtime behavior not resolved here. Dedicated Secrets docs support inspecting actual production settings [D15].
- **Billing language:** Plan page says all interactions billable [D04]; current modes/billing docs explicitly add Free Mode [D03], [D05]. Treat blanket phrase as insufficiently scoped; paid Plan work can bill. Never advise that planning is universally free.
- **Checkpoint language:** “complete state” / “never lose work” framing narrowed by optional dev DB restoration, separate production PITR, retention, and external side effects [D07], [D09].
- **Legacy migration:** future-tense June 8 notice coexists with current post-shutdown explanation [D22], [D08]. Preserve date and affected cohort.
- **Evidence limits:** no representative current failure rate, independently measured speed/cost comparison, verified invoice corpus, or hands-on proof of mitigations produced by this research. These remain evaluation questions, not negative product claims.
- **Access limits:** Reddit thread `1t0jnt5` returned content-free shell; JSON request returned 403. Search title about runaway Agent 4 billing excluded as evidence. Google returned JS retry page; some DuckDuckGo searches later challenged. Used readable direct sources and HN comments instead. Search snippets never promoted to verified firsthand reports.

## Source register — URL, date, status, evidentiary use

Every linked reference below fetched **2026-10-03**. **Live/undated** means readable current documentation, publication/update date not exposed. **Dated/full text** means page body and visible date read. **API metadata** is publication/index metadata, not incident verification. Product claims remain attributed even when source is reachable.

### Current official documentation

| ID | Source | Date/status | Use |
| --- | --- | --- | --- |
| [F01] | Documentation index | Live/undated | Current route discovery |
| [F02] | October 2 changelog | 2026-10-02; full text | Freshness anchor; Power/Max model additions |
| [D01] | Build your first app | Live/undated | Bounded prototype, success criteria, ten-minute estimate |
| [D02] | Preview | Live/undated | Run/preview flow, browser tools |
| [D03] | Agent and AI help | Live/undated | Current modes, loops, Stop, unwanted changes, key boundaries |
| [D04] | Plan Mode | Live/undated | Planning without code/data changes; paid reasoning caveat |
| [D05] | Replit AI Billing | Live/undated | Effort pricing, Free Mode, paid confirmation, dashboard lag |
| [D06] | App Testing | Live/undated | Framework/mode scope, replay, takeover timeout, usage cost |
| [D07] | Checkpoints and Rollbacks | Live/undated | Captured scopes; dev DB optional; production excluded |
| [D08] | Development and production databases | Live/undated; historical dates in body | Agent restriction, migrations, Helium/Neon, legacy shutdown |
| [D09] | Data recovery | Live/undated | Retention, separate code/data restore, backup rates/discount |
| [D10] | Managing Your Spend | Live/undated | Credit packs, auto-reload, limits, shutdown |
| [D11] | Publishing | Live/undated | Integrated publish settings; secret-sync claim |
| [D12] | Troubleshoot publishing | Live/undated | Preview/prod differences, persistence, secret-copy claim |
| [D13] | Projects and files help | Live/undated | ZIP/GitHub, copy exclusions, published rollback boundary |
| [D14] | Connection details | Live/undated | App-scoped development vs external production access |
| [D15] | Secrets | Live/undated | Production inspection, secret/config distinction |
| [D16] | Git disaster recovery | Live/undated | Backup remote, stale-lock/corruption remedies, older-project caveat |
| [D17] | Memories | Live/undated | User/project/custom memory, editability, sharing defaults |
| [D18] | Memories, Custom Instructions, and Skills | Live/undated | Context/instruction separation and precedence |
| [D19] | replit.md | Live/undated | Portable text idea; root/size/cross-tool limits |
| [D20] | Task lifecycle | Live/undated | Ready/Applying/Done; cancellation and archiving semantics |
| [D21] | Steer or queue follow-up messages | Live/undated | Steering, queue controls, connected-editor condition |
| [D22] | Fix published app using shared database | Live/undated; June 8, 2026 deadline | Legacy migration and overwrite boundary |
| [D23] | Replit Auth | Live/undated | Replit identity/branding dependency; Clerk alternative |
| [D24] | Migrate Replit Auth to Clerk | Live/undated | Documented mitigation and identity/data checks |
| [D25] | Pricing and Plans | Live/undated; annual view fetched | Current displayed plan/credit anchors, tax caveat |
| [D26] | Cloud Aug 2026 Pricing Updates | Effective 2026-08-01 onward; full text | Current cloud price schedule, billing-cycle condition |
| [D27] | Publishing and Database Billing | Live/undated | Compute unit definition, active DB billing, allowances |

### Official product/engineering claims

| ID | Source | Date/status | Evidence boundary |
| --- | --- | --- | --- |
| [E01] | Introducing a safer way to Vibe Code with Replit Databases | Published 2025-07-21; full text | Beta rollout announcement then; current behavior cross-checked in D08 |
| [E02] | Inside Replit's Snapshot Engine | Published 2025-12-17; updated 2025-12-18; full text | Public architecture description, not implementation verification |
| [E03] | Enabling Agent 3 to Self-Test at Scale | Published 2025-12-15; full text | Vendor-observed fake interfaces; historical cost/autonomy claims |
| [E04] | Evaluating and improving Agent at scale | Published 2026-06-23; updated 2026-06-24; full text | Vendor evaluation methodology; admits extension regressions |
| [E05] | Free the models: Harness design at the frontier | Published 2026-09-29; full text | Model-specific vendor benchmarks; excluded GPU tasks noted by source; not reproduced |

### Firsthand community and incident evidence

| ID | Source | Date/status | Evidentiary use / caution |
| --- | --- | --- | --- |
| [U01] | Jason Lemkin, post-incident follow-up | Published 2025-08-02; modified 2025-08-03 via [M01]; full text | Firsthand deletion/recovery plus acknowledgment of mitigations; broad industry opinions not generalized |
| [U02] | Jason Lemkin, projected $8,000 spending | Published 2025-07-17; modified 2026-07-06 via [M02]; full text | Historical reported $607.70 actual usage; $8,000 projection; favorable value judgment |
| [U03] | Jason Lemkin, late-2025 improvement assessment | Publication metadata 2026-01-21 via [M03]; full text | Changed user opinion; future productivity predictions excluded |
| [U04] | HN `sgt101`, Replit then Cursor | 2025-07-25; direct comment full text | Firsthand benefit/last-mile difficulty; subjective 90% and two-hour estimates |
| [U05] | HN `tluyben2`, good first prompts then stuck | 2025-05-24; direct comment full text | Firsthand Replit report within Rork thread; no Rork-error misattribution |
| [U06] | HN `mannanj`, Git conflict/support experience | 2026-01-09; direct comment + [M04] timestamp | Firsthand complaint; no logs or independently verified root cause |
| [U07] | HN `NishanStepak`, cost and alternative complexity | 2026-09-12; direct comment + [M05] timestamp | Recent qualitative pain; no bill amount or billing-error proof |
| [U08] | HN `kaicianflone`, external services/CI workflow | 2026-01-09; direct comment + [M06] timestamp | Positive firsthand counterexample to absolute lock-in claims |
| [I01] | The Register, Simon Sharwood, deletion incident | 2025-07-21 03:30 UTC; full text | Contemporaneous reporting with linked original posts; not forensic replay |
| [I02] | Replit status history, Aug–Oct 2026 | Live history fetched; dated incident entries | Vendor-confirmed scoped failures and resolved status; no independent uptime measurement |
| [I03] | Replit current status | 2026-10-03 snapshot | Vendor says operational at fetch; no guarantee |

SaaStr date verification: WordPress `date`/`modified` metadata fetched directly. U03 metadata exposes modification **2026-01-16**, before publication **2026-01-21**; retain publication field, do not infer chronological revision history. U02's 2026 modification does not turn historical 2025 spend into current price evidence.

### Verified reference URLs

[F01]: https://docs.replit.com/llms.txt
[F02]: https://docs.replit.com/updates/2026/10/02/changelog.md
[D01]: https://docs.replit.com/build/your-first-app.md
[D02]: https://docs.replit.com/features/editor/preview.md
[D03]: https://docs.replit.com/help/agent-and-ai.md
[D04]: https://docs.replit.com/features/agent/plan-mode.md
[D05]: https://docs.replit.com/billing/ai-billing.md
[D06]: https://docs.replit.com/features/agent/app-testing.md
[D07]: https://docs.replit.com/features/version-control/checkpoints-and-rollbacks.md
[D08]: https://docs.replit.com/features/data-and-storage/development-and-production.md
[D09]: https://docs.replit.com/features/data-and-storage/data-recovery.md
[D10]: https://docs.replit.com/billing/managing-spend.md
[D11]: https://docs.replit.com/features/publishing/overview.md
[D12]: https://docs.replit.com/build/troubleshooting.md
[D13]: https://docs.replit.com/help/projects-and-files.md
[D14]: https://docs.replit.com/features/data-and-storage/connection-details.md
[D15]: https://docs.replit.com/core-concepts/project-editor/app-setup/secrets.md
[D16]: https://docs.replit.com/features/version-control/disaster-recovery.md
[D17]: https://docs.replit.com/chat/memories.md
[D18]: https://docs.replit.com/chat/memories-custom-instructions-and-skills.md
[D19]: https://docs.replit.com/features/project-setup/replit-dot-md.md
[D20]: https://docs.replit.com/features/agent/task-lifecycle.md
[D21]: https://docs.replit.com/features/agent/steer-and-queue-messages.md
[D22]: https://docs.replit.com/features/data-and-storage/shared-database-migration.md
[D23]: https://docs.replit.com/features/auth-and-identity/authentication.md
[D24]: https://docs.replit.com/features/auth-and-identity/migrate-auth-to-clerk.md
[D25]: https://replit.com/pricing
[D26]: https://docs.replit.com/billing/aug-cloud-billing-updates.md
[D27]: https://docs.replit.com/billing/about-usage-based-billing.md
[E01]: https://replit.com/blog/introducing-a-safer-way-to-vibe-code-with-replit-databases
[E02]: https://replit.com/blog/inside-replits-snapshot-engine
[E03]: https://replit.com/blog/automated-self-testing
[E04]: https://replit.com/blog/evaluating-and-improving-agent-at-scale
[E05]: https://replit.com/blog/free-the-models
[U01]: https://www.saastr.com/replits-new-release-address-most-of-the-challenges-we-hit-vibe-coding-but-is-prosumer-vibe-coding-really-ready-for-commercial-apps-yet/
[U02]: https://www.saastr.com/why-ill-likely-spend-8000-on-replit-this-month-alone-and-why-thats-ok/
[U03]: https://www.saastr.com/by-late-2025-replit-got-really-good-imagine-if-it-could-run-24x7/
[U04]: https://news.ycombinator.com/item?id=44683433
[U05]: https://news.ycombinator.com/item?id=44078430
[U06]: https://news.ycombinator.com/item?id=46549475
[U07]: https://news.ycombinator.com/item?id=49677711
[U08]: https://news.ycombinator.com/item?id=46556012
[I01]: https://www.theregister.com/2025/07/21/replit_saastr_vibe_coding_incident/
[I02]: https://status.replit.com/history?date=2026-10-03
[I03]: https://status.replit.com
[M01]: https://www.saastr.com/wp-json/wp/v2/posts?slug=replits-new-release-address-most-of-the-challenges-we-hit-vibe-coding-but-is-prosumer-vibe-coding-really-ready-for-commercial-apps-yet&_fields=date,modified,link,title
[M02]: https://www.saastr.com/wp-json/wp/v2/posts?slug=why-ill-likely-spend-8000-on-replit-this-month-alone-and-why-thats-ok&_fields=date,modified,link,title
[M03]: https://www.saastr.com/wp-json/wp/v2/posts?slug=by-late-2025-replit-got-really-good-imagine-if-it-could-run-24x7&_fields=date,modified,link,title
[M04]: https://hn.algolia.com/api/v1/items/46549475
[M05]: https://hn.algolia.com/api/v1/items/49677711
[M06]: https://hn.algolia.com/api/v1/items/46556012

## Reuse boundary

Research extracts public product ideas and observed/documented boundaries. No proprietary implementation copied; no inference that blog snippets, product internals, generated apps, or third-party dependencies carry reusable licenses. Any later dependency adoption needs its own license review. Charlie proposals use existing host capabilities, ordinary Git/database tooling, and native Atlas contracts.
