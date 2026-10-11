#!/usr/bin/env bun
// Static OS floors of the pinned backend toolkit artifacts (F5.4). From packages/core:
//   bun script/toolkit-floors.ts [--engine <id> ...] [--runtime <id> ...] [--target <target> ...] [--json] [--files] [--check] [--cache <dir>]
// With no selection it measures every pack and runtime on every target. Each artifact is downloaded, checked against its
// pinned digest, unpacked, and every executable or shared object it installs is read without being run:
//   ELF    the highest GLIBC_x.y of its version needs, plus GLIBCXX and the ELF interpreter (musl is flagged).
//   Mach-O the minimum macOS (LC_BUILD_VERSION or LC_VERSION_MIN_MACOSX) of every slice.
//   PE     the highest Windows build among the imports that exist only on newer Windows (`NEWER_WINDOWS` below).
// The printed `floor` is what packs/*.ts and runtimes/*.ts record; `--check` exits 1 when a measurement differs from it. `source` engines are built by the host's own
// toolchain, so the binary they produce never leaves the machine that built it; their floor is the runtime's.
// A hosted engine records only what its install adds to its runtime: esbuild's binary for orval, the compiled wheels of
// datamodel-codegen. `script/toolkit-pack.ts bump` runs `--check` for the bumped pack.

import { $ } from "bun"
import { createHash } from "crypto"
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { parseArgs } from "util"
import { ENGINES, RUNTIMES, type Engine, type Runtime } from "../src/backend-toolkit/manifest"
import { TARGETS, compareVersions, type Floor, type TargetId } from "../src/backend-toolkit/target"
import { WHEELS } from "../src/backend-toolkit/packs/datamodel-codegen.wheels"
import orvalLock from "../src/backend-toolkit/packs/orval.package-lock.json"
import type { PinnedArtifact } from "../src/pinned-artifact"

type Finding = {
  file: string
  format: "elf" | "macho" | "pe"
  /** A glibc, macOS or Windows requirement this file sets, e.g. `glibc 2.17`. */
  needs: Partial<Floor>
  /** Informational: libstdc++ symbol versions, musl, static linking, platform. */
  notes: string[]
}

/** Win32 functions that a binary imports unconditionally, with the Windows 10 build that introduced each. */
const NEWER_WINDOWS: Readonly<Record<string, string>> = {
  SetThreadDescription: "10.0.14393",
  GetThreadDescription: "10.0.14393",
  CreatePseudoConsole: "10.0.17763",
  ResizePseudoConsole: "10.0.17763",
  ClosePseudoConsole: "10.0.17763",
}

const higher = (a: string | undefined, b: string | undefined) => (!a || (b && compareVersions(b, a) > 0) ? b : a)

export function scan(file: string, bytes: Buffer): Finding | undefined {
  if (bytes.length < 64) return
  if (bytes.readUInt32BE(0) === 0x7f454c46) return elf(file, bytes)
  const magic = bytes.readUInt32LE(0)
  if (magic === 0xfeedfacf) return macho(file, [bytes])
  // Java class files share the fat magic; a fat header's slices are real Mach-O images.
  if (bytes.readUInt32BE(0) === 0xcafebabe && bytes.readUInt32BE(4) < 16) {
    const slices = Array.from({ length: bytes.readUInt32BE(4) }, (_, index) => {
      const offset = bytes.readUInt32BE(16 + index * 20)
      const size = bytes.readUInt32BE(20 + index * 20)
      return bytes.subarray(offset, offset + size)
    })
    return slices.every((slice) => slice.length > 32 && slice.readUInt32LE(0) === 0xfeedfacf) ? macho(file, slices) : undefined
  }
  if (bytes.readUInt16LE(0) === 0x5a4d) return pe(file, bytes)
}

function version(value: string, prefix: string) {
  return value.startsWith(prefix) ? value.slice(prefix.length) : undefined
}

function elf(file: string, bytes: Buffer): Finding | undefined {
  // The toolkit targets are all 64-bit little-endian.
  if (bytes[4] !== 2 || bytes[5] !== 1) return
  const strings = (offset: number) => bytes.toString("utf8", offset, bytes.indexOf(0, offset))
  const phoff = Number(bytes.readBigUInt64LE(0x20))
  const interpreter = Array.from({ length: bytes.readUInt16LE(0x38) }, (_, index) => phoff + index * bytes.readUInt16LE(0x36))
    .filter((offset) => bytes.readUInt32LE(offset) === 3)
    .map((offset) => strings(Number(bytes.readBigUInt64LE(offset + 8))))[0]
  const shoff = Number(bytes.readBigUInt64LE(0x28))
  const sections = Array.from({ length: bytes.readUInt16LE(0x3c) }, (_, index) => {
    const offset = shoff + index * bytes.readUInt16LE(0x3a)
    return {
      type: bytes.readUInt32LE(offset + 4),
      offset: Number(bytes.readBigUInt64LE(offset + 0x18)),
      size: Number(bytes.readBigUInt64LE(offset + 0x20)),
      link: bytes.readUInt32LE(offset + 0x28),
      info: bytes.readUInt32LE(offset + 0x2c),
    }
  })
  const highest: Record<string, string | undefined> = {}
  for (const section of sections.filter((item) => item.type === 0x6ffffffe)) {
    const names = sections[section.link]?.offset ?? 0
    let need = section.offset
    for (let index = 0; index < section.info; index++) {
      const count = bytes.readUInt16LE(need + 2)
      let aux = need + bytes.readUInt32LE(need + 8)
      for (let item = 0; item < count; item++) {
        const name = strings(names + bytes.readUInt32LE(aux + 8))
        const key = name.split("_")[0]
        const number = name.split("_").slice(1).join("_")
        // GLIBC_PRIVATE and the like are not versions.
        if (/^\d/.test(number)) highest[key] = higher(highest[key], number)
        aux += bytes.readUInt32LE(aux + 12)
      }
      need += bytes.readUInt32LE(need + 12)
    }
  }
  const needed = sections
    .filter((item) => item.type === 6)
    .flatMap((dynamic) =>
      Array.from({ length: dynamic.size / 16 }, (_, index) => dynamic.offset + index * 16)
        .filter((offset) => bytes.readBigUInt64LE(offset) === 1n)
        .map((offset) => strings((sections[dynamic.link]?.offset ?? 0) + Number(bytes.readBigUInt64LE(offset + 8)))),
    )
  const notes = [
    ...(interpreter?.includes("musl") ? ["musl"] : []),
    ...(!interpreter && !needed.length ? ["static"] : []),
    ...(highest.GLIBCXX ? [`GLIBCXX ${highest.GLIBCXX}`] : []),
    ...(highest.CXXABI ? [`CXXABI ${highest.CXXABI}`] : []),
    ...(highest.GCC ? [`GCC ${highest.GCC}`] : []),
    ...(needed.some((name) => name.startsWith("libstdc++")) ? [] : highest.GLIBCXX ? ["libstdc++ symbols without libstdc++.so"] : []),
  ]
  return { file, format: "elf", needs: highest.GLIBC ? { glibc: highest.GLIBC } : {}, notes }
}

function macho(file: string, slices: ReadonlyArray<Buffer>): Finding {
  const found = slices.map((slice) => {
    const arch = slice.readUInt32LE(4) === 0x0100000c ? "arm64" : slice.readUInt32LE(4) === 0x01000007 ? "x86_64" : "other"
    let offset = 32
    let minos: string | undefined
    for (let command = 0; command < slice.readUInt32LE(16); command++) {
      const kind = slice.readUInt32LE(offset)
      // LC_BUILD_VERSION: platform 1 is macOS; LC_VERSION_MIN_MACOSX carries the version alone.
      if (kind === 0x32 && slice.readUInt32LE(offset + 8) === 1) minos = packed(slice.readUInt32LE(offset + 12))
      if (kind === 0x24) minos = packed(slice.readUInt32LE(offset + 8))
      offset += slice.readUInt32LE(offset + 4)
    }
    return { arch, minos }
  })
  const highest = found.reduce<string | undefined>((all, item) => higher(all, item.minos), undefined)
  return {
    file,
    format: "macho",
    needs: highest ? { macos: highest } : {},
    notes: found.map((item) => `${item.arch} ${item.minos ?? "no-version"}`),
  }
}

// X.Y.Z packed as xxxx.yy.zz
const packed = (value: number) => `${value >> 16}.${(value >> 8) & 0xff}`

function pe(file: string, bytes: Buffer): Finding | undefined {
  const header = bytes.readUInt32LE(0x3c)
  if (header + 0x100 > bytes.length || bytes.readUInt32LE(header) !== 0x4550) return
  const optional = header + 24
  const plus = bytes.readUInt16LE(optional) === 0x20b
  const sections = Array.from({ length: bytes.readUInt16LE(header + 6) }, (_, index) => {
    const offset = optional + bytes.readUInt16LE(header + 20) + index * 40
    return { rva: bytes.readUInt32LE(offset + 12), size: Math.max(bytes.readUInt32LE(offset + 8), bytes.readUInt32LE(offset + 16)), raw: bytes.readUInt32LE(offset + 20) }
  })
  const at = (rva: number) => {
    const section = sections.find((item) => rva >= item.rva && rva < item.rva + item.size)
    return section ? rva - section.rva + section.raw : -1
  }
  const imports = bytes.readUInt32LE(optional + (plus ? 120 : 104))
  const names: string[] = []
  for (let descriptor = at(imports); descriptor > 0 && bytes.readUInt32LE(descriptor + 12) !== 0; descriptor += 20) {
    for (
      let thunk = at(bytes.readUInt32LE(descriptor) || bytes.readUInt32LE(descriptor + 16));
      thunk > 0 && Number(plus ? bytes.readBigUInt64LE(thunk) : bytes.readUInt32LE(thunk)) !== 0;
      thunk += plus ? 8 : 4
    ) {
      const value = Number(plus ? bytes.readBigUInt64LE(thunk) : bytes.readUInt32LE(thunk))
      const hint = plus ? value < 2 ** 63 : value < 2 ** 31
      if (hint) names.push(bytes.toString("latin1", at(value) + 2, bytes.indexOf(0, at(value) + 2)))
    }
  }
  const newer = names.filter((name) => name in NEWER_WINDOWS)
  const os = `${bytes.readUInt16LE(optional + 40)}.${bytes.readUInt16LE(optional + 42)}`
  const subsystem = `${bytes.readUInt16LE(optional + 48)}.${bytes.readUInt16LE(optional + 50)}`
  // A PE stamped 10.0 declares Windows 10 itself; older stamps (6.x) say nothing, since toolchains default to them.
  const stamped = compareVersions(os, "10.0") >= 0 || compareVersions(subsystem, "10.0") >= 0 ? "10.0" : undefined
  const windows = newer.reduce<string | undefined>((all, name) => higher(all, NEWER_WINDOWS[name]), stamped)
  return {
    file,
    format: "pe",
    needs: windows ? { windows } : {},
    notes: [`os ${os}`, `subsystem ${subsystem}`, ...newer.map((name) => `imports ${name}`)],
  }
}

export function reduce(findings: ReadonlyArray<Finding>) {
  const floor: { -readonly [K in keyof Floor]: Floor[K] } = {}
  const setBy: Partial<Record<keyof Floor, string>> = {}
  for (const finding of findings)
    for (const key of ["glibc", "macos", "windows"] as const) {
      const value = finding.needs[key]
      if (value && higher(floor[key], value) !== floor[key]) {
        floor[key] = value
        setBy[key] = finding.file
      }
    }
  return { floor, setBy }
}

async function walk(directory: string): Promise<string[]> {
  const info = await stat(directory).catch(() => undefined)
  if (!info) return []
  if (!info.isDirectory()) return [directory]
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.filter((entry) => !entry.isSymbolicLink()).map((entry) => walk(path.join(directory, entry.name))),
    )
  ).flat()
}

// What the host never runs: fixtures under `testdata` (the Go tree ships dozens of foreign ELF, Mach-O and PE samples),
// linkable objects (`.syso`, `.o`, `.obj`) and, on a target, the binaries of the other operating systems (pip's Windows
// launchers sit in every Python tree).
const FORMAT: Record<string, Finding["format"]> = { darwin: "macho", linux: "elf", win32: "pe" }

async function findings(root: string, from: ReadonlyArray<string>, target: TargetId) {
  const files = (await Promise.all(from.map((item) => walk(path.join(root, item)))))
    .flat()
    .filter((file) => !/(^|\/)testdata\/|\.(syso|o|obj)$/.test(file))
  return (
    await Promise.all(
      files.map(async (file) => {
        const bytes = await readFile(file)
        return scan(path.relative(root, file), bytes)
      }),
    )
  ).filter((item): item is Finding => item?.format === FORMAT[target.split("-")[0]!])
}

async function download(url: string, integrity: string, cache: string) {
  const file = path.join(cache, createHash("sha256").update(url).digest("hex") + path.extname(new URL(url).pathname))
  const cached = await Bun.file(file).exists()
  const body = cached ? Buffer.from(await Bun.file(file).arrayBuffer()) : Buffer.from(await (await fetch(url)).arrayBuffer())
  const [algorithm, expected] = integrity.split("-", 2) as [string, string]
  if (createHash(algorithm).update(body).digest("base64") !== expected) throw new Error(`integrity mismatch: ${url}`)
  if (!cached) await writeFile(file, body)
  return file
}

async function unpack(file: string, url: string, format: PinnedArtifact.Artifact["format"], directory: string) {
  await mkdir(directory, { recursive: true })
  if (format === "raw") await copyFile(file, path.join(directory, path.basename(new URL(url).pathname)))
  else if (format === "zip") await $`unzip -q -o ${file} -d ${directory}`.quiet()
  else await $`tar -xzf ${file} -C ${directory}`.quiet()
}

async function artifact(item: PinnedArtifact.Artifact, cache: string, target: TargetId) {
  const directory = await mkdtemp(path.join(cache, "unpack-"))
  try {
    await unpack(await download(item.url, item.integrity, cache), item.url, item.format, directory)
    return await findings(directory, item.entries.map((entry) => entry.from), target)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const NODE_PLATFORM: Record<TargetId, { os: string; cpu: string }> = {
  "darwin-arm64": { os: "darwin", cpu: "arm64" },
  "darwin-x64": { os: "darwin", cpu: "x64" },
  "linux-arm64": { os: "linux", cpu: "arm64" },
  "linux-x64": { os: "linux", cpu: "x64" },
  "win32-x64": { os: "win32", cpu: "x64" },
}

/** The npm lock's packages that install only on this target (an `os`/`cpu` constraint), e.g. esbuild's binary. */
async function npmNative(lock: { packages: Record<string, { resolved?: string; integrity?: string; os?: string[]; cpu?: string[]; [key: string]: unknown }> }, target: TargetId, cache: string) {
  const platform = NODE_PLATFORM[target]
  const packages = Object.values(lock.packages).filter(
    (item) => item.os?.includes(platform.os) && item.cpu?.includes(platform.cpu) && item.resolved && item.integrity,
  )
  return (await Promise.all(packages.map((item) => artifact({ url: item.resolved!, integrity: item.integrity! as PinnedArtifact.Artifact["integrity"], format: "tar.gz", entries: [{ from: "package", to: "package" }] }, cache, target)))).flat()
}

const WHEEL_TAG: Record<TargetId, RegExp> = {
  "darwin-arm64": /macosx_\d+_\d+_arm64\.whl$/,
  "darwin-x64": /macosx_\d+_\d+_x86_64\.whl$/,
  "linux-arm64": /manylinux\w*_aarch64.*\.whl$/,
  "linux-x64": /manylinux\w*_x86_64.*\.whl$/,
  "win32-x64": /win_amd64\.whl$/,
}

/** The compiled wheels pip would pick on this target; PyPI's file index resolves each pinned filename to its URL. */
async function wheels(target: TargetId, cache: string) {
  const picked = Object.entries(WHEELS).flatMap(([pin, files]) =>
    Object.entries(files)
      .filter(([name]) => WHEEL_TAG[target].test(name))
      .map(([name, hex]) => ({ pin, name, hex })),
  )
  return (
    await Promise.all(
      picked.map(async (wheel) => {
        const [name, version] = wheel.pin.split("==") as [string, string]
        const index = (await (await fetch(`https://pypi.org/pypi/${name}/${version}/json`)).json()) as {
          urls: { filename: string; url: string }[]
        }
        const url = index.urls.find((item) => item.filename === wheel.name)?.url
        if (!url) throw new Error(`wheel not on PyPI: ${wheel.name}`)
        const found = await artifact(
          { url, integrity: `sha256-${Buffer.from(wheel.hex, "hex").toString("base64")}`, format: "zip", entries: [{ from: ".", to: "." }] },
          cache,
          target,
        )
        return found.map((item) => ({ ...item, file: `${wheel.name}:${item.file}`, notes: [...item.notes, `tag ${wheel.name.split("-").slice(4).join("-")}`] }))
      }),
    )
  ).flat()
}

export async function measure(item: Engine | Runtime, target: TargetId, cache: string) {
  if ("targets" in item) return artifact(item.targets[target].artifact, cache, target)
  if (item.id === "orval") return npmNative(orvalLock, target, cache)
  if (item.id === "datamodel-codegen") return wheels(target, cache)
  return []
}

if (import.meta.main) {
  const args = parseArgs({
    args: process.argv.slice(2),
    options: {
      engine: { type: "string", multiple: true },
      runtime: { type: "string", multiple: true },
      target: { type: "string", multiple: true },
      json: { type: "boolean" },
      files: { type: "boolean" },
      check: { type: "boolean" },
      cache: { type: "string" },
    },
  })
  const cache = args.values.cache ?? path.join(os.tmpdir(), "toolkit-floors")
  await mkdir(cache, { recursive: true })
  const targets = (args.values.target ?? TARGETS) as TargetId[]
  const all = !args.values.engine && !args.values.runtime
  const items: ReadonlyArray<Engine | Runtime> = [
    ...Object.values(ENGINES).filter((engine) => all || args.values.engine?.includes(engine.id)),
    ...Object.values(RUNTIMES).filter((runtime) => all || args.values.runtime?.includes(runtime.id)),
  ]
  // One at a time: the Rust and Java archives are hundreds of megabytes each.
  const rows = []
  for (const item of items)
    for (const target of targets) {
      const found = await measure(item, target, cache)
      rows.push({ id: item.id, target, ...reduce(found), files: found.length, notes: [...new Set(found.flatMap((entry) => entry.notes))], detail: args.values.files ? found : undefined })
    }
  const stale = rows.filter((row, index) => JSON.stringify(row.floor) !== JSON.stringify(items[Math.floor(index / targets.length)]?.floor?.[row.target] ?? {}))
  if (args.values.check) {
    stale.forEach((row) => console.error(`floor differs: ${row.id} ${row.target} measured ${JSON.stringify(row.floor)} (${JSON.stringify(row.setBy)})`))
    if (stale.length) process.exit(1)
  }
  if (args.values.json) console.log(JSON.stringify(rows, null, 2))
  else
    rows.forEach((row) =>
      console.log(
        `${row.id.padEnd(26)} ${row.target.padEnd(13)} ${JSON.stringify(row.floor).padEnd(44)} files=${row.files} ${JSON.stringify(row.setBy)} ${row.notes.filter((n) => /GLIBCXX|musl|static/.test(n)).join("; ")}`,
      ),
    )
}
