---
name: dispatch-prompt
description: >
  Author a per-state dispatch prompt for a governed pipeline — the engineered instruction that drives an
  executor agent to perform one step per its protocol, on specific inputs, emitting a specific artifact.
  The deterministic protocol for the PROMPT layer: the ordered template, the load-don't-restate seam,
  the determinism/versioning discipline, and the anti-patterns. Invoke when writing any step prompt.
---

# /dispatch-prompt — authoring a per-step dispatch prompt

> **Authority (primary sources, read in full):** Anthropic prompting best-practices
> (platform.claude.com/docs/en/build-with-claude/prompt-engineering) · GitHub Spec-Kit command files
> (`templates/commands/*.md` — production per-step dispatch prompts) · DSPy signatures (declare _what_, not
> _how_). Nothing here is invented.
>
> _Scope note:_ the intra-prompt craft below (ordering, examples, no threat-spam, prefill-deprecated) is a
> faithful **summary of Anthropic's public prompting guidance — a pointer, not new doctrine**. The one
> chain-specific, load-bearing rule this protocol adds is **LOAD-don't-restate + a version-pinned `protocol_ref`**;
> that is the part that matters. Read the rest as "apply good public prompting, here condensed."

## The three layers (never conflate)

A **prompt** is NOT a protocol and NOT a skill. **Protocol** = the rules (loaded, model-agnostic). **Prompt**
= the dispatch that binds those rules to _these_ inputs and _this_ template. **Skill** = the invocable
envelope. This protocol governs writing the **prompt** only.

## The cardinal law: LOAD, never restate

The single most important finding, proven by Spec-Kit in production: **the prompt references the protocol; it
never paraphrases it.** The rules live once in the protocol file (`Load protocols/x.md`); the artifact shape
lives once in a template file; the prompt carries only the **irreducibly per-step** part. Restating a rule
inline forks it into a second copy that silently drifts — the prompt-layer form of triplication.

> Inline a rule **only** when the model must obey it _while generating_ and cannot hold the whole protocol in
> working attention — and then inline the **one clause, quoted, tagged with its protocol id**, never a
> paraphrase. Everything else is `Load`.

## The ordered template (adopt this shape)

```markdown
---
id: <state>-<verb> # e.g. S1-author-requirements
state: <S0..S4>
version: <semver>
protocol_ref: protocols/<x>.md@<sha> # the RULES — loaded, not restated
artifact_template: templates/<x>.tmpl.md # the SHAPE — loaded, not restated
inputs: [<named inputs>]
next_state: <state>
---

## Role & Placement

<who the executor is; WHERE in the state machine this sits; what rework rises if skipped>. One or two sentences.

## Inputs

<inputs> <!-- the ONLY thing that varies per run; fenced so it can't read as instructions -->
<named>: {{VAR}}
</inputs>

## Pre-conditions

- <deterministic checks: run a script for paths/existence; parse JSON>. On failure: ABORT and report — never guess.
- Load `protocols/<x>.md` — treat its MUST clauses as non-negotiable. Do not paraphrase them here.

## Operating Constraints

- <the few step-local invariants: read-only? caps (max N)? "report absent inputs accurately, never invent">

## Procedure

1. <orchestration & I/O steps: load → build internal model → apply the protocol → emit>.
   Keep these about I/O, not a re-derivation of the method. For reasoning steps say "reason through per the
   protocol, then self-check" — do NOT hand-script the algorithm.

## Output Contract

Write <OUT> using the template. Non-negotiable spine inline: <required headings · ID scheme · enum · columns · caps>.

## Self-Check (verify before emitting)

- [ ] <enumerated per-item + set-level invariants the emission must satisfy>

## Abstain / Failure

- <named conditions to emit `[NEEDS RECONCILIATION: …]` (max N) · when to ERROR · never fabricate>

## Completion Report

Emit: <OUT path · counts · coverage summary> → next_state <Sx>.
```

Section order matters: for long inputs, data goes **near the top** and the task **at the end** (Anthropic: up
to ~30% quality loss if buried). Fence inputs in their own block. Use `<example>` tags for 3–5 **diverse**
fixtures (never near-identical — that teaches surface-copying).

## Determinism & versioning (the prompt is an artifact)

- **Version the prompt file** with `version:` + `protocol_ref` pinned to the protocol's hash → a
  prompt/protocol mismatch is detectable.
- **Isolate all variability** behind the fenced input block; everything else is constant across runs → two
  runs are comparable.
- **Push deterministic side-effects into scripts, not the model** (paths, existence, prior-artifact presence →
  a tool call that emits JSON; the model never guesses).
- **Enforce output format via Structured Outputs / a schema-constrained tool** — NOT prefill (prefill now
  returns a 400 on current models).
- **Self-check in-prompt AND re-run it as an external gate** on the emitted artifact (heading set, id regex,
  enum membership, caps). In-prompt self-check + out-of-prompt validator = reproducible, not merely usually-right.
- **Deterministic ids, caps, enums** bound the output space so diffs are meaningful.

## Anti-patterns (overhead traps — the honest ones)

1. **Restating the protocol** inside the prompt — the cardinal sin; bloat + fork + drift. Load it.
2. **Over-scripting the reasoning** — "prefer general instructions over prescriptive steps" (Anthropic);
   micro-scripting every inference is both overhead and _worse_. Script the I/O; let the model reason.
3. **`CRITICAL:`/`YOU MUST` threat-spam** — on current models it causes over-triggering and wasted effort.
   Reserve emphatic MUST for genuine format/safety invariants; normal phrasing elsewhere.
4. **Prefill for format control** — deprecated (400). Use Structured Outputs.
5. **Example-overfitting** — 3–5 near-identical examples teach surface-copy; diversify.
6. **Bloated context / wrong ordering** — a long prompt is not a better prompt; data-top, task-end.
7. **Hand-rolled `<thinking>` scaffolds by default** — add only where you must inspect intermediate output.
8. **Over-eager tool/subagent prompting** — prompt the _boundaries_, not "if in doubt, use X" (backfires).

## Self-check before shipping a dispatch prompt

- [ ] does it `Load` the protocol + template rather than restate them?
- [ ] is every varying input fenced, and everything else constant?
- [ ] deterministic work pushed to scripts; only judgment left to the model, prompted lightly?
- [ ] output machine-checkable (headings/ids/enums/caps) + paired with an external validator?
- [ ] abstain/failure/escalation named and bounded?
- [ ] versioned with a `protocol_ref` hash?
- [ ] no protocol-restatement, no threat-spam, no prefill, diverse examples?
