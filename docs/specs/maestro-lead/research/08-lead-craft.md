# E4 - Lead craft: tech lead, engineering manager, delivery lead, translated into operating rules for Maestro

Date: 2026-10-28. Revision 2 (second pass). Status: research input, not a spec.

## Scope

Question: what does the human tech lead / engineering manager / delivery lead know that transfers to an AI conductor (Maestro) leading AI workers (archie, jimmy, backend and other executors, reviewers, meeting copilot)?

In scope: delegation doctrine (task-relevant maturity, mission command, briefback), tech-lead role, flow and WIP (Kanban, flow metrics, Little's Law), scoping and betting (Shape Up), decision rights and records (DACI, ADR), escalation and stop-the-line, status and blockers, integration discipline (trunk-based, small batches, review, visual management).

Out of scope: career ladders, performance reviews, compensation. Maestro has no reports in that sense; the "people" it manages are seat briefs and return packets.

Verification legend, applied to every item:
- [F] page fetched in this study and the cited claim checked against the fetched text.
- [F-SEC] fetched secondary summary (reputable review or reference page), not the primary book or doctrine.
- [SS] found in search results only; the claim is from a snippet, not a fetched page.
- [UNV] no source could be fetched; the item is a proposal or an unverified recollection and must not be quoted as established.

Limits of this pass: the primary texts for Grove, Fournier and Larson's Migrations post were not reachable. ADP 6-0 could not be read in full (DNS failure on armypubs, empty response from the FAS mirror). Several DORA capability pages returned 404. Those gaps are labeled where they bite.

Key translation constraint: Maestro does not plan or research itself. Its lead duties are intake, triage, routing, briefing, tracking, unblocking, deciding within authority, escalating, integrating and reporting. Where a human manager would coach, Maestro rewrites the brief or changes the seat.

Where AI workers differ from human reports (applies to every row):
- No memory across tasks unless written to a durable store. Maturity and lessons do not accrue on their own.
- Cannot be interrupted for an agenda item, and cannot ask a clarifying question unless the harness provides a channel. Ambiguity must be resolved in the brief or at pre-declared checkpoints.
- Parallelism is cheap in tokens; coordination (merge, review, shared context) is not.
- Self-reports are confident and can be wrong. "Done" is a claim until an independent gate verifies it.
- Same-model reviewers share blind spots with the author.

## Concepts

Columns: concept | rule | evidence (with status) | AI-lead translation | where it breaks for AI workers.

| # | Concept | Rule | Evidence | AI-lead translation | Where it breaks |
|---|---|---|---|---|---|
| 1 | Managerial output and leverage (Grove, High Output Management) | A manager's output is the output of the group they influence, not their own individual work. Spend effort where one act changes many outputs. | Output = group result: [F-SEC] https://ybrikman.com/blog/2016/09/01/high-output-management/ . Leverage: the reviewer quotes the book calling training "one of the highest-leverage activities a manager can perform" [F-SEC], same URL. | Maestro's leverage points are the brief (intent, constraints), the routing decision and the integration gate. Maestro writes no code; a seat's output is Maestro's output only if Maestro's brief caused it. | Cheap AI execution makes "I'll do it myself" tempting. Enforce the no-execution rule through tool permissions, not intention. |
| 2 | Task-relevant maturity (Grove) | Match directive level to the subordinate's readiness on this specific task. Low readiness: detailed direction. Medium: shared structure. High: minimal structure. Loosen as demonstrated competence grows. | [F-SEC] same ybrikman page (new hires need close direction, then goal-setting as they mature). Three-level framing: [SS] https://shortform.com/summary/high-output-management-summary-andrew-s-grove . A multiplicative formula for TRM circulated on pulserevops.com is [UNV] (not confirmed in other sources). | Each seat gets a directive level per brief: "exact steps" (new seat or unfamiliar area), "goal and constraints" (ledger shows passed gates in this area), "decide and report" (routine and reversible only). A new spawn never starts above "goal and constraints". | Maturity does not accrue inside an AI seat across spawns. The ledger is the only memory. With no ledger entry, default to maximum directiveness. |
| 3 | Information flow in one-on-ones (Grove) | The meeting surfaces what the lead does not know; the report sets much of the agenda. | [F-SEC] ybrikman page notes the one-on-one as a known practice; the agenda-owner point is [SS] only. | Replace the 1:1 with a fixed return schema: (a) result against acceptance, (b) assumptions made, (c) what was not checked, (d) what the seat needs from Maestro. Maestro reads (b) and (c) before (a). A return without (b) and (c) is rejected as incomplete. | An AI cannot be interrupted for an agenda item. Assumptions surface only at return time, so long tasks need pre-declared checkpoints that force an assumptions report mid-run. |
| 4 | Leading indicators paired with counter-indicators (Grove) | Track leading indicators that predict trouble; pair each with a counter-indicator so one number does not drive overreaction. | [F-SEC] ybrikman page: indicator paired with a counter-indicator, example of inventory alongside shortages. | Leading: gate failures per seat per week; briefs returned with unchecked assumptions; scope changes after dispatch; age of the oldest active brief. Counter-indicators: throughput; items accepted without rework. Report both. | Indicators need a machine-readable record. Confident wrong reports under-report failures, so gate-failure rate is a lower bound. |
| 5 | Tech lead role (Larson, "Staff Engineer" archetypes) | The Team Lead guides the approach and execution of one team, scopes complex tasks, removes blockers, holds team context, and delegates the complex builds rather than building them. Impact grows as personal coding time shrinks. | [F] https://lethain.com/staff-engineer-archetypes/ . | Maestro is the tech lead for the cross-seat plan: it requires a design artifact before an epic dispatches (archie's plan), checks design coherence at integration, and does not write the code. | The AI tech lead has no organizational context and must be fed owner priorities and history. Designs go stale when the repo moves; re-check the design before each epic's dispatch. |
| 6 | Work selection (Larson, "Work on what matters") | Avoid snacking (easy low-impact work), avoid preening (visible but low-value work), don't chase ghosts (understand the situation before changing strategy), finish projects by rescoping them into finishable pieces, do what only you can do. | [F] https://lethain.com/work-on-what-matters/ . | Maestro tracks the split of seat time between high- and low-impact briefs, and rescopes stalled epics into finishable pieces rather than adding seats. Brief value is stated in PURPOSE; a brief with no owner-goal link is not dispatched. | Maestro can misread the owner's goal without a second source; the "don't chase ghosts" rule requires checking the current repo and owner intent before any strategy change. |
| 7 | Engineering strategy (Larson, after Rumelt) | A strategy = diagnosis, guiding policy, coherent actions. Strategies fail when the diagnosis is lazy or inaccurate. | Diagnosis: [SS] https://lethain.com/diagnosis-for-strategy/ . Guiding policies "applicable, enforced, create leverage": [SS] https://lethain.com/eng-strategies/ . Book: [SS] https://www.oreilly.com/library/view/crafting-engineering-strategy/9798341645516 . Full posts "Migrations" and the strategy-writing post were not fetched: [UNV]. | Each epic brief cites a one-paragraph diagnosis and the guiding policy it applies. Guiding policies are checkable rules (for example "no seat merges without a cold reviewer"). | Diagnosis is the step most likely to be done by the AI from its own inference. Require the owner's source (request text, ADR, ledger) for each diagnosis claim. |
| 8 | Mission command, commander's intent (US Army ADP 6-0) | Give purpose, end state and constraints; leave the means to the subordinate. Plans break on contact; intent survives. | ADP 6-0 (2019 edition) defines mission command as the exercise of authority by mission orders enabling disciplined initiative within commander's intent: [SS] https://irp.fas.org/doddir/army/adp6_0.pdf and secondary flashcard text. The PDF body could not be read (FAS mirror returned empty; armypubs DNS failed). Six principles include "clear commander's intent" and "disciplined initiative": [SS] Rallypoint reproduction of doctrine. Exact paragraph wording: [UNV]. | Every brief has four fixed fields: PURPOSE, END STATE (observable, with an oracle), CONSTRAINTS (what must not change), FALLBACK (stop and return, or proceed within intent). No PURPOSE, no dispatch. | Literal seats follow broken plans; improvising seats exceed constraints. FALLBACK must name the exact escalation trigger, otherwise the seat halts for everything or improvises across constraints. |
| 9 | Mission orders: what and why, not how | Tell the subordinate what to do and why, not how. | [SS] CGSC student-paper summary in search results; primary text [UNV]. | Brief states the what and the why in full sentences; the seat chooses the how within CONSTRAINTS. Maestro does not dictate file edit steps unless the directive level is "exact steps". | Same as row 8: an AI with no how will improvise; check its plan against constraints at briefback. |
| 10 | Briefback | Subordinate restates intent and task before acting; the lead corrects it before execution. Briefback alone can miss execution problems; pair it with a rehearsal or a dry run. | [SS] FM 6-71 appendix text: subordinates repeat what they are to do and why, typically after the order: https://www.globalsecurity.org/military/library/policy/army/fm/6-71/Appg.htm . [SS] CALL warns that briefbacks used as the only rehearsal miss execution problems: https://www.globalsecurity.org/military/library/report/call/call_91-1_sec3.htm . | First output of each seat is a BRIEFBACK block: intent restated, end state restated, first three actions, one named risk. Maestro checks it against the brief with a fixed checklist and allows writes only after a pass. For high-risk briefs, add a dry run (plan-only pass, no writes). | AI briefbacks echo the brief without understanding. Reject paraphrase-only briefbacks; require a concrete first action and a named risk. |
| 11 | Levels of delegation (Tannenbaum and Schmidt, HBR 1958) | Decision authority is a continuum from boss-centred to subordinate-centred. Choose the point per decision, not per person. | Origin: HBR 1958, "How to Choose a Leadership Pattern". Continuum and seven styles: [SS] https://prime.mindtools.com/pages/article/newLDR_42.htm . Revised in 1973 with environmental forces: [SS] (secondary). Original article text: [UNV]. | Maestro keeps a decision-rights table per decision class, not per seat: route to an existing seat (decide and report); change a contract or public API (consult owner); irreversible effect (ask owner, no delegation). Each class has a one-line test. | Ordinal tiers are only as good as class boundaries. Ambiguous classes are where AI workers stall or overreach. |
| 12 | Situational leadership (Hersey and Blanchard) | No one style fits all situations; match style to readiness. | [F-SEC] https://en.wikipedia.org/wiki/Situational_leadership_theory : four styles (Telling, Selling, Participating, Delegating); evidence "mixed"; several studies do not support all prescriptions. | Use the directive-level idea (row 2) as a heuristic, not as a proven model. Do not claim empirical support for the four-style mapping. | The style-to-readiness mapping has weak evidence; an AI lead that treats it as law will over-fit to labels. |
| 13 | DACI decision rights (Atlassian) | One Driver, exactly one Approver, Contributors have a voice but no vote, Informed are told after. | [F] https://www.atlassian.com/team-playbook/plays/daci : "Approver: Only one person holds this role." Atlassian's "25% higher success" survey claim could not be verified: dropped. | Every decision in the log has one Approver: Maestro (within its table) or the owner. Seats are Contributors or Informed, never Approvers. A decision with two approvers is rejected at log time. | The owner is the only human approver. A seat's output that "decided" something must be re-recorded with Maestro or the owner as approver. |
| 14 | Architecture decision records (Nygard; adr.github.io) | A decision record has title, status, context, decision, consequences. Superseded decisions stay in the log and point to the replacement. | [F] https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions : five parts; decision written as "We will ..."; a later ADR marks the earlier one superseded, the old one is kept. [F] https://adr.github.io/ : an ADR captures a single decision and its rationale; the collection forms the decision log. Its page does not list status values; the Nygard post is the source for status. | Decisions go into the repo's decision log. Each brief cites ADR IDs it relies on and repeats the constraint sentence in the brief itself. Maestro never deletes a superseded ADR. | Agents do not read a log unless pointed to it. A link alone is not enough; the constraint sentence must be in the brief. |
| 15 | Flow metrics and aging WIP (Vacanti) | Track WIP, throughput, work item age, cycle time as flow metrics. Use percentiles from history for forecasts and aging. | [F] Kanban Guide lists four mandatory flow metrics: WIP, Throughput, Work Item Age, Cycle Time: https://www.kanbanguides.org/english/ . Vacanti's book: [F-SEC] https://www.thoughtworks.com/en-gb/insights/blog/book-review-actionable-agile-metrics-predictability (cycle time, throughput, WIP; Little's Law conditions). Percentile forecasting: [SS] https://www.scrum.org/node/29342 and a Vacanti slide deck. The "85th percentile of completed briefs as the alarm" is an [UNV] design choice derived from this, not a sourced threshold. | Ledger row per brief: dispatch time, seat, state, last event. Alarm rule: age beyond the 85th percentile of completed briefs in the same class, once at least 20 completions exist; before that, a labeled default. | No cross-session history unless the ledger is durable. Early percentiles are noise; label the default. |
| 16 | Little's Law | Average WIP = throughput x average cycle time (L = lambda W) in a stable, stationary system with finite capacity accounted for. Adding WIP beyond the bottleneck does not raise throughput. | [F] https://en.wikipedia.org/wiki/Little%27s_law : L = lambda W; holds for long-term averages in a stationary system regardless of distributions; unstable systems grow without bound; with finite capacity the effective arrival rate can be lower. Original: Little 1961, cited from that page. | WIP limit per seat (default one active brief) and a global limit set by integration and review capacity. When the integration queue exceeds a set length, Maestro stops dispatching. | Seat count is not the bottleneck; integration and review are. Setting WIP by seat count grows an unreviewed queue. The law is a steady-state result; short runs violate the assumption. |
| 17 | WIP control in Kanban | Explicitly control the number of work items from started to finished; define how WIP is controlled as part of the workflow definition. | [F] https://www.kanbanguides.org/english/ : "must explicitly control the number of work items in a workflow"; the guide does not prescribe a limit. [F] DORA "Work in process limits" page returned 404: [UNV] for DORA's WIP claims. | Each workflow stage in the board has a WIP limit. Maestro sets the number; the guide does not, so the number is a labeled design choice. | Without a sourced number, the limit becomes arbitrary. Revisit it with the flow metrics (row 15). |
| 18 | Pull, not push | Work is pulled by available capacity at the constraint. | [F] Kanban Guide "Actively Managing Items in a Workflow" (section title only, via the guide's index): https://www.kanbanguides.org/english/ . Pull-signal practice: [SS] ProKanban pocket guide chapter 3. | Seats pull from a ready queue when they return a brief; Maestro dispatches only to a seat with no open brief and under WIP. | Maestro assigns briefs, so pull is partly a fiction. Keep the ready queue as the source and dispatch on seat return to avoid push-when-unsure. |
| 19 | Appetite, betting, circuit breaker, scope hammering (Shape Up) | Set a time budget before scoping (appetite), not an estimate. Cut scope to fit (scope hammering). Bet once per cycle, no further approval step. If unshipped at the end, no extension by default (circuit breaker). | [F] https://basecamp.com/shapeup/2.2-chapter-08 : appetite is "the amount of time we want to spend ... as opposed to an estimate"; betting table output has "no further approval step"; projects "don't get an extension by default"; scope hammering "forcefully questioning" to cut scope and finish inside the time box. | Each brief carries an APPETITE expressed as a harness-enforced budget (turns, tokens, wall time). Maestro scope-hammers the brief before dispatch and records what was cut. Circuit breaker: on exhaustion, the seat returns partial state; Maestro does not grant more without an owner decision. | AI time estimates are unreliable, so appetite must be a measurable budget. The betting table is human; for Maestro the bet is the owner's approval of the cycle plan. |
| 20 | Hill charts (Shape Up) | Show work on a hill: uphill = unknowns remain (still discovering); downhill = unknowns solved, execution only. | [F] https://basecamp.com/shapeup/3.5-chapter-13 : "Uphill work still has open questions or unsolved problems. Downhill work has solved all its unknowns". Chapter 14 treats an extension as possible only when remaining work is all downhill. | Seat reports position per brief. A brief still uphill at its checkpoint triggers re-shaping, not more execution. | A seat tends to report downhill once it writes code, even when the approach is wrong. Check position against the gate result, not the seat's claim. |
| 21 | Definition of ready and definition of done | A brief is ready when its inputs are present and checkable. Done means each acceptance item has evidence, not an assertion. | DoD as a Scrum artifact: Scrum Guide (2020) [UNV, not fetched this pass]. DoR as an extension: practitioner convention [UNV]. | DoR for a brief: PURPOSE, END STATE with an oracle, CONSTRAINTS, FALLBACK, APPETITE, ADR IDs, file scope, directive level, briefback required. DoD for a seat's output: each acceptance item linked to evidence. Maestro rejects "done" without evidence links. | An AI can fake evidence with trivially passing self-written tests. DoD must require a gate run by a process other than the author (row 25). |
| 22 | Pre-mortem | Before executing a plan, imagine it has failed and list the reasons it failed, to raise the success rate of the plan. | [F] https://www.gary-klein.com/premortem : steps (team briefed on plan; leader asks everyone to imagine failure; each member contributes threats and obstacles); purpose "increase plan success rate"; developed by Klein, 2007, per that page. | Before dispatching an epic, Maestro runs a pre-mortem: each seat (or a cold reviewer) returns a list of ways the brief fails. Each failure gets either a CONSTRAINT or a FALLBACK entry in the brief. A pre-mortem with no entries is rejected (an empty list is a suspect answer, not a pass). | A pre-mortem by the same model tends to produce generic risks. Require each risk to name a file, interface or gate. Klein's efficacy claim rests on his own account: treat as practice, not measured result. |
| 23 | OODA loop (Boyd) | Observe, orient, decide, act, repeated; move through the cycle faster or better than the opponent. | [F] https://en.wikipedia.org/wiki/OODA_loop : four steps; Boyd early 1970s, military origin. Caveat (Hankins, quoted there): vague enough to read into it what one likes; "not incorrect, but neither is it unique or especially profound". | Use OODA only as a checklist for incident handling: each return is observed (gate result), oriented (against intent), decided (within decision rights), acted (next brief or escalation). It is not a speed target. | Speed is not the constraint for Maestro; wrong orientation is. Do not reward tempo over checked decisions. |
| 24 | Stop-the-line and andon | Any worker can signal a problem; for serious problems, the line stops until fixed. The first signal asks for help without stopping; a second pull authorizes restart. Alerts are logged for continuous improvement. | [F] https://en.wikipedia.org/wiki/Andon_(manufacturing) : two-step pull at Toyota; line stops if unresolved; logs support improvement. | Each seat has a stop signal: any gate failure, any constraint violation, or any out-of-scope discovery halts that brief and returns an andon entry. Maestro restarts only after the fix and a second gate. A logged andon entry is required for every stop. | AI seats may continue past a problem to finish the brief. The stop must be a harness-level behavior (return on constraint hit), not only an instruction. |
| 25 | Trunk-based development and small batches (DORA) | Keep active branches few (analysis of 2016 and 2017 data: "three or fewer active branches" among higher-performing teams); merge small batches to trunk at least daily; avoid freezes and integration phases. | [F] https://dora.dev/capabilities/trunk-based-development/ (finding and claims as stated; DORA says the finding is from its data, not a causal proof). [F] https://dora.dev/capabilities/working-in-small-batches/ : small batches as prerequisite; "a batch is not complete until it is deployed and feedback has begun"; "any batch taking more than a week to complete and check is considered too big"; AI tools tend to produce oversized pull requests that are hard to review. | Cap open seat branches (e.g. three per product area). Cap brief size by diff size and file count; split before dispatch. Integrate each green seat result immediately, under a change-scoped gate. | AI generates large diffs quickly, so batch size inflates by default. The cap must be a gate, not an intent. |
| 26 | Review independence and synchronous review (DORA) | Heavyweight or asynchronous review is an obstacle to trunk-based flow; synchronous review and automated tests are improvements. | [F] https://dora.dev/capabilities/trunk-based-development/ lists "heavyweight or asynchronous code review" as an obstacle. DORA "code review speed" page returned 404: [UNV] for any DORA claim specific to review speed. Independence of the reviewer: [UNV] as a DORA claim; practitioner rationale only. | Reviewer seat gets a cold brief (no author transcript), the diff, the acceptance items, and a mutation-probe request for test-bearing changes. Reviewer is not the author's seat, and for high-risk changes preferably not the same model family. Maestro verifies that the review is not a self-report. | Same-model reviewers share errors; cold context reduces this but does not remove it. Mutation probes are the stronger check. |
| 27 | Visual management (DORA) | Shared displays of key process information, used daily; keep them current; a green display is not the goal. | [F] https://dora.dev/capabilities/visual-management/ : examples include Kanban boards, CI status, cumulative flow charts; warns against metrics chosen without team input, overly complex displays, stale displays, and treating green as the goal. Evidence cited: one reference to the 2015 State of DevOps report, no effect sizes. | The board is Maestro's visual management: seats, WIP, ages, gates, blockers. Maestro reviews it at each wake, and does not report a green board as success. | An AI does not look at a display unless its loop reads it. Make the board a file read at each wake, not a render. |
| 28 | Swarming versus specializing | Swarm (several people on one blocked item) when work stalls at a bottleneck, instead of starting new work at the start of each specialty queue. | [SS] https://businessmap.io/blog/agile-swarming : swarming on blocked items; origin linked to Toyota andon. [SS] https://innolution.com/blog/swarm-to-the-fewest-viable-items : role-based teams start new work when their role is done. [SS] Kanban pocket guide lists swarming with pairing and mobbing as ways to act on long-running items. No controlled comparison found: [UNV] on the trade-off. | When a brief ages beyond its alarm (row 15), Maestro may assign a second seat (for example a reviewer or archie for a design question) to the same item, within WIP. Do not start a new brief while a swarm is open. | Parallel seats on one item multiply context cost and conflicts; use the conflict map first. |
| 29 | Working agreements (team norms) | Team-set, observable norms for meetings, feedback, escalation, decisions; revised in retrospectives and when a rule breaks. A rule consistently broken is checked for realism. | [SS] https://plane.so/blog/what-are-team-working-agreements-definition-structure-examples ; [SS] GSA guide https://tech.gsa.gov/guides/agile_team_working_agreement (review on membership change or broken rule); [SS] Microsoft playbook https://microsoft.github.io/code-with-engineering-playbook/agile-development/team-agreements/working-agreement/ . | A seat-level and cross-seat working agreement file: escalation triggers (row 30), return schema (row 3), stop signal (row 24), and the review rule. Revised after each epic's retrospective; a rule broken twice is checked for realism. | Agreements are text; AI seats follow them only if they are in the brief. Put the agreement content into each brief, not just a repo file. |
| 30 | Escalation triggers and interrupt budget (proposal) | Escalate on pre-agreed observable triggers; limit how often the owner is interrupted. | Escalation ladder as practice: incident-command style (no fetched source this pass): [UNV]. Interrupt budget: no source found: [UNV], this row is a proposal. | Triggers for escalation to the owner: irreversible action needed; two gate failures on the same brief; contract conflict between seats; appetite exhausted (row 19); owner intent conflicts with brief; action outside the decision-rights table (row 13). Interrupt budget proposal: at most one owner message per epic per decision, with a count per week reported. Triggers are checked at each return. | Confident wrong reports mean a seat may not know it failed; use the gate result as the trigger input, not the seat's self-assessment. Over-escalation is also a failure; add "do not escalate" examples. |
| 31 | Disagree and commit | Challenge a decision you disagree with, then fully commit once it is made. | [SS] https://en.wikipedia.org/wiki/Disagree_and_commit : Amazon principle "Have Backbone; Disagree and Commit", as reproduced there. Amazon's own page returned 403; wording is from a third-party reproduction: [F-SEC] at best. | A seat that disagrees with a brief states the disagreement once in its briefback (risk field), then executes the brief as written; Maestro records the disagreement in the decision log. A reversal of the decision requires a new decision entry, not a silent change of approach. | An AI seat may silently change approach to satisfy its own view; the "commit" half must be a harness rule (no scope change without a new brief version). |
| 32 | Working agreement for cross-seat contracts (stop-the-line) | Contracts between seats are frozen before dependent work starts. | Covered by the techlead-contract practice in this repo; not a web source. | Contract freeze is a stop-the-line point: a seat that finds the contract wrong stops and returns. | Covered in other research notes. |

Concepts from pass 1 that were not re-sourced here, and are now marked: DORA "code review speed" (row 26: [UNV]); Atlassian DACI "25%" claim (dropped); Larson "Migrations" (not fetched); Google re:Work delegation guidance (not found; psychological safety from secondary summaries only: [SS] https://www.michigan.gov/documents/mdhhs/Google-and-Psychological-Safety_684425_7.pdf , not used in a row).

## Lead duties catalog

Each duty: rule, checkable test, artifact. Rule numbers refer to the concepts table.

### Intake
- Rule: every owner request becomes one ledger row before any seat is touched (rows 15, 29).
- Check: row has id, owner request text, timestamp, triage state.
- Artifact: intake ledger row.

### Triage
- Rule: classify on reversibility, owner-decision-needed, size against appetite (row 19), dependencies. Outcomes: route, clarify with owner, split, reject with reason. "Clarify" is used when the owner's intent is ambiguous (rows 5, 8).
- Check: all four fields set; a guessed route without "clarify" is rejected.
- Artifact: triage fields on the row.

### Routing
- Rule: route to the seat whose declared scope contains the files or domain; route to two seats only on disjoint files from the conflict map (row 28). Never to a seat with an open brief (row 18). WIP limits apply (row 16).
- Check: conflict map check passes; seat has no open brief; WIP not exceeded.
- Artifact: dispatch record.

### Briefing
- Rule: every brief has PURPOSE, END STATE with oracle, CONSTRAINTS, FALLBACK (row 8); APPETITE (row 19); ADR IDs and constraint sentence (row 14); directive level (row 2); DoR (row 21); pre-mortem entries (row 22); size cap (row 25). Briefback required as first seat output (row 10).
- Check: all fields present; briefback passes checklist before writes.
- Artifact: brief file, versioned; a changed brief gets a new version.

### Tracking
- Rule: track state, age, last event per brief; compare age to the alarm (row 15); count leading indicators with counter-indicators (row 4); read the board at each wake (row 27).
- Check: every active brief has a last-event timestamp within its checkpoint interval.
- Artifact: board and ledger, machine-readable.

### Unblocking
- Rule: a blocker is an entry with owner, next action, unblock-by timestamp. Maestro resolves within decision rights; otherwise escalates by trigger (row 30). A stop-the-line entry (row 24) follows the same path.
- Check: no blocker past unblock-by without action or escalation.
- Artifact: blocker and andon entries.

### Deciding
- Rule: decisions inside the table are recorded with exactly one approver (row 13), rationale, and ADR reference if significant (row 14). Outside the table goes to the owner.
- Check: each entry has one approver; a decision outside the table is marked escalated.
- Artifact: decision log.

### Escalating
- Rule: escalate on triggers (row 30), at return time, with one question, options, a recommendation, and what is paused. Do not escalate raw status.
- Check: message has all four elements; interrupt budget not exceeded.
- Artifact: escalation message.

### Integrating
- Rule: integrate each green seat result immediately under a change-scoped gate (row 25). Cold independent review (row 26). Mutation probe for test-bearing changes. Never merge on a self-report.
- Check: review record from a different seat; gate evidence attached; diff under cap; design coherence checked against the epic design (row 5).
- Artifact: integration record.

### Reporting
- Rule: owner reports are a dated list of changes since last report, open decisions with a single ask each, blockers with owners and dates, and indicator pairs (row 4). No colored summaries. Report when ready to approve or when a decision is needed (row 30).
- Check: since-last-report delta present; no RAG-only status.
- Artifact: report entry.

## Anti-patterns

1. Hero lead: Maestro writes or patches code because it is fast (rows 1, 5). Test: any Edit or Write by Maestro outside its own docs and ledger.
2. Unbounded fan-out: spawning seats faster than integration absorbs (rows 16, 17). Test: integration queue above the set length while new dispatches continue.
3. Confident-wrong acceptance: taking "done" or "tests pass" without evidence or an independent gate (rows 21, 26). Test: any DoD item with no evidence link.
4. Same-context review: reviewer gets the author's transcript (row 26). Test: reviewer brief contains author reasoning.
5. Status theater: RAG summaries, per-seat status walls, undated reports (rows 4, 27). Test: report lacks a since-last-report delta.
6. Scope drift after dispatch: brief changed mid-run without a new version (rows 8, 31). Test: brief version changed while a seat was active and not recorded.
7. Silent extension: an overrun brief keeps running past appetite without an owner decision (row 19). Test: active brief age over appetite with no decision entry.
8. Escalation by default or never (row 30). Test: escalations per decision class against the triggers; a second gate failure without escalation.
9. Batch inflation: large multi-file briefs because "the seat can handle it" (row 25). Test: brief over the cap at dispatch.
10. Two approvers, or a seat recorded as approver (row 13).
11. Over-briefing: a wall of text burying intent. Test: PURPOSE not within the first three lines; long brief without a summary block.
12. Stale board: last-event timestamp older than the checkpoint interval (rows 15, 27).
13. Owner-scope creep: a decision outside the table (row 11).
14. Mid-task micromanagement: status interrupts that break flow and add tokens. Use declared checkpoints instead (row 3).
15. Silent approach change: a seat that disagrees and changes approach without saying so (row 31).
16. Green-board reporting: treating a passing dashboard as success (row 27).
17. Stop-skipping: a seat finishes past a constraint hit instead of returning an andon entry (row 24).

## Sources

Fetched and checked in this study ([F]; reputable secondary summaries labeled [F-SEC]):
1. https://basecamp.com/shapeup/2.2-chapter-08 [F]
2. https://basecamp.com/shapeup/3.5-chapter-13 [F]
3. https://www.atlassian.com/team-playbook/plays/daci [F]
4. https://www.atlassian.com/work-management/decision-making-framework [F]
5. https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions [F] (Nygard)
6. https://adr.github.io/ [F]
7. https://lethain.com/staff-engineer-archetypes/ [F]
8. https://lethain.com/work-on-what-matters/ [F]
9. https://dora.dev/capabilities/trunk-based-development/ [F]
10. https://dora.dev/capabilities/working-in-small-batches/ [F]
11. https://dora.dev/capabilities/visual-management/ [F]
12. https://dora.dev/capabilities/ [F] (index: confirms capability names)
13. https://www.kanbanguides.org/english/ [F] (Kanban Guide: flow metrics, WIP control)
14. https://kanbanguides.org/ [F] (landing page only)
15. https://en.wikipedia.org/wiki/Little%27s_law [F] (secondary reference page)
16. https://www.thoughtworks.com/en-gb/insights/blog/book-review-actionable-agile-metrics-predictability [F-SEC] (review of Vacanti)
17. https://ybrikman.com/blog/2016/09/01/high-output-management/ [F-SEC] (review of Grove)
18. https://en.wikipedia.org/wiki/Situational_leadership_theory [F-SEC]
19. https://www.gary-klein.com/premortem [F]
20. https://en.wikipedia.org/wiki/OODA_loop [F-SEC]
21. https://en.wikipedia.org/wiki/Andon_(manufacturing) [F-SEC]
22. https://www.prokanban.org/blog [F] (no relevant post content; not cited for claims)

Search results only ([SS]; claims are from snippets):
- https://shortform.com/summary/high-output-management-summary-andrew-s-grove (Grove TRM three levels)
- https://irp.fas.org/doddir/army/adp6_0.pdf (ADP 6-0 identified; body returned empty)
- https://www.globalsecurity.org/military/library/policy/army/fm/6-71/Appg.htm (FM 6-71 backbrief)
- https://www.globalsecurity.org/military/library/report/call/call_91-1_sec3.htm (CALL on backbrief limits)
- https://chiefexecutive.net/i-dont-know-what-ive-said-until-you-tell-me-what-youve-heard/ (backbrief and intent)
- https://prime.mindtools.com/pages/article/newLDR_42.htm (Tannenbaum-Schmidt secondary)
- https://www.oreilly.com/library/view/crafting-engineering-strategy/9798341645516 (Larson book listing)
- https://lethain.com/diagnosis-for-strategy/ ; https://lethain.com/eng-strategies/ ; https://lethain.com/engineering-strategy-writing-process
- https://www.scrum.org/node/29342 (percentile forecasting)
- https://en.wikipedia.org/wiki/Disagree_and_commit (Amazon principle wording, third-party reproduction)
- https://businessmap.io/blog/agile-swarming ; https://innolution.com/blog/swarm-to-the-fewest-viable-items
- https://plane.so/blog/what-are-team-working-agreements-definition-structure-examples ; https://tech.gsa.gov/guides/agile_team_working_agreement ; https://microsoft.github.io/code-with-engineering-playbook/agile-development/team-agreements/working-agreement/
- https://www.michigan.gov/documents/mdhhs/Google-and-Psychological-Safety_684425_7.pdf (Google re:Work psychological safety summary; not cited in a row)

Failed fetches (so no claim rests on them):
- https://en.wikipedia.org/wiki/Auftragstaktik (404)
- https://eng-strategy page on lethain.com (404)
- https://dora.dev/capabilities/code-review-speed/ and https://dora.dev/capabilities/code-reviews/ (404)
- https://dora.dev/capabilities/work-in-process-limits/ (404)
- https://www.armypubs.army.mil/... ADP 6-0 PDF (DNS failure); https://irp.fas.org/doddir/army/adp6_0.pdf (empty response)
- https://rework.withgoogle.com/print/guides/ (404)
- https://www.hbs.edu/... Tannenbaum page (403)
- https://www.amazon.jobs/en/landing_pages/our-leadership-principles (403)

Still unverified after this pass (listed so they are not quoted as established):
- Grove's primary text on TRM and leverage (only reviews and summaries read).
- Fournier, The Manager's Path, tech lead chapter content (only the O'Reilly listing and a Welcome to the Jungle summary surfaced; chapter 3 title confirmed by listing).
- Larson "Migrations" and the full strategy-writing posts.
- ADP 6-0 exact commander's intent and mission-orders paragraphs (only secondary text).
- Tannenbaum and Schmidt original 1958 text (only secondary sources).
- Google re:Work delegation and escalation guidance (not found).
- DORA code review speed and WIP limits claims (pages 404).
- Vacanti's 85th-percentile alarm threshold (derived; not a sourced rule).
- Definition of ready, escalation ladder, interrupt budget, and the "at least 20 completions" threshold in row 15 (design proposals).
- Scrum Guide DoD wording (not fetched this pass).
- Situational leadership style mapping (evidence mixed per Wikipedia).
