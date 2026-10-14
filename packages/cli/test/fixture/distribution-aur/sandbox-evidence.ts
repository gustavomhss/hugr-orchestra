import { createHash } from "node:crypto"
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises"
import { Schema } from "effect"

export const AurSandboxEvidence = Schema.Struct({
  mode: Schema.Literal("enforce"), seccomp: Schema.Literal(2), noNewPrivileges: Schema.Literal(1),
  abi: Schema.Number.check(Schema.isGreaterThanOrEqualTo(1)), abiErrno: Schema.Literal(0),
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
  const control = await mkdtemp(`${directory}/sandbox-receipt-controls-`)
  const files = ["bootstrap-sandbox.json", "bootstrap-pacman.log", "bootstrap-repositories.txt", "bootstrap-sandbox-user.txt",
    ...receipt.repositories.map((repo) => `bootstrap-siglevel-${repo.name}.txt`)]
  const mutations = [
    { name: "seccomp-disabled", receipt: { ...receipt, probe: { ...receipt.probe, seccomp: 0 } } },
    { name: "no-new-privileges-disabled", receipt: { ...receipt, probe: { ...receipt.probe, noNewPrivileges: 0 } } },
    { name: "forbidden-syscall-allowed", receipt: { ...receipt, probe: { ...receipt.probe, unshareResult: 0 } } },
    { name: "landlock-unavailable", receipt: { ...receipt, probe: { ...receipt.probe, abi: 0 } } },
    { name: "outside-read-allowed", receipt: { ...receipt, probe: { ...receipt.probe, outsideReadErrno: 0 } } },
    { name: "outside-write-allowed", receipt: { ...receipt, probe: { ...receipt.probe, outsideWriteErrno: 0 } } },
    { name: "sandbox-not-enforced", receipt: { ...receipt, sandbox: "disabled" } },
    { name: "repositories-empty", receipt: { ...receipt, repositories: [] } },
    { name: "pacman-enforcement-empty", receipt: { ...receipt, filesystemRestrictions: [] } },
    { name: "pacman-log-digest-wrong", receipt: { ...receipt, logSha256: "0".repeat(64) } },
  ]
  const rejected: { name: string; error: string }[] = []
  const reject = async (name: string) => {
    const error = await aurBootstrapEvidence(control).then(() => undefined, (cause: unknown) => String(cause))
    if (!error?.includes("AUR_")) throw new Error(`AUR_SANDBOX_RECEIPT_MUTATION_ACCEPTED_OR_UNNAMED: ${name}`)
    rejected.push({ name, error })
  }
  try {
    await Promise.all(files.map((file) => copyFile(`${directory}/${file}`, `${control}/${file}`)))
    await aurBootstrapEvidence(control)
    for (const mutation of mutations) {
      await Bun.write(`${control}/bootstrap-sandbox.json`, JSON.stringify(mutation.receipt))
      await reject(mutation.name)
    }
    await rm(`${control}/bootstrap-sandbox.json`)
    await reject("mandatory-receipt-missing")
    await copyFile(`${directory}/bootstrap-sandbox.json`, `${control}/bootstrap-sandbox.json`)
    const signatures = `bootstrap-siglevel-${receipt.repositories[0].name}.txt`
    await Bun.write(`${control}/${signatures}`, "PackageNever\nPackageTrustAll\nDatabaseOptional\nDatabaseTrustedOnly\n")
    await reject("unsigned-repository-policy")
    await copyFile(`${directory}/${signatures}`, `${control}/${signatures}`)
    await aurBootstrapEvidence(control)
    await Bun.write(`${directory}/sandbox-receipt-controls.json`, JSON.stringify({ rejected, restored: "accepted" }, null, 2))
  } finally { await rm(control, { recursive: true, force: true }) }
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
