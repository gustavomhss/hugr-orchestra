import { createHash } from "node:crypto"
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises"
import { isDeepStrictEqual } from "node:util"
import { Option, Schema, SchemaIssue } from "effect"

export const AurSandboxEvidence = Schema.Struct({
  mode: Schema.Literal("enforce"), seccomp: Schema.Literal(2), noNewPrivileges: Schema.Literal(1),
  abi: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)), abiErrno: Schema.Literal(0),
  unshareResult: Schema.Literal(-1), unshareErrno: Schema.Literal(1),
  initialRestrictResult: Schema.Literal(0), initialRestrictErrno: Schema.Literal(0),
  finalNoNewPrivileges: Schema.Literal(1), outsideBefore: Schema.Literal("read-write-allowed"),
  insideAfter: Schema.Literal("read-write-allowed"), outsideReadErrno: Schema.Literal(13),
  outsideWriteErrno: Schema.Literal(13), enforced: Schema.Literal(true),
})

export const AurBootstrapEvidence = Schema.Struct({
  sandbox: Schema.Literal("enforced"), pacmanExit: Schema.Literal(0), sandboxUser: Schema.String,
  repositories: Schema.Array(Schema.Struct({ name: Schema.String, sigLevel: Schema.Array(Schema.String) })),
  filesystemRestrictions: Schema.Array(Schema.String), logSha256: Schema.String,
  probe: AurSandboxEvidence,
})

export async function aurBootstrapEvidence(directory: string) {
  const receipt = await readFile(`${directory}/bootstrap-sandbox.json`, "utf8").catch((cause: unknown) => {
    throw new Error("AUR_BOOTSTRAP_SANDBOX_RECEIPT_UNAVAILABLE", { cause })
  }).then((text) => Schema.decodeUnknownPromise(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(AurBootstrapEvidence)))(text))
    .catch((cause: unknown) => { throw new Error("AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE", { cause }) })
  if (!receipt.sandboxUser || receipt.repositories.length === 0 || receipt.filesystemRestrictions.length === 0)
    throw new Error("AUR_BOOTSTRAP_SANDBOX_EVIDENCE_EMPTY")
  const log = await readFile(`${directory}/bootstrap-pacman.log`, "utf8").catch((cause: unknown) => {
    throw new Error("AUR_BOOTSTRAP_SANDBOX_LOG_UNAVAILABLE", { cause })
  })
  if (createHash("sha256").update(log).digest("hex") !== receipt.logSha256)
    throw new Error("AUR_BOOTSTRAP_SANDBOX_LOG_DIGEST_MISMATCH")
  const policy = await aurRepositoryPolicy(directory).catch((cause: unknown) => {
    throw new Error("AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", { cause })
  })
  if (receipt.sandboxUser !== policy.sandboxUser || JSON.stringify(receipt.repositories) !== JSON.stringify(policy.repositories))
    throw new Error("AUR_BOOTSTRAP_REPOSITORY_POLICY_RECEIPT_MISMATCH")
  if (JSON.stringify(receipt.filesystemRestrictions) !== JSON.stringify(pacmanFilesystemRestrictions(log)))
    throw new Error("AUR_PACMAN_FILESYSTEM_RESTRICTION_RECEIPT_MISMATCH")
  return receipt
}

function pacmanFilesystemRestrictions(log: string) {
  const restrictions = log.split("\n").filter((line) =>
    /filesystem access has been restricted to .+, [Ll]andlock ABI is [1-9][0-9]*/.test(line))
  if (restrictions.length === 0 || /error:|landlock is not supported|Landlock is not supported/.test(log))
    throw new Error("AUR_PACMAN_DOWNLOAD_LANDLOCK_NOT_ENFORCED")
  return restrictions
}

// Hosted RED/GREEN: mutate copies of the real receipts through the same reader
// used by both callers, then restore. No fabricated replacement package manager.
export async function aurBootstrapEvidenceTeeth(directory: string) {
  const receipt = await aurBootstrapEvidence(directory)
  const log = await readFile(`${directory}/bootstrap-pacman.log`, "utf8")
  const nonenforcement = log.split("\n").find((line) => line.trim() && !receipt.filesystemRestrictions.includes(line))
  if (!nonenforcement) throw new Error("AUR_PACMAN_LOG_CONTROL_NONENFORCEMENT_TEXT_UNAVAILABLE")
  const control = await mkdtemp(`${directory}/sandbox-receipt-controls-`)
  const files = ["bootstrap-sandbox.json", "bootstrap-pacman.log", "bootstrap-repositories.txt", "bootstrap-sandbox-user.txt",
    ...receipt.repositories.map((repo) => `bootstrap-siglevel-${repo.name}.txt`)]
  const mutations = [
    { name: "seccomp-disabled", receipt: { ...receipt, probe: { ...receipt.probe, seccomp: 0 } },
      expected: { code: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE", schema: { path: ["probe", "seccomp"], value: 0 } } },
    { name: "no-new-privileges-disabled", receipt: { ...receipt, probe: { ...receipt.probe, noNewPrivileges: 0 } },
      expected: { code: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE", schema: { path: ["probe", "noNewPrivileges"], value: 0 } } },
    { name: "forbidden-syscall-allowed", receipt: { ...receipt, probe: { ...receipt.probe, unshareResult: 0 } },
      expected: { code: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE", schema: { path: ["probe", "unshareResult"], value: 0 } } },
    { name: "landlock-unavailable", receipt: { ...receipt, probe: { ...receipt.probe, abi: 0 } },
      expected: { code: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE", schema: { path: ["probe", "abi"], value: 0 } } },
    { name: "landlock-abi-fractional", receipt: { ...receipt, probe: { ...receipt.probe, abi: 1.5 } },
      expected: { code: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE", schema: { path: ["probe", "abi"], value: 1.5 } } },
    { name: "outside-read-allowed", receipt: { ...receipt, probe: { ...receipt.probe, outsideReadErrno: 0 } },
      expected: { code: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE", schema: { path: ["probe", "outsideReadErrno"], value: 0 } } },
    { name: "outside-write-allowed", receipt: { ...receipt, probe: { ...receipt.probe, outsideWriteErrno: 0 } },
      expected: { code: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE", schema: { path: ["probe", "outsideWriteErrno"], value: 0 } } },
    { name: "sandbox-not-enforced", receipt: { ...receipt, sandbox: "disabled" },
      expected: { code: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE", schema: { path: ["sandbox"], value: "disabled" } } },
    { name: "repositories-empty", receipt: { ...receipt, repositories: [] },
      expected: { code: "AUR_BOOTSTRAP_SANDBOX_EVIDENCE_EMPTY" } },
    { name: "pacman-enforcement-empty", receipt: { ...receipt, filesystemRestrictions: [] },
      expected: { code: "AUR_BOOTSTRAP_SANDBOX_EVIDENCE_EMPTY" } },
    { name: "pacman-log-digest-wrong", receipt: { ...receipt, logSha256: "0".repeat(64) },
      expected: { code: "AUR_BOOTSTRAP_SANDBOX_LOG_DIGEST_MISMATCH" } },
  ]
  const rejected: { name: string; expected: SandboxExpectedFailure; observed: ReturnType<typeof requireSandboxRejection>; restored: string }[] = []
  const restore = async () => {
    await Promise.all(files.map((file) => copyFile(`${directory}/${file}`, `${control}/${file}`)))
    if (!isDeepStrictEqual(await aurBootstrapEvidence(control), receipt))
      throw new Error("AUR_SANDBOX_RECEIPT_CONTROL_BASELINE_CHANGED")
  }
  const reject = async (name: string, expected: SandboxExpectedFailure) => {
    const observed = requireSandboxRejection(await aurBootstrapEvidence(control).then(() => undefined, (cause: unknown) => cause), expected)
    await restore()
    rejected.push({ name, expected, observed, restored: "real-baseline-readmitted" })
  }
  try {
    await restore()
    for (const mutation of mutations) {
      await Bun.write(`${control}/bootstrap-sandbox.json`, JSON.stringify(mutation.receipt))
      await reject(mutation.name, mutation.expected)
    }
    await rm(`${control}/bootstrap-sandbox.json`)
    await reject("mandatory-receipt-missing", { code: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE",
      causeCode: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_UNAVAILABLE" })
    const signatures = `bootstrap-siglevel-${receipt.repositories[0].name}.txt`
    await Bun.write(`${control}/${signatures}`, "PackageNever\nPackageTrustAll\nDatabaseOptional\nDatabaseTrustedOnly\n")
    await reject("unsigned-repository-policy", { code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID",
      causeCode: "AUR_SIGNED_REPOSITORIES_REQUIRED" })
    const logMutations = [
      { name: "pacman-enforcement-records-removed",
        log: log.split("\n").filter((line) => !receipt.filesystemRestrictions.includes(line)).join("\n"),
        lines: [nonenforcement], expected: { code: "AUR_PACMAN_DOWNLOAD_LANDLOCK_NOT_ENFORCED" } },
      { name: "pacman-enforcement-replaced-by-real-nonenforcement-text",
        log: log.split("\n").map((line) => receipt.filesystemRestrictions.includes(line) ? nonenforcement : line).join("\n"),
        lines: [nonenforcement], expected: { code: "AUR_PACMAN_DOWNLOAD_LANDLOCK_NOT_ENFORCED" } },
      // Exact diagnostic measured in hosted ARM run 38501502021, alongside the
      // real successful log here. A success record cannot mask this failure.
      { name: "pacman-success-plus-actual-landlock-failure",
        log: `${log}\nerror: restricting filesystem access failed because the Landlock ruleset could not be applied: Operation not permitted\n`,
        lines: receipt.filesystemRestrictions, expected: { code: "AUR_PACMAN_DOWNLOAD_LANDLOCK_NOT_ENFORCED" } },
    ]
    for (const mutation of logMutations) {
      if (!mutation.lines.length || mutation.lines.some((line) => !mutation.log.split("\n").includes(line)))
        throw new Error("AUR_PACMAN_LOG_CONTROL_RECEIPT_LINES_INVALID")
      await Bun.write(`${control}/bootstrap-pacman.log`, mutation.log)
      await Bun.write(`${control}/bootstrap-sandbox.json`, JSON.stringify({ ...receipt,
        logSha256: createHash("sha256").update(mutation.log).digest("hex"), filesystemRestrictions: mutation.lines,
      }))
      await reject(mutation.name, mutation.expected)
    }
    // Calibrate the rejection oracle itself with real unrelated reader failures.
    // Each must fail the seccomp mutation control, rather than count as its RED.
    const unrelated = [
      { name: "unrelated-log-missing", expected: { code: "AUR_BOOTSTRAP_SANDBOX_LOG_UNAVAILABLE" },
        expectedControlError: "AUR_SANDBOX_RECEIPT_CONTROL_WRONG_ERROR",
        mutate: () => rm(`${control}/bootstrap-pacman.log`) },
      { name: "unrelated-signature-missing", expected: { code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID",
        causeSystemCode: "ENOENT" }, expectedControlError: "AUR_SANDBOX_RECEIPT_CONTROL_WRONG_ERROR",
        mutate: () => rm(`${control}/${signatures}`) },
      { name: "unrelated-signature-policy", expected: { code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID",
        causeCode: "AUR_SIGNED_REPOSITORIES_REQUIRED" },
        expectedControlError: "AUR_SANDBOX_RECEIPT_CONTROL_WRONG_ERROR",
        mutate: () => Bun.write(`${control}/${signatures}`, "PackageNever\nPackageTrustAll\nDatabaseOptional\nDatabaseTrustedOnly\n") },
      { name: "unrelated-log-digest", expected: { code: "AUR_BOOTSTRAP_SANDBOX_LOG_DIGEST_MISMATCH" },
        expectedControlError: "AUR_SANDBOX_RECEIPT_CONTROL_WRONG_ERROR",
        mutate: () => Bun.write(`${control}/bootstrap-sandbox.json`, JSON.stringify({ ...receipt, logSha256: "0".repeat(64) })) },
      { name: "unrelated-schema-field", expected: mutations[1].expected,
        expectedControlError: "AUR_SANDBOX_RECEIPT_CONTROL_WRONG_SCHEMA_CAUSE",
        mutate: () => Bun.write(`${control}/bootstrap-sandbox.json`, JSON.stringify(mutations[1].receipt)) },
      { name: "unrelated-schema-value", expected: { code: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE",
        schema: { path: ["probe", "seccomp"], value: 3 } }, expectedControlError: "AUR_SANDBOX_RECEIPT_CONTROL_WRONG_SCHEMA_CAUSE",
        mutate: () => Bun.write(`${control}/bootstrap-sandbox.json`, JSON.stringify({ ...receipt, probe: { ...receipt.probe, seccomp: 3 } })) },
    ]
    const oracleControls: { name: string; readerError: SandboxExpectedFailure; observed: ReturnType<typeof requireSandboxRejection>;
      expectedControlError: string; restored: string }[] = []
    for (const mutation of unrelated) {
      await mutation.mutate()
      const error = await aurBootstrapEvidence(control).then(() => undefined, (cause: unknown) => cause)
      const observed = requireSandboxRejection(error, mutation.expected)
      const controlError = await Promise.resolve().then(() => requireSandboxRejection(error, mutations[0].expected))
        .then(() => undefined, (cause: unknown) => cause)
      if (!(controlError instanceof Error) || controlError.message !== mutation.expectedControlError || controlError.cause !== error)
        throw new Error(`AUR_SANDBOX_RECEIPT_CONTROL_ACCEPTED_UNRELATED_FAILURE: ${mutation.name}`)
      await restore()
      oracleControls.push({ name: mutation.name, readerError: mutation.expected, observed,
        expectedControlError: controlError.message, restored: "real-baseline-readmitted" })
    }
    await Bun.write(`${directory}/sandbox-receipt-controls.json`, JSON.stringify({ rejected, oracleControls,
      restored: "real-baseline-readmitted-after-every-mutation" }, null, 2))
  } finally { await rm(control, { recursive: true, force: true }) }
}

type SandboxExpectedFailure = { code: string; causeCode?: string; causeSystemCode?: string;
  schema?: { path: readonly PropertyKey[]; value: unknown } }

function requireSandboxRejection(error: unknown, expected: SandboxExpectedFailure) {
  if (!(error instanceof Error)) throw new Error("AUR_SANDBOX_RECEIPT_CONTROL_ACCEPTED_OR_UNSTRUCTURED", { cause: error })
  if (error.message !== expected.code) throw new Error("AUR_SANDBOX_RECEIPT_CONTROL_WRONG_ERROR", { cause: error })
  if (expected.causeCode && (!(error.cause instanceof Error) || error.cause.message !== expected.causeCode))
    throw new Error("AUR_SANDBOX_RECEIPT_CONTROL_WRONG_NESTED_CAUSE", { cause: error })
  if (expected.causeSystemCode && (!(error.cause instanceof Error) || !("code" in error.cause) || error.cause.code !== expected.causeSystemCode))
    throw new Error("AUR_SANDBOX_RECEIPT_CONTROL_WRONG_SYSTEM_CAUSE", { cause: error })
  if (!expected.schema) return { code: error.message, causeCode: error.cause instanceof Error ? error.cause.message : undefined,
    causeSystemCode: error.cause instanceof Error && "code" in error.cause ? error.cause.code : undefined }
  if (!Schema.isSchemaError(error.cause)) throw new Error("AUR_SANDBOX_RECEIPT_CONTROL_SCHEMA_ERROR_REQUIRED", { cause: error })
  const failures = sandboxSchemaFailures(error.cause.issue)
  if (failures.length !== 1 || failures[0].path.length !== expected.schema.path.length ||
      !failures[0].path.every((key, index) => Object.is(key, expected.schema?.path[index])) ||
      !Object.is(failures[0].value, expected.schema.value))
    throw new Error("AUR_SANDBOX_RECEIPT_CONTROL_WRONG_SCHEMA_CAUSE", { cause: error })
  return { code: error.message, schema: failures[0] }
}

function sandboxSchemaFailures(issue: SchemaIssue.Issue, path: readonly PropertyKey[] = []): { path: readonly PropertyKey[]; value: unknown }[] {
  if (issue._tag === "Pointer") return sandboxSchemaFailures(issue.issue, [...path, ...issue.path])
  if (issue._tag === "Encoding" || issue._tag === "Filter") return sandboxSchemaFailures(issue.issue, path)
  if (issue._tag === "Composite" || issue._tag === "AnyOf") return issue.issues.flatMap((child) => sandboxSchemaFailures(child, path))
  const actual = SchemaIssue.getActual(issue)
  return Option.isSome(actual) ? [{ path, value: actual.value }] : []
}

async function aurRepositoryPolicy(directory: string) {
  const sandboxUser = (await readFile(`${directory}/bootstrap-sandbox-user.txt`, "utf8")).trim()
  const names = (await readFile(`${directory}/bootstrap-repositories.txt`, "utf8")).trim().split("\n")
  if (!sandboxUser || names.length === 0 || names.some((name) => !/^[a-zA-Z0-9_-]+$/.test(name)) || new Set(names).size !== names.length)
    throw new Error("AUR_SIGNED_REPOSITORY_POLICY_EMPTY_OR_INVALID")
  const repositories = await Promise.all(names.map(async (name) => ({ name,
    sigLevel: (await readFile(`${directory}/bootstrap-siglevel-${name}.txt`, "utf8")).trim().split(/\s+/),
  })))
  if (repositories.some((repo) => repo.sigLevel.length !== 4 || new Set(repo.sigLevel).size !== 4 ||
      !repo.sigLevel.includes("PackageRequired") || !repo.sigLevel.includes("PackageTrustedOnly") ||
      !repo.sigLevel.includes("DatabaseTrustedOnly") ||
      !(repo.sigLevel.includes("DatabaseRequired") || repo.sigLevel.includes("DatabaseOptional"))))
    throw new Error("AUR_SIGNED_REPOSITORIES_REQUIRED")
  return { sandboxUser, repositories }
}

// Run only inside the owned hosted guest, after the actual signed -Syu command.
// Runtime pacman --debug evidence, never source/argument sniffing as enforcement.
if (import.meta.main) await recordBootstrapEvidence()

async function recordBootstrapEvidence() {
  const directory = "/proof/evidence"
  const policy = await aurRepositoryPolicy(directory)
  if (process.argv[2] === "policy") {
    await Bun.write(`${directory}/bootstrap-policy.json`, JSON.stringify(policy, null, 2))
    return
  }
  if (process.argv[2] !== "receipt") throw new Error("AUR_BOOTSTRAP_EVIDENCE_MODE_REQUIRED")
  const log = await readFile(`${directory}/bootstrap-pacman.log`, "utf8")
  await Bun.write(`${directory}/bootstrap-sandbox.json`, JSON.stringify({
    sandbox: "enforced", pacmanExit: 0,
    ...policy,
    filesystemRestrictions: pacmanFilesystemRestrictions(log), logSha256: createHash("sha256").update(log).digest("hex"),
    probe: Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(AurSandboxEvidence)))(
      await readFile(`${directory}/sandbox-enforced.json`, "utf8")),
  }, null, 2))
  await aurBootstrapEvidence(directory)
}
