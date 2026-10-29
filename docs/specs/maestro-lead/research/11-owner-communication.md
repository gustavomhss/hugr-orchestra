# 11. Owner communication: how Maestro talks to the owner

Scope: rules and fixed message shapes for Maestro's messages to one busy owner.
Method: fetched primary or near-primary pages where the fetch worked. Search snippets were used where a fetch failed. Anything not confirmed from a fetched source is marked [UNV].

Evidence classes: [P] paper, [VD] vendor doc, [GOV] government/doctrine, [BO] blog or practitioner write-up, [UR] user report or owner preference, [UNV] not confirmed from a fetched source.

Gaps: Google design docs, RFC templates, RAG/PPP status formats, Cursor and Codex summaries, and alert-fatigue research were not fetched. Those are not covered here.

---

## Part 1. Rules

Each rule is short. Each has a source. Sources that were not fetched are marked.

### R1. Answer or ask first. Put the point in the first line.
- Why: Inverted pyramid. Readers stop early. Put the conclusion first.
- Source: NN/g, "How Users Read on the Web" (fetched). Its advice: start with the conclusion and cut word count to half or less. [BO]
- Source: BLUF. Army writing style puts the main point first. Secondary sources cite AR 25-50 [UNV for exact text; the regulation was not fetched].
- Source: Minto Pyramid Principle and SCQA. Answer first, then support. Secondary only: thinkinsights.net [BO]. Barbara Minto's book was not fetched [UNV].

### R2. One decision per message. Ask one question.
- Why: Each extra question adds load. The decision must be clear at a glance.
- Source: AskUserQuestion pattern in Claude Code. Questions stay open until answered. Answers can be a pick or free text [VD, fetched: code.claude.com/docs/en/tools-reference].
- Source: Plain language. Put the main point in the first sentence. One idea per paragraph. [BO, NN/g].

### R3. Every decision request has Maestro's recommendation, with the reason.
- Why: The owner is busy. A bare question forces the owner to do the analysis. The owner asked for pre-digested decisions.
- Source: Completed Staff Work. The subordinate hands the decider a recommendation and the research behind it. The decider only approves or disapproves. Fetched from Wikipedia [BO]. Doctrine text itself [GOV, not fetched].
- Source: Nygard ADR. Decision and context are separate. Decision is written as a clear "We will" statement [BO, fetched].
- Source: RAPID and DACI. One role recommends, one decides, others give input [BO, search snippets]. Maestro is the Recommend role. The owner is the Decide role.
- Source: Owner preference. Owner wants recommendation in every ask [UR, owner's stated rule].

### R4. Say the cost of waiting, in one line, with a time.
- Why: Owner needs to know if the decision can wait.
- Source: Statuspage incident practice. Each update states impact and next update time [BO, search snippets from third-party guides; Atlassian's own page was not reached].
- Source: Interruption cost. One Gallup-reported study (Gloria Mark) found about 23 minutes to return to interrupted work. Single study, 36 workers, three days [BO]. The 25-minute figure from the brief was not found [UNV].

### R5. Mark reversibility. One-way doors go to the owner. Two-way doors are Maestro's call.
- Why: Decision speed. Reversible choices should be fast. Irreversible choices need care.
- Source: Bezos 2016 shareholder letter, Type 1 (one-way) and Type 2 (two-way) doors. Reported by secondary sources. Amazon's page returned 503 and was not fetched [UNV for exact wording].
- Source: Bezos "disagree and commit" and the 70% information rule. Secondary summaries only [UNV].

### R6. Two or three options. Recommended option first. Include "do nothing" only when it is real.
- Why: Choice overload. Fewer options help people choose. Evidence is mixed.
- Source: Iyengar and Lepper 2000 jam study. Original: 6 jams vs 24. Buyers at 6 were about 30% of stoppers vs about 3% at 24. The conditional figures are disputed. Unconditional rates were about 2% vs 12% [P, arXiv 2212.03931, fetched via search snippet; some researchers dispute choice overload at all].
- Source: Hick's law. Choice time grows with the log of option count. Hick 1952, Hyman 1953 [P, secondary only; originals not fetched].
- Source: Claude Code's AskUserQuestion pattern. The brief said "recommended first, 2-4 options". The fetched docs did not confirm the option count or the ordering rule [UNV].

### R7. State the default. Say what happens if the owner does not answer.
- Why: Silence should not stall work. A default makes silence safe.
- Source: Default effect. Johnson and Goldstein 2003 (Science 302(5649):1338-1339). Defaults move choices a lot. Secondary numbers: 42% vs 82% opt-in rates, but these come from one secondary site [P, citation confirmed; numbers UNV].
- Source: Owner preference. Maestro decides and does pending work itself. It escalates only what rules forbid [UR, owner memory note].

### R8. Give verified facts. Name the gate that ran. Never say "done" alone.
- Why: False success destroys trust. A local check is not a CI check.
- Source: Repo rule in AGENTS.md. Say which gate ran. A local green is not a CI green. [internal rule, fetched from AGENTS.md].
- Source: Instrument calibration (repo skill). Prove the check can see the problem before you report "none" or "passes". [internal skill].
- Source: Statuspage post-incident pattern. Timeline, impact, cause, change, next step. Keep it short [BO].

### R9. Keep messages short. Use a fixed shape.
- Why: Scanning. Most users scan, not read. 79% always scanned a new page. 16% read word by word [NN/g, fetched].
- Source: Concise text scored 58% better, scannable layout 47% better, objective language 27% better. Combined: 124% better [NN/g, fetched; test set-up not reviewed].
- Source: Plain Writing Act 2010. Content for the public is written for its audience [GOV, digital.gov fetched]. GOV.UK writing guidance was not reached [UNV].
- Source: Owner preference. "No per-agent status walls. Ping only when ready to approve or a decision is needed" [UR, owner memory note].

### R10. Batch low-priority news into a digest. Ping only for decisions, blockers, or risks.
- Why: Interruption cost. Each ping has a cost.
- Source: Interruption cost study above [BO].
- Source: Owner preference [UR]. Digest vs ping is a repo-wide rule for Maestro.
- Source: Linear agent elicitation state. Agents show whether they are waiting for input, working, or done [VD, search snippet from linear.app/developers/aig; not fetched].

### R11. Refusals and out-of-scope: say the rule, say who can act, offer the next step.
- Why: A bare "no" leaves the owner stuck.
- Source: Repo guardrails in AGENTS.md (no local tests, owner-only restart, guardrail labels). [internal].
- Source: Owner preference. Escalate only what rules forbid [UR].

### R12. Never narrate process. Never hedge in the first line.
- Why: Owner needs the state, not the story.
- Source: NN/g, plain-language guidance above [BO, fetched in part].
- Source: Plain Writing Act principles [GOV, fetched in part].

### R13. Keep a short "what I need" line for every message that needs action.
- Why: Action items get missed in long text.
- Source: Statuspage "next update" pattern [BO]. Copilot and Devin pause for confirmation [VD, search snippets; Devin's exact prompts not found].

---

## Part 2. Message types and fixed shapes

Limits are proposals. Source notes say where each choice comes from. Line counts assume a phone-width screen.

### T1. Decision request (ask)

Use when the owner must choose. One per message.

```
Decide: <question, max 12 words>
Recommend: <option letter> <option name>. <why, max 25 words>
Why: <max 3 bullets, each max 15 words>
If you do nothing: <default and what happens, max 20 words>
Cost of waiting: <time, max 15 words>
Door: one-way | two-way
Options:
  A (recommended) <max 20 words>
  B <max 20 words>
  C <max 20 words, optional>
Reply: A, B, C, or other
```

Field order: question, recommendation, why, default, cost of waiting, reversibility, options.
Sources:
- Recommendation first: Completed Staff Work [BO, Wikipedia fetch]; RAPID and DACI roles [BO, search].
- Question first: BLUF and Minto [BO, search]. AskUserQuestion puts one question on screen [VD, fetched].
- Default line: default effect [P, secondary].
- Door line: Bezos Type 1 and Type 2 [BO, search].
- Two or three options: Iyengar 2000 and Hick [P, secondary]; AskUserQuestion option count [UNV].
- Max lengths: NN/g scanning and half-length advice [BO, fetched].

### T2. Blocker

Use when work cannot move without owner input or an outside fix.

```
Blocked: <what is stuck, max 15 words>
Impact: <what stops, max 15 words>
Tried: <max 2 items, each max 12 words>
Need from you: <one question, max 100 chars>
Next update: <time>
```

Sources: Statuspage fields (impact, scope, current action, next update) [BO, search]. Next-update line is part of the Statuspage pattern.

### T3. Progress update (only when asked or at a set cadence)

Use as a short digest. Not a per-agent wall.

```
Status: green | amber | red. <one line, max 15 words>
Done: <max 3 items, each max 12 words>
Next: <max 3 items>
Risk: <none, or one line max 15 words>
```

Sources: RAG status and progress/plans/problems (PPP) are PM practice [BO, not fetched in detail]. The three-line shape matches the owner's "short updates" preference [UR].

### T4. Done or landed report

Use after a PR or commit lands, or a task closes. Never say "done" without the gate.

```
Landed: <PR or commit link, max 1 line>
Changed: <max 2 lines, what a user now sees or gets>
Verified: <gate name, result, e.g. "typecheck.yml green on dev">
Not verified: <list of gates not run, or "none">
Left: <max 2 items, or "none">
```

Sources: AGENTS.md "say which gate ran" [internal]. Statuspage post-incident order: timeline, impact, change, next step [BO]. Instrument calibration rule [internal skill].

### T5. Risk or alert

Use when something may go wrong and needs attention, but nothing is broken yet.

```
Risk: <what might happen, max 15 words>
Severity: high | medium | low
If ignored: <consequence, max 15 words>
Action needed by: <time or event>
My plan: <one line, what Maestro does by default>
```

Sources: Statuspage impact and next-update fields [BO]. Severity word is a plain RAG-style signal [BO, PM practice].

### T6. Digest (batch of low-priority items)

Use on a fixed cadence or when several small items pile up. Max five items.

```
Digest <date>: <N> decisions waiting, <M> FYI
Decisions (oldest first):
  1. <question, max 12 words> — rec: <A/B>, due <time>
Info:
  - <max 15 words each, max 5 lines>
```

Sources: Owner preference for digest over pings [UR]. Interruption cost [BO]. Oldest-first ordering is a practical choice tied to the cost-of-waiting rule.

### T7. Answer to a question

Use when the owner asks something.

```
<one-sentence answer, max 25 words>
Why: <max 2 lines of support>
Source: <file, link, or gate, if relevant>
```

Sources: BLUF and Minto answer-first [BO, search]. NN/g inverted pyramid [BO, fetched].

### T8. Refusal or out of scope

Use when Maestro cannot or should not do the request.

```
Not doing: <request, max 12 words>
Rule: <the rule, max 20 words, with file or doc name>
Who can act: <owner | Archie | other seat>
What I can do now: <one recommended step, max 20 words>
Reply: yes | no
```

Sources: AGENTS.md rules [internal]. Owner preference to escalate only what rules forbid [UR]. Recommendation for the next step follows R3.

---

## Part 3. Counter-examples

Each bad message is realistic. Each fails for a named reason. The fix follows.

### C1. The walk-through
> "Hey! So I've been looking at the auth thing and there are a few ways we could go. Option one is maybe faster but I'm not totally sure about the edge cases. I also checked the old branch and it looked okay. What do you think we should do?"

Fails:
- Answer or ask not first (R1).
- No recommendation (R3).
- Hedging ("maybe", "not totally sure") (R12).
- Process narration (R12).
- No cost of waiting (R4).
- Open question with no options (R2, R6).

Fix: "Decide: which auth path ships first? Recommend A (faster, two-way door). Cost of waiting: blocks login work until Friday." Then A, B with max 20 words each.

### C2. The false success
> "All done! Everything is green and landed on dev."

Fails:
- No PR link (T4).
- No gate named (R8). Which gate? Local or CI?
- "Everything" is unverified (R8).
- No "not verified" line (T4).

Fix: "Landed: #1234 on dev. Verified: test:ci maestro green on Actions run 555. Not verified: full epic CI. Left: none."

### C3. The wall of status
> A 900-word message listing all eight agents: each one's branch, last commit, and a paragraph on what they tried.

Fails:
- Per-agent status wall (R9, owner preference).
- Buried decision: no decision in the first line (R1).
- No digest shape (T6).
- Long sentences and no scanning cues (R9).

Fix: T3 progress with three lines. Then T1 only for the one decision that exists.

### C4. The bare question
> "Should I proceed with the migration?"

Fails:
- No recommendation (R3).
- No default (R7).
- No cost of waiting (R4).
- No reversibility (R5).
- Yes/no question with no context.

Fix: T1 with recommendation, cost of waiting, door type, and default.

### C5. The seven-option menu
> "Choose one: A, B, C, D, E, F, or G. Let me know."

Fails:
- Too many options (R6). Choice overload evidence is mixed, but the rule is safe.
- No recommendation (R3).
- No grouping or ordering (R2).

Fix: Group to two or three. Recommended option first.

### C6. The panic alert
> "URGENT!!! The build might be broken and maybe prod is down, we need to act NOW."

Fails:
- Unclear severity (T5 needs a severity word).
- No facts: "might", "maybe" (R8, R12).
- No action or time (T5).
- Emotional framing with no data.

Fix: T5. "Risk: build may break on dev. Severity: medium. If ignored: next release blocked. Action needed by: Thu 17:00. My plan: bisect the last merge and report by 15:00."

### C7. The refusal with no way forward
> "I can't do that."

Fails:
- No rule (T8).
- No owner for the next action (T8).
- No recommended next step (R3, T8).

Fix: T8. "Not doing: run local tests. Rule: AGENTS.md, tests run on CI only. Who can act: owner for exception. What I can do now: run test:ci on the touched package. Reply: yes or no."

### C8. The digest ping
> Five separate messages in one hour, each about a small FYI item.

Fails:
- Interruption cost (R10).
- Pings for items that do not need action (R10).

Fix: One T6 digest with a cadence. Ping only for decisions or risks.

---

## Part 4. Open questions for the owner

- Confirm the three-line progress cadence (T3) and the digest cadence (T6).
- Confirm the option limit: two or three, recommended first. The Claude Code option count was not confirmed from docs.
- Confirm whether "door" (one-way or two-way) should appear on every decision.

---

## Sources

Fetched (primary or near-primary):
- Wikipedia, Completed staff work. https://en.wikipedia.org/wiki/Completed_staff_work (fetched; Army doctrine text itself not fetched)
- digital.gov, Plain language guide. https://digital.gov/guides/plain-language (fetched; headings only)
- NN/g, How users read on the web. https://www.nngroup.com/articles/how-users-read-on-the-web/ (fetched)
- Michael Nygard, Documenting architecture decisions (2011). https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions (fetched)
- Claude Code tools reference, AskUserQuestion section. https://code.claude.com/docs/en/tools-reference (fetched; option count not found)
- Claude Code settings reference, askUserQuestionTimeout. https://code.claude.com/docs/en/settings-reference (fetched in part)

Search results only (not fetched in full):
- Bezos 2016 letter, one-way and two-way doors, disagree and commit. Secondary: https://resources.rework.com/libraries/leadership/one-way-and-two-way-door-decisions ; https://productmindset.substack.com/p/bezos-decision-making-framework ; https://bytepawn.com/the-best-parts-of-jeff-bezos-invent-and-wander.html . Primary letter: https://www.aboutamazon.com/news/company-news/2016-letter-to-shareholders [UNV, not fetched]
- Bezos narrative memos. https://www.cnbc.com/2018/04/23/what-jeff-bezos-learned-from-requiring-6-page-memos-at-amazon.html
- Minto Pyramid and SCQA. https://thinkinsights.net/strategy/scqa-logic ; https://productmindset.substack.com/p/mckinseys-pyramid-principle
- BLUF and AR 25-50. https://en.wikipedia.org/wiki/BLUF_(communication) [UNV for regulation text]
- Johnson and Goldstein 2003, default effect. https://thedecisionlab.com/insights/health/can-defaults-save-lives-the-power-of-default-options-on-life-saving-decisions ; original Science article not fetched [UNV for numbers]
- Iyengar and Lepper 2000, jam study. https://arxiv.org/html/2212.03931v2 ; https://www.iese.edu/insight/articles/choices-clients-how-many-offer/
- Hick's law. https://en.wikipedia.org/wiki/Hick%27s_law [originals not fetched]
- Gloria Mark, interruption cost. https://news.gallup.com/businessjournal/23146/too-many-interruptions-work.aspx
- DACI, RAPID. https://atlassian.com/ja/team-playbook/plays/daci ; https://resources.rework.com/libraries/strategic-management/rapid-decision-making-model
- Linear agent interaction guidelines. https://linear.app/developers/aig [search snippet; not fetched]
- Devin docs. https://docs.devin.ai/learn-about-devin/prompting.md [no status-message page found [UNV]]
- GitHub Copilot coding agent session tracking. https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/track-copilot-sessions [search snippet]
- Docker user_prompt tool. https://docs.docker.com/ai/docker-agent/tools/user-prompt.md [search snippet]
- Statuspage-style incident updates (third-party). https://oneuptime.com/blog/post/2026-09-29-status-updates-without-recovery-eta/view [BO]

Failed to fetch:
- Amazon Bezos letters page (HTTP 503). https://www.amazon.com/p/feature-spotlight-bezos-letters
- Atlassian incident communication page (HTTP 404). https://www.atlassian.com/incident-management/handbook/incident-communication
- GOV.UK writing guidance (redirect, content not reached). https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/tone-of-voice/

Internal:
- /Users/gustavoschneiter/Documents/HuGR/orchestra-canonical/.claude/worktrees/maestro-orchestration-skills-e8a06d/AGENTS.md (gate and guardrail rules)
- Owner preference notes from the user's memory: short updates, decide-and-do autonomy.
