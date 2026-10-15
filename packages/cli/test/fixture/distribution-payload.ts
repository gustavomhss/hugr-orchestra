import { createHash } from "node:crypto"
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

export const tuple = process.platform === "win32"
  ? process.arch === "arm64"
    ? { target: "windows-arm64", os: "win32" as const, arch: "arm64", machine: 0xaa64, foreignMachine: 0x8664, executable: "orchestra.exe", supervisor: "hugr-omni-supervisor.exe" }
    : { target: "windows-x64", os: "win32" as const, arch: "x64", machine: 0x8664, foreignMachine: 0xaa64, executable: "orchestra.exe", supervisor: "hugr-omni-supervisor.exe" }
  : { target: "linux-x64", os: "linux" as const, arch: "x64", machine: 62, foreignMachine: 183, executable: "orchestra", supervisor: "hugr-omni-supervisor" }

// Independent contract pin for the compiled CLI's required path family. Do not
// derive this fixture inventory from the producer's treeSitterBundle function.
export const treeSitterPaths = [
  "tree-sitter/package.json",
  "tree-sitter/LICENSE",
  "tree-sitter/index.js",
  `tree-sitter/prebuilds/${tuple.os}-${tuple.arch}/tree-sitter.node`,
  "tree-sitter-python/package.json",
  "tree-sitter-python/LICENSE",
  "tree-sitter-python/bindings/node/index.js",
  "tree-sitter-python/src/node-types.json",
  `tree-sitter-python/prebuilds/${tuple.os}-${tuple.arch}/tree-sitter-python.node`,
  "tree-sitter-typescript/package.json",
  "tree-sitter-typescript/LICENSE",
  "tree-sitter-typescript/bindings/node/index.js",
  "tree-sitter-typescript/typescript/src/node-types.json",
  "tree-sitter-typescript/tsx/src/node-types.json",
  `tree-sitter-typescript/prebuilds/${tuple.os}-${tuple.arch}/tree-sitter-typescript.node`,
].map((file) => `bin/tree-sitter/${file}`)

// Inert headers qualify image admission, never loadable addons or CLI runtime.
export function binding(machine = tuple.machine, endian: "little" | "big" = "little", os: "linux" | "win32" = tuple.os) {
  if (os === "win32") {
    const offset = 0x80
    const bytes = Buffer.alloc(offset + 24 + 240)
    bytes.writeUInt16LE(0x5a4d, 0)
    bytes.writeUInt32LE(offset, 0x3c)
    bytes.writeUInt32BE(0x50450000, offset)
    bytes.writeUInt16LE(machine, offset + 4)
    bytes.writeUInt16LE(240, offset + 20)
    bytes.writeUInt16LE(0x2022, offset + 22)
    bytes.writeUInt16LE(0x20b, offset + 24)
    return bytes
  }
  const bytes = Buffer.alloc(64)
  bytes.writeUInt32BE(0x7f454c46)
  bytes[4] = 2
  bytes[5] = endian === "little" ? 1 : 2
  if (endian === "little") bytes.writeUInt16LE(machine, 18)
  if (endian === "big") bytes.writeUInt16BE(machine, 18)
  return bytes
}

export async function payloadFixture(roots: string[], parent = tmpdir()) {
  const root = await mkdtemp(join(await realpath(parent), "distribution-payload-"))
  roots.push(root)
  const input = { dist: join(root, "dist"), out: join(root, "prepared"), version: "1.2.3", target: tuple.target }
  const source = join(input.dist, `cli-${tuple.target}`)
  await mkdir(join(source, "bin"), { recursive: true })
  await writeFile(join(source, "package.json"), JSON.stringify({ name: `@orchestra/cli-${tuple.target}`, version: input.version, os: [tuple.os], cpu: [tuple.arch] }))
  if (process.platform !== "win32") await chmod(join(source, "package.json"), 0o644)
  const files = [`bin/${tuple.executable}`, "bin/hugr_omni.node", `bin/${tuple.supervisor}`, "bin/extra/note.txt", ...treeSitterPaths]
  await Promise.all(files.map(async (file) => {
    const path = join(source, file)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, file.endsWith(".node") || file.endsWith(".exe") ? binding() : `inert fixture: ${file.slice(4)}\n`)
    if (process.platform !== "win32") await chmod(path, [`bin/${tuple.executable}`, `bin/${tuple.supervisor}`].includes(file) ? 0o755 : 0o644)
  }))
  return { input, source, root }
}

type Snapshot = { path: string; kind: "file" | "directory"; mode: number; bytes: Buffer; sha256: string }[]

// Independent filesystem oracle: includes directories, all file bytes and full
// modes. No descriptor or producer inventory supplies the traversal's members.
export async function payloadSnapshot(directory: string, relative = ""): Promise<Snapshot> {
  const path = join(directory, relative)
  const info = await lstat(path)
  if (!info.isDirectory() && !info.isFile()) throw new Error(`Unexpected snapshot member: ${path}`)
  const bytes = info.isFile() ? await readFile(path) : Buffer.alloc(0)
  const entry = { path: relative, kind: info.isFile() ? "file" as const : "directory" as const, mode: info.mode, bytes, sha256: createHash("sha256").update(bytes).digest("hex") }
  if (info.isFile()) return [entry]
  return [entry, ...(await Promise.all((await readdir(path)).sort().map((name) =>
    payloadSnapshot(directory, relative ? `${relative}/${name}` : name)))).flat()]
}
