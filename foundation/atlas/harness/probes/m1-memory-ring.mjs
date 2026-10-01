#!/usr/bin/env node
// harness/probes/m1-memory-ring.mjs — THE M-AXIS: the memory ring, measured on the SHIPPED BINARY.
//
// ── WHAT THIS MEASURES, AND WHY IT IS NOT THE UNIT SUITE ────────────────────────────────────────────────
// `packages/*/test` proves each memory piece in isolation against injected fakes. That is exactly how the
// scanner shipped BROKEN in #290: every memory-emit test injected a fake scanner, so the one argv the
// product actually runs was never executed by anything. This probe runs `packages/cli/dist/src/bin.js` as
// a child process in a THROWAWAY git repo, with the real store on real disk and the real gitleaks on PATH,
// and reads only what a user reads: the process exit code and the rendered verdict text.
//
// ── THE CONTROLS, STATED BEFORE THE NUMBERS ─────────────────────────────────────────────────────────────
// Every axis here carries a control that fails the axis if the door is trivially degenerate:
//   M1 recall-before-write must answer EMPTY  — else "the fact came back" proves nothing about the write.
//   M2 a CLEAN record must be ADMITTED        — else a door that refuses everything scores a perfect 100%,
//                                               which is the #290 defect scoring perfectly on its own bench.
//   M2 each refusal must name its OWN gate    — else a door that always answers `undetermined-kind` scores
//                                               a perfect 100% while being wrong on 8 of 9 cases.
//   M3 the two seats hold DIFFERENT counts    — else "no leak" is unfalsifiable (1 vs 1 leaks invisibly).
// A control that fails is reported as a FAILED AXIS, never as a footnote under a green number.
//
// ── THE MUTATION LEDGER — what this probe was PROVEN to catch, and what it was proven NOT to ────────────
// A bench nobody has broken on purpose is decoration. Three mutations were applied to the SHIPPED `dist`
// bytes and the probe re-run against each; the dist was restored and re-verified after every one.
//   1. MEM-1 owner scoping removed (`injectFor(store, seat)` → `store`)      KILLED — M3 3/3 → 0/3
//   2. MEM-9 scanner gate removed (`if (scanner.scan(record))` → `if(false)`) KILLED — M2 scanner-blocked red
//   3. MEM-5 type loop removed (`if (matchesFieldType(...))` → `if(false)`)   KILLED — M2 template-invalid red
//   4. MEM-4 kind filter removed (`filter(kind==='project')` → `filter(true)`) SURVIVES HERE, killed at the
//      DOOR level. Reported honestly in both directions rather than dropped once a killer was found: this
//      probe's surface cannot see it, because the only CLI door onto the ranked slab is `memory-header`,
//      which renders `injected` alone, and the leak lands in `evicted`. The mutant dies against
//      `packages/adapter-io/test/memory-read-kind-filter.test.ts`, which reads `projectSlab()` — the surface
//      on which the invariant is decidable. An oracle's reach is a property of the surface it runs through.
//
// $0 — no model is in the loop. Deterministic: same repo, same binary, same verdicts.
// Usage: node harness/probes/m1-memory-ring.mjs [--keep]

import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
const BIN = join(ROOT, "packages/cli/dist/src/bin.js")
const KEEP = process.argv.includes("--keep")

// ── the harness ─────────────────────────────────────────────────────────────────────────────────────────

/** Run the shipped binary. Returns {code, out} — NEVER throws, because a non-zero exit is a MEASUREMENT. */
function atlas(cwd, args, env = {}) {
  try {
    const out = execFileSync(process.execPath, [BIN, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { code: 0, out }
  } catch (e) {
    // execFileSync throws on non-zero. `e.status` is the real exit code; ENOENT-style failures have none,
    // and those are reported as code -1 rather than silently folded into "a gate refused it".
    return { code: typeof e.status === "number" ? e.status : -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }
  }
}

function emitEntry(cwd, obj, actor, env = {}) {
  const p = join(cwd, `entry-${Math.abs(hash(JSON.stringify(obj) + actor))}.json`)
  writeFileSync(p, JSON.stringify(obj))
  return atlas(cwd, ["memory-emit", p], { ATLAS_ACTOR: actor, ...env })
}

function hash(s) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return h
}

/** Emit RAW bytes. `JSON.stringify` renders Infinity/NaN as `null`, so a plant that must reach the door as a
 *  non-finite NUMBER cannot be built through `emitEntry`; `1e999` parses to Infinity on the far side. */
function emitRaw(cwd, json, actor, env = {}) {
  const p = join(cwd, `raw-${Math.abs(hash(json + actor))}.json`)
  writeFileSync(p, json)
  return atlas(cwd, ["memory-emit", p], { ATLAS_ACTOR: actor, ...env })
}

/** A fresh git repo with an initialised Atlas. Each axis gets its own — cross-axis state would make the
 *  cap gate's count depend on what an earlier axis happened to write. */
function freshRepo(label) {
  const dir = mkdtempSync(join(tmpdir(), `m1-${label}-`))
  execFileSync("git", ["init", "-q", "."], { cwd: dir })
  writeFileSync(join(dir, "a.ts"), "export const a = 1;\n")
  execFileSync("git", ["add", "a.ts"], { cwd: dir })
  execFileSync("git", ["-c", "user.email=m@1", "-c", "user.name=m1", "commit", "-qm", "init"], { cwd: dir })
  const init = atlas(dir, ["init", "."])
  if (init.code !== 0) throw new Error(`atlas init failed in ${dir}: ${init.out}`)
  return dir
}

/**
 * The gate a refusal NAMED — parsed from the `reason:` line ONLY.
 *
 * [INSTRUMENT DEFECT, FIXED HERE] The first cut of this probe tested the whole stdout for the gate name.
 * Every refusal's `next:` line ENUMERATES all nine gate names as guidance, so the match was true for every
 * case including the ones that were ADMITTED — the oracle reported `named=true` on a write that exited 0.
 * A name-matching oracle must read the field that carries the fired name, never the help text beside it.
 */
function firedGate(out) {
  const m = /^reason: ([a-z-]+):/m.exec(out)
  return m ? m[1] : null
}

const RESULTS = []
const FINDINGS = []
const record = (axis, name, pass, detail) => {
  RESULTS.push({ axis, name, pass, detail })
}

const PROJECT = (rule, frecency = 1) => ({ rule, scope: "harness", frecency })

// ── M1 — DURABILITY ACROSS A PROCESS BOUNDARY ───────────────────────────────────────────────────────────
// The claim: a memory written by one process is read back by a DIFFERENT one. Node's module cache and any
// in-process array would both satisfy a same-process test; only a new child proves the bytes are on disk.
function axisM1() {
  const dir = freshRepo("m1")
  const seat = "seat:charlie"

  // CONTROL — the instrument must be able to answer EMPTY. If recall answered non-empty here, every later
  // "the fact came back" would be uninterpretable.
  const before = atlas(dir, ["memory-recall", "--owner", seat])
  const emptyBefore = /holds nothing that matches yet/.test(before.out)
  record("M1", "control: recall before any write answers empty", emptyBefore, `exit=${before.code}`)

  const w = emitEntry(dir, PROJECT("never run the full vitest suite concurrently"), seat)
  record("M1", "write admitted (exit 0)", w.code === 0, `exit=${w.code}`)

  // The read is a SEPARATE process — a new node, a cold module graph, nothing shared but the filesystem.
  const after = atlas(dir, ["memory-recall", "--owner", seat])
  const got = /1 matching record\(s\)/.test(after.out)
  record("M1", "read back in a NEW process", got, `exit=${after.code}`)

  if (!KEEP) rmSync(dir, { recursive: true, force: true })
  return emptyBefore // the control gates the axis
}

// ── M2 — THE GATE CHAIN: planted violations, ZERO false-admit, each refusal NAMING ITS OWN GATE ──────────
// One planted record per refusal the door declares it can issue. The oracle is not "it refused" — it is
// "it refused with THIS name". A door that answers `undetermined-kind` to everything refuses 100% and is
// wrong 8 times out of 9; only the per-name check separates those.
function axisM2() {
  const dir = freshRepo("m2")
  const seat = "seat:charlie"
  const RSA =
    "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7ZQ8Y2LxK1vN3pQrS4tUvWxYzA0B1C2D3E4F5G6H7I8J9K0L\n-----END RSA PRIVATE KEY-----"

  // NEGATIVE CONTROL, first and load-bearing: a clean, well-formed record must be ADMITTED. Without this
  // line the whole axis is satisfied by a door that refuses every write — the exact #290 defect.
  const clean = emitEntry(dir, PROJECT("a clean rule that violates nothing"), seat)
  const admits = clean.code === 0
  record("M2", "CONTROL: a clean record is ADMITTED (door is not refuse-everything)", admits, `exit=${clean.code}`)

  const cases = [
    // gate 1 — no template matches these keys at all.
    { gate: "undetermined-kind", actor: seat, entry: { notAnyTemplate: true } },
    // gate 2 — MEM-5: keys are exactly the project template's and every required field is present, so
    // derivation NAMES `project`; `frecency` is a string, so validation refuses. This plant is what makes
    // gate 2's domain non-empty — see the reachability note below.
    { gate: "template-invalid", actor: seat, entry: { rule: "r", scope: "harness", frecency: "999" } },
    // gate 3b — MEM-1: an EMPTY actor is a reachable value (`ATLAS_ACTOR ?? gitUserEmail ?? ''`), and an
    // unowned record is one `injectFor` hands to every caller whose actor is also empty.
    { gate: "unowned", actor: "", entry: PROJECT("a rule written with no resolvable owner") },
    // gate 4a — MEM-8: only `orch` may append the logbook.
    { gate: "logbook-unauthorized", actor: seat, entry: LOGBOOK("PR-1") },
    // gate 5 — MEM-3: one rule far over the 500-token member cap.
    { gate: "over-cap", actor: seat, entry: PROJECT("x ".repeat(4000)) },
    // gate 6 — MEM-9: the real gitleaks, on a real private key, through the real argv.
    { gate: "scanner-blocked", actor: seat, entry: PROJECT(`credentials rule: ${RSA}`) },
  ]

  let named = 0
  for (const c of cases) {
    const r = emitEntry(dir, c.entry, c.actor)
    // Exit 2 is the CLI's governed-refusal code; exit 1 would mean it thought the invocation was malformed.
    const isRefusal = r.code === 2
    const fired = firedGate(r.out)
    const pass = isRefusal && fired === c.gate
    if (pass) named += 1
    record("M2", `planted ${c.gate}`, pass, `exit=${r.code} fired=${fired}`)
  }

  // ── WHY GATE 2 IS PLANTED ABOVE AND WAS NOT, AND THE CONTROLS THAT KEEP IT HONEST ───────────────────
  //
  // Until the MEM-5 type check shipped, this probe recorded `template-invalid` as a DECLARED-BUT-UNREACHABLE
  // refusal, and the argument was mechanical: `validate` failed on exactly two conditions — a required key
  // `undefined`, or a key outside the template — and `memoryKindOf` selects a kind only from candidates for
  // which NEITHER holds. So every entry that could fail gate 2 had already failed gate 1, while the door's
  // own guidance went on advertising the name to users. Types are the first condition validation decides
  // that derivation does not, which is what gives gate 2 a non-empty domain. The plant above is the proof
  // AT THE BINARY; `packages/memory/test/mem-5-field-types.test.ts` is the proof at the unit level.
  //
  // The DISCRIMINATION CONTROLS below keep the new plant from taking credit for reach it does not have: the
  // two shapes that used to be planted here must STILL refuse as `undetermined-kind`. If either ever
  // reported `template-invalid`, the two gates would have been conflated and the number above would be a
  // lie in the other direction.
  for (const [what, entry] of [
    [
      "a key outside the template",
      { taskId: "T-1", attempted: [], failedWith: [], stoppedAt: "s", lesson: "l", freeFormProse: "x" },
    ],
    ["a missing required key", { taskId: "T-2", attempted: [], failedWith: [], stoppedAt: "s" }],
  ]) {
    const r = emitEntry(dir, entry, seat)
    const fired = firedGate(r.out)
    record(
      "M2",
      `DISCRIMINATION: ${what} still refuses at gate 1, not gate 2`,
      r.code === 2 && fired === "undetermined-kind",
      `fired=${fired}`,
    )
  }

  // `kind-conflation` — the SAME masking, still open, measured rather than argued. `partition()` answers
  // `knowledge` only for an entry carrying `kind: 'advisory' | 'predicate'`; that key is outside every
  // memory template, so gate 1 refuses it first and gate 3's conflation branch fires on nothing FROM THIS
  // DOOR. The catch stays as a fail-closed floor — `put` really can throw it, and a future template change
  // could reopen the path — but the outcome is no longer ADVERTISED to users, and this assertion is what
  // will turn red if it ever becomes reachable again, forcing the guidance back in step.
  for (const disc of ["advisory", "predicate"]) {
    const r = emitEntry(dir, { kind: disc, rule: "r", scope: "harness", frecency: 1 }, seat)
    const fired = firedGate(r.out)
    record(
      "M2",
      `kind-conflation stays UNREACHABLE from this door (kind:'${disc}')`,
      r.code === 2 && fired === "undetermined-kind",
      `fired=${fired}`,
    )
  }

  // gate 4b — MEM-8 duplicate: only reachable AFTER an authorised logbook entry exists, so it is sequenced.
  const first = emitEntry(dir, LOGBOOK("PR-7"), "orch")
  record("M2", "logbook first append admitted for orch", first.code === 0, `exit=${first.code}`)
  const dup = emitEntry(dir, LOGBOOK("PR-7"), "orch")
  const dupOk = dup.code === 2 && firedGate(dup.out) === "logbook-duplicate"
  if (dupOk) named += 1
  record("M2", "planted logbook-duplicate", dupOk, `exit=${dup.code} fired=${firedGate(dup.out)}`)

  // gate 6b — MEM-9 ABSENCE: no scanner on PATH must refuse as `scanner-unavailable`, NEVER as
  // `scanner-blocked`. The door's own header calls the confusion of those two the worse failure; this is
  // the line that proves it did not regress. PATH is emptied for this child only.
  const noPath = emitEntry(dir, PROJECT("a rule written with no scanner installed"), seat, { PATH: "/nonexistent" })
  const firedNP = firedGate(noPath.out)
  const unavail = noPath.code === 2 && firedNP === "scanner-unavailable"
  if (unavail) named += 1
  record(
    "M2",
    "planted scanner-unavailable (empty PATH), NOT misnamed as blocked",
    unavail,
    `exit=${noPath.code} fired=${firedNP}`,
  )

  if (!KEEP) rmSync(dir, { recursive: true, force: true })
  return { named, total: cases.length + 2, admits } // + logbook-duplicate + scanner-unavailable
}

function LOGBOOK(prId) {
  return {
    prId,
    at: "2026-08-31",
    territories: ["harness"],
    shipped: "the m-axis probe",
    decisions: "measured the shipped binary, not the suite",
    tradeoffs: "no model in the loop",
    risks: "none",
    openThreads: "none",
    links: [],
  }
}

// ── M3 — MEM-1 OWNER SCOPING: one seat's header never carries another seat's rules ──────────────────────
// The counts are deliberately ASYMMETRIC (3 vs 1). With one rule each, a door that returned the union of
// both seats' rules would still print "1" per seat under a same-count design and the leak would be
// invisible — the test would be unfalsifiable rather than passing.
function axisM3() {
  const dir = freshRepo("m3")
  for (let i = 0; i < 3; i += 1) emitEntry(dir, PROJECT(`charlie rule number ${i}`), "seat:charlie")
  emitEntry(dir, PROJECT("the one lucy rule"), "seat:lucy")

  const count = (out) => {
    const m = /(\d+) project rule\(s\) injected/.exec(out)
    return m ? Number(m[1]) : -1
  }
  const c = count(atlas(dir, ["memory-header"], { ATLAS_ACTOR: "seat:charlie" }).out)
  const l = count(atlas(dir, ["memory-header"], { ATLAS_ACTOR: "seat:lucy" }).out)
  const asym = c !== l // the control: if these are equal the axis proves nothing
  record("M3", "CONTROL: the two seats hold different counts (leak is falsifiable)", asym, `charlie=${c} lucy=${l}`)
  record("M3", "charlie sees exactly its own 3", c === 3, `count=${c}`)
  record("M3", "lucy sees exactly its own 1 (no leak of charlie 3)", l === 1, `count=${l}`)

  if (!KEEP) rmSync(dir, { recursive: true, force: true })
  return asym
}

// ── M4 — MEM-4 CONSULTABLE-NOT-INJECTED: task memory is readable but never rides the turn header ────────
//
// [VACUOUS ORACLE, FIXED HERE] The first cut asserted that the task's id (`T-42`) did not appear in the
// header's stdout. It passed — and it passed under a MUTATION that made the header inject EVERY kind,
// because the rendered header never prints entry text at all, only a count. An assertion that cannot fail
// is not evidence, and this one was reported as a green line for MEM-4 while MEM-4 was broken.
//
// The oracle here is the COUNT, which the render does emit and which the mutation does move: two project
// rules and one task record for the same seat must yield a header of exactly TWO. The mid-way reading
// after the project writes is the control — it proves the counter tracks writes at all, so "still 2" after
// the task write is a real negative rather than a stuck instrument.
function axisM4() {
  const dir = freshRepo("m4")
  const seat = "seat:charlie"
  const count = (out) => {
    const m = /(\d+) project rule\(s\) injected/.exec(out)
    return m ? Number(m[1]) : -1
  }

  emitEntry(dir, PROJECT("the first project rule"), seat)
  emitEntry(dir, PROJECT("the second project rule"), seat)
  const before = count(atlas(dir, ["memory-header"], { ATLAS_ACTOR: seat }).out)
  record("M4", "CONTROL: the header counter tracks project writes (reads 2)", before === 2, `count=${before}`)

  const task = {
    taskId: "T-42",
    attempted: ["the wrong argv"],
    failedWith: ["exit 1 on clean input"],
    stoppedAt: "the scanner door",
    lesson: "measure the binary, not the fake",
  }
  const w = emitEntry(dir, task, seat)
  record("M4", "task memory admitted", w.code === 0, `exit=${w.code}`)

  const after = count(atlas(dir, ["memory-header"], { ATLAS_ACTOR: seat }).out)
  record("M4", "the task write does NOT enter the turn header (still 2, not 3)", after === 2, `count=${after}`)
  // [STATED LIMIT — this assertion is TRUE but is NOT sensitive to the kind filter it looks like it tests.]
  // Deleting `.filter(r => r.kind === 'project')` in `memory-read.ts` leaves this line GREEN. Measured, not
  // reasoned: the mutation was applied to the shipped `dist` and the count stayed 2. The reason is in the
  // ranking path — a task entry has no `.rule`, so it collapses into the dedup map's `undefined` key, and it
  // has no `.frecency`, so `stored * DECAY^age` is NaN and `NaN >= NEAR_ZERO_FRECENCY` is false. It is
  // evicted by the frecency floor before the kind filter ever matters, and NO consultable kind (task / pr /
  // logbook) can carry a `frecency` — adding one puts a key outside its template and the write is refused at
  // gate 1. So MEM-4 is enforced twice over at this door, and the CLI surface exposes no discriminator that
  // can tell the two mechanisms apart. What this line proves is the INVARIANT a user depends on; what it
  // does NOT prove is that the kind filter is load-bearing.
  //
  // [RESOLVED — elsewhere, and that is the point.] The filter IS load-bearing; the leak lands in the ranked
  // slab's `evicted` bucket, which `memory-header` never renders. `projectSlab()` does expose it, so the
  // mutant dies against `packages/adapter-io/test/memory-read-kind-filter.test.ts`. Recorded here rather
  // than deleted, because the useful fact is not "the filter is fine" — it is that this probe's surface
  // could not decide it, and which surface could.

  const rec = atlas(dir, ["memory-recall", "--kind", "task"], { ATLAS_ACTOR: seat })
  const found = /1 matching record\(s\)/.test(rec.out)
  record("M4", "task memory IS returned by an explicit recall", found, `exit=${rec.code}`)

  if (!KEEP) rmSync(dir, { recursive: true, force: true })
}

// ── M5 — TYPE DISCIPLINE AT THE JSON BOUNDARY (was the finding; is now the REGRESSION assertion) ────────
//
// WHAT THIS AXIS WAS. `atlas memory-emit <file.json>` reads arbitrary user JSON, and `MemoryEntry` was a
// compile-time claim with nothing enforcing it at that door: MEM-5 gated PRESENCE and KEY-MEMBERSHIP and,
// by its own header, never TYPE. So this axis asserted nothing and reported what it measured — that
// `frecency: "999"` was ADMITTED, reached disk, and RANKED in the turn header, because `'999' * 0.5 ** age`
// coerces; `"not-a-number"` and `null` decayed to NaN and 0 and vanished under the eviction floor instead.
// Three admitted writes, one of them competing for a real slab slot.
//
// WHAT IT IS NOW. The type check shipped, so the same three plants are refusals, and a finding turns into
// an assertion. The rewrite is not cosmetic: the OLD closing line ("the header injects 0 of them") would
// still read green today and would now be VACUOUS — zero writes survive the door, so of course zero rank.
// An assertion whose subject the previous gate already removed measures nothing. The oracle below is
// therefore the ADMITTED count, checked against a positive control in the same repo, so the axis can tell
// "refused at the door" apart from "the instrument stopped looking".
function axisM5() {
  const dir = freshRepo("m5")
  const seat = "seat:charlie"

  // POSITIVE CONTROL first: a well-typed record with the SAME field set must still be admitted and must
  // still rank. Without it, every refusal below is satisfied by a door that has stopped accepting writes.
  const ok = emitEntry(dir, PROJECT("a well-typed rule with a numeric frecency", 4), seat)
  record("M5", "CONTROL: the same shape, correctly typed, is ADMITTED", ok.code === 0, `exit=${ok.code}`)

  const probes = [
    {
      name: "frecency is a non-numeric string (decayed to NaN)",
      entry: { rule: "string frecency", scope: "s", frecency: "not-a-number" },
    },
    { name: "frecency is null (decayed to 0)", entry: { rule: "null frecency", scope: "s", frecency: null } },
    {
      name: "frecency is a NUMERIC string (the one that COERCED and RANKED)",
      entry: { rule: "ranked by a string", scope: "s", frecency: "999" },
    },
    {
      name: "frecency is NaN (typeof number, survives a naive check)",
      entry: { rule: "nan frecency", scope: "s", frecency: null },
      raw: '{"rule":"nan frecency","scope":"s","frecency":1e999}',
    },
  ]
  for (const pr of probes) {
    const r = pr.raw === undefined ? emitEntry(dir, pr.entry, seat) : emitRaw(dir, pr.raw, seat)
    const fired = firedGate(r.out)
    record(
      "M5",
      `REGRESSION: ${pr.name} — refused as template-invalid`,
      r.code === 2 && fired === "template-invalid",
      `exit=${r.code} fired=${fired}`,
    )
  }

  // The consequence the findings used to report, now as the assertion: exactly ONE record is on this seat's
  // ranked slab — the control. A regression that reopened the coercion path would read 2 or more here, and
  // the count is a number the render actually emits (the vacuity trap the M4 axis already paid for once).
  const hdr = atlas(dir, ["memory-header"], { ATLAS_ACTOR: seat })
  const m = /(\d+) project rule\(s\) injected/.exec(hdr.out)
  const injected = m ? Number(m[1]) : -1
  record(
    "M5",
    "exactly the ONE well-typed rule ranks; no untyped write reaches the slab",
    injected === 1,
    `injected=${injected}`,
  )

  // The availability question, kept: does a refused write leave the read doors usable? Measured — yes.
  const recall = atlas(dir, ["memory-recall", "--owner", seat])
  record(
    "M5",
    "the read doors stay live after four refusals (no bricking)",
    hdr.code === 0 && recall.code === 0,
    `header=${hdr.code} recall=${recall.code}`,
  )

  if (!KEEP) rmSync(dir, { recursive: true, force: true })
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────────────────

const m1ok = axisM1()
const m2 = axisM2()
const m3ok = axisM3()
axisM4()
axisM5()

const byAxis = {}
for (const r of RESULTS) {
  byAxis[r.axis] ??= { pass: 0, total: 0 }
  byAxis[r.axis].total += 1
  if (r.pass) byAxis[r.axis].pass += 1
}

console.log("\n── M-AXIS · the memory ring on the SHIPPED BINARY ─────────────────────────────────────────")
for (const r of RESULTS) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.axis}  ${r.name}  [${r.detail}]`)
if (FINDINGS.length > 0) {
  console.log("\n── OPEN FINDINGS · measured, not asserted ─────────────────────────────────────────────────")
  for (const f of FINDINGS) console.log(`  ${f}`)
}
console.log("\n── derivation ────────────────────────────────────────────────────────────────────────────")
for (const [a, v] of Object.entries(byAxis)) console.log(`  ${a}: ${v.pass}/${v.total}`)
console.log(`  M2 gate-naming: ${m2.named}/${m2.total} planted violations refused BY NAME`)
console.log(`  controls: M1-empty-before=${m1ok} M2-admits-clean=${m2.admits} M3-asymmetric=${m3ok}`)

const failed = RESULTS.filter((r) => !r.pass)
if (failed.length > 0) {
  console.log(`\n  ${failed.length} FAILED — the number above is NOT a result until these are explained.`)
  process.exit(1)
}
console.log("\n  all axes green, every control satisfied.")
