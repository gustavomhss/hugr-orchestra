#!/usr/bin/env bun
// Deferred teeth for the real output checker. Mutate one copy of the real CLI,
// not a stub binary or production output. All files stay in the fresh evidence dir.
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { chmod, cp, mkdir, open, readFile, rename, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, relative } from "node:path"
import { parseArgs } from "node:util"
import { readCliManifest } from "../../packages/desktop/src/main/cli-artifacts"

/* CONTROL_LEDGER_BEGIN
{
  "unchanged-real-copy": null,
  "empty-artifacts": "INVALID_ARTIFACT_LIST",
  "wrong-version": "ARTIFACT_TUPLE_MISMATCH",
  "wrong-native-target": "ARTIFACT_TUPLE_MISMATCH",
  "mutated-bytes": "ARTIFACT_DIGEST_MISMATCH",
  "wrong-image-with-valid-digest": "NATIVE_IMAGE_MISMATCH",
  "wrong-cpu-with-valid-digest": "NATIVE_IMAGE_MISMATCH",
  "restored-real-copy": null,
  "packaged-pty-fixture-unchanged": null,
  "missing-packaged-pty-binding": "PTY_BINDING_MISSING",
  "broken-packaged-pty-entrypoint": "PTY_ENTRYPOINT_BROKEN",
  "packaged-pty-fixture-restored": null
}
CONTROL_LEDGER_END */
const ledger: Readonly<Record<string, string | null>> = Object.freeze(JSON.parse(
  (await Bun.file(import.meta.path).text()).split("/* CONTROL_LEDGER_BEGIN\n")[1].split("\nCONTROL_LEDGER_END */")[0],
))

const values = parseArgs({
  options: {
    source: { type: "string" },
    cli: { type: "string" },
    desktop: { type: "string" },
    system: { type: "string" },
    version: { type: "string" },
    "electron-version": { type: "string" },
    directory: { type: "string" },
    modules: { type: "string" },
  }, strict: true, allowPositionals: false,
}).values
if (!values.source || !values.cli || !values.desktop || !values.directory || !values.modules)
  throw new Error("NIX_DISTRIBUTION_FAILURE:MISSING_PROBE_ARGUMENTS")
await mkdir(values.directory) // no recursive mkdir: reject reuse/missing parent
const raw = join(values.directory, "share/orchestra/cli")
await mkdir(join(values.directory, "share/orchestra"), { recursive: true })
await cp(join(values.cli, "share/orchestra/cli"), raw, { recursive: true })
await chmod(raw, 0o755)
await chmod(join(raw, "manifest.json"), 0o644)
await symlink(join(values.cli, "bin"), join(values.directory, "bin"))
await Promise.all(["bash-completion", "zsh"].map((directory) =>
  symlink(join(values.cli!, "share", directory), join(values.directory!, "share", directory)),
))
await symlink(join(values.cli, "share/orchestra/schema.json"), join(values.directory, "share/orchestra/schema.json"))
const original = await readFile(join(raw, "manifest.json"))
const receipt = await readCliManifest(raw)
if (!Array.isArray(receipt.artifacts) || receipt.artifacts.length !== 1) throw new Error("NIX_DISTRIBUTION_FAILURE:PROBE_SOURCE_TUPLE")
const file = join(raw, receipt.artifacts[0].file)
await chmod(file, 0o755)
const header = Buffer.from(await Bun.file(file).slice(0, 64).arrayBuffer())
const params = Object.entries(values).filter(([key]) => !["directory", "cli", "desktop", "modules"].includes(key)).flatMap(
  ([key, value]) => [`--${key}`, value!],
)
const completed: string[] = []
async function probe(name: string, desktop = values.desktop!) {
  if (!(name in ledger) || completed.includes(name)) throw new Error(`NIX_DISTRIBUTION_FAILURE:UNDECLARED_CONTROL:${name}`)
  const expected = ledger[name]
  const result = spawnSync(process.execPath, ["--bun", join(values.source!, "nix/scripts/verify-distribution.ts"),
    ...params, "--cli", values.directory!, "--desktop", desktop], { encoding: "utf8", timeout: 180_000 })
  if (result.error || result.status === null) throw new Error(`NIX_DISTRIBUTION_FAILURE:PROBE_EXECUTION:${name}`)
  const verdict: { status: string; failureCode?: string; pty?: { resolved: string; bindings: string[] } } = JSON.parse(result.stdout)
  if (expected === null ? result.status !== 0 || verdict.status !== "NATIVE_OUTPUT_CHECK_OK"
    : result.status !== 1 || verdict.status !== "NATIVE_OUTPUT_CHECK_FAILED" || verdict.failureCode !== expected)
    throw new Error(`NIX_DISTRIBUTION_FAILURE:PROBE_VERDICT:${name}:${result.stderr}`)
  completed.push(name)
  await writeFile(join(values.directory!, `${name}.json`), JSON.stringify({
    status: result.status, expected, verdict, stdout: result.stdout, stderr: result.stderr,
  }, null, 2) + "\n")
  return verdict
}
await probe("unchanged-real-copy")
await writeFile(join(raw, "manifest.json"), JSON.stringify({ ...receipt, artifacts: [] }))
await probe("empty-artifacts")
await writeFile(join(raw, "manifest.json"), JSON.stringify({ ...receipt, version: `${receipt.version}-wrong` }))
await probe("wrong-version")
const wrongTarget = receipt.artifacts[0].target.includes("-x64-baseline")
  ? receipt.artifacts[0].target.replace("-x64-baseline", "-arm64")
  : receipt.artifacts[0].target.replace("-arm64", "-x64-baseline")
await writeFile(join(raw, "manifest.json"), JSON.stringify({
  ...receipt, artifacts: [{ ...receipt.artifacts[0], target: wrongTarget }],
}))
await probe("wrong-native-target")
await writeFile(join(raw, "manifest.json"), original)
await replaceHeader(Buffer.from([header[0] ^ 0xff]))
await probe("mutated-bytes")
const digest = createHash("sha256").update(await readFile(file)).digest("hex")
await writeFile(join(raw, "manifest.json"), JSON.stringify({
  ...receipt, artifacts: [{ ...receipt.artifacts[0], sha256: digest }],
}))
await probe("wrong-image-with-valid-digest")
const wrongCPU = Buffer.from(header)
if (values.system?.endsWith("-linux")) wrongCPU.writeUInt16LE(header.readUInt16LE(18) === 62 ? 183 : 62, 18)
if (values.system?.endsWith("-darwin")) wrongCPU.writeUInt32LE(header.readUInt32LE(4) === 0x1000007 ? 0x100000c : 0x1000007, 4)
await replaceHeader(wrongCPU)
const cpuDigest = createHash("sha256").update(await readFile(file)).digest("hex")
await writeFile(join(raw, "manifest.json"), JSON.stringify({
  ...receipt, artifacts: [{ ...receipt.artifacts[0], sha256: cpuDigest }],
}))
await probe("wrong-cpu-with-valid-digest")
await replaceHeader(header)
await writeFile(join(raw, "manifest.json"), original)
await probe("restored-real-copy")
// Repack the real archive only in this private fixture. Its package entrypoint
// and native binding are tested through Electron's actual ASAR module resolver.
const fixture = join(values.directory, "desktop")
const resourceSuffix = values.system?.endsWith("-darwin")
  ? "Applications/HuGR Orchestra.app/Contents/Resources" : "opt/orchestra-desktop/resources"
const resources = join(fixture, resourceSuffix)
await mkdir(resources, { recursive: true })
await cp(join(values.desktop, resourceSuffix, "cli"), join(resources, "cli"), { recursive: true })
await symlink(join(values.desktop, resourceSuffix, "icons"), join(resources, "icons"))
await symlink(join(values.desktop, "share"), join(fixture, "share"))
const executableSuffix = values.system?.endsWith("-darwin")
  ? "Applications/HuGR Orchestra.app/Contents/MacOS/HuGR Orchestra" : "opt/orchestra-desktop/ai.hugr.orchestra"
await mkdir(dirname(join(fixture, executableSuffix)), { recursive: true })
await symlink(join(values.desktop, executableSuffix), join(fixture, executableSuffix))
const require = createRequire(join(values.modules, "node_modules/.bun/node_modules/nix-probe.cjs"))
const { createPackageWithOptions, extractAll } = await import(require.resolve("@electron/asar"))
const extracted = join(values.directory, "extracted-asar")
extractAll(join(values.desktop, resourceSuffix, "app.asar"), extracted)
await createPackageWithOptions(extracted, join(resources, "app.asar"), { unpack: "**/*.node" })
const baseline = await probe("packaged-pty-fixture-unchanged", fixture)
if (!baseline.pty?.bindings.length) throw new Error("NIX_DISTRIBUTION_FAILURE:PTY_FIXTURE_SETUP")
const bindings = baseline.pty.bindings.map((file) => {
  const suffix = relative(join(resources, file.startsWith(join(resources, "app.asar.unpacked") + "/")
    ? "app.asar.unpacked" : "app.asar"), file)
  if (suffix.startsWith("..")) throw new Error("NIX_DISTRIBUTION_FAILURE:PTY_FIXTURE_BINDING_ESCAPE")
  return join(resources, "app.asar.unpacked", suffix)
})
await Promise.all(bindings.map((file) => rename(file, `${file}.held`)))
await probe("missing-packaged-pty-binding", fixture)
await Promise.all(bindings.map((file) => rename(`${file}.held`, file)))
const entry = join(extracted, relative(join(resources, baseline.pty.resolved.startsWith(join(resources, "app.asar.unpacked") + "/")
  ? "app.asar.unpacked" : "app.asar"), baseline.pty.resolved))
const entryBytes = await readFile(entry)
await chmod(entry, 0o644)
await writeFile(entry, 'throw new Error("NIX_PTY_ENTRYPOINT_CONTROL")\n')
await createPackageWithOptions(extracted, join(resources, "app.asar"), { unpack: "**/*.node" })
await probe("broken-packaged-pty-entrypoint", fixture)
await writeFile(entry, entryBytes)
await createPackageWithOptions(extracted, join(resources, "app.asar"), { unpack: "**/*.node" })
await probe("packaged-pty-fixture-restored", fixture)
if (completed.length !== Object.keys(ledger).length || Object.keys(ledger).some((name) => !completed.includes(name)))
  throw new Error("NIX_DISTRIBUTION_FAILURE:INCOMPLETE_OUTPUT_CONTROLS")
console.log(JSON.stringify({ status: "OUTPUT_NEGATIVE_CONTROLS_OK", completed }, null, 2))

async function replaceHeader(bytes: Buffer) {
  const handle = await open(file, "r+")
  // Linux rejects exec of a file held open for writing (ETXTBSY). Close before
  // invoking the real checker, including the unchanged/restored positive cases.
  await handle.write(bytes, 0, bytes.length, 0).finally(() => handle.close())
}
