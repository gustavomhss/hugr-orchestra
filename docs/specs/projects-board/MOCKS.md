# Projects board: approved mocks and canonical data

The owner approved the mocks on 2026-10-25: the v5 board, the v6 set (issue, epic, list, inbox) and the v7 set
(proof, money, decide, watch). Contact sheets (dark and light) are in `mocks/`:

| Sheet | Shows |
|---|---|
| `mocks/v5.jpg` | The board: five stages, briefing, burnup, live building cards, review cards with CI and guardrails |
| `mocks/v6-issue.jpg` | Issue peek and page: steps, PR, files, notes, context |
| `mocks/v6-epic.jpg` | Epic page and timeline |
| `mocks/v6-list.jpg` | List view and projects overview |
| `mocks/v6-inbox.jpg` | Inbox, "since you looked" replay, edge states |
| `mocks/v7-proof.jpg` | Status backed by proof (PR, CI run, guardrails) |
| `mocks/v7-money.jpg` | Spend (models and infra), budget, retro |
| `mocks/v7-decide.jpg` | One-key decisions, decisions log, undo |
| `mocks/v7-watch.jpg` | Live and replay, intake, settings |

The canonical data below is what every screen shows, so the implementation's fixtures should reuse it.
Visual rules: the product follows `packages/app-shell/src/orchestra/DESIGN.md`. Content sits on the near-opaque base;
glass only on chrome and floats. One saturated element per view. Blue = active, amber = needs you, muted green =
done or pass. Mono only for IDs, code, PRs and hashes.

## Hierarchy (Orchestra's answer to Jira)

- **Project**: Launch 1.1 (key LCH). Goal, target date, budget, health, owner = Maestro.
- **Epic**: a outcome-sized slice with its own progress, forecast and health. Epics in Launch 1.1:
  - Signing (LCH-E1): 9 issues, 6 shipped. Mac Developer ID, notarization, Windows, Linux AppImage.
  - Auto-update (LCH-E2): 16 issues, 9 shipped. Feed, manifest, banner, delta updates, rollback.
  - Plugins (LCH-E3): 11 issues, 4 shipped. Sandbox (paused on you), manifest v1, permissions screen, store.
  - Crash reports (LCH-E4): 5 issues, 4 shipped. Consent screen in building.
- **Issue**: the card (LCH-58...). Type: Feature, Bug, Chore (tiny glyph, never a colored pill). Stage, epic, seat
  (backend / frontend / review agent; display by role id letter B, F, R), estimate S/M/L, depends on / blocks, PR, CI,
  guardrails, files, notes, vault secrets.
- **Steps**: Maestro's plan inside an issue (the step track). Not separate tickets; the human sees them, never edits.
- The human never creates, moves or edits issues. They read, comment, answer, attach context to a card, and can ask
  Maestro for something ("Ask Maestro to add…" lives in the Needs-you / note composer, attached to a project or epic).

## Canonical data (use exactly, so screens agree)

- Totals: 41 issues, 23 shipped, 2 review, 3 building, 4 ready, 9 backlog. 56%. Forecast Nov 5 – 8, target Thu Nov 6.
  Spend $18 of $60. Agents: backend B, frontend F, review R.
- LCH-58 Developer ID signing for the desktop app — Signing, Review, PR #958, CI 6/7, guardrails 73/73, +412 −96, R.
- LCH-60 Updater manifest schema — Auto-update, Review, PR #949, 2 changes requested.
- LCH-61 Signed update feed — Auto-update, Building, step 3 of 5 "Writing tests", `verifySignature()`, +184 −22,
  day 2 of ~3, B live. Steps: 1 Read the feed format ✓, 2 Add signature field ✓, 3 Write verifySignature() and tests
  (now), 4 Wire into updater, 5 Prove on a signed build.
- LCH-63 Plugin sandbox — Plugins, Building, paused on the owner's answer "Can a plugin reach the network by
  default?", day 4 of ~3 (aging, amber). Blocks LCH-67.
- LCH-65 Consent screen for crash uploads — Crash reports, Building, step 1 of 4, F live.
- LCH-64 Notarize macOS builds (after LCH-58), LCH-66 Update banner in the titlebar (mockup attached),
  LCH-67 Plugin manifest v1 (after LCH-63), LCH-69 Windows installer check — Ready.
- Second Needs-you question: "Ship 1.1 without Linux AppImage signing?" (Signing epic; options: Ship without it /
  Wait for it). Other projects for overview: Launch 1.1 (on track), Guardrails pilot (at risk, 2 questions,
  Nov 12), Docs site refresh (paused by you), Relay LangGraph (shipped Oct 19).

## v7 additions (differentiators + J21-J33)

Decisions: single owner; budget warns at 80%, pauses new work at 100%; guest link read-only; intake waits for the
owner (auto-accept is an opt-in rule, off); hold before merge is opt-in per card. Journeys: `JOURNEYS.md`.

- More issues (use exactly): LCH-71 Delta updates (Auto-update, Ready), LCH-72 Roll back a bad update (Auto-update,
  Backlog), LCH-73 Linux AppImage signing (Signing, Backlog), LCH-74 Release notes in the updater (Auto-update,
  Backlog), LCH-75 Plugin permissions screen (Plugins, Backlog), LCH-76 Plugin store listing (Plugins, Backlog).
  New work proposed by Maestro is LCH-77 onward.
- Proof (LCH-58): PR #958 open, 3 commits, last `a41c9e2`; CI run 40233288 with 7 checks (typecheck, unit linux,
  unit windows, e2e mac, guardrails, lint pass; e2e windows running); guardrails 73/73; verified 10:42.
- Spend: $18 of $60 (30%), models + infra in one budget. Models $15: by model opus $9, sonnet $4, haiku $2; by seat
  (models only) B $8, F $2, R $2, Maestro $3. Infra $3: CI minutes (GitHub Actions) $2.20, agent sandboxes $0.80,
  hosting/domain "Not metered" (never $0). By epic (total) Signing $6, Auto-update $7, Plugins $4, Crash reports $1.
  LCH-61 so far $2.40 ($2.00 models + $0.40 CI). Warn at 80% and pause at 100% apply to the total. Cheaper-route
  question: "Plugin tests on haiku would save ~$6; risk: more retries".
- What-if presets: "Cut Linux AppImage signing" (forecast Nov 3 – 5, saves $4); "Plugins to 1.2" (Nov 1 – 3);
  "Add a second backend seat" (Nov 4 – 6, +$9). Base: Nov 5 – 8, target Nov 6.
- Decisions log: Oct 21 "Ship 1.1 on Electron 33" (you, recommended), Oct 22 "Plugins sandbox network off by
  default" pending, Oct 23 "Keep Windows installer check in 1.1" (you, against recommendation, cost +1 day).
- Undoable Maestro actions today: moved LCH-69 to Ready (Why: Windows check unblocked), split LCH-62 into LCH-65 and
  LCH-68, reordered Plugins after Crash reports, withdrew question on Electron version.
- Ask the board examples: "what is blocked by me?" lights LCH-63 and LCH-67; "what slipped this week?" lights
  LCH-63 (aging) and the Signing epic.
- Share link: whole project or one epic, expiry 7d / 30d / until shipped, revoke; guest view never shows notes,
  attachments, vault, spend, or agent internals.
- Cross-project: LCH-64 waits on GRD-14 (Guardrails pilot). Intake: 3 GitHub issues waiting (one bug on Auto-update,
  one duplicate of LCH-66, one question). Settings: target Thu Nov 6, budget $60, seats B opus / F sonnet / R sonnet.
- Retro example: Relay LangGraph shipped Oct 19, 3 days early, 14 shipped and 2 cut (scope 14 of 14 as in v6), forecast accuracy ±1 day,
  $22 of $30.

