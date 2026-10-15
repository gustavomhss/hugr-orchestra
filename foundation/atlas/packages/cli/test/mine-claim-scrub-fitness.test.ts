// @atlas/cli — test/mine-claim-scrub-fitness.test.ts  (T0 · #121-sibling — SCRUB DOMINATES the claim's CAS bytes)
//
// SIBLING of mine-answer-scrub-fitness.test.ts (#121), same law, DIFFERENT shape. The claim-scrub site sits
// inline in decideStaging (mine-decide.ts), where the object f — spread from a factScrubbed local, itself a
// per-kind ternary — is what id(f) hashes into CAS. This suite drives the SHARED AST audits
// (mine-claim-scrub-audit.ts) over the ADVISORY (claimNorm) and PREDICATE (check) legs; the relation/negation
// identity legs are the sibling suite (mine-claim-scrub-fitness-rel-neg.test.ts).

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { auditClaimScrub, auditCheckScrub } from "./mine-claim-scrub-audit.js"

const REAL = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/mine-decide.ts"), "utf8")

describe("mine-decide.ts — SCRUB DOMINATES the claim before it enters CAS (#121 sibling, claim leg)", () => {
  it("the SHIPPED file is clean — the advisory claimNorm provably flows from scrubClaimNorm", () => {
    expect(auditClaimScrub(REAL)).toStrictEqual([])
  })

  it("TEETH: a variant that stamps the RAW claim (no scrub call at all) is caught", () => {
    const mutant = `
      const claimNormOf = (f) => f.kind === 'advisory' ? f.claimNorm : '';
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer.kind === 'advisory' ? { ...factNoAnswer, claimNorm: factNoAnswer.claimNorm } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const req = { claimNorm: claimNormOf(f) };
        }
      }`
    const rules = auditClaimScrub(mutant)
      .map((v) => v.rule)
      .sort()
    expect(rules).toStrictEqual(["CLAIM-NOT-SCRUBBED", "NO-SCRUB"])
  })

  it("TEETH: a variant where the advisory branch was silently deleted (falls through to the raw fact) is caught", () => {
    const mutant = `
      import { scrubClaimNorm } from './mine-claim-scrub.js';
      const claimNormOf = (f) => f.kind === 'advisory' ? f.claimNorm : '';
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer; // BUG: the advisory scrub branch is gone
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const req = { claimNorm: claimNormOf(f) };
        }
      }`
    const rules = auditClaimScrub(mutant)
      .map((v) => v.rule)
      .sort()
    expect(rules).toStrictEqual(["NO-ADVISORY-SITE", "NO-SCRUB"])
  })

  it("TEETH: a variant that scrubs but assigns the result to a DIFFERENT (unused) field is caught", () => {
    const mutant = `
      import { scrubClaimNorm } from './mine-claim-scrub.js';
      const claimNormOf = (f) => f.kind === 'advisory' ? f.claimNorm : '';
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const scrubbedButUnused = scrubClaimNorm(factNoAnswer.claimNorm);
          const factScrubbed = factNoAnswer.kind === 'advisory' ? { ...factNoAnswer, claimNorm: factNoAnswer.claimNorm } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const req = { claimNorm: claimNormOf(f) };
        }
      }`
    const rules = auditClaimScrub(mutant)
      .map((v) => v.rule)
      .sort()
    expect(rules).toStrictEqual(["CLAIM-NOT-SCRUBBED"])
  })
})

describe("mine-decide.ts — SCRUB DOMINATES the predicate check before it enters CAS *and* node identity (WP-219)", () => {
  it("the SHIPPED file is clean — the predicate check provably flows from scrubCheck AND nodeKey spreads f", () => {
    expect(auditCheckScrub(REAL)).toStrictEqual([])
  })

  it("TEETH (no-scrub): a variant that stamps the RAW check (no scrubCheck call at all) is caught", () => {
    const mutant = `
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer.kind === 'predicate' ? { ...factNoAnswer, check: factNoAnswer.check } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const view = { ...f, slot: 'invariant' };
          const key = nodeKey(view);
        }
      }`
    const rules = auditCheckScrub(mutant)
      .map((v) => v.rule)
      .sort()
    expect(rules).toStrictEqual(["CHECK-NOT-SCRUBBED", "NO-SCRUB-CHECK"])
  })

  it("TEETH (scrub-computed-but-unused): scrubCheck runs but the check field keeps the RAW value", () => {
    const mutant = `
      import { scrubCheck } from './mine-claim-scrub.js';
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const scrubbedButUnused = scrubCheck(factNoAnswer.check);
          const factScrubbed = factNoAnswer.kind === 'predicate' ? { ...factNoAnswer, check: factNoAnswer.check } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const view = { ...f, slot: 'invariant' };
          const key = nodeKey(view);
        }
      }`
    const rules = auditCheckScrub(mutant)
      .map((v) => v.rule)
      .sort()
    expect(rules).toStrictEqual(["CHECK-NOT-SCRUBBED"])
  })

  it("TEETH (scrub-CAS-but-not-nodeKey): f carries the scrubbed check but nodeKey routes a RAW pre-scrub source", () => {
    const mutant = `
      import { scrubCheck } from './mine-claim-scrub.js';
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer.kind === 'predicate' ? { ...factNoAnswer, check: scrubCheck(factNoAnswer.check) } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const view = { ...factNoAnswer, slot: 'invariant' }; // BUG: raw source feeds node identity
          const key = nodeKey(view);
        }
      }`
    const rules = auditCheckScrub(mutant)
      .map((v) => v.rule)
      .sort()
    expect(rules).toStrictEqual(["NODEKEY-NOT-FROM-SCRUBBED-FACT"])
  })

  it("TEETH (predicate branch deleted): the per-kind scrub gate for predicate is gone", () => {
    const mutant = `
      import { scrubClaimNorm } from './mine-claim-scrub.js';
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer.kind === 'advisory' ? { ...factNoAnswer, claimNorm: scrubClaimNorm(factNoAnswer.claimNorm) } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const view = { ...f, slot: 'invariant' };
          const key = nodeKey(view);
        }
      }`
    const rules = auditCheckScrub(mutant)
      .map((v) => v.rule)
      .sort()
    expect(rules).toStrictEqual(["NO-PREDICATE-SITE", "NO-SCRUB-CHECK"])
  })
})
