# Orchestra Projects: user journeys and stories

Status: draft for owner approval. No v7 mock is built before this is approved.

## Ground rules (apply to every journey)

- **Actors.** *Owner* is the human: one person today, a team later. *Maestro* maintains the board. *Seats* are the agents doing the work: backend B, frontend F, review R. *Guest* is anyone outside, reading through a share link.
- **The human never creates, moves or edits issues.**
  - They read, comment, answer, attach context to a card, ask Maestro for something, undo a Maestro action, and pause or resume a project.
  - Every write the human makes is attached to something: a card, an epic, a project or a question. There is no global context box.
- **Every status rests on an artifact.** If the artifact is missing, the UI says "unverified" and never shows the status as fact.
- **Story format.** "As \<actor\>, when \<situation\>, I \<do\>, so \<outcome\>", followed by acceptance criteria (AC).
  - Each journey has at least one happy story (H), one edge story (E) and one failure story (F).
- **Labels.** "Screen" names the mock that covers the journey: v5 board, v6-*, or **v7** (new).

---

## J1. Morning check-in

Screen: v6 Projects, v5 briefing.

- **H1. Normal morning.** As Owner, when I open Projects in the morning, I read Maestro's digest first, so I know in 10 seconds what moved and whether anything needs me.
  - AC: the digest is at most 3 sentences and names projects and cards as links.
  - AC: the count of "Needs you · N" equals the number of rows in the inbox.
  - AC: projects are sorted with those that need me first.
- **H2. Nothing happened.** As Owner, when nothing changed since I last looked, I see "No changes since Fri 18:40" in place of the digest, so I don't hunt for news that isn't there.
  - AC: no empty chart or "0" in a hero slot; the Replay button is hidden.
- **E1. Away a long time.** As Owner, when I return after 9 days, the digest summarizes by week and offers "Replay 9 days (40s)", so I can catch up without reading 200 events.
  - AC: the replay is compressed to at most 60s; per-day markers sit on the scrubber.
- **E2. Many projects.** As Owner, with 12 projects, I see the ones that need me and the at-risk ones expanded, and the rest collapsed under "8 on track", so the screen stays calm.
- **F1. Maestro offline.** As Owner, when Maestro is not running, the digest slot says "Maestro is offline since 07:12. The board shows the last known state." Every live mark stops, with a "Restart Maestro" action.
  - AC: no fake "live" line is ever shown while offline, and timestamps read "as of 07:12".
- **F2. Digest wrong vs. data.** As Owner, when the digest claims something no artifact backs (for example "LCH-58 shipped" with no merge), the claim is not rendered as fact: it shows a dotted underline with "unverified", so I never trust prose over proof.

## J2. Watch the board live

Screen: v5 board.

- **H1.** As Owner, when I leave the board open, I see cards move between stages with a short animation, the "now" line update on Building cards, and CI ticks fill on Review cards, so I feel the work happening without clicking.
  - AC: a moved card flashes its new stage glyph once, and motion respects Reduce Motion (fade instead of fly).
- **H2.** As Owner, when a card ships while I watch, a toast says "LCH-58 shipped · PR #958 merged" with "See proof", so shipping is a visible moment.
- **E1. Burst.** As Owner, when 6 cards change within a second (Maestro re-plans), the moves are batched into one animation and one toast "Maestro re-planned 6 cards · Why", so the board doesn't flicker.
- **E2. Reduce Motion / background tab.** As Owner on Reduce Motion, changes appear with a highlight and no motion. When the tab returns from the background, missed changes collapse into the "Since you looked" count instead of replaying.
- **F1. Connection lost.** As Owner, when the stream drops, the header shows "Reconnecting…" and live marks freeze in grey. On reconnect the board reconciles in one pass, so I never see two copies of a card or a stuck "now" line.
- **F2. Agent stalled.** As Owner, when a Building card has shown no activity for longer than its normal pace (for example 40 min with no commit or log), its "now" line turns muted with "No activity for 40 min". Maestro's reason appears when known, so a frozen agent never looks busy.

## J3. Inspect a card (peek and page)

Screen: v6-issue.

- **H1.** As Owner, when I press Space on a focused card, the peek opens over the board. It shows Maestro's summary, steps, one proof line and the latest note. I close it with Esc and keep my place.
- **H2.** As Owner, when I press Enter, I land on the full issue page with steps, proof (PR, CI, guardrails, diff per file), context and activity. J/K moves to the next issue in the same stage.
- **E1. Card with no PR yet (Ready/Backlog).** The proof section says "Not started · no branch yet" and shows what it waits on ("after LCH-61"), never an empty table.
- **E2. Shipped card.** The page leads with "Shipped Oct 22 · #948 merged" and the final diff. The steps are collapsed, and the composer becomes "Ask Maestro for a follow-up", so a closed card is not edited.
- **F1. Proof contradicts stage.** As Owner, when the card says Review but the PR was closed unmerged, the card shows an amber "Status out of date: PR #949 closed", and Maestro re-stages it or explains within one cycle.
- **F2. Card deleted/merged by Maestro.** When I open a link to a card Maestro split or merged, I land on a tombstone: "LCH-62 was split into LCH-65 and LCH-66 on Oct 23 · Why · Undo". Never a 404.

## J4. Answer a question (Needs you)

Screen: v6-inbox, v5 Ask card.

- **H1.** As Owner, when Maestro asks "Can a plugin reach the network by default?", I see its recommendation with the reason, what is blocked, and the cost of waiting. I press 1, 2 or 3, so the decision takes seconds.
  - AC: after answering, the card moves to "Answered" with what Maestro did next ("LCH-63 resumed 09:14").
- **H2. Answer in words.** As Owner, when none of the options fits, I type a free answer ("network only to allow-listed hosts"). Maestro confirms how it read it before acting ("I'll add an allow-list step to LCH-63. Correct?").
- **E1. Ask back.** As Owner, when I need more info, I write "why not ask on first use?". Maestro replies on the question thread, and the question stays open with "Maestro answered your question".
- **E2. Stale question.** When the question was made moot (scope changed), Maestro withdraws it: "Withdrawn: Plugins moved to 1.2". It leaves the inbox with that reason; it never silently disappears.
- **E3. Changed my mind.** As Owner, after answering, I reopen it from "Answered" and pick another option. Maestro shows what it would undo ("revert step 3 of LCH-63") before I confirm.
- **F1. Answer fails to apply.** When Maestro can't act on my answer (agent crashed), the question goes back to the inbox as "Answer received, not applied yet: backend agent offline". My answer is kept and never lost.
- **F2. Two people answer (team, later).** The first answer wins. The second person sees "Answered by Ana 2 min ago" with the option to comment instead.

## J5. Attach context to a card

Screen: v5 drop, v6-issue composer.

- **H1.** As Owner, when I drag a video onto LCH-66, the card highlights as the drop target and the file attaches. Maestro acknowledges what it read ("Watched updater-flow.mov, 0:41 shows the banner overlapping the titlebar"), so I know it was understood.
- **H2. Secret.** As Owner, when I add `UPDATE_SIGNING_KEY` through "Secret", it goes to the vault. The card shows only its name and "Sealed", and the agent uses it by name.
  - AC: the value is never shown again, never in logs, never sent to the model as text.
- **E1. Drop between cards.** When I release the file between two cards, nothing attaches. A hint says "Drop on a card", so context never lands on the wrong issue.
- **E2. Context for several cards.** When I attach a spec PDF to LCH-58, I can add "also applies to LCH-64". It appears on both, marked "shared from LCH-58".
- **E3. Link instead of file.** When I paste a URL, Maestro fetches it, shows the title, and marks "Maestro read it Mon".
- **F1. Unsupported/too big.** When the file is 3 GB or a format Maestro can't read, the attach is refused with the reason and the limit. Nothing half-uploaded remains.
- **F2. Secret pasted as plain note.** When I paste something that looks like a key into a note, the composer stops and offers "Store as secret instead?". It never sends the raw value.

## J6. Steer a card with a note

Screen: v6-issue activity.

- **H1.** As Owner, when I write "rotate the key the same way the CLI does" on LCH-61, Maestro replies with how it changed the plan ("added step: key rotation test"), and the step track updates.
- **H2. Note while the agent works.** The note is delivered at the next safe boundary. The card shows "Note delivered to backend at 14:06".
- **E1. Note conflicts with an earlier answer.** Maestro flags it: "This contradicts your answer on Oct 22 (network off by default). Which wins?". It becomes a question, not a silent override.
- **E2. Note out of scope.** When I ask for something that is a new feature, Maestro proposes "This is new work. Create LCH-77 in Auto-update?" as a question, and the current card is not bloated.
- **F1. Note not read.** When Maestro hasn't acknowledged a note after one cycle, the note shows "Not read yet" with retry. "Maestro reads every note" is only claimed when it did.

## J7. Undo or contest a Maestro action

Screen: v6-issue activity, **v7** undo.

- **H1.** As Owner, when Maestro moved LCH-60 back to Building, I see "Why: 2 changes requested in review" with Undo. Undo restores the stage and tells Maestro I disagreed.
- **H2. Undo a re-plan.** When Maestro split LCH-62 into two cards, Undo merges them back and restores links, notes and context.
- **E1. Irreversible effect.** When the action already had an external effect (merged PR, published release), Undo is replaced by "Revert", which creates a revert task and shows what it will do. The UI never pretends time travel.
- **E2. Undo window.** When the action is older than its dependents (later work built on it), Undo shows which cards would be affected and asks to confirm.
- **F1. Undo fails.** When the undo can't apply (conflict), the action stays. The message says why, and it becomes a question for Maestro to resolve.
- **F2. Action without reason.** An action with no stored reason is a bug state. It shows "No reason recorded" in amber, so missing explanations are visible, not hidden.

## J8. Replay "since you looked"

Screen: v6-inbox `#replay`.

- **H1.** As Owner, when I press Replay, the real board rewinds to my last visit and plays the changes in 20–40s. Changed cards fly, the rest dim, and an event list follows the scrubber.
- **H2. Scrub.** I drag the scrubber to Sun 14:20 and see the board exactly as it was then. Clicking an event jumps to it.
- **E1. Huge range.** With 300 events, minor events (step ticks) fold, and only stage moves, questions and ships animate.
- **E2. Exit mid-replay.** Esc returns to now, and "Since you looked" resets only if I reached the end ("Caught up").
- **F1. History gap.** When events are missing for a period (server down), the scrubber shows a hatched gap: "No history Sat 02:00–06:00". The UI never interpolates fake moves.

## J9. Start a new project

Screen: v6-inbox `#empty`.

- **H1.** As Owner, when I press "Start a project" and give a brief plus files, the board appears empty with five dashed stages. Maestro shows its drafting checklist, and epics and cards appear as they are drafted.
- **H2. Approve the plan.** When Maestro finishes the draft, it asks one question: "Plan ready: 4 epics, 31 issues, forecast Dec 2–9. Start?". Nothing runs until I say yes.
- **E1. Brief too thin.** Maestro asks up to 3 clarifying questions before drafting, each with a suggested answer.
- **E2. Reshape in words.** I answer "drop Windows from 1.2". Maestro removes that epic and shows the diff of the plan before starting.
- **F1. Drafting fails.** When Maestro can't draft (model error, repo unreachable), the empty state says what failed and offers Retry. It never shows infinite skeletons.

## J10. Epic and timeline deep dive

Screen: v6-epic.

- **H1.** As Owner, I open Auto-update and read where it stands, what it waits on, the burnup, and the spend. Issues are grouped by stage.
- **H2. Timeline.** I open Timeline and see per-epic shipped vs left, the P50–P85 cone, dependencies, and the launch line. "Sets the date" marks the long pole.
- **E1. Scope grew.** When Maestro added 3 issues, the burnup shows the scope step with "+3 · split by Maestro · Why".
- **E2. Epic with nothing left but blocked.** When the epic shows 100% minus one blocked card, the forecast becomes "waits on LCH-58" instead of a date.
- **F1. Not enough history to forecast.** With fewer than 5 shipped issues, the cone is replaced by "Forecast after 5 issues ship (2 so far)". No fake precision.

## J11. What-if scenarios (v7)

Screen: **v7**.

- **H1. Hover a decision.** As Owner, when I hover an option of a pending question, the forecast on the briefing and timeline previews the result ("Answer now: Nov 5–7; wait 3 days: Nov 8–11"). I decide seeing the consequence.
- **H2. Drop scope.** As Owner, when I toggle "without Linux AppImage signing" in the scenario tray, the timeline ghosts the new end date and lists what drops. "Ask Maestro to do this" turns it into a request, never a direct edit.
- **E1. Combined scenarios.** I stack two toggles; the result shows both effects and their interaction.
- **E2. No effect.** When a toggle doesn't move the date (not on the critical path), it says "No change to the date · saves $3", so I learn what matters.
- **F1. Low confidence.** When the model can't estimate (no history for that seat), the preview shows a wide range with "Low confidence: 2 data points" and never a single date.

## J12. Ask the board (v7)

Screen: **v7**.

- **H1.** As Owner, when I type "what blocks the launch?" in the ask bar (/), the board itself answers. The critical path lights up, everything else dims, and a one-line answer cites cards ("LCH-63 waits on you; LCH-71 sets the date").
- **H2.** "What did backend do today?" highlights the cards B touched, with a timeline strip of its commits.
- **E1. Follow-up.** "and if I answer LCH-63 now?" chains into a what-if (J11) on the same highlight.
- **E2. Question about money.** "Where did the money go?" switches to a spend overlay (J13) instead of text.
- **F1. Can't answer.** When the answer isn't in the data, it says so ("No data on customer feedback in this project") and offers to attach context. It never invents.
- **F2. Ambiguous question.** It shows 2–3 interpretations as chips instead of guessing.

## J13. Spend and budget (v7)

Screen: **v7**, v6 Projects meter.

- **H1.** As Owner, I see $ per card, epic, seat and project, and the burn vs budget with a forecast to finish ("$18 of $60 · ~$41 at finish").
- **H2. Pre-emptive warning.** When the forecast to finish crosses 90% of the budget, Maestro asks before it happens: "Plugins will exceed $60 by ~$8. Raise budget, cut scope, or switch plugin work to a cheaper model?"
- **E1. One card burning.** When a card costs 3× its peers, it shows a muted "$9.20, 3× usual" with Maestro's reason, so I can contest it.
- **E2. Budget hit.** At 100%, new work pauses and the project is marked "Paused · budget". Running steps finish their safe boundary first.
- **E4. Infra counts too.** Spend has two bands in one budget: Models (provider usage) and Infra (CI minutes, agent sandboxes, hosting). Infra is attributed to a card when it can be (a CI run belongs to its PR); the rest shows at project level. The 80% warning and 100% pause use the total.
- **F2. Infra not metered.** When an infra source has no usage API (a domain, a self-hosted runner), it shows "Not metered" with the source named, never $0, and the total says "plus unmetered infra".
- **E3. Cheaper model as my call.** Spend breaks down by model ("opus $11, sonnet $5, haiku $2"). When Maestro sees a cheaper route, it asks: "Plugin tests on haiku would save ~$6, risk: more retries". The switch is my decision, never silent.
- **F1. Cost unknown.** When a provider reports no cost (subscription engine), spend shows "Not metered · Claude subscription" instead of $0.

## J14. At risk and slips

Screen: v6-inbox `#risk`.

- **H1.** As Owner, when the forecast slips past the target, the project badge turns "At risk". The briefing names the cause in one sentence, and only the causing cards turn amber.
- **H2. Recovery path.** Maestro offers 1–2 concrete recovery options as a question (cut X, answer Y), each with its forecast.
- **E1. Risk resolved.** When I answer and the forecast returns, the badge goes back to "On track" with a one-line "Back on track since you answered LCH-63".
- **E2. External cause.** When the slip is CI flakes or a provider outage, the cause says so and nothing asks me to decide what I can't control.
- **F1. False alarm.** A single noisy estimate never flips the badge. At risk needs P50 past target for 2 consecutive updates.

## J15. Share a status link (v7)

Screen: **v7**.

- **H1.** As Owner, I press Share, pick "Read-only status", and get a link. The guest sees the project summary, progress, forecast and recently shipped items with proof links, updating live.
- **H2. Choose what's visible.** I hide spend and internal notes. The preview shows exactly what the guest will see before I copy.
- **E1. Revoke.** I revoke the link, and the guest sees "This link was turned off by the owner".
- **E2. Guest at risk moment.** When the project is At risk, the guest sees the honest state with Maestro's one-line cause. There is no separate "PR-safe" version.
- **E3. Expiry.** When I create the link, I can set an expiry (7 days, 30 days, until shipped). An expired link reads "This link expired Nov 12", and I renew it from the same place.
- **E4. Scope of the link.** I can share one epic instead of the whole project. The guest sees only that epic and its forecast; other epics are not named.
- **F1. Secrets/notes leakage.** Vault items, notes and file contents are never in the guest view, whatever the settings. The guest page never includes context attachments.

## J16. Pause, resume and stop a project

Screen: v6 Projects (Docs paused).

- **H1.** As Owner, I pause Docs refresh. Running steps stop at a safe boundary, the badge reads "Paused by you", and the forecast says "No forecast while paused".
- **H2.** I resume it. Maestro states what it will pick up first, and the forecast returns after one cycle.
- **E1. Pause one card.** I pause a single card ("hold LCH-66"). It shows "Held by you" in amber; dependents show "waits on a held card".
- **F1. Pause can't stop cleanly.** When a step can't stop safely (mid-migration), the pause is "Pausing after current step (~4 min)". It never kills work silently.

## J17. Ask Maestro for new work

Screen: v6-inbox "Ask Maestro", composer on project or epic.

- **H1.** As Owner, I write on the Auto-update epic: "add a 'what's new' dialog after update". Maestro answers with the proposed card(s), size, epic and forecast impact. It creates them only after I accept.
- **H2. Bug report.** I drop a screenshot of a crash on the project. Maestro files a Bug card and says which epic and seat it went to.
- **E1. Duplicate.** When it matches an existing card, Maestro links it: "Already LCH-66; added your screenshot there".
- **E2. Out of project scope.** Maestro suggests "Belongs in Launch 1.2. Add there?".
- **F1. Can't fit.** When the request breaks the target, Maestro says so with the cost ("+3 days") and asks whether to take it anyway.

## J18. Navigate and find

Screen: v5 / v6-list keyboard, ⌘K.

- **H1.** J/K/Space/Enter/Esc work everywhere: board, list, epic, inbox. G B / G L / G T switch views, and a key hint bar is always available (?).
- **H2. Find.** ⌘K "signing" finds cards, epics, files and notes across projects, grouped by kind.
- **E1. Deep link.** A pasted link to LCH-61 opens the page in context, with breadcrumbs to the epic and project.
- **F1. Nothing found.** Empty search offers "Ask the board" with my query prefilled.

## J19. Things go wrong in the work itself

Screen: v5 `.held`, v6 risk; partly **v7**.

- **H1. CI red.** When CI fails on LCH-58, the card shows the failing check by name. Maestro states its next action ("backend is fixing the test, attempt 2 of 3"). No question unless the attempts run out.
- **E1. Attempts exhausted.** After 3 failed attempts, it becomes a question with the failing log excerpt and options (retry with a stronger model / skip check / hand to me).
- **E2. Guardrail blocks a change.** When a guardrail rule blocks, the card shows the rule in plain language with its summary. Maestro either complies or asks.
- **F1. Agent crash.** When the seat crashes, the card shows "Backend agent stopped: \<reason\>". Maestro restarts or reassigns, and history keeps the gap.
- **F2. Repo unreachable / auth expired.** The whole project shows one banner with the fix ("GitHub token expired · Reconnect") instead of 20 red cards.

## J20. Decisions log (v7, part of feature 5)

Screen: **v7**.

- **H1.** As Owner, I open "Decisions" on a project and see every answer I gave, with date, options, Maestro's recommendation and what followed.
- **H2. Why did we…?** From a card, "Decided by" links the decision that shaped it.
- **E1. Decision overturned.** A changed answer shows both versions and what was reverted.
- **F1. Decision with no outcome yet.** It shows "Applied, no result yet", not a fake outcome.

---

## J21. First run

Screen: **v7**.

- **H1.** As Owner, on first open with no projects, I see one sentence on what Projects is and one action, "Start a project". Connecting a repository is part of that flow, not a separate settings hunt.
- **H2. Connect GitHub.** When the project needs a repository, Maestro asks for access in the flow ("Connect GitHub to read gustavomhss/hugr-orchestra"). The board shows which repo it is bound to.
- **E1. Existing work.** When the repo already has open PRs and issues, Maestro offers "Import 14 open issues and 3 PRs as cards?" with a preview. Nothing is imported without a yes.
- **F1. Connect fails.** When the auth is refused or expires mid-flow, the step says why and offers Retry. The partial project is kept as a draft, not lost.
- **F2. No repository at all.** A project without code (docs, research) is allowed. Proof falls back to the artifacts that exist (files, links) and the UI says "No repository: proof is files and notes".

## J22. Project settings

Screen: **v7** (project header "Settings").

- **H1. Target date.** As Owner, I set or move the target date. The forecast is unchanged (it comes from the data), and the badge recomputes against the new target with the reason: "Target moved Nov 6 to Nov 13 by you".
- **H2. Budget.** I set the budget, and the spend meter and the warning threshold (J13-H2) follow it.
- **H3. Seats and models.** I see which seat and model serve each epic. I can change a seat's model ("plugins on sonnet"); Maestro confirms the effect on cost and pace before it applies.
- **E1. Change during work.** A model change applies at the next safe step boundary, never mid-step. The card shows "Model changes after step 3".
- **E2. Target before forecast.** When I set a target earlier than P50, the UI shows "At risk from the start" right away, with the gap in days.
- **F1. Invalid setting.** When a chosen model is unavailable (no key, provider down), the change is refused with the reason, and the old value stays.

## J23. Reprioritize

Screen: v5 board, v6-list; **v7** request flow.

- **H1.** As Owner, I write on the project: "do Plugins before Crash reports". Maestro shows the new order and the effect on each epic's forecast, and applies it when I accept.
- **H2. Urgent card.** I write on LCH-69 "this first". Maestro moves it to the top of Ready, says what it delays ("LCH-66 one day later"), and asks only if it breaks the target.
- **E1. Impossible order.** When I ask for something that depends on unfinished work first, Maestro explains the dependency ("LCH-67 needs LCH-63") and proposes the closest valid order.
- **F1. Silent drift.** Maestro never reorders on its own without a reason line. Any reorder it makes appears in the activity with Why and Undo (J7).

## J24. Finish, archive, delete

Screen: v6 Projects (Relay shipped); **v7** retro.

- **H1. Project shipped.** When the last card ships, the project shows "Shipped Oct 19 · 3 days early". Maestro writes a short retro: what shipped, what was cut, forecast accuracy, spend vs budget, decisions that mattered.
- **H2. Archive.** I archive a shipped project. It leaves the main list and stays searchable and replayable under "Archived".
- **E1. Leftovers.** When cards remain at ship time (cut scope), Maestro asks "Move 2 leftover cards to Launch 1.2, or drop them?".
- **E2. Unarchive.** I unarchive a project, and it comes back paused, not running.
- **F1. Delete.** Delete asks for confirmation by typing the project name, and states what is removed (cards, notes, attachments, vault entries scoped to it). Merged PRs in GitHub are untouched, and the UI says so.

## J25. Notifications outside the app

Screen: **v7** (preferences sheet).

- **H1.** As Owner, when Maestro asks something that blocks work, I get one push or email with the question and the recommended answer. Answering from it with the option keys lands the decision.
- **H2. Daily digest.** I choose a time (9:00). The digest arrives there with the same content as J1-H1.
- **E1. Quiet hours.** During quiet hours, questions wait. Only "budget hit" and "project stopped" break through, and only if I enabled that.
- **E2. Already seen.** When I have already answered in the app, the pending push is withdrawn. No stale notification asks again.
- **F1. Delivery fails.** When email bounces or push is off, the in-app inbox still holds everything, and the preferences sheet shows "Email not delivered since Oct 20".

## J26. Agent live view inside a card

Screen: **v7** (issue page "Live" tab).

- **H1.** As Owner, on a Building card, I open Live and see the seat's terminal and the diff updating as it writes, with the current step highlighted.
- **H2. Jump in time.** I scrub the card's own history: commit by commit, test run by test run.
- **E1. Several seats on one card.** The view splits by seat (B writing, R reviewing), each labeled by role id.
- **E2. Nothing live.** On a Ready or Shipped card, Live shows the last session recording or "Not started".
- **F1. Output sanitized.** Terminal text shown to the owner and the model is sanitized. Secrets are masked by name ("•••• UPDATE_SIGNING_KEY"), and a mask failure blocks the view instead of leaking.

## J27. Maestro asks the owner for something

Screen: v6-inbox; **v7** request card.

- **H1.** As Owner, when the work needs a key or an access ("App Store Connect API key for notarization"), the request arrives as a Needs-you card on the right issue, with what it is for and where it will be stored. I fulfil it with the Secret flow (J5-H2).
- **H2. File request.** Maestro asks for an asset ("the 1024px app icon"). I drop it on the request, and the request closes with what it did.
- **E1. Can't provide.** I answer "I don't have it". Maestro proposes the alternative and its cost ("skip notarization for beta, +1 risk").
- **F1. Wrong thing provided.** When the provided key doesn't work, Maestro says so with the error (never the value) and re-opens the request.

## J28. Undo what I did

Screen: v6-issue.

- **H1. Remove attachment.** As Owner, I remove a file from a card. Maestro acknowledges ("no longer using signing-requirements.pdf") and shows if any step relied on it.
- **H2. Edit or delete my note.** I edit a note. Maestro sees the edit and shows "Plan updated from your edited note" or "No change needed". A deleted note leaves "Note deleted by you" in the activity.
- **E1. Rotate a secret.** I replace a vault value. The card shows "Rotated Oct 25", and running work picks it up at the next step.
- **E2. Delete a secret in use.** Deleting asks first: "LCH-58 and LCH-64 use it; they will stop at the step that needs it".
- **F1. Removal after use.** When Maestro already acted on the removed context, the removal does not rewrite history. It shows what was built from it and asks whether to redo that work.

## J29. Cross-project dependencies

Screen: v6 Projects, v6-epic timeline; **v7** link line.

- **H1.** As Owner, when a Launch 1.1 card waits on a Guardrails pilot card, both show the link ("waits on GRD-14, Guardrails pilot"). The timeline draws it across projects.
- **E1. Upstream slips.** When the upstream project slips, the downstream forecast moves with the cause named: "Launch 1.1 at risk: GRD-14 slipped".
- **E2. Upstream paused.** When the upstream project is paused, the downstream card shows "waits on a paused project" in amber, as a Needs-you item.
- **F1. Link to a deleted project.** The dependency becomes "Upstream deleted · decide" as a question, never a silent unblock.

## J30. Correct Maestro

Screen: v6-issue, v5 briefing; **v7** feedback control.

- **H1.** As Owner, when a digest line or a card summary is wrong, I mark it "Wrong" and say why. Maestro fixes it and shows the corrected text with "Corrected after your feedback".
- **H2. Bad card.** I mark a card "This doesn't make sense". Maestro explains it or proposes to split, merge or drop it, as a question.
- **E1. Repeated mistake.** When the same kind of correction repeats, Maestro states the rule it now follows ("I'll stop counting draft PRs as Review") in a visible list I can edit or remove.
- **F1. Maestro disagrees.** When the data contradicts my correction, Maestro shows the proof and asks rather than complying blindly.

## J31. Work coming from outside

Screen: **v7** intake.

- **H1.** As Owner, when someone opens a GitHub issue on the bound repo, Maestro triages it into a proposed card with type, epic and reason ("Bug · Auto-update · crash on update from 0.9"). It lands in an Intake strip until I accept, or by rule if I set auto-accept for bugs.
- **E1. Duplicate or noise.** Maestro links duplicates to existing cards and marks spam or questions "Not work · replied on GitHub", always with a reason I can overrule.
- **E2. Flood.** With 40 new issues in a day, Intake groups them by theme with counts, not 40 rows.
- **F1. Source disconnected.** When the GitHub hook stops, the Intake strip shows "No intake since Oct 22 · Reconnect".

## J32. Look at a PR before merge

Screen: v6-issue proof; **v7** review surface.

- **H1.** As Owner, on a Review card, I open the PR diff in place (files, guardrails, CI) and leave a comment on a line. Maestro routes it to the seat, and it shows as a note on the card.
- **H2. Ask for a hold.** I press "Hold before merge" on a card. It will not merge until I release it; the card shows "Held by you before merge".
- **E1. Merge already happened.** When I comment after the merge, Maestro offers to open a follow-up card.
- **F1. Review comment unanswerable.** When the seat can't address my comment, it becomes a question with the options, not a silent merge.

## J33. Drill into proof

Screen: v6-issue; **v7** proof sheet.

- **H1.** As Owner, when I click any status (stage glyph, "CI 6/7", "73/73 guardrails", "Shipped"), a proof sheet opens. It shows the artifact that makes it true: the PR with its state, the CI run with each check, the guardrail run with rules, the merge commit. Each one links out.
- **H2. Derived numbers.** Clicking a project's "56%" shows the 23 shipped cards and their merge commits; clicking the forecast shows the pace data behind it.
- **E1. Partial proof.** When some artifacts exist and others don't (PR open, CI not started), the sheet lists what is proven and what is pending, line by line.
- **F1. Artifact unreachable.** When GitHub is down, the sheet shows the last verified copy with its time ("verified 10:42, GitHub unreachable now"). The status is marked stale, not true.

---

## Cross-cutting requirements (every journey)

- **X1. Accessibility.**
  - Every journey can be completed with keyboard only and with a screen reader.
  - Stage, status and amber or blue meaning are also carried in text, never color alone.
  - Live updates are announced politely and batched.
- **X2. Narrow window.**
  - Below 900px, the board becomes one stage at a time with a stage switcher.
  - The peek becomes a full-height sheet. No horizontal page scroll.
- **X3. Languages.** All copy goes through i18n. Dates, numbers and money are localized. Maestro's prose follows the app language.
- **X4. Two devices.** The board, inbox and "since you looked" sync across devices. Answering on one withdraws the question on the other (J25-E2).
- **X5. Export.** A project's history (cards, decisions, activity, spend) can be exported as JSON and Markdown. Secrets are never exported.
- **X6. Themes and motion.** Dark and light are judged at 2×, and Reduce Motion is respected (J2-E2).

## Coverage matrix

Each cell names the stories that cover it, or says N/A with the reason. "Ask" means the owner cannot do it directly by design (Maestro alone maintains the board), but has a covered path to request it.

### Owner

| Object | View | Create | Change | Remove / undo | Fails |
|---|---|---|---|---|---|
| Project | J1, J10, J33-H2 | J9, J21 | J22, J16 | J24 | J9-F1, J19-F2, J21-F1 |
| Epic | J10 | Ask: J17, J9-E2 | Ask: J23-H1 | Ask: J11-H2, J9-E2 | J10-F1 |
| Issue | J3, J18 | Ask: J17, J31 | Ask: J23-H2; hold: J16-E1, J32-H2 | Undo Maestro: J7 | J3-F1, J3-F2 |
| Step | J3, J26 | N/A: Maestro's plan; steer via J6 | N/A: steer via J6 | N/A: steer via J6 | J2-F2, J19 |
| Note | J6 | J6, J32-H1 | J28-H2 | J28-H2 | J6-F1 |
| Attachment | J3-H2 | J5, J27-H2 | N/A: replace = remove + add | J28-H1 | J5-F1, J28-F1 |
| Secret | J5-H2 (name only) | J5-H2, J27-H1 | J28-E1 | J28-E2 | J5-F2, J27-F1 |
| Question | J4 | N/A: questions are Maestro's; owner asks via J17, J12 | J4-E3 | J4-E2 (withdrawn by Maestro) | J4-F1, J4-F2 |
| Decision | J20 | J4 | J4-E3, J20-E1 | J7 (undo its effect) | J20-F1 |
| Share link | J15-H2 | J15-H1 | J15-H2, J15-E3, J15-E4 | J15-E1 | J15-F1 |
| Budget | J13 | J22-H2 | J22-H2, J13-H2 | N/A: budget can be raised, not removed | J13-F1, J13-E2 |
| Seats and models | J22-H3 | N/A: seats are fixed roles | J22-H3, J13-E3 | N/A: seats are fixed roles | J22-F1 |
| Notifications | J25 | J25-H2 | J25-E1 | J25-E2 | J25-F1 |
| Proof | J33 | N/A: produced by work | N/A: produced by work | N/A: produced by work | J33-F1, J1-F2 |
| Maestro rules | J30-E1 | J30-E1 | J30-E1 | J30-E1 | J30-F1 |
| Dependency | J10, J29 | Ask: J23-E1 | Ask: J23 | Ask: J23 | J29-F1 |

### Maestro

| Action | Stories |
|---|---|
| Draft a project or plan | J9 |
| Create, split or merge cards | J17, J31, J3-F2, J7-H2 |
| Move stages and reorder | J2, J23-F1 |
| Ask, withdraw or request | J4, J4-E2, J27 |
| Write the digest, summaries and retro | J1, J24-H1 |
| Reply to notes and corrections | J6, J30 |
| Warn on risk or budget | J14, J13-H2 |
| Fail or go offline | J1-F1, J2-F1, J9-F1 |

### Seats

| Action | Stories |
|---|---|
| Work a step live | J2, J26 |
| Open PR, run CI | J3, J33 |
| Answer review comments | J32 |
| Crash, stall or exhaust attempts | J2-F2, J19 |

### Guest

| Action | Stories |
|---|---|
| View the shared status | J15-H1, J15-E2 |
| Hit a revoked or expired link | J15-E1, J15-E3 |
| See private data | Never: J15-F1 |
| Comment | Open question 3 |

## Coverage map: the 8 differentiators

| # | Feature | Journeys |
|---|---|---|
| 1 | Status backed by proof | J33, J1-F2, J3, J3-F1, J19 |
| 2 | What-if | J11, J12-E1, J14-H2, J23-H1 |
| 3 | Ask the board | J12, J18-F1 |
| 4 | Live + replay | J2, J8, J26 |
| 5 | One-key decisions + log | J4, J20, J25-H1 |
| 6 | Spend in view | J13, J22-H2 |
| 7 | Undo everything | J7, J28, J3-F2, J4-E3 |
| 8 | Stakeholder link | J15 |

## Owner decisions (2026-10-25)

1. **Team mode.** Single owner for now. J4-F2 stays specified for later and is not mocked in v7.
2. **Budget hit.** Warn at 80%; at 100%, new work pauses and running steps finish their safe boundary (J13-E2).
3. **Guest link.** Strictly read-only. No comments from guests.
4. **Intake.** Every intake waits for the owner by default. Auto-accept is an opt-in rule the owner sets per type, off at start.
5. **Hold before merge.** Opt-in per card. There is still no mandatory human approval.
