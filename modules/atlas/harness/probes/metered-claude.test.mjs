// harness/probes/metered-claude.test.mjs — calibration of the A3 metering wrapper.
//
// A metering instrument nobody watched succeed is worth nothing: it could pass the model's answer through
// perfectly and silently drop every cost line, or price the call and mangle the answer Atlas admits. So this
// drives `metered-claude.mjs` as a REAL subprocess in front of a FAKE `claude` (a tiny shim that echoes a
// canned JSON envelope, injected via METERED_CLAUDE_BIN — NO real model call, ever) and pins four things:
//   (a) on a normal envelope, stdout === the canned `result` VERBATIM (the `--output-format text` contract);
//   (b) the sidecar gains one line with the exact token numbers and cost;
//   (c) an is_error envelope ⇒ EMPTY stdout (abstention) + a sidecar line with abstained:true;
//   (c3) the abstain sentinel NO-FACT ⇒ sidecar abstained:true while the token still flows to stdout (#201);
//   (d) a missing ATLAS_COST_SIDECAR exits 3 (fail-loud: nowhere to record = silent-loss bug).
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

import { describe, it, expect } from "vitest"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const WRAPPER = join(HERE, "metered-claude.mjs")
const COST_SUM = join(HERE, "cost-sum.mjs")

/** A realistic prompt carrying the `<unit …>` header both shipped templates emit — the string the wrapper
 *  recovers the pool-safe site key from (see `deriveSiteKey`). */
function promptFor(path, name) {
  return `You are proposing a fact.\n<unit path="${path}" name="${name}">\nexport const x = 1;\n</unit>\n`
}

/** A fake `claude`: ignores args, drains stdin (so the parent never EPIPEs), echoes the JSON in FAKE_CLAUDE_JSON. */
const FAKE_SRC = `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
readFileSync(0); // drain the prompt so the wrapper's pipe write completes
process.stdout.write(process.env.FAKE_CLAUDE_JSON || '{}');
`

function makeFake(dir) {
  const p = join(dir, "fake-claude.mjs")
  writeFileSync(p, FAKE_SRC)
  chmodSync(p, 0o755)
  return p
}

/** Run the wrapper with a prompt, a fake claude, a canned JSON, and (optionally) a sidecar path. */
function runWrapper({ dir, sidecar, cannedJson, prompt = "the prompt", fakeBin }) {
  return spawnSync(process.execPath, [WRAPPER], {
    input: prompt,
    encoding: "utf8",
    env: {
      ...process.env,
      METERED_MODEL: "claude-sonnet-4-6",
      METERED_CLAUDE_BIN: fakeBin ?? makeFake(dir),
      FAKE_CLAUDE_JSON: cannedJson,
      ...(sidecar ? { ATLAS_COST_SIDECAR: sidecar } : { ATLAS_COST_SIDECAR: "" }),
    },
  })
}

function readSidecar(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l))
}

describe("metered-claude wrapper (A3 cost metering)", () => {
  it("(a)+(b) passes result verbatim to stdout and records tokens+cost to the sidecar", () => {
    const dir = mkdtempSync(join(tmpdir(), "metered-ok-"))
    try {
      const sidecar = join(dir, "cost.jsonl")
      const result = "FACT: foo depends on bar.\nSECOND LINE."
      const canned = JSON.stringify({
        is_error: false,
        result,
        total_cost_usd: 0.0123,
        duration_api_ms: 4321,
        usage: {
          input_tokens: 1500,
          output_tokens: 42,
          cache_read_input_tokens: 900,
          cache_creation_input_tokens: 10,
        },
      })
      const r = runWrapper({ dir, sidecar, cannedJson: canned })
      expect(r.status).toBe(0)
      // (a) verbatim, newline preserved, nothing trimmed
      expect(r.stdout).toBe(result)

      // (b) exactly one sidecar line with the exact numbers
      const rows = readSidecar(sidecar)
      expect(rows.length).toBe(1)
      const rec = rows[0]
      expect(rec.model).toBe("claude-sonnet-4-6")
      expect(rec.input_tokens).toBe(1500)
      expect(rec.output_tokens).toBe(42)
      expect(rec.cache_read_input_tokens).toBe(900)
      expect(rec.cache_creation_input_tokens).toBe(10)
      expect(rec.total_cost_usd).toBe(0.0123)
      expect(rec.duration_api_ms).toBe(4321)
      expect(rec.is_error).toBe(false)
      expect(rec.abstained).toBe(false)
      expect(typeof rec.ts).toBe("string")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("(b) appends — a second call never truncates the first", () => {
    const dir = mkdtempSync(join(tmpdir(), "metered-append-"))
    try {
      const sidecar = join(dir, "cost.jsonl")
      const fakeBin = makeFake(dir)
      const canned = JSON.stringify({
        is_error: false,
        result: "x",
        total_cost_usd: 0.001,
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      })
      runWrapper({ dir, sidecar, cannedJson: canned, fakeBin })
      runWrapper({ dir, sidecar, cannedJson: canned, fakeBin })
      expect(readSidecar(sidecar).length).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("(c) is_error envelope ⇒ empty stdout (abstention) + sidecar line with abstained:true", () => {
    const dir = mkdtempSync(join(tmpdir(), "metered-err-"))
    try {
      const sidecar = join(dir, "cost.jsonl")
      const canned = JSON.stringify({
        is_error: true,
        result: "should be ignored",
        total_cost_usd: 0.002,
        usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      })
      const r = runWrapper({ dir, sidecar, cannedJson: canned })
      expect(r.status).toBe(0)
      expect(r.stdout).toBe("") // abstention: nothing on stdout
      const rows = readSidecar(sidecar)
      expect(rows.length).toBe(1)
      expect(rows[0].is_error).toBe(true)
      expect(rows[0].abstained).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("(c2) empty/whitespace result ⇒ abstention even when is_error is false", () => {
    const dir = mkdtempSync(join(tmpdir(), "metered-empty-"))
    try {
      const sidecar = join(dir, "cost.jsonl")
      const canned = JSON.stringify({
        is_error: false,
        result: "   \n  ",
        total_cost_usd: 0.0005,
        usage: { input_tokens: 50, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      })
      const r = runWrapper({ dir, sidecar, cannedJson: canned })
      expect(r.stdout).toBe("")
      expect(readSidecar(sidecar)[0].abstained).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("(c3) the abstain SENTINEL ⇒ sidecar abstained:true, yet the token still flows to stdout (#201)", () => {
    // After the #201 fix the model abstains by emitting the NON-empty token NO-FACT. The wrapper must (1)
    // book it as an abstention in the sidecar (else the abstention-rate reading lies), AND (2) still pass the
    // bytes THROUGH — Atlas's own isAbstainToken gate is the authority that maps it, so a metered run
    // exercises the real path. Both a bare token and a markdown-backtick-wrapped one (the measured Sonnet 4.6
    // case) must be recognised.
    for (const result of ["NO-FACT", "`NO-FACT`", "  no-fact \n"]) {
      const dir = mkdtempSync(join(tmpdir(), "metered-sentinel-"))
      try {
        const sidecar = join(dir, "cost.jsonl")
        const canned = JSON.stringify({
          is_error: false,
          result,
          total_cost_usd: 0.004,
          usage: { input_tokens: 800, output_tokens: 7, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        })
        const r = runWrapper({ dir, sidecar, cannedJson: canned })
        expect(r.status).toBe(0)
        expect(r.stdout).toBe(result) //            (2) token passed through VERBATIM, Atlas's gate maps it
        const rec = readSidecar(sidecar)[0]
        expect(rec.abstained).toBe(true) //         (1) sidecar tells the truth about the outcome
        expect(rec.total_cost_usd).toBe(0.004) //   cost is still recorded — an abstention is not free
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it("(e) records a pool-safe site key: qualifiedPath + prompt_sha256 on every row (defect a)", () => {
    const dir = mkdtempSync(join(tmpdir(), "metered-sitekey-"))
    try {
      const sidecar = join(dir, "cost.jsonl")
      const fakeBin = makeFake(dir)
      const canned = JSON.stringify({
        is_error: false,
        result: "FACT: x is 1.",
        total_cost_usd: 0.01,
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      })
      // A symbol anchor (path !== name) reconstructs to `path::name`; a file anchor (path === name) stays bare.
      runWrapper({ dir, sidecar, cannedJson: canned, fakeBin, prompt: promptFor("src/a.ts", "foo") })
      runWrapper({ dir, sidecar, cannedJson: canned, fakeBin, prompt: promptFor("README.md", "README.md") })
      const rows = readSidecar(sidecar)
      expect(rows[0].site).toBe("src/a.ts::foo")
      expect(rows[1].site).toBe("README.md")
      // prompt_sha256 is always present, 64 lowercase hex, and DIFFERS across distinct sites — the pool-safe join key.
      for (const rec of rows) expect(rec.prompt_sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(rows[0].prompt_sha256).not.toBe(rows[1].prompt_sha256)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("(e2) the site key is present even on an error/abstain row, and null when the template omits <unit>", () => {
    const dir = mkdtempSync(join(tmpdir(), "metered-sitekey-err-"))
    try {
      const sidecar = join(dir, "cost.jsonl")
      const fakeBin = makeFake(dir)
      // error envelope, with a <unit> header ⇒ site still recovered
      runWrapper({
        dir,
        sidecar,
        cannedJson: JSON.stringify({ is_error: true, result: "x", usage: {} }),
        fakeBin,
        prompt: promptFor("src/b.ts", "bar"),
      })
      // a prompt with no <unit> header ⇒ site null, but prompt_sha256 still present
      runWrapper({
        dir,
        sidecar,
        cannedJson: JSON.stringify({ is_error: false, result: "ok", total_cost_usd: 0.001, usage: {} }),
        fakeBin,
        prompt: "a bare prompt with no unit header",
      })
      const rows = readSidecar(sidecar)
      expect(rows[0].site).toBe("src/b.ts::bar")
      expect(rows[0].prompt_sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(rows[1].site).toBe(null)
      expect(rows[1].prompt_sha256).toMatch(/^[0-9a-f]{64}$/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("(f) cost-sum FAILS LOUD on a null-cost non-error row and does not book it as $0 (defect b)", () => {
    const dir = mkdtempSync(join(tmpdir(), "metered-nullcost-"))
    try {
      const sidecar = join(dir, "cost.jsonl")
      const fakeBin = makeFake(dir)
      // (1) a PRICED success — a real dollar the mean must be built from.
      runWrapper({
        dir,
        sidecar,
        cannedJson: JSON.stringify({
          is_error: false,
          result: "priced",
          total_cost_usd: 0.02,
          usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        }),
        fakeBin,
        prompt: promptFor("src/priced.ts", "p"),
      })
      // (2) a success whose envelope LACKS total_cost_usd — the wrapper records null; the reducer must flag it.
      runWrapper({
        dir,
        sidecar,
        cannedJson: JSON.stringify({
          is_error: false,
          result: "blind",
          usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        }),
        fakeBin,
        prompt: promptFor("src/blind.ts", "b"),
      })
      // (3) an ERROR call (null cost is legitimate here) — must NOT be counted as a null-cost defect.
      runWrapper({
        dir,
        sidecar,
        cannedJson: JSON.stringify({ is_error: true, result: "x", usage: {} }),
        fakeBin,
        prompt: promptFor("src/err.ts", "e"),
      })

      // the wrapper booked the missing price as null, not 0 (proves the null actually reaches the reducer)
      const rows = readSidecar(sidecar)
      expect(rows[1].total_cost_usd).toBe(null)

      const cs = spawnSync(process.execPath, [COST_SUM, sidecar], { encoding: "utf8" })
      expect(cs.status).toBe(1) //                         fail-loud, non-zero exit
      expect(cs.stdout).toMatch(/null_cost_calls:\s+1/) // exactly the one blind non-error call
      expect(cs.stdout).toMatch(/errors:\s+1/) //          the error call counted separately, not as null-cost
      expect(cs.stdout).toMatch(/priced_calls:\s+1/) //    only the one truly-priced call feeds the mean
      // mean is over PRICED calls: $0.02 / 1, never diluted by the error or the blind call.
      expect(cs.stdout).toMatch(/mean_cost_per_priced_call:\s+0\.020000/)
      expect(cs.stdout).toMatch(/total_cost_usd:\s+0\.020000/) // the null call is NOT summed as $0-into-the-total
      expect(cs.stderr).toMatch(/BLIND FLOOR/) //          the prominent banner
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("(f2) cost-sum exits 0 cleanly when every non-error call is priced", () => {
    const dir = mkdtempSync(join(tmpdir(), "metered-allpriced-"))
    try {
      const sidecar = join(dir, "cost.jsonl")
      const fakeBin = makeFake(dir)
      const canned = JSON.stringify({
        is_error: false,
        result: "ok",
        total_cost_usd: 0.005,
        usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      })
      runWrapper({ dir, sidecar, cannedJson: canned, fakeBin, prompt: promptFor("src/a.ts", "a") })
      runWrapper({ dir, sidecar, cannedJson: canned, fakeBin, prompt: promptFor("src/b.ts", "b") })
      const cs = spawnSync(process.execPath, [COST_SUM, sidecar], { encoding: "utf8" })
      expect(cs.status).toBe(0)
      expect(cs.stdout).toMatch(/null_cost_calls:\s+0/)
      expect(cs.stdout).toMatch(/mean_cost_per_priced_call:\s+0\.005000/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("(d) missing ATLAS_COST_SIDECAR exits 3 (fail loud)", () => {
    const dir = mkdtempSync(join(tmpdir(), "metered-nosidecar-"))
    try {
      const canned = JSON.stringify({ is_error: false, result: "x", usage: {} })
      const r = runWrapper({ dir, sidecar: null, cannedJson: canned })
      expect(r.status).toBe(3)
      expect(r.stderr).toMatch(/ATLAS_COST_SIDECAR/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
