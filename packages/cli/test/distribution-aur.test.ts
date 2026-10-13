import { afterAll, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises"
import { machine } from "node:os"
import { join, resolve } from "node:path"
import { Schema } from "effect"
import { expectSpawn } from "../../core/test/fixture/omni-expect"
import { buildVersions, cli, command, sandbox, successful, target, versions } from "./fixture/distribution-native"

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
} = { attempted: false, preserve: false }

afterAll(async () => {
  if (!state.directory) return
  await cleanup().catch((cause: unknown) => {
    state.preserve = true
    throw new Error(`AUR_OWNED_CONTAINER_CLEANUP_FAILED: name=${name} fixture=${state.directory}`, { cause })
  })
  if (state.artifact) {
    await cp(join(state.directory, "evidence"), state.artifact, { recursive: true })
    await Bun.write(join(state.artifact, "host-cleanup.json"), JSON.stringify({ name, id: state.id,
      container: state.attempted ? "owned-label-enumerated-and-removed; post-removal-list-empty" : "not-created",
    }, null, 2))
  }
  if (!state.preserve) await rm(state.directory, { recursive: true, force: true })
}, 180_000)

test("AUR-NATIVE matching Arch guest makepkg/pacman install/update/retained-package downgrade qualify native closure", async () => {
  expectSpawn(import.meta.path)
  if (process.platform !== "linux" || (process.arch !== "x64" && process.arch !== "arm64"))
    throw new Error("AUR_NATIVE_LINUX_X64_OR_ARM64_HOST_REQUIRED")
  const guest = guests[process.arch]
  if (process.env.RUNNER_OS !== "Linux" || process.env.RUNNER_ARCH !== guest.runner ||
      process.env.RUNNER_ENVIRONMENT !== "github-hosted" || machine() !== guest.cpu)
    throw new Error("AUR_MATCHING_UBUNTU_HOSTED_RUNNER_REQUIRED")
  if (!/^ID=ubuntu$/m.test(await readFile("/etc/os-release", "utf8"))) throw new Error("AUR_UBUNTU_HOST_REQUIRED")
  if (process.versions.bun !== "1.3.14") throw new Error("AUR_HOST_BUN_VERSION_MISMATCH")
  if (!process.env.RUNNER_TEMP || !process.env.GITHUB_WORKSPACE) throw new Error("AUR_HOSTED_WORKSPACE_REQUIRED")
  const repo = await realpath(resolve(cli, "../.."))
  if (repo !== await realpath(process.env.GITHUB_WORKSPACE)) throw new Error("AUR_OWNED_CI_CHECKOUT_REQUIRED")
  state.directory = await mkdtemp(join(await realpath(process.env.RUNNER_TEMP), "orchestra-aur-native-"))
  // Only the owned fixture needs builder traversal; never chmod host user state.
  await chmod(state.directory, 0o755)
  await mkdir(join(state.directory, "evidence"))
  state.artifact = join(repo, "distribution-logs", `aur-${target}-${nonce}`)
  state.host = await sandbox(join(state.directory, "host-tools"))
  state.docker = Bun.which("docker") ?? undefined
  if (!state.docker) throw new Error("AUR_DOCKER_UNAVAILABLE")
  const daemon = await docker(["info", "--format", "{{.OSType}}|{{.Architecture}}"], 30_000)
  if (daemon !== `linux|${guest.cpu}` && daemon !== `linux|${guest.dockerArch}`)
    throw new Error(`AUR_NATIVE_DOCKER_DAEMON_ARCH_MISMATCH: ${daemon}`)
  console.info(`AUR guest selection: ${JSON.stringify({ target, ...guest })}`)
  await docker(["pull", "--platform", `linux/${guest.dockerArch}`, guest.image], 300_000)
    .catch((cause: unknown) => { throw new Error(`AUR_PINNED_GUEST_IMAGE_UNAVAILABLE: ${guest.image}`, { cause }) })
  const image = await docker(["image", "inspect", "--format",
    '{{.Architecture}}|{{.Os}}|{{.Id}}|{{join .RepoDigests ","}}', guest.image])
  const inspected = image.split("|")
  if (inspected.length !== 4 || inspected[0] !== guest.dockerArch || inspected[1] !== "linux" ||
      !/^sha256:[a-f0-9]{64}$/.test(inspected[2]) ||
      !inspected[3].split(",").some((digest) => digest.endsWith(`@${guest.image.split("@")[1]}`)))
    throw new Error(`AUR_IMMUTABLE_GUEST_PROVENANCE_MISMATCH: ${image}`)
  await Bun.write(join(state.directory, "evidence/provenance.json"), JSON.stringify({
    target, guest, inspectedImage: image, host: { cpu: machine(), arch: process.arch,
      runner: process.env.RUNNER_ARCH, environment: process.env.RUNNER_ENVIRONMENT,
      osRelease: await readFile("/etc/os-release", "utf8"), docker: daemon,
      version: await docker(["version", "--format", "{{.Client.Version}}|{{.Server.Version}}"]),
    },
  }, null, 2))
  // Shared builder compiles two real versions on the matching Ubuntu host and
  // admits all native companions and canonical skill/reference bytes before copy.
  const built = await buildVersions(state.directory)
  expect(built.payloads.map((payload) => payload.version)).toEqual([...versions])
  await copyFile(process.execPath, join(state.directory, "bun"))
  await chmod(join(state.directory, "bun"), 0o755)
  await Bun.write(join(state.directory, "input.json"), JSON.stringify({ target, oracleDigest: built.oracle.digest,
    payloads: built.payloads.map((payload) => ({ version: payload.version, archiveSha256: payload.archive.sha256 })),
  }, null, 2))
  expect(await ownedContainers()).toEqual([])
  state.attempted = true // A timed-out create may still have created the named container.
  const id = await docker(["create", "--name", name, "--label", `${label}=${nonce}`, "--init",
    "--platform", `linux/${guest.dockerArch}`, "--mount", `type=bind,source=${repo},target=/repo,readonly`,
    "--mount", `type=bind,source=${state.directory},target=/proof`, "--workdir", "/repo/packages/cli",
    guest.image, "/usr/bin/sleep", "infinity"])
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("AUR_OWNED_CONTAINER_ID_INVALID")
  state.id = id
  // Positive control: the same label query used for absence MUST see this ID now.
  expect(await ownedContainers(), "AUR_CONTAINER_ENUMERATION_POSITIVE_CONTROL").toEqual([id])
  expect(await docker(["inspect", "--format",
    `{{.Id}}|{{.Config.Image}}|{{index .Config.Labels "${label}"}}|{{.HostConfig.Init}}`, id]))
    .toBe(`${id}|${guest.image}|${nonce}|true`)
  await docker(["start", id])
  const result = await command([state.docker, "exec", id, "/usr/bin/bash",
    "/repo/packages/cli/test/fixture/distribution-aur/bootstrap.sh", guest.cpu, guest.image], state.host, 2_100_000)
  await Bun.write(join(state.directory, "evidence/guest-process.json"), JSON.stringify(result, null, 2))
  console.info(result.stdout)
  if (result.code !== 0) throw new Error(`AUR_NATIVE_GUEST_FAILED: ${guest.image}\n${result.stderr}`)
  const qualified = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
    target: Schema.String, versions: Schema.Array(Schema.String), architecture: Schema.String,
    finalPackages: Schema.Array(Schema.Struct({ file: Schema.String, sha256: Schema.String })),
  }))))(await readFile(join(state.directory, "evidence/qualified.json"), "utf8"))
  expect(qualified.target).toBe(target)
  expect(qualified.versions).toEqual([...versions])
  expect(qualified.architecture).toBe(guest.cpu)
  expect(qualified.finalPackages).toHaveLength(2)
  const cleaned = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
    qualified: Schema.Boolean, daemons: Schema.String, package: Schema.String,
    packagesAndBuilds: Schema.String, activation: Schema.String,
  }))))(await readFile(join(state.directory, "evidence/guest-cleanup.json"), "utf8"))
  expect(cleaned).toEqual({ qualified: true, daemons: "shared-owned-receipts-and-PID-exit-proved",
    package: "pacman-uninstalled", packagesAndBuilds: "removed", activation: "absent" })
}, 4_500_000)

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

async function cleanup() {
  if (!state.attempted) return
  const ids = await ownedContainers()
  if (ids.length > 1 || (state.id && ids.some((id) => id !== state.id)))
    throw new Error("AUR_CONTAINER_OWNERSHIP_CHANGED")
  for (const id of ids) {
    const identity = await docker(["inspect", "--format", `{{.Name}}|{{index .Config.Labels "${label}"}}`, id])
    if (identity !== `/${name}|${nonce}`) throw new Error("AUR_CONTAINER_CLEANUP_IDENTITY_MISMATCH")
    await docker(["rm", "--force", "--volumes", id], 60_000)
  }
  expect(await ownedContainers(), "AUR_OWNED_CONTAINER_SURVIVED_REMOVAL").toEqual([])
}
