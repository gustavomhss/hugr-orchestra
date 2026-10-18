// harness/gates/gate-directory.test.mjs — the fitness function for the GATES DIRECTORY ITSELF.
//
// > `harness/gates/` holds files that CAN FAIL and are run BY NAME in CI.
// > Everything a gate imports lives in `harness/lib/`.
//
// ── THE DEFECT THIS EXISTS TO STOP RETURNING ─────────────────────────────────────────────────────────
// Three files sat in `harness/gates/` that `node <file>` ran to completion, exit 0, having asserted
// nothing: `lexing.mjs`, `drift-patterns.mjs`, `reachability.mjs`. None was dead code — each has a vitest
// twin, and `reference-model-guard` genuinely stands on `reachability.mjs`. What was false was the
// LOCATION. Listing the directory gave 9 "gates"; reading `ci.yml` gave 6. The difference read like
// coverage, and a directory whose entire meaning is "these fail the build" contained files that could not
// fail. They were moved to `harness/lib/` — not deleted, not given teeth, because neither would have been
// true. This file is what makes the next one impossible to add quietly.
//
// ── WHY THE CHECK IS EMPIRICAL AND NOT SYNTACTIC ─────────────────────────────────────────────────────
// The obvious implementation is to grep each gate for `process.exit(1)`. That check passes the moment
// someone writes an unreachable one, which is the same class of lie one level in: a guard that is present
// and not reachable. So the property is measured by RUNNING the file.
//
// The probe: copy `harness/` into an otherwise-empty directory (with `node_modules` symlinked so imports
// still resolve) and run each gate there. Every gate derives the repo root from its own location, so in
// that tree the root has no `docs/`, no `packages/`, no git. A gate MUST exit non-zero there — it has
// nothing to check, and printing OK would be exactly the failure mode. A pure library module exits 0,
// which in `harness/lib/` is correct and in `harness/gates/` is the bug.
//
// This is a real falsification, not a tautology: it was run against the pre-fix tree and the three
// non-gates scored exit 0 while all six real gates scored exit 1.
//
// ── WHAT IT DELIBERATELY DOES NOT CLAIM ──────────────────────────────────────────────────────────────
// "Exits non-zero on an empty tree" proves a gate has a reachable failure path. It does NOT prove the gate
// checks the RIGHT thing, nor that its checks are reachable on a POPULATED tree — a gate could fail here
// on a missing directory and be vacuous on the real corpus. Each gate's own `*.test.mjs` twin is what
// covers that, and where a gate has no twin this file is the only mechanical thing standing behind it.

import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const GATES = dirname(fileURLToPath(import.meta.url))
const HARNESS = join(GATES, "..")
const REPO = join(HARNESS, "..")

const isTest = (n) => n.endsWith(".test.mjs")
const modules = (dir) =>
  readdirSync(dir)
    .filter((n) => n.endsWith(".mjs") && !isTest(n))
    .sort()

const gateFiles = modules(GATES)
const libFiles = modules(join(HARNESS, "lib"))

/** The gates CI actually runs, resolved workflow → npm script → file. Neither half is transcribed. */
function gatesNamedInCi() {
  const workflow = readFileSync(join(REPO, ".github", "workflows", "ci.yml"), "utf8")
  const scripts = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).scripts
  const named = new Set()
  for (const m of workflow.matchAll(/^\s*-\s*run:\s*npm run ([A-Za-z0-9:_-]+)/gm)) {
    const cmd = scripts[m[1]]
    if (cmd === undefined) continue
    const f = /harness\/gates\/([A-Za-z0-9._-]+\.mjs)/.exec(cmd)
    if (f !== null) named.add(f[1])
  }
  return named
}

/** `harness/` alone in an empty tree, `node_modules` symlinked so imports still resolve. */
function emptyTreeRun(relPath) {
  const tmp = mkdtempSync(join(tmpdir(), "atlas-gatefitness-"))
  try {
    cpSync(HARNESS, join(tmp, "harness"), { recursive: true })
    symlinkSync(join(REPO, "node_modules"), join(tmp, "node_modules"))
    try {
      const stdout = execFileSync(process.execPath, [join(tmp, relPath)], {
        cwd: tmp,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
      return { code: 0, stdout }
    } catch (e) {
      return { code: e.status ?? -1, stdout: e.stdout ?? "" }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

describe("harness/gates/ — the directory means one thing", () => {
  it("is not empty (a vacuous inventory would make every assertion below trivially true)", () => {
    expect(gateFiles.length).toBeGreaterThan(0)
    expect(libFiles.length).toBeGreaterThan(0)
  })

  it("every file in harness/gates/ is RUN BY NAME in ci.yml, and every gate ci.yml names is there", () => {
    const ci = gatesNamedInCi()
    expect([...ci].sort()).toEqual(gateFiles)
  })

  it.each(gateFiles)(
    "%s CAN FAIL — pointed at an empty tree it exits non-zero",
    (file) => {
      const { code, stdout } = emptyTreeRun(join("harness", "gates", file))
      expect(
        code,
        `${file} exited 0 on a tree with no docs/, no packages/ and no git, printing ${JSON.stringify(
          stdout.trim().slice(0, 120),
        )}. A file in harness/gates/ that cannot fail is not a gate: give it teeth or move it to harness/lib/.`,
      ).not.toBe(0)
    },
    30_000,
  )

  it.each(libFiles)(
    "%s is a LIBRARY — importing it runs no sweep and prints nothing",
    (file) => {
      const { code, stdout } = emptyTreeRun(join("harness", "lib", file))
      expect(code, `harness/lib/${file}: a library must not fail on import`).toBe(0)
      expect(stdout.trim(), `harness/lib/${file}: a library must not report a verdict`).toBe("")
    },
    30_000,
  )

  it("no gate imports another gate — shared code lives in harness/lib/", () => {
    const offenders = []
    for (const file of gateFiles) {
      const src = readFileSync(join(GATES, file), "utf8")
      for (const m of src.matchAll(/\bfrom\s+'\.\/([A-Za-z0-9._-]+\.mjs)'/g)) {
        offenders.push(`${file} imports ./${m[1]} — move the shared module to ../lib/`)
      }
    }
    expect(offenders).toEqual([])
  })

  // The one-way dependency (harness/README.md). The predicate is an IMPORT POSITION, not the substring
  // `@atlas/`: that substring occurs 60× in `harness/` — in prose, in layer-guard's specifier regex, and in
  // the fixtures layer-guard's own teeth are written against. The README's stated verification was the
  // substring grep with the words "must return nothing" beside it, which had been false for a long time.
  it("harness/ imports no @atlas/* product code (the one-way dependency, harness/README.md)", () => {
    const hits = []
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (
          e.name.endsWith(".mjs") &&
          /^\s*(?:import|export)\b[^\n]*from\s*'@atlas\//m.test(readFileSync(p, "utf8"))
        ) {
          hits.push(p.slice(REPO.length + 1))
        }
      }
    }
    walk(HARNESS)
    expect(hits).toEqual([])
  })
})
