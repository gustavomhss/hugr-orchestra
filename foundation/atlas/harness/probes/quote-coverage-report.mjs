// harness/probes/quote-coverage-report.mjs — RUN IT: `node harness/probes/quote-coverage-report.mjs`
//
// A REPORT, not a gate: it always exits 0 on a real tree, because `harness/gates/` means "files that CAN
// FAIL, run by name in CI" and quote coverage has no agreed bar to fail against yet — issue #208 measures
// first and lets the owner pick the bar. It re-runs `req-clause-guard` to build its input, so the
// enumeration is always the GATE's and never a second parser's.
//
// ── WHY THIS IS A SEPARATE FILE AND NOT A MAIN-BLOCK IN THE LIB ──────────────────────────────────────
// It WAS a `if (process.argv[1] === fileURLToPath(import.meta.url))` block at the foot of
// `harness/lib/quote-coverage.mjs`. That made the lib fail `gate-directory.test.mjs`'s contract — a file in
// `harness/lib/` must exit 0 and print nothing when run as a script — because on an empty tree
// `req-clause-guard` finds no corpus, writes no dump, and the read throws.
//
// The interesting part is WHY that went green locally and red on CI. The probe copies `harness/` into
// `os.tmpdir()`. On macOS that is `/var/folders/…`, which is a symlink to `/private/var/folders/…`:
// `process.argv[1]` keeps the `/var` spelling while `import.meta.url` resolves to `/private/var`, so the
// main-block guard compared unequal, the block NEVER RAN, and the test passed having executed nothing. On
// Linux there is no such symlink, the guard compared equal, and the block ran and crashed. Measured on one
// tree, both ways: base `/var/folders/…` → exit 0, stdout empty; base `/private/var/folders/…` → exit 1.
//
// So a fitness function that runs a file to measure it can be silently defeated by path spelling. Splitting
// the runnable half out is the fix that does not depend on getting that comparison right ever again.
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { report } from "../lib/quote-coverage.mjs"
import { norm } from "../lib/inv-text-pin.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), "quote-coverage-"))
const dumpPath = join(tmp, "dump.json")
try {
  // The gate may exit non-zero on an unrelated failure; the dump is still written, so read it either way
  // and say so rather than silently reporting on a stale or absent file.
  try {
    execFileSync(process.execPath, [join(here, "..", "gates", "req-clause-guard.mjs")], {
      env: { ...process.env, REQ_CLAUSE_DUMP: dumpPath },
      stdio: "ignore",
    })
  } catch {
    console.log("  NOTE: req-clause-guard exited non-zero on this tree; scoring the dump it still produced.")
  }
  // No dump at all is a different condition from an empty one, and it is the one that fires on a tree with
  // no corpus. Name it, rather than surfacing the gate's absence as this probe's ENOENT.
  if (!existsSync(dumpPath)) {
    console.log(
      `  NO DUMP: req-clause-guard wrote nothing to ${dumpPath}, so there is no corpus to score here. ` +
        `Run this from a tree that has docs/requirements/ and harness/req-clause-ledger.json.`,
    )
  } else {
    report(JSON.parse(readFileSync(dumpPath, "utf8")), norm)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
