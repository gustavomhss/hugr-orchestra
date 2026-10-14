# Actions implementation — active

Owner instructed execution on 2026-10-12. Planning/approval source remains in
`/Users/gustavoschneiter/Documents/HuGR/_worktrees/actions-campaign/specs/actions`.

W0 baseline: `fork/dev` `e8319438e5cfb7a8039915ce6e8c2cf6ef390f6d`, tree
`dabd6316bbe10134cc6f5ea6749ac096a3a06da1`. Implementation worktree:
`/Users/gustavoschneiter/Documents/HuGR/_worktrees/actions-runtime`, branch
`actions-runtime`. Frozen-lockfile installation completed; source instructions read.

Lead owns shared Schema facade/root exports, Core facade/Location registration,
Protocol API/Server handler assembly, client contract/generation, App route/i18n
assembly and SQL/migration integration. Other sessions remain independent.

W1 wire schemas exist under `packages/schema/src/actions/**`. Schema and initial
Core scaffold typechecks completed. Admission now uses explicit non-sensitive
target/precondition DTOs instead of arbitrary persisted JSON. Binding resolution
and GitLab multipart upload are explicit transport seams.

W1 foundations are integrated byte-exact from isolated writers and independently
reviewed. Binding fixes include sanitized Git environment, exact POSIX path output
and optimistic policy revisions. Operations use typed safe acknowledgements,
read-only reconciliation and bounded non-executable admission tombstones. Client
captures submitted identity/body/config before awaits and preserves raw streams.

GitLab transport uses credential-safe scoped HTTPS per `W1-HTTP-DECISION.md`;
local CLI configuration supplies request-memory-only authentication. Explicit TLS,
manual redirects, actor checks and pull-independent shutdown are implemented.
Post-send TLS errors remain outcome unknown. GitHub retains qualified CLI transport.

Generated SQLite migration: `20261012115744_actions-operation`. Operation fixtures
no longer construct fallback tables; integrated run `38252950210` exercised the
production Database migration: 29 tests pass on Linux and Windows. Migration check
and Schema/Core/Protocol/Client typechecks completed. JSON clients regenerated.

W1 review/evidence:
- Binding APPROVE: `38215728565` (Linux17, Windows15 plus two named POSIX skips).
- Operations APPROVE: `38214880315`, `38210909375`, `38211669826`; integrated above.
- Raw Client APPROVE: `38213149427`; earlier downloads `38207523705`.
- Transport APPROVE: `38245206834` plus final TLS-disposition `38248960760`.
Each protection has an observed red/restored-green mutation in its review card.

Read/admission/graph API assembly is complete and independently reviewed. Server,
Core, Protocol, Schema and Client typechecks pass; JSON clients regenerated. Real
four-group HTTP qualification `38422976687` passed eight unfiltered tests per OS,
including Location/auth/revision/native nullable-source/readback behavior. Core
facade/readback qualification `38391576019` passed35 per OS. Both have observed
meaningful mutation failures and independently verified source/snapshot readbacks.

GitHub/GitLab native execution command modules are integrated after cold review:
GH `38424841106` (guarded dispatch) plus `38406651884`; GL `38425873127` (30 per OS).
Schemas preserve provider-specific retry/play/erase/MR/trigger semantics. Public
workflow/run/job/pipeline command routes now call durable Operations.execute;
only safe acknowledgement enters storage, transient one-time output remains
owner-request-only. Command HTTP lifetime/replay qualification is active next.
Empty documented201/202/204 acknowledgements qualified in `38403587519` (16 per OS).

Resource management, authoring, signed raw transfers and production UI remain OPEN.
No live-provider mutation, browser,
macOS or native Node compatibility is inferred from Bun CI fixture evidence.

W2 read/source worktrees created at the W0 baseline: `actions-github-read`,
`actions-gitlab-read`, `actions-source-code`, plus `actions-qualification` for cursor/
migration integration tests. Frozen read contracts: `W2-READ-BRIEF.md` and Core
`ActionsCursor`. Node-safe structural parser dependency `yaml@2.8.2` added to Core
and bun.lock; distributed dependency/source qualification remains final-candidate work.
No Session/Task/Claude-host runtime writer is claimed by this front.

All ACT implementation items remain OPEN until appropriate source-bound checks.
No source test suite is run locally; focal tests use test:ci and heavy CI waits
for the integrated campaign. Handwritten files remain under 400 LOC.
