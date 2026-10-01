// Acceptance suite for `createCommandClient` — the ONE concrete `ModelClient` (ADR-0011 Decision 1).
//
// Every case runs a REAL subprocess against POSIX binaries (`cat`/`true`/`false`/`echo`/`printf`/`sleep`),
// because the properties under test are properties of process invocation — a mocked child would assert the
// mock. No live model is involved anywhere, and no vendor is named.
//
// The two load-bearing families:
//   • ABSTENTION vs FAILURE must never be confusable. Empty stdout is an abstention (GEN-12, a valid
//     unpressured outcome); a non-zero exit / timeout / missing command THROWS. If a broken configuration
//     could return `claim: null`, a misconfigured run would be indistinguishable from "this repo has no
//     facts" — the one failure mode that invalidates a whole genesis pass invisibly.
//   • NO SHELL, and the prompt never reaches argv. Both are asserted positively, with mutations named.

import { describe, expect, it } from "vitest"

import { ABSTAIN_SENTINEL, createCommandClient, ModelCommandError } from "../src/llm.js"
import type { LlmBudget } from "../src/llm.js"

/** A generous wall-clock for the commands that are expected to finish immediately. */
const budget: LlmBudget = { costCap: 1, timeoutMs: 10_000 }

/** Read the thrown error as the discriminated failure it must be — never a bare `Error`. */
function failureOf(fn: () => unknown): ModelCommandError {
  try {
    fn()
  } catch (e) {
    if (e instanceof ModelCommandError) return e
    throw new Error(`expected a ModelCommandError, got ${String(e)}`)
  }
  throw new Error("expected a throw, got a return — a failure MUST NOT be expressible as a result")
}

describe("createCommandClient — the operator-supplied model command (ADR-0011 D1)", () => {
  it("pipes the prompt on STDIN and returns stdout as the claim", () => {
    const client = createCommandClient({ cmd: "cat", args: [] }) // `cat` echoes its stdin
    expect(client.complete("a non-obvious grounded claim", budget)).toStrictEqual({
      claim: "a non-obvious grounded claim",
      rawAnswer: "a non-obvious grounded claim", // #195c: the validated answer bytes ride back for W-MINE
    })
  })

  it("the prompt is NEVER appended to argv — a command that echoes its ARGUMENTS sees nothing", () => {
    // teeth: were the prompt passed as an argument instead of on stdin, `echo` would print it and this
    // would come back as a claim. `echo` ignores stdin, so the only way to observe the prompt is argv.
    const client = createCommandClient({ cmd: "echo", args: [] })
    expect(client.complete("THE-PROMPT-MUST-NOT-APPEAR-IN-ARGV", budget)).toStrictEqual({ claim: null })
  })

  it("NO SHELL — an argument carrying shell metacharacters is passed through literally", () => {
    // teeth (breaks-on "the adapter is switched to `shell: true`"): a shell would EXPAND `$HOME` and treat
    // `;` as a command separator. Literal pass-through is what makes an argv array safe by construction.
    const client = createCommandClient({ cmd: "printf", args: ["%s", "$HOME; rm -rf /"] })
    expect(client.complete("ignored", budget)).toStrictEqual({ claim: "$HOME; rm -rf /", rawAnswer: "$HOME; rm -rf /" })
  })

  describe("abstention (GEN-12) — a valid, unpressured outcome", () => {
    it("EMPTY stdout ⇒ abstained, never a fabricated claim", () => {
      const client = createCommandClient({ cmd: "true", args: [] }) // exit 0, writes nothing
      expect(client.complete("anything", budget)).toStrictEqual({ claim: null })
    })

    it("WHITESPACE-ONLY stdout ⇒ abstained", () => {
      // teeth (breaks-on "the `.trim()` before the emptiness test is dropped"): without it this yields a
      // claim of `"\n"`, which the gate would then have to reject downstream instead of never seeing.
      const client = createCommandClient({ cmd: "printf", args: ["  \\n\\t "] })
      expect(client.complete("anything", budget)).toStrictEqual({ claim: null })
    })
  })

  describe("a child that exits cleanly WITHOUT draining the prompt still yields its claim", () => {
    // Found as a load-dependent flake: `printf` exits before Node finishes writing stdin, so `execFileSync`
    // throws EPIPE on the WRITE even though the run succeeded (measured: `{code:'EPIPE', status:0,
    // stdout:'OUT'}`). Prompts here are whole source subtrees, so the write is long and the window is wide.
    /** Big enough that the child is guaranteed to exit mid-write. */
    const hugePrompt = "x".repeat(8 * 1024 * 1024)

    it("EPIPE with a ZERO exit status returns the stdout the child did produce", () => {
      // teeth (breaks-on "the `salvageEarlyExit` branch is removed"): the call throws `nonzero-exit`, so a
      // model command that reads a prefix and exits reports a hard failure on a run that produced a claim.
      const client = createCommandClient({ cmd: "printf", args: ["%s", "A-REAL-CLAIM"] })
      expect(client.complete(hugePrompt, budget)).toStrictEqual({ claim: "A-REAL-CLAIM", rawAnswer: "A-REAL-CLAIM" })
    })

    it("EPIPE with a NON-ZERO exit status is still a failure — the salvage is not a blanket catch", () => {
      // teeth (breaks-on "`err.status !== 0` is dropped from the salvage predicate"): a genuinely failing
      // command that also stopped reading stdin would be salvaged into a silent abstention.
      const client = createCommandClient({ cmd: "false", args: [] })
      expect(failureOf(() => client.complete(hugePrompt, budget)).reason).toBe("nonzero-exit")
    })
  })

  describe("failure is THROWN and classified — never returned as an abstention", () => {
    it("a NON-ZERO exit throws `nonzero-exit` (the fail-silent trap)", () => {
      // teeth (breaks-on "the catch returns `{ claim: null }` instead of throwing"): that mutation makes a
      // wholly broken model config report as a repo with nothing to say — exit 0, empty graph, no signal.
      const client = createCommandClient({ cmd: "false", args: [] })
      expect(failureOf(() => client.complete("anything", budget)).reason).toBe("nonzero-exit")
    })

    it("a MISSING command throws `not-found`, distinctly from a failing one", () => {
      // The most common misconfiguration. Collapsing it into `nonzero-exit` is what makes a typo in the
      // operator config read as "the model refused everything".
      const client = createCommandClient({ cmd: "atlas-no-such-model-binary-xyzzy", args: [] })
      expect(failureOf(() => client.complete("anything", budget)).reason).toBe("not-found")
    })

    it("a command exceeding `budget.timeoutMs` throws `timeout` — the budget's wall-clock is enforced", () => {
      const client = createCommandClient({ cmd: "sleep", args: ["5"] })
      const tight: LlmBudget = { costCap: 1, timeoutMs: 150 }
      // teeth (breaks-on "`timeout: budget.timeoutMs` is dropped from the spawn options"): without it the
      // call blocks for the full 5s and returns an ABSTENTION, so an unbounded model would look thrifty.
      expect(failureOf(() => client.complete("anything", tight)).reason).toBe("timeout")
    })

    it("the thrown message names the command that ran, so a failure is diagnosable without re-running it", () => {
      const client = createCommandClient({ cmd: "atlas-no-such-model-binary-xyzzy", args: ["-m", "x"] })
      const err = failureOf(() => client.complete("anything", budget))
      expect(err.message).toContain("atlas-no-such-model-binary-xyzzy -m x")
    })
  })

  // ── #195 leg (c): the admission SANITY GATE, exercised end-to-end through a real subprocess ────────────
  // The bytes are produced by `printf` (octal escapes for the corrupt/control cases) so the RAW-BUFFER path
  // is what is under test — a mocked child would assert the mock, not the U+FFFD masking this gate defeats.
  describe("#195c admission sanity gate — malformed answers fail closed to a TAGGED abstention", () => {
    it("a NORMAL single answer ⇒ a claim AND the validated rawAnswer (the exact bytes that passed)", () => {
      // teeth: rawAnswer is the UNTRIMMED validated text; the claim is its trimmed projection. Dropping the
      // rawAnswer carrier means W-MINE has nothing to scrub-and-put to CAS.
      const client = createCommandClient({ cmd: "printf", args: ["greet formats via a template literal\\n"] })
      expect(client.complete("anything", budget)).toStrictEqual({
        claim: "greet formats via a template literal",
        rawAnswer: "greet formats via a template literal\n",
      })
    })

    it("a SPLICED/concatenated multi-answer ⇒ abstain `answer-malformed:multi-response` (the 2026-08-04 class)", () => {
      // teeth (breaks-on "the single-response prong is removed"): two concatenated answers are the exact
      // shape the broken shim delivered; without this prong they flow straight to `claimNorm`.
      const client = createCommandClient({ cmd: "printf", args: ["answer one\\nanswer two\\n"] })
      expect(client.complete("anything", budget)).toStrictEqual({
        claim: null,
        abstainReason: "answer-malformed:multi-response",
      })
    })

    it("an interleaved answer carrying a C0 control byte ⇒ abstain `answer-malformed:multi-response`", () => {
      // \001 (0x01) is a control byte a single prose answer never carries — the byte-overlap/interleave seam
      // of concurrent writers racing one pipe. It is VALID UTF-8, so this exercises the splice prong, not the
      // utf-8 prong.
      const client = createCommandClient({ cmd: "printf", args: ["front\\001back"] })
      expect(client.complete("anything", budget)).toStrictEqual({
        claim: null,
        abstainReason: "answer-malformed:multi-response",
      })
    })

    it("INVALID UTF-8 bytes ⇒ abstain `answer-malformed:not-utf8` (never salvaged as a U+FFFD claim)", () => {
      // \377\376 (0xFF 0xFE) is not valid UTF-8. teeth (breaks-on "stdout is read with encoding:'utf8'"):
      // that mutation maps these bytes to U+FFFD and admits a fabricated claim instead of abstaining.
      const client = createCommandClient({ cmd: "printf", args: ["\\377\\376"] })
      expect(client.complete("anything", budget)).toStrictEqual({
        claim: null,
        abstainReason: "answer-malformed:not-utf8",
      })
    })

    it("EMPTY stdout stays the UNTAGGED GEN-12 abstention — an empty answer is declining, not corruption", () => {
      // teeth (breaks-on "empty is tagged answer-malformed:empty"): the model-abstained case must NOT be
      // reported as a malformed answer, or every legitimate abstention reads as contamination.
      const client = createCommandClient({ cmd: "true", args: [] })
      expect(client.complete("anything", budget)).toStrictEqual({ claim: null })
    })
  })

  // ── #201/#202 the explicit ABSTAIN SENTINEL — a positive abstention ACTION, mapped to the same GEN-12 null
  describe("#201/#202 explicit abstain sentinel — a token, not silence", () => {
    it("the sentinel token alone ⇒ the UNTAGGED GEN-12 abstention (identical to empty stdout)", () => {
      // teeth (breaks-on "the sentinel prong is removed from admitModelAnswer"): a responsive model emits
      // this token instead of nothing, and without the prong it is admitted as a fabricated one-line CLAIM —
      // exactly the #201 prose-refusal-becomes-fact bug the sentinel exists to close.
      const client = createCommandClient({ cmd: "printf", args: [`${ABSTAIN_SENTINEL}\\n`] })
      expect(client.complete("a trivial unit", budget)).toStrictEqual({ claim: null })
    })

    it("the sentinel is matched CASE-INSENSITIVELY on the fully-trimmed answer", () => {
      // teeth (breaks-on "the toUpperCase()/trim is dropped"): a model that lowercases or pads the token
      // would slip past a strict-equality check and its abstention would be recorded as a fact.
      const client = createCommandClient({ cmd: "printf", args: ["  no-fact \\n"] })
      expect(client.complete("a trivial unit", budget)).toStrictEqual({ claim: null })
    })

    it("the sentinel wrapped in markdown BACKTICKS ⇒ abstain (the measured Sonnet 4.6 case, #201/#202 probe)", () => {
      // teeth (breaks-on "the end-strip in isAbstainToken is removed"): on the 2026-08-11 probe the model
      // abstained on 5/6 trivial units with a bare token and on the 6th emitted `` `NO-FACT` `` — a strict
      // whole-answer equality would have booked that abstention as a fabricated fact. The end-strip is why not.
      const client = createCommandClient({ cmd: "printf", args: ["`NO-FACT`\\n"] })
      expect(client.complete("a trivial unit", budget)).toStrictEqual({ claim: null })
    })

    it("the sentinel wrapped in PROSE is NOT an abstention — only the whole-answer token abstains", () => {
      // teeth (breaks-on "the match is `includes` instead of whole-answer equality"): a real fact that merely
      // mentions the token must survive as a claim. Substring-matching would let the sentinel eat genuine facts.
      const client = createCommandClient({ cmd: "printf", args: ["NO-FACT is returned when the cache is cold\\n"] })
      expect(client.complete("a real unit", budget)).toStrictEqual({
        claim: "NO-FACT is returned when the cache is cold",
        rawAnswer: "NO-FACT is returned when the cache is cold\n",
      })
    })
  })
})

// [ADR-0020] The `'block'` answer format — the reason-freely advisory contract. The model reasons freely (that
// text is scratch and parsed away) and emits exactly ONE fenced ```atlas-fact block carrying `{"claim": ...}`.
// The sound-gated slots keep `'line'` (the default, covered above); this suite pins the block leg.
describe("createCommandClient('block') — the reason-freely fenced-atlas-fact contract", () => {
  const block = (claim: string): string => "```atlas-fact\n" + JSON.stringify({ claim }) + "\n```"

  it("EXACTLY ONE block whose JSON `claim` is a non-empty string ⇒ that trimmed claim (reasoning discarded)", () => {
    // stdin (the prompt) is piped; `cat` echoes it, so we feed the whole envelope — free reasoning + the block —
    // as the prompt and read it back as the model's stdout. Only the block's `claim` may survive.
    const client = createCommandClient({ cmd: "cat", args: [] }, "block")
    const envelope =
      "let me think about this unit...\nI will check the bytes.\n" + block("charge() re-reads the ledger")
    const r = client.complete(envelope, budget)
    expect(r.claim).toBe("charge() re-reads the ledger")
    expect(r.rawAnswer).toBe(envelope) //                        the whole validated envelope rides back
  })

  it("ZERO blocks (reasoned then declined / botched format) ⇒ untagged abstention, never a fabricated claim", () => {
    const client = createCommandClient({ cmd: "cat", args: [] }, "block")
    expect(client.complete("I thought about it and there is no non-obvious fact here.", budget)).toStrictEqual({
      claim: null,
    })
  })

  it("TWO blocks ⇒ the splice class (tagged multi-response), never a silent pick of the first", () => {
    const client = createCommandClient({ cmd: "cat", args: [] }, "block")
    const two = block("first fact") + "\nand also\n" + block("second fact")
    expect(client.complete(two, budget)).toStrictEqual({
      claim: null,
      abstainReason: "answer-malformed:multi-response",
    })
  })

  it("a block whose body is not JSON ⇒ tagged malformed (fail-closed, never a raw-text claim)", () => {
    const client = createCommandClient({ cmd: "cat", args: [] }, "block")
    const bad = "```atlas-fact\nthis is not json\n```"
    expect(client.complete(bad, budget)).toStrictEqual({ claim: null, abstainReason: "answer-malformed:unparseable" })
  })

  it("a block whose JSON has an empty `claim` ⇒ tagged malformed", () => {
    const client = createCommandClient({ cmd: "cat", args: [] }, "block")
    expect(client.complete(block("   "), budget)).toStrictEqual({
      claim: null,
      abstainReason: "answer-malformed:unparseable",
    })
  })

  it("the explicit abstain sentinel still abstains in block mode (checked before the block leg)", () => {
    const client = createCommandClient({ cmd: "cat", args: [] }, "block")
    expect(client.complete(ABSTAIN_SENTINEL, budget)).toStrictEqual({ claim: null })
  })
})
