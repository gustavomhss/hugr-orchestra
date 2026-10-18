# The Work-Package card — the pre-defined, driftless template

> The frozen schema every `WP` (state S4 output) conforms to. It is simultaneously (a) the **zero-decision
> input** an LLM executor consumes and (b) the **auditable record** a human OR an LLM reads back. Both audiences
> bind to the **same content digests**, so the executed unit and the audited unit are provably the same object.
>
> **Grounding (nothing invented):** PMBOK work-package + WBS-dictionary (the card skeleton: id · scope · exclusions ·
> acceptance · owner · deps) · ISO/IEC/IEEE 29148 (typed bidirectional trace: _satisfies_ + _verifies_ links) ·
> Gherkin/Given-When-Then (acceptance = the goldens, as the DoD oracle) · SWE-agent ACI (arXiv 2405.15793): code-
> skeleton / interface grounding reduces agent error, which _motivates_ the `anchor` + `interface_contract` fields ·
> in-toto/SLSA provenance (slsa.dev): the signed per-step attestation = the `provenance` slot **and** the model for
> the `trace_ref` evidence graph · Diátaxis (the render modes).

## The driftless law (the one rule the schema exists to enforce)

> The **invariant is the one authored fact.** Every substantive WP field is either a **pointer** (a `source:` link
> **carrying the content digest** of the upstream fact) or a **locally-authored value** that exists nowhere
> upstream. **No pointer field re-states upstream prose** — a WP never holds a second copy of the requirement, the
> golden, or the rationale; it holds a hash. If upstream changes, the digest mismatches and the WP renders `STALE`
> rather than silently diverging. This is the Atlas's own grounding@sha thesis, dogfooded onto the method's own
> artifacts.

The **locally-authored `value` fields** (they exist nowhere upstream, so there is nothing to point at):
`id · title · content_hash · intent · anchor · exclusions · action · action_surface · guardrails · repair_budget
· exit_predicate · owner`; plus the **`exec` fields** filled at execution time: `outputs · provenance · trace_ref`.
**`intent` is the one carve-out from "no prose":** it may paraphrase upstream, but it is **non-authoritative,
executor-invisible, and digest-free by design** — a human handle only; nothing is ever reasoned or verified against
it, so its drift is harmless. Everything _substantive_ (`source_reqs · interface_contract · inputs · acceptance ·
deps · context_refs · rationale`) is a `ptr+digest`.

## The field-set

`X` = consumed by the LLM **executor** · `HA` = **human auditor** · `LA` = **LLM auditor**. `ptr+digest` = a
`source:` pointer carrying the upstream content hash (driftless). `value` = authored here. `exec` = filled at
execution time (starts empty at S4-freeze).

| field                       | purpose                                                                                                                                                                                       | kind                                        | audience    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------- |
| `id`                        | hierarchical address `campaign.epic.module` (PMBOK WBS id)                                                                                                                                    | value                                       | X · HA · LA |
| `content_hash`              | frozen identity of this card (enables replay-by-construction)                                                                                                                                 | value                                       | X · LA      |
| `title`                     | one-line human handle                                                                                                                                                                         | value                                       | HA          |
| `intent`                    | the _what/why_, prose, **non-authoritative + executor-invisible + digest-free** (the one carve-out)                                                                                           | value                                       | HA          |
| `source_reqs[]`             | the REQ(s) this WP realizes — 29148 _satisfies_ link                                                                                                                                          | ptr+digest → REQ                            | X · HA · LA |
| `anchor`                    | file path + exact target site / insertion marker / signature                                                                                                                                  | value                                       | X           |
| `interface_contract`        | the exact signatures/types/API the code must satisfy                                                                                                                                          | ptr+digest → seam/FSPEC (or value if local) | X           |
| `exclusions`                | explicit out-of-scope boundary (PMBOK — kills scope drift)                                                                                                                                    | value                                       | X · HA      |
| `inputs[]` (materials)      | resolved artifacts the work consumes, each hashed (in-toto `materials`)                                                                                                                       | ptr+digest                                  | X · LA      |
| `action`                    | the zero-decision recipe / entrypoint (Diátaxis How-to; in-toto `recipe.entryPoint`)                                                                                                          | value                                       | X           |
| `action_surface`            | whitelisted tools/commands the executor may use                                                                                                                                               | value                                       | X           |
| `guardrails`                | path restrictions · edit-lint policy · forbidden zones                                                                                                                                        | value                                       | X           |
| `repair_budget`             | N + early-stop signatures (repeated-failure / no-change / semantic-dup)                                                                                                                       | value                                       | X           |
| `acceptance[]` (DoD)        | the Given-When-Then **goldens** that both gate done **and** _are_ the 29148 _verifies_ link — the authoritative spec (in this method acceptance ≡ verification, so no separate `verified_by`) | ptr+digest → SCN                            | X · HA · LA |
| `deps[]` / `parallel_group` | predecessor WP ids + `[P]` safe-parallel marker (Spec Kit)                                                                                                                                    | ptr → WP                                    | X · HA      |
| `exit_predicate`            | machine-checkable done condition: all `acceptance` green ∧ all gates pass                                                                                                                     | value                                       | X · LA      |
| `context_refs[]`            | the **closed** list of allowed references — no open-ended discovery                                                                                                                           | ptr                                         | X           |
| `owner` / `builder_id`      | responsible seat/agent (PMBOK owner ≡ in-toto `builder.id`)                                                                                                                                   | value                                       | HA · LA     |
| `outputs[]` (subjects)      | artifacts the WP must produce, hashed after run (in-toto `subject`)                                                                                                                           | exec                                        | X · LA      |
| `provenance[]`              | per-E-state signed attestation {subject+digest, materials+digests, action, builder, timestamps, completeness}                                                                                 | exec                                        | LA · HA     |
| `trace_ref`                 | pointer to the append-only typed **evidence graph** of the run                                                                                                                                | exec ptr                                    | LA · HA     |
| `rationale`                 | the Explanation slot — _why_ this WP/invariant exists (Diátaxis Explanation)                                                                                                                  | ptr → INV rationale                         | HA          |

## Canonical rendering (the one concrete syntax — no per-card dialect)

The field-set above fixes _what_ a card holds; this fixes _how_ it is written, so every card parses under one
grammar and every `source:` pointer resolves. A card that diverges in syntax is `STALE` by construction (the
resolver keys on an exact pointer form). Rules:

- **One field per line, at column 0**, in the field-set table order. No markdown-bullet (`- **field:**`) dialect.
- **Pointer fields** (`source_reqs`, `interface_contract`, `inputs`, `acceptance`, `context_refs`, `rationale`)
  render as a `field:` header line followed by one `  - source: <path>#<ANCHOR>` per referenced fact.
- **Path root is repo-relative-from-the-card**: WP cards live in `docs/requirements/work-packages/`, so a REQ
  is `../req-<mod>.md#REQ-<MODULE>-<n>` and a golden is `../goldens-<mod>.md#SCN-<MODULE>-<n>-<k>`.
- **Anchors are byte-verbatim the upstream id** — UPPERCASE `REQ-`/`SCN-` exactly as the `### REQ-…` header
  reads. Never lowercase, never drop a segment (`REQ-PERSIST-1-a`, not `req-persist-1a`).
- **`# ptr+digest`** marks each pointer line (digest tooling-filled at freeze); `content_hash: <filled-at-freeze>`;
  `exec` fields render `# exec — empty at S4-freeze`.

```
### WP-<campaign>.<epic>.<module> — <module> slice of EPIC-<n>
epic: EPIC-<n>
id: WP-<campaign>.<epic>.<module>
content_hash: <filled-at-freeze>
title: <one line>
intent: >
  <prose handle — non-authoritative, not reasoned against>
source_reqs:                                        # ptr+digest
  - source: ../req-<mod>.md#REQ-<MODULE>-<n>         # ptr+digest
seam-freezes: [ "<seam> owned-by <MOD>, consumed-by <MOD>" ]   # or [ ] for a single-module epic
anchor: <file path · exact target site>
interface_contract:                                 # ptr+digest
  - source: ../method-tags-<mod>.md#<TAG>           # ptr+digest   (or reference/atlas-<mod>.md#<sec>)
exclusions: <out-of-scope boundary>
inputs:                                             # ptr+digest
  - source: <path>#<anchor>                         # ptr+digest
action: <zero-decision recipe>
action_surface: [ read(...), edit(<module>/**), run(test:<module>) ]
guardrails: <path restriction · edit-lint · forbidden zones>
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                         # ptr+digest = frozen goldens
  - source: ../goldens-<mod>.md#SCN-<MODULE>-<n>-<k>  # ptr+digest
deps: [ <WP id | prereq> ]   parallel_group: [P]
exit_predicate: all acceptance SCNs green ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                       # closed list
  - source: ../req-<mod>.md
owner: <territory> · builder_id: <dispatch>
outputs:                                            # exec — empty at S4-freeze
provenance:                                         # exec — empty at S4-freeze
trace_ref:                                          # exec — empty at S4-freeze
rationale:                                          # ptr
  - source: ../invariant-register.md#INV-<MODULE>-<n>
```

## Two renders, one object (Diátaxis: keep the modes distinct)

- **Executor render (How-to + Reference only).** The executor sees `action` + the _resolved_ pointers
  (`source_reqs`, `interface_contract`, `inputs`, `acceptance`, `anchor`, `guardrails`, `exit_predicate`) as a
  zero-decision recipe. **No `intent`/`rationale` prose is reasoned against** — the "why" is withheld so the model
  transcribes rather than re-designs.
- **Audit render (Reference + Provenance + Evidence-graph + Explanation).** The auditor (human or LLM) gets the
  resolved dossier assembled by walking every `source:` pointer:
  1. **Resolve pass** — fetch each pointer's authored fact and **assert digest match**; any mismatch renders a
     loud `STALE` banner (the drift detector; 29148 currency + in-toto digest-pinning).
  2. **Reference view** — WP with pointers inlined as read-only facts; the bidirectional 29148 trace
     `REQ → WP → golden → verification` as a table.
  3. **Provenance view** — the ordered signed per-E-state attestations (who produced what, from which pinned
     inputs, when) — verifiable by tooling _and_ legible to a human.
  4. **Evidence-graph view** — the typed trajectory linking each E-state to the input material that justified it
     and the golden it satisfied, captured from an **append-only channel the executor cannot rewrite**.
  5. **Explanation slot** — a thin `why` pane pointing at the invariant's rationale, kept _separate_ from the
     executable card.

## Self-check (a WP card is well-formed iff)

- [ ] rendered in the **canonical syntax** (column-0 fields, `- source: ../<file>#<UPPERCASE-ANCHOR>`), so
      every pointer resolves and no per-card dialect drifts?
- [ ] every substantive fact is a `ptr+digest`, not a prose copy (driftless law holds)?
- [ ] `id` is `campaign.epic.wp` and unique; `content_hash` present?
- [ ] `acceptance[]` = its `source_reqs`' frozen goldens (verbatim by reference), and `exit_predicate` is
      machine-checkable?
- [ ] `anchor` + `interface_contract` present (the anti-hallucination pair) and `exclusions` stated?
- [ ] `action_surface` + `guardrails` + `repair_budget` set (the zero-decision execution envelope)?
- [ ] `exec` fields (`outputs`/`provenance`/`trace_ref`) present-but-empty at S4-freeze, filled only by the
      execution machine?

## Honest limitation (encoded, not hidden)

The card makes execution **auditable and driftless** — it does not make it **correct**. The goldens are the
correctness oracle (sampled, not proven); in-toto proves _who produced what from which inputs_, not _validity_;
the evidence graph is only as trustworthy as the append-only channel it is sealed from. The green means
"verified against the frozen goldens," never "proven right." (See the SEAL state for the false-green defenses.)
