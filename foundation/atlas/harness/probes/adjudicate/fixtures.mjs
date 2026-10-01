// harness/probes/adjudicate/fixtures.mjs — the LABELED calibration ground-truth.
//
// Twenty (fact, code) pairs whose truth is DECIDED HERE, by construction, so a real judge's verdicts can be
// scored against a known answer:
//
//   • 10 GROUNDED-TRUE pairs — the fact is anchored in the code and is a true statement about it.
//   • 10 PLANTED-FALSE pairs — the fact MENTIONS the anchored code (so a shallow "is it about this code?"
//     grounding check passes) but ASSERTS SOMETHING FALSE about it. This is the exact failure the #95
//     baseline shipped: grounding is aboutness, not truth, and 9 false facts walked through an aboutness
//     gate. Each false fixture names its `falseKind` so the calibration report can show WHICH kinds of lie
//     the judge does and does not catch.
//
// These are deliberately small, self-contained snippets — the point is a clean truth label, not repo
// fidelity. Every `code` is real, compilable-looking source; every `fact` is the kind of one-sentence claim
// Atlas's PROPOSE step emits. Nothing here is promoted to any store; it is test ground-truth only.
//
// falseKind vocabulary (the lies the #95 residue is made of):
//   past-comment-as-present — a stale comment describes old behaviour; the fact reports the comment as the
//                             code's current behaviour (the dominant #201/#95 failure).
//   wrong-callee            — the fact names a different function/method than the code actually calls.
//   wrong-constant          — the fact states a numeric/string constant that differs from the code's.
//   negated-condition       — the fact inverts a guard/branch (says "when X" where code does "when not X").
//   wrong-default           — the fact reports a default value the code does not use.
//   fabricated-behavior     — the fact asserts a behaviour (retry, cache, throw) the code does not perform.
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

/** @typedef {{
 *   id: string,
 *   label: 'true' | 'false',
 *   falseKind?: string,
 *   anchor: string,          // the symbol/path the fact is anchored to (shown to the judge)
 *   code: string,            // the source the fact must be judged against
 *   fact: string             // the mined claim under adjudication
 * }} Fixture */

/** @type {Fixture[]} */
export const FIXTURES = [
  // ── 10 GROUNDED-TRUE ──────────────────────────────────────────────────────────────────────────────────
  {
    id: "T01",
    label: "true",
    anchor: "retryWithBackoff",
    code: `function retryWithBackoff(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return fn(); } catch (e) { lastErr = e; sleep(2 ** i * 100); }
  }
  throw lastErr;
}`,
    fact: "retryWithBackoff retries up to 3 times by default, sleeping 2**i * 100 ms between attempts, and rethrows the last error when all attempts fail.",
  },
  {
    id: "T02",
    label: "true",
    anchor: "parsePort",
    code: `function parsePort(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new RangeError('bad port');
  return n;
}`,
    fact: "parsePort throws a RangeError for any value that is not an integer in the inclusive range 1..65535.",
  },
  {
    id: "T03",
    label: "true",
    anchor: "isAbstainToken",
    code: `const ABSTAIN = 'NO-FACT';
function isAbstainToken(s) {
  return s.trim().toUpperCase() === ABSTAIN;
}`,
    fact: 'isAbstainToken treats the answer as an abstention when, after trimming and upper-casing, it equals the sentinel "NO-FACT".',
  },
  {
    id: "T04",
    label: "true",
    anchor: "clamp",
    code: `const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);`,
    fact: "clamp returns x bounded to the [lo, hi] interval via Math.min(Math.max(x, lo), hi).",
  },
  {
    id: "T05",
    label: "true",
    anchor: "CacheStore.get",
    code: `class CacheStore {
  constructor() { this.map = new Map(); }
  get(key) { return this.map.has(key) ? this.map.get(key) : null; }
}`,
    fact: "CacheStore.get returns null when the key is absent from the backing Map rather than undefined.",
  },
  {
    id: "T06",
    label: "true",
    anchor: "openRecord",
    code: `function openRecord(dir, id) {
  return openSync(join(dir, id + '.jsonl'), 'wx');
}`,
    fact: "openRecord opens the record file with the wx flag (O_CREAT|O_EXCL), so the create fails if the name already exists.",
  },
  {
    id: "T07",
    label: "true",
    anchor: "dedupe",
    code: `function dedupe(items) {
  return [...new Set(items)];
}`,
    fact: "dedupe removes duplicate items by round-tripping the array through a Set, preserving first-seen order.",
  },
  {
    id: "T08",
    label: "true",
    anchor: "httpGetJson",
    code: `async function httpGetJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}`,
    fact: "httpGetJson throws an Error containing the status code when the response is not ok, and otherwise parses the body as JSON.",
  },
  {
    id: "T09",
    label: "true",
    anchor: "toSlug",
    code: `const toSlug = (s) => s.toLowerCase().trim().replace(/\\s+/g, '-');`,
    fact: "toSlug lowercases and trims the input, then replaces each run of whitespace with a single hyphen.",
  },
  {
    id: "T10",
    label: "true",
    anchor: "DEFAULT_TIMEOUT_MS",
    code: `const DEFAULT_TIMEOUT_MS = 180_000;
function withTimeout(fn, ms = DEFAULT_TIMEOUT_MS) { /* ... */ }`,
    fact: "withTimeout defaults its timeout to DEFAULT_TIMEOUT_MS, which is 180000 ms.",
  },

  // ── 10 PLANTED-FALSE ──────────────────────────────────────────────────────────────────────────────────
  {
    id: "F01",
    label: "false",
    falseKind: "wrong-constant",
    anchor: "retryWithBackoff",
    code: `function retryWithBackoff(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return fn(); } catch (e) { lastErr = e; sleep(2 ** i * 100); }
  }
  throw lastErr;
}`,
    fact: "retryWithBackoff retries up to 5 times by default before rethrowing.",
  },
  {
    id: "F02",
    label: "false",
    falseKind: "negated-condition",
    anchor: "parsePort",
    code: `function parsePort(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new RangeError('bad port');
  return n;
}`,
    fact: "parsePort returns the number for values outside 1..65535 and throws only for values inside that range.",
  },
  {
    id: "F03",
    label: "false",
    falseKind: "wrong-constant",
    anchor: "isAbstainToken",
    code: `const ABSTAIN = 'NO-FACT';
function isAbstainToken(s) {
  return s.trim().toUpperCase() === ABSTAIN;
}`,
    fact: 'isAbstainToken treats the answer as an abstention when it equals the sentinel "ABSTAIN".',
  },
  {
    id: "F04",
    label: "false",
    falseKind: "wrong-callee",
    anchor: "clamp",
    code: `const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);`,
    fact: "clamp bounds x to [lo, hi] using Math.round together with Math.abs.",
  },
  {
    id: "F05",
    label: "false",
    falseKind: "wrong-default",
    anchor: "CacheStore.get",
    code: `class CacheStore {
  constructor() { this.map = new Map(); }
  get(key) { return this.map.has(key) ? this.map.get(key) : null; }
}`,
    fact: "CacheStore.get returns undefined when the key is absent from the backing Map.",
  },
  {
    id: "F06",
    label: "false",
    falseKind: "past-comment-as-present",
    anchor: "openRecord",
    code: `function openRecord(dir, id) {
  // was: openSync(path, 'a') — appended to a per-second filename, which collided under concurrency
  return openSync(join(dir, id + '.jsonl'), 'wx');
}`,
    fact: 'openRecord opens the record file with the append flag "a" and names it by the current epoch second.',
  },
  {
    id: "F07",
    label: "false",
    falseKind: "fabricated-behavior",
    anchor: "dedupe",
    code: `function dedupe(items) {
  return [...new Set(items)];
}`,
    fact: "dedupe sorts the items and removes duplicates, returning them in ascending order.",
  },
  {
    id: "F08",
    label: "false",
    falseKind: "fabricated-behavior",
    anchor: "httpGetJson",
    code: `async function httpGetJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}`,
    fact: "httpGetJson retries the request up to three times on a non-ok response before throwing.",
  },
  {
    id: "F09",
    label: "false",
    falseKind: "wrong-callee",
    anchor: "toSlug",
    code: `const toSlug = (s) => s.toLowerCase().trim().replace(/\\s+/g, '-');`,
    fact: "toSlug uppercases the input and replaces whitespace with underscores.",
  },
  {
    id: "F10",
    label: "false",
    falseKind: "wrong-constant",
    anchor: "DEFAULT_TIMEOUT_MS",
    code: `const DEFAULT_TIMEOUT_MS = 180_000;
function withTimeout(fn, ms = DEFAULT_TIMEOUT_MS) { /* ... */ }`,
    fact: "withTimeout defaults its timeout to DEFAULT_TIMEOUT_MS, which is 30000 ms.",
  },
]

/**
 * Render the adjudication prompt for one fixture. Model-agnostic prose: it states the anchor, shows the
 * code, states the fact, and demands EXACTLY ONE verdict token on the final line. The token vocabulary
 * matches fleiss.mjs CATEGORIES. Any judge family can answer this; nothing here is Claude-specific.
 * @param {Fixture} fx
 * @returns {string}
 */
export function renderPrompt(fx) {
  return `You are adjudicating whether a mined FACT is a true statement about the CODE it is anchored to.

A fact is GROUNDED_TRUE only if it is BOTH about this code AND a true statement about what this code actually does.
A fact is HALLUCINATED if it is about this code but asserts something the code does NOT do (wrong constant, wrong callee, inverted condition, a behaviour the code lacks, or a stale comment reported as current behaviour).
If you genuinely cannot decide from the code shown, answer ABSTAIN.

ANCHOR: ${fx.anchor}

CODE:
${fx.code}

FACT:
${fx.fact}

Think briefly, then output your verdict as the LAST line, exactly one of these tokens and nothing else on that line:
GROUNDED_TRUE
HALLUCINATED
ABSTAIN`
}
