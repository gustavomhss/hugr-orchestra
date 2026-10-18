#!/usr/bin/env node
// spec-conformance-guard — mechanically ties the SHIPPED code to what the SPECS claim, so a future
// edit that drifts one from the other fails CI instead of surviving on human review alone.
//
// Three checks:
//   (1) CODE-SURFACE PIN — the shipped `GOVERNANCE_SURFACE` / `WRITE_PATHS` / `READ_SURFACE` (the single
//       source of truth) must equal the ratified canonical sets, and `READ_SURFACE` must stay DISJOINT from
//       both governed constants. Changing any surface is a deliberate edit to THIS pin, reviewable in one
//       place (INV-TOOLS-1 / ADR-0003; READ_SURFACE / ENTRY-MCP-3 / ADR-0005).
//   (2) DOC ANTI-DRIFT — no canonical doc or source/test comment may reintroduce the pre-amendment
//       "single write door / four tools / four-leg / cardinality==4 / no fifth" governance-count forms.
//       (Excludes the ADR-narrative, the TOOLS-15 store-row-medium term-of-art, and doctor's four READ legs.)
//   (3) DIGEST TRIPWIRE — every `@sha256:` pin in properties-tls.md must equal the current whole-file
//       digest of method-tags-tls.md, so an upstream method-tag edit that isn't re-frozen fails here.
//
// Run: `npm run spec-conformance-guard` (needs `npm run build` first — check 1 imports the built dist).

import { readFileSync, readdirSync, statSync } from "node:fs"
import { createHash } from "node:crypto"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
// The drift vocabulary lives in its own module so it can be exercised by a test (drift-patterns.test.mjs)
// without importing this file's top-level sweep + process.exit. A regex nobody can falsify is not a gate.
import { isStaleGovernanceClaim } from "../lib/drift-patterns.mjs"

const REPO = process.env.SPEC_CONFORMANCE_GUARD_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const problems = []

// ── (1) CODE-SURFACE PIN ────────────────────────────────────────────────────────────────────────
// [EXTENDED — WP-11.W8 / CAMPAIGN-11] `atlas-memory-emit` joins `GOVERNANCE_SURFACE`/`WRITE_PATHS` as a
// genuinely NEW governed write door — the durable per-seat memory log (`.atlas/memory.jsonl`) is a SEPARATE
// store from the knowledge CAS `atlas-emit` writes, so ADR-0008's "ordinary use of the existing door"
// reasoning does not apply here. Growth is licensed by ADR-0006 Decision 2 (GOVERNANCE_SURFACE is DERIVED
// and BUDGETED — `advertised ≡ invocable ≡ Tool`, bounded at 30 — not a re-fixed count).
const EXPECTED_SURFACE = [
  "atlas-init",
  "atlas-query",
  "atlas-emit",
  "atlas-reconcile",
  "atlas-link",
  "atlas-memory-emit",
]
const EXPECTED_WRITE_PATHS = ["atlas-emit", "atlas-link", "atlas-memory-emit"]
// [WP-10.A5.TOOLS, ADR-0005 / ENTRY-MCP-3] `READ_SURFACE` — the disjoint planner/read-projection set MCP
// advertises alongside `GOVERNANCE_SURFACE`. Membership transcribed from the ADR's Decision (reconciled
// 2026-08-24) + A-D2: the four ADR-0004 authoring planners (anchors/slots/draft/check) + the two
// already-shipped, ALREADY-INVOCABLE read projections (doctor/node). `atlas-diff` is DELIBERATELY EXCLUDED
// (owner-decided): it is a declared zero-caller reference model, unwired to any transport — ARCH-5
// (advertised≡invocable) forbids an unwired door in an advertised surface. Re-add only alongside real wiring.
// [EXTENDED — WP-11.W8 / CAMPAIGN-11] the CAMPAIGN-11 memory read doors join — `atlas-memory-recall`
// (MEM-4b explicit recall), `atlas-memory-header` (MEM-1/4/7 turn header), `atlas-memory-awareness` and
// `atlas-memory-orientation` (the two derived, shared slabs) — the read half of the memory doors, mirroring
// how `atlas-emit`/`atlas-link` pair with the knowledge/sameAs read doors.
const EXPECTED_READ_SURFACE = [
  "atlas-anchors",
  "atlas-slots",
  "atlas-draft",
  "atlas-check",
  "atlas-doctor",
  "atlas-node",
  "atlas-memory-recall",
  "atlas-memory-header",
  "atlas-memory-awareness",
  "atlas-memory-orientation",
]
try {
  const mod = await import(pathToFileURL(join(REPO, "packages/tools/dist/src/index.js")).href)
  const eq = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i])
  if (!eq(mod.GOVERNANCE_SURFACE, EXPECTED_SURFACE)) {
    problems.push(
      `CODE-SURFACE: GOVERNANCE_SURFACE = [${mod.GOVERNANCE_SURFACE}] ≠ canonical [${EXPECTED_SURFACE}]. ` +
        `If the surface changed by ratified amendment, update EXPECTED_SURFACE here AND the specs (INV-TOOLS-1, ADR).`,
    )
  }
  if (!eq(mod.WRITE_PATHS, EXPECTED_WRITE_PATHS)) {
    problems.push(`CODE-SURFACE: WRITE_PATHS = [${mod.WRITE_PATHS}] ≠ canonical [${EXPECTED_WRITE_PATHS}].`)
  }
  if (!eq(mod.READ_SURFACE, EXPECTED_READ_SURFACE)) {
    problems.push(
      `CODE-SURFACE: READ_SURFACE = [${mod.READ_SURFACE}] ≠ canonical [${EXPECTED_READ_SURFACE}]. ` +
        `If the read surface changed by ratified amendment, update EXPECTED_READ_SURFACE here AND ADR-0005 / atlas-authoring.md A-D2.`,
    )
  }
  // ENTRY-MCP-3 disjointness — `READ_SURFACE` shares NO member with either governed constant. A door that
  // migrated into both sets would silently inherit write authority it never earned, or make
  // `GOVERNANCE_SURFACE`'s own count meaningless (ADR-0005 §Why this does not weaken TOOLS-1).
  if (Array.isArray(mod.READ_SURFACE) && Array.isArray(mod.GOVERNANCE_SURFACE)) {
    const overlapGov = mod.READ_SURFACE.filter((t) => mod.GOVERNANCE_SURFACE.includes(t))
    if (overlapGov.length) {
      problems.push(
        `CODE-SURFACE: READ_SURFACE ∩ GOVERNANCE_SURFACE ≠ ∅ — shared member(s) [${overlapGov}] (ENTRY-MCP-3).`,
      )
    }
  }
  if (Array.isArray(mod.READ_SURFACE) && Array.isArray(mod.WRITE_PATHS)) {
    const overlapWrite = mod.READ_SURFACE.filter((t) => mod.WRITE_PATHS.includes(t))
    if (overlapWrite.length) {
      problems.push(
        `CODE-SURFACE: READ_SURFACE ∩ WRITE_PATHS ≠ ∅ — shared member(s) [${overlapWrite}] (ENTRY-MCP-3, ADR-0005).`,
      )
    }
  }
} catch (e) {
  problems.push(`CODE-SURFACE: could not import built constants (run \`npm run build\` first): ${e.message}`)
}

// ── (2) DOC ANTI-DRIFT ──────────────────────────────────────────────────────────────────────────
function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, exts, out)
    else if (exts.some((e) => name.endsWith(e))) out.push(p)
  }
  return out
}
/** The repo-root markdown — the FRONT DOOR of the project, and previously outside the sweep entirely.
 *  `ARCHITECTURE.md` consequently carried the pre-ADR-0003 constitution ("4 tools · 1 write door") for days
 *  after a 54-file formalization wave: its lines WOULD have matched the existing patterns; the file was
 *  simply never read. A drift guard that skips the document a newcomer reads first is not a drift guard. */
function rootDocs() {
  return readdirSync(REPO, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => join(REPO, e.name))
}

const files = [
  // ADRs are historical decision records — they legitimately narrate the pre-amendment state, so they
  // are excluded from the current-state drift sweep.
  ...walk(join(REPO, "docs"), [".md"]).filter((f) => !f.includes("/docs/adr/")),
  ...walk(join(REPO, "packages"), [".ts"]),
  ...rootDocs(),
]
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n")
  lines.forEach((line, i) => {
    if (isStaleGovernanceClaim(line)) {
      problems.push(
        `DOC-DRIFT: ${f.replace(REPO + "/", "")}:${i + 1} — stale governance-count claim: ${line.trim().slice(0, 120)}`,
      )
    }
  })
}

// ── (3) DIGEST TRIPWIRE (whole-file scheme: properties-<m> ↔ method-tags-<m>) ─────────────────────
// Only WHOLE-FILE-pinned modules are gated here (short 8-hex digest of the entire method-tags file, as the
// TLS + MEM headers document). Both were verified consistent before wiring (pins == current whole-file digest).
//   • gen/grd/knw/krn/pst/ret carry NO @sha256 pins — nothing to check.
const WHOLE_FILE_PINNED = ["tls", "mem", "authoring"]
for (const mod of WHOLE_FILE_PINNED) {
  const mt = join(REPO, `docs/requirements/method-tags-${mod}.md`)
  const props = join(REPO, `docs/requirements/properties-${mod}.md`)
  const digest8 = createHash("sha256").update(readFileSync(mt)).digest("hex").slice(0, 8)
  const pins = [...readFileSync(props, "utf8").matchAll(/@sha256:([0-9a-f]{8})\b/g)].map((m) => m[1])
  const stalePins = [...new Set(pins)].filter((p) => p !== digest8)
  if (pins.length === 0) {
    problems.push(`DIGEST: no 8-hex @sha256 pins found in properties-${mod}.md (expected the frozen source pins).`)
  } else if (stalePins.length) {
    problems.push(
      `DIGEST: properties-${mod}.md pins [${stalePins}] ≠ current method-tags-${mod}.md digest ${digest8}. ` +
        `Re-freeze the pins (reconcile the properties against the amended method-tags) or revert the method-tags edit.`,
    )
  }
}

// ── (3b) IDX PER-INV-BLOCK TRIPWIRE (partial, honest) ────────────────────────────────────────────
// properties-idx pins are per-`### INV-INDEX-n`-block digests: sha256(<raw byte substring from the INV
// header to the next section delimiter>)[:12]. That rule reproduces 15/16 pins EXACTLY (every trailing-byte
// normalization does strictly worse — confirming it IS the generator's rule, not a fit). The SOLE exception
// is the TERMINAL INV block (the last one before the trailing `---`/EOF), whose trailing-byte handling can't
// be inferred without the original render tool. So we gate every NON-TERMINAL block and DECLARE the terminal
// one uncovered — honest partial coverage, not a special-cased fake.
{
  const mtSrc = readFileSync(join(REPO, "docs/requirements/method-tags-idx.md"), "utf8")
  const propsSrc = readFileSync(join(REPO, "docs/requirements/properties-idx.md"), "utf8")
  const pinFor = {}
  for (const m of propsSrc.matchAll(/method-tags-idx\.md#INV-INDEX-(\d+) @sha256:([0-9a-f]{12})/g)) pinFor[m[1]] = m[2]
  const lines = mtSrc.split("\n")
  const offset = []
  let acc = 0
  for (const l of lines) {
    offset.push(acc)
    acc += l.length + 1
  }
  const isDelim = (l) => /^### INV-INDEX-\d+/.test(l) || /^## /.test(l) || /^---/.test(l)
  const heads = lines.map((l, i) => (/^### INV-INDEX-(\d+)/.test(l) ? i : -1)).filter((i) => i >= 0)
  const terminal = heads[heads.length - 1] // last INV block — trailing-byte rule not reproducible
  for (const hi of heads) {
    if (hi === terminal) continue // declared uncovered (see note above)
    const n = lines[hi].match(/INV-INDEX-(\d+)/)[1]
    let end = lines.length
    for (let j = hi + 1; j < lines.length; j++)
      if (isDelim(lines[j])) {
        end = j
        break
      }
    const block = mtSrc.slice(offset[hi], end < lines.length ? offset[end] : mtSrc.length)
    const got = createHash("sha256").update(block).digest("hex").slice(0, 12)
    if (pinFor[n] && got !== pinFor[n]) {
      problems.push(
        `DIGEST(idx): INV-INDEX-${n} block digest ${got} ≠ pin ${pinFor[n]} in properties-idx.md. ` +
          `Re-freeze the pin or revert the method-tags-idx block edit.`,
      )
    }
  }
  console.log(
    `  (idx: ${heads.length - 1}/${heads.length} INV blocks gated; terminal INV-INDEX-${lines[terminal].match(/INV-INDEX-(\d+)/)[1]} declared uncovered — needs the original render tool.)`,
  )
}

// ── (4) AMENDMENT FAN-OUT ────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS. On 2026-08-02 the corpus contained a live, load-bearing contradiction and this gate
// exited 0 on it: `goldens-grd.md` REQ-GROUND-5b had been amended (at f2a8659) to say a reformat DRIFTS,
// while `req-grd.md` REQ-GROUND-5b, `invariant-register.md` GROUND-5, `method-tags-grd.md` INV-GROUND-5 and
// `properties-grd.md` PROP-GROUND-5 all still asserted the opposite. Same for REQ-GROUND-3a. Checks (1)-(3)
// could not see it: (1) pins a code constant, (2) is a per-LINE regex over ONE historical vocabulary
// (governance counts), (3) hashes files that carry no pins for grd/knw. None of them models the corpus as a
// set of documents that RESTATE the same requirement, so none of them can see two of them disagree.
//
// WHAT THIS CHECKS, precisely. Atlas states each invariant family (`GROUND-5`, `KNOW-3`, …) in FIVE
// canonical places: `req-<m>.md` (normative-clause), `goldens-<m>.md` (scenarios + teeth),
// `method-tags-<m>.md` (up-property / down-model), `properties-<m>.md` (the PBT law), and the row in
// `invariant-register.md`. If a family is AMENDED in any one of them, every other one that also states it
// MUST carry an amendment marker for that same family. An amendment that does not FAN OUT is, by
// construction, a corpus that contradicts itself.
//
// WHAT THIS CANNOT DO, stated rather than implied — it is a fan-out check, not a truth check:
//   • It cannot detect a claim that was authored inconsistently FROM THE START, with no `AMENDED` marker
//     anywhere. Detecting that needs semantic agreement between prose statements, which is not mechanical.
//     The reformat overclaim itself was in that state for the whole life of the corpus and this check would
//     NOT have caught it before f2a8659 — only after the first document was corrected.
//   • It cannot tell a CORRECT fan-out from a marker pasted into each file. It enforces that every
//     restatement was VISITED, not that each was fixed well. That is a real limit; the review still matters.
//   • It gates the requirement corpus only. `docs/reference/**`, `docs/spec/**`, `docs/design/**` and
//     `docs/explanation/**` also restate these invariants and are NOT covered here, because they carry no
//     per-family block structure to key on. Those remain review-only.
{
  const REQ_DIR = join(REPO, "docs/requirements")
  const REGISTER = "invariant-register.md"
  /** `REQ-GROUND-5b` / `SCN-GROUND-5b-1` / `INV-GROUND-5` / `PROP-GROUND-5` → the family `GROUND-5`. */
  const familyOf = (id) => {
    const m = /^(?:REQ|SCN|INV|PROP)-([A-Z]+)-(\d+)/.exec(id)
    return m === null ? null : `${m[1]}-${m[2]}`
  }
  const AMENDED = /\bAMENDED\b/

  // families[family] = Map(file → { amended: bool })
  const families = new Map()
  const seen = (family, file, amended) => {
    if (!families.has(family)) families.set(family, new Map())
    const per = families.get(family)
    const prev = per.get(file) ?? { amended: false }
    per.set(file, { amended: prev.amended || amended })
  }

  const modDocs = readdirSync(REQ_DIR).filter((f) => /^(req|goldens|method-tags|properties)-[a-z]+\.md$/.test(f))
  // Block model for the module docs: a `### <ID>` heading owns every line down to the next `### ` or `## `.
  for (const name of modDocs) {
    const lines = readFileSync(join(REQ_DIR, name), "utf8").split("\n")
    let curFamily = null
    let curAmended = false
    const flush = () => {
      if (curFamily !== null) seen(curFamily, name, curAmended)
    }
    for (const line of lines) {
      const head = /^###\s+([A-Za-z]+-[A-Z]+-[0-9][A-Za-z0-9-]*)/.exec(line)
      if (head !== null) {
        flush()
        curFamily = familyOf(head[1])
        curAmended = AMENDED.test(line)
        continue
      }
      if (/^##\s/.test(line)) {
        flush()
        curFamily = null
        curAmended = false
        continue
      }
      if (curFamily !== null && AMENDED.test(line)) curAmended = true
    }
    flush()
  }
  // Block model for the register: ONE TABLE ROW per invariant — `| GROUND-5 semantic drift only | … |`.
  for (const line of readFileSync(join(REQ_DIR, REGISTER), "utf8").split("\n")) {
    const row = /^\|\s*([A-Z]+-\d+)\b/.exec(line)
    if (row !== null) seen(row[1], REGISTER, AMENDED.test(line))
  }

  for (const [family, per] of [...families].sort()) {
    const amendedIn = [...per].filter(([, v]) => v.amended).map(([f]) => f)
    if (amendedIn.length === 0) continue // never amended — nothing to fan out
    const silent = [...per]
      .filter(([, v]) => !v.amended)
      .map(([f]) => f)
      .sort()
    if (silent.length) {
      problems.push(
        `AMENDMENT-FAN-OUT: ${family} is AMENDED in [${amendedIn.sort().join(", ")}] but ` +
          `[${silent.join(", ")}] still state it unamended. An amendment that does not reach every ` +
          `restatement leaves the corpus contradicting itself (this is the exact class that exited 0 on ` +
          `2026-08-02). Amend those blocks, or mark them with the amendment date if they are unaffected.`,
      )
    }
  }
  const fannedOut = [...families].filter(([, per]) => [...per].some(([, v]) => v.amended)).length
  console.log(
    `  (fan-out: ${families.size} invariant families indexed across ${modDocs.length + 1} requirement docs; ${fannedOut} carry an amendment.)`,
  )
}

// ── report ────────────────────────────────────────────────────────────────────────────────────────
if (problems.length) {
  console.error(`spec-conformance-guard: FAIL — ${problems.length} problem(s):`)
  for (const p of problems) console.error("  ✗ " + p)
  process.exit(1)
}
// DERIVED from the SAME EXPECTED_* arrays checked above — a hand-transcribed count here would be a second
// source of truth, and this line said "5 tools / 2 governed doors / 6 read-surface doors" for the length of
// WP-11.W8 while the arrays it never read already held 6/3/10.
console.log(
  `spec-conformance-guard: OK — surface pinned (${EXPECTED_SURFACE.length} tools / ${EXPECTED_WRITE_PATHS.length} governed doors / ${EXPECTED_READ_SURFACE.length} read-surface doors, disjoint), ${files.length} files drift-free, whole-file digest pins fresh (${WHOLE_FILE_PINNED.join(", ")}).`,
)
