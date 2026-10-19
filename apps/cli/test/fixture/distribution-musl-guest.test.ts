import { afterAll, expect, test } from "bun:test"
import { copyFile, lstat, readFile, readlink, realpath, writeFile } from "node:fs/promises"
import { machine } from "node:os"
import { dirname, join, resolve } from "node:path"
import { Schema } from "effect"
import { exportTreeSitter, inspectElf, NATIVE_MACHINES, requireElfLibc, requireTreeSitterBundle } from "@orchestra/script/tree-sitter-prebuilds"
import { omniTargets } from "@orchestra/script/omni"
import { expectSpawn } from "../../../../packages/core/test/fixture/omni-expect"
import { buildVersions, cli, command, nativeLibc, sandbox, sha256, snapshot, successful, target, versions } from "./distribution-native"
import { curlChannel } from "./distribution-native-curl"
import { npmChannel } from "./distribution-native-npm"
import { emergencyStop, stopServices } from "./distribution-native-proof"
import { muslPayloadAbi } from "./distribution-musl/abi"
import { muslPrefixReceipt } from "./distribution-musl/prefix"

const Input = Schema.Struct({ target: Schema.String, sourceSHA: Schema.String, treeHash: Schema.String, bundleSha256: Schema.String,
  image: Schema.String, cpu: Schema.String, controls: Schema.Array(Schema.Struct({ file: Schema.String, sha256: Schema.String })) })
const state = { started: false, qualified: false }
const interrupt = () => { void stopServices().then(() => process.exit(1), () => process.exit(1)) }

afterAll(async () => {
  if (!state.started) return
  await stopServices()
  process.off("exit", emergencyStop)
  process.off("SIGINT", interrupt)
  process.off("SIGTERM", interrupt)
  process.off("SIGHUP", interrupt)
  await Bun.write("/proof/evidence/guest-cleanup.json", JSON.stringify({ qualified: state.qualified,
    daemons: "shared-owned-receipts-and-PID-exit-proved" }, null, 2))
}, 120_000)

test("MUSL-GUEST actual native musl compile and real curl/npm lifecycle with full native runtime oracles", async () => {
  expectSpawn(import.meta.path)
  if (process.env.ORCHESTRA_MUSL_GUEST !== "owned" || process.platform !== "linux" || process.getuid?.() !== 0 ||
      !(await Bun.file("/.dockerenv").exists()) || nativeLibc?.kind !== "musl") throw new Error("MUSL_OWNED_NATIVE_GUEST_REQUIRED")
  if (process.versions.bun !== "1.3.14" || !["x64", "arm64"].includes(process.arch)) throw new Error("MUSL_GUEST_BUN_ABI_MISMATCH")
  expect(await realpath("/proc/self/exe")).toBe(await realpath("/proof/tools/bun"))
  expect(await realpath(resolve(cli, "../.."))).toBe("/proof/source")
  expect(/^ID=alpine$/m.test(await readFile("/etc/os-release", "utf8"))).toBe(true)
  const input = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Input)))(await readFile("/proof/input.json", "utf8"))
  expect(input.target).toBe(target)
  expect(omniTargets[target]?.enabled, "MUSL_PRODUCTION_OMNI_TARGET_NOT_ENABLED").toBe(true)
  expect(input.cpu).toBe(process.arch === "x64" ? "x86_64" : "aarch64")
  expect([input.cpu, process.arch]).toContain(machine())
  expect(sha256(await readFile("/proof/source.bundle"))).toBe(input.bundleSha256)
  const box = await sandbox("/proof/runtime")
  expect(await successful(["uname", "-m"], box)).toBe(input.cpu)
  expect(await successful(["git", "rev-parse", "HEAD"], { ...box, cwd: "/proof/source" })).toBe(input.sourceSHA)
  expect(await successful(["git", "rev-parse", "HEAD^{tree}"], { ...box, cwd: "/proof/source" })).toBe(input.treeHash)
  state.started = true
  process.once("exit", emergencyStop)
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  process.once("SIGHUP", interrupt)
  const source = await sourceReceipt(box)
  // Positive control on the exact source census used for post-build preservation.
  const sentinel = join(cli, "test/fixture/distribution-musl-guest.test.ts")
  const original = await readFile(sentinel)
  expect(source.find((file) => file.path === "apps/cli/test/fixture/distribution-musl-guest.test.ts")?.sha256)
    .toBe(sha256(original))
  try {
    await writeFile(sentinel, Buffer.concat([original, Buffer.from("\n// source census mutation\n")]))
    const dirty = await command(["git", "diff", "--no-ext-diff", "--exit-code", "HEAD", "--"], { ...box, cwd: "/proof/source" })
    expect(dirty.code).toBe(1)
    expect(dirty.stdout).toContain("// source census mutation")
  } finally { await writeFile(sentinel, original) }
  expect(await sourceReceipt(box)).toEqual(source)
  await Bun.write("/proof/evidence/source-before.json", JSON.stringify({ sourceSHA: input.sourceSHA, treeHash: input.treeHash, files: source }, null, 2))
  expect(input.controls.map((control) => control.file).sort()).toEqual(["glibc-addon.node", "glibc-bun"])
  // glibc-bun is an ELF-admission control only, never launched here. Actual
  // incompatible addon/parser execution controls live in muslPayloadAbi().
  for (const control of input.controls) {
    expect(sha256(await readFile(`/proof/controls/${control.file}`))).toBe(control.sha256)
    expect(requireElfLibc(`/proof/controls/${control.file}`, "glibc").machine).toBe(NATIVE_MACHINES[`linux-${process.arch}`])
    expect(() => requireElfLibc(`/proof/controls/${control.file}`, "musl")).toThrow("ELF_LIBC_MISMATCH")
  }
  const wrongTarget = target.replace(/-musl$/, "")
  const wrongHost = await command([process.execPath, "script/runtime-proof.ts", "--target", wrongTarget, "--host"], { ...box, cwd: cli })
  expect(wrongHost.code).not.toBe(0)
  expect(wrongHost.stderr).toContain("NATIVE_HOST_LIBC_MISMATCH")
  const producer = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
    id: Schema.String, source: Schema.Struct({ headSHA: Schema.String, treeHash: Schema.String, omniTreeHash: Schema.String }),
    checks: Schema.Struct({ existingMuslGuest: Schema.Struct({ cpu: Schema.String, library: Schema.String }) }),
    sha256: Schema.Record(Schema.String, Schema.String),
  }))))(await readFile("/proof/evidence/omni-producer.json", "utf8"))
  expect(producer.id).toBe(`linux-${process.arch}-musl`)
  expect(producer.source.headSHA).toBe(input.sourceSHA)
  expect(producer.source.treeHash).toBe(input.treeHash)
  expect(producer.source.omniTreeHash).toBe(await successful(["git", "rev-parse", "HEAD:native/omni"], { ...box, cwd: "/proof/source" }))
  expect(producer.checks.existingMuslGuest.cpu).toBe(input.cpu)
  expect(producer.checks.existingMuslGuest.library).toBe(nativeLibc.library)
  for (const [file, digest] of Object.entries(producer.sha256)) {
    expect(["hugr_omni.node", "hugr-omni-supervisor"]).toContain(file)
    expect(sha256(await readFile(`/proof/omni-artifacts/${producer.id}/${file}`))).toBe(digest)
  }
  expect(Object.keys(producer.sha256).sort()).toEqual(["hugr-omni-supervisor", "hugr_omni.node"])
  const python = join(await realpath(dirname(Bun.resolveSync("tree-sitter-python/package.json", resolve(cli, "../../modules/maestro/arsenal")))),
    "prebuilds", `linux-${process.arch}`, "tree-sitter-python.node")
  expect(requireElfLibc(python, "glibc").machine).toBe(NATIVE_MACHINES[`linux-${process.arch}`])
  await copyFile(python, "/proof/controls/glibc-python.node")
  const parsers = exportTreeSitter({ root: "/proof/source", os: "linux", arch: process.arch, abi: "musl", out: "/proof/parser-artifacts" })
  expect(parsers.target).toBe(`linux-${process.arch}-musl`)
  expect(parsers.files.filter((file) => file.endsWith(".node"))).toHaveLength(3)
  requireTreeSitterBundle(parsers.exported, { os: "linux", arch: process.arch, abi: "musl" })
  expect(() => requireTreeSitterBundle(parsers.exported, { os: "linux", arch: process.arch })).toThrow("ELF_LIBC_MISMATCH")
  await Bun.write("/proof/evidence/parser-producer.json", JSON.stringify(parsers, null, 2))
  const built = await buildVersions("/proof/builds", { omni: "/proof/omni-artifacts", treeSitter: "/proof/parser-artifacts", logs: "/proof/evidence" })
  expect(built.payloads.map((payload) => payload.version)).toEqual([...versions])
  const abi = []
  for (const payload of built.payloads) {
    abi.push(await muslPayloadAbi(payload.payload, payload.version, box))
    const rg = await command([process.execPath, join(cli, "script/ripgrep-proof.ts"), "--target", target,
      "--binary", join(payload.payload, "bin/orchestra"), "--ripgrep", join(payload.payload, "bin/ripgrep"), "--mutate"], box, 180_000)
    await Bun.write(`/proof/evidence/ripgrep-${payload.version}.json`, JSON.stringify(rg, null, 2))
    expect(rg.code, rg.stderr).toBe(0)
    expect(rg.stdout).toContain("RIPGREP_BUNDLE")
  }
  const wrongPrefix = "/proof/wrong-libc-prefix"
  const selectedPrefix = { target, version: built.payloads[0].version }
  expect(await muslPrefixReceipt(wrongPrefix, selectedPrefix)).toBeUndefined()
  const rejectWrongInstallerABI = async (prefix: string) => {
    const receipts = []
    const before = await muslPrefixReceipt(prefix, selectedPrefix)
    for (const args of [["--version", built.payloads[0].version, "--archive", built.payloads[0].archive.file,
      "--sha256", built.payloads[0].archive.sha256], ["--rollback", built.payloads[0].version]]) {
      const refused = await command(["sh", join(cli, "distribution/install.sh"), "--prefix", prefix, "--target", wrongTarget, ...args], box)
      expect(refused.code, "MUSL_INSTALLER_GLIBC_REQUEST_MUST_FAIL").toBe(1)
      expect(refused.stderr).toContain("target does not match host libc")
      expect(await muslPrefixReceipt(prefix, selectedPrefix), "MUSL_WRONG_ABI_MUST_NOT_TOUCH_PREFIX_OR_LOCK").toEqual(before)
      receipts.push({ prefix, target: wrongTarget, refused, existed: before !== undefined })
    }
    return receipts
  }
  const freshInstallerAbi = await rejectWrongInstallerABI(wrongPrefix)
  await curlChannel("/proof/channels", built)
  const installerAbi = [...freshInstallerAbi, ...await rejectWrongInstallerABI("/proof/channels/curl/prefix")]
  await Bun.write("/proof/evidence/installer-abi.json", JSON.stringify({ actual: nativeLibc, installerAbi }, null, 2))
  const curlBox = await sandbox("/proof/channels/curl")
  for (const payload of built.payloads) abi.push(await muslPayloadAbi(`/proof/channels/curl/prefix/versions/${payload.version}-${target}`,
    payload.version, curlBox, payload.version === versions[1]))
  await npmChannel("/proof/channels", built, async (installed) => {
    abi.push(await muslPayloadAbi(installed.payload, installed.version, installed.box, installed.version === versions[1]))
  })
  for (const payload of built.payloads) {
    expect(await snapshot(payload.payload)).toEqual(payload.snapshot)
    expect(sha256(await readFile(payload.archive.file))).toBe(payload.archive.sha256)
  }
  await stopServices()
  const after = await sourceReceipt(box)
  expect(after).toEqual(source)
  await Bun.write("/proof/evidence/source-after.json", JSON.stringify({ sourceSHA: input.sourceSHA, treeHash: input.treeHash, files: after }, null, 2))
  await Bun.write("/proof/evidence/abi-controls.json", JSON.stringify({ libc: nativeLibc, wrongHost, controls: input.controls, abi }, null, 2))
  await Bun.write("/proof/evidence/payloads.json", JSON.stringify(built.payloads.map((payload) => ({ version: payload.version,
    manifest: payload.manifest, archive: payload.archive, executable: inspectElf(join(payload.payload, "bin/orchestra")) })), null, 2))
  state.qualified = true
  await Bun.write("/proof/evidence/qualified.json", JSON.stringify({ target, sourceSHA: input.sourceSHA, versions,
    architecture: input.cpu, libc: "musl", channels: ["curl", "npm"] }, null, 2))
}, 3_600_000)

async function sourceReceipt(box: Awaited<ReturnType<typeof sandbox>>) {
  const sourceBox = { ...box, cwd: "/proof/source" }
  expect(await successful(["git", "diff", "--no-ext-diff", "--exit-code", "HEAD", "--"], sourceBox)).toBe("")
  const files = (await successful(["git", "ls-files", "--stage", "-z"], sourceBox)).split("\0").filter(Boolean)
  if (!files.length) throw new Error("MUSL_SOURCE_CENSUS_EMPTY")
  const receipt = []
  for (const entry of files) {
    const match = /^(\d+) ([a-f0-9]{40}) 0\t([^\0]+)$/.exec(entry)
    if (!match || !["100644", "100755", "120000"].includes(match[1]) || match[3].split("/").some((part) => ["", ".", ".."].includes(part)))
      throw new Error("MUSL_SOURCE_CENSUS_INVALID")
    const path = join("/proof/source", match[3])
    const stat = await lstat(path)
    if (stat.isSymbolicLink() !== (match[1] === "120000") || (!stat.isFile() && !stat.isSymbolicLink()))
      throw new Error(`MUSL_SOURCE_FILE_TYPE_CHANGED: ${path}`)
    receipt.push({ path: match[3], gitMode: match[1], gitObject: match[2], executable: Boolean(stat.mode & 0o111),
      sha256: sha256(stat.isSymbolicLink() ? await readlink(path) : await readFile(path)) })
  }
  return receipt
}
