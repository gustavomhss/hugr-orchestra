// @atlas/cli — test/mine-claim-scrub-fitness-rel-neg.test.ts  (T0 · billy #96-wave F2 — the RELATION/NEGATION identity legs)
//
// SIBLING of mine-claim-scrub-fitness.test.ts, split at the 400-LOC ceiling. Drives the SHARED AST audits
// (mine-claim-scrub-audit.ts) over the two identity-leg families the #96 wave lit up: a relation's
// endpointA/endpointB and a negation's target/scope, each of which feeds the identity KEY
// (relationKey/negationKey) as well as the CAS bytes — so the audit also proves the key is minted from the SAME
// scrubbed fact id() hashes. The RUNTIME teeth live in wp-96-identity-scrub.test.ts.

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { auditRelationScrub, auditNegationScrub } from "./mine-claim-scrub-audit.js"

const REAL = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/mine-decide.ts"), "utf8")

describe("mine-decide.ts — SCRUB DOMINATES the RELATION identity legs before CAS *and* the relationKey (billy #96 F2)", () => {
  it("the SHIPPED file is clean — endpointA AND endpointB provably flow from scrubUnit, and the key is minted from the scrubbed f", () => {
    expect(auditRelationScrub(REAL)).toStrictEqual([])
  })

  it("TEETH (no-scrub): a variant that stamps RAW endpoints (no scrubUnit call at all) is caught", () => {
    const mutant = `
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer.kind === 'relation' ? { ...factNoAnswer, endpointA: factNoAnswer.endpointA, endpointB: factNoAnswer.endpointB } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const view = { ...f, slot: undefined };
          const key = mintIdentity(f, view);
          const h = id(f);
        }
      }`
    const rules = auditRelationScrub(mutant)
      .map((v) => v.rule)
      .sort()
    expect(rules).toStrictEqual(["ENDPOINT-NOT-SCRUBBED", "ENDPOINT-NOT-SCRUBBED", "NO-SCRUB-UNIT"])
  })

  it("TEETH (relation branch deleted): the per-kind scrub gate for relation is gone (falls through to the raw fact)", () => {
    const mutant = `
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer.kind === 'advisory' ? { ...factNoAnswer, claimNorm: factNoAnswer.claimNorm } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const view = { ...f, slot: undefined };
          const key = mintIdentity(f, view);
          const h = id(f);
        }
      }`
    const rules = auditRelationScrub(mutant)
      .map((v) => v.rule)
      .sort()
    expect(rules).toStrictEqual(["NO-RELATION-SITE", "NO-SCRUB-UNIT"])
  })

  it("TEETH (scrub-CAS-but-not-key): endpoints scrubbed on f, but mintIdentity is handed a RAW pre-scrub fact", () => {
    const mutant = `
      import { scrubUnit } from './mine-claim-scrub.js';
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer.kind === 'relation' ? { ...factNoAnswer, endpointA: scrubUnit(factNoAnswer.endpointA), endpointB: scrubUnit(factNoAnswer.endpointB) } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const view = { ...f, slot: undefined };
          const key = mintIdentity(factNoAnswer, view); // BUG: the raw fact feeds the identity key
          const h = id(f);
        }
      }`
    const rules = auditRelationScrub(mutant)
      .map((v) => v.rule)
      .sort()
    expect(rules).toStrictEqual(["IDENTITY-NOT-FROM-SCRUBBED-FACT"])
  })
})

describe("mine-decide.ts — SCRUB DOMINATES the NEGATION identity legs before CAS *and* the negationKey (billy #96 F2)", () => {
  it("the SHIPPED file is clean — target AND scope provably flow from scrubUnit, and the key is minted from the scrubbed f", () => {
    expect(auditNegationScrub(REAL)).toStrictEqual([])
  })

  it("TEETH (no-scrub): a variant that stamps a RAW target/scope (no scrubUnit call at all) is caught", () => {
    const mutant = `
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer.kind === 'negation' ? { ...factNoAnswer, target: factNoAnswer.target, scope: factNoAnswer.scope } : factNoAnswer;
          const f = { ...factScrubbed, authzScope: 'atlas:mined' };
          const view = { ...f, slot: undefined };
          const key = mintIdentity(f, view);
          const h = id(f);
        }
      }`
    const rules = auditNegationScrub(mutant)
      .map((v) => v.rule)
      .sort()
    expect(rules).toStrictEqual(["NEGATION-LEG-NOT-SCRUBBED", "NEGATION-LEG-NOT-SCRUBBED", "NO-SCRUB-UNIT"])
  })

  it("TEETH (scrub-CAS-but-not-key): target/scope scrubbed on f, but mintIdentity is handed a RAW pre-scrub fact", () => {
    const mutant = `
      import { scrubUnit } from './mine-claim-scrub.js';
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer.kind === 'negation' ? { ...factNoAnswer, target: scrubUnit(factNoAnswer.target), scope: scrubUnit(factNoAnswer.scope) } : factNoAnswer;
          const f = { ...factScrubbed, authzScope: 'atlas:mined' };
          const view = { ...f, slot: undefined };
          const key = mintIdentity(factNoAnswer, view); // BUG: the raw fact feeds the identity key
          const h = id(f);
        }
      }`
    const rules = auditNegationScrub(mutant)
      .map((v) => v.rule)
      .sort()
    expect(rules).toStrictEqual(["IDENTITY-NOT-FROM-SCRUBBED-FACT"])
  })
})
