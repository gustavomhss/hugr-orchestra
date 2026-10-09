#!/usr/bin/env bun

// Two pre-launch falsifications only; no process-group cancellation or all-failure-class claim.
// CI supplies fresh positive reports and a trusted post-build manifest in the same batch.
// Controlled same-UID, build-owned namespace; hostile concurrent writers are excluded.
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { appendFile, copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

class ControlFailure extends Error {}
function requireControl(value: unknown, code: string): asserts value { if (!value) throw new ControlFailure(code) }
function object(value: unknown) {
  requireControl(value && typeof value === "object" && !Array.isArray(value), "CONTROL_JSON_OBJECT_REQUIRED")
  return value as Record<string, unknown>
}
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
async function hash(file: string) {
  requireControl((await lstat(file)).isFile() && await realpath(file) === file, "CONTROL_INPUT_NOT_OWNED_REGULAR")
  return sha(await readFile(file))
}
async function absent(file: string) {
  requireControl(await lstat(file).then(() => false, (error: NodeJS.ErrnoException) => {
    requireControl(error.code === "ENOENT", "CONTROL_REPORT_INSPECTION_FAILED"); return true
  }), "CONTROL_REPORT_NOT_FRESH")
}

await main().catch((error: unknown) => {
  console.error(error instanceof ControlFailure ? error.message : "DESKTOP_CONTROLS_FAILED")
  process.exitCode = 1
})
async function main() {
  const args = parseArgs({ options: Object.fromEntries(["desktop", "resources", "build-manifest", "report", "package-report", "bootstrap-report"]
    .map((key) => [key, { type: "string" as const }])), strict: true, allowPositionals: false }).values
  const paths = await Promise.all(["desktop", "resources", "build-manifest", "report", "package-report", "bootstrap-report"].map(async (key) => {
    const path = args[key]
    requireControl(typeof path === "string" && isAbsolute(path) && !path.split(/[\\/]/).includes(".."), "CONTROL_ABSOLUTE_ARGUMENT_REQUIRED")
    return key === "report" ? join(await realpath(dirname(path)), path.split(/[\\/]/).at(-1)!) : await realpath(path)
  }))
  const [desktop, resources, buildFile, report, packageReport, bootstrapReport] = paths
  requireControl(new Set(paths).size === paths.length && desktop === resolve(import.meta.dir, "../../packages/desktop"), "CONTROL_CANDIDATE_ROOT_MISMATCH")
  requireControl((await lstat(resources)).isDirectory(), "CONTROL_RESOURCES_DIRECTORY_REQUIRED")
  await absent(report)
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    ["path", "display", "systemroot", "windir", "comspec", "pathext", "lang", "lc_all"].includes(key.toLowerCase())))
  const git = spawnSync("git", ["--no-optional-locks", "-C", desktop, "rev-parse", "HEAD"], {
    encoding: "utf8", timeout: 10_000, maxBuffer: 524_288,
    env: { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
  })
  requireControl(!git.error && git.status === 0 && /^[a-f0-9]{40}$/.test(git.stdout.trim()), "CONTROL_HEAD_UNAVAILABLE")
  const scripts = [join(desktop, "../../.github/scripts/runtime-desktop-package-proof.ts"), join(desktop, "../../.github/scripts/runtime-desktop-bootstrap-proof.ts")].map((file) => resolve(file))
  const blobs = ["a3be02b0fc60b59adf2e969d308f18e6585b9939", "550187609efe2fc89f7d5e0dcac0b566bfb4345f"]
  await Promise.all(scripts.map(async (file, index) => {
    await hash(file)
    const bytes = await readFile(file)
    requireControl(createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") === blobs[index], "CONTROL_APPROVED_PROOF_SOURCE_MISMATCH")
  }))
  const positive = object(await Bun.file(packageReport).json())
  const bootstrap = object(await Bun.file(bootstrapReport).json())
  const build = object(await Bun.file(buildFile).json())
  requireControl(build.schema === 1 && build.sourceCommit === git.stdout.trim() && bootstrap.sourceCommit === build.sourceCommit &&
    bootstrap.buildManifestSha256 === await hash(buildFile), "CONTROL_BUILD_SOURCE_BINDING_FAILED")
  requireControl(positive.schema === 1 && bootstrap.schema === 1 && positive.channel === "dev" && positive.resources === resources &&
    positive.platform === process.platform && bootstrap.platform === process.platform && positive.arch === process.arch && bootstrap.arch === process.arch &&
    positive.version === bootstrap.desktopVersion && typeof positive.version === "string", "CONTROL_POSITIVE_IDENTITY_MISMATCH")
  requireControl(["hostCPUVerified", "packagedMetadataVerified", "outsideAsar", "artifactDigestsVerified", "nativeCompiledVersionVerified"].every((key) => positive[key] === true) &&
    ["healthy", "wrongCredentialRejected", "noCredentialRejected", "desktopAlive", "utilityAlive"].every((key) => bootstrap[key] === true) &&
    bootstrap.startup === "default-v1-utilityProcess" && bootstrap.readyEvidence === "production-preload-awaitInitialization-via-owned-CDP", "CONTROL_POSITIVE_NOT_COMPLETED")
  const buildTime = (await lstat(buildFile)).mtimeMs
  await Promise.all([buildFile, packageReport, bootstrapReport].map(async (file) => {
    const time = (await lstat(file)).mtimeMs
    requireControl(time >= buildTime && time <= Date.now() && Date.now() - time <= 600_000, "CONTROL_BATCH_EVIDENCE_STALE")
  }))
  const { readCliManifest, verifyCliArtifact, nativeCliTarget } = await import(pathToFileURL(join(desktop, "src/main/cli-artifacts.ts")).href) as typeof import("../../packages/desktop/src/main/cli-artifacts")
  const cli = join(resources, "cli")
  const manifest = await readCliManifest(cli)
  const target: string = nativeCliTarget(process.platform, process.arch)
  const native = manifest.artifacts.find((entry: { target: string }) => entry.target === target)
  requireControl(native && positive.target === target && manifest.version === positive.version &&
    JSON.stringify(positive.artifacts) === JSON.stringify(manifest.artifacts.map((entry) => ({ target: entry.target, file: entry.file, sha256: entry.sha256 }))), "CONTROL_NATIVE_BINDING_FAILED")
  await Promise.all(manifest.artifacts.map((entry: { target: string }) => verifyCliArtifact(cli, entry.target)))
  requireControl(positive.archiveSha256 === await hash(join(resources, "app.asar")) && positive.manifestSha256 === await hash(join(cli, "manifest.json")), "CONTROL_PACKAGE_BYTES_CHANGED")
  requireControl(Array.isArray(build.files) && build.files.length && Array.isArray(bootstrap.outputDigests), "CONTROL_BUILD_FILES_EMPTY")
  const declared = build.files
  const files = declared.map((value: unknown) => {
    const item = object(value)
    requireControl(typeof item.file === "string" && !isAbsolute(item.file) && !/[\\\x00-\x1f]/.test(item.file) &&
      item.file.split("/").every((part) => part && part !== "." && part !== "..") && typeof item.sha256 === "string" && /^[a-f0-9]{64}$/.test(item.sha256), "CONTROL_BUILD_FILE_INVALID")
    return { file: item.file, sha256: item.sha256 }
  }).sort((left, right) => left.file.localeCompare(right.file))
  requireControl(JSON.stringify(files) === JSON.stringify(bootstrap.outputDigests) && files.some((item) => item.file === "main/index.js"), "CONTROL_OUTPUT_BINDING_FAILED")
  await Promise.all(files.map(async (item) => requireControl(await hash(join(desktop, "out", item.file)) === item.sha256, "CONTROL_POSITIVE_OUTPUT_CHANGED")))
  const originals = [...new Set([buildFile, packageReport, bootstrapReport, ...scripts, resolve(import.meta.filename),
    join(desktop, "package.json"), resolve(desktop, "../orchestra/package.json"), join(desktop, "electron-builder.config.ts"),
    join(desktop, "src/main/cli-artifacts.ts"), join(resources, "app.asar"), join(cli, "manifest.json"),
    ...manifest.artifacts.map((entry: { file: string }) => join(cli, entry.file)), ...files.map((item) => join(desktop, "out", item.file))])]
  requireControl(!originals.includes(report), "CONTROL_REPORT_OVERLAPS_INPUT")
  const before = await Promise.all(originals.map(hash))
  const sandbox = await mkdtemp(join(await realpath(tmpdir()), "orchestra-desktop-controls-"))
  const state: { child?: ReturnType<typeof Bun.spawn>; interrupted: boolean } = { interrupted: false }
  const interrupt = () => { state.interrupted = true; state.child?.kill("SIGKILL") }
  process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt)
  const negative = async (script: string, params: string[], code: string, output: string) => {
    requireControl(!state.interrupted, "CONTROL_INTERRUPTED")
    await absent(output)
    const child = Bun.spawn([process.execPath, script, ...params, "--report", output], {
      env: { ...env, ORCHESTRA_VERSION: positive.version as string }, cwd: sandbox, stdin: "ignore", stdout: "pipe", stderr: "pipe",
    })
    state.child = child
    const capture = { size: 0, stopped: false }
    const stop = () => { capture.stopped = true; child.kill("SIGKILL") }
    const timer = setTimeout(stop, 30_000)
    const drain = async (stream: ReadableStream<Uint8Array>) => {
      const chunks: Buffer[] = []
      for await (const chunk of stream) { capture.size += chunk.length; if (capture.size > 524_288) stop(); if (!capture.stopped) chunks.push(Buffer.from(chunk)) }
      return Buffer.concat(chunks).toString("utf8")
    }
    const result = await Promise.all([child.exited, drain(child.stdout), drain(child.stderr)]).finally(() => clearTimeout(timer))
    state.child = undefined
    requireControl(!state.interrupted && !capture.stopped && result[0] !== 0 && result[2].trim() === code && result[1].trim() === "", "CONTROL_PRECISE_NEGATIVE_REQUIRED")
    await absent(output)
    return { matcher: code, exitCode: result[0], successReportAbsent: true }
  }
  const results = await (async () => {
    const clone = join(sandbox, "resources")
    await mkdir(join(clone, "cli"), { recursive: true, mode: 0o700 })
    await Promise.all(["app.asar", "cli/manifest.json", ...manifest.artifacts.map((entry: { file: string }) => `cli/${entry.file}`)]
      .map((file) => copyFile(join(resources, file), join(clone, file))))
    await Promise.all(manifest.artifacts.map((entry: { target: string }) => verifyCliArtifact(join(clone, "cli"), entry.target)))
    requireControl(await hash(join(clone, "app.asar")) === positive.archiveSha256 && await hash(join(clone, "cli/manifest.json")) === positive.manifestSha256, "CONTROL_CLONE_CHANGED")
    await appendFile(join(clone, "cli", native.file), Buffer.from("\nORCHESTRA_R10_NATIVE_DIGEST_CONTROL\n"))
    const packageResult = await negative(scripts[0], ["--resources", clone, "--channel", "dev"], "CLI_ARTIFACT_DIGEST_MISMATCH", join(sandbox, "package-negative.json"))
    const wrong = join(sandbox, "wrong-build.json")
    const mutated = declared.map((value: unknown) => {
      const item = object(value)
      return item.file === "main/index.js" ? { ...item, sha256: item.sha256 === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64) } : item
    })
    requireControl(declared.filter((value: unknown) => object(value).file === "main/index.js").length === 1, "CONTROL_EXACT_ONE_MUTATION_REQUIRED")
    await writeFile(wrong, JSON.stringify({ ...build, files: mutated }), { flag: "wx", mode: 0o600 })
    return [packageResult, await negative(scripts[1], ["--desktop", desktop, "--build-manifest", wrong], "BUILD_OUTPUT_DIGEST_MISMATCH", join(sandbox, "bootstrap-negative.json"))]
  })().finally(async () => {
    state.child?.kill("SIGKILL")
    if (state.child) {
      await Promise.race([state.child.exited, Bun.sleep(5_000)])
      requireControl(state.child.exitCode !== null, "CONTROL_OWNED_CHILD_CLEANUP_FAILED")
    }
    await Promise.all([
      rm(sandbox, { recursive: true, force: true }).then(() => absent(sandbox)),
      Promise.all(originals.map(hash)).then((after) => requireControl(after.every((value, index) => value === before[index]), "CONTROL_ORIGINAL_BYTES_CHANGED")),
    ]).finally(() => { process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt) })
  })
  requireControl(!state.interrupted, "CONTROL_INTERRUPTED")
  await writeFile(report, JSON.stringify({ schema: 1, scope: "two-pre-launch-digest-falsifications", sourceCommit: bootstrap.sourceCommit,
    desktop, resources, version: positive.version, channel: "dev", target, proofBlobs: blobs, results,
    positiveReportDigests: [before[originals.indexOf(packageReport)], before[originals.indexOf(bootstrapReport)]],
    preserved: originals.map((file, index) => ({ file, sha256: before[index] })), originalsPreserved: true, ownedCleanupCompleted: true }) + "\n", { flag: "wx", mode: 0o600 })
}
