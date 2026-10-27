import { describe, expect, test } from "bun:test"
import { createHash } from "crypto"
import fs from "fs/promises"
import path from "path"
import { deflateRawSync } from "zlib"
import { Cause, Context, Effect, Exit, Layer, Option } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { RipgrepBundle } from "@orchestra/core/ripgrep/bundle"
import { RipgrepRelease } from "@orchestra/core/ripgrep/release"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const ROOT = "ripgrep-fixture"
const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex")

/** The members a ripgrep release archive carries, plus one that must not be shipped. */
const members = (executable: string) => ({
  [`${ROOT}/${executable}`]: `fake ${executable}`,
  [`${ROOT}/COPYING`]: "dual licensed",
  [`${ROOT}/LICENSE-MIT`]: "mit text",
  [`${ROOT}/UNLICENSE`]: "unlicense text",
  [`${ROOT}/README.md`]: "not shipped",
})

const tarball = (files: Record<string, string>) => new Bun.Archive(files, { compress: "gzip" }).bytes()

/** A deflated zip, as ripgrep's Windows releases are; written here because no runner tool writes zips everywhere. */
function zip(files: Record<string, string>) {
  const entries = Object.entries(files).map(([name, text]) => ({
    name: Buffer.from(name),
    data: Buffer.from(text),
    packed: deflateRawSync(Buffer.from(text)),
  }))
  const locals = entries.map((entry) => {
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(8, 8)
    header.writeUInt32LE(Bun.hash.crc32(entry.data), 14)
    header.writeUInt32LE(entry.packed.length, 18)
    header.writeUInt32LE(entry.data.length, 22)
    header.writeUInt16LE(entry.name.length, 26)
    return Buffer.concat([header, entry.name, entry.packed])
  })
  const offsets = locals.map((_, index) => locals.slice(0, index).reduce((sum, local) => sum + local.length, 0))
  const central = entries.map((entry, index) => {
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(8, 10)
    header.writeUInt32LE(Bun.hash.crc32(entry.data), 16)
    header.writeUInt32LE(entry.packed.length, 20)
    header.writeUInt32LE(entry.data.length, 24)
    header.writeUInt16LE(entry.name.length, 28)
    header.writeUInt32LE(offsets[index]!, 42)
    return Buffer.concat([header, entry.name])
  })
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(
    locals.reduce((sum, local) => sum + local.length, 0),
    16,
  )
  return new Uint8Array(Buffer.concat([...locals, directory, end]))
}

/** Writes `bytes` where RIPGREP_ARCHIVES would hold it, and returns the archive pinned to them and to `members`' rg. */
async function archived(dir: string, extension: "tar.gz" | "zip", bytes: Uint8Array, executable = "rg") {
  await fs.mkdir(path.join(dir, "archives"), { recursive: true })
  await fs.writeFile(path.join(dir, "archives", `${ROOT}.${extension}`), bytes)
  return {
    archives: path.join(dir, "archives"),
    archive: {
      url: `https://example.invalid/${ROOT}.${extension}`,
      sha256: sha256(bytes),
      executable: sha256(`fake ${executable}`),
      extension,
      root: ROOT,
    },
  }
}

describe("RipgrepBundle", () => {
  for (const { key, extension, executable } of [
    { key: "arm64-darwin", extension: "tar.gz" as const, executable: "rg" },
    { key: "arm64-linux-musl", extension: "tar.gz" as const, executable: "rg" },
    { key: "x64-win32", extension: "zip" as const, executable: "rg.exe" },
  ])
    test(`stages ${key}'s ${executable} and license texts from a ${extension} archive, and nothing else`, async () => {
      await using tmp = await tmpdir()
      const files = members(executable)
      const source = await archived(
        tmp.path,
        extension,
        await (extension === "zip" ? zip(files) : tarball(files)),
        executable,
      )
      const directory = path.join(tmp.path, "ripgrep")

      const manifest = await RipgrepBundle.stage({ key, directory, ...source })

      expect((await fs.readdir(directory)).sort()).toEqual([
        "COPYING",
        "LICENSE-MIT",
        "UNLICENSE",
        "manifest.json",
        executable,
      ])
      expect(await fs.readFile(path.join(directory, executable), "utf8")).toBe(`fake ${executable}`)
      if (process.platform !== "win32") {
        expect((await fs.stat(path.join(directory, executable))).mode & 0o777).toBe(0o755)
        expect((await fs.stat(directory)).mode & 0o777).toBe(0o755)
      }
      expect(manifest).toEqual({
        name: "ripgrep",
        version: RipgrepRelease.VERSION,
        license: "MIT OR Unlicense",
        repository: "https://github.com/BurntSushi/ripgrep",
        key,
        archive: { url: source.archive.url, sha256: source.archive.sha256 },
        executable: { path: executable, sha256: sha256(`fake ${executable}`) },
        materials: [
          { path: "COPYING", sha256: sha256("dual licensed") },
          { path: "LICENSE-MIT", sha256: sha256("mit text") },
          { path: "UNLICENSE", sha256: sha256("unlicense text") },
        ],
        modifications: expect.any(String),
      })
      expect(JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"))).toEqual(manifest)
      expect(await RipgrepBundle.verify(directory, key, { archive: source.archive })).toEqual({
        manifest,
        signed: false,
      })
    })

  test("refuses an archive that is not the pinned bytes and keeps the bundle already staged", async () => {
    await using tmp = await tmpdir()
    const source = await archived(tmp.path, "tar.gz", await tarball(members("rg")))
    const directory = path.join(tmp.path, "ripgrep")
    await RipgrepBundle.stage({ key: "x64-linux", directory, ...source })
    await fs.writeFile(
      path.join(source.archives, `${ROOT}.tar.gz`),
      await tarball({ ...members("rg"), [`${ROOT}/rg`]: "planted" }),
    )

    await expect(RipgrepBundle.stage({ key: "x64-linux", directory, ...source })).rejects.toThrow("integrity check")
    expect(await fs.readFile(path.join(directory, "rg"), "utf8")).toBe("fake rg")
    expect((await fs.readdir(tmp.path)).filter((name) => name.startsWith(".ripgrep-stage-"))).toEqual([])
  })

  test("refuses an archive that lacks the executable or a license text", async () => {
    await using tmp = await tmpdir()
    const { [`${ROOT}/UNLICENSE`]: _, ...partial } = members("rg")
    const source = await archived(tmp.path, "tar.gz", await tarball(partial))
    await expect(
      RipgrepBundle.stage({ key: "x64-linux", directory: path.join(tmp.path, "ripgrep"), ...source }),
    ).rejects.toThrow(`lacks ${ROOT}/UNLICENSE`)
  })

  test("names the missing archive when RIPGREP_ARCHIVES lacks it", async () => {
    await using tmp = await tmpdir()
    await expect(
      RipgrepBundle.stage({ key: "x64-linux", directory: path.join(tmp.path, "ripgrep"), archives: tmp.path }),
    ).rejects.toThrow(
      `${RipgrepBundle.ARCHIVES}=${tmp.path} has no ${RipgrepRelease.archive("x64-linux")!.root}.tar.gz`,
    )
    await expect(
      RipgrepBundle.stage({ key: "riscv64-linux", directory: path.join(tmp.path, "ripgrep"), archives: tmp.path }),
    ).rejects.toThrow("publishes no build for riscv64-linux")
  })

  test("downloads the archive, retrying a 503, when no archives directory is given", async () => {
    await using tmp = await tmpdir()
    const bytes = await tarball(members("rg"))
    const counter = { requests: 0 }
    using server = Bun.serve({
      port: 0,
      fetch: () => (++counter.requests === 1 ? new Response("busy", { status: 503 }) : new Response(bytes)),
    })
    const archive = {
      url: new URL(`/${ROOT}.tar.gz`, server.url).href,
      sha256: sha256(bytes),
      executable: sha256("fake rg"),
      extension: "tar.gz" as const,
      root: ROOT,
    }

    await RipgrepBundle.stage({ key: "arm64-linux", directory: path.join(tmp.path, "ripgrep"), archive })
    expect(counter.requests).toBe(2)
    expect(await fs.readFile(path.join(tmp.path, "ripgrep", "rg"), "utf8")).toBe("fake rg")
  })

  test("refuses an archive whose rg is not the pinned executable, even when the archive digest matches", async () => {
    await using tmp = await tmpdir()
    const source = await archived(tmp.path, "tar.gz", await tarball(members("rg")))
    await expect(
      RipgrepBundle.stage({
        key: "x64-linux",
        directory: path.join(tmp.path, "ripgrep"),
        ...source,
        archive: { ...source.archive, executable: "0".repeat(64) },
      }),
    ).rejects.toThrow("not the pinned")
    expect(await fs.stat(path.join(tmp.path, "ripgrep")).catch(() => undefined)).toBeUndefined()
  })

  test("verify holds the bundle to the pins, never to the manifest beside it", async () => {
    await using tmp = await tmpdir()
    const source = await archived(tmp.path, "tar.gz", await tarball(members("rg")))
    const directory = path.join(tmp.path, "ripgrep")
    const stage = () => RipgrepBundle.stage({ key: "arm64-darwin", directory, ...source })
    const verify = (options: Parameters<typeof RipgrepBundle.verify>[2] = {}) =>
      RipgrepBundle.verify(directory, "arm64-darwin", { ...options, archive: source.archive })
    const manifest = path.join(directory, "manifest.json")
    await stage()
    expect((await verify()).signed).toBe(false)

    // Not the pin for this key: the real pinned archive differs from the fixture's.
    await expect(RipgrepBundle.verify(directory, "arm64-darwin")).rejects.toThrow("is not the pinned ripgrep")
    await expect(RipgrepBundle.verify(directory, "x64-darwin", { archive: source.archive })).rejects.toThrow(
      "is not the pinned ripgrep",
    )

    // A planted rg with a manifest rewritten to match it is still refused: the pin decides, not the manifest.
    await fs.writeFile(path.join(directory, "rg"), "planted")
    const forged = JSON.parse(await fs.readFile(manifest, "utf8"))
    await fs.writeFile(manifest, JSON.stringify({ ...forged, executable: { path: "rg", sha256: sha256("planted") } }))
    await expect(verify()).rejects.toThrow("is not the pinned ripgrep")
    await stage()

    // Signed bytes differ from the pin: accepted only with a signature check that passes.
    await fs.writeFile(path.join(directory, "rg"), "re-signed")
    await expect(verify()).rejects.toThrow("differs from the pinned archive's")
    const checked: string[] = []
    const valid = async (file: string) => (checked.push(file), true)
    expect((await verify({ signature: valid })).signed).toBe(true)
    expect(checked).toEqual([path.join(directory, "rg")])
    await expect(verify({ signature: async () => false })).rejects.toThrow("has no valid signature")
    // A build that signs refuses an rg left unsigned.
    await stage()
    await expect(verify({ signature: valid, signed: "required" })).rejects.toThrow("is unsigned where this build signs")

    await fs.rm(path.join(directory, "rg"))
    await expect(verify({ signature: valid })).rejects.toThrow("missing its executable")
    await stage()
    await fs.rm(path.join(directory, "rg"))
    await fs.symlink(path.join(tmp.path, "archives"), path.join(directory, "rg"))
    await expect(verify({ signature: valid })).rejects.toThrow("missing its executable")

    await stage()
    await fs.writeFile(path.join(directory, "LICENSE-MIT"), "changed")
    await expect(verify()).rejects.toThrow("license text missing or changed")

    await stage()
    await fs.rm(manifest)
    await expect(verify()).rejects.toThrow("ripgrep bundle missing")

    if (process.platform === "win32") return
    await stage()
    await fs.chmod(path.join(directory, "rg"), 0o644)
    await expect(verify()).rejects.toThrow("is not executable")
  })

  test("every CLI build target maps to the pinned archive for its own OS, CPU and ABI", () => {
    const triples = {
      "arm64-darwin": "aarch64-apple-darwin",
      "x64-darwin": "x86_64-apple-darwin",
      "arm64-linux": "aarch64-unknown-linux-gnu",
      "arm64-linux-musl": "aarch64-unknown-linux-musl",
      "x64-linux": "x86_64-unknown-linux-musl",
      "arm64-win32": "aarch64-pc-windows-msvc",
      "x64-win32": "x86_64-pc-windows-msvc",
    }
    for (const os of ["darwin", "linux", "win32"])
      for (const arch of ["arm64", "x64"])
        for (const abi of os === "linux" ? [undefined, "musl"] : [undefined]) {
          const key = RipgrepBundle.key({ os, arch, abi })
          expect(key).toBe(os === "linux" && arch === "arm64" && abi === "musl" ? "arm64-linux-musl" : `${arch}-${os}`)
          expect(RipgrepRelease.archive(key)?.root).toBe(
            `ripgrep-${RipgrepRelease.VERSION}-${triples[key as keyof typeof triples]}`,
          )
          expect(RipgrepRelease.archive(key)?.sha256).toMatch(/^[0-9a-f]{64}$/)
        }
    // Every pinned archive pins its rg executable too, each a different build.
    const executables = RipgrepRelease.keys().map((key) => RipgrepRelease.archive(key)?.executable)
    for (const pin of executables) expect(pin).toMatch(/^[0-9a-f]{64}$/)
    expect(new Set(executables).size).toBe(RipgrepRelease.keys().length)
    // The runtime reads the same pins: one table, no second copy.
    for (const key of RipgrepRelease.keys()) expect(RipgrepBinary.release(key)).toEqual(RipgrepRelease.archive(key))
    expect(RipgrepBinary.VERSION).toBe(RipgrepRelease.VERSION)
  })

  test("RIPGREP_BUNDLED=false is the only way to stage nothing", () => {
    expect(RipgrepBundle.enabled({})).toBe(true)
    expect(RipgrepBundle.enabled({ [RipgrepBundle.BUNDLED]: "0" })).toBe(true)
    expect(RipgrepBundle.enabled({ [RipgrepBundle.BUNDLED]: "false" })).toBe(false)
  })
})

/** A RipgrepBinary whose release URL is a local server counting requests; nothing reaches GitHub. */
const service = Effect.fnUntraced(function* (dir: string, options: Partial<RipgrepBinary.Options>) {
  const counter = { requests: 0 }
  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        port: 0,
        fetch: () => {
          counter.requests++
          return new Response("never served")
        },
      }),
    ),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const context = yield* Layer.build(
    LayerNode.compile(
      RipgrepBinary.nodeWith({
        system: () => undefined,
        directory: path.join(dir, "cache"),
        release: { url: server.url.href, sha256: "0".repeat(64), extension: "tar.gz", root: ROOT },
        download: true,
        ...options,
      }),
    ),
  )
  return { binary: Context.get(context, RipgrepBinary.Service), counter }
})

const failure = <A>(exit: Exit.Exit<A, RipgrepBinary.Unavailable>) => {
  if (Exit.isSuccess(exit)) throw new Error(`expected a failure, got ${String(exit.value)}`)
  const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause))
  if (!error) throw new Error(`expected a typed failure, got ${String(exit.cause)}`)
  return error
}

const temporary = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
)

describe("RipgrepBinary in a packaged build", () => {
  it.live("runs the shipped rg before rg on PATH and never asks the release server", () =>
    Effect.gen(function* () {
      const tmp = yield* temporary
      const executable = RipgrepRelease.executable()
      const shipped = path.join(tmp.path, "Resources", "ripgrep")
      const system = path.join(tmp.path, "path", executable)
      yield* Effect.promise(() => fs.mkdir(shipped, { recursive: true }))
      yield* Effect.promise(() => fs.mkdir(path.dirname(system), { recursive: true }))
      yield* Effect.promise(() => fs.writeFile(path.join(shipped, executable), "bundled"))
      yield* Effect.promise(() => fs.writeFile(system, "system"))

      const found = yield* service(tmp.path, { bundled: shipped, system: () => system })
      expect(yield* found.binary.filepath).toBe(path.join(shipped, executable))
      expect(found.counter.requests).toBe(0)

      // Control: without the shipped copy the same packaged service falls back to PATH.
      const fallback = yield* service(tmp.path, { bundled: path.join(tmp.path, "elsewhere"), system: () => system })
      expect(yield* fallback.binary.filepath).toBe(system)
    }),
  )

  it.live("never downloads, even with downloads allowed, and names the rg it expected", () =>
    Effect.gen(function* () {
      const tmp = yield* temporary
      const shipped = path.join(tmp.path, "Resources", "ripgrep")
      const packaged = yield* service(tmp.path, { bundled: shipped, download: true })

      const error = failure(yield* Effect.exit(packaged.binary.filepath))
      expect(error.message).toContain("packaged builds never download it")
      expect(error.message).toContain(path.join(shipped, RipgrepRelease.executable()))
      expect(packaged.counter.requests).toBe(0)
      expect(yield* Effect.promise(() => fs.readdir(path.join(tmp.path, "cache")).catch(() => []))).toEqual([])

      // Control: the same service in a source run does reach the release server.
      const source = yield* service(tmp.path, { bundled: undefined, download: true, attempts: 1 })
      yield* Effect.exit(source.binary.filepath)
      expect(source.counter.requests).toBe(1)
    }),
  )

  it.live.skipIf(process.platform === "win32")("refuses a symlink in place of the shipped or the downloaded rg", () =>
    Effect.gen(function* () {
      const tmp = yield* temporary
      const executable = RipgrepRelease.executable()
      const elsewhere = path.join(tmp.path, "elsewhere-rg")
      yield* Effect.promise(() => fs.writeFile(elsewhere, "planted"))
      const shipped = path.join(tmp.path, "Resources", "ripgrep")
      yield* Effect.promise(() => fs.mkdir(shipped, { recursive: true }))
      yield* Effect.promise(() => fs.symlink(elsewhere, path.join(shipped, executable)))
      const packaged = yield* service(tmp.path, { bundled: shipped })
      expect(failure(yield* Effect.exit(packaged.binary.filepath)).message).toContain("is not a regular file")

      yield* Effect.promise(() => fs.mkdir(path.join(tmp.path, "cache"), { recursive: true }))
      yield* Effect.promise(() => fs.symlink(elsewhere, path.join(tmp.path, "cache", executable)))
      const source = yield* service(tmp.path, { bundled: undefined, download: false })
      expect(failure(yield* Effect.exit(source.binary.filepath)).message).toContain(RipgrepBinary.DISABLE_DOWNLOAD)
    }),
  )

  it.live("only a packaged build has a bundled directory: the desktop names it, a source run has none", () =>
    Effect.sync(() => {
      expect(RipgrepBinary.bundledDirectory({ [RipgrepBinary.DIRECTORY]: "/Resources/cli/ripgrep-x" })).toBe(
        "/Resources/cli/ripgrep-x",
      )
      // A source run never consults a directory beside its runtime (no `..` guesses next to bun or node).
      expect(RipgrepBinary.bundledDirectory({})).toBeUndefined()
      expect(RipgrepBinary.defaults({}).bundled).toBeUndefined()
    }),
  )
})
