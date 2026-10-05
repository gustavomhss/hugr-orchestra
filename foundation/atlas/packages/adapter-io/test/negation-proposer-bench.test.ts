// @atlas/adapter-io — test/negation-proposer-bench.test.ts  (#95 · #99 — the A1/A3 LLM-PROPOSER arm)
//
// REPRODUCE (gateway must be listening on 127.0.0.1:8787; fresh `.atlas/index.scip`):
//   ATLAS_NEG_PROPOSER=1 npx vitest run packages/adapter-io/test/negation-proposer-bench.test.ts
//   optional: NEG_PROPOSER_MODEL=claude-openrouter-deepseek  NEG_PROPOSER_SCOPES=4  NEG_PROPOSER_TARGETS=12
//
// WHAT THIS MEASURES (the realism layer the exhaustive gate sweep in `negation-bench.test.ts` cannot). The v2
// negation gate carries NO LLM — it is the deterministic JUDGE. A realistic miner needs a PROPOSER: something
// that reads a scope S and suggests negatives ("symbol X is not called within S") for the gate to rule on. This
// arm runs that proposer on a CHEAP model (DeepSeek via the local Anthropic-compatible gateway, owner directive
// #95), then feeds every "not-uses" proposal through the SAME shipped gate + the SAME independent tsc oracle the
// M3 bench uses. Two axes fall out:
//   · A1 (precision of the pipeline OUTPUT): of the negatives the pipeline ADMITS (LLM proposed ∧ gate admitted),
//     how many are TRUE per tsc. The gate is sound ⇒ this is the GUARANTEE, measured, not assumed.
//   · A3 (cost): real $ per admitted fact, summed from the gateway's per-call `usage.cost`.
// Plus the diagnostic that matters most: the gate makes a FALLIBLE cheap proposer SAFE — a wrong "not-uses" on a
// symbol that IS called is REFUTED by the gate, never emitted as a false fact. That is measured here directly.
//
// HONESTY RAILS: the proposer's candidate targets are selected DETERMINISTICALLY (sorted + strided, no filtering
// by outcome — the true/called/escaping mix is whatever the repo gives). The gate + oracle are the shipped ones
// (via `setupNegBench`). Cost is the gateway's own metered number, never estimated. Gated behind
// ATLAS_NEG_PROPOSER=1 (a live gateway + network, unfit for CI).

import { describe, it, expect, beforeAll } from "vitest"
import { resolve as presolve, join } from "node:path"
import { readFileSync, existsSync, globSync } from "node:fs"
import { setupNegBench, type NegBench, type Target } from "./support/neg-bench-lib.js"

const RUN = process.env.ATLAS_NEG_PROPOSER === "1"
const ROOT = presolve(__dirname, "..", "..", "..")
const SCIP = join(ROOT, ".atlas", "index.scip")
const GATEWAY = process.env.NEG_PROPOSER_GATEWAY ?? "http://127.0.0.1:8787/v1/messages"
const MODEL = process.env.NEG_PROPOSER_MODEL ?? "claude-openrouter-deepseek"
const N_SCOPES = Number(process.env.NEG_PROPOSER_SCOPES ?? "4")
const N_TARGETS = Number(process.env.NEG_PROPOSER_TARGETS ?? "12")

interface LlmReply {
  text: string
  cost: number
  inTok: number
  outTok: number
}

/** ONE metered call to the gateway (Anthropic /v1/messages, non-stream). Returns the text + the gateway's own
 *  per-call cost/usage — never an estimate. Throws on a non-200 or a shape it cannot read (fail-loud). */
async function callGateway(system: string, user: string): Promise<LlmReply> {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      stream: false,
      system,
      messages: [{ role: "user", content: user }],
    }),
  })
  if (!res.ok) throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const d = (await res.json()) as {
    content?: Array<{ text?: string }>
    usage?: { cost?: number; input_tokens?: number; output_tokens?: number }
  }
  const text = (d.content ?? []).map((b) => b.text ?? "").join("")
  return { text, cost: d.usage?.cost ?? 0, inTok: d.usage?.input_tokens ?? 0, outTok: d.usage?.output_tokens ?? 0 }
}

/** Parse the LAST JSON array of `{target, verdict}` from the model's free-form reply (reason-freely → emit-
 *  structured). Unknown/garbled ⇒ []. `verdict` is normalized to uses | not-uses | unsure. */
function parseProposals(text: string): Map<string, "uses" | "not-uses" | "unsure"> {
  const out = new Map<string, "uses" | "not-uses" | "unsure">()
  const matches = [...text.matchAll(/\[[\s\S]*?\]/g)]
  for (let i = matches.length - 1; i >= 0; i--) {
    try {
      const arr = JSON.parse(matches[i]![0]) as Array<{ target?: string; verdict?: string }>
      if (!Array.isArray(arr)) continue
      for (const e of arr) {
        if (typeof e?.target !== "string" || typeof e?.verdict !== "string") continue
        const v = e.verdict.toLowerCase()
        out.set(e.target, v.includes("not") ? "not-uses" : v.includes("use") ? "uses" : "unsure")
      }
      if (out.size > 0) return out
    } catch {
      /* not the JSON block; keep scanning earlier matches */
    }
  }
  return out
}

/** The source of scope S (its non-test .ts files under S, bounded), for the model to judge from — NOT comments. */
function scopeSource(scope: string, cap = 22000): string {
  const files = (globTs(join(ROOT, scope)) ?? []).sort()
  let acc = ""
  for (const f of files) {
    const rel = f.slice(ROOT.length + 1)
    const body = readFileSync(f, "utf8")
    acc += `\n// ===== ${rel} =====\n${body}\n`
    if (acc.length > cap) break
  }
  return acc.slice(0, cap)
}
function globTs(dir: string): string[] | undefined {
  try {
    return globSync("**/*.ts", { cwd: dir })
      .filter((p) => !/\.test\.ts$/.test(p) && !p.includes("/test/"))
      .map((p) => join(dir, p))
  } catch {
    return undefined
  }
}

const SYSTEM =
  "You are a precise static-analysis assistant. You are given the FULL source of a directory scope S and a list " +
  "of external symbols. For EACH symbol decide whether any code in S CALLS it (invokes it as a function or " +
  "constructor). Judge ONLY from the code shown — IGNORE comments and prose, they may be stale. If the symbol " +
  'name never appears in a call position anywhere in S, it is "not-uses". If you cannot tell, say "unsure" — ' +
  "never guess. Think step by step, then end your answer with ONE JSON array and nothing after it: " +
  '[{"target":"<name>","verdict":"uses"|"not-uses"|"unsure"}, ...] covering every symbol exactly once.'

describe.skipIf(!RUN)("#95/#99 — negation PROPOSER arm (A1 precision + A3 cost, cheap model via gateway)", () => {
  let B: NegBench
  beforeAll(async () => {
    B = await setupNegBench(ROOT, SCIP)
  }, 120_000)

  it("a cheap LLM proposes; the sound gate + tsc oracle judge; report A1 precision + A3 cost", async () => {
    if (!existsSync(SCIP)) throw new Error(`no ${SCIP} — run: scip-typescript index --output .atlas/index.scip`)
    // Sample N_SCOPES scopes STRIDED across all real src scopes (sorted) — a representative mix of clean scopes
    // and grammar-parse-gap scopes, NOT cherry-picked by outcome or size. Skip scopes with too little code to judge.
    const allScopes = [...B.scopes].filter((s) => scopeSource(s, 400).length > 120)
    const sstride = Math.max(1, Math.floor(allScopes.length / N_SCOPES))
    const scopes: string[] = []
    for (let i = 0; i < allScopes.length && scopes.length < N_SCOPES; i += sstride) scopes.push(allScopes[i]!)

    let totalCost = 0,
      calls = 0,
      inTok = 0,
      outTok = 0
    let proposedNot = 0,
      admits = 0,
      admitTrue = 0,
      falseAdmits = 0
    let llmCorrect = 0,
      llmJudged = 0,
      llmMissedCall = 0 // proposer's own accuracy vs tsc
    let refutedBadProposal = 0 // wrong "not-uses" (X IS called) the GATE caught — the safety property
    const rows: string[] = []
    const falseAdmitEx: string[] = []

    for (const scope of scopes) {
      // candidate targets: defined OUTSIDE S, sorted + strided to N_TARGETS (no outcome filtering).
      const ext = B.targets.filter((t) => !B.underScope(t.df, scope)).sort((a, b) => (a.key < b.key ? -1 : 1))
      if (ext.length === 0) continue
      const stride = Math.max(1, Math.floor(ext.length / N_TARGETS))
      const cand: Target[] = []
      for (let i = 0; i < ext.length && cand.length < N_TARGETS; i += stride) cand.push(ext[i]!)

      const src = scopeSource(scope)
      const user =
        `Scope S = ${scope}\n\nSOURCE OF S:\n${src}\n\nSYMBOLS to judge (does S call each?):\n` +
        cand.map((c) => `- ${c.name}`).join("\n")
      const reply = await callGateway(SYSTEM, user)
      totalCost += reply.cost
      calls++
      inTok += reply.inTok
      outTok += reply.outTok
      const props = parseProposals(reply.text)

      let scAdmit = 0,
        scNot = 0
      for (const c of cand) {
        const v = props.get(c.name)
        if (v === undefined) continue
        const truthCalled = B.calledInScope(c, scope)
        // proposer intrinsic accuracy (uses/not-uses vs tsc; unsure abstains from scoring)
        if (v !== "unsure") {
          llmJudged++
          const llmSaysCalled = v === "uses"
          if (llmSaysCalled === truthCalled) llmCorrect++
          else if (!llmSaysCalled && truthCalled) llmMissedCall++ // said not-uses but it IS called
        }
        if (v !== "not-uses") continue
        proposedNot++
        scNot++
        const verdict = B.judge(c.symbol, scope)
        if (verdict === "admit") {
          admits++
          scAdmit++
          if (!truthCalled) admitTrue++
          else {
            falseAdmits++
            if (falseAdmitEx.length < 10) falseAdmitEx.push(`${c.name}@${scope}`)
          }
        } else if (verdict === "refute" && truthCalled) {
          refutedBadProposal++ // the gate CAUGHT a wrong "not-uses" — no false fact emitted
        }
      }
      rows.push(`  ${scope.padEnd(30)} judged:${props.size}/${cand.length}  not-uses:${scNot}  → admitted:${scAdmit}`)
    }

    const a1 = admits > 0 ? (admitTrue / admits) * 100 : 100
    const acc = llmJudged > 0 ? (llmCorrect / llmJudged) * 100 : 0
    const costPerFact = admits > 0 ? totalCost / admits : 0
    /* eslint-disable no-console */
    console.log("\n=== #95/#99 — NEGATION PROPOSER ARM (A1 precision + A3 cost) ===")
    console.log(`model: ${MODEL}   scopes: ${scopes.length}   targets/scope: ${N_TARGETS}   gateway calls: ${calls}`)
    console.log(rows.join("\n"))
    console.log("--- proposer intrinsic accuracy (LLM uses/not-uses vs tsc) ---")
    console.log(
      `  judged(non-unsure): ${llmJudged}   correct: ${llmCorrect} (${acc.toFixed(1)}%)   missed-a-real-call: ${llmMissedCall}`,
    )
    console.log("--- pipeline output (proposer → sound gate) ---")
    console.log(`  not-uses proposals: ${proposedNot}   ADMITTED (true groundable negatives): ${admits}`)
    console.log(
      `  A1 precision (admitted ∧ true / admitted): ${a1.toFixed(2)}%   FALSE-ADMITS: ${falseAdmits} ${falseAdmits === 0 ? "<= SOUND" : "<= BUG"}`,
    )
    if (falseAdmitEx.length) console.log("    false-admit ex: " + falseAdmitEx.join(", "))
    console.log(
      `  SAFETY: wrong "not-uses" (X IS called) the gate REFUTED (no false fact emitted): ${refutedBadProposal}`,
    )
    console.log("--- A3 cost (gateway-metered, owner OpenRouter credits) ---")
    console.log(
      `  total: $${totalCost.toFixed(6)}   tokens in/out: ${inTok}/${outTok}   $/admitted-fact: $${costPerFact.toFixed(6)}`,
    )
    console.log("=================================================================\n")
    /* eslint-enable no-console */

    // TEETH: the gate's soundness holds THROUGH a fallible cheap proposer — never a false fact, whatever the LLM says.
    expect(falseAdmits).toBe(0)
    expect(calls).toBeGreaterThan(0)
    expect(totalCost).toBeGreaterThan(0) // A3 was actually metered
  }, 300_000)
})
