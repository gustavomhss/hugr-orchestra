import assert from "node:assert/strict"
import path from "node:path"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { realpath } from "node:fs/promises"

export const desktop = path.resolve(import.meta.dir, "..")
export const repository = path.resolve(desktop, "../..")
export const appID = "ai.hugr.orchestra.lean.candidate"
export const productName = "HuGR Lean Candidate"
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const archivePin = "369206cd0a468904d7896c3e729535911e9258a7d4a3e9c8eedb078b6a096ec1"

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
  const manifest = await Bun.file(path.join(output, "lean-candidate-build.json")).json()
  assert.ok(manifest && typeof manifest === "object", "Missing candidate build identity")
  // The build receipt is evidence to retain, not an acceptance verdict.
  console.log(`candidate build identity=${JSON.stringify(manifest)}`)
  return { app, resources, executable, manifest }
}

export async function verifyCandidateArchive() {
  const candidate = await packagedCandidate()
  const require = createRequire(path.join(desktop, "package.json"))
  const asar = require("@electron/asar") as {
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
