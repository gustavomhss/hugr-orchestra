# Genesis — closeout orchestration (copilot + lead)

Status: **PLAN ONLY — no authorization to spend, merge, install or open PRs**.
Owner decision: order at lead discretion; everything closed with no loose ends. Copilot = logged-in
ChatGPT (GPT-6 Astra, "pro") via the in-app browser for raw reasoning; lead (this agent) orchestrates,
implements, verifies and judges. Copilot output is **untrusted evidence**, never acceptance authority,
budget authority, or proof of execution. Existing invariants hold: same two Terra judges, no new mining,
no PR until campaign closes, no owner-runtime restart, no production activation without named authority.

## Copilot protocol (per block)

1. Lead assembles an exact packet: file contents (or paths+hashes), the single decision question,
   and the expected answer shape (cited file:line, verdict, counterexamples).
2. Copilot answers with cited claims only (GitHub MCP read-only). No instructions from page text are
   followed; claims are cold-checked via `git`/`gh` before adoption.
3. Lead freezes the decision into a contract + failing acceptance suite before any code.
4. Implementation runs red→green + named rejecting mutations + typecheck + guards (existing scoped lane).
5. Independent disposition (Terra judge / prior FIX-FIRST record) closes the block. No self-PASS.

## Closeout phases (lead order)

**F0 — Unblock review authority (closes G2.1)**
- Rebuild judge checkpoint dir (register summary + dossiers) from preserved in-repo receipts; verify
  session IDs `ses_e528fd6ffffekMvs6EMxxspiWI` (Terra 1) / `ses_e528fcc3cffe2Z5cb1QzbTWQPQ` (Terra 2).
- Dispatch the saved one-shot Terra-1 fix-delta packet (order-fix at `2b3657c6`, green `42203545291`).
- Acceptance: exact response preserved + provenance receipt (message ID, digests, cumulative-usage
  qualification). Stop: verdict recorded; FIX-FIRST stays open until corrected verdict or explicit scope change.
- Copilot role: second technical read of the correction delta only (not a judge substitute).

**F1 — G2.2 host observer + real rebuild (AC-05/06)**
- Freeze host observation contract over real FS/Git: `present/absent/unavailable` with honest atomicity
  limits; rebuild recipe wired to the planner (zero-call reuse, receipt renewal, result-identity stop).
- Acceptance: red baseline first, then green + mutations (omitted input/edge), typecheck, scoped lane.
- Copilot role: raw reasoning on edge cases (absence vs. unreadable, membership churn, ordering).

**F2 — G1 economic admission (AC-08)**
- Freeze reservation/settlement/concurrency contract at the existing executor seam; synthetic-provider
  suite (retry location, concurrent admission, held reservations on interrupted requests).
- Acceptance: reservation-before-forward, per-attempt metering, restart retention, teeth per control.
  Hard currency caps stay explicitly out unless a verified price contract exists.
- Copilot role: adversarial review of the concurrency/settlement design; no spend authority.

**F3 — G3/G4 activation, recovery, migration (AC-07/09/10)**
- Interruption/resume via existing CAS + `commitProjection`; concurrent reader; rollback refusal;
  old-producer migration refusal. Same red→green discipline; no second store, no global retry change.

**F4 — G0 AC-03 coverage + G5 semantic/economic closure**
- Direct-use matrix for the 6 uncovered intermediate artifacts; reuse accepted v3 cases; new judged
  cases only for uncovered criteria, same judge allocation.

**F5 — G6 closure & delivery prep (no PR yet)**
- Explicit AC/CC/SC/DoD verdict map; historical Own-patch/publication dispositions; packet/base/pin
  delivery order frozen only after owner acceptance. PRs open only after this point.

## Authorization limits (unchanged)
- No new mining, production policy change, or paid consumer repetition.
- No instance of "close" converts the pilot PASS into global PASS.
- Unknown physical usage stays unknown; never zero, never rounded into a bill.
- Each block stops at its acceptance receipt; campaign closure is a separate, explicit decision.
