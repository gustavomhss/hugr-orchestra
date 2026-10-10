import assert from "node:assert/strict"
import path from "node:path"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { lstat, readlink, readdir, realpath } from "node:fs/promises"

export const desktop = path.resolve(import.meta.dir, "..")
export const repository = path.resolve(desktop, "../..")
export const appID = "ai.hugr.orchestra.lean.candidate"
export const productName = "HuGR Lean Candidate"
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const archivePin = "369206cd0a468904d7896c3e729535911e9258a7d4a3e9c8eedb078b6a096ec1"
type Material = { path: string; bytes: number; sha256: string; link?: string }
type BuildIdentity = {
  schemaVersion: number; status: string; accepted: boolean; sourceCommit: string; sourceTree: string; treeDigest: string
  platform: string; arch: string; appRelativePath: string; appId: string; productName: string
  tools: { bun: string; node: string; electron: string; "electron-builder": string }
  main: Material[]; preload: Material[]; renderer: Material[]; backend: Material[]; packaged: Material[]
  nativePty: { name: string; version: string; binaries: Material[] }
}

async function git(...args: string[]) {
  const child = Bun.spawn(["git", ...args], { cwd: repository, stdout: "pipe", stderr: "pipe", timeout: 10000, killSignal: "SIGKILL" })
  const [out, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  assert.equal(code, 0, `Candidate source identity failed: git ${args.join(" ")}\n${error}`)
  return out.trim()
}

async function inventory(directory: string): Promise<Material[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return (await inventory(file)).map((item) => ({ ...item, path: `${entry.name}/${item.path}` }))
    assert.ok(entry.isSymbolicLink() || entry.isFile(), `Unsupported candidate member: ${file}`)
    const link = entry.isSymbolicLink() ? await readlink(file) : undefined
    const bytes = link === undefined ? new Uint8Array(await Bun.file(file).arrayBuffer()) : Buffer.from(link)
    return [{ path: entry.name, bytes: bytes.length, sha256: digest(bytes), ...(link === undefined ? {} : { link }) }]
  }))
  return files.flat().sort((a, b) => a.path.localeCompare(b.path, "en"))
}

export function requireNativeCI() {
  if (process.platform !== "darwin" || process.arch !== "x64")
    throw new Error("LEAN_CANDIDATE_UNSUPPORTED_PLATFORM: proof requires native macOS x64")
  if (process.env.GITHUB_ACTIONS !== "true")
    throw new Error("LEAN_CANDIDATE_CI_REQUIRED: packaged proof runs only in GitHub Actions")
}

export async function packagedCandidate() {
  const output = path.join(desktop, "dist-candidate")
  const apps = await Array.fromAsync(new Bun.Glob("**/*.app/Contents/Info.plist").scan({ cwd: output }))
  assert.equal(apps.length, 1, "LEAN_CANDIDATE_PACKAGE_MISSING: expected exactly one directory app")
  const app = await realpath(path.resolve(output, apps[0]!, "../../.."))
  const resources = path.join(app, "Contents/Resources")
  // Read only the candidate's own packaged plist, never machine policy plists.
  const plist = await Bun.file(path.join(app, "Contents/Info.plist")).text()
  const field = (key: string) => {
    const value = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`))?.[1]
    assert.ok(value, `Missing candidate plist field: ${key}`)
    return value
  }
  assert.equal(field("CFBundleIdentifier"), appID)
  assert.equal(field("CFBundleDisplayName"), productName)
  const executable = path.join(app, "Contents/MacOS", field("CFBundleExecutable"))
  assert.ok(await Bun.file(executable).exists(), "Missing packaged candidate executable")
  const manifest = await Bun.file(path.join(output, "lean-candidate-build.json")).json() as BuildIdentity
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.status, "packaged")
  assert.equal(manifest.accepted, false, "Build receipt must not claim acceptance")
  assert.equal(manifest.appId, appID)
  assert.equal(manifest.productName, productName)
  assert.equal(manifest.platform, "darwin")
  assert.equal(manifest.arch, "x64")
  assert.equal(manifest.sourceCommit, process.env.GITHUB_SHA)
  assert.equal(manifest.sourceCommit, await git("rev-parse", "HEAD"))
  assert.equal(manifest.sourceTree, await git("rev-parse", "HEAD^{tree}"))
  assert.equal(manifest.treeDigest, digest(Buffer.from(await git("ls-tree", "-r", "HEAD"))))
  assert.equal(path.resolve(output, manifest.appRelativePath), app)
  assert.equal(manifest.tools.bun, "1.3.14")
  assert.match(manifest.tools.node, /^v24\./)
  const pkg = await Bun.file(path.join(desktop, "package.json")).json()
  assert.equal(manifest.tools.electron, pkg.devDependencies.electron)
  assert.equal(manifest.tools["electron-builder"], pkg.devDependencies["electron-builder"])
  assert.deepEqual(manifest.packaged, await inventory(app), "Packaged receipt differs from actual app bytes")
  for (const key of ["main", "preload", "renderer", "backend"] as const) {
    assert.ok(manifest[key].length > 0, `Empty candidate ${key} inventory`)
    assert.deepEqual(manifest[key], await inventory(key === "backend" ? path.resolve(desktop, "../orchestra/dist/node") : path.join(desktop, "out", key)),
      `Build receipt differs from actual ${key} compiler output`)
  }
  // The build receipt is evidence to retain, not an acceptance verdict.
  console.log(`candidate build identity=${JSON.stringify(manifest)}`)
  return { app, resources, executable, manifest }
}

export async function verifyCandidateArchive() {
  const candidate = await packagedCandidate()
  const require = createRequire(path.join(desktop, "package.json"))
  const builder = createRequire(require.resolve("electron-builder/package.json"))
  const library = createRequire(builder.resolve("app-builder-lib/package.json"))
  const asar = library("@electron/asar") as {
    listPackage(file: string): string[]
    extractFile(file: string, member: string): Buffer
  }
  const archive = path.join(candidate.resources, "app.asar")
  const members = asar.listPackage(archive).map((member) => member.replace(/^\//, ""))
  for (const required of ["package.json", "out/main/index.js", "out/main/sidecar.js", "out/preload/index.js", "out/renderer/index.html"])
    assert.ok(members.includes(required), `Missing packaged production entry: ${required}`)
  assert.equal(JSON.parse(asar.extractFile(archive, "package.json").toString()).main, "./out/main/index.js")
  const outputs = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: path.join(desktop, "out"), onlyFiles: true }))
  assert.ok(outputs.length > 0, "Candidate compiler output inventory is empty")
  for (const file of outputs) {
    assert.ok(members.includes(`out/${file}`), `Missing compiled candidate member: ${file}`)
    assert.deepEqual(asar.extractFile(archive, `out/${file}`), Buffer.from(await Bun.file(path.join(desktop, "out", file)).arrayBuffer()),
      `Packaged compiler output differs: ${file}`)
  }
  const fonts = outputs.filter((file) => /\.(woff2?|ttf|otf)$/.test(file))
  assert.ok(fonts.length > 0, "Missing packaged renderer fonts")
  const sourceFont = new Uint8Array(await Bun.file(path.join(repository, "packages/ui/src/assets/fonts/JetBrainsMonoNerdFontMono-Regular.woff2")).arrayBuffer())
  assert.ok(fonts.some((file) => digest(asar.extractFile(archive, `out/${file}`)) === digest(sourceFont)), "Missing byte-exact source font")
  const main = asar.extractFile(archive, "out/main/index.js").toString()
  assert.ok(main.includes(appID) && main.includes("candidate-profile:"), "Candidate isolation not compiled into main")
  assert.ok(main.includes("await-initialization"), "Missing own initialization IPC")
  const preload = asar.extractFile(archive, "out/preload/index.js").toString()
  assert.ok(preload.includes("await-initialization") && preload.includes("store-set"), "Production preload APIs missing")
  assert.ok(outputs.some((file) => file.startsWith("main/") && file.endsWith(".wasm")), "Missing backend WASM")
  const pty = members.filter((file) => file.includes("node-pty-darwin-x64/") && file.endsWith(".node"))
  assert.ok(pty.length > 0, "Missing packaged x64 native PTY addon")
  for (const file of pty) {
    const bytes = asar.extractFile(archive, file)
    assert.equal(bytes.readUInt32LE(0), 0xfeedfacf, `Expected Mach-O PTY: ${file}`)
    assert.equal(bytes.readUInt32LE(4), 0x01000007, `Expected x86_64 PTY: ${file}`)
  }
  assert.equal(candidate.manifest.nativePty.name, "@lydell/node-pty-darwin-x64")
  assert.equal(candidate.manifest.nativePty.version, "1.2.0-beta.12")
  assert.ok(candidate.manifest.nativePty.binaries.some((file) => path.basename(file.path) === "spawn-helper"), "Missing native PTY spawn-helper receipt")
  for (const file of candidate.manifest.nativePty.binaries) {
    assert.ok(!path.isAbsolute(file.path) && !file.path.split("/").includes(".."), "Unsafe PTY receipt path")
    const target = path.join(candidate.resources, "app.asar.unpacked/node_modules", candidate.manifest.nativePty.name, file.path)
    const bytes = Buffer.from(await Bun.file(target).arrayBuffer())
    assert.equal(bytes.length, file.bytes)
    assert.equal(digest(bytes), file.sha256)
    assert.equal(bytes.readUInt32LE(0), 0xfeedfacf)
    assert.equal(bytes.readUInt32LE(4), 0x01000007)
    if (path.basename(file.path) === "spawn-helper") assert.ok((await lstat(target)).mode & 0o111, "PTY spawn-helper is not executable")
  }
  const originalArchive = new Uint8Array(await Bun.file(path.join(repository, "packages/core/vendor/hugr-lean-0.2.0-native-465fb4c04773.tgz")).arrayBuffer())
  assert.equal(digest(originalArchive), archivePin, "Unapproved native Lean archive")
  const files = await new Bun.Archive(originalArchive).files()
  const names = [...files.keys()].filter((file) => file === "package/LICENSE" || file === "package/NOTICE" || file.startsWith("package/licenses/") || file.endsWith("/SOURCES.md"))
    .map((file) => file.slice("package/".length)).sort()
  assert.equal(names.length, 49, "Pinned native archive notice inventory changed")
  const notices = path.join(candidate.resources, "licenses/hugr-lean")
  const pin = await Bun.file(path.join(notices, "manifest.json")).json() as {
    commit: string; sha256: string; materials: { path: string; sha256: string }[]
  }
  assert.equal(pin.commit, "465fb4c04773f1a40733c9f4c334b980e3195646")
  assert.equal(pin.sha256, archivePin)
  assert.deepEqual(pin.materials.map((material) => material.path).sort(), names)
  for (const file of names) {
    const bytes = new Uint8Array(await files.get(`package/${file}`)!.arrayBuffer())
    assert.deepEqual(new Uint8Array(await Bun.file(path.join(notices, file)).arrayBuffer()), bytes, `Notice bytes changed: ${file}`)
    assert.equal(pin.materials.find((material) => material.path === file)!.sha256, digest(bytes))
  }
  console.log(`packaged archive sha256=${digest(new Uint8Array(await Bun.file(archive).arrayBuffer()))} notices=${names.length} fonts=${fonts.length}`)
  return candidate
}
