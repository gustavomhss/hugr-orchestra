# R15 — Community user voice for the backend specialist

Research/status check: **2026-10-03**. Research only; proposed requirements and measurement targets, not implemented or tested behavior.

## Decision

Build trust in **small, inspectable, recoverable progress**. Users want useful software, less repeated explanation, predictable effort, and control when work goes wrong. More autonomous activity alone does not meet those needs.

Twelve pain observations below support six priorities. Ordering reflects severity and recovery leverage, **not frequency or market share**.

| Priority | User need | Evidence |
|---|---|---|
| P1 | Know what actually changed and what actually works | O2; supporting backend-review case |
| P2 | Stop paying for repeated failure and tool side quests | O1, O3, O12 |
| P3 | Resume without rebuilding intent or repeating rejected work | O4, O5 |
| P4 | Keep changes understandable, narrow, and steerable | O6, O9 |
| P5 | Preserve real database/deployment state | O7, O8 |
| P6 | Keep operating behavior legible across model/version changes | O10, O11 |

**The backend specialist fit:** independent Orchestra backend plugin; optional Maestro delegation; native Atlas Knowledge plus task/PR/project Memory; configurable display names; existing host runtime and store. Community members did not request these named components. Mapping their needs onto this product boundary is design inference, not validated demand for an architecture.

## Method and limits

- Purposeful, maximum-variation qualitative sample: novice/idea-to-app builders, practicing backend developers, and technically detailed agent users. Included failures, successful workarounds, mixed experiences, and positive workflows. Experience labels derive from authors' own descriptions; credentials not independently verified.
- Discovery: public GitHub issue search, Cursor/Replit Discourse search, HN Algolia search. Inspected full selected posts/comments and relevant follow-ups, including second pages of Cursor 74345 and Replit 7059. HN item API supplied absolute UTC dates and reply context. GitHub issue/comment GETs supplied current state and closure explanations.
- Twelve numbered observations are analytic units, not twelve statistically independent subjects. O1/O9 share one Replit discussion. Corroborating commenters and positive cases add voices, not prevalence estimates. Replit `allen63` explicitly identifies `lucasagardner` as another account of same person; counted as one voice. Cursor JormuangHP cross-post also one voice.
- **Access gaps:** Reddit search returned HTTP 403; old.reddit.com returned a welcome shell without usable posts. No Reddit evidence admitted. Bolt repository metadata reported `has_issues: false`; scoped searches returned empty, so empty results were not interpreted as absence of complaints. Discord/private support conversations not inspected. No complete coverage of Lovable, Bolt, or Replit's private support outcomes.
- Search positive controls returned known issue/forum/HN records. Direct GitHub retrieval distinguished open issues from an issue labeled `completed` whose final comment actually described inactivity closure. Search snippets alone were not accepted as final evidence.
- English-language, discoverability, complaint/self-selection, recall, and product-community concentration biases remain. Public issue wording can be AI-assisted; O4 explicitly discloses this. No inference that all unattributed prose was human-written unaided.
- Selected reports span **2024-12-02 through 2026-09-23**. Older incidents illustrate failure modes, not current product defect claims. Thread closure, accepted-answer markers, and an author's workaround do not prove a platform-wide fix.
- No independent experiments performed here. Dollars/times are reporter claims unless stated otherwise. No conversion of dollars, posts, upvotes, reactions, or context-window snapshots into token totals, failure rates, or market statistics.

### Evidence language

**Comparatively strong field evidence:** concrete artifacts/checks plus another user's reported attempt. Still not audited laboratory reproduction. **Moderate:** specific firsthand task, environment, outcome, or workaround. **Limited:** subjective/incomplete account without inspectable diagnostic artifacts.

Each observation separates **independent reproduction** from **similar-symptom corroboration**. “Not established” means inspected material does not establish it; it does not assert nobody reproduced it elsewhere. A promise to investigate is not reproduction. Same author's repeat runs are not independent.

## Detailed pain observations

### O1 — Repairs regress working behavior; paid retries become their own task

- **Source/date/person:** [Melchizedek7, Replit, 2025-09-14](https://replit.discourse.group/t/agent-3-experience-feedback/7059/1). App builder improving previously working app.
- **Voice/impact:** reports over US$100 spent trying to restore deployment; agent repeats already-failed fixes. Also values longer work and built-in checking.
- **Status checked:** discussion open. [thomascarreno, 2025-09-22](https://replit.discourse.group/t/agent-3-experience-feedback/7059/23) reports repeated billed attempts on previously working Google Places autocomplete; [same-day follow-up](https://replit.discourse.group/t/agent-3-experience-feedback/7059/25) says that specific problem appears fixed. This does not resolve original deployment case.
- **Strength:** moderate, uncontrolled firsthand accounts. **Independent reproduction:** exact failure not established; similar regression/repair experience corroborated.
- **Priority:** P2.

### O2 — Plausible completion can contradict filesystem reality

- **Source/date/person:** [goat, Cursor, 2025-04-18](https://forum.cursor.com/t/gemini-2-5-constantly-fails-to-apply-changes-and-charges-fully/74345/19). Building Raspberry Pi goat-feeder control app, SSH from Mac, Gemini 2.5 Pro experimental.
- **Voice/impact:** says agent would “confirm” edits while disk content stayed unchanged; supplies request ID and shell output. Same edit reportedly worked after switching to Claude. [Original reporter, 2025-04-02](https://forum.cursor.com/t/gemini-2-5-constantly-fails-to-apply-changes-and-charges-fully/74345/1) also complained of charged requests without edits.
- **Status checked:** [staff, 2025-04-09](https://forum.cursor.com/t/gemini-2-5-constantly-fails-to-apply-changes-and-charges-fully/74345/10) believed most stopping cases resolved; [2025-04-21](https://forum.cursor.com/t/gemini-2-5-constantly-fails-to-apply-changes-and-charges-fully/74345/20) still acknowledged upstream issues. [2025-05-07 user](https://forum.cursor.com/t/gemini-2-5-constantly-fails-to-apply-changes-and-charges-fully/74345/22) still reported failure; [2025-06-06 closure](https://forum.cursor.com/t/gemini-2-5-constantly-fails-to-apply-changes-and-charges-fully/74345/23) was automatic. Partial fix claim, not verified complete resolution.
- **Strength:** comparatively strong field evidence. **Independent reproduction:** separate users report own failed edits; no controlled shared fixture.
- **Priority:** P1.

**Backend-review supporting case:** [hmaxwell, HN, 2025-04-17](https://news.ycombinator.com/item?id=43721175) seeded nonexistent include in own codebase; reports Claude inventing a missing SQL transaction when transaction already existed. Repeated own trials, not independent replication; codebase not supplied in inspected post. No issue/fix status. Supports showing evidence for diagnoses as well as completion; does not establish which model is generally better.

### O3 — Unavailable tool becomes expensive, unsolicited implementation project

- **Source/date/person:** [berkes, HN, 2026-09-21](https://news.ycombinator.com/item?id=49786973), [follow-up 2026-09-22](https://news.ycombinator.com/item?id=49798377). Technical user asking agent to write weekly note into Joplin; their MCP was down.
- **Voice/impact:** reports agent producing over 400 lines across five files and exploring Docker. Claimed job cost US$17 and nearly 30 minutes; usual runs US$0.05 with Mistral or US$0.90 with Claude Opus. Follow-up attributes part of complexity to user's own globally loaded Python skill.
- **Status checked:** discussion, not tracked defect; no vendor fix established. Author identifies missing connector and overbroad skill as contributing context, not proven sole causes.
- **Strength:** moderate; concrete narrative, no auditable bill/transcript. Different usual models confound cost comparison. **Independent reproduction:** not established in inspected replies.
- **Priority:** P2; also P4. Desired response is bounded diagnosis of missing capability, not automatic creation of substitute infrastructure.

### O4 — Compaction can lose governing intent while appearing continuous

- **Source/date/person:** [Nahuel990, Claude Code #96422, 2026-09-23](https://github.com/anthropics/claude-code/issues/96422). Long PR-review sessions on open-source cloud-service emulator; custom instructions plus persistent memory.
- **Voice/impact:** reports instructions not reloaded after compaction, unauthorized writes, and a wrong re-derivation contradicting recorded memory. Sessions described as 6–8 hours; no quantified recovery time. Issue explicitly co-authored with Claude Code.
- **Status checked:** **open** on research date. [2026-09-25 reply](https://github.com/anthropics/claude-code/issues/96422#issuecomment-5825403108) proposes stale-versus-corrected-fact fixture; does not report running it.
- **Strength:** moderate-to-limited: concrete workflow, but claimed transcripts not included in inspected issue. Mechanism remains reporter's diagnosis. **Independent reproduction:** not established; proposed test is not evidence of execution.
- **Priority:** P3. Persistent storage alone does not ensure correct retrieval after a boundary.

### O5 — “Start new chat” transfers recovery labor to novice

- **Source/date/person:** [JormuangHP, Cursor, 2024-12-02](https://forum.cursor.com/t/issue-with-chat-functionality-on-pro-account-request-for-assistance/31760/1). Self-described nontechnical Pro user, Cursor 0.43.5 on Windows.
- **Voice/impact:** existing chats stopped answering; new chat worked, but required reorganizing prior dialogue and project details. No recovery-time measurement.
- **Status checked:** [automatic closure posted 2025-12-21](https://forum.cursor.com/t/issue-with-chat-functionality-on-pro-account-request-for-assistance/31760/2), not fix confirmation. Related thread includes [Cassiopeia, 2024-12-10](https://forum.cursor.com/t/chat-stopped-giving-answers-yesterday/31543/47) and [rj3d, 2024-12-11](https://forum.cursor.com/t/chat-stopped-giving-answers-yesterday/31543/48) reporting downgrade to 0.42.5 restored operation. Not confirmation of original user's recovery or current-version defect.
- **Strength:** moderate historical workflow evidence. **Independent reproduction:** chat-stall symptom independently reported; original state-specific failure and handoff burden not experimentally replicated.
- **Priority:** P3. Preserve task intent across chat failure, model change, and human handoff.

### O6 — Skilled users still abandon overcomplicated output

- **Source/date/person:** [torginus, HN, 2025-11-18](https://news.ycombinator.com/item?id=45968628). Self-described backend developer doing frontend for company feature.
- **Voice/impact:** approximately 20 minutes prompting Sonnet for simple landing-page header; discarded generated CSS and rewrote using roughly three selectors/20 lines. Wants easier translation of intent, not more code. These are author estimates, not inspected diffs.
- **Status checked:** discussion; personal rewrite is reported workaround, no product fix tracked.
- **Strength:** moderate firsthand task specificity; no reproducible code/model snapshot. **Independent reproduction:** not established. Distinct positive case [anthropodie, 2025-03-20](https://news.ycombinator.com/item?id=43424872) favors explicit HTML/CSS/JS over default React because generated output stays readable; not replication of this failure.
- **Priority:** P4. Match existing stack and user's review capacity. This does not support a blanket ban on frameworks or abstractions.

### O7 — Code/versioning mental model fails to cover database identity

- **Source/date/person:** [denton1, Replit, 2025-04-24](https://replit.discourse.group/t/agent-has-been-breaking-my-database-connection/4367/1). Explicit novice building time-billing web app, forking for features while intending to reuse existing database through API.
- **Voice/impact:** agent repeatedly substitutes local database despite API instruction; claims at least US$50 lost builds.
- **Status checked:** discussion open. [2025-04-25](https://replit.discourse.group/t/agent-has-been-breaking-my-database-connection/4367/12) author confirms learning branch/pull workflow. [Peer explanation](https://replit.discourse.group/t/agent-has-been-breaking-my-database-connection/4367/7) distinguishes Git from DB backup. Useful mitigation, not verified agent fix.
- **Strength:** moderate, architecture and failure explicit; diagnosis confounded by fork behavior. **Independent reproduction:** exact API-to-local substitution not established. Later schema-rename complaints are related failures, not same repro.
- **Priority:** P5. Show which DB/environment will be touched and distinguish code rollback from data restoration.

### O8 — Deployment failures can be environment failures, not code defects

- **Source/date/person:** [justyisrael, Replit, 2025-04-30](https://replit.discourse.group/t/live-app-deployment-down-for-weeks-re-dplying-keeps-failing-help/4429/1). Idea-to-app user operating live application; coding experience unspecified.
- **Voice/impact:** weeks and about US$1K invested before repeated deployment failure. Agent edits did not restore availability; support redirected to agent. Investment amount is not repair-only spend.
- **Status checked:** **original author reports resolution on [2026-01-08](https://replit.discourse.group/t/live-app-deployment-down-for-weeks-re-dplying-keeps-failing-help/4429/6)** after selecting higher reserved-VM tier; praises subsequent Agent performance. Exact cause remained uncertain. [Another user, 2026-01-11](https://replit.discourse.group/t/live-app-deployment-down-for-weeks-re-dplying-keeps-failing-help/4429/8), says same workaround failed. Thread open.
- **Strength:** moderate; explicit author follow-up, no logs establishing root cause. **Independent reproduction:** similar deployment symptoms, not same confirmed cause or successful repair.
- **Priority:** P5. Check target environment/resource evidence before more source edits.

### O9 — Stop and scope controls must work when trust already broke

- **Source/date/person:** [allen63, Replit, 2025-09-18](https://replit.discourse.group/t/agent-3-experience-feedback/7059/4). Self-described vibe coder updating landing page.
- **Voice/impact:** reports unrelated removals, roughly US$6/15 minutes, and Stop failing until browser restart enabled rollback.
- **Status checked:** thread open; later mode-toggle discussion does not verify Stop repair. [Post 7](https://replit.discourse.group/t/agent-3-experience-feedback/7059/7) identifies `lucasagardner` as same author.
- **Strength:** limited-to-moderate; specific episode without logs. **Independent reproduction:** Stop failure not independently established; other users corroborate unrelated regressions only.
- **Priority:** P4.

### O10 — Version churn breaks learned workflow and changes willingness to iterate

- **Source/date/person:** [jefftj86, Replit, 2026-04-04](https://replit.discourse.group/t/how-i-went-from-full-agent-dependency-to-self-hosted-infrastructure-and-why-replit-is-still-part-of-the-stack/10919/1). Diamond-marketplace founder who began with zero infrastructure knowledge.
- **Voice/impact:** valued Agent 3, then describes Agent 4 reorganizing working code without request. Combined agent/DB/deployment bills reportedly reached US$1,000–1,400 in some months; avoided improvements because cost was unpredictable. This is mixed infrastructure spend, not model-token spend.
- **Status checked:** personal mitigation initially retained Replit hosting with external development. [2026-06-03 follow-up](https://replit.discourse.group/t/how-i-went-from-full-agent-dependency-to-self-hosted-infrastructure-and-why-replit-is-still-part-of-the-stack/10919/8) says author stopped using Replit. No verified vendor fix; thread open.
- **Strength:** moderate longitudinal account; performance/causal infrastructure claims unverified. **Independent reproduction:** not established. Similar reactions to earlier releases do not replicate Agent 4 behavior.
- **Priority:** P6. Expose behavioral/settings changes and preserve task continuity across tool choices.

### O11 — Model name does not guarantee working tools in chosen harness

- **Source/date/person:** [codyseally, Orchestra #729, 2025-07-06](https://github.com/anomalyco/opencode/issues/729). Ubuntu user running Devstral through Ollama; receives implementation advice instead of file actions.
- **Voice/impact:** basic agent work blocked. [ajunca, 2025-07-08](https://github.com/anomalyco/opencode/issues/729#issuecomment-3050384735) reports attempted tools without file creation. [ahmed-bekhet, 2025-07-10](https://github.com/anomalyco/opencode/issues/729#issuecomment-3059260082) says larger context alone did not fix tool calls; same LLM worked in LM Studio.
- **Status checked:** GitHub **closed**, `state_reason: completed`, **2026-03-25**; [closing comment](https://github.com/anomalyco/opencode/issues/729#issuecomment-4122978758) explicitly says inactivity closure. [abate, 2025-07-21](https://github.com/anomalyco/opencode/issues/729#issuecomment-3095465908) confirms Qwen context workaround; [Digital-Yeti, 2026-01-16](https://github.com/anomalyco/opencode/issues/729#issuecomment-3761345263) reports successful Devstral-small-2 `/init`. Model-specific recoveries, not universal fix.
- **Strength:** comparatively strong field evidence with independent attempts/configuration details. **Independent reproduction:** tool failure reported by distinct users; configurations differ, so common root cause unproven.
- **Priority:** P6.

### O12 — Tool activity and context compaction can masquerade as forward progress

- **Source/date/person:** [mmarras, Cline #12957, 2026-08-05](https://github.com/cline/cline/issues/12957). CLI 3.0.48, Azure `gpt-5.6-luna`, Python integration/refactor task in Act mode.
- **Voice/impact:** “no code is written, just keeps replanning.” Supplied excerpt alternates repeated reads, plans, and compaction. One snapshot is 116.6k → 90.7k context tokens. Those are context sizes, not billable totals. User says minor-version downgrades did not help.
- **Status checked:** **open**. [Contributor permission, 2026-08-06](https://github.com/cline/cline/issues/12957#issuecomment-5199228980) and [prospective investigator reply](https://github.com/cline/cline/issues/12957#issuecomment-5201853500) authorize/announce investigation, not reproduction or fix.
- **Strength:** moderate, concrete but reporter-supplied excerpt. **Independent reproduction:** not established in inspected comments; promotional reply excluded from corroboration.
- **Priority:** P2. Progress should mean changed evidence/state, not volume of tool calls.

## Positive workflows to preserve

### L1 — Plain-language iteration can deliver novice's real outcome

[johnblackmar22, Cursor, 2025-05-06](https://forum.cursor.com/t/an-idiot-s-guide-to-smaller-projects-or-how-i-built-a-site-without-writing-a-single-line-of-code/86689/1): product manager with minimal coding background reports shipping personal website with Cursor/Netlify in roughly eight hours including learning. Loved short prompts, local preview, direct feedback, and delegation of mechanics. Became human QA; family later found iPad scroll defect. Moderate firsthand success evidence with linked site, not independently reproduced here. Guide now closed; no tracked product fix. Preserve speed and understandable feedback, while reducing repeated manual verification burden. Do not infer suitability for production financial backends from a personal-site success.

### L2 — Experts value grunt-work delegation while retaining design ownership

[anthropodie, HN, 2025-03-20](https://news.ycombinator.com/item?id=43424872): backend developer building small personal tools likes Claude doing CSS/JS after explicitly choosing readable plain-web stack. [0x000xca0xfe's reply](https://news.ycombinator.com/item?id=43424972) independently reports a small vanilla-web enhancement without rewrite; similar success, not shared reproduction.

[oldnewthing, HN, 2025-12-31](https://news.ycombinator.com/item?id=46443174): AWS/Azure/GCP backend developer describes brainstorm → specs → implementation → refinement → container → Cloud Run, using agents to realize frontend ideas. Reports actual project URL; no independently audited outcome or defect status.

[jamescook83, HN, 2026-07-01](https://news.ycombinator.com/item?id=48753210): self-described approximately 20-year Ruby/Rails backend developer working with billing, migrations, and financial correctness says, “I stay in charge of the design and I read everything it writes.” Useful explicit experienced-engineer voice; hiring-profile context means self-promotional selection and limited outcome evidence. No reproduction/fix applicable.

### L3 — Backend professionals want time for correctness, not exemption from it

[vishnugupta, HN, 2026-05-16](https://news.ycombinator.com/item?id=48160300): delegates reporting queries/charts to Claude Code; focuses on architecture and useful reports. [Follow-up](https://news.ycombinator.com/item?id=48162464) says they fully understand queries and run EXPLAIN plans. [NateEag's reply](https://news.ycombinator.com/item?id=48161300) reports opposite tradeoff: understanding generated code feels harder/slower than writing it. Moderate firsthand workflow evidence, no timings or controlled replication; discussions carry no tracked fix status. Preserve expert review access and measure comprehension cost, not just generation speed.

## Lean UX/design requirements

Requirements below are **proposed backend specialist design**, not features requested verbatim or proof of existing host APIs. Measurement values are **pilot targets**, not community findings, forecasts, or achieved results. Token/tool allowances describe indicated phase, not entire project. Evaluate useful completion alongside efficiency; cheap failure is not success.

### P1 — Evidence-backed completion

**Requirement:** completion receipt links requested outcome to actual diff/revision and executed checks. Separate `changed`, `checked`, `blocked`, and `not checked`; failed/no-op edit cannot become successful completion through prose. Attach environment and result to each check. Reuse existing host tool results; users can open detail without reading whole transcript.

**Scenario:** novice asks for booking email; agent explains success, but write tool changes nothing or mail check never ran.

**Proposed outcome:** every seeded no-op/skipped-check case remains explicitly unverified; user locates missing evidence within **30 seconds**. Receipt overhead **≤1,000 output tokens**, **≤2 extra verification tool calls** beyond task's necessary tests. Existing check failure stays visible, never reclassified as success.

### P2 — Bounded repair and explicit blockers

**Requirement:** retain attempted hypothesis, failure fingerprint, affected revision, and result in task Memory. Two unchanged failures without new evidence trigger compact blocker summary and pause autonomous retries. Show cumulative elapsed time, input/output/cache-token categories where provider exposes them, tool calls, and actual/estimated cost separately. Missing connector is explicit blocker; replacement infrastructure requires new task intent.

**Scenario:** same failing test repeats, or Joplin connector is down and agent starts constructing a substitute service.

**Proposed outcome:** after repeat-failure trigger, actionable stop/escalation within **2 minutes**, **≤2,000 further tokens**, **≤3 diagnostic tool calls**. User can intentionally continue with new hypothesis. Compare total repair tokens/time and repeated unchanged tool calls against same-host baseline; do not count shortened but unresolved tasks as wins.

### P3 — Inspectable continuity across compaction and handoff

**Requirement:** native task Memory retains goal, accepted constraints, decisions/rejections, last verified revision, evidence links, and next blocker. PR Memory gets review/handoff summary; project Memory gets reusable accepted conventions rather than every transient failure. Retrieve source-grounded material through Atlas Knowledge with freshness/provenance. At resume, reconcile current repository/environment evidence with remembered claims. Show what was loaded and unresolved contradictions.

**Scenario:** builder stops tonight; backend engineer or optional Maestro worker resumes after compaction tomorrow. Earlier decision: use existing API, not replacement DB.

**Proposed outcome:** recipient identifies goal, DB target, rejected approach, and next check within **60 seconds**; resume envelope **≤2,000 retrieved tokens**, **≤3 targeted reads** for pilot fixture. No rejected operation repeated merely because chat changed. Inspectable Memory correction available through same record; stale facts do not silently win.

### P4 — Small changes, real steering, understandable scope

**Requirement:** compact task brief names outcome, scope, constraints, and current route; defaults derive from current project. Small requests skip ceremonial planning. Surface touched files/dependencies and reason for scope expansion. Reuse host interruption/steering; acknowledge effective boundary and distinguish active in-flight action from newly scheduled work. Preserve raw diff for experts and plain-language impact for novices.

**Scenario:** engineer requests pagination fix; agent proposes unrelated framework change. User narrows scope or stops.

**Proposed outcome:** reviewer understands scope within **60 seconds**; scope explanation **≤800 tokens**, **≤2 extra scope-check tool calls**. Pilot fixtures produce no unexplained out-of-scope changes. Pause feedback target **≤2 seconds**; **zero new tool dispatches after host confirms pause**. In-flight operations explicitly reported, not falsely claimed undone.

### P5 — Environment-aware backend and deployment work

**Requirement:** bind evidence to intended DB/API, migration state, and execution/deployment target. Explain code checkpoint versus data restore. Use existing provider/host tooling to inspect logs, connection identity, and relevant resource limits before repeated edits. `Preview works` and `deployed endpoint checked` remain distinct claims. Reference secret locations, not secret values, in Memory.

**Scenario:** fork points at different DB, or deployment tier cannot run built app while preview succeeds.

**Proposed outcome:** classify seeded environment mismatch within **5 minutes**, **≤5,000 tokens**, **≤8 diagnostic tool calls**, without rewriting unrelated app code. Completion includes target-specific smoke/read-back evidence; absent environment access produces named blocker. Git rollback never represented as proof of DB restoration.

### P6 — Stable, visible operating contract

**Requirement:** display actual provider/model, applicable settings/version, tool availability, and execution route. Model/tool failure cannot silently become a different route with different cost. Record changes with task so recovery is explainable. The backend specialist works alone; optional Maestro delegation carries same brief, budget, Memory references, and result format. Configurable display names resolve to stable identities, not separate prompt/store copies.

**Scenario:** saved task resumes under different model; tools unsupported or desired agent behavior changed after upgrade.

**Proposed outcome:** actual route visible before first write; unsupported capability explained within **60 seconds**, **≤1,000 diagnostic tokens**, **≤2 diagnostic tool calls**. Human can continue or change route without retyping task. Compare task outcomes across version changes; showing settings does not make stochastic models deterministic.

## One concrete end-to-end scenario

**People:** novice founder owns appointment-booking app; experienced backend engineer reviews next morning. **Request:** add rescheduling email using existing Postgres-backed API. Keep current auth/data model. The backend specialist runs as Orchestra plugin; Maestro initially unused.

1. The backend specialist turns request into short editable brief and testable outcome. Atlas Knowledge retrieves existing handler/API contract. Task Memory holds accepted “reuse current API” decision and environment reference.
2. The backend specialist makes small patch. Existing notification connector fails. After bounded diagnosis, task reports connector blocker, current diff, elapsed time, exposed token usage, and tool calls. It does not create alternate notification service.
3. Founder steers toward existing provider integration, then stops for evening. Host pause status distinguishes any in-flight operation. Task record points to last verified revision and still-unverified deployed behavior.
4. Engineer resumes from same Memory, sees failed attempt and explicit DB target, and checks current code/environment before acting. Optional Maestro delegation, if requested, receives references to same native records.
5. Engineer/agent runs narrow auth/data-path test and staging smoke check. Receipt states exactly what passed and where. PR Memory carries review evidence and remaining production uncertainty.

**Proposed pilot:** use matched fixtures/provider/settings for base Orchestra versus the backend specialist; include no-op edit, dead connector, stale Memory, wrong DB target, and resource-limited deployment. Include novice interpretation and expert review tasks. Budget each end-to-end trial at **30 minutes / 30,000 metered model tokens / 40 tool calls**; at boundary return useful blocker, not false success. Any in-flight budget overshoot remains visible. Report each case, including failures and censored runs.

**Outcome hypothesis:** resume orientation ≤60 seconds, no false completion in seeded failure cases, and ≥25% reduction in duplicate reads/retries without reducing correctly completed tasks. Record wall time, human correction time, input/output/cache tokens separately, tool calls by purpose, and billing where available. Tokens missing from provider telemetry remain `unknown`; never estimated from dollar spend. These targets need validation; research supplies no baseline proving them achievable.

## Keep implementation lean

Use three small views over one native task record: **brief**, **live progress/steering strip**, **finish/resume receipt**. Same evidence supports novice explanation and expert detail. Atlas Knowledge supplies source retrieval; task/PR/project Memory supplies scoped decisions and evidence references. Existing Orchestra runtime executes and accounts for work; Maestro is optional routing/delegation. Names are configurable labels over stable identity.

This proposal does not require a second runner/store, new project-management suite, autonomous agent swarm, bespoke deployment platform, or universal rollback engine. Host capability gaps must remain named design dependencies. First validate whether these views reduce repair/handoff labor; add separate features only for demonstrated unmet need.

## Interpretation cautions

- Strongest conclusion is existence and shape of user problems, not their prevalence or current incidence.
- Closed issue ≠ fixed issue: Orchestra #729 and Cursor threads demonstrate this directly. Original-user recovery ≠ universal repair: Replit deployment thread demonstrates that distinction.
- A user can love one workflow and reject another in same product. Replit release reports even disagree across people and time; do not turn them into a universal product ranking.
- Backend experts need semantic correctness and reviewable diffs; novices need understandable outcomes and recovery. Shared evidence model can serve both without separate feature-heavy products.
- Follow-up interviews should test whether users understand receipt states and DB/code recovery distinction, and whether compact Memory saves explanation time. Public posts cannot establish willingness to pay, adoption likelihood, or the backend specialist's actual efficiency.
