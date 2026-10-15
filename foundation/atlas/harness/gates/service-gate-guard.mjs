#!/usr/bin/env node
// harness/gates/service-gate-guard.mjs — THE TRIPWIRE.
//
// WHY THIS EXISTS. Atlas is a LOCAL developer tool whose authority model is, by its own reference
// (`docs/reference/atlas-architecture.md` §3.3), an ANTI-ACCIDENT GUARDRAIL and not an adversarial control:
// `actor` is an unauthenticated claim from an env var (pinned by `adapter-io/test/actor-is-unauthenticated
// .test.ts`), the policy file is world-readable AND world-writable (`adapter-io/src/policy.ts`), the
// `repoPath` a runtime is composed over is never validated for containment (`adapter-io/src/compose.ts`),
// and the SCIP/AST read path has no size cap and no timeout (`adapter-io/src/scip.ts`, in contrast to the
// CAS's 64 MiB cap in `store.ts`). ARCH-12 states the consequence in the constitution's own words: if the
// transport ever becomes remote or multi-tenant, those become LIVE vulnerabilities and MUST be closed
// BEFORE that transport ships.
//
// The failure this gate prevents is not a bug — it is a SEQUENCE. The cheapest way to get something running
// is to wrap the existing stdio server in a thin network proxy "just for a demo", and on that day every
// weakness above is reachable from the internet at once. A plan document cannot stop that: it is prose, and
// relying on a reader to honour an ordering is exactly the enforcement ARCH-11 itself rejects —
// "a property of what the leg can reach, NOT of a reviewer noticing".
//
// So the ordering is made STRUCTURAL: introducing any non-stdio transport turns this gate RED, and the only
// way to green it is to commit the ledger below, which is a reviewable act that names what was closed.
//
// WHAT IT REFUSES. Any `packages/**/src/**.ts` that imports a network transport or a node network module, or
// that opens a listener. `StdioServerTransport` is the ONE allowed transport — a stdio pipe has no network
// surface, no session and no remote principal, which is why the current posture is honest.
//
// HOW TO OPEN IT (deliberately, not accidentally). Create `docs/design/SERVICE-GATES-OPEN.md` declaring, per
// item, that the Gate-B work is DONE with links to its evidence. This gate then requires that file to name
// every one of the four blockers below. It does not verify the work — it cannot; it forces the claim to be
// written down, dated and reviewable, so shipping a transport is a decision somebody signed rather than a
// commit that slipped through.
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

import { readFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"

const REPO = new URL("../..", import.meta.url).pathname.replace(/\/$/, "")
const LEDGER = "docs/design/SERVICE-GATES-OPEN.md"

/** The four blockers ARCH-12 and the hardening plan name. The ledger must address each BY NAME. */
const BLOCKERS = ["identity", "isolation", "policy-integrity", "resource-limits"]

/** The one transport whose posture the current threat model actually covers. */
const ALLOWED = "StdioServerTransport"

/** Network surface: a transport that is not stdio, a node network module, or a listener. */
const FORBIDDEN = [
  [/\bSSEServerTransport\b/, "SSE transport"],
  [/\bStreamableHTTPServerTransport\b/, "streamable HTTP transport"],
  [/\bWebSocketServerTransport\b/, "websocket transport"],
  [/from\s+['"]node:(https?|net|tls|dgram)['"]/, "node network module"],
  [/require\(\s*['"]node:(https?|net|tls|dgram)['"]\s*\)/, "node network module"],
  [/from\s+['"](express|fastify|koa|hapi|ws)['"]/, "network server framework"],
  [/\.listen\s*\(/, "a listener"],
]

function sourceFiles() {
  // git ls-files: tracked sources only — never node_modules, never dist, never an untracked scratch file.
  const out = execFileSync("git", ["ls-files", "packages/*/src/**/*.ts", "packages/*/src/*.ts"], {
    cwd: REPO,
    encoding: "utf8",
  })
  return out.split("\n").filter((l) => l.endsWith(".ts"))
}

const files = sourceFiles()
if (files.length === 0) {
  // NEVER conclude absence from empty output — an empty file list means the lister broke, not that the repo
  // has no sources. Fail loudly rather than passing vacuously.
  console.error("service-gate-guard: FAIL — listed ZERO source files; the lister is broken, not the repo.")
  process.exit(2)
}

const hits = []
for (const rel of files) {
  const text = readFileSync(`${REPO}/${rel}`, "utf8")
  for (const [re, what] of FORBIDDEN) {
    const m = re.exec(text)
    if (m === null) continue
    const line = text.slice(0, m.index).split("\n").length
    hits.push({ rel, line, what, snippet: m[0].trim() })
  }
}

const ledgerPath = `${REPO}/${LEDGER}`
const ledgerOpen = existsSync(ledgerPath)
const ledgerText = ledgerOpen ? readFileSync(ledgerPath, "utf8") : ""
const missing = BLOCKERS.filter((b) => !ledgerText.includes(b))

if (hits.length === 0) {
  console.log(
    `service-gate-guard: OK — ${files.length} source files scanned, no network transport. ` +
      `The only transport is ${ALLOWED} (stdio: no network surface, no session, no remote principal).`,
  )
  if (ledgerOpen) {
    console.log(`  NOTE: ${LEDGER} exists, but no network transport is present — the gate is open and unused.`)
  }
  process.exit(0)
}

// A network transport IS present. It is only allowed behind a complete, committed ledger.
if (ledgerOpen && missing.length === 0) {
  console.log(
    `service-gate-guard: OK — network transport present AND ${LEDGER} addresses all ${BLOCKERS.length} blockers.`,
  )
  console.log("  This gate does NOT verify the work. It records that somebody signed for it.")
  for (const h of hits) console.log(`    · ${h.rel}:${h.line} — ${h.what} (${h.snippet})`)
  process.exit(0)
}

console.error("service-gate-guard: FAIL — a NETWORK TRANSPORT is present while the service gates are shut.\n")
for (const h of hits) console.error(`  ✗ ${h.rel}:${h.line} — ${h.what}: ${h.snippet}`)
console.error(`\n  Atlas's authority model is an ANTI-ACCIDENT guardrail, not an adversarial control`)
console.error(`  (reference/atlas-architecture.md §3.3). With a remote transport these become LIVE:`)
console.error(`    · identity        — actor is an unauthenticated env-var claim`)
console.error(`    · isolation       — repoPath is never validated for containment`)
console.error(`    · policy-integrity— the policy file is world-writable`)
console.error(`    · resource-limits — the SCIP/AST read path has no size cap and no timeout`)
console.error(`\n  ARCH-12: these MUST be closed BEFORE a remote transport ships.`)
if (!ledgerOpen) {
  console.error(`\n  To open the gate deliberately, commit ${LEDGER} declaring each blocker closed, with evidence.`)
} else {
  console.error(`\n  ${LEDGER} exists but does not address: ${missing.join(", ")}`)
}
process.exit(1)
