import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { cp, lstat, mkdir, readFile, readdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import { PackagedSkills } from "@orchestra/core/packaged-skills"
import { ConfigMarkdown } from "@orchestra/core/config/markdown"
import { Schema } from "effect"
import { prepareDistribution, archiveDistribution, verifyDistribution } from "../../script/distribution-payload"
import { command } from "./distribution-native-process"
import { linuxRuntimeLibc } from "@orchestra/script/tree-sitter-prebuilds"

export { command } from "./distribution-native-process"

export const cli = resolve(import.meta.dirname, "../..")
export const nativeLibc = process.platform === "linux" ? linuxRuntimeLibc() : undefined
export const target = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}${process.arch === "x64" ? "-baseline" : ""}${nativeLibc?.kind === "musl" ? "-musl" : ""}`
export const versions = ["1.18.27", "1.18.28"] as const
export const sha256 = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")

// Allow-listing removes provider credentials, npm config, HUGR_OMNI_* and all
// inherited ORCHESTRA_* overrides, including launcher and spawner overrides.
export async function sandbox(directory: string) {
  await Promise.all(["home", "config", "data", "state", "cache", "tmp", "outside"].map((name) =>
    mkdir(join(directory, name), { recursive: true }),
  ))
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TZ", ...(process.platform === "win32"
        ? ["SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PATHEXT"] : [])].includes(key.toUpperCase()),
    )),
    HOME: join(directory, "home"), USERPROFILE: join(directory, "home"),
    APPDATA: join(directory, "config"), LOCALAPPDATA: join(directory, "data"),
    XDG_CONFIG_HOME: join(directory, "config"), XDG_DATA_HOME: join(directory, "data"),
    XDG_STATE_HOME: join(directory, "state"), XDG_CACHE_HOME: join(directory, "cache"),
    TMPDIR: join(directory, "tmp"), TMP: join(directory, "tmp"), TEMP: join(directory, "tmp"),
    ORCHESTRA_TEST_HOME: join(directory, "home"), ORCHESTRA_DB: join(directory, "proof.sqlite"),
    ORCHESTRA_INHERIT_CREDENTIALS: "0", ORCHESTRA_DISABLE_MODELS_FETCH: "1",
    ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
  }
  await Bun.write(join(directory, "outside/sample.ts"),
    'import { readFile } from "node:fs/promises"\nexport interface Shape { area(): number }\nexport class Square implements Shape { area() { return 4 } }\nexport function load(file: string) { return readFile(file, "utf8") }\n')
  await Bun.write(join(directory, "outside/sample.py"), "from os import path\n\ndef join(a, b):\n    return path.join(a, b)\n")
  await Bun.write(join(directory, "user.npmrc"), "")
  await Bun.write(join(directory, "global.npmrc"), "")
  return {
    directory, cwd: join(directory, "outside"), env,
    namespace: join(directory, "cache/orchestra/packaged-skills"),
  }
}
export type Sandbox = Awaited<ReturnType<typeof sandbox>>

export async function successful(args: string[], box: Pick<Sandbox, "cwd" | "env">, timeout?: number) {
  const result = await command(args, box, timeout)
  // Daemon password/stdout never enter failure diagnostics.
  if (result.code !== 0)
    throw new Error(`Command failed (${result.code}): ${args.join(" ")}${args[1] === "service" ? startReason(result.stderr) : `\n${result.stderr}`}`)
  return result.stdout.trim()
}

// Service stderr stays private; only the CLI's fixed start reason code passes.
export function startReason(stderr: string) {
  const reason = stderr.match(/Failed to start server \((?:exited (?:code=\d+|signal=SIG[A-Z0-9]+)|[a-z-]+), \d+ms\)/)?.[0]
  return reason ? `\n${reason}` : ""
}

export async function assertVersion(launcher: string, version: string, box: Sandbox) {
  const result = await command([launcher, "--version"], box, 15_000)
  expect(result.code, result.stderr).toBe(0)
  expect(process.platform === "win32" ? result.stdout.replaceAll("\r\n", "\n") : result.stdout).toBe(`${version}\n`)
}

// Snapshot includes empty directories, regular-file modes and full bytes.
// Only ENOENT means absence; traversal/read errors must fail qualification.
export async function snapshot(directory: string) {
  const files = new Map<string, { bytes: Buffer; executable: boolean }>()
  const directories: string[] = []
  const info = await lstat(directory).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
    throw error
  })
  if (!info) return undefined
  const visit = async (directory: string, relative: string): Promise<void> => {
    expect((await lstat(directory)).isDirectory()).toBe(true)
    for (const name of (await readdir(directory)).sort()) {
      const file = relative ? `${relative}/${name}` : name
      const location = join(directory, name)
      const stat = await lstat(location)
      expect(stat.isSymbolicLink()).toBe(false)
      if (stat.isDirectory()) { directories.push(file); await visit(location, file); continue }
      expect(stat.isFile()).toBe(true)
      expect(stat.nlink).toBe(1)
      files.set(file, { bytes: await readFile(location), executable: Boolean(stat.mode & 0o111) })
    }
  }
  await visit(directory, "")
  return { files, directories: directories.sort() }
}

export async function captureOracle() {
  const { Seats } = await import("../../../orchestra/src/maestro/seats")
  const { SeatSkillContent } = await import("../../../orchestra/src/maestro/seat-skill-content")
  const { packagedSkills } = await import("../../script/packaged-skills")
  const trees = Object.fromEntries(await Promise.all(Object.values(Seats.all)
    .filter((seat) => seat.skills.length > 0)
    .map(async (seat) => [seat.id, await SeatSkillContent.read(seat.id, Seats.skillSource(seat.id), seat.skills)] as const)))
  expect(await packagedSkills()).toEqual(trees)
  const files = Object.entries(trees).flatMap(([id, tree]) =>
    Object.entries(tree).map(([file, text]) => ({ path: `${id}/${file}`, bytes: Buffer.from(text, "utf8") })),
  ).toSorted((a, b) => a.path.localeCompare(b.path))
  expect(files.length).toBeGreaterThan(0)
  const frontmatter = Schema.Struct({
    name: Schema.String, description: Schema.optional(Schema.String), slash: Schema.optional(Schema.Boolean),
  })
  const catalog = files.filter((file) => file.path.endsWith("/SKILL.md")).map((file) => {
    const parsed = ConfigMarkdown.parse(file.bytes.toString("utf8"))
    return { ...Schema.decodeUnknownSync(frontmatter)(parsed.data), content: parsed.content, path: file.path }
  })
  expect(catalog.length).toBeGreaterThan(0)
  expect(new Set(catalog.map((skill) => skill.name)).size).toBe(catalog.length)
  return {
    trees, files, catalog, digest: PackagedSkills.digest(trees),
    directories: [...new Set(files.flatMap((file) => file.path.split("/").slice(0, -1)
      .map((_, index) => file.path.split("/").slice(0, index + 1).join("/"))))].sort(),
  }
}
export type Oracle = Awaited<ReturnType<typeof captureOracle>>

export function skillIdentity(version: string, oracle: Oracle) {
  return `${version.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 60)}-${sha256(version)}-${oracle.digest}`
}

export async function buildVersions(directory: string, artifacts?: { omni: string; treeSitter: string; logs: string }) {
  const { resolveTreeSitter } = await import("@orchestra/script/tree-sitter-prebuilds")
  const box = await sandbox(join(directory, "builder"))
  if (artifacts && nativeLibc?.kind !== "musl") throw new Error("NATIVE_EXPLICIT_ARTIFACTS_REQUIRE_VERIFIED_MUSL")
  await successful([process.execPath, "script/runtime-proof.ts", "--target", target, "--host"], { ...box, cwd: cli })
  const oracle = await captureOracle() // Canonical bytes captured before either compile.
  const release = resolve(cli, "../omni/target/release")
  const companions = [
    { source: join(release, process.platform === "win32" ? "hugr_omni_node.dll" : process.platform === "darwin" ? "libhugr_omni_node.dylib" : "libhugr_omni_node.so"), path: "bin/hugr_omni.node" },
    { source: join(release, `hugr-omni-supervisor${process.platform === "win32" ? ".exe" : ""}`), path: `bin/hugr-omni-supervisor${process.platform === "win32" ? ".exe" : ""}` },
  ]
  const hashes = await Promise.all(companions.map(async (file) => {
    const info = await lstat(file.source)
    expect(info.isFile()).toBe(true)
    expect(info.size).toBeGreaterThan(0)
    return { ...file, sha256: sha256(await readFile(file.source)) }
  }))
  if (process.platform !== "win32") expect(Boolean((await lstat(companions[1].source)).mode & 0o111)).toBe(true)
  const models = join(box.directory, "models.json")
  await Bun.write(models, "{}") // Non-provider proof only; no model request is qualified.
  const payloads = []
  for (const version of versions) {
    const env = { ...box.env, ORCHESTRA_VERSION: version, ORCHESTRA_CHANNEL: "dev", MODELS_DEV_API_JSON: models,
      ...(artifacts ? { OMNI_ARTIFACTS: artifacts.omni, TREE_SITTER_ARTIFACTS: artifacts.treeSitter } : {}) }
    if (!artifacts) expect("OMNI_ARTIFACTS" in env).toBe(false)
    expect("ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER" in env).toBe(false)
    const args = [process.execPath, "script/build.ts", "--single", "--skip-install", "--target", target]
    const compiled = await command(args, { cwd: cli, env }, 900_000)
    if (artifacts) await Bun.write(join(artifacts.logs, `cli-build-${version}.json`), JSON.stringify(compiled, null, 2))
    if (compiled.code !== 0) throw new Error(`Command failed (${compiled.code}): ${args.join(" ")}\n${compiled.stderr}`)
    const built = join(cli, "dist", `cli-${target}`)
    for (const file of hashes) {
      expect(sha256(await readFile(file.source))).toBe(file.sha256)
      expect(sha256(await readFile(join(built, file.path)))).toBe(file.sha256)
    }
    for (const file of resolveTreeSitter({ root: resolve(cli, "../.."), os: process.platform, arch: process.arch,
      abi: nativeLibc?.kind === "musl" ? "musl" : undefined, artifacts: artifacts?.treeSitter }))
      expect(sha256(await readFile(join(built, "bin/tree-sitter", file.to)))).toBe(sha256(await readFile(file.from)))
    // Copy AND admit full closure before the next build replaces this target.
    const dist = join(directory, `captured-${version}`)
    await cp(built, join(dist, `cli-${target}`), { recursive: true })
    expect(await snapshot(join(dist, `cli-${target}`))).toEqual(await snapshot(built))
    const payload = join(directory, `payload-${version}`)
    const manifest = await prepareDistribution({ dist, out: payload, version, target })
    expect(await verifyDistribution(payload, { version, target })).toEqual(manifest)
    for (const file of hashes) expect(manifest.files.find((entry) => entry.path === file.path)?.sha256).toBe(file.sha256)
    const archive = await archiveDistribution({ directory: payload, file: join(directory, `${version}.tar.gz`) })
    payloads.push({ version, payload, manifest, archive, snapshot: await snapshot(payload) })
  }
  expect(payloads).toHaveLength(2)
  const executable = `bin/orchestra${process.platform === "win32" ? ".exe" : ""}`
  const binaries = payloads.map((payload) => payload.manifest.files.find((file) => file.path === executable))
  binaries.forEach((binary) => expect(binary?.sha256).toMatch(/^[a-f0-9]{64}$/))
  expect(binaries[0]?.sha256).not.toBe(binaries[1]?.sha256)
  return { oracle, payloads }
}
export type Built = Awaited<ReturnType<typeof buildVersions>>
