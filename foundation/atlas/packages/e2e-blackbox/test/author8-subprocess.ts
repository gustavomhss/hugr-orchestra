// @atlas/e2e-blackbox — test/author8-subprocess.ts  (WP-10.A2-a.E2E — thin subprocess plumbing, PROP-AUTH-8)
//
// NO ENVELOPE RECONSTRUCTION HERE. WP-10.A2-a.CLI-JSON shipped `atlas draft <anchor> <slot> <claim> --json`
// (`packages/cli/src/cli.ts`'s `draft` dispatch): on a successful draft it prints the RAW `DraftOut` —
// `JSON.stringify(verdict.data)` verbatim, never hand-picked fields — so the envelope `atlas emit <file>
// --at <rev>` reads is now produced ENTIRELY by product doors. This file used to carry a hand-built
// reconstruction of that envelope (parsed off the OLD human-text-only `draft` render, before `--json`
// existed); that code is DELETED, not reused — the whole point of `--json` shipping is that this story no
// longer needs to know, let alone re-encode, a single field `draft`'s own recipe defaults to.
//
// What is left is PURE PLUMBING around three subprocess doors:
//   - `anchorsOf`/`slotNames` — parse `atlas anchors <path>` / `atlas slots`'s TEXT listings (there is no
//     `--json` for either door yet) to DISCOVER the fixture's real unit set / the 13-slot vocabulary — pure
//     text parsing of a DISCOVERY door's rendered census, not a reconstruction of anything `emit` consumes.
//   - `draftThenEmit` — `atlas draft … --json` (capture stdout verbatim) → write those EXACT bytes to a temp
//     file → `atlas emit <file> --at <rev>` (the `rev` is read OFF the SAME captured JSON via one
//     `JSON.parse`, never invented). The bytes `emit` reads are the LITERAL stdout of `draft --json` — a true
//     byte relay through two product doors, no test-authored `GroundedFact` field anywhere on this path.

import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { runAtlas } from "../src/harness.js"
import type { AtlasRun, FixtureRepo } from "../src/harness.js"

// ── discovery parsing (anchors/slots have no --json yet — their rendered TEXT is the only surface) ────────

/** One row of `atlas anchors <path>`'s rendered `unit <kind> <qualifiedPath> [<subtreeHash>]` listing —
 *  used ONLY to discover WHICH anchors exist (the `qualifiedPath`/`kind` census), never to build a fact. */
export interface AnchorRow {
  readonly kind: "file" | "dir" | "symbol"
  readonly qualifiedPath: string
}

const UNIT_LINE = /^ {2}unit (\S+) (.+) \[[0-9a-f]+\]$/

/** Parse `atlas anchors <path>`'s stdout into `{rev, units}` — the discovery census, text-parsed because
 *  `anchors` has no `--json` output mode (unlike `draft`). Throws on an unparseable block (a TEST-SETUP
 *  fault — silently returning an empty set would make every downstream assertion pass VACUOUSLY). */
export function anchorsOf(
  repoPath: string,
  path: string,
): { readonly rev: string; readonly units: readonly AnchorRow[] } {
  const run = runAtlas(repoPath, ["anchors", path])
  if (run.exitCode !== 0)
    throw new Error(`author8-subprocess: 'atlas anchors ${path}' exited ${run.exitCode}:\n${run.stdout}${run.stderr}`)
  const revMatch = run.stdout.match(/^ {2}anchors: rev (\S+) —/m)
  if (revMatch?.[1] === undefined)
    throw new Error(`author8-subprocess: could not parse 'anchors: rev …' out of:\n${run.stdout}`)
  const units: AnchorRow[] = []
  for (const line of run.stdout.split("\n")) {
    const m = line.match(UNIT_LINE)
    if (m === null) continue
    const kind = m[1]
    if (kind !== "file" && kind !== "dir" && kind !== "symbol") continue
    units.push({ kind, qualifiedPath: m[2] ?? "" })
  }
  return { rev: revMatch[1], units }
}

/** Parse `atlas slots`'s stdout into the 13 slot NAMES, in the door's own order (text-parsed — `slots` has
 *  no `--json` output mode either; only the closed vocabulary's names are needed here, not its meanings). */
export function slotNames(repoPath: string): readonly string[] {
  const run = runAtlas(repoPath, ["slots"])
  if (run.exitCode !== 0)
    throw new Error(`author8-subprocess: 'atlas slots' exited ${run.exitCode}:\n${run.stdout}${run.stderr}`)
  const names: string[] = []
  for (const line of run.stdout.split("\n")) {
    const m = line.match(/^ {2}slot (\S+):/)
    if (m?.[1] !== undefined) names.push(m[1])
  }
  return names
}

// ── the round trip — a LITERAL byte relay, draft --json stdout → an emit input file ────────────────────────

/**
 * Drive `atlas draft <anchor> <slot> <claim> --json` (a real subprocess) and `atlas emit <file> --at <rev>`
 * (a second real subprocess) back to back. The bytes `emit` reads are EXACTLY `draft --json`'s stdout,
 * written to a temp file untouched — no `JSON.parse` + re-`JSON.stringify` round trip that could silently
 * normalize away a divergence, and no field of the envelope is read, inspected, or rebuilt by this test.
 * The ONE value read off the captured JSON is `.rev` — needed only because the CLI wire requires a
 * positional `--at <sha>` (marshal.ts); it is the SAME value already embedded in the bytes handed to `emit`.
 * Returns the `emit` run; the caller asserts `exitCode === 0` (PROP-AUTH-8's acceptance).
 */
export function draftThenEmit(repo: FixtureRepo, anchor: string, slot: string, claim: string): AtlasRun {
  const draftRun = runAtlas(repo.repoPath, ["draft", anchor, slot, claim, "--json"])
  if (draftRun.exitCode !== 0) {
    throw new Error(
      `author8-subprocess: 'atlas draft ${anchor} ${slot} … --json' exited ${draftRun.exitCode}:\n${draftRun.stdout}${draftRun.stderr}`,
    )
  }
  const envelopeBytes = draftRun.stdout // the LITERAL bytes `draft --json` printed — never touched
  const rev = (JSON.parse(envelopeBytes) as { rev: unknown }).rev
  if (typeof rev !== "string" || rev.length === 0) {
    throw new Error(`author8-subprocess: 'draft --json' printed no string '.rev':\n${envelopeBytes}`)
  }
  const path = join(repo.repoPath, `envelope-${randomUUID()}.json`)
  writeFileSync(path, envelopeBytes) // the SAME bytes, byte for byte — the relay
  return runAtlas(repo.repoPath, ["emit", path, `--at=${rev}`])
}
