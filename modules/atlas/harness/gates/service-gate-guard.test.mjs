// harness/gates/service-gate-guard.test.mjs — TEETH for the tripwire.
//
// A gate that cannot go red is decoration (`docs/requirements/work-packages/wp-gates-that-cannot-fail.md`).
// These tests plant the exact defect the gate exists to catch and assert it FAILS, then assert the
// deliberate escape hatch works, then assert the escape hatch cannot be opened by an EMPTY gesture.
//
// The guard is run as a SUBPROCESS against a scratch git repo, never imported — it is a gate, and what is
// under test is the gate's VERDICT (exit code), not its internals.

import { describe, it, expect } from "vitest"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const GUARD = new URL("./service-gate-guard.mjs", import.meta.url).pathname

/** A scratch repo with one tracked source file. The guard lists via `git ls-files`, so it MUST be a repo. */
function scratch(sourceBody, ledger) {
  const dir = mkdtempSync(join(tmpdir(), "svc-gate-"))
  mkdirSync(join(dir, "harness", "gates"), { recursive: true })
  mkdirSync(join(dir, "packages", "mcp-server", "src"), { recursive: true })
  cpSync(GUARD, join(dir, "harness", "gates", "service-gate-guard.mjs"))
  writeFileSync(join(dir, "packages", "mcp-server", "src", "server.ts"), sourceBody)
  if (ledger !== undefined) {
    mkdirSync(join(dir, "docs", "design"), { recursive: true })
    writeFileSync(join(dir, "docs", "design", "SERVICE-GATES-OPEN.md"), ledger)
  }
  execFileSync("git", ["init", "-q"], { cwd: dir })
  execFileSync("git", ["add", "-A"], { cwd: dir })
  return dir
}

function runGuard(dir) {
  const r = spawnSync("node", [join(dir, "harness", "gates", "service-gate-guard.mjs")], { encoding: "utf8" })
  return { code: r.status, out: `${r.stdout}${r.stderr}` }
}

const STDIO_ONLY = `
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
export const t = new StdioServerTransport();
`

const FULL_LEDGER = `# Service gates open
identity: closed, see X. isolation: closed, see Y.
policy-integrity: closed, see Z. resource-limits: closed, see W.
`

describe("service-gate-guard — the tripwire bites", () => {
  it("is GREEN on stdio only (the shipped posture)", () => {
    const dir = scratch(STDIO_ONLY)
    try {
      const { code, out } = runGuard(dir)
      expect(out).toContain("no network transport")
      expect(code).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // ── the planted defects: each is a way somebody actually ships a remote transport ──────────────────
  const PLANTED = {
    "an SSE transport": `import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';`,
    "a streamable HTTP transport": `import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/http.js';`,
    "a raw node http import": `import { createServer } from 'node:http';`,
    "a node net import": `import { Socket } from 'node:net';`,
    "an express dependency": `import express from 'express';`,
    "a bare listener": `const s = make(); s.listen(8080);`,
  }

  for (const [label, line] of Object.entries(PLANTED)) {
    it(`goes RED on ${label}`, () => {
      const dir = scratch(`${STDIO_ONLY}\n${line}\n`)
      try {
        const { code, out } = runGuard(dir)
        expect(code).toBe(1)
        expect(out).toContain("NETWORK TRANSPORT is present")
        // the refusal must NAME the four blockers, not just say no
        for (const b of ["identity", "isolation", "policy-integrity", "resource-limits"]) {
          expect(out).toContain(b)
        }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }

  it("OPENS when the ledger addresses every blocker — the deliberate escape hatch", () => {
    const dir = scratch(`${STDIO_ONLY}\nimport { createServer } from 'node:http';\n`, FULL_LEDGER)
    try {
      const { code, out } = runGuard(dir)
      expect(code).toBe(0)
      expect(out).toContain("addresses all 4 blockers")
      // it must NOT claim to have verified the work — only that somebody signed
      expect(out).toContain("does NOT verify the work")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("STAYS RED on a ledger that exists but is empty — the hatch is not a gesture", () => {
    const dir = scratch(`${STDIO_ONLY}\nimport { createServer } from 'node:http';\n`, "# Service gates open\n")
    try {
      const { code, out } = runGuard(dir)
      expect(code).toBe(1)
      expect(out).toContain("does not address")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("STAYS RED on a ledger missing even ONE blocker", () => {
    const partial = "# open\nidentity ok. isolation ok. policy-integrity ok.\n" // resource-limits absent
    const dir = scratch(`${STDIO_ONLY}\nimport { createServer } from 'node:http';\n`, partial)
    try {
      const { code, out } = runGuard(dir)
      expect(code).toBe(1)
      expect(out).toContain("resource-limits")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("FAILS LOUDLY if it lists zero files — never passes vacuously", () => {
    const dir = mkdtempSync(join(tmpdir(), "svc-gate-empty-"))
    try {
      mkdirSync(join(dir, "harness", "gates"), { recursive: true })
      cpSync(GUARD, join(dir, "harness", "gates", "service-gate-guard.mjs"))
      execFileSync("git", ["init", "-q"], { cwd: dir })
      const { code, out } = runGuard(dir)
      expect(code).toBe(2)
      expect(out).toContain("listed ZERO source files")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
