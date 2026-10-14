import { afterAll, expect, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import type { Stats } from "node:fs"
import { chmod, copyFile, cp, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm } from "node:fs/promises"
import { machine } from "node:os"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { Schema } from "effect"
import { distributionDenoVersion } from "../../../script/distribution-deno"
import { expectSpawn } from "../../core/test/fixture/omni-expect"
import { buildVersions, cli, command, sandbox, successful, target, versions } from "./fixture/distribution-native"
import { aurProfileProvenance, aurSandboxProfile } from "./fixture/distribution-aur/sandbox-profile"
import { AurBootstrapEvidence, AurSandboxEvidence, aurBootstrapEvidence, aurBootstrapEvidenceTeeth } from "./fixture/distribution-aur/sandbox-evidence"

// Extension: real native AUR package-manager closure, both production target rows.
// Lead wires this exact test into ubuntu x64/ARM64 hosted bundle rows. No unavailable
// host skip, QEMU, provider claim, public AUR publication, or local qualification.
// Per-architecture manifests resolved from Docker Hub metadata on 2026-10-13.
const guests = {
  x64: {
    cpu: "x86_64", dockerArch: "amd64", distro: "Arch Linux", runner: "X64",
    image: "docker.io/library/archlinux@sha256:363129b67b2bc6c5a634f8fb4961a7e2eba213a2ec075d159127b1260290a722",
    provenance: "official archlinux:base; amd64 only",
    metadata: "https://hub.docker.com/v2/repositories/library/archlinux/tags/base",
  },
  arm64: {
    cpu: "aarch64", dockerArch: "arm64", distro: "Arch Linux ARM", runner: "ARM64",
    image: "docker.io/menci/archlinuxarm@sha256:e677d448765dbaefc52293ae7d43680a760ef0653d941fcb778d3456a0a7206a",
    provenance: "third-party Menci/docker-archlinuxarm; native ArchLinuxARM aarch64, not official archlinux",
    metadata: "https://hub.docker.com/v2/repositories/menci/archlinuxarm/tags/latest",
  },
}
const nonce = randomUUID()
const label = "orchestra.aur.proof"
const name = `orchestra-aur-${nonce}`
const state: {
  directory?: string; host?: Awaited<ReturnType<typeof sandbox>>; docker?: string;
  attempted: boolean; id?: string; preserve: boolean; artifact?: string;
  owner?: { uid: number; gid: number }; identity?: { dev: number; ino: number }; cleanup?: Promise<void>;
} = { attempted: false, preserve: false }
const interrupt = () => {
  void cleanup().then(() => process.exit(1), () => {
    state.preserve = true
    console.error(`AUR_INTERRUPTED_CLEANUP_FAILED: name=${name} fixture=${state.directory}`)
    process.exit(1)
  })
}

afterAll(async () => {
  if (!state.directory) return
  await cleanup().catch((cause: unknown) => {
    state.preserve = true
    throw new Error(`AUR_OWNED_CONTAINER_CLEANUP_FAILED: name=${name} fixture=${state.directory}`, { cause })
  })
  process.off("SIGINT", interrupt)
  process.off("SIGTERM", interrupt)
  process.off("SIGHUP", interrupt)
}, 180_000)

test("AUR-NATIVE matching Arch guest makepkg/pacman install/update/retained-package downgrade qualify native closure", async () => {
  expectSpawn(import.meta.path)
  if (process.platform !== "linux" || (process.arch !== "x64" && process.arch !== "arm64"))
    throw new Error("AUR_NATIVE_LINUX_X64_OR_ARM64_HOST_REQUIRED")
  const guest = guests[process.arch]
  if (process.env.RUNNER_OS !== "Linux" || process.env.RUNNER_ARCH !== guest.runner ||
       process.env.RUNNER_ENVIRONMENT !== "github-hosted" || ![guest.cpu, process.arch].includes(machine()))
    throw new Error(`AUR_MATCHING_UBUNTU_HOSTED_RUNNER_REQUIRED: ${JSON.stringify({ os: process.env.RUNNER_OS,
      runner: process.env.RUNNER_ARCH, environment: process.env.RUNNER_ENVIRONMENT, arch: process.arch, machine: machine() })}`)
  if (!/^ID=ubuntu$/m.test(await readFile("/etc/os-release", "utf8"))) throw new Error("AUR_UBUNTU_HOST_REQUIRED")
  if (process.versions.bun !== "1.3.14") throw new Error("AUR_HOST_BUN_VERSION_MISMATCH")
  if (!process.env.RUNNER_TEMP || !process.env.GITHUB_WORKSPACE) throw new Error("AUR_HOSTED_WORKSPACE_REQUIRED")
  const repo = await realpath(resolve(cli, "../.."))
  if (repo !== await realpath(process.env.GITHUB_WORKSPACE)) throw new Error("AUR_OWNED_CI_CHECKOUT_REQUIRED")
  const uid = process.getuid?.()
  const gid = process.getgid?.()
  if (uid === undefined || gid === undefined || !Number.isSafeInteger(uid) || !Number.isSafeInteger(gid) || uid < 0 || gid < 0)
    throw new Error("AUR_HOST_FIXTURE_OWNER_INVALID")
  state.owner = { uid, gid }
  state.directory = await mkdtemp(join(await realpath(process.env.RUNNER_TEMP), "orchestra-aur-native-"))
  const root = await lstat(state.directory)
  state.identity = { dev: root.dev, ino: root.ino }
  // Only the owned fixture needs builder traversal; never chmod host user state.
  await chmod(state.directory, 0o755)
  await mkdir(join(state.directory, "evidence"))
  await Bun.write(join(state.directory, ".aur-ownership"), `${nonce}\n`)
  state.artifact = join(repo, "distribution-logs", `aur-${target}-${nonce}`)
  state.host = await sandbox(join(state.directory, "host-tools"))
  expect(await successful(["uname", "-m"], state.host), "AUR_ACTUAL_HOST_KERNEL_CPU").toBe(guest.cpu)
  state.docker = Bun.which("docker") ?? undefined
  if (!state.docker) throw new Error("AUR_DOCKER_UNAVAILABLE")
  const daemon = await docker(["info", "--format", "{{.OSType}}|{{.Architecture}}"], 30_000)
  if (daemon !== `linux|${guest.cpu}` && daemon !== `linux|${guest.dockerArch}`)
    throw new Error(`AUR_NATIVE_DOCKER_DAEMON_ARCH_MISMATCH: ${daemon}`)
  const daemonVersion = await docker(["version", "--format", "{{.Server.Version}}"])
  if (daemonVersion !== aurProfileProvenance.daemonVersion)
    throw new Error(`AUR_PINNED_DOCKER_DEFAULT_VERSION_MISMATCH: required=${aurProfileProvenance.daemonVersion} actual=${daemonVersion}`)
  console.info(`AUR guest selection: ${JSON.stringify({ target, ...guest })}`)
  await docker(["pull", "--platform", `linux/${guest.dockerArch}`, guest.image], 300_000)
    .catch((cause: unknown) => { throw new Error(`AUR_PINNED_GUEST_IMAGE_UNAVAILABLE: ${guest.image}`, { cause }) })
  const image = await docker(["image", "inspect", guest.image])
  const inspected = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Array(Schema.Struct({
    Architecture: Schema.String, Os: Schema.String, Id: Schema.String, RepoDigests: Schema.Array(Schema.String),
  })))))(image)
  if (inspected.length !== 1 || inspected[0].Architecture !== guest.dockerArch || inspected[0].Os !== "linux" ||
      !/^sha256:[a-f0-9]{64}$/.test(inspected[0].Id) ||
      !inspected[0].RepoDigests.some((digest) => digest.endsWith(`@${guest.image.split("@")[1]}`)))
    throw new Error(`AUR_IMMUTABLE_GUEST_PROVENANCE_MISMATCH: ${image}`)
  const denoRuntime = await copyDenoRuntime(repo, state.directory, state.host).catch((cause: unknown) => {
    throw new Error("AUR_DENO_PROVENANCE_ADMISSION_FAILED", { cause })
  })
  await Bun.write(join(state.directory, "evidence/provenance.json"), JSON.stringify({
    denoRuntime,
    target, guest, inspectedImage: image, host: { cpu: machine(), arch: process.arch,
      runner: process.env.RUNNER_ARCH, environment: process.env.RUNNER_ENVIRONMENT,
      osRelease: await readFile("/etc/os-release", "utf8"), docker: daemon,
      version: await docker(["version", "--format", "{{.Client.Version}}|{{.Server.Version}}"]),
    },
  }, null, 2))
  // Measure the ABI and original default-filter/privilege failure before any
  // repository bootstrap or native payload build. Same native executable on
  // host and guest; no cross compilation, emulation, or bootstrap dependency.
  await successful(["gcc", "-std=c11", "-O2", "-Wall", "-Wextra", "-Werror",
    "-o", join(state.directory, "sandbox-probe"), join(cli, "test/fixture/distribution-aur/sandbox-probe.c")], state.host)
  const hostControl = await successful([join(state.directory, "sandbox-probe"), "host"], state.host)
  await Bun.write(join(state.directory, "evidence/sandbox-host-control.json"), hostControl)
  Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
    mode: Schema.Literal("host"), unshareResult: Schema.Literal(0), unshareErrno: Schema.Literal(0),
  }))))(hostControl)
  const profile = await aurSandboxProfile()
  const profilePath = join(state.directory, "seccomp.json")
  await Bun.write(profilePath, profile)
  await mkdir(join(state.directory, "sandbox-control/allowed"), { recursive: true })
  await mkdir(join(state.directory, "sandbox-control/outside"))
  await Bun.write(join(state.directory, "sandbox-control/allowed/file"), "inside\n")
  await Bun.write(join(state.directory, "sandbox-control/outside/file"), "outside\n")
  expect(await ownedContainers()).toEqual([])
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  process.once("SIGHUP", interrupt)
  for (const mode of ["diagnose", "enforce"] as const) {
    state.attempted = true // A timed-out create may still own the named container.
    const id = await docker(["create", "--name", name, "--label", `${label}=${nonce}`, "--init", "--network", "bridge",
      ...(mode === "enforce" ? ["--security-opt", `seccomp=${profilePath}`,
        "--security-opt", "no-new-privileges=true"] : []),
      "--platform", `linux/${guest.dockerArch}`, "--mount", `type=bind,source=${repo},target=/repo,readonly`,
      "--mount", `type=bind,source=${state.directory},target=/proof`, "--workdir", "/repo/packages/cli",
      guest.image, "/usr/bin/sleep", "infinity"])
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("AUR_OWNED_CONTAINER_ID_INVALID")
    state.id = id
    expect(await ownedContainers(), "AUR_CONTAINER_ENUMERATION_POSITIVE_CONTROL").toEqual([id])
    expect(await docker(["inspect", "--format",
      `{{.Id}}|{{.Config.Image}}|{{index .Config.Labels "${label}"}}|{{.HostConfig.Init}}`, id]))
      .toBe(`${id}|${guest.image}|${nonce}|true`)
    const inspectedContainer = await docker(["inspect", id])
    // Preserve Docker's actual normalized settings even when a guard fails.
    await Bun.write(join(state.directory, `evidence/sandbox-${mode}-container.json`), JSON.stringify({
      id, mode, profile: mode === "enforce" ? aurProfileProvenance : "daemon-original-default", inspectedContainer,
    }, null, 2))
    const settings = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Array(Schema.Struct({
      HostConfig: Schema.Struct({ SecurityOpt: Schema.NullOr(Schema.Array(Schema.String)), Privileged: Schema.Boolean,
        CapAdd: Schema.NullOr(Schema.Array(Schema.String)), CapDrop: Schema.NullOr(Schema.Array(Schema.String)),
        PidMode: Schema.String, IpcMode: Schema.String, NetworkMode: Schema.String, UsernsMode: Schema.String,
      }),
    })))))(inspectedContainer)
    if (settings.length !== 1) throw new Error("AUR_CONTAINER_SECURITY_INSPECTION_INVALID")
    const config = settings[0].HostConfig
    expect(config.Privileged, "AUR_DEFAULT_CAPABILITIES_REQUIRED").toBe(false)
    expect(config.CapAdd ?? []).toEqual([])
    expect(config.CapDrop ?? []).toEqual([])
    expect(config.PidMode, "AUR_PRIVATE_PID_NAMESPACE_REQUIRED").toBe("")
    expect(config.IpcMode, "AUR_PRIVATE_IPC_NAMESPACE_REQUIRED").toBe("private")
    // Exact bridge excludes host and container:<id> namespace sharing.
    expect(config.NetworkMode, "AUR_BRIDGE_NETWORK_NAMESPACE_REQUIRED").toBe("bridge")
    expect(config.UsernsMode, "AUR_DEFAULT_USER_NAMESPACE_REQUIRED").toBe("")
    if (mode === "enforce") {
      const options = config.SecurityOpt ?? []
      expect(options).toHaveLength(2)
      // Docker supports bare true and '=' / legacy ':' delimiters. Only true
      // is admitted; the native probe also requires PR_GET_NO_NEW_PRIVS == 1.
      const nnp = options.filter((option) => /^(?:no-new-privileges|no-new-privileges[=:]true)$/.test(option))
      if (nnp.length !== 1) throw new Error("AUR_DOCKER_NO_NEW_PRIVILEGES_TRUE_REQUIRED")
      const applied = options.find((option) => /^seccomp[=:]/.test(option))
      if (!applied) throw new Error("AUR_APPLIED_SECCOMP_PROFILE_MISSING")
      const normalized = JSON.stringify(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(applied.slice("seccomp=".length)))
      expect(createHash("sha256").update(normalized).digest("hex"), "AUR_DOCKER_APPLIED_PROFILE_DIGEST")
        .toBe(aurProfileProvenance.appliedSha256)
      expect(createHash("sha256").update(await readFile(profilePath)).digest("hex"))
        .toBe(aurProfileProvenance.appliedSha256)
    }
    await docker(["start", id])
    const measured = await command([state.docker, "exec", id, "/proof/sandbox-probe", mode,
      "/proof/sandbox-control/allowed", "/proof/sandbox-control/allowed/file", "/proof/sandbox-control/outside/file"], state.host)
    await Bun.write(join(state.directory, `evidence/sandbox-${mode}-process.json`), JSON.stringify(measured, null, 2))
    await Bun.write(join(state.directory, `evidence/sandbox-${mode === "enforce" ? "enforced" : "diagnosis"}.json`), measured.stdout)
    console.info(`AUR kernel sandbox ${mode}: ${measured.stdout.trim()}`)
    if (measured.code !== 0) throw new Error(`AUR_KERNEL_SANDBOX_${mode.toUpperCase()}_FAILED: ${measured.stderr}\n${measured.stdout}`)
    if (mode === "enforce") {
      Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(AurSandboxEvidence)))(measured.stdout)
      // Ending the scoped probe child is the only reset. A fresh process must
      // regain access to the outside file while retaining seccomp and NNP.
      expect(await docker(["exec", id, "/usr/bin/cat", "/proof/sandbox-control/outside/file"])).toBe("putside")
      continue
    }
    await docker(["rm", "--force", "--volumes", id], 60_000)
    const remaining = await ownedContainers()
    expect(remaining, "AUR_DIAGNOSTIC_CONTAINER_REMOVAL_PROVED").toEqual([])
    await Bun.write(join(state.directory, "evidence/sandbox-diagnostic-cleanup.json"), JSON.stringify({
      id, name, label: `${label}=${nonce}`, remaining,
    }, null, 2))
    state.id = undefined
  }
  if (!state.id) throw new Error("AUR_ENFORCED_GUEST_MISSING")
  // Shared builder compiles two real versions on the matching Ubuntu host and
  // admits all native companions and canonical skill/reference bytes before copy.
  const built = await buildVersions(state.directory)
  expect(built.payloads.map((payload) => payload.version)).toEqual([...versions])
  await copyFile(process.execPath, join(state.directory, "bun"))
  await chmod(join(state.directory, "bun"), 0o755)
  await Bun.write(join(state.directory, "input.json"), JSON.stringify({ target, oracleDigest: built.oracle.digest,
    denoSha256: denoRuntime.destination.sha256,
    payloads: built.payloads.map((payload) => ({ version: payload.version, archiveSha256: payload.archive.sha256 })),
  }, null, 2))
  const result = await command([state.docker, "exec", state.id, "/usr/bin/bash",
    "/repo/packages/cli/test/fixture/distribution-aur/bootstrap.sh", guest.cpu, guest.image], state.host, 2_100_000)
  if (state.cleanup) throw new Error("AUR_GUEST_COMPLETED_AFTER_TEARDOWN_STARTED")
  await Bun.write(join(state.directory, "evidence/guest-process.json"), JSON.stringify(result, null, 2))
  console.info(result.stdout)
  if (result.code !== 0) throw new Error(`AUR_NATIVE_GUEST_FAILED: ${guest.image}\n${result.stderr}`)
  if (createHash("sha256").update(await readFile(join(state.directory, "deno"))).digest("hex") !== denoRuntime.source.sha256)
    throw new Error("AUR_DENO_GUEST_RUNTIME_BYTES_CHANGED")
  const bootstrapSandbox = await aurBootstrapEvidence(join(state.directory, "evidence"))
  await aurBootstrapEvidenceTeeth(join(state.directory, "evidence"))
  const qualified = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
    target: Schema.String, versions: Schema.Array(Schema.String), architecture: Schema.String,
    bootstrapDownloadSandbox: AurBootstrapEvidence,
    denoRuntimeSha256: Schema.String,
    finalPackages: Schema.Array(Schema.Struct({ file: Schema.String, sha256: Schema.String })),
  }))))(await readFile(join(state.directory, "evidence/qualified.json"), "utf8"))
  expect(qualified.target).toBe(target)
  expect(qualified.versions).toEqual([...versions])
  expect(qualified.architecture).toBe(guest.cpu)
  expect(qualified.bootstrapDownloadSandbox).toEqual(bootstrapSandbox)
  expect(qualified.denoRuntimeSha256).toBe(denoRuntime.source.sha256)
  expect(qualified.finalPackages).toHaveLength(2)
  const cleaned = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
    qualified: Schema.Boolean, daemons: Schema.String, package: Schema.String,
    packagesAndBuilds: Schema.String, activation: Schema.String,
  }))))(await readFile(join(state.directory, "evidence/guest-cleanup.json"), "utf8"))
  expect(cleaned).toEqual({ qualified: true, daemons: "shared-owned-receipts-and-PID-exit-proved",
    package: "pacman-uninstalled", packagesAndBuilds: "removed", activation: "absent" })
}, 4_500_000)

async function copyDenoRuntime(repo: string, directory: string, box: Awaited<ReturnType<typeof sandbox>>) {
  if (!process.env.ORCHESTRA_DISTRIBUTION_DENO || !process.env.DISTRIBUTION_DENO_DIRECTORY || !process.env.RUNNER_TEMP ||
      process.env.ORCHESTRA_DISTRIBUTION_DENO_VERSION !== distributionDenoVersion)
    throw new Error("AUR_NATIVE_DENO_PINNED_HOST_SETUP_REQUIRED")
  const hostDirectory = await realpath(process.env.DISTRIBUTION_DENO_DIRECTORY)
  if (hostDirectory !== process.env.DISTRIBUTION_DENO_DIRECTORY || dirname(hostDirectory) !== await realpath(process.env.RUNNER_TEMP) ||
      !/^distribution-deno-[a-zA-Z0-9]+$/.test(basename(hostDirectory)))
    throw new Error("AUR_DENO_OWNED_EXTRACTION_DIRECTORY_REQUIRED")
  const source = join(hostDirectory, "deno")
  if (!isAbsolute(process.env.ORCHESTRA_DISTRIBUTION_DENO) || process.env.ORCHESTRA_DISTRIBUTION_DENO !== source || await realpath(source) !== source)
    throw new Error("AUR_DENO_CANONICAL_EXTRACTION_EXECUTABLE_REQUIRED")
  const receiptFile = join(repo, "distribution-logs/deno-runtime.json")
  if (await realpath(receiptFile) !== receiptFile) throw new Error("AUR_DENO_OFFICIAL_RECEIPT_REDIRECTED")
  const receiptBytes = await readFile(receiptFile).catch((cause: unknown) => {
    throw new Error("AUR_DENO_OFFICIAL_DOWNLOAD_RECEIPT_UNAVAILABLE", { cause })
  })
  const receipt = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
    version: Schema.Literal(distributionDenoVersion), url: Schema.String,
    sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
    host: Schema.Struct({ os: Schema.Literal("linux"), cpu: Schema.Literals(["x64", "arm64"]) }), executable: Schema.String,
  }))))(receiptBytes.toString("utf8"))
  const triple = process.arch === "x64" ? "x86_64-unknown-linux-gnu" : "aarch64-unknown-linux-gnu"
  if (receipt.host.cpu !== process.arch || receipt.executable !== source ||
      receipt.url !== `https://github.com/denoland/deno/releases/download/v${distributionDenoVersion}/deno-${triple}.zip`)
    throw new Error("AUR_DENO_OFFICIAL_DOWNLOAD_PIN_MISMATCH")
  const archive = join(hostDirectory, "deno.zip")
  if (await realpath(archive) !== archive) throw new Error("AUR_DENO_OFFICIAL_ARCHIVE_REDIRECTED")
  const archiveIdentity = fileIdentity(await lstat(archive))
  if (createHash("sha256").update(await readFile(archive)).digest("hex") !== receipt.sha256)
    throw new Error("AUR_DENO_OFFICIAL_ARCHIVE_DIGEST_MISMATCH")
  const handle = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW)
  return (async () => {
    const identity = fileIdentity(await handle.stat())
    if (!(identity.mode & 0o111) || !isDeepStrictEqual(identity, fileIdentity(await lstat(source))))
      throw new Error("AUR_DENO_PHYSICAL_SOURCE_IDENTITY_MISMATCH")
    const bytes = await handle.readFile()
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    if (bytes.length < 64 || bytes.readUInt32BE(0) !== 0x7f454c46 || bytes[4] !== 2 || bytes[5] !== 1 || bytes[6] !== 1 ||
        ![2, 3].includes(bytes.readUInt16LE(16)) || bytes.readUInt16LE(18) !== (process.arch === "x64" ? 62 : 183))
      throw new Error("AUR_DENO_NATIVE_ELF64_HEADER_REQUIRED")
    // The installer receipt pins the ZIP, not its extracted executable. Bind
    // the physical source to the actual member of that retained, verified ZIP.
    const member = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
      name: Schema.Literal("deno"), sha256: Schema.String, size: Schema.Int,
    }))))(await successful(["python3", "-c", `import hashlib,json,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    if archive.namelist().count("deno") != 1: raise RuntimeError("AUR_DENO_ARCHIVE_MEMBER_NOT_UNIQUE")
    data = archive.read("deno")
    print(json.dumps({"name":"deno","sha256":hashlib.sha256(data).hexdigest(),"size":len(data)}))`, archive], box))
    if (member.sha256 !== sha256 || member.size !== bytes.length)
      throw new Error("AUR_DENO_ARCHIVE_EXECUTABLE_BINDING_MISMATCH")
    const version = await successful([source, "--version"], box)
    const versionMetadata = parseDenoVersion(version, triple)
    // Hosted controls mutate the actual executable's first line, then readmit
    // that real output through the same parser used for source admission.
    const firstLine = version.split("\n")[0]
    const versionParseControls = await Promise.all([
      { name: "version-token-prefix", output: firstLine.replace(`deno ${distributionDenoVersion} `, `deno ${distributionDenoVersion}0 `),
        expected: "AUR_DENO_NATIVE_VERSION_PIN_MISMATCH" },
      { name: "bare-version-without-release-metadata", output: `deno ${distributionDenoVersion}`,
        expected: "AUR_DENO_NATIVE_VERSION_PIN_MISMATCH" },
      { name: "nonstable-channel", output: firstLine.replace("(stable,", "(canary,"),
        expected: "AUR_DENO_NATIVE_VERSION_PIN_MISMATCH" },
      { name: "nonrelease-build", output: firstLine.replace(", release,", ", debug,"),
        expected: "AUR_DENO_NATIVE_VERSION_PIN_MISMATCH" },
      { name: "foreign-native-triple", output: firstLine.replace(triple,
        process.arch === "x64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu"),
        expected: "AUR_DENO_NATIVE_VERSION_PIN_MISMATCH" },
      { name: "trailing-first-line-text", output: `${firstLine} unexpected`,
        expected: "AUR_DENO_NATIVE_VERSION_PIN_MISMATCH" },
    ].map(async (control) => {
      if (control.output === firstLine) throw new Error(`AUR_DENO_VERSION_PARSE_CONTROL_DID_NOT_MUTATE: ${control.name}`)
      const error = await Promise.resolve().then(() => parseDenoVersion(control.output, triple))
        .then(() => undefined, (cause: unknown) => cause)
      if (!(error instanceof Error) || error.message !== control.expected)
        throw new Error(`AUR_DENO_VERSION_PARSE_CONTROL_WRONG_CAUSE: ${control.name}`, { cause: error })
      if (!isDeepStrictEqual(parseDenoVersion(version, triple), versionMetadata))
        throw new Error(`AUR_DENO_VERSION_PARSE_BASELINE_READMISSION_FAILED: ${control.name}`)
      return { name: control.name, output: control.output, expected: control.expected, observed: error.message,
        restored: "actual-executable-version-output-readmitted" }
    }))
    const destination = join(directory, "deno")
    await copyFile(source, destination, constants.COPYFILE_EXCL)
    await chmod(destination, 0o755)
    const copied = await readFile(destination)
    if (!copied.equals(bytes)) throw new Error("AUR_DENO_COPIED_FULL_BYTES_MISMATCH")
    if (await realpath(destination) !== destination) throw new Error("AUR_DENO_COPY_REDIRECTED")
    if (!isDeepStrictEqual(identity, fileIdentity(await handle.stat())) || !isDeepStrictEqual(identity, fileIdentity(await lstat(source))) ||
        !isDeepStrictEqual(archiveIdentity, fileIdentity(await lstat(archive))) || !(await readFile(source)).equals(bytes))
      throw new Error("AUR_DENO_HOST_SOURCE_CHANGED_DURING_COPY")
    return { officialDownload: { file: receiptFile, sha256: createHash("sha256").update(receiptBytes).digest("hex"), receipt },
      archive: { file: archive, identity: archiveIdentity, sha256: receipt.sha256, member },
      source: { file: source, identity, sha256, header: { format: "ELF64", cpu: process.arch },
        version, versionMetadata, versionParseControls },
      destination: { file: destination, guestFile: "/proof/deno", identity: fileIdentity(await lstat(destination)),
        sha256: createHash("sha256").update(copied).digest("hex"), fullBytesEqual: true },
    }
  })().finally(() => handle.close())
}

function parseDenoVersion(output: string, triple: string) {
  const parsed = /^deno ([^\s]+) \((stable), (release), ([a-z0-9_-]+)\)$/.exec(output.split("\n")[0])
  if (!parsed || parsed[1] !== distributionDenoVersion || parsed[4] !== triple)
    throw new Error("AUR_DENO_NATIVE_VERSION_PIN_MISMATCH")
  return { version: parsed[1], channel: parsed[2], profile: parsed[3], triple: parsed[4] }
}

function fileIdentity(stat: Stats) {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("AUR_DENO_PHYSICAL_REGULAR_FILE_REQUIRED")
  return { dev: stat.dev, ino: stat.ino, nlink: stat.nlink, mode: stat.mode, uid: stat.uid, gid: stat.gid,
    size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs }
}

async function docker(args: string[], timeout = 90_000) {
  if (!state.docker || !state.host) throw new Error("AUR_DOCKER_LEASE_UNAVAILABLE")
  return successful([state.docker, ...args], state.host, timeout)
}

async function ownedContainers() {
  const output = await docker(["ps", "--all", "--no-trunc", "--filter", `label=${label}=${nonce}`, "--format", "{{.ID}}"])
  const ids = output ? output.split("\n").sort() : []
  if (ids.some((id) => !/^[a-f0-9]{64}$/.test(id))) throw new Error("AUR_CONTAINER_ENUMERATION_INVALID")
  return ids
}

function cleanup() {
  return state.cleanup ??= cleanupOwned()
}

async function cleanupOwned() {
  if (!state.directory) return
  const ids = state.attempted ? await ownedContainers() : []
  if (ids.length > 1 || (state.id && ids.some((id) => id !== state.id)))
    throw new Error("AUR_CONTAINER_OWNERSHIP_CHANGED")
  const owned: string[] = []
  const failures: unknown[] = []
  for (const id of ids) {
    const identity = await docker(["inspect", "--format", `{{.Name}}|{{index .Config.Labels "${label}"}}`, id])
    if (identity !== `/${name}|${nonce}`) throw new Error("AUR_CONTAINER_CLEANUP_IDENTITY_MISMATCH")
    owned.push(id)
    await repairFixtureOwner(id).catch((cause: unknown) => { failures.push(cause) })
  }
  // Every identity-verified container is removed even if permission repair or
  // evidence copying fails. Failed repairs retain the host fixture for diagnosis.
  await preserveEvidence().catch((cause: unknown) => { failures.push(cause) })
  for (const id of owned)
    await docker(["rm", "--force", "--volumes", id], 60_000).catch((cause: unknown) => { failures.push(cause) })
  if (state.attempted) await ownedContainers().then((remaining) => {
    expect(remaining, "AUR_OWNED_CONTAINER_SURVIVED_REMOVAL").toEqual([])
  }).catch((cause: unknown) => { failures.push(cause) })
  if (failures.length) {
    state.preserve = true
    throw new AggregateError(failures, "AUR_OWNED_TEARDOWN_INCOMPLETE")
  }
  await fixtureRoot()
  await rm(state.directory, { recursive: true, force: true })
  const survived = await lstat(state.directory).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
    throw error
  })
  if (survived) throw new Error("AUR_HOST_FIXTURE_SURVIVED_REMOVAL")
  if (state.artifact) await Bun.write(join(state.artifact, "host-cleanup.json"), JSON.stringify({ name, id: state.id,
    container: state.attempted ? "owned-label-enumerated-and-removed; post-removal-list-empty" : "not-created",
    fixture: "host-deletion-proved", owner: state.owner,
    repair: ids.length ? "owned-/proof-bind; guest-writers-stopped; no-symlink-traversal; full-owner-verified" : "not-needed",
  }, null, 2))
}

async function repairFixtureOwner(id: string) {
  expect(await docker(["inspect", "--format",
    '{{range .Mounts}}{{if eq .Destination "/proof"}}{{.Type}}|{{.Source}}|{{.RW}}{{end}}{{end}}', id]))
    .toBe(`bind|${state.directory}|true`)
  await fixtureRoot()
  if (!state.owner || !state.directory) throw new Error("AUR_HOST_FIXTURE_OWNER_MISSING")
  const running = await docker(["inspect", "--format", "{{.State.Running}}", id])
  if (running !== "true" && running !== "false") throw new Error("AUR_CONTAINER_STATE_INVALID")
  if (running === "false") await docker(["start", id])
  expect(await docker(["exec", id, "/usr/bin/bash", "/repo/packages/cli/test/fixture/distribution-aur/repair-owner.sh",
    nonce, String(state.owner.uid), String(state.owner.gid)], 60_000)).toBe("AUR_OWNED_FIXTURE_OWNER_REPAIRED")
  await verifyFixtureOwner(state.directory)
}

async function fixtureRoot() {
  if (!state.directory || !state.identity) throw new Error("AUR_FIXTURE_IDENTITY_MISSING")
  const root = await lstat(state.directory)
  if (!root.isDirectory() || root.isSymbolicLink() || root.dev !== state.identity.dev || root.ino !== state.identity.ino)
    throw new Error("AUR_FIXTURE_ROOT_REDIRECTED")
}

async function verifyFixtureOwner(directory: string) {
  const deadline = Date.now() + 30_000
  const visit = async (path: string): Promise<void> => {
    if (Date.now() > deadline) throw new Error("AUR_FIXTURE_OWNER_VERIFICATION_TIMEOUT")
    const stat = await lstat(path)
    if (stat.uid !== state.owner?.uid || stat.gid !== state.owner?.gid)
      throw new Error(`AUR_FIXTURE_OWNER_REPAIR_INCOMPLETE: ${path}`)
    // lstat never follows symlinks, including links to source archives and /repo.
    if (stat.isDirectory() && !stat.isSymbolicLink())
      for (const name of await readdir(path)) await visit(join(path, name))
  }
  await visit(directory)
}

async function preserveEvidence() {
  if (!state.directory || !state.artifact) return
  await fixtureRoot()
  const source = join(state.directory, "evidence")
  const visit = async (path: string): Promise<void> => {
    const stat = await lstat(path)
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
      throw new Error(`AUR_EVIDENCE_REDIRECTED_OR_SPECIAL: ${path}`)
    if (stat.isDirectory()) for (const name of await readdir(path)) await visit(join(path, name))
  }
  await visit(source)
  await cp(source, state.artifact, { recursive: true, dereference: false })
}
