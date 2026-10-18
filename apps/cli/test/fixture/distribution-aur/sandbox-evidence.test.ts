import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Option, Schema, SchemaIssue } from "effect"
import { aurBootstrapEvidence, aurBootstrapEvidenceTeeth } from "./sandbox-evidence"

// Synthetic receipt/query bytes exercise the actual reader only. These tests
// execute no pacman, native executable, Docker, model, or process-spawn proof.
const optional = ["PackageRequired", "PackageTrustedOnly", "DatabaseOptional", "DatabaseTrustedOnly"]
const required = ["PackageRequired", "PackageTrustedOnly", "DatabaseRequired", "DatabaseTrustedOnly"]
const restriction = "debug: filesystem access has been restricted to /var/cache/pacman/pkg, landlock ABI is 7"
const baselineLog = `debug: synchronizing package databases\n${restriction}\n`

test("receipt admission survives Schema-decoded key order and preserves owned input bytes", async () => {
  await using f = await fixture()
  const admitted = await aurBootstrapEvidence(f.directory)
  expect(admitted).toEqual(f.receipt)
  expect(Object.keys(admitted.repositories[0])).not.toEqual(Object.keys(f.receipt.repositories[0]))
  Object.assign(admitted, { globalSigLevel: ["PackageNever"] })
  expect(await aurBootstrapEvidence(f.directory)).toEqual(f.receipt)
  expect(await Promise.all(Object.keys(f.files).map((name) => readFile(join(f.directory, name), "utf8"))))
    .toEqual(Object.values(f.files))
})

test("actual reader admits inherited optional DB and tool-resolved required DB policies", async () => {
  await using f = await fixture()
  const admitted = await aurBootstrapEvidence(f.directory)
  expect(admitted.repositories).toEqual([
    { name: "core", sigLevel: optional, queriedSigLevel: [], sigLevelSource: "global-inherited" },
    { name: "extra", sigLevel: required, queriedSigLevel: required, sigLevelSource: "pacman-conf-resolved-override" },
  ])
})

const files = [
  { name: "empty global cannot authorize an inherited repository", file: "bootstrap-global-siglevel.txt", bytes: "",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_GLOBAL_SIGLEVEL_REQUIRED" },
  { name: "unsigned global cannot authorize inheritance", file: "bootstrap-global-siglevel.txt", bytes: "PackageNever\nDatabaseNever\n",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_GLOBAL_SIGLEVEL_UNSAFE_OR_UNSUPPORTED" },
  { name: "unknown global query role is refused", file: "bootstrap-global-siglevel.txt", bytes: "core\nextra\n",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_GLOBAL_SIGLEVEL_UNSAFE_OR_UNSUPPORTED" },
  { name: "unsigned explicit override never falls back to safe global", file: "bootstrap-siglevel-core.txt", bytes: "PackageNever\nDatabaseNever\n",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_SIGNED_REPOSITORIES_REQUIRED" },
  { name: "TrustAll override is refused", file: "bootstrap-siglevel-core.txt", bytes: "PackageRequired\nPackageTrustAll\nDatabaseOptional\nDatabaseTrustedOnly\n",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_SIGNED_REPOSITORIES_REQUIRED" },
  { name: "partial unresolved override is refused", file: "bootstrap-siglevel-core.txt", bytes: "DatabaseOptional\n",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_SIGNED_REPOSITORIES_REQUIRED" },
  { name: "whitespace is not documented zero-byte unset marker", file: "bootstrap-siglevel-core.txt", bytes: "\n",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_SIGNED_REPOSITORIES_REQUIRED" },
  { name: "global warning is refused", file: "bootstrap-global-siglevel.stderr", bytes: "warning: unknown directive 'SigLevel'\n",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_PACMAN_POLICY_QUERY_DIAGNOSTIC" },
  { name: "repository warning is refused even with inherited policy", file: "bootstrap-siglevel-core.stderr", bytes: "warning: unknown directive 'SigLevel'\n",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_PACMAN_POLICY_QUERY_DIAGNOSTIC" },
  { name: "failed repository query is not inheritance", file: "bootstrap-siglevel-core.status", bytes: "1\n",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_PACMAN_POLICY_QUERY_FAILED" },
  { name: "failed repository census is refused", file: "bootstrap-repositories.status", bytes: "1\n",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_PACMAN_POLICY_QUERY_FAILED" },
  { name: "empty repository census is refused", file: "bootstrap-repositories.txt", bytes: "",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_SIGNED_REPOSITORY_POLICY_EMPTY_OR_INVALID" },
  { name: "empty DownloadUser is refused", file: "bootstrap-sandbox-user.txt", bytes: "",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_PACMAN_ALPM_DOWNLOAD_USER_REQUIRED" },
  { name: "unknown directive warning cannot become DownloadUser", file: "bootstrap-sandbox-user.txt", bytes: "warning: unknown directive 'SandboxUser'\n",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_PACMAN_ALPM_DOWNLOAD_USER_REQUIRED" },
  { name: "fractional queried UID is refused", file: "bootstrap-download-user-uid.txt", bytes: "997.5\n",
    code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", cause: "AUR_PACMAN_NONROOT_DOWNLOAD_USER_REQUIRED" },
]
for (const item of files) test(item.name, async () => {
  await using f = await fixture()
  await Bun.write(join(f.directory, item.file), item.bytes)
  await failure(f.directory, item.code, item.cause)
})

for (const item of [
  { name: "mandatory receipt missing", file: "bootstrap-sandbox.json", code: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE",
    cause: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_UNAVAILABLE" },
  { name: "mandatory pacman log missing", file: "bootstrap-pacman.log", code: "AUR_BOOTSTRAP_SANDBOX_LOG_UNAVAILABLE" },
  { name: "missing DownloadUser is not silently defaulted", file: "bootstrap-sandbox-user.txt", code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID" },
  { name: "missing signature projection is not inheritance", file: "bootstrap-siglevel-core.txt", code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID" },
]) test(item.name, async () => {
  await using f = await fixture()
  await rm(join(f.directory, item.file))
  const error = await failure(f.directory, item.code, item.cause)
  if (item.cause) return
  expect(error.cause).toBeInstanceOf(Error)
  if (!(error.cause instanceof Error) || !("code" in error.cause)) throw new Error("UNIT_FILE_ERROR_CAUSE_REQUIRED")
  expect(error.cause.code).toBe("ENOENT")
})

for (const item of [
  { name: "fractional receipt UID", patch: { downloadUserUID: 997.5 }, path: ["downloadUserUID"], value: 997.5 },
  { name: "fractional Landlock ABI", patch: { probe: { abi: 7.5 } }, path: ["probe", "abi"], value: 7.5 },
  { name: "disabled seccomp receipt", patch: { probe: { seccomp: 0 } }, path: ["probe", "seccomp"], value: 0 },
  { name: "disabled NNP receipt", patch: { probe: { noNewPrivileges: 0 } }, path: ["probe", "noNewPrivileges"], value: 0 },
  { name: "outside write permitted receipt", patch: { probe: { outsideWriteErrno: 0 } }, path: ["probe", "outsideWriteErrno"], value: 0 },
]) test(`${item.name} rejects with exact structured schema location/value`, async () => {
  await using f = await fixture()
  await receipt(f, { ...f.receipt, ...item.patch,
    probe: "probe" in item.patch ? { ...f.receipt.probe, ...item.patch.probe } : f.receipt.probe,
  })
  const error = await failure(f.directory, "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE")
  expect(Schema.isSchemaError(error.cause)).toBe(true)
  if (!Schema.isSchemaError(error.cause)) throw new Error("UNIT_SCHEMA_ERROR_CAUSE_REQUIRED")
  const issues = SchemaIssue.makeFormatterStandardSchemaV1({
    leafHook: (issue) => JSON.stringify(Option.getOrUndefined(SchemaIssue.getActual(issue))) ?? "missing",
    checkHook: (issue) => JSON.stringify(issue.actual),
  })(error.cause.issue).issues
  expect(issues).toEqual([{ path: item.path, message: JSON.stringify(item.value) }])
})

test("missing receipt DownloadUser metadata fails schema instead of inventing a user", async () => {
  await using f = await fixture()
  await receipt(f, Object.fromEntries(Object.entries(f.receipt).filter(([key]) => key !== "sandboxUser")))
  const error = await failure(f.directory, "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE")
  expect(Schema.isSchemaError(error.cause)).toBe(true)
  if (!Schema.isSchemaError(error.cause)) throw new Error("UNIT_SCHEMA_ERROR_CAUSE_REQUIRED")
  expect(SchemaIssue.makeFormatterStandardSchemaV1()(error.cause.issue).issues.map((issue) => issue.path)).toEqual([["sandboxUser"]])
})

for (const line of [
  "debug: no-op download sandbox; filesystem restrictions were not applied",
  "debug: no-op: filesystem access has been restricted to /var/cache/pacman/pkg, landlock ABI is 7",
  "debug: filesystem access has been restricted to /var/cache/pacman/pkg, landlock ABI is 0",
  "debug: filesystem access has been restricted to /var/cache/pacman/pkg, landlock ABI is 7.5",
]) test(`nonenforcement claim rejects through actual log parser: ${line}`, async () => {
  await using f = await fixture()
  await Bun.write(join(f.directory, "bootstrap-pacman.log"), `${line}\n`)
  await receipt(f, { ...f.receipt, filesystemRestrictions: [line], logSha256: digest(`${line}\n`) })
  await failure(f.directory, "AUR_PACMAN_DOWNLOAD_LANDLOCK_NOT_ENFORCED")
})

test("successful record plus actual Landlock failure diagnostic is rejected", async () => {
  await using f = await fixture()
  const log = `${restriction}\nerror: restricting filesystem access failed because the Landlock ruleset could not be applied: Operation not permitted\n`
  await Bun.write(join(f.directory, "bootstrap-pacman.log"), log)
  await receipt(f, { ...f.receipt, logSha256: digest(log) })
  await failure(f.directory, "AUR_PACMAN_DOWNLOAD_LANDLOCK_NOT_ENFORCED")
})

test("transient mirror retrieval retry does not hide enforced Landlock", async () => {
  await using f = await fixture()
  const log = `${restriction}\nerror: failed retrieving file 'python-3.14.8-1-x86_64.pkg.tar.zst' from fastly.mirror.pkgbuild.com : Recv failure: Connection reset by peer\n`
  await Bun.write(join(f.directory, "bootstrap-pacman.log"), log)
  await receipt(f, { ...f.receipt, logSha256: digest(log) })
  expect(await aurBootstrapEvidence(f.directory)).toEqual({ ...f.receipt, logSha256: digest(log) })
})

test("mirror retry beside an actual Landlock failure diagnostic is still rejected", async () => {
  await using f = await fixture()
  const log = `${restriction}\nerror: failed retrieving file 'gcc.pkg.tar.zst' from mirror.example : Recv failure\nerror: restricting filesystem access failed because the Landlock ruleset could not be applied: Operation not permitted\n`
  await Bun.write(join(f.directory, "bootstrap-pacman.log"), log)
  await receipt(f, { ...f.receipt, logSha256: digest(log) })
  await failure(f.directory, "AUR_PACMAN_DOWNLOAD_LANDLOCK_NOT_ENFORCED")
})

test("policy-provenance tampering and stale log digests are refused", async () => {
  await using f = await fixture()
  await receipt(f, { ...f.receipt, repositories: f.receipt.repositories.map((repo) => ({ ...repo, sigLevelSource: "pacman-conf-resolved-override" })) })
  await failure(f.directory, "AUR_BOOTSTRAP_REPOSITORY_POLICY_RECEIPT_MISMATCH")
  await receipt(f, { ...f.receipt, logSha256: "0".repeat(64) })
  await failure(f.directory, "AUR_BOOTSTRAP_SANDBOX_LOG_DIGEST_MISMATCH")
})

test("hosted mutation oracle uses exact causes and readmits every owned baseline", async () => {
  await using f = await fixture()
  await aurBootstrapEvidenceTeeth(f.directory)
  expect(await aurBootstrapEvidence(f.directory)).toEqual(f.receipt)
  const controls = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
    policyControls: Schema.Array(Schema.Struct({ name: Schema.String })),
    oracleControls: Schema.Array(Schema.Struct({ expectedControlError: Schema.String })), restored: Schema.String,
  }))))(await readFile(join(f.directory, "sandbox-receipt-controls.json"), "utf8"))
  expect(controls.policyControls.map((control) => control.name))
    .toEqual(["global-inherited", "DatabaseRequired", "DatabaseOptional"])
  expect(controls.oracleControls.map((control) => control.expectedControlError))
    .toEqual(["AUR_SANDBOX_RECEIPT_CONTROL_WRONG_ERROR", "AUR_SANDBOX_RECEIPT_CONTROL_WRONG_ERROR",
      "AUR_SANDBOX_RECEIPT_CONTROL_WRONG_ERROR", "AUR_SANDBOX_RECEIPT_CONTROL_WRONG_ERROR",
      "AUR_SANDBOX_RECEIPT_CONTROL_WRONG_SCHEMA_CAUSE", "AUR_SANDBOX_RECEIPT_CONTROL_WRONG_SCHEMA_CAUSE"])
  expect(controls.restored).toBe("real-baseline-readmitted-after-every-mutation")
})

const digest = (bytes: string) => createHash("sha256").update(bytes).digest("hex")

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "aur-sandbox-reader-unit-"))
  const receipt = { sandbox: "enforced", pacmanExit: 0, sandboxUser: "alpm", downloadUserDirective: "DownloadUser", downloadUserUID: 997,
    globalSigLevel: optional,
    // Deliberately different key order from Schema.Struct and the policy reader.
    repositories: [
      { sigLevelSource: "global-inherited", queriedSigLevel: [], sigLevel: optional, name: "core" },
      { queriedSigLevel: required, sigLevelSource: "pacman-conf-resolved-override", name: "extra", sigLevel: required },
    ],
    filesystemRestrictions: [restriction], logSha256: digest(baselineLog),
    probe: { mode: "enforce", seccomp: 2, noNewPrivileges: 1, abi: 7, abiErrno: 0, unshareResult: -1, unshareErrno: 1,
      initialRestrictResult: 0, initialRestrictErrno: 0, finalNoNewPrivileges: 1, outsideBefore: "read-write-allowed",
      insideAfter: "read-write-allowed", outsideReadErrno: 13, outsideWriteErrno: 13, enforced: true },
  } as const
  const files = { "bootstrap-sandbox.json": JSON.stringify(receipt), "bootstrap-pacman.log": baselineLog,
    "bootstrap-sandbox-user.txt": "alpm\n", "bootstrap-download-user.stderr": "", "bootstrap-download-user-uid.txt": "997\n",
    "bootstrap-repositories.txt": "core\nextra\n", "bootstrap-global-siglevel.txt": `${optional.join("\n")}\n`,
    "bootstrap-siglevel-core.txt": "", "bootstrap-siglevel-extra.txt": `${required.join("\n")}\n`,
    ...Object.fromEntries(["bootstrap-repositories", "bootstrap-global-siglevel", "bootstrap-siglevel-core", "bootstrap-siglevel-extra"]
      .flatMap((name) => [[`${name}.status`, "0\n"] as const, [`${name}.stderr`, ""] as const])),
  }
  await Promise.all(Object.entries(files).map(([name, bytes]) => Bun.write(join(directory, name), bytes)))
  return { directory, receipt, files, [Symbol.asyncDispose]: () => rm(directory, { recursive: true, force: true }) }
}

function receipt(f: Awaited<ReturnType<typeof fixture>>, value: unknown) {
  return Bun.write(join(f.directory, "bootstrap-sandbox.json"), JSON.stringify(value))
}

async function failure(directory: string, code: string, cause?: string) {
  const error = await aurBootstrapEvidence(directory).then(() => undefined, (error: unknown) => error)
  expect(error).toBeInstanceOf(Error)
  if (!(error instanceof Error)) throw new Error("UNIT_READER_REJECTION_REQUIRED")
  expect(error.message).toBe(code)
  if (cause) {
    expect(error.cause).toBeInstanceOf(Error)
    if (!(error.cause instanceof Error)) throw new Error("UNIT_READER_NESTED_CAUSE_REQUIRED")
    expect(error.cause.message).toBe(cause)
  }
  return error
}
