// Hosted-only preparation. One compiled CLI, source-pinned release native files, isolated pinned LSP tools.
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { cli, LOGS, ORCHESTRA, ROOT, win } from "./lib.ts"

export const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex")

async function command(args: string[], cwd = ROOT, timeout = 240_000) {
  const child = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe", timeout,
    env: { ...process.env, ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "0" } })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (code !== 0) throw new Error(`${args.join(" ")} exited ${code}: ${stdout}\n${stderr}`)
  return stdout.trim()
}

export async function prepare() {
  if (!process.env.CI || !process.env.GITHUB_SHA) throw new Error("functional matrix requires hosted CI; owner Mac execution forbidden")
  const sourceSHA = await command(["git", "rev-parse", "HEAD"])
  if (sourceSHA !== process.env.GITHUB_SHA) throw new Error("checkout/GITHUB_SHA mismatch")
  const tracked = (await command(["git", "ls-files", "-z"])).split("\0").filter(Boolean)
  const nativeFiles = tracked.filter((file) => /^packages\/omni\/(crates\/|Cargo\.(toml|lock)$|rust-toolchain\.toml$|\.cargo\/|bindings\/node\/(src\/|Cargo\.toml$|build\.rs$))/.test(file)).sort()
  if (!nativeFiles.includes("packages/omni/Cargo.lock") || !nativeFiles.some((file) => file.includes("crates/omni-supervisor/src/")))
    throw new Error("native provenance enumeration incomplete")
  const sources = tracked.filter((file) => /^packages\/(core|orchestra|server|protocol|schema|llm)\/(src\/|package\.json$)/.test(file))
    .concat("bun.lock", "packages/orchestra/script/build.ts", ".github/actions/omni-binaries/action.yml")
  const sourceHashes = Object.fromEntries(sources.map((file) => [file, digest(path.join(ROOT, file))]))
  const nativeSourceHashes = Object.fromEntries(nativeFiles.map((file) => [file, digest(path.join(ROOT, file))]))
  const nativeSourceDigest = createHash("sha256").update(Buffer.concat(nativeFiles.map((file) => Buffer.from(nativeSourceHashes[file]!, "hex")))).digest("hex")
  const addon = process.env.HUGR_OMNI_ADDON
  const supervisor = process.env.HUGR_OMNI_SUPERVISOR
  if (!addon || !supervisor || !existsSync(addon) || !existsSync(supervisor) ||
    [addon, supervisor].some((file) => !path.resolve(file).startsWith(path.join(ROOT, "packages/omni/target/release") + path.sep)))
    throw new Error("matrix requires exact-source omni-binaries action release artifacts")
  const platform = win ? "win32-x64-msvc" : process.platform === "darwin" ? `darwin-${process.arch}` : `linux-${process.arch}-gnu`
  const artifacts = path.join(LOGS, "native", platform)
  mkdirSync(artifacts, { recursive: true })
  copyFileSync(addon, path.join(artifacts, "hugr_omni.node"))
  copyFileSync(supervisor, path.join(artifacts, win ? "hugr-omni-supervisor.exe" : "hugr-omni-supervisor"))
  const buildAt = new Date().toISOString()
  process.env.OMNI_ARTIFACTS = path.dirname(artifacts)
  console.log("MATRIX_BUILD_START " + JSON.stringify({ sourceSHA, buildAt, nativeSourceDigest, addonSha256: digest(addon), supervisorSha256: digest(supervisor) }))
  const build = await command([process.execPath, "script/build.ts", "--single", "--skip-install", "--skip-embed-web-ui"], ORCHESTRA)
  writeFileSync(path.join(LOGS, "matrix-build.log"), build)
  const bin = cli()
  if (digest(path.join(path.dirname(bin), "hugr_omni.node")) !== digest(addon) ||
    digest(path.join(path.dirname(bin), win ? "hugr-omni-supervisor.exe" : "hugr-omni-supervisor")) !== digest(supervisor))
    throw new Error("compiled CLI native artifacts differ from exact-source release inputs")
  const provenance = { sourceSHA, at: buildAt, completedAt: new Date().toISOString(), cliSha256: digest(bin), sourceHashes,
    nativeSourceHashes, nativeSourceDigest, nativeProvenance: "omni-binaries exact-source cache key; release build on miss",
    addonSha256: digest(addon), supervisorSha256: digest(supervisor), platform, ciRun: process.env.GITHUB_RUN_ID }
  writeFileSync(path.join(LOGS, "cli-provenance.json"), JSON.stringify(provenance, null, 2))
  process.env.OMNI_CAMPAIGN_CLI = bin
  process.env.OMNI_CAMPAIGN_BUILD_SHA = sourceSHA
  process.env.ORCHESTRA_LOCAL_TESTS = "1"
  const tools = path.join(LOGS, "tools")
  mkdirSync(tools, { recursive: true })
  const npm = win ? ["cmd.exe", "/d", "/s", "/c", "npm"] : ["npm"]
  await command([...npm, "install", "--prefix", tools, "--ignore-scripts", "--no-audit", "--no-fund", "typescript-language-server@4.3.4", "typescript@5.8.2"])
  process.env.OMNI_CAMPAIGN_LSP_TOOLS = path.join(tools, "node_modules")
  const node = await command(["node", "-p", "JSON.stringify({execPath:process.execPath,version:process.version,bun:!!process.versions.bun})"])
  const actualNode = JSON.parse(node) as { execPath: string; version: string; bun: boolean }
  if (actualNode.bun || !existsSync(actualNode.execPath)) throw new Error("LSP runtime must be native Node, not Bun")
  process.env.OMNI_CAMPAIGN_NODE = actualNode.execPath
  if (win) {
    const candidates = ["C:/Program Files/Git/usr/bin/vim.exe", "C:/Program Files/Vim/vim91/vim.exe"]
    const editor = candidates.find(existsSync)
    if (editor) process.env.OMNI_CAMPAIGN_VIM = editor
    // Absence stays a named red editor capability; never substitute a terminal-shaped fixture.
  }
  console.log("MATRIX_PROVENANCE " + JSON.stringify({ ...provenance, sourceHashes: {
    "bun.lock": sourceHashes["bun.lock"], "packages/orchestra/src/lsp/client.ts": sourceHashes["packages/orchestra/src/lsp/client.ts"],
    "packages/orchestra/src/lsp/lsp.ts": sourceHashes["packages/orchestra/src/lsp/lsp.ts"],
  }, nativeSourceHashes: undefined, node: actualNode, nodeSha256: digest(actualNode.execPath) }))
  return provenance
}
