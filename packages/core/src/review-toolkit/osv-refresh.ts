export * as ReviewOsvRefresh from "./osv-refresh"

import path from "path"
import { mkdir, writeFile } from "fs/promises"
import { Effect } from "effect"
import { ResearchProcess } from "../research-toolkit/process"
import { ReviewOsv } from "./osv"
import { ReviewOsvFacts } from "./osv-facts"

// D7 host refresh. This is not the review path. The documented v2.7.1 command downloads while it
// scans a directory, so the operand is a host-owned directory, never the review copy.

const ECOSYSTEMS = ["Go", "PyPI", "crates.io", "npm"] as const

// One extractable lockfile per ecosystem the review can ask for. The scanner writes
// `osv-scalibr/<ecosystem>/all.zip` only after it extracts a package of that ecosystem.
const FIXTURES = {
  "package-lock.json": `${JSON.stringify({
    name: "host-refresh",
    lockfileVersion: 3,
    requires: true,
    packages: { "node_modules/left-pad": { version: "1.3.0" } },
  }, null, 2)}\n`,
  "Cargo.lock": [
    "version = 3",
    "",
    "[[package]]",
    'name = "libc"',
    'version = "0.2.169"',
    'source = "registry+https://github.com/rust-lang/crates.io-index"',
    'checksum = "0000000000000000000000000000000000000000000000000000000000000000"',
    "",
  ].join("\n"),
  "poetry.lock": [
    "[[package]]",
    'name = "urllib3"',
    'version = "2.2.3"',
    'description = ""',
    "optional = false",
    'python-versions = ">=3.8"',
    "files = []",
    "",
    "[metadata]",
    'lock-version = "2.1"',
    'python-versions = "*"',
    'content-hash = "0000000000000000000000000000000000000000000000000000000000000000"',
    "",
  ].join("\n"),
  "go.mod": "module host.refresh\n\ngo 1.22\n\nrequire rsc.io/quote v1.5.2\n",
} as const

type Ran = { readonly exitCode: number | null; readonly failure?: string }
type Spawn<R> = (input: {
  readonly argv: readonly string[]
  readonly cwd: string
  readonly env: Record<string, string>
}) => Effect.Effect<Ran, never, R>

export function refresh<R>(spawn: Spawn<R>) {
  return Effect.gen(function* () {
  const located = yield* ReviewOsv.binary()
  if (!located.ok) return { ok: false as const, reason: located.reason }
  const dir = ReviewOsvFacts.refreshTarget()
  yield* Effect.promise(() => mkdir(dir, { recursive: true }))
  yield* Effect.promise(() => Promise.all(Object.entries(FIXTURES).map(([name, text]) => writeFile(path.join(dir, name), text))))
  const command = ReviewOsvFacts.refreshArgv(located.executable, dir)
  const env = { ...ResearchProcess.environment(), OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: ReviewOsvFacts.databaseDir() }
  const ran = yield* spawn({ argv: command, cwd: dir, env })
  if (ran.failure) return { ok: false as const, reason: ran.failure }
  if (ran.exitCode !== 0 && ran.exitCode !== 1) return { ok: false as const, reason: `exit ${ran.exitCode}` }
  const ready = yield* ReviewOsvFacts.databaseReady(ReviewOsvFacts.databaseDir(), ECOSYSTEMS)
  if (!ready) return { ok: false as const, reason: "osv advisory database was not written" }
  return { ok: true as const, dir: ReviewOsvFacts.databaseDir() }
  })
}

