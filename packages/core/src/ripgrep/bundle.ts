import path from "path"
import { createHash } from "crypto"
import { chmod, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "fs/promises"
import { gunzipSync, inflateRawSync } from "zlib"
import { RipgrepRelease } from "./release"

/**
 * Puts the pinned ripgrep in a packaged build (packages/cli/script/build.ts, packages/desktop/scripts): the archive is
 * read from RIPGREP_ARCHIVES (offline builds) or downloaded, checked against its pin in release.ts before anything is
 * unpacked, and its executable and license texts are written to one directory with a manifest of where they came
 * from. The runtime finds the result through binary.ts; the desktop's main process runs `verify`, so this module
 * stays plain Node.
 */
export namespace RipgrepBundle {
  /** ripgrep is MIT OR Unlicense; COPYING states the choice. Shipped next to the executable. */
  export const LICENSES = ["COPYING", "LICENSE-MIT", "UNLICENSE"] as const
  export const MANIFEST = "manifest.json"
  /** `false` declares a packager that puts rg on PATH itself (Nix): nothing is staged, and packaged checks allow that. */
  export const BUNDLED = "RIPGREP_BUNDLED"
  /** A directory holding pinned archives under their upstream file names, read instead of downloading. */
  export const ARCHIVES = "RIPGREP_ARCHIVES"

  export type Manifest = {
    name: "ripgrep"
    version: string
    license: string
    repository: string
    key: string
    archive: { url: string; sha256: string }
    executable: { path: string; sha256: string }
    materials: { path: string; sha256: string }[]
    modifications: string
  }

  export const enabled = (env: Record<string, string | undefined> = process.env) => env[BUNDLED] !== "false"

  /**
   * The pin key for a CLI build target, or undefined where none is pinned: ripgrep publishes no arm64 musl build (the
   * x64 Linux pin is a static musl build, so it serves glibc and musl alike).
   */
  export const key = (target: { os: string; arch: string; abi?: string }) => {
    const key = RipgrepRelease.key({ arch: target.arch, platform: target.os, musl: target.abi === "musl" })
    return RipgrepRelease.archive(key) ? key : undefined
  }

  /** Stages the pinned ripgrep for `key` into `directory`, replacing what was there only once every byte checked. */
  export async function stage(input: {
    key: string
    directory: string
    archives?: string
    /** Tests only: an archive other than the pinned one. */
    archive?: RipgrepRelease.Archive
  }) {
    const archive = input.archive ?? RipgrepRelease.archive(input.key)
    if (!archive) throw new Error(`ripgrep ${RipgrepRelease.VERSION} publishes no build for ${input.key}`)
    const bytes = await acquire(archive, input.archives)
    if (sha256(bytes) !== archive.sha256)
      throw new Error(
        `ripgrep archive failed its integrity check: expected sha256 ${archive.sha256}, got ${sha256(bytes)} from ${archive.url}`,
      )
    const executable = RipgrepRelease.executable(platform(input.key))
    const files = unpack(bytes, archive, [executable, ...LICENSES])
    const manifest: Manifest = {
      name: "ripgrep",
      version: RipgrepRelease.VERSION,
      license: RipgrepRelease.LICENSE,
      repository: RipgrepRelease.REPOSITORY,
      key: input.key,
      archive: { url: archive.url, sha256: archive.sha256 },
      executable: { path: executable, sha256: sha256(files.get(executable)!) },
      materials: LICENSES.map((name) => ({ path: name, sha256: sha256(files.get(name)!) })),
      modifications:
        "None: the executable and license texts are the archive's bytes. Signed macOS and Windows builds sign the executable, which changes its bytes but not its code.",
    }
    await mkdir(path.dirname(input.directory), { recursive: true })
    const staging = await mkdtemp(path.join(path.dirname(input.directory), ".ripgrep-stage-"))
    // mkdtemp makes the directory private; the shipped one is readable like the rest of the package.
    return chmod(staging, 0o755)
      .then(() =>
        Promise.all(
          [...files].map(([name, content]) =>
            writeFile(path.join(staging, name), content, { mode: name === executable ? 0o755 : 0o644 }),
          ),
        ),
      )
      .then(() => writeFile(path.join(staging, MANIFEST), JSON.stringify(manifest, null, 2) + "\n"))
      .then(() => verify(staging, input.key, { archive }))
      .then(() => rm(input.directory, { recursive: true, force: true }))
      .then(() => rename(staging, input.directory))
      .then(() => manifest)
      .finally(() => rm(staging, { recursive: true, force: true }))
  }

  /**
   * Checks a staged ripgrep directory: its manifest names the pinned archive for `key`, the executable is a regular
   * (and, off Windows, executable) file whose bytes are the archive's unless `signed`, and every license text is there
   * unchanged. Returns the manifest.
   */
  export async function verify(
    directory: string,
    key: string,
    options: { signed?: boolean; archive?: RipgrepRelease.Archive } = {},
  ) {
    const archive = options.archive ?? RipgrepRelease.archive(key)
    const manifest = (await readFile(path.join(directory, MANIFEST), "utf8")
      .then(JSON.parse)
      .catch(() => undefined)) as Manifest | undefined
    if (!manifest) throw new Error(`ripgrep bundle missing: ${path.join(directory, MANIFEST)} is not readable JSON`)
    if (
      !archive ||
      manifest.name !== "ripgrep" ||
      manifest.version !== RipgrepRelease.VERSION ||
      manifest.license !== RipgrepRelease.LICENSE ||
      manifest.key !== key ||
      manifest.archive?.url !== archive.url ||
      manifest.archive?.sha256 !== archive.sha256
    )
      throw new Error(`ripgrep bundle in ${directory} is not the pinned ripgrep ${RipgrepRelease.VERSION} for ${key}`)
    const executable = path.join(directory, RipgrepRelease.executable(platform(key)))
    const stat = await lstat(executable).catch(() => undefined)
    if (!stat?.isFile() || manifest.executable?.path !== path.basename(executable))
      throw new Error(`ripgrep bundle missing its executable: ${executable}`)
    if (platform(key) !== "win32" && process.platform !== "win32" && (stat.mode & 0o111) !== 0o111)
      throw new Error(`ripgrep bundle executable is not executable: ${executable}`)
    if (!options.signed && sha256(await readFile(executable)) !== manifest.executable.sha256)
      throw new Error(`ripgrep bundle executable differs from the pinned archive's: ${executable}`)
    await Promise.all(
      LICENSES.map(async (name) => {
        const material = manifest.materials?.find((entry) => entry.path === name)
        const bytes = await readFile(path.join(directory, name)).catch(() => undefined)
        if (!material || !bytes || sha256(bytes) !== material.sha256)
          throw new Error(`ripgrep bundle license text missing or changed: ${path.join(directory, name)}`)
      }),
    )
    return manifest
  }

  async function acquire(archive: RipgrepRelease.Archive, archives: string | undefined) {
    const name = `${archive.root}.${archive.extension}`
    if (archives !== undefined)
      return readFile(path.join(archives, name)).then(
        (bytes) => new Uint8Array(bytes),
        () => {
          throw new Error(`${ARCHIVES}=${archives} has no ${name}`)
        },
      )
    return download(archive.url, 3)
  }

  // GitHub's release CDN has answered 5xx for these files; every attempt has a deadline and failures are retried.
  async function download(url: string, attempts: number): Promise<Uint8Array> {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) }).catch(
      (error: unknown) => error as Error,
    )
    if (response instanceof Response && response.ok) return new Uint8Array(await response.arrayBuffer())
    const reason = response instanceof Response ? `HTTP ${response.status}` : response.message
    const retry = !(response instanceof Response) || response.status >= 500 || response.status === 429
    if (!retry || attempts <= 1) throw new Error(`ripgrep download failed: ${reason} from ${url}`)
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    return download(url, attempts - 1)
  }

  function unpack(bytes: Uint8Array, archive: RipgrepRelease.Archive, names: readonly string[]) {
    const wanted = new Map(names.map((name) => [`${archive.root}/${name}`, name]))
    const entries = (archive.extension === "zip" ? unzip : untar)(bytes, new Set(wanted.keys()))
    const missing = [...wanted.keys()].filter((entry) => !entries.has(entry))
    if (missing.length > 0) throw new Error(`ripgrep archive ${archive.url} lacks ${missing.join(", ")}`)
    return new Map([...wanted].map(([entry, name]) => [name, entries.get(entry)!]))
  }

  // Reads the named regular files of a gzipped tar (ustar, with GNU long names and pax paths). The archive's digest was
  // checked first, so this only ever parses a pinned upstream file.
  function untar(bytes: Uint8Array, names: ReadonlySet<string>) {
    const tar = gunzipSync(bytes)
    const decoder = new TextDecoder()
    const text = (from: number, length: number) => decoder.decode(tar.subarray(from, from + length)).split("\0")[0]!
    const found = new Map<string, Uint8Array>()
    let offset = 0
    let long: string | undefined
    while (offset + 512 <= tar.length && tar.subarray(offset, offset + 512).some((byte) => byte !== 0)) {
      const size = parseInt(text(offset + 124, 12).trim() || "0", 8)
      const type = text(offset + 156, 1)
      const prefix = text(offset + 345, 155)
      const name = (long ?? (prefix ? `${prefix}/${text(offset, 100)}` : text(offset, 100))).replace(/^\.\//, "")
      const data = tar.subarray(offset + 512, offset + 512 + size)
      long = undefined
      if (type === "L") long = decoder.decode(data).split("\0")[0]
      if (type === "x") long = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(decoder.decode(data))?.[1]
      if ((type === "0" || type === "") && names.has(name)) found.set(name, new Uint8Array(data))
      offset += 512 + Math.ceil(size / 512) * 512
    }
    return found
  }

  // Reads the named members of a zip through its central directory. The archive's digest was checked first, so
  // this only ever parses a pinned upstream file.
  function unzip(bytes: Uint8Array, names: ReadonlySet<string>) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const end = Array.from(
      { length: Math.min(bytes.length - 21, 0x10000) },
      (_, back) => bytes.length - 22 - back,
    ).find((offset) => offset >= 0 && view.getUint32(offset, true) === 0x06054b50)
    if (end === undefined) throw new Error("ripgrep zip has no end of central directory")
    const found = new Map<string, Uint8Array>()
    const decoder = new TextDecoder()
    let offset = view.getUint32(end + 16, true)
    for (let index = 0; index < view.getUint16(end + 10, true); index++) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("ripgrep zip central directory is malformed")
      const method = view.getUint16(offset + 10, true)
      const compressed = view.getUint32(offset + 20, true)
      const size = view.getUint32(offset + 24, true)
      const nameLength = view.getUint16(offset + 28, true)
      const local = view.getUint32(offset + 42, true)
      const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
      offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
      if (!names.has(name)) continue
      if (view.getUint32(local, true) !== 0x04034b50) throw new Error(`ripgrep zip entry ${name} is malformed`)
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
      const data = bytes.subarray(start, start + compressed)
      if (method !== 0 && method !== 8) throw new Error(`ripgrep zip entry ${name} uses compression method ${method}`)
      const content = new Uint8Array(method === 0 ? data : inflateRawSync(data))
      if (content.length !== size) throw new Error(`ripgrep zip entry ${name} has the wrong size`)
      found.set(name, content)
    }
    return found
  }

  const platform = (key: string) => key.slice(key.indexOf("-") + 1)

  const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
}
