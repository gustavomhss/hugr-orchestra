import { createHash } from "node:crypto"
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises"
import { isDeepStrictEqual } from "node:util"
import { Option, Schema, SchemaIssue } from "effect"
import { prepareBootstrapConfig, verifyBootstrapConfig } from "./bootstrap-config"

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
  downloadUserDirective: Schema.Literal("DownloadUser"), downloadUserUID: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  globalSigLevel: Schema.Array(Schema.String),
  repositories: Schema.Array(Schema.Struct({ name: Schema.String, sigLevel: Schema.Array(Schema.String),
    queriedSigLevel: Schema.Array(Schema.String), sigLevelSource: Schema.Literals(["global-inherited", "pacman-conf-resolved-override"]),
  })),
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
  if (receipt.sandboxUser !== policy.sandboxUser || receipt.downloadUserUID !== policy.downloadUserUID ||
      !isDeepStrictEqual(receipt.globalSigLevel, policy.globalSigLevel) ||
       !isDeepStrictEqual(receipt.repositories, policy.repositories))
    throw new Error("AUR_BOOTSTRAP_REPOSITORY_POLICY_RECEIPT_MISMATCH")
  if (JSON.stringify(receipt.filesystemRestrictions) !== JSON.stringify(pacmanFilesystemRestrictions(log)))
    throw new Error("AUR_PACMAN_FILESYSTEM_RESTRICTION_RECEIPT_MISMATCH")
  return receipt
}

function pacmanFilesystemRestrictions(log: string) {
  const restrictions = log.split("\n").filter((line) =>
    /^debug: filesystem access has been restricted to .+, [Ll]andlock ABI is [1-9][0-9]*$/.test(line))
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
    "bootstrap-download-user.stderr", "bootstrap-download-user-uid.txt",
    "bootstrap-repositories.stderr", "bootstrap-repositories.status",
    ...["bootstrap-global-siglevel", ...receipt.repositories.map((repo) => `bootstrap-siglevel-${repo.name}`)]
      .flatMap((name) => ["txt", "stderr", "status"].map((extension) => `${name}.${extension}`))]
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
    { name: "unsupported-download-user-directive", receipt: { ...receipt, downloadUserDirective: "SandboxUser" },
      expected: { code: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE", schema: { path: ["downloadUserDirective"], value: "SandboxUser" } } },
    { name: "download-user-receipt-root-uid", receipt: { ...receipt, downloadUserUID: 0 },
      expected: { code: "AUR_BOOTSTRAP_SANDBOX_RECEIPT_INVALID_OR_UNAVAILABLE", schema: { path: ["downloadUserUID"], value: 0 } } },
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
    const userMutations = [
      { name: "download-user-empty", file: "bootstrap-sandbox-user.txt", bytes: "\n",
        expected: { code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", causeCode: "AUR_PACMAN_ALPM_DOWNLOAD_USER_REQUIRED" } },
      { name: "unknown-directive-warning-as-user", file: "bootstrap-sandbox-user.txt", bytes: "warning: unknown directive 'SandboxUser'\n",
        expected: { code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", causeCode: "AUR_PACMAN_ALPM_DOWNLOAD_USER_REQUIRED" } },
      { name: "unknown-directive-query-diagnostic", file: "bootstrap-download-user.stderr", bytes: "warning: unknown directive 'SandboxUser'\n",
        expected: { code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", causeCode: "AUR_PACMAN_DOWNLOAD_USER_QUERY_DIAGNOSTIC" } },
      { name: "download-user-root", file: "bootstrap-sandbox-user.txt", bytes: "root\n",
        expected: { code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", causeCode: "AUR_PACMAN_ALPM_DOWNLOAD_USER_REQUIRED" } },
      { name: "download-user-root-uid", file: "bootstrap-download-user-uid.txt", bytes: "0\n",
        expected: { code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", causeCode: "AUR_PACMAN_NONROOT_DOWNLOAD_USER_REQUIRED" } },
    ]
    for (const mutation of userMutations) {
      await Bun.write(`${control}/${mutation.file}`, mutation.bytes)
      await reject(mutation.name, mutation.expected)
    }
    const policyControls: { name: string; effective: readonly string[]; source: string; restored: string }[] = []
    // Positive controls use the actual captured global policy, including both
    // supported database modes. Only complete resolved tool projections pass.
    for (const kind of ["global-inherited", "DatabaseRequired", "DatabaseOptional"] as const) {
      const sigLevel = kind === "global-inherited" ? receipt.globalSigLevel
        : receipt.globalSigLevel.map((token) => token === "DatabaseRequired" || token === "DatabaseOptional" ? kind : token)
      const queriedSigLevel = kind === "global-inherited" ? [] : sigLevel
      const sigLevelSource = kind === "global-inherited" ? "global-inherited" : "pacman-conf-resolved-override"
      await Bun.write(`${control}/${signatures}`, queriedSigLevel.length ? `${queriedSigLevel.join("\n")}\n` : "")
      const repositories = receipt.repositories.map((repo, index) => index === 0 ? { ...repo, sigLevel, queriedSigLevel, sigLevelSource } : repo)
      await Bun.write(`${control}/bootstrap-sandbox.json`, JSON.stringify({ ...receipt, repositories }))
      const admitted = await aurBootstrapEvidence(control)
      if (!isDeepStrictEqual(admitted.repositories, repositories)) throw new Error(`AUR_SIGLEVEL_POSITIVE_CONTROL_FAILED: ${kind}`)
      await restore()
      policyControls.push({ name: kind, effective: sigLevel, source: sigLevelSource, restored: "real-baseline-readmitted" })
    }
    const signatureMutations = [
      { name: "empty-global-cannot-supply-inheritance", file: "bootstrap-global-siglevel.txt", bytes: "", inherit: true,
        causeCode: "AUR_GLOBAL_SIGLEVEL_REQUIRED" },
      { name: "unknown-global-policy", file: "bootstrap-global-siglevel.txt", bytes: "UnknownPolicy\n", inherit: true,
        causeCode: "AUR_GLOBAL_SIGLEVEL_UNSAFE_OR_UNSUPPORTED" },
      { name: "unsafe-inherited-package-policy", file: "bootstrap-global-siglevel.txt", inherit: true,
        bytes: `${receipt.globalSigLevel.map((token) => token === "PackageRequired" ? "PackageOptional" : token).join("\n")}\n`,
        causeCode: "AUR_GLOBAL_SIGLEVEL_UNSAFE_OR_UNSUPPORTED" },
      { name: "untrusted-inherited-package-policy", file: "bootstrap-global-siglevel.txt", inherit: true,
        bytes: `${receipt.globalSigLevel.map((token) => token === "PackageTrustedOnly" ? "PackageTrustAll" : token).join("\n")}\n`,
        causeCode: "AUR_GLOBAL_SIGLEVEL_UNSAFE_OR_UNSUPPORTED" },
      { name: "unsafe-explicit-package-override", file: signatures,
        bytes: `${receipt.globalSigLevel.map((token) => token === "PackageRequired" ? "PackageOptional" : token).join("\n")}\n`,
        causeCode: "AUR_SIGNED_REPOSITORIES_REQUIRED" },
      { name: "untrusted-explicit-database-override", file: signatures,
        bytes: `${receipt.globalSigLevel.map((token) => token === "DatabaseTrustedOnly" ? "DatabaseTrustAll" : token).join("\n")}\n`,
        causeCode: "AUR_SIGNED_REPOSITORIES_REQUIRED" },
      { name: "unresolved-partial-override", file: signatures, bytes: "DatabaseOptional\n",
        causeCode: "AUR_SIGNED_REPOSITORIES_REQUIRED" },
      { name: "unknown-explicit-override", file: signatures, bytes: "UnknownPolicy\n",
        causeCode: "AUR_SIGNED_REPOSITORIES_REQUIRED" },
      { name: "whitespace-is-not-unset-marker", file: signatures, bytes: "\n",
        causeCode: "AUR_SIGNED_REPOSITORIES_REQUIRED" },
      { name: "global-query-warning", file: "bootstrap-global-siglevel.stderr", bytes: "warning: unknown directive 'SigLevel'\n",
        causeCode: "AUR_PACMAN_POLICY_QUERY_DIAGNOSTIC" },
      { name: "global-query-failed", file: "bootstrap-global-siglevel.status", bytes: "1\n",
        causeCode: "AUR_PACMAN_POLICY_QUERY_FAILED" },
      { name: "repository-query-warning", file: signatures.replace(/\.txt$/, ".stderr"), bytes: "warning: unknown directive 'SigLevel'\n",
        causeCode: "AUR_PACMAN_POLICY_QUERY_DIAGNOSTIC" },
      { name: "repository-query-failed", file: signatures.replace(/\.txt$/, ".status"), bytes: "1\n",
        causeCode: "AUR_PACMAN_POLICY_QUERY_FAILED" },
    ]
    for (const mutation of signatureMutations) {
      if ("inherit" in mutation && mutation.inherit) await Bun.write(`${control}/${signatures}`, "")
      await Bun.write(`${control}/${mutation.file}`, mutation.bytes)
      await reject(mutation.name, { code: "AUR_BOOTSTRAP_REPOSITORY_POLICY_UNAVAILABLE_OR_INVALID", causeCode: mutation.causeCode })
    }
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
    await Bun.write(`${directory}/sandbox-receipt-controls.json`, JSON.stringify({ rejected, policyControls, oracleControls,
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
  if ((await readFile(`${directory}/bootstrap-download-user.stderr`, "utf8")).length !== 0)
    throw new Error("AUR_PACMAN_DOWNLOAD_USER_QUERY_DIAGNOSTIC")
  // sandboxUser keeps its semantic meaning: the effective pacman DownloadUser.
  const sandboxUser = (await readFile(`${directory}/bootstrap-sandbox-user.txt`, "utf8")).trim()
  if (sandboxUser !== "alpm") throw new Error("AUR_PACMAN_ALPM_DOWNLOAD_USER_REQUIRED")
  const uid = (await readFile(`${directory}/bootstrap-download-user-uid.txt`, "utf8")).trim()
  if (!/^[1-9][0-9]*$/.test(uid) || !Number.isSafeInteger(Number(uid)))
    throw new Error("AUR_PACMAN_NONROOT_DOWNLOAD_USER_REQUIRED")
  const names = (await pacmanPolicyQuery(directory, "bootstrap-repositories")).trim().split("\n")
  if (!sandboxUser || names.length === 0 || names.some((name) => !/^[a-zA-Z0-9_-]+$/.test(name)) || new Set(names).size !== names.length)
    throw new Error("AUR_SIGNED_REPOSITORY_POLICY_EMPTY_OR_INVALID")
  const global = await pacmanPolicyQuery(directory, "bootstrap-global-siglevel")
  if (!global.trim()) throw new Error("AUR_GLOBAL_SIGLEVEL_REQUIRED")
  const globalSigLevel = trustedSigLevel(global, "AUR_GLOBAL_SIGLEVEL_UNSAFE_OR_UNSUPPORTED")
  const repositories = await Promise.all(names.map(async (name) => {
    const queried = await pacmanPolicyQuery(directory, `bootstrap-siglevel-${name}`)
    // pacman-conf.c show_siglevel() emits zero bytes only for ALPM_SIG_USE_DEFAULT.
    // conf.c setdefaults() already resolves explicit overrides with its own mask.
    // Reviewed source: devkitPro/pacman cf473bcfbd275044250fa6ce3703dd7059a52273.
    // No replica of pacman's partial-override merge is performed here.
    if (queried === "") return { name, queriedSigLevel: [], sigLevel: globalSigLevel, sigLevelSource: "global-inherited" as const }
    const sigLevel = trustedSigLevel(queried, "AUR_SIGNED_REPOSITORIES_REQUIRED")
    return { name, queriedSigLevel: sigLevel, sigLevel, sigLevelSource: "pacman-conf-resolved-override" as const }
  }))
  return { sandboxUser, downloadUserDirective: "DownloadUser" as const, downloadUserUID: Number(uid), globalSigLevel, repositories }
}

async function pacmanPolicyQuery(directory: string, name: string) {
  if (await readFile(`${directory}/${name}.status`, "utf8") !== "0\n") throw new Error("AUR_PACMAN_POLICY_QUERY_FAILED")
  if ((await readFile(`${directory}/${name}.stderr`, "utf8")).length !== 0) throw new Error("AUR_PACMAN_POLICY_QUERY_DIAGNOSTIC")
  return readFile(`${directory}/${name}.txt`, "utf8")
}

function trustedSigLevel(output: string, code: string) {
  const tokens = output.trim().split(/\s+/)
  if (tokens.length !== 4 || new Set(tokens).size !== 4 || !tokens.includes("PackageRequired") ||
      !tokens.includes("PackageTrustedOnly") || !tokens.includes("DatabaseTrustedOnly") ||
      !(tokens.includes("DatabaseRequired") || tokens.includes("DatabaseOptional"))) throw new Error(code)
  return tokens
}

// Run only inside the owned hosted guest, after the actual signed -Syu command.
// Runtime pacman --debug evidence, never source/argument sniffing as enforcement.
if (import.meta.main) await recordBootstrapEvidence()

async function recordBootstrapEvidence() {
  const directory = "/proof/evidence"
  if (process.argv[2] === "config") {
    await prepareBootstrapConfig(directory)
    return
  }
  if (process.argv[2] === "config-verify") {
    await verifyBootstrapConfig(directory)
    return
  }
  await verifyBootstrapConfig(directory)
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
