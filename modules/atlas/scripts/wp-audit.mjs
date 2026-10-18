#!/usr/bin/env node

// WP inventory and evidence audit. This is deliberately not a completion gate:
// test references prove that an acceptance artifact exists, not that its WP is
// fully built, wired, reviewed, and current.

import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { basename } from "node:path"

function filesFromGit(...roots) {
  const out = execFileSync("git", ["ls-files", "--", ...roots], { encoding: "utf8" }).trim()
  return out === "" ? [] : out.split("\n").filter(Boolean)
}

function unique(items) {
  return [...new Set(items)]
}

const cardFiles = filesFromGit("docs/requirements/work-packages")
const testFiles = filesFromGit("packages", "harness").filter((path) => /(?:test|spec)\.(?:ts|mjs)$/.test(path))
if (cardFiles.length === 0 || testFiles.length === 0) {
  throw new Error("WP audit cannot build its file lists; refusing a vacuous report")
}

const testText = testFiles.map((path) => readFileSync(path, "utf8")).join("\n")
const statusOverrides = JSON.parse(readFileSync("docs/requirements/wp-status-overrides.json", "utf8"))
// Positive control: prove this instrument can see a known acceptance artifact.
if (!testText.includes("SCN-KERNEL-1a-1")) {
  throw new Error("WP audit positive control missing: test corpus was not read")
}

const commitSubjects = execFileSync("git", ["log", "--all", "--format=%s"], { encoding: "utf8" }).toLowerCase()
const rows = []
const nonEvidenceStatuses = new Set(["REVIEW", "OPEN", "DELEGATED-ORCHESTRA"])

for (const path of cardFiles) {
  const text = readFileSync(path, "utf8")
  const headings = [...text.matchAll(/^### (WP-[^\s—:]+).*$/gm)]
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i]
    const body = text.slice(heading.index, headings[i + 1]?.index ?? text.length)
    const id = heading[1]
    const acceptance = unique(body.match(/SCN-[A-Z0-9.-]+/g) ?? [])
    const acceptanceHits = acceptance.filter((scn) => testText.includes(scn))
    const explicitClosed = /^> \*\*STATUS: ALL .*BUILT — campaign closed\*\*/m.test(text)
    const wpTestRef = testText.includes(id)
    const commitRef = commitSubjects.includes(id.toLowerCase())
    const override = statusOverrides.overrides[id]
    let status = override?.status ?? "REVIEW"
    if (override === undefined && explicitClosed) status = "EXPLICIT-BUILT"
    else if (override === undefined && acceptance.length > 0 && acceptanceHits.length === acceptance.length)
      status = "ACCEPTANCE-EVIDENCE"
    else if (override === undefined && (acceptanceHits.length > 0 || wpTestRef)) status = "TEST-EVIDENCE"

    rows.push({
      id,
      class: basename(path).startsWith("wp-campaign-") ? "campaign" : "remediation",
      source: path,
      acceptance: acceptance.length,
      acceptanceHits: acceptanceHits.length,
      wpTestRef,
      commitRef,
      status,
    })
  }
}

if (rows.length === 0) throw new Error("WP audit found no card headings; refusing a vacuous report")

const rowIds = new Set(rows.map((row) => row.id))
for (const [id, override] of Object.entries(statusOverrides.overrides)) {
  if (!rowIds.has(id)) throw new Error(`WP audit override names unknown card: ${id}`)
  if (typeof override.evidence !== "string" || override.evidence.length === 0) {
    throw new Error(`WP audit override has no evidence: ${id}`)
  }
}

const counts = Object.fromEntries(
  unique(rows.map((row) => row.status)).map((status) => [status, rows.filter((row) => row.status === status).length]),
)
const summary = {
  total: rows.length,
  campaign: rows.filter((row) => row.class === "campaign").length,
  remediation: rows.filter((row) => row.class === "remediation").length,
  statuses: counts,
  evidencePositive: rows.filter((row) => !nonEvidenceStatuses.has(row.status)).length,
  open: rows.filter((row) => row.status === "OPEN").length,
  delegated: rows.filter((row) => row.status === "DELEGATED-ORCHESTRA").length,
  reviewedBuilt: rows.filter((row) => row.status === "REVIEWED-BUILT").length,
  reviewIds: rows.filter((row) => row.status === "REVIEW").map((row) => row.id),
  openIds: rows.filter((row) => row.status === "OPEN").map((row) => row.id),
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ summary, rows }, null, 2))
} else {
  console.log(`wp-audit: ${summary.total} WP cards (${summary.campaign} campaign, ${summary.remediation} remediation)`)
  for (const [status, count] of Object.entries(counts)) console.log(`  ${status}: ${count}`)
  console.log(`  evidence-positive: ${summary.evidencePositive}`)
  console.log(`  reviewed-built: ${summary.reviewedBuilt}`)
  console.log(`  open: ${summary.open}`)
  if (summary.openIds.length > 0) {
    console.log("  OPEN rows:")
    for (const id of summary.openIds) console.log(`    ${id}`)
    console.log(`  delegated: ${summary.delegated}`)
  }
  console.log("  REVIEW rows:")
  for (const id of summary.reviewIds) console.log(`    ${id}`)
  console.log("  NOTE: evidence-positive is not BUILT; closure still needs cold WP review, gates, and commit evidence.")
}
