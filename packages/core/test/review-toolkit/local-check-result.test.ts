import { expect, test } from "bun:test"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewLocalCheckResult } from "../../src/review-toolkit/local-check-result"

const native = (stdout = "", stderr = "", extra: Partial<ResearchProcess.Outcome> = {}): ResearchProcess.Outcome => ({
  exitCode: 0, durationMs: 1, timedOut: false, overflow: false, memoryExceeded: false,
  stdout: { data: Buffer.from(stdout), bytes: Buffer.byteLength(stdout), truncated: false },
  stderr: { data: Buffer.from(stderr), bytes: Buffer.byteLength(stderr), truncated: false }, ...extra,
})

// Captured from actual pinned executables in hosted run 43353129096, not tool output synthesized by this suite.
const goldens = [
  {
    "tool": "shfmt",
    "fixture": "clean",
    "version": "3.14.1",
    "exitCode": 0,
    "stdout": "",
    "stderr": ""
  },
  {
    "tool": "shfmt",
    "fixture": "format",
    "version": "3.14.1",
    "exitCode": 1,
    "stdout": "diff /tmp/scan-projection-ytmjBz/tree/selected.sh.orig /tmp/scan-projection-ytmjBz/tree/selected.sh\n--- /tmp/scan-projection-ytmjBz/tree/selected.sh.orig\n+++ /tmp/scan-projection-ytmjBz/tree/selected.sh\n@@ -1,3 +1,3 @@\n-if true;then\n-echo ok\n+if true; then\n+  echo ok\n fi\n",
    "stderr": ""
  },
  {
    "tool": "shfmt",
    "fixture": "syntax",
    "version": "3.14.1",
    "exitCode": 1,
    "stdout": "",
    "stderr": "/tmp/scan-projection-aWMXIx/tree/selected.sh:1:1: `if` must be followed by a statement list\n"
  },
  {
    "tool": "cargo-machete",
    "fixture": "used",
    "version": "0.9.2",
    "exitCode": 0,
    "stdout": "cargo-machete didn't find any unused dependencies in this directory. Good job!\n",
    "stderr": "Analyzing dependencies of crates in ....\nDone!\n"
  },
  {
    "tool": "cargo-machete",
    "fixture": "unused",
    "version": "0.9.2",
    "exitCode": 1,
    "stdout": "cargo-machete found the following unused dependencies in this directory:\nfixture -- ./Cargo.toml:\n\tanyhow\n\nIf you believe cargo-machete has detected an unused dependency incorrectly,\nyou can add the dependency to the list of dependencies to ignore in the\n`[package.metadata.cargo-machete]` section of the appropriate Cargo.toml.\nFor example:\n\n[package.metadata.cargo-machete]\nignored = [\"prost\"]\n\nYou can also try running it with the `--with-metadata` flag for better accuracy,\nthough this may modify your Cargo.lock files.\n\n",
    "stderr": "Analyzing dependencies of crates in ....\nDone!\n"
  },
  {
    "tool": "cargo-machete",
    "fixture": "invalid",
    "version": "0.9.2",
    "exitCode": 0,
    "stdout": "cargo-machete didn't find any unused dependencies in this directory. Good job!\n",
    "stderr": "Analyzing dependencies of crates in ....\nerror when handling ./Cargo.toml: TOML parse error at line 1, column 8\n  |\n1 | [broken TOML\n  |        ^\nunclosed table, expected `]`\n: TOML parse error at line 1, column 8\n  |\n1 | [broken TOML\n  |        ^\nunclosed table, expected `]`\n\nDone!\n"
  },
  {
    "tool": "cargo-machete",
    "fixture": "ancestor",
    "version": "0.9.2",
    "exitCode": 1,
    "stdout": "cargo-machete found the following unused dependencies in this directory:\nfixture -- ./Cargo.toml:\n\tanyhow\n\nIf you believe cargo-machete has detected an unused dependency incorrectly,\nyou can add the dependency to the list of dependencies to ignore in the\n`[package.metadata.cargo-machete]` section of the appropriate Cargo.toml.\nFor example:\n\n[package.metadata.cargo-machete]\nignored = [\"prost\"]\n\nYou can also try running it with the `--with-metadata` flag for better accuracy,\nthough this may modify your Cargo.lock files.\n\n",
    "stderr": "Analyzing dependencies of crates in ....\nDone!\n"
  },
  {
    "tool": "cargo-machete",
    "fixture": "escape",
    "version": "0.9.2",
    "exitCode": 1,
    "stdout": "cargo-machete found the following unused dependencies in this directory:\nfixture -- ./Cargo.toml:\n\tanyhow\n\nIf you believe cargo-machete has detected an unused dependency incorrectly,\nyou can add the dependency to the list of dependencies to ignore in the\n`[package.metadata.cargo-machete]` section of the appropriate Cargo.toml.\nFor example:\n\n[package.metadata.cargo-machete]\nignored = [\"prost\"]\n\nYou can also try running it with the `--with-metadata` flag for better accuracy,\nthough this may modify your Cargo.lock files.\n\n",
    "stderr": "Analyzing dependencies of crates in ....\nDone!\n"
  }
] as const

test("settles actual pinned native clean, difference, parse and outside-influence outputs", () => {
  for (const row of goldens) {
    const expected = row.fixture === "invalid" || row.fixture === "syntax" ? "acquisition-error" : row.fixture === "clean" || row.fixture === "used" ? "pass" : "fail"
    expect(ReviewLocalCheckResult.settle(row.tool, native(row.stdout, row.stderr, { exitCode: row.exitCode })).status, `${row.tool}:${row.fixture}`).toBe(expected)
  }
})

test("resource exhaustion and incomplete capture never settle as clean checks", () => {
  for (const tool of ["shfmt", "cargo-machete"] as const) {
    expect(ReviewLocalCheckResult.settle(tool, native("", "", { timedOut: true }))).toEqual({ status: "not-run", reason: "local-check-time-limit" })
    expect(ReviewLocalCheckResult.settle(tool, native("", "", { memoryExceeded: true }))).toEqual({ status: "not-run", reason: "local-check-memory-limit" })
    expect(ReviewLocalCheckResult.settle(tool, native("", "", { failure: "failed to spawn" }))).toEqual({ status: "acquisition-error", reason: "local-check-process-failed" })
    for (const field of ["stdout", "stderr"] as const) expect(ReviewLocalCheckResult.settle(tool, native("", "", { [field]: { data: Buffer.alloc(0), bytes: 1, truncated: true } }))).toEqual({ status: "acquisition-error", reason: "local-check-output-incomplete" })
    expect(ReviewLocalCheckResult.settle(tool, native("", "", { overflow: true }))).toEqual({ status: "acquisition-error", reason: "local-check-output-incomplete" })
  }
})

test("invalid byte accounting, capture limits and UTF8 refuse before native settlement", () => {
  for (const tool of ["shfmt", "cargo-machete"] as const) for (const field of ["stdout", "stderr"] as const) {
    for (const stream of [{ data: Buffer.alloc(0), bytes: -1, truncated: false }, { data: Buffer.from("x"), bytes: 0, truncated: false }, { data: Buffer.from("x"), bytes: 2, truncated: false }, { data: Buffer.alloc(256 * 1024 + 1), bytes: 256 * 1024 + 1, truncated: false }]) expect(ReviewLocalCheckResult.settle(tool, native("", "", { [field]: stream }))).toEqual({ status: "acquisition-error", reason: "local-check-output-invalid" })
    expect(ReviewLocalCheckResult.settle(tool, native("", "", { [field]: { data: Buffer.from([255]), bytes: 1, truncated: false } }))).toEqual({ status: "acquisition-error", reason: "local-check-output-encoding" })
  }
})

test("unknown exits, unknown text and cargo diagnostics at zero are acquisition errors", () => {
  for (const tool of ["shfmt", "cargo-machete"] as const) for (const exitCode of [null, 2, 127]) expect(ReviewLocalCheckResult.settle(tool, native("", "", { exitCode }))).toEqual({ status: "acquisition-error", reason: "local-check-native-error" })
  expect(ReviewLocalCheckResult.settle("shfmt", native("unexpected"))).toEqual({ status: "acquisition-error", reason: "local-check-native-error" })
  expect(ReviewLocalCheckResult.settle("shfmt", native("@@ fake diff", "", { exitCode: 1 }))).toEqual({ status: "acquisition-error", reason: "local-check-native-error" })
  for (const stderr of ["", "Done!\n", "error when handling ./Cargo.toml\n", ReviewLocalCheckResult.CARGO_ROUTINE + "warning: source unreadable\n"]) expect(ReviewLocalCheckResult.settle("cargo-machete", native(ReviewLocalCheckResult.CARGO_CLEAN, stderr))).toEqual({ status: "acquisition-error", reason: "local-check-native-error" })
  expect(ReviewLocalCheckResult.settle("cargo-machete", native("cargo-machete found the following unused dependencies in this directory:\n", ReviewLocalCheckResult.CARGO_ROUTINE, { exitCode: 1 }))).toEqual({ status: "acquisition-error", reason: "local-check-native-error" })
})


test("both tools require their exact native success shape and reject diagnostics on difference paths", () => {
  const format = goldens.find((row) => row.tool === "shfmt" && row.fixture === "format")!
  const unused = goldens.find((row) => row.tool === "cargo-machete" && row.fixture === "unused")!
  for (const stdout of ["", "unexpected output\n", ReviewLocalCheckResult.CARGO_CLEAN + "extra"]) expect(ReviewLocalCheckResult.settle("cargo-machete", native(stdout, ReviewLocalCheckResult.CARGO_ROUTINE))).toEqual({ status: "acquisition-error", reason: "local-check-native-error" })
  for (const stderr of ["", "Done!\n", ReviewLocalCheckResult.CARGO_ROUTINE + "warning\n"]) expect(ReviewLocalCheckResult.settle("cargo-machete", native(unused.stdout, stderr, { exitCode: 1 }))).toEqual({ status: "acquisition-error", reason: "local-check-native-error" })
  expect(ReviewLocalCheckResult.settle("shfmt", native("", "warning\n"))).toEqual({ status: "acquisition-error", reason: "local-check-native-error" })
  expect(ReviewLocalCheckResult.settle("shfmt", native(format.stdout, "warning\n", { exitCode: 1 }))).toEqual({ status: "acquisition-error", reason: "local-check-native-error" })
  // Synthetic boundary padding around real captured headers isolates the capture ceiling from native fixture size.
  expect(ReviewLocalCheckResult.settle("shfmt", native(format.stdout.padEnd(256 * 1024, "x"), "", { exitCode: 1 })).status).toBe("fail")
  expect(ReviewLocalCheckResult.settle("cargo-machete", native(unused.stdout.padEnd(256 * 1024, "x"), ReviewLocalCheckResult.CARGO_ROUTINE, { exitCode: 1 })).status).toBe("fail")
})
