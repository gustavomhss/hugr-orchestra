import { afterAll, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { chmod, copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises"
import { machine } from "node:os"
import { join, resolve } from "node:path"
import { Schema } from "effect"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { cli, command, nativeLibc, sandbox, sha256, successful, versions } from "./fixture/distribution-native"
import { removeOwnedMuslContainers } from "./fixture/distribution-musl/cleanup"
import type { MuslContainerLease } from "./fixture/distribution-musl/cleanup"

// Lead wires only this wrapper into matching hosted Ubuntu rows and excludes the
// guest from generic discovery. Per-CPU rust:1-alpine manifests, Docker Hub
// library/rust/tags/1-alpine, resolved 2026-10-14; no mutable tag at execution.
export const muslGuests = {
  x64: { cpu: "x86_64", dockerArch: "amd64", runner: "X64", target: "linux-x64-baseline-musl",
    image: "docker.io/library/rust@sha256:ddcfc394ea1f26b4363936ff59ee69c8eedb7b72146477c844d73b85031880ea" },
  arm64: { cpu: "aarch64", dockerArch: "arm64", runner: "ARM64", target: "linux-arm64-musl",
    image: "docker.io/library/rust@sha256:484dce463db97ee3b9c3dbeb82ac48408091573ec2da1ce9ccd84c823642779a" },
} as const
const nonce = randomUUID()
const label = "orchestra.musl.proof"
const name = `orchestra-musl-${nonce}`
const state: {
  directory?: string; host?: Awaited<ReturnType<typeof sandbox>>; docker?: string; id?: string;
  attempted: boolean; artifact?: string; owner?: { uid: number; gid: number };
  identity?: { dev: number; ino: number }; cleanup?: Promise<void>; lease?: MuslContainerLease;
  teardown: boolean; failure?: unknown;
  control?: { scope: Omit<MuslContainerLease, "id">; known?: MuslContainerLease };
} = { attempted: false, teardown: false }
const interrupt = () => { void cleanup().then(() => process.exit(1), () => {
  console.error(`MUSL_INTERRUPTED_CLEANUP_FAILED: name=${name} fixture=${state.directory}`)
  process.exit(1)
}) }

afterAll(async () => {
  await cleanup()
  process.off("SIGINT", interrupt)
  process.off("SIGTERM", interrupt)
  process.off("SIGHUP", interrupt)
}, 180_000)

test("MUSL-NATIVE pinned native Alpine builds real curl/npm install/update/rollback closures", async () => {
  expectSpawn(import.meta.path)
  await runMuslQualification()
}, 5_400_000)

export async function runMuslQualification() {
  if (process.platform !== "linux" || (process.arch !== "x64" && process.arch !== "arm64") || nativeLibc?.kind !== "glibc")
    throw new Error("MUSL_MATCHING_UBUNTU_NATIVE_HOST_REQUIRED")
  const guest = muslGuests[process.arch]
  if (process.env.RUNNER_OS !== "Linux" || process.env.RUNNER_ARCH !== guest.runner ||
      process.env.RUNNER_ENVIRONMENT !== "github-hosted" || (machine() !== guest.cpu && machine() !== process.arch) ||
      !/^ID=ubuntu$/m.test(await readFile("/etc/os-release", "utf8")))
    throw new Error("MUSL_MATCHING_UBUNTU_HOSTED_RUNNER_REQUIRED")
  if (process.versions.bun !== "1.3.14") throw new Error("MUSL_HOST_BUN_VERSION_MISMATCH")
  if (!process.env.RUNNER_TEMP || !process.env.GITHUB_WORKSPACE) throw new Error("MUSL_HOSTED_WORKSPACE_REQUIRED")
  const repo = await realpath(resolve(cli, "../.."))
  if (repo !== await realpath(process.env.GITHUB_WORKSPACE)) throw new Error("MUSL_OWNED_CI_CHECKOUT_REQUIRED")
  const uid = process.getuid?.()
  const gid = process.getgid?.()
  if (uid === undefined || gid === undefined || !Number.isSafeInteger(uid) || !Number.isSafeInteger(gid) || uid < 0 || gid < 0)
    throw new Error("MUSL_HOST_FIXTURE_OWNER_INVALID")
  if (state.directory) throw new Error("MUSL_FIXTURE_ALREADY_STARTED")
  state.owner = { uid, gid }
  state.directory = await mkdtemp(join(await realpath(process.env.RUNNER_TEMP), "orchestra-musl-native-"))
  const root = await lstat(state.directory)
  state.identity = { dev: root.dev, ino: root.ino }
  await chmod(state.directory, 0o755)
  await mkdir(join(state.directory, "evidence"))
  await mkdir(join(state.directory, "controls"))
  await Bun.write(join(state.directory, ".musl-ownership"), `${nonce}\n`)
  state.artifact = join(repo, "distribution-logs", `musl-${guest.target}-${nonce}`)
  state.host = await sandbox(join(state.directory, "host-tools"))
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  process.once("SIGHUP", interrupt)
  expect(await successful(["uname", "-m"], state.host)).toBe(guest.cpu)
  const wrongHost = await command([process.execPath, "script/runtime-proof.ts", "--target", guest.target, "--host"], { ...state.host, cwd: cli })
  expect(wrongHost.code, "MUSL_GLIBC_HOST_MUST_NOT_QUALIFY_MUSL_TARGET").not.toBe(0)
  expect(wrongHost.stderr).toContain("NATIVE_HOST_LIBC_MISMATCH")
  await Bun.write(join(state.directory, "evidence/host-abi-control.json"), JSON.stringify({ actual: nativeLibc, rejected: wrongHost }, null, 2))
  state.docker = Bun.which("docker") ?? undefined
  if (!state.docker) throw new Error("MUSL_DOCKER_UNAVAILABLE")
  const daemon = await docker(["info", "--format", "{{.OSType}}|{{.Architecture}}"])
  if (daemon !== `linux|${guest.cpu}` && daemon !== `linux|${guest.dockerArch}`)
    throw new Error(`MUSL_NATIVE_DOCKER_DAEMON_ARCH_MISMATCH: ${daemon}`)
  await docker(["pull", "--platform", `linux/${guest.dockerArch}`, guest.image], 300_000)
  const image = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Array(Schema.Struct({
    Architecture: Schema.String, Os: Schema.String, Id: Schema.String, RepoDigests: Schema.Array(Schema.String),
  })))))(await docker(["image", "inspect", guest.image]))
  if (image.length !== 1 || image[0].Architecture !== guest.dockerArch || image[0].Os !== "linux" ||
      !/^sha256:[a-f0-9]{64}$/.test(image[0].Id) || !image[0].RepoDigests.some((d) => d.endsWith(`@${guest.image.split("@")[1]}`)))
    throw new Error("MUSL_IMMUTABLE_GUEST_PROVENANCE_MISMATCH")
  const sourceBox = { ...state.host, cwd: repo }
  const sourceSHA = await successful(["git", "rev-parse", "HEAD"], sourceBox)
  const treeHash = await successful(["git", "rev-parse", "HEAD^{tree}"], sourceBox)
  if (!/^[a-f0-9]{40}$/.test(sourceSHA) || !/^[a-f0-9]{40}$/.test(treeHash)) throw new Error("MUSL_SOURCE_RECEIPT_INVALID")
  // Bundle copies objects, never host node_modules/build products. Guest checks
  // every tracked source byte against this commit both before and after builds.
  await successful(["git", "bundle", "create", join(state.directory, "source.bundle"), "HEAD"], sourceBox, 120_000)
  const bundleSha256 = sha256(await readFile(join(state.directory, "source.bundle")))
  await copyFile(process.execPath, join(state.directory, "controls/glibc-bun"))
  await copyFile(join(repo, "native/omni/target/release/libhugr_omni_node.so"), join(state.directory, "controls/glibc-addon.node"))
  const controls = await Promise.all(["glibc-bun", "glibc-addon.node"].map(async (file) =>
    ({ file, sha256: sha256(await readFile(join(state.directory!, "controls", file))) })))
  await Bun.write(join(state.directory, "input.json"), JSON.stringify({ target: guest.target, sourceSHA, treeHash, bundleSha256,
    image: guest.image, cpu: guest.cpu, controls }, null, 2))
  await Bun.write(join(state.directory, "evidence/provenance.json"), JSON.stringify({ guest, sourceSHA, treeHash, bundleSha256,
    inspectedImage: image, host: { libc: nativeLibc, cpu: machine(), arch: process.arch, osRelease: await readFile("/etc/os-release", "utf8"),
      docker: daemon, runner: process.env.RUNNER_ARCH, environment: process.env.RUNNER_ENVIRONMENT } }, null, 2))
  await censusFailureControl(guest.image, guest.dockerArch)
  expect(await ownedContainers()).toEqual([])
  state.attempted = true
  const id = await docker(["create", "--name", name, "--label", `${label}=${nonce}`, "--init",
    "--platform", `linux/${guest.dockerArch}`, "--mount", `type=bind,source=${repo},target=/repo,readonly`,
    "--mount", `type=bind,source=${state.directory},target=/proof`, "--workdir", "/proof", guest.image, "/bin/sleep", "infinity"])
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("MUSL_OWNED_CONTAINER_ID_INVALID")
  state.id = id
  expect(await docker(["inspect", "--format", `{{.Id}}|{{.Name}}|{{.Config.Image}}|{{index .Config.Labels "${label}"}}|{{.HostConfig.Init}}`, id]))
    .toBe(`${id}|/${name}|${guest.image}|${nonce}|true`)
  state.lease = { id, name, label, nonce }
  expect(await ownedContainers(), "MUSL_CONTAINER_ENUMERATION_POSITIVE_CONTROL").toEqual([id])
  await docker(["start", id])
  const result = await command([state.docker, "exec", id, "/bin/sh", "/repo/apps/cli/test/fixture/distribution-musl/bootstrap.sh",
    guest.cpu, sourceSHA, treeHash, bundleSha256], state.host, 4_800_000)
  if (state.teardown) throw new Error("MUSL_GUEST_COMPLETED_AFTER_TEARDOWN_STARTED")
  await Bun.write(join(state.directory, "evidence/guest-process.json"), JSON.stringify(result, null, 2))
  console.info(result.stdout)
  if (result.code !== 0) throw new Error(`MUSL_NATIVE_GUEST_FAILED: ${guest.image}; logs=${state.artifact}\n${result.stderr}`)
  const qualified = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
    target: Schema.String, sourceSHA: Schema.String, versions: Schema.Array(Schema.String), architecture: Schema.String,
    libc: Schema.Literal("musl"), channels: Schema.Array(Schema.String),
  }))))(await readFile(join(state.directory, "evidence/qualified.json"), "utf8"))
  expect(qualified).toEqual({ target: guest.target, sourceSHA, versions: [...versions], architecture: guest.cpu,
    libc: "musl", channels: ["curl", "npm"] })
  const cleaned = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
    qualified: Schema.Boolean, daemons: Schema.String,
  }))))(await readFile(join(state.directory, "evidence/guest-cleanup.json"), "utf8"))
  expect(cleaned).toEqual({ qualified: true, daemons: "shared-owned-receipts-and-PID-exit-proved" })
}

async function docker(args: string[], timeout = 90_000) {
  if (!state.docker || !state.host) throw new Error("MUSL_DOCKER_LEASE_UNAVAILABLE")
  return successful([state.docker, ...args], state.host, timeout)
}

async function ownedContainers() {
  const output = await docker(["ps", "--all", "--no-trunc", "--filter", `label=${label}=${nonce}`, "--format", "{{.ID}}"])
  const ids = output ? output.split("\n").sort() : []
  if (ids.some((id) => !/^[a-f0-9]{64}$/.test(id))) throw new Error("MUSL_CONTAINER_ENUMERATION_INVALID")
  return ids
}

function cleanup() {
  state.teardown = true
  if (state.cleanup) return state.cleanup
  const cleaning = cleanupOwned().catch((cause: unknown) => { state.failure ??= cause; throw cause })
  state.cleanup = cleaning
  void cleaning.catch(() => { if (state.cleanup === cleaning) state.cleanup = undefined })
  return cleaning
}

async function cleanupOwned() {
  if (!state.directory) return
  const prepare = async (ids: string[]) => {
    const failures: unknown[] = []
    if (state.control) await removeOwnedMuslContainers({ scope: state.control.scope, known: state.control.known, run: dockerResult })
      .then(() => { state.control = undefined }, (cause: unknown) => { failures.push(cause) })
    for (const id of ids) await repairFixtureOwner(id).catch((cause: unknown) => { failures.push(cause) })
    await preserveEvidence().catch((cause: unknown) => { failures.push(cause) })
    if (failures.length) throw new AggregateError(failures, "MUSL_FIXTURE_REPAIR_OR_EVIDENCE_FAILED")
  }
  const retired = state.attempted ? await removeOwnedMuslContainers({ scope: { name, label, nonce }, known: state.lease,
    run: dockerResult, prepare }) : (await prepare([]), { retired: [] })
  // A successful resource retry cannot erase the original failed qualification
  // or permit deletion of its diagnostic fixture.
  if (state.failure) throw state.failure
  await fixtureRoot()
  await rm(state.directory, { recursive: true, force: true })
  const survived = await lstat(state.directory).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
    throw error
  })
  if (survived) throw new Error("MUSL_HOST_FIXTURE_SURVIVED_REMOVAL")
  if (state.artifact) await Bun.write(join(state.artifact, "host-cleanup.json"), JSON.stringify({ name, id: state.id,
    container: state.attempted ? "owned-label-enumerated-and-removed; post-removal-list-empty" : "not-created",
    fixture: "host-deletion-proved", owner: state.owner,
    repair: retired.retired.length ? "owned-/proof-bind; guest-writers-stopped; no-symlink-traversal; full-owner-verified" : "not-needed" }, null, 2))
}

function dockerResult(args: string[]) {
  if (!state.docker || !state.host) throw new Error("MUSL_DOCKER_LEASE_UNAVAILABLE")
  return command([state.docker, ...args], state.host, 90_000)
}

async function censusFailureControl(image: string, architecture: string) {
  const scope = { name: `${name}-census-control`, label: `${label}.control`, nonce }
  const control: { scope: Omit<MuslContainerLease, "id">; known?: MuslContainerLease } = { scope }
  state.control = control
  try {
    const id = await docker(["create", "--name", scope.name, "--label", `${scope.label}=${nonce}`, "--init",
      "--platform", `linux/${architecture}`, image, "/bin/sleep", "infinity"])
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("MUSL_CENSUS_CONTROL_ID_INVALID")
    expect(await docker(["inspect", "--format", `{{.Id}}|{{.Name}}|{{index .Config.Labels "${scope.label}"}}`, id]))
      .toBe(`${id}|/${scope.name}|${nonce}`)
    control.known = { ...scope, id }
    if (state.teardown) throw new Error("MUSL_CENSUS_CONTROL_COMPLETED_AFTER_TEARDOWN_STARTED")
    const list = ["ps", "--all", "--no-trunc", "--filter", `label=${scope.label}=${nonce}`, "--format", "{{.ID}}"]
    expect(await docker(list), "MUSL_FAULT_CENSUS_POSITIVE_CONTROL").toBe(id)
    // Real Docker rejects this invalid template against the known live object.
    // No global Docker mock; production cleanup gets the actual command failure.
    const failure = await removeOwnedMuslContainers({ scope, known: control.known, run: dockerResult,
      censusFormat: "{{.OrchestraMissingCensusField}}" }).then(() => undefined, (cause: unknown) => cause)
    expect(failure).toBeInstanceOf(AggregateError)
    if (!(failure instanceof AggregateError)) throw new Error("MUSL_CENSUS_FAILURE_CONTROL_DID_NOT_FAIL")
    const censusError: unknown = failure.errors.find((error: unknown) => error instanceof Error && error.message === "MUSL_CONTAINER_CENSUS_FAILED")
    if (!(censusError instanceof Error) || !(censusError.cause instanceof Error)) throw new Error("MUSL_CENSUS_FAULT_DIAGNOSTIC_MISSING")
    expect(censusError.cause.message).toContain("MUSL_DOCKER_OPERATION_FAILED")
    const diagnostic = Schema.decodeUnknownSync(Schema.Struct({ code: Schema.Int, stderr: Schema.String }))(censusError.cause.cause)
    expect(diagnostic.code).not.toBe(0)
    expect(diagnostic.stderr).toContain("OrchestraMissingCensusField")
    expect(await docker(list), "MUSL_KNOWN_LEASE_SURVIVED_FAILED_CENSUS").toBe("")
    const inspected = await dockerResult(["inspect", id])
    expect(inspected.code).toBe(1)
    expect(inspected.stderr).toMatch(/No such (?:object|container)/i)
    if (!state.directory) throw new Error("MUSL_CENSUS_CONTROL_FIXTURE_MISSING")
    await Bun.write(join(state.directory, "evidence/cleanup-census-control.json"), JSON.stringify({ id,
      retired: true, inspected, errors: failure.errors.filter((error: unknown): error is Error => error instanceof Error)
        .map((error: Error) => ({ message: error.message, cause: error.cause instanceof Error ?
          { message: error.cause.message, result: error.cause.cause } : error.cause })) }, null, 2))
  } finally {
    await removeOwnedMuslContainers({ scope, known: control.known, run: dockerResult })
    if (state.control === control) state.control = undefined
  }
}

async function repairFixtureOwner(id: string) {
  expect(await docker(["inspect", "--format", '{{range .Mounts}}{{if eq .Destination "/proof"}}{{.Type}}|{{.Source}}|{{.RW}}{{end}}{{end}}', id]))
    .toBe(`bind|${state.directory}|true`)
  await fixtureRoot()
  if (!state.owner || !state.directory) throw new Error("MUSL_HOST_FIXTURE_OWNER_MISSING")
  const running = await docker(["inspect", "--format", "{{.State.Running}}", id])
  if (!["true", "false"].includes(running)) throw new Error("MUSL_CONTAINER_STATE_INVALID")
  if (running === "false") await docker(["start", id])
  expect(await docker(["exec", id, "/bin/sh", "/repo/apps/cli/test/fixture/distribution-musl/repair-owner.sh",
    nonce, String(state.owner.uid), String(state.owner.gid)], 120_000)).toBe("MUSL_OWNED_FIXTURE_OWNER_REPAIRED")
  const deadline = Date.now() + 60_000
  const visit = async (path: string): Promise<void> => {
    if (Date.now() > deadline) throw new Error("MUSL_FIXTURE_OWNER_VERIFICATION_TIMEOUT")
    const stat = await lstat(path)
    if (stat.uid !== state.owner?.uid || stat.gid !== state.owner?.gid) throw new Error(`MUSL_FIXTURE_OWNER_REPAIR_INCOMPLETE: ${path}`)
    if (stat.isDirectory() && !stat.isSymbolicLink()) for (const name of await readdir(path)) await visit(join(path, name))
  }
  await visit(state.directory)
}

async function fixtureRoot() {
  if (!state.directory || !state.identity) throw new Error("MUSL_FIXTURE_IDENTITY_MISSING")
  const root = await lstat(state.directory)
  if (!root.isDirectory() || root.isSymbolicLink() || root.dev !== state.identity.dev || root.ino !== state.identity.ino)
    throw new Error("MUSL_FIXTURE_ROOT_REDIRECTED")
  if (await readFile(join(state.directory, ".musl-ownership"), "utf8") !== `${nonce}\n`)
    throw new Error("MUSL_FIXTURE_OWNERSHIP_MARKER_CHANGED")
}

async function preserveEvidence() {
  if (!state.directory || !state.artifact) return
  await fixtureRoot()
  const source = join(state.directory, "evidence")
  const visit = async (path: string): Promise<void> => {
    const stat = await lstat(path)
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || (stat.isFile() && stat.nlink !== 1))
      throw new Error(`MUSL_EVIDENCE_REDIRECTED_OR_SPECIAL: ${path}`)
    if (stat.isDirectory()) for (const name of await readdir(path)) await visit(join(path, name))
  }
  await visit(source)
  await cp(source, state.artifact, { recursive: true, dereference: false })
}
