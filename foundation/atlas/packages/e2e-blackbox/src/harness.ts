// @atlas/e2e-blackbox — src/harness.ts  (WP-E2E-HARNESS — the black-box execution harness)
//
// Three reusable pieces that drive the REAL product through the ONLY doors a user/agent touches: the
// `atlas` CLI binary (as a subprocess) and the `atlas-mcp` server (over real MCP stdio). NO in-process
// shortcut — this module imports NO `@atlas/*` product code; it spawns the built `dist/**/bin.js` and
// speaks the wire protocols. Highest user fidelity. Everything is portable (`os.tmpdir()`, `process.execPath`,
// no machine-specific path). Pure I/O plumbing — the stories own the assertions.

import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { create } from "@bufbuild/protobuf"
import {
  serializeSCIP,
  IndexSchema,
  MetadataSchema,
  ToolInfoSchema,
  DocumentSchema,
  OccurrenceSchema,
  SymbolRole,
} from "@c4312/scip"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

/** A valid minimal admin policy (mirrors compose-b's POLICY / defaultPolicy) — proves the loader reads a
 *  real file, not a stub. Overridable per-fixture via `spec.policy`. */
export const DEFAULT_POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: {} },
})

/**
 * One document in the fixture's `.atlas/index.scip` dump: which SCIP symbols it DEFINES and which it
 * REFERENCES. A reference whose symbol is defined by some document in the same dump yields a `resolved`
 * dep edge; one that is defined nowhere yields an `unresolved` edge (INDEX-13, declared never guessed).
 */
export interface IndexedDoc {
  /** Repo-relative POSIX path — normally also a key of `FixtureSpec.files`. */
  readonly path: string
  readonly defines?: readonly string[]
  readonly references?: readonly string[]
}

/** The recipe for a fixture repo: a source tree (path → contents) plus an optional policy override. */
export interface FixtureSpec {
  /** Source files, keyed by repo-relative POSIX path (e.g. `src/foo.ts`). Nested dirs are created. */
  readonly files: Record<string, string>
  /** Optional policy JSON override (defaults to `DEFAULT_POLICY`). */
  readonly policy?: string
  /**
   * Optional SCIP occurrences. DEFAULT (omitted) is the empty document set every existing story gets, which
   * is why they are unaffected — and also why they cannot see the mining path at all: `build` derives dep
   * edges from SCIP occurrences ALONE, so an empty dump means 0 edges ⇒ 0 structural seeds ⇒ 0 ranked sites
   * ⇒ the extractor is never reached and `propose` is never called. A story about what happens AT a site
   * has to hand the product a repo that HAS sites.
   */
  readonly index?: readonly IndexedDoc[]
}

/** The live handle over a real on-disk temp git repo. */
export interface FixtureRepo {
  /** Absolute path to the repo root (under `os.tmpdir()`). */
  readonly repoPath: string
  /** Current `HEAD` commit SHA. */
  sha(): string
  /** Write + commit more files (for drift/history stories); returns the new `HEAD` SHA. */
  commit(files: Record<string, string>): string
  /** Remove the temp dir. */
  cleanup(): void
}

/** The result of driving the `atlas` CLI once. Never throws on a non-zero exit — the code is returned. */
export interface AtlasRun {
  readonly stdout: string
  readonly stderr: string
  /** Process exit code (ok 0 / error 1 / rejected 2). `null` status (signal kill) maps to `1`. */
  readonly exitCode: number
}

/** A connected MCP stdio session over the real `atlas-mcp` server. */
export interface McpSession {
  /** The SDK `Client` — `listTools()` / `callTool({ name, arguments })`. */
  readonly client: Client
  /** Tear down the transport + child process. */
  close(): Promise<void>
}

// ── repo-root resolution ────────────────────────────────────────────────────────────────────────────────
// Walk up from THIS module (works whether we run from `src/` under vitest or compiled `dist/src/`) until a
// dir holds `packages/cli/package.json` — the atlas monorepo root. Robust to depth (no `../../..` guessing).
function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    if (existsSync(join(dir, "packages", "cli", "package.json"))) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new Error("e2e-blackbox: could not locate atlas repo root (packages/cli)")
    dir = parent
  }
}

const REPO_ROOT = findRepoRoot()
/** Absolute path to the built `atlas` CLI entrypoint. */
export const CLI_BIN = join(REPO_ROOT, "packages", "cli", "dist", "src", "bin.js")
/** Absolute path to the built `atlas-mcp` server entrypoint. */
export const MCP_BIN = join(REPO_ROOT, "packages", "mcp-server", "dist", "src", "bin.js")

// ── makeFixtureRepo ─────────────────────────────────────────────────────────────────────────────────────
function writeTree(repoPath: string, files: Record<string, string>): void {
  for (const [rel, contents] of Object.entries(files)) {
    const abs = join(repoPath, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, contents)
  }
}

function git(repoPath: string, ...args: string[]): void {
  execFileSync("git", args, { cwd: repoPath, stdio: "ignore" })
}

/**
 * Build a REAL on-disk temp git repo (portable, under `os.tmpdir()`): the source tree, `.atlas/policy.json`
 * (a valid minimal admin policy), and a valid EMPTY-document `.atlas/index.scip` protobuf — then
 * `git init && add && commit`. `composeRuntime` enumerates the tree via `git ls-files` and reads the `.scip`
 * UNCONDITIONALLY (adapter-io/wire.ts), so both artifacts + a real git repo are mandatory.
 */
export function makeFixtureRepo(spec: FixtureSpec): FixtureRepo {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-e2e-"))
  mkdirSync(join(repoPath, ".atlas"), { recursive: true })
  writeFileSync(join(repoPath, ".atlas", "policy.json"), spec.policy ?? DEFAULT_POLICY)
  writeTree(repoPath, spec.files)
  // A valid minimal SCIP protobuf — the wire path reads this file unconditionally. `documents` is EMPTY
  // unless the spec names occurrences (see `FixtureSpec.index`).
  const scip = create(IndexSchema, {
    metadata: create(MetadataSchema, {
      projectRoot: `file://${repoPath}`,
      toolInfo: create(ToolInfoSchema, { name: "atlas-e2e-blackbox", version: "0" }),
    }),
    documents: (spec.index ?? []).map((doc) =>
      create(DocumentSchema, {
        relativePath: doc.path,
        occurrences: [
          ...(doc.defines ?? []).map((symbol) =>
            create(OccurrenceSchema, { symbol, symbolRoles: SymbolRole.Definition }),
          ),
          ...(doc.references ?? []).map((symbol) => create(OccurrenceSchema, { symbol, symbolRoles: 0 })),
        ],
      }),
    ),
  })
  writeFileSync(join(repoPath, ".atlas", "index.scip"), serializeSCIP(scip))
  // THE FIXTURE MUST LOOK LIKE A REAL ATLAS REPO, and a real one ignores its own durable store — Atlas's
  // repo-root `.gitignore` does exactly this (`.atlas/*` with `!.atlas/policy.json`). Without the rule the
  // `git add -A` in `commit()` below sweeps the store `atlas emit` just wrote into version control, and the
  // provenance tripwire (`adapter-io/src/store-provenance.ts`) then correctly refuses to serve it: a
  // COMMITTED projection carries rows no door ever saw, so it is not knowledge. That refusal is the product
  // behaving as designed; what was wrong was the fixture, which committed its store and then expected to
  // read it back. `index.scip` stays tracked deliberately — it is a build input, not the governed store.
  writeFileSync(join(repoPath, ".gitignore"), ".atlas/*\n!.atlas/policy.json\n!.atlas/index.scip\n")
  git(repoPath, "init", "-q")
  git(repoPath, "config", "user.email", "e2e@atlas.local")
  git(repoPath, "config", "user.name", "atlas-e2e")
  git(repoPath, "add", "-A")
  git(repoPath, "commit", "-q", "-m", "genesis")

  const sha = (): string => execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath, encoding: "utf8" }).trim()

  return {
    repoPath,
    sha,
    commit(files: Record<string, string>): string {
      writeTree(repoPath, files)
      git(repoPath, "add", "-A")
      git(repoPath, "commit", "-q", "-m", "drift")
      return sha()
    },
    cleanup(): void {
      rmSync(repoPath, { recursive: true, force: true })
    },
  }
}

// ── runAtlas ────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Drive the REAL `atlas` CLI once: `node <cli-dist>/bin.js …argv` with `cwd = repoPath` (so the bin's
 * `composeRuntime(process.cwd())` reads the fixture). Captures stdout+stderr+status; NEVER throws on a
 * non-zero exit — the code is returned (ok 0 / error 1 / rejected 2). Uses `process.execPath` (the running
 * node) so no PATH lookup is needed.
 */
export function runAtlas(repoPath: string, argv: string[], env?: Readonly<Record<string, string>>): AtlasRun {
  const res = spawnSync(process.execPath, [CLI_BIN, ...argv], {
    cwd: repoPath,
    encoding: "utf8",
    // ADDITIVE (ADR-0011): `env` overlays the parent's, so every existing story is unaffected. Needed
    // because the operator-scoped model config is located by `$ATLAS_MODEL_CONFIG`, and a story about it
    // must not mutate this process's own environment.
    ...(env !== undefined ? { env: { ...childEnv(), ...env } } : {}),
  })
  return {
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    exitCode: res.status ?? 1,
  }
}

// ── mcpSession ──────────────────────────────────────────────────────────────────────────────────────────
/** A clean string-valued env for the child (SDK stdio params reject `undefined` values). */
function childEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) out[k] = v
  return out
}

/**
 * Open a REAL MCP stdio session against the `atlas-mcp` server: spawn `node <mcp-dist>/bin.js` (cwd =
 * repoPath) behind the SDK `StdioClientTransport`, connect an SDK `Client`, and expose it (`listTools()` /
 * `callTool({ name, arguments })`). `close()` tears the transport + child down. The child's cwd is the
 * fixture, so its `composeRuntime(process.cwd())` serves the same governed core the CLI does.
 */
export async function mcpSession(repoPath: string): Promise<McpSession> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [MCP_BIN],
    cwd: repoPath,
    env: childEnv(),
  })
  const client = new Client({ name: "atlas-e2e-blackbox", version: "0.0.0" }, { capabilities: {} })
  await client.connect(transport)
  return {
    client,
    async close(): Promise<void> {
      await client.close()
    },
  }
}
