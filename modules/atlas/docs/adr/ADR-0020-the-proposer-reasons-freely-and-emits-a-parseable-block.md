# ADR-0020 — the advisory proposer reasons freely and emits a parseable `atlas-fact` block

**Status:** ACCEPTED — owner-ratified 2026-08-16 (the reason-freely-for-unguarded, one-line-for-sound-gated split).
**Supersedes/relates:** #95 (the A1 precision axis this raises), #201/#202 (the past-tense-comment → false-fact
failure this closes), ADR-0017 (the two-seal slot classifier — this ADR governs the ANSWER FORMAT of the
`validated`/advisory arm, orthogonal to the seal), #196a/#196c/#99 (the sound-gated dependency/count/negation
slots, which keep the one-line contract). Measured in `docs/design/196-typed-genesis-slot-proposal.md` and the
S2 stage-1 result (100% grounded+true, 0 hallucination, vs the shipped one-line 77.5%).

## Context

The shipped one-line proposer contract (`propose.md`, GEN-4d/GEN-12) FORBIDS the model from reasoning: it must
emit one line of prose or `NO-FACT`. Measured on the #95 bench, that contract scored **77.5%** precision on the
advisory arm — the dominant failure being a model that, denied a scratch region to check itself, read a
stale/past-tense CODE COMMENT as current behaviour and stated it as a present fact (#201). A model cannot refute
its own candidate against the bytes if it is forbidden from reasoning at all.

The redesign (S2 stage 1) INVERTS this for the arm that has **no sound oracle** behind it: the model reasons
freely in a discarded scratch region, actively tries to refute its candidate against the source, then emits
exactly one fenced ```atlas-fact block carrying `{"claim": "..."}`. Measured: **100% grounded+true, 0
hallucination, 2.2% correct abstention.**

## Decision

The answer-admission contract is chosen **by slot**, not globally:

- **Sound-gated slots** (`dependency`, `count`, `negation`) keep the **`'line'`** contract: one line of prose or
  an abstain token; `> 1` non-empty line is the splice class. Their sound oracle already makes a cheap,
  un-reasoned pick SAFE, so free reasoning buys nothing and only widens the answer surface.
- **Advisory / semantic slots** (no sound oracle) use the **`'block'`** contract: the model reasons freely (the
  reasoning is scratch — parsed away, NEVER persisted, GEN-12 preserved) and emits exactly ONE fenced
  `atlas-fact` block. Zero blocks ⇒ untagged abstention (reasoned-then-declined); ≥2 blocks ⇒ the splice class
  (the structural replacement for the line-count heuristic, which cannot apply to a deliberately multi-line
  answer); an unparseable/oversized block ⇒ tagged malformed. Fail-closed throughout.

The format is threaded as `AnswerFormat` into `createCommandClient` (`packages/adapter-io/src/llm.ts`) and
selected in `mine-proposer.ts` by `slot === 'advisory' ? 'block' : 'line'`. The C0-control interleave guard
(`hasControlByteSplice`) applies in BOTH formats — a spliced pipe is corruption regardless of the answer shape.

## What the owner ratifies

- The per-slot format split above: reason-freely block for the unguarded arm, one-line for the sound-gated arms.
- GEN-4d (no self-declaration is asked for or read) and GEN-12 (chain-of-thought is scratch, never persisted as
  a fact) both continue to hold — the block's `claim` is the only surviving field.

## Consequences

- The advisory arm's A1 precision rises from a measured 77.5% toward 100% without a second model call and
  without any model-supplied predicate (INV-ADAPTER-11 preserved).
- `admitModelAnswer` is now mode-aware; its two legs are tested independently (line-mode splice/abstain,
  block-mode count/parse/abstain).
- The sound-gated slots are byte-for-byte unchanged on their answer path.
