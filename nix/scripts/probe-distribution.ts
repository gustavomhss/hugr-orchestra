#!/usr/bin/env bun
// Deferred teeth for the real output checker. Mutate one copy of the real CLI,
// not a stub binary or production output. All files stay in the fresh evidence dir.
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { chmod, cp, mkdir, open, readFile, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { readCliManifest } from "../../packages/desktop/src/main/cli-artifacts"

const values = parseArgs({
  options: {
    source: { type: "string" },
    cli: { type: "string" },
    desktop: { type: "string" },
    system: { type: "string" },
    version: { type: "string" },
    "electron-version": { type: "string" },
    directory: { type: "string" },
  }, strict: true, allowPositionals: false,
}).values
if (!values.source || !values.cli || !values.directory) throw new Error("NIX_DISTRIBUTION_FAILURE:MISSING_PROBE_ARGUMENTS")
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
const params = Object.entries(values).filter(([key]) => key !== "directory" && key !== "cli").flatMap(
  ([key, value]) => [`--${key}`, value!],
)
const completed: string[] = []
function probe(name: string, expected?: string) {
  const result = spawnSync(process.execPath, ["--bun", join(values.source!, "nix/scripts/verify-distribution.ts"),
    ...params, "--cli", values.directory!], { encoding: "utf8", timeout: 180_000 })
  if (result.error || result.status === null) throw new Error(`NIX_DISTRIBUTION_FAILURE:PROBE_EXECUTION:${name}`)
  if (expected === undefined ? result.status !== 0 : result.status === 0 || !result.stderr.includes(expected))
    throw new Error(`NIX_DISTRIBUTION_FAILURE:PROBE_VERDICT:${name}:${result.stderr}`)
  completed.push(name)
  return writeFile(join(values.directory!, `${name}.json`), JSON.stringify({
    status: result.status, expected, stdout: result.stdout, stderr: result.stderr,
  }, null, 2) + "\n")
}
await probe("unchanged-real-copy")
await writeFile(join(raw, "manifest.json"), JSON.stringify({ ...receipt, artifacts: [] }))
await probe("empty-artifacts", "Invalid CLI manifest schema/version/artifacts")
await writeFile(join(raw, "manifest.json"), JSON.stringify({ ...receipt, version: `${receipt.version}-wrong` }))
await probe("wrong-version", "ARTIFACT_TUPLE_MISMATCH")
const wrongTarget = receipt.artifacts[0].target.includes("-x64-baseline")
  ? receipt.artifacts[0].target.replace("-x64-baseline", "-arm64")
  : receipt.artifacts[0].target.replace("-arm64", "-x64-baseline")
await writeFile(join(raw, "manifest.json"), JSON.stringify({
  ...receipt, artifacts: [{ ...receipt.artifacts[0], target: wrongTarget }],
}))
await probe("wrong-native-target", "ARTIFACT_TUPLE_MISMATCH")
await writeFile(join(raw, "manifest.json"), original)
await replaceHeader(Buffer.from([header[0] ^ 0xff]))
await probe("mutated-bytes", "CLI artifact digest mismatch:")
const digest = createHash("sha256").update(await readFile(file)).digest("hex")
await writeFile(join(raw, "manifest.json"), JSON.stringify({
  ...receipt, artifacts: [{ ...receipt.artifacts[0], sha256: digest }],
}))
await probe("wrong-image-with-valid-digest", "NATIVE_IMAGE_MISMATCH")
const wrongCPU = Buffer.from(header)
if (values.system?.endsWith("-linux")) wrongCPU.writeUInt16LE(header.readUInt16LE(18) === 62 ? 183 : 62, 18)
if (values.system?.endsWith("-darwin")) wrongCPU.writeUInt32LE(header.readUInt32LE(4) === 0x1000007 ? 0x100000c : 0x1000007, 4)
await replaceHeader(wrongCPU)
const cpuDigest = createHash("sha256").update(await readFile(file)).digest("hex")
await writeFile(join(raw, "manifest.json"), JSON.stringify({
  ...receipt, artifacts: [{ ...receipt.artifacts[0], sha256: cpuDigest }],
}))
await probe("wrong-cpu-with-valid-digest", "NATIVE_IMAGE_MISMATCH")
await replaceHeader(header)
await writeFile(join(raw, "manifest.json"), original)
await probe("restored-real-copy")
console.log(JSON.stringify({ status: "OUTPUT_NEGATIVE_CONTROLS_OK", completed }, null, 2))

async function replaceHeader(bytes: Buffer) {
  const handle = await open(file, "r+")
  // Linux rejects exec of a file held open for writing (ETXTBSY). Close before
  // invoking the real checker, including the unchanged/restored positive cases.
  await handle.write(bytes, 0, bytes.length, 0).finally(() => handle.close())
}
