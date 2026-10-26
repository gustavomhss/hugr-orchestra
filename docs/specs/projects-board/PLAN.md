# Projects board: build plan

Source of truth: approved mocks (`MOCKS.md`, `mocks/`), `JOURNEYS.md` (J1-J33, X1-X6) and the contract in `CONTRACT.md`.
Goal: ship the board in thin slices, each one usable on its own. Nothing gets built before a slice needs it.

## 1. What the mocks do not cover (gaps found before code)

1. **Maestro's write path.** The mocks show only the human side. Maestro needs a small tool set to keep the board:
   - create or update an issue
   - move it between stages
   - record steps
   - ask a question
   - link a PR
   Every write carries a reason, and Maestro writes through nothing else. The board is empty without this.
2. **Where the data lives.** Nothing exists today: no Project, Epic, Issue or Step store, and no undo log. Proposal:
   - Store everything locally in core SQLite, as an append-only activity log plus current-state tables. Undo is the inverse entry in that log.
   - The local store holds the plan and steps. GitHub Issues is a native two-way mirror of the cards (gap 7).
3. **Name clash.** "Project" already means a git repo in code (`ProjectTable`, `/api/project`, every session's `projectID`). Home also has a "Projects" list of repos.
   - Proposal: chapter id `board` and code namespace `Board` (`Board.Project`, `Board.Epic`, `Board.Issue`). The UI label stays "Projects".
   - Home's repo list gets renamed to "Repositories", one i18n key.
4. **CI checks are not read anywhere.** There are PR basics (`core/src/pull-request.ts`) but no check runs. The fix is to add the `gh` status checks to the PR read.
5. **Infra metering.**
   - Model cost already exists per session and message.
   - CI minutes can come from GitHub Actions run durations.
   - Sandboxes and hosting have no source, so they show "Not metered" (already designed, J13-F2).
   - No billing integration in v1.
6. **No comment model, no attachment store, no vault.**
   - Notes are a new small table.
   - Attachments reuse the prompt file-attachment shape.
   - Secrets on a card go into the existing `CredentialTable` (encrypted, value never shown). No new vault.
7. **Native GitHub Issues (owner, 2026-10-25).** Reuse what PRs already do: `core/src/pull-request.ts` talks to GitHub through the signed-in `gh` CLI with GraphQL and already detects signed-out. No new auth and no OAuth app.
   - **Out, board to GitHub:** each card gets a GitHub issue in its repo.
     - Title and body mirror the card. The body carries the steps and a link back to the board.
     - Stage and type are labels (`stage:building`, `type:bug`). The epic is a milestone.
     - Closing follows Shipped.
     - Maestro writes; the human never edits the issue through the board.
   - **In, GitHub to board:**
     - A new issue opened by someone lands in intake and waits for the owner (J31, decision 4).
     - A comment on a mirrored issue becomes a note on the card that Maestro reads.
     - An issue closed or reopened on GitHub raises a question to Maestro and is never applied silently.
   - **Conflicts:** the board wins for stage and steps, and GitHub wins for comments. Every overwrite shows in the activity log with its reason and can be undone.
   - **Transport:** poll with `gh api` (`since` plus ETag) every minute while the app is open. No webhooks, because webhooks would need a public endpoint.
   - **Linked repo:** each board project names one repo. The Home repo list supplies it.
   - **Status not shown as fact:** signed-out or rate-limited shows "GitHub not synced" with a retry action, never stale data presented as current.
   - **Not in v1:** GitHub Projects (v2 boards) sync, assignees, reactions.
8. **Git lives on the card, not in its own screen (owner asked, 2026-10-25).** Agents commit, push, open PRs and merge. The human does none of these from the board, so the board shows the git trail per card as proof:
   - branch, commit list (hash, message, seat), PR with CI and review state, merge commit
   - the only git control is the opt-in "hold before merge" per card
   A standalone Git screen (repo history, branches, manual commits) is a different job, for a human working by hand. It is out of this plan.
9. **Guest share link** needs a public host that serves a read-only page. Nothing like that exists. Deferred (see section 4).

## 2. Slices (each is one PR to `dev`, chapter behind the existing WIP mark until slice C)

| Slice | Delivers | Journeys |
|---|---|---|
| A. Spec in repo | Mocks, JOURNEYS, SPEC and this plan go into `docs/specs/projects-board/`, plus the data model and Maestro tools spec. Docs only. | — |
| B. Store + API + Maestro tools | `packages/schema` Board types, core service and tables, protocol group, server handler, `bun run generate`, and Maestro tools that write with a reason. No UI. | J9, J17 (Maestro side) |
| B2. GitHub Issues | Two-way mirror and intake over `gh` (gap 7): out-sync, comment-in as notes, new issues to intake, sync state on the card and in settings. | J31, J18 (open on GitHub) |
| C. Board + peek | v5 board and the v6 issue peek and page, on real data with live updates over `/api/event`. PR state, CI checks, guardrails on cards. Git per card, read-only: branch, commits, PR, merge state. | J1, J2, J3, J18, J33 |
| D. Human writes | Answer Needs-you with one key, note on a card, attach a file or secret to a card, undo a Maestro action, pause and resume. | J4-J7, J16, J27, J28, J30 |
| E. Views | Epic and timeline, list and projects overview, inbox, "since you looked" replay. | J8, J10, J14, J23, J24 |
| F. Proof + spend + decisions | Proof panel, spend (models from session cost, CI minutes from Actions), budget warn at 80% and pause at 100%, decisions log. | J11 (base only), J13, J19, J20, J22 |

**Recommended first cut: A, B, B2, C, D.** It is the whole board contract: Maestro maintains, the human watches, answers and undoes. E and F follow once the owner has used it on a real project.

## 3. How it gets built

- **Branches:** each slice is its own short branch from the latest `dev` (`board-spec`, `board-store`, `board-github`, `board-ui`, `board-writes`) and its own PR.
- **Contract first:** slice B freezes the schema and API. After that, the UI (C) and the Maestro tools can run in parallel against the frozen contract.
- **Gates:** typecheck through the `typecheck.yml` dispatch, and change-scoped `bun run test:ci` on touched files. Nothing heavy runs on the Mac. The full epic runs once, after the last slice of the cut.
- **Visual check:** the isolated dev app in dark and light at 2×, compared against the approved mock shots before each UI PR.
- **i18n:** English copy plus the locales the parity test requires (pt-BR goes through the same route as guardrails).

## 4. Deliberately left out of v1 (no over-engineering)

- Guest share link (J15): needs a public host.
- What-if presets beyond the base forecast (J11).
- Ask the board (J12).
- Notifications outside the app (J25).
- Two-device sync (X4) and export (X5).
- Narrow-window layout (X2): the desktop window minimum is enforced instead.
- Teams and multiple owners (J4-F2).
- GitHub Projects (v2 boards) sync. Issues are in v1.
- Billing APIs for infra.

Each of these stays specified in JOURNEYS and can be added later without a data migration.

## 5. Owner decisions (2026-10-25)

The owner approved this plan: "Plano aprovado: git no card, GitHub Issues, recomendações."

1. First cut is A, B, B2, C, D. E and F follow after real use.
2. Code namespace `Board`, chapter id `board`, UI label "Projects". Home's repo list becomes "Repositories".
3. The local store is the source of truth, with a two-way GitHub Issues mirror.
4. Git shows read-only on the card. No Git screen.
