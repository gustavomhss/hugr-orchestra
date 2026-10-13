import { afterAll, expect, test } from "bun:test"
import { mkdir, readFile, readdir, readlink, realpath, rm } from "node:fs/promises"
import { machine } from "node:os"
import { basename, join, resolve } from "node:path"
import { Schema } from "effect"
import { expectSpawn } from "../../../core/test/fixture/omni-expect"
import { distributionRecipes } from "../../script/distribution-recipes"
import { verifyDistribution } from "../../script/distribution-payload"
import { captureOracle, command, sandbox, sha256, skillIdentity, snapshot, successful, target, versions } from "./distribution-native"
import { emergencyStop, qualify, stopServices } from "./distribution-native-proof"
import { aurFinalPackage, aurInventory, aurInventoryTeeth, aurPayload } from "./distribution-aur-inventory"
import type { AurPayload } from "./distribution-aur-inventory"
import { aurArchives } from "./distribution-aur-https"

const Input = Schema.Struct({ target: Schema.String, oracleDigest: Schema.String,
  payloads: Schema.Array(Schema.Struct({ version: Schema.String, archiveSha256: Schema.String })) })
const state: { box?: Awaited<ReturnType<typeof sandbox>>; attempted: boolean; qualified: boolean } = {
  attempted: false, qualified: false,
}
const payloadRoot = "/usr/lib/orchestra"
const launcher = "/usr/bin/orchestra"
const interrupt = () => { void stopServices().then(() => process.exit(1), () => process.exit(1)) }

afterAll(async () => {
  if (!state.box) return
  // A failed daemon ownership/exit proof keeps its original launcher until the
  // host destroys this entire owned PID namespace. It cannot become a green run.
  await stopServices()
  const query = await command(["pacman", "-Q", "orchestra-bin"], state.box)
  if (query.code === 0) {
    if (!state.attempted) throw new Error("AUR_UNOWNED_INSTALLED_PACKAGE_REFUSED")
    await successful(["pacman", "-R", "--noconfirm", "orchestra-bin"], state.box, 120_000)
  }
  if (query.code !== 0 && query.code !== 1) throw new Error("AUR_PACKAGE_CLEANUP_QUERY_FAILED")
  expect((await command(["pacman", "-Q", "orchestra-bin"], state.box)).code).toBe(1)
  expect(await aurInventory(payloadRoot), "AUR_UNINSTALL_PAYLOAD_SURVIVED").toBeUndefined()
  expect(await aurInventory(launcher), "AUR_UNINSTALL_PUBLIC_LAUNCHER_SURVIVED").toBeUndefined()
  expect((await readdir("/var/lib/pacman/local")).filter((name) => name.startsWith("orchestra-bin-"))).toEqual([])
  await rm("/proof/packages", { recursive: true, force: true })
  await rm("/proof/builds", { recursive: true, force: true })
  expect(await aurInventory("/proof/packages")).toBeUndefined()
  expect(await aurInventory("/proof/builds")).toBeUndefined()
  process.off("exit", emergencyStop)
  process.off("SIGINT", interrupt)
  process.off("SIGTERM", interrupt)
  await Bun.write("/proof/evidence/guest-cleanup.json", JSON.stringify({
    qualified: state.qualified, daemons: "shared-owned-receipts-and-PID-exit-proved",
    package: "pacman-uninstalled", packagesAndBuilds: "removed", activation: "absent",
  }, null, 2))
}, 180_000)

test("AUR-GUEST real nonroot makepkg final tidy/pacman install/update/retained original package downgrade", async () => {
  expectSpawn(import.meta.path)
  if (process.env.ORCHESTRA_AUR_GUEST !== "owned" || process.platform !== "linux" || process.getuid?.() !== 0 ||
      !(await Bun.file("/.dockerenv").exists())) throw new Error("AUR_OWNED_NATIVE_GUEST_REQUIRED")
  if (process.versions.bun !== "1.3.14") throw new Error("AUR_GUEST_BUN_VERSION_MISMATCH")
  if (machine() !== (process.arch === "x64" ? "x86_64" : "aarch64") || !["x64", "arm64"].includes(process.arch))
    throw new Error("AUR_GUEST_NATIVE_ARCHITECTURE_REQUIRED")
  const input = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Input)))(
    await readFile("/proof/input.json", "utf8"))
  expect(input.target).toBe(target)
  expect(input.payloads.map((payload) => payload.version)).toEqual([...versions])
  const box = await sandbox("/proof/runtime")
  state.box = box
  expect(await aurInventory(payloadRoot)).toBeUndefined()
  expect(await aurInventory(launcher)).toBeUndefined()
  expect((await command(["pacman", "-Q", "orchestra-bin"], box)).code).toBe(1)
  process.once("exit", emergencyStop)
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  await Promise.all(["/proof/builds", "/proof/packages", "/proof/evidence"].map((path) => mkdir(path, { recursive: true })))
  const oracle = await captureOracle()
  expect(oracle.digest).toBe(input.oracleDigest)
  const payloads: AurPayload[] = await Promise.all(input.payloads.map(async (record) => {
    const payload = `/proof/payload-${record.version}`
    const manifest = await verifyDistribution(payload, { version: record.version, target })
    const archive = { file: `/proof/${record.version}.tar.gz`, sha256: record.archiveSha256 }
    expect(sha256(await readFile(archive.file))).toBe(archive.sha256)
    return { version: record.version, payload, manifest, archive }
  }))
  const originals = await Promise.all(payloads.map((payload) => aurInventory(payload.payload)))
  const https = await aurArchives(await sandbox("/proof/tls"), payloads)
  const retained = new Map<string, string>()
  const downloads = new Map<string, string>()
  const caches = new Map<string, { bytes: Awaited<ReturnType<typeof snapshot>>; inventory: Awaited<ReturnType<typeof aurInventory>> }>()
  // Shared qualify() confines the resolved executable to box.directory. This
  // entire /usr prefix belongs to the private container, while XDG stays /proof.
  // Never use this prefix exception on the host or corroborate guest PIDs there.
  const runtimeBox = { ...box, directory: "/usr" }
  const selected = (payload: AurPayload, negative = false) => qualify({
    launcher, payload: payloadRoot, version: payload.version, box: runtimeBox, oracle, negative,
  })
  try {
    const selectedURL = https.assets[0].find((asset) => asset.target === target)?.url
    if (!selectedURL) throw new Error("AUR_SELECTED_HTTPS_ASSET_MISSING")
    expect((await command(["curl", "--disable", "--fail", "--silent", "--show-error", selectedURL], box)).code,
      "AUR_PRIVATE_CA_MUST_BE_REQUIRED").toBe(60)
    const control = "/proof/trusted-download.tar.gz"
    await successful(["curl", "--disable", "--fail", "--silent", "--show-error", "--cacert", https.ca,
      "--connect-timeout", "10", "--max-time", "30", "--output", control, selectedURL], box)
    expect(sha256(await readFile(control))).toBe(payloads[0].archive.sha256)
    for (const assets of https.assets) for (const asset of assets.filter((asset) => asset.target !== target))
      expect((await command(["curl", "--disable", "--fail", "--silent", "--show-error", "--cacert", https.ca,
        "--connect-timeout", "10", "--max-time", "30", asset.url], box)).code).toBe(22)
    const requestStart = https.requests.length
    for (const [index, payload] of payloads.entries()) {
      await stopServices()
      const before = await activation(box)
      const cached = await snapshot(box.namespace)
      const cacheModes = await aurInventory(box.namespace)
      const recipe = distributionRecipes({ version: payload.version, assets: https.assets[index] }).aur
      expect(https.assets[index].find((asset) => asset.target === target)?.sha256).toBe(payload.archive.sha256)
      if (index === 0) {
        const untrustedDirectory = await recipeDirectory(`${payload.version}-untrusted-tls`, recipe, box)
        const untrustedStart = https.requests.length
        const untrusted = await makepkg(untrustedDirectory, ["--cleanbuild", "--force", "--noconfirm"], box)
        await Bun.write("/proof/evidence/makepkg-untrusted-tls.json", JSON.stringify(untrusted, null, 2))
        expect(untrusted.code, "AUR_MAKEPKG_MUST_REQUIRE_TRUSTED_CA").not.toBe(0)
        expect(untrusted.stderr, "AUR_MAKEPKG_TLS_CERTIFICATE_DIAGNOSTIC_REQUIRED").toContain("SSL certificate problem")
        expect(https.requests.slice(untrustedStart), "AUR_UNTRUSTED_MAKEPKG_MUST_NOT_REACH_HTTPS_HANDLER").toEqual([])
        expect(await activation(box)).toEqual(before)
        expect(await snapshot(box.namespace)).toEqual(cached)
        expect(await aurInventory(box.namespace)).toEqual(cacheModes)
      }
      const bad = await recipeDirectory(`${payload.version}-tampered`, recipe, box)
      const requestBefore = https.requests.length
      https.tamper.enabled = true
      const rejected = await makepkg(bad, ["--cleanbuild", "--force", "--noconfirm"], box, https.ca)
      await Bun.write(`/proof/evidence/checksum-${payload.version}.json`, JSON.stringify({
        version: payload.version, recipeSha256: sha256(recipe), expected: payload.archive.sha256,
        tampered: https.bytes[index].tamperedSha256, rejected, requests: https.requests.slice(requestBefore),
        activationBefore: serializable(before), activationAfter: serializable(await activation(box)),
      }, null, 2))
      expect(rejected.code, "AUR_TAMPERED_CHECKSUM_MUST_FAIL").not.toBe(0)
      expect(rejected.stdout + rejected.stderr).toContain("FAILED")
      expect(rejected.stdout + rejected.stderr).toContain("validity check")
      expect(sha256(await readFile(join(bad, `orchestra-${payload.version}-${target}.tar.gz`))),
        "AUR_CHECKSUM_CONTROL_MUST_CHECK_ACTUAL_DOWNLOADED_TAMPERED_BYTES").toBe(https.bytes[index].tamperedSha256)
      expect(https.requests.slice(requestBefore).some((request) => request.served && request.tampered &&
        request.version === payload.version && request.sha256 === https.bytes[index].tamperedSha256)).toBe(true)
      expect(await activation(box), "AUR_CHECKSUM_FAILURE_PRESERVES_FULL_INSTALL_AND_ACTIVATION").toEqual(before)
      expect(await snapshot(box.namespace), "AUR_CHECKSUM_FAILURE_PRESERVES_FULL_SKILL_CACHE").toEqual(cached)
      expect(await aurInventory(box.namespace), "AUR_CHECKSUM_FAILURE_PRESERVES_FULL_CACHE_MODES").toEqual(cacheModes)
      expect((await readdir(bad)).filter((name) => name.includes(".pkg.tar"))).toEqual([])
      for (const path of [join(bad, "pkg"), join(bad, "src")]) {
        const tree = await aurInventory(path)
        expect(!tree || tree.size === 1, "AUR_CHECKSUM_FAILURE_MUST_PRECEDE_EXTRACTION_AND_PACKAGE").toBe(true)
      }
      for (const [file, digest] of retained) expect(sha256(await readFile(file))).toBe(digest)
      if (index > 0) {
        await selected(payloads[index - 1])
        expect(await activation(box)).toEqual(before)
        expect(await snapshot(box.namespace)).toEqual(cached)
        expect(await aurInventory(box.namespace)).toEqual(cacheModes)
      }
      https.tamper.enabled = false
      const good = await recipeDirectory(`${payload.version}-trusted`, recipe, box)
      const acceptedStart = https.requests.length
      const accepted = await makepkg(good, ["--cleanbuild", "--force", "--noconfirm"], box, https.ca)
      await Bun.write(`/proof/evidence/makepkg-${payload.version}.json`, JSON.stringify({ accepted,
        requests: https.requests.slice(acceptedStart), recipe, recipeSha256: sha256(recipe) }, null, 2))
      expect(accepted.code, accepted.stderr).toBe(0)
      expect(await readFile(join(good, "PKGBUILD"), "utf8")).toBe(recipe)
      const download = join(good, `orchestra-${payload.version}-${target}.tar.gz`)
      expect(sha256(await readFile(download))).toBe(payload.archive.sha256)
      downloads.set(download, payload.archive.sha256)
      expect(https.requests.slice(acceptedStart).some((request) => request.served && !request.tampered &&
        request.version === payload.version && request.sha256 === payload.archive.sha256)).toBe(true)
      const packageList = await makepkg(good, ["--packagelist"], box, https.ca)
      expect(packageList.code, packageList.stderr).toBe(0)
      const paths = packageList.stdout.trim().split("\n")
      expect(paths, "AUR_FINAL_PACKAGE_LIST_MUST_HAVE_ONE_PACKAGE").toHaveLength(1)
      const filename = basename(paths[0])
      const prefix = `orchestra-bin-${payload.version}-1-${process.arch === "x64" ? "x86_64" : "aarch64"}.pkg.tar`
      expect(filename.startsWith(prefix), "AUR_FINAL_PACKAGE_TUPLE_MISMATCH").toBe(true)
      expect(["", ".zst", ".xz", ".gz", ".bz2", ".lz4", ".lrz", ".lzo", ".Z"], "AUR_PACKAGE_COMPRESSION_UNSUPPORTED")
        .toContain(filename.slice(prefix.length))
      expect(resolve(good, paths[0]), "AUR_FINAL_PACKAGE_OUTSIDE_OWNED_BUILD").toBe(join(good, filename))
      expect((await readdir(good)).filter((name) => name.includes(".pkg.tar"))).toEqual([filename])
      const file = join("/proof/packages", filename)
      await successful(["cp", "--", join(good, filename), file], box)
      retained.set(file, sha256(await readFile(file)))
      const extracted = join(good, "final-archive")
      await mkdir(extracted)
      await successful(["bsdtar", "--extract", "--file", file, "--directory", extracted, "--no-same-owner"], box)
      await aurFinalPackage(extracted, payload, recipe)
      if (index === 0) await aurInventoryTeeth(extracted, payload, recipe)
      state.attempted = true // An interrupted pacman operation still requires cleanup.
      await successful(["pacman", "-U", "--noconfirm", file], box, 120_000)
      expect(await successful(["pacman", "-Q", "orchestra-bin"], box)).toBe(`orchestra-bin ${payload.version}-1`)
      expect(await readlink(launcher)).toBe("/usr/lib/orchestra/bin/orchestra")
      expect(await realpath(launcher)).toBe("/usr/lib/orchestra/bin/orchestra")
      await aurPayload(payloadRoot, payload)
      await pacmanInventory(payload, box)
      expect(await snapshot(box.namespace), "AUR_PACMAN_INSTALL_MUST_NOT_EXTRACT_SKILLS").toEqual(cached)
      expect(await aurInventory(box.namespace)).toEqual(cacheModes)
      const root = await selected(payload, index === 1)
      caches.set(root, { bytes: await snapshot(root), inventory: await aurInventory(root) })
      await aurPayload(payloadRoot, payload)
      for (const [root, tree] of caches) {
        expect(await snapshot(root)).toEqual(tree.bytes)
        expect(await aurInventory(root)).toEqual(tree.inventory)
      }
      for (const [file, digest] of retained) expect(sha256(await readFile(file))).toBe(digest)
      for (const [file, digest] of downloads) expect(sha256(await readFile(file))).toBe(digest)
    }
    await stopServices()
    const cached = await snapshot(box.namespace)
    const cacheModes = await aurInventory(box.namespace)
    const first = payloads[0]
    const originalPackage = [...retained.keys()][0]
    if (!originalPackage) throw new Error("AUR_RETAINED_ORIGINAL_V1_PACKAGE_MISSING")
    expect(sha256(await readFile(originalPackage))).toBe(retained.get(originalPackage))
    // Real pacman downgrade of the original built package, never a rebuild/link swap.
    await successful(["pacman", "-U", "--noconfirm", originalPackage], box, 120_000)
    expect(await successful(["pacman", "-Q", "orchestra-bin"], box)).toBe(`orchestra-bin ${first.version}-1`)
    await aurPayload(payloadRoot, first)
    await pacmanInventory(first, box)
    expect(await readlink(launcher)).toBe("/usr/lib/orchestra/bin/orchestra")
    expect(await snapshot(box.namespace)).toEqual(cached)
    expect(await aurInventory(box.namespace)).toEqual(cacheModes)
    const rollbackRoot = await selected(first)
    await aurPayload(payloadRoot, first)
    expect(caches.has(rollbackRoot), "AUR_DOWNGRADE_REUSES_ORIGINAL_SKILL_CACHE").toBe(true)
    expect(await snapshot(box.namespace)).toEqual(cached)
    expect(await aurInventory(box.namespace)).toEqual(cacheModes)
    expect((await readdir(box.namespace)).sort()).toEqual(payloads.map((p) => skillIdentity(p.version, oracle)).sort())
    for (const [root, tree] of caches) {
      expect(await snapshot(root)).toEqual(tree.bytes)
      expect(await aurInventory(root)).toEqual(tree.inventory)
    }
    for (const [file, digest] of retained) expect(sha256(await readFile(file))).toBe(digest)
    for (const [file, digest] of downloads) expect(sha256(await readFile(file))).toBe(digest)
    for (const [index, payload] of payloads.entries()) {
      expect(await aurInventory(payload.payload), "AUR_RETAINED_PREPARED_SOURCE_CHANGED").toEqual(originals[index])
      expect(sha256(await readFile(payload.archive.file))).toBe(payload.archive.sha256)
    }
    expect(https.requests.slice(requestStart).filter((request) => !request.served), "AUR_MAKEPKG_WRONG_TARGET_FETCH")
      .toEqual([])
    state.qualified = true
    await Bun.write("/proof/evidence/qualified.json", JSON.stringify({ target, versions,
      architecture: machine(), distro: await readFile("/etc/os-release", "utf8"), launcher,
      finalPackages: [...retained].map(([file, sha256]) => ({ file, sha256 })),
      retainedDownloadedArchives: [...downloads].map(([file, sha256]) => ({ file, sha256 })),
      checksum: "real-makepkg-HTTPS-sha256-rejection-before-extraction",
      downgrade: "real-pacman-retained-original-v1-package", requests: https.requests.slice(requestStart),
      runtime: "public-compiled-CLI-version-TS-Python-independent-shipped-companions-authenticated-daemon-catalog-all-skill-reference-bytes",
    }, null, 2))
  } finally { await stopServices().finally(() => https.server.stop(true)) }
}, 1_800_000)

async function recipeDirectory(name: string, recipe: string, box: Awaited<ReturnType<typeof sandbox>>) {
  const directory = join("/proof/builds", name)
  await mkdir(directory)
  await Bun.write(join(directory, "PKGBUILD"), recipe)
  await successful(["chown", "-R", "builder:builder", directory], box)
  return directory
}

function makepkg(directory: string, args: string[], box: Awaited<ReturnType<typeof sandbox>>, ca?: string) {
  return command(["runuser", "-u", "builder", "--", "env", "-i", "HOME=/home/builder", "PATH=/usr/bin", "LANG=C.UTF-8",
    ...(ca ? [`CURL_CA_BUNDLE=${ca}`] : []), "makepkg", ...args], { ...box, cwd: directory }, 300_000)
}

async function activation(box: Awaited<ReturnType<typeof sandbox>>) {
  return { payload: await aurInventory(payloadRoot), launcher: await aurInventory(launcher),
    database: await Promise.all((await readdir("/var/lib/pacman/local")).filter((name) => name.startsWith("orchestra-bin-"))
      .sort().map(async (name) => ({ name, entries: await aurInventory(join("/var/lib/pacman/local", name)) }))),
    selected: await command(["pacman", "-Q", "orchestra-bin"], box) }
}

function serializable(value: Awaited<ReturnType<typeof activation>>) {
  return { payload: value.payload ? [...value.payload] : null, launcher: value.launcher ? [...value.launcher] : null,
    database: value.database.map((row) => ({ name: row.name, entries: row.entries ? [...row.entries] : null })),
    selected: value.selected }
}

async function pacmanInventory(payload: AurPayload, box: Awaited<ReturnType<typeof sandbox>>) {
  expect(await aurInventory(launcher), "AUR_INSTALLED_PUBLIC_SYMLINK_TEXT_AND_MODE")
    .toEqual(new Map([["", { kind: "symlink", mode: 0o777, link: "/usr/lib/orchestra/bin/orchestra" }]]))
  const listed = (await successful(["pacman", "-Qlq", "orchestra-bin"], box)).split("\n")
  const tree = await aurInventory(payload.payload)
  if (!tree || tree.size === 0 || listed.length === 0) throw new Error("AUR_PACMAN_INVENTORY_EMPTY")
  const expected = ["/usr/", "/usr/bin/", launcher, "/usr/lib/", ...[...tree].map(([path, entry]) =>
    `${payloadRoot}${path ? `/${path}` : ""}${entry.kind === "directory" ? "/" : ""}`)]
  expect(listed.toSorted(), "AUR_PACMAN_FULL_OWNED_INVENTORY").toEqual(expected.toSorted())
}
