# Product Design — the AUTHORING surface (Define · Frame · Structure · Ratify)

> The **design-side** machine ([`method/product-design.md`](../method/product-design.md)) run over the new
> authoring surface. Sibling of [`product-definition.md`](./product-definition.md) /
> [`product-framing.md`](./product-framing.md) / [`structure.md`](./structure.md) — those cover the CORE
> product; this covers the surface added on top of it.
>
> **Phase order:** Define → **Surface** ([`authoring-surface-study.md`](./authoring-surface-study.md), the
> `/functional-surface` L0–L3 catalog) → Frame → Structure → Ratify.
> **Ratify emits** [`requirements/invariant-register-authoring.md`](../requirements/invariant-register-authoring.md),
> which decomposition state **S0** consumes.
>
> **Greenfield, not brownfield.** Unlike the adapters ring (lifted verbatim from a frozen
> `reference/atlas-adapters.md`), this surface does not exist yet. So the normative clauses are **authored
> here and in [`reference/atlas-authoring.md`](../reference/atlas-authoring.md)** first; only then are they
> lifted into INVs. The one anti-arbitrariness rule holds throughout: **every decision cites an outcome
> statement, a job-map step, or a risk it retires.**

---

## 1. DEFINE — the job, the pain, the outcomes

### 1.1 The job map (Bettencourt & Ulwick) — where authoring pain concentrates

The actor is _whoever knows something true about this codebase_ — a human tech lead or an agent seat.

| step        | what it means for authoring                 | pain today                                                                                           |
| ----------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Define      | decide a fact is worth recording            | none — this is human judgment                                                                        |
| Locate      | find the code the fact is about             | none — the author already knows                                                                      |
| **Prepare** | **assemble a citable, valid fact payload**  | **total** — requires computing a `subtreeHash` and a `nodeKey` by running Atlas's own indexer        |
| **Confirm** | **know it will be accepted before writing** | **total** — no dry-run; failure surfaces as `Cannot read properties of undefined (reading 'length')` |
| Execute     | persist it                                  | ✅ `atlas emit` works                                                                                |
| Monitor     | see it went in / read it back               | ⚠️ the receipt is a `contentHash`; the read doors take a `nodeKey` (F4)                              |
| **Modify**  | reword · retire · re-ground                 | ⚠️ re-ground has a plan door; reword/retire are blocked behind Prepare                               |
| Conclude    | trust it stays true                         | ✅ drift + watermark + reconcile all work                                                            |

**The pain is Prepare and Confirm.** Both ends of the loop are built; the middle is missing. Evidence:
the 2026-07-25 `corelink-runners` dogfood (see `atlas-dogfood-findings`) and the self-description of
`packages/e2e-blackbox/test/author.ts` — _"the stand-in for the authoring tool a real user would reach
for"_, which does not exist.

### 1.2 Outcome statements (= the FRs; measurable, per the ratification-gate grammar)

| id        | outcome statement                                                                | metric (instrumented, not surveyed)                                                                                        |
| --------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **FR-A1** | Minimize the knowledge required to name a citable anchor                         | an author holding **zero** knowledge of Atlas internals obtains a valid `qualifiedPath` + `subtreeHash` in **one** command |
| **FR-A2** | Minimize rejections caused by _mechanical_ (non-semantic) payload defects        | rejections attributable to a hand-computed field == **0**                                                                  |
| **FR-A3** | Minimize time-to-diagnosis of a refusal                                          | every refusal names the **gate** and a **remedy**; raw runtime errors surfaced to a user == **0**                          |
| **FR-A4** | Preserve the write governance exactly as ratified                                | `GOVERNANCE_SURFACE` == 5 ∧ `WRITE_PATHS` == `{atlas-emit, atlas-link}` — unchanged, CI-pinned                             |
| **FR-A5** | Transport parity: every authoring door is reachable identically from CLI and MCP | Verdict divergence across transports for identical input == **0**                                                          |
| **FR-A6** | A draft authored now must still be acceptable when emitted                       | draft@R → emit `--at R` on an unchanged repo ⇒ grounding rejections == **0**                                               |

**Ranked by instrumentation, not opinion:** FR-A1/A2/A6 are the blocking set (without them authoring is
impossible, which the dogfood measured at 0 facts authored). FR-A3/A5 are amplifiers. FR-A4 is a
**constraint**, not a goal — it may never be traded.

---

## 2. FRAME — the bet, the four risks, appetite, non-goals

### 2.1 The bet

> Atlas's thesis is _grounded shared knowledge_. Grounding is enforced by re-derivation, which makes the
> grounding **expensive to produce by hand and trivial to produce mechanically**. The bet is that the
> product's missing half is not more governance but a **mechanical author's aid** — and that it can be
> added with **zero** new write authority.

### 2.2 The four risks (Cagan) — written, not asserted

| risk                             | the question                                                | verdict + evidence                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Value**                        | will anyone author facts by hand, rather than mining them?  | **Yes, necessarily.** `atlas mine` is model-gated and abstains by design (`cli/src/mine.ts:MINE_ABSTAIN_LINE`). A governed knowledge product whose only possible author is an unwired model holds **zero** human ground truth — which is exactly the dogfood result. Human authoring is not an alternative to mining; it is the floor mining sits on. |
| **Usability** (agent-ergonomics) | is it drivable from a tool schema + one page?               | The chain is four calls, each output feeding the next input: `anchors` → `draft` → `check` → `emit`. Risk: `draft` carries many flags. Mitigation: every non-claim field is either computed or defaulted; the author supplies **anchor + slot + claim**.                                                                                              |
| **Feasibility**                  | can the grounding actually be computed outside the gate?    | **Already proven.** `author.ts` does it today with `build(foldAstUnits(walkFileTree(repo)), …)`. The residual risk is not _can it_ but _will it stay in agreement_ → retired by **INV-AUTH-1** (one computer, one seam).                                                                                                                              |
| **Viability**                    | is +4 doors × 2 transports within the maintenance appetite? | They are **read-only planners over seams that already exist**: 0 new persistence, 0 new governance, 0 new grammar. The precedent (`doctor reground`) is already maintained.                                                                                                                                                                           |

### 2.3 Appetite

**One campaign (CAMPAIGN-10).** Anything that would require a new write door, a new persisted state, or a
new language grammar is **out of appetite** and is deferred explicitly below.

> _Corrected after S4._ This section first estimated "eight WPs". The mechanical slice — one WP per
> (epic × module), per the S4 rule — produced **16 WPs across 6 leaf epics**
> ([`wp-campaign-10.md`](../requirements/work-packages/wp-campaign-10.md)). The estimate was made before
> the epics were cut and is recorded here rather than quietly overwritten. The _appetite_ (one campaign, no
> new write door, no new persisted state, no new grammar) is unchanged; only the count was wrong.

### 2.4 Non-goals (explicit — each one retires a scope risk)

| non-goal                               | why                                                                                                                                                                  | where it is tracked                                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A third write door                     | would re-open INV-TOOLS-1, ratified twice (ADR-0003)                                                                                                                 | D2 — **RESOLVED without one**: `sameAs` retraction shipped as a MODE of `atlas-link` (task #83), so the write surface is unchanged |
| A persisted staging / review queue     | the persisted CANDIDATE store already exists (`commitStaging`, driven by `atlas mine`); what is absent is the governed PROMOTION path out of it, and that is a write | D3 — owner-gated; measured in task #83, prose narrowed, door still to build                                                        |
| New tree-sitter grammars               | symbol anchoring stays TypeScript-only                                                                                                                               | **INV-AUTH-4** makes the hole honest instead of hiding it                                                                          |
| Replacing `atlas mine`                 | mining stays the automatic path; authoring is the manual floor                                                                                                       | —                                                                                                                                  |
| Batch import (G15) / policy-show (G16) | below the appetite line for v1                                                                                                                                       | roadmap `Later`                                                                                                                    |

---

## 3. STRUCTURE — FR → DP and the coupling matrix

> Protocol: [`axiomatic-design`](../../.claude/skills/axiomatic-design/SKILL.md). `X` = this DP is the
> primary mechanism for this FR; `o` = this DP must _not_ disturb this FR (a constraint edge).

### 3.1 Design parameters

| id       | design parameter                                                                                       | cites               |
| -------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| **DP-1** | `anchors` — the index-unit lister (`qualifiedPath` · kind · `subtreeHash`)                             | FR-A1               |
| **DP-2** | `slots` — the closed 13-member vocabulary lister                                                       | FR-A2               |
| **DP-3** | `draft` — the payload composer (mints identity, computes grounding, stamps the rev, reports the route) | FR-A2, FR-A6        |
| **DP-4** | `check` — the dry-run gate evaluator                                                                   | FR-A3               |
| **DP-5** | **the ONE grounding computer** — a single seam shared by the planners and the truth-gate               | FR-A1, FR-A2, FR-A6 |
| **DP-6** | `READ_SURFACE` — a second advertised, structurally write-free MCP tool set                             | FR-A4, FR-A5        |
| **DP-7** | `help` + published schemas                                                                             | FR-A3, FR-A5        |

### 3.2 The design matrix

|                                    | DP-1  | DP-2  | DP-3  | DP-4  | DP-5  | DP-6  | DP-7  |
| ---------------------------------- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| **FR-A1** anchor discovery         | **X** |       |       |       | **X** |       |       |
| **FR-A2** no mechanical rejections |       | **X** | **X** |       | **X** |       |       |
| **FR-A3** legible refusal          |       |       |       | **X** |       |       | **X** |
| **FR-A4** governance preserved     | `o`   | `o`   | `o`   | `o`   |       | **X** |       |
| **FR-A5** transport parity         |       |       |       |       |       | **X** | **X** |
| **FR-A6** draft survives to emit   |       |       | **X** |       | **X** |       |       |

### 3.3 Coupling found — and how it is resolved

**Coupling C1 — DP-5 spans FR-A1, FR-A2, FR-A6.** The grounding computer is off-diagonal in three rows.
This is **real coupling**, not a modelling artifact: if the computer changes, three outcomes move at once.

> **Resolution: sequence, do not decouple.** The matrix is made **triangular** by building DP-5 first and
> freezing it as a seam the other DPs consume. That is `WP-AUTH-0`, and it is why nothing else may start
> before it. Attempting to decouple (two computers) would produce exactly the drift the product exists to
> detect. This coupling is therefore **accepted and ordered**, and the acceptance is normative:
> **INV-AUTH-1**.

**Coupling C2 — DP-6 spans FR-A4 (constraint) and FR-A5 (goal).** Publishing more MCP tools must not
grow write authority.

> **Resolution: decouple structurally.** `READ_SURFACE` members are **planners** — they return a payload
> and touch no store. Write-freedom is therefore a property of the _type_, not of reviewer vigilance, and
> FR-A4 holds by construction independent of DP-6's contents. The `o` row collapses; DP-6 serves FR-A5
> alone. Normative as **INV-AUTH-2** + **INV-MCP-3**.

**Boundary placement** (draw the line at the decision most likely to change): the _set_ of planner doors
will grow (batch import, policy-show, more languages). The _grounding computer_ and the _write
governance_ will not. So the boundary is drawn between them: planners are an open set behind one closed
seam; the write surface is a closed set behind a CI pin.

### 3.4 The architectural key (the whole design in one line)

> **Authoring ≠ writing.** Every missing door computes a payload and persists nothing — the precedent is
> `atlas doctor reground`, which already returns a `RegroundPlan{ emit: GroundedFact }` and is documented
> as _"a PROPOSAL only; persists nothing"_. Therefore `GOVERNANCE_SURFACE` stays **five** and
> `WRITE_PATHS` stays **two**. **INV-TOOLS-1 is untouched, and the spec-conformance gate's CODE-SURFACE
> PIN keeps passing unchanged.**

---

## 4. RATIFY — the 5 gates, per invariant

> Protocol: [`ratification-gate`](../../.claude/skills/ratification-gate/SKILL.md). An invariant passes
> only on all five: **grounded · testable · independent · justified (ADR + rejected alternatives) ·
> tradeoff-resolved**. The rows that pass are emitted as
> [`invariant-register-authoring.md`](../requirements/invariant-register-authoring.md) (state S0).

| INV                                              | grounded in                                                                                           | testable (measurable scenario)                                                         | independent                                                                      | justified                                                              | tradeoff                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **AUTH-1** one grounding computer                | C1 (§3.3); `author.ts:24-31` needs `initAst()` warmup purely to match the runtime — a live seam smell | mutate the planner's fold; a drafted fact must then be REJECTED by the emit gate       | ⟂                                                                                | ADR-0004 · rejected: two computers, a cached hash table                | cost: planners pay full index build. Accepted — correctness over latency                                      |
| **AUTH-2** planners carry zero write authority   | §3.3 C2; `doctor` precedent                                                                           | run every planner against a read-only store; bytes written == 0                        | ⟂                                                                                | ADR-0004 · rejected: a "safe" write door for drafts                    | none — strictly weaker than the alternative                                                                   |
| **AUTH-3** anchors faithful + total              | `fs.ts:38` already fails closed to empty on non-git                                                   | anchors(fixture) == the built index's unit set; non-git ⇒ empty, not a throw           | ⟂                                                                                | ADR-0004                                                               | none                                                                                                          |
| **AUTH-4** language-hole honesty                 | `ast.ts:45,48` loads only TS/TSX grammars; the dogfood repo was 185 `.rs` files                       | on a Rust fixture, output is file-level **and** carries an explicit hole marker        | ⟂                                                                                | ADR-0004 · rejected: silent file-level fallback; adding grammars now   | UX cost: the user learns Atlas is partly blind. Accepted — honestidade inegociável                            |
| **AUTH-5** slots = the closed vocabulary         | `knowledge/src/types.ts:166-178` (13 members, closed)                                                 | the listed set deep-equals the `PredicateSlot` union                                   | ⟂                                                                                | — (transcription)                                                      | none                                                                                                          |
| **AUTH-6** draft is structurally valid           | §2.3 the emit door's read set                                                                         | every field the emit door reads is present; identity == `nodeKey(candidate)`           | ⟂                                                                                | ADR-0004                                                               | none                                                                                                          |
| **AUTH-7** draft is rev-stamped                  | extension 7a of UC-1                                                                                  | a draft carries the rev; emitting at a different rev names the rev mismatch            | ⟂                                                                                | ADR-0004 · rejected: leaving the failure to the gate's generic message | +1 field                                                                                                      |
| **AUTH-8** draft→emit round-trip                 | FR-A6 — **the acceptance property of the whole surface**                                              | draft@R then emit `--at R` on an unchanged repo ⇒ accepted                             | depends on AUTH-1/6 by construction; kept because it is the _observable_ outcome | ADR-0004                                                               | none                                                                                                          |
| **AUTH-9** draft reports the ratify route        | extension 5c; `governed-emit.ts:105`                                                                  | a T0 draft states full-ratify + the token channel before any write                     | ⟂                                                                                | ADR-0004 · rejected: discovering it via a rejected emit                | none                                                                                                          |
| **AUTH-10** CREATE vs UPDATE legibility          | KNOW-15b nodeKey collision semantics                                                                  | drafting at an occupied (anchor, slot) reports UPDATE                                  | ⟂                                                                                | ADR-0004                                                               | requires a projection read in a planner — still zero write                                                    |
| **AUTH-11** check ≡ the door                     | FR-A3                                                                                                 | ∀ input: `check` verdict == the governed door's verdict                                | ⟂                                                                                | ADR-0004 · rejected: a heuristic pre-validator                         | the dry-run must track the door — enforced as a parity property, not by review                                |
| **AUTH-12** refusal legibility                   | dogfood finding 5 (raw `TypeError`)                                                                   | no refusal path surfaces a runtime error string; each names gate + remedy              | ⟂                                                                                | ADR-0004                                                               | none                                                                                                          |
| **AUTH-13** supersede without a new door         | §2.4 non-goal 1                                                                                       | a retire draft emits through `atlas-emit`; write doors still == 2                      | ⟂                                                                                | ADR-0004                                                               | retire inherits emit's gates — intended                                                                       |
| **AUTH-14** receipt closes the loop              | F4 — `emit` returns `contentHash`, read doors take `NodeKey`                                          | the value emit returns resolves through `atlas node`                                   | ⟂                                                                                | ADR-0004 · rejected: changing what the read doors accept               | additive field only                                                                                           |
| **CLI-5** help surface                           | dogfood: no `help` exists at all                                                                      | `atlas help` names every command, arg, and env channel                                 | ⟂                                                                                | ADR-0004                                                               | none                                                                                                          |
| **CLI-6** render nothing silently                | F5 — `render.ts:99-104` drops 2 of 3 `InitOut` fields                                                 | ∀ leg: every field of the result record appears in the render                          | ⟂                                                                                | ADR-0004                                                               | none                                                                                                          |
| **MCP-3** advertised = governance ∪ read-surface | owner directive _"tem que ter via mcp tool e via cli"_                                                | advertised set == the union; `WRITE_PATHS` unchanged; every read member writes 0 bytes | ⟂                                                                                | **ADR-0005** · rejected: growing `GOVERNANCE_SURFACE`; CLI-only doors  | falsifies the "MCP surface is exactly the five governance tools" claim ⇒ resolved by ADR-0005, not by silence |
| **MCP-4** parity covers the new doors            | FR-A5; INV-TOOLS-3 precedent                                                                          | byte-identical Verdict per input across transports                                     | ⟂                                                                                | ADR-0005                                                               | none                                                                                                          |

**Gate 4 (justified) note.** Every row cites an ADR **and** a rejected alternative, per the rubric's
"an invariant with no rejected alternative is an assertion." The two ADRs are
[`ADR-0004`](../adr/ADR-0004-authoring-planner-doors.md) (planners, not write doors) and
[`ADR-0005`](../adr/ADR-0005-mcp-read-surface.md) (the advertised MCP surface).

**Gate 3 (independent) note.** `AUTH-8` is the one row that is _derivable_ from `AUTH-1`+`AUTH-6`. It is
kept deliberately: it is the only invariant stated in terms the user can observe, and it is the
acceptance criterion for the campaign. Recorded as a known non-orthogonality rather than hidden.

---

## 5. Open owner decisions this design does NOT resolve

| #      | decision                                                                             | status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | may MCP advertise beyond `GOVERNANCE_SURFACE`?                                       | **RESOLVED by owner directive** — _"tem que ter via mcp tool e via cli"_ ⇒ ADR-0005 proposed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **D2** | `sameAs` retraction (F2) — third write door, supersede-record, or accept permanence? | **DECIDED + BUILT (task #83)** — none of the three: a **retraction MODE of the existing `atlas-link` door** (`--retract` / `retract:true`). No new tool, no new medium, `WRITE_PATHS` unchanged; the same gate ladder prices it, and it is an APPEND (`sameAsRetracted`) so the assertion's evidence survives. `deriveSameAs` splits the class on the next read. See ADR-0003 §Retraction                                                                                                                                                                                                                                                                              |
| **D3** | the propose-for-review queue (F3)                                                    | **BUILT (WP-PROMOTE).** Measurement killed the dichotomy first (task #83): durable staging was built and driven (`commitStaging` from `atlas mine`), `stage()` was never the explorer's path, and the gap was the missing **promotion** path out of staging — so KNOW-8's measurable held **vacuously** (severance, not ratification). `atlas promote` is that path: a CLI-only curator door that reads staging and presents each candidate to the existing `atlas-emit` door with `origin:'promoted'`, which takes the KNOW-18 fast path off the table so the ratifier really runs. No new surface (`GOVERNANCE_SURFACE` stays 5, `WRITE_PATHS` stays `{emit, link}`) |
| **D4** | v1 scope (`anchors`+`draft`+`check` minimum vs. the full seven DPs)                  | **DECIDED as lead** — all seven; `slots`/`help` are cheap and `READ_SURFACE` is owner-directed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
