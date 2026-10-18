import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { chmod, lstat, mkdir, mkdtemp, readdir, readlink, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { linuxRuntimeLibc, NATIVE_MACHINES, treeSitterBundle } from "@orchestra/script/tree-sitter-prebuilds"

export const os = process.platform === "darwin" ? "darwin" : "linux"
export const cpu = process.arch === "arm64" ? "arm64" : "x64"
export const target = `${os}-${cpu}${process.platform === "linux" && linuxRuntimeLibc().kind === "musl" ? "-musl" : ""}`
export const sha256 = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
export type Files = Record<string, string | Buffer>
export type Payload = { dir: string; archive: string; digest: string; version: string }
type Manifest = { schema: string; version: string; target: string; files: { path: string; sha256: string; executable: boolean }[] }

export async function command(args: string[], env?: Record<string, string | undefined>) {
  const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe", timeout: 15_000, env: { ...process.env, ...env } })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  return { code, stdout, stderr }
}

export async function isolated(run: (root: string, prefix: string) => Promise<void>) {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), "distribution-install-fixture-"))
  await run(root, path.join(root, "prefix")).finally(async () => {
    // Fixtures deliberately retain read-only and mode000 directories. Teardown
    // owns this entire temporary root, but must not traverse symlink targets.
    await restoreFixtureDirectories(root)
    await rm(root, { recursive: true, force: true })
  })
}

async function restoreFixtureDirectories(directory: string): Promise<void> {
  if (!(await lstat(directory)).isDirectory()) return
  await chmod(directory, 0o700)
  await Promise.all((await readdir(directory)).map((name) => restoreFixtureDirectories(path.join(directory, name))))
}

// Complete inert ELF64/Mach-O headers. Never loaded; not runtime qualification.
export function nativeHeader(arch = cpu, platform = os) {
  const bytes = Buffer.alloc(platform === "linux" ? 64 : 32)
  const machine = NATIVE_MACHINES[`${platform}-${arch}`]!
  if (platform === "linux") {
    bytes.writeUInt32BE(0x7f454c46)
    bytes[4] = 2; bytes[5] = 1; bytes[6] = 1
    bytes.writeUInt16LE(3, 16); bytes.writeUInt16LE(machine, 18)
    bytes.writeUInt32LE(1, 20); bytes.writeUInt16LE(64, 52)
    return bytes
  }
  bytes.writeUInt32LE(0xfeedfacf)
  bytes.writeUInt32LE(machine, 4); bytes.writeUInt32LE(arch === "x64" ? 3 : 0, 8); bytes.writeUInt32LE(6, 12)
  return bytes
}

export function fatHeader(arch = cpu, wide = false) {
  const step = wide ? 32 : 20
  const bytes = Buffer.alloc(8 + step + 32)
  bytes.writeUInt32BE(wide ? 0xcafebabf : 0xcafebabe)
  bytes.writeUInt32BE(1, 4); bytes.writeUInt32BE(NATIVE_MACHINES[`darwin-${arch}`]!, 8)
  bytes.writeUInt32BE(arch === "x64" ? 3 : 0, 12)
  if (wide) {
    bytes.writeBigUInt64BE(BigInt(8 + step), 16); bytes.writeBigUInt64BE(32n, 24)
  } else {
    bytes.writeUInt32BE(8 + step, 16); bytes.writeUInt32BE(32, 20)
  }
  nativeHeader(arch, "darwin").copy(bytes, 8 + step)
  return bytes
}

export function sourceFiles(version: string): Files {
  return {
    "package.json": JSON.stringify({ name: `@humangr/cli-${target}`, version, os: [os], cpu: [cpu] }),
    "bin/orchestra": `#!/bin/sh
set -eu
file=$0
while [ -L "$file" ]; do file="$(dirname "$file")/$(readlink "$file")"; done
[ "$#" -eq 1 ] && [ "$1" = --version ]
[ "$(cat "$(dirname "$file")/tree-sitter/tree-sitter/LICENSE")" = '${version}' ]
printf '%s\\n' '${version}'
`,
    "bin/hugr_omni.node": nativeHeader(),
    "bin/hugr-omni-supervisor": "#!/bin/sh\nexit 0\n",
    ...Object.fromEntries(treeSitterBundle({ os, arch: cpu }).map((name) => [
      `bin/tree-sitter/${name}`, name.endsWith(".node") ? nativeHeader() : version,
    ])),
  }
}

export async function writeFiles(dir: string, files: Files) {
  await Promise.all(Object.entries(files).map(async ([name, bytes]) => {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true })
    await Bun.write(path.join(dir, name), bytes)
  }))
}

export async function repack(payload: Omit<Payload, "digest">): Promise<Payload> {
  expect((await command(["tar", "-cf", payload.archive, "-C", payload.dir, "bin", "package.json", "distribution.json", "checksums.sha256"])).code).toBe(0)
  return { ...payload, digest: sha256(await Bun.file(payload.archive).bytes()) }
}

type TreeEntry = { path: string; kind: string; mode: number; bytes?: string; link?: string }

// Filesystem census, independent of the installer's descriptor/checksum inventory.
export async function snapshotTree(directory: string, relative = ""): Promise<TreeEntry[]> {
  const full = path.join(directory, relative)
  const info = await lstat(full)
  const mode = info.mode & 0o7777
  if (info.isSymbolicLink()) return [{ path: relative, kind: "link", mode, link: await readlink(full) }]
  if (info.isFile()) return [{ path: relative, kind: "file", mode, bytes: Buffer.from(await Bun.file(full).bytes()).toString("base64") }]
  expect(info.isDirectory()).toBe(true)
  return [{ path: relative, kind: "directory", mode }, ...(await Promise.all((await readdir(full)).sort()
    .map((name) => snapshotTree(directory, relative ? `${relative}/${name}` : name)))).flat()]
}

export async function installedTree(payload: Payload) {
  return (await snapshotTree(payload.dir)).map((entry) => ({ ...entry,
    mode: entry.kind === "directory" ? 0o700
      : ["bin/orchestra", "bin/hugr-omni-supervisor", "bin/extra tool"].includes(entry.path) ? 0o755 : 0o644,
  }))
}

export async function expectClean(prefix: string) {
  expect((await readdir(prefix)).filter((name) => name.startsWith(".install-"))).toEqual([])
}

export async function expectLauncher(prefix: string, version: string) {
  const result = await command([path.join(prefix, "bin/orchestra"), "--version"])
  expect(result.code).toBe(0)
  expect(result.stdout).toBe(`${version}\n`)
}

// Rewrite actual uncompressed tar directory records, not a chmod of the source
// (which would prevent a non-root tar producer from reading its descendants).
export async function modeZeroArchive(payload: Payload, directories: string[]) {
  const bytes = Buffer.from(await Bun.file(payload.archive).bytes())
  const found: string[] = []
  for (let offset = 0; offset + 512 <= bytes.length; ) {
    const header = bytes.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const name = header.subarray(0, 100).toString("ascii").split("\0")[0]!.replace(/\/$/, "")
    const size = Number.parseInt(header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim(), 8)
    expect(Number.isSafeInteger(size) && size >= 0).toBe(true)
    if (directories.includes(name)) {
      expect(header[156]).toBe(53) // ustar directory type '5'
      header.write("0000000\0", 100, "ascii")
      header.fill(32, 148, 156)
      header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0")}\0 `, 148, "ascii")
      found.push(name)
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  expect(found.sort()).toEqual([...directories].sort())
  await Bun.write(payload.archive, bytes)
  return { ...payload, digest: sha256(bytes) }
}

// Negative admission cases bypass producer deliberately; integrity tables remain internally consistent.
export async function fixture(root: string, version: string, mutate?: (files: Files) => void,
  descriptor?: (manifest: Manifest) => void, table?: (text: string) => string): Promise<Payload> {
  const files = sourceFiles(version)
  mutate?.(files)
  const manifest: Manifest = {
    schema: "orchestra-distribution-v1", version, target,
    files: Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, bytes]) => ({
      path: name, sha256: sha256(bytes), executable: ["bin/orchestra", "bin/hugr-omni-supervisor", "bin/extra tool"].includes(name),
    })),
  }
  descriptor?.(manifest)
  files["distribution.json"] = JSON.stringify(manifest)
  const checksums = Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([name, bytes]) => `${sha256(bytes)}  ${name}\n`).join("")
  files["checksums.sha256"] = table ? table(checksums) : checksums
  const dir = path.join(root, `payload-${version}`)
  await rm(dir, { recursive: true, force: true })
  await writeFiles(dir, files)
  return repack({ dir, archive: path.join(root, `${version}.tar`), version })
}

export async function producerFixture(root: string, version: string): Promise<Payload> {
  const { prepareDistribution, archiveDistribution } = await import("../../script/distribution-payload")
  const dist = path.join(root, `dist-${version}`)
  const source = path.join(dist, `cli-${target}`)
  const files = sourceFiles(version)
  files["bin/extra tool"] = "#!/bin/sh\nexit 0\n"
  files["bin/notes $(not-shell) 'safe' [ascii];=&!.txt"] = "data\n"
  files["package.json"] = JSON.stringify({ ...JSON.parse(String(files["package.json"])),
    revision: 42, fraction: -1.25e-7, unset: null, "unknown/key": [true, false, {}, [], "null\0back\bform\ftab\tquote\"slash\\\n雪😀"],
  }).replace('"version"', '"vers\\u0069on"').replace('"name"', '"n\\u0061me"').replace("雪😀", "\\u96ea\\ud83d\\ude00")
  await writeFiles(source, files)
  await Promise.all(["bin/orchestra", "bin/hugr-omni-supervisor", "bin/extra tool"].map((file) => chmod(path.join(source, file), 0o755)))
  const dir = path.join(root, `prepared-${version}`)
  await prepareDistribution({ dist, out: dir, target, version })
  const archive = await archiveDistribution({ directory: dir, file: path.join(root, `${version}.tar.gz`) })
  return { dir, archive: archive.file, digest: archive.sha256, version }
}

export function install(prefix: string, payload: Payload, extra: string[] = [], env?: Record<string, string | undefined>) {
  return command(["sh", path.resolve(import.meta.dirname, "../install.sh"), "--prefix", prefix, "--target", target,
    "--version", payload.version, "--archive", payload.archive, "--sha256", payload.digest, ...extra], env)
}

export function rollback(prefix: string, version: string, env?: Record<string, string | undefined>) {
  return command(["sh", path.resolve(import.meta.dirname, "../install.sh"), "--prefix", prefix, "--target", target, "--rollback", version], env)
}

// Raw ustar names/types; tar never sanitizes construction of hostile fixtures.
export function hostileTar(entries: { name: string; type?: string }[]) {
  return Buffer.concat([...entries.map((entry) => {
    const header = Buffer.alloc(512)
    header.write(entry.name, 0, 100, "ascii")
    header.write("0000644\0", 100, "ascii"); header.write("0000000\0", 108, "ascii"); header.write("0000000\0", 116, "ascii")
    header.write("00000000000\0", 124, "ascii"); header.write("00000000000\0", 136, "ascii")
    header.fill(32, 148, 156); header.write(entry.type ?? "0", 156, "ascii")
    header.write("bin/orchestra", 157, "ascii"); header.write("ustar\0", 257, "ascii"); header.write("00", 263, "ascii")
    header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0")}\0 `, 148, "ascii")
    return header
  }), Buffer.alloc(1024)])
}
