import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { chmod, mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises"
import { RipgrepRelease } from "@orchestra/core/ripgrep/release"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { cliRipgrepKey, omniCompanions, OmniPairMissingError, readCliManifest, verifyCliArtifact } from "../src/main/cli-artifacts"
import { stageCliArtifacts, desktopCliTargets } from "./cli-staging"
// The pair's names come from the installer, so staging is held to what the WSL install reads.
import { installGuestScript, installWslArtifact } from "../src/main/wsl/artifact"
import { installCliArtifact } from "../src/main/cli-install"
import { writeTreeSitterBundle } from "../src/main/cli-tree-sitter.fixture"
import { fixtureSignature, writeRipgrepBundle } from "../src/main/cli-ripgrep.fixture"
import { verifyPackagedCli } from "./cli-packaging"

// Every test here creates, copies and deletes tens to hundreds of small files, and windows-latest stalls file I/O. In
// instrumented Windows runs (test-ci 38284863937, 38285164351, 38285411114, 38285164170) a test's slow time was spent
// off-CPU: 0.9 s wall for 0.09 s CPU, with one synchronous copy or mkdir in staging blocking up to 0.8 s; inside the
// whole desktop suite, 2.6 s wall for 0.4 s CPU. In 43 full test.yml lanes (2026-10-11/12) a test ran up to 17.8x its
// own median and two lanes timed out at Bun's 5 s default. With rg in the bundle (#357) the slowest median on
// windows-latest is 1.3 s (22 runs, max 5.2 s). 45 s is about twice 17.8x that median. No test waits on a clock or
// another process except the build-helper child, which has its own 15 s limit. A hang that still does I/O fails after
// 45 s. One that idles on a promise fails then on Linux and macOS, but Bun 1.3.14 on Windows enforces a test timeout
// only while a timer is pending (test-ci 38294402595, 38297239678), so there the step limit stops it, as at 5 s.
const STAGING_TIMEOUT = 45_000

const roots: string[] = []
// The packaging checks with the stand-in signature for the fixture's "signed" rg.
const checks = { signature: (file: string) => fixtureSignature(file) }
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
// Every CLI ships its omni pair next to the binary, as the shared omni build step leaves the files in dist, and
// every CLI ships its tree-sitter in bin/tree-sitter and its rg in bin/ripgrep.
async function fixture(targets = ["linux-x64-baseline"], binary = (target: string) => `owned ${target}`) {
  const root = await mkdtemp(join(tmpdir(), "orchestra-stage-test-"))
  roots.push(root)
  const dist = join(root, "dist")
  await Promise.all(
    targets.map(async (target) => {
      const dir = join(dist, `cli-${target}`)
      await mkdir(join(dir, "bin"), { recursive: true })
      await writeFile(join(dir, "package.json"), JSON.stringify({ version: "1.18.27" }))
      await writeFile(join(dir, "bin", target.startsWith("windows-") ? "orchestra.exe" : "orchestra"), binary(target))
      await writeTreeSitterBundle(join(dir, "bin", "tree-sitter"), target)
      await writeRipgrepBundle(join(dir, "bin", "ripgrep"), cliRipgrepKey(target)!)
      await Promise.all(omniCompanions(target).map((name) => writeFile(join(dir, "bin", name), `${name} ${target}`)))
    }),
  )
  // Staged rg stand-ins are "signed" (cli-ripgrep.fixture.ts), so staging checks them with the stand-in signature.
  return { root, dist, directory: join(root, "cli"), version: "1.18.27", targets, signature: fixtureSignature }
}

test("staging hashes signed bytes, preserves target/version and replaces stale resources", async () => {
  const input = await fixture()
  await stageCliArtifacts({
    ...input,
    sign: async (path, _target, kind) => {
      if (kind === "cli") await writeFile(path, "signed owned bytes")
    },
  })
  const manifest = await readCliManifest(input.directory)
  expect(manifest.version).toBe(input.version)
  expect(manifest.artifacts[0]!.sha256).toBe(createHash("sha256").update("signed owned bytes").digest("hex"))
  const verified = await verifyCliArtifact(input.directory, input.targets[0]!)
  expect(await readFile(verified.path, "utf8")).toBe("signed owned bytes")
  await writeFile(verified.path, "foreign cache")
  await stageCliArtifacts(input)
  expect(await readFile((await verifyCliArtifact(input.directory, input.targets[0]!)).path, "utf8")).toBe(
    `owned ${input.targets[0]}`,
  )
}, STAGING_TIMEOUT)

test("staging rejects unexpected W2 output/version and preserves previous manifest", async () => {
  const input = await fixture()
  await stageCliArtifacts(input)
  const before = await readFile(join(input.directory, "manifest.json"), "utf8")
  await writeFile(join(input.dist, `cli-${input.targets[0]}`, "package.json"), JSON.stringify({ version: "local" }))
  await expect(stageCliArtifacts(input)).rejects.toThrow("version")
  expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
  await writeFile(
    join(input.dist, `cli-${input.targets[0]}`, "package.json"),
    JSON.stringify({ version: input.version }),
  )
  await rm(join(input.dist, `cli-${input.targets[0]}`, "bin", "orchestra"))
  await expect(stageCliArtifacts(input)).rejects.toThrow()
  expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
}, STAGING_TIMEOUT)

test("Windows staging carries both Linux WSL architectures", async () => {
  const targets = desktopCliTargets("win32", "arm64")
  expect(targets).toEqual(["windows-arm64", "linux-arm64", "linux-x64-baseline"])
  const input = await fixture(targets)
  await stageCliArtifacts(input)
  expect((await readCliManifest(input.directory)).artifacts.map((entry) => entry.target)).toEqual(targets)
  await Promise.all(targets.map((target) => verifyCliArtifact(input.directory, target)))
}, STAGING_TIMEOUT)

test("every staged CLI's omni pair lands in omni-<target>/ and a partial bundle refuses staging", async () => {
  const input = await fixture(desktopCliTargets("win32", "x64"))
  await stageCliArtifacts(input)
  await Promise.all(
    input.targets.flatMap((target) =>
      omniCompanions(target).map(async (name) => {
        const path = join(input.directory, `omni-${target}`, name)
        expect(await readFile(path, "utf8")).toBe(`${name} ${target}`)
        if (process.platform !== "win32" && name === "hugr-omni-supervisor")
          expect((await stat(path)).mode & 0o777).toBe(0o755)
      }),
    ),
  )
  const before = await readFile(join(input.directory, "manifest.json"), "utf8")
  for (const name of omniCompanions("linux-arm64")) {
    const path = join(input.dist, "cli-linux-arm64", "bin", name)
    await rename(path, `${path}.away`)
    const error = await stageCliArtifacts(input).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(OmniPairMissingError)
    expect((error as Error).message).toContain(`linux-arm64: ${path}`)
    expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
    expect(await readFile(join(input.directory, "omni-linux-arm64", name), "utf8")).toBe(`${name} linux-arm64`)
    await rename(`${path}.away`, path)
  }
  const windowsNode = join(input.dist, "cli-windows-x64-baseline", "bin", "hugr_omni.node")
  await rename(windowsNode, `${windowsNode}.away`)
  const error = await stageCliArtifacts(input).catch((error: unknown) => error)
  expect(error).toBeInstanceOf(OmniPairMissingError)
  expect((error as Error).message).toContain(`windows-x64-baseline: ${windowsNode}`)
  await rename(`${windowsNode}.away`, windowsNode)
  // A missing Linux CLI fails the Windows build as well.
  await rm(join(input.dist, "cli-linux-x64-baseline"), { recursive: true })
  await expect(stageCliArtifacts(input)).rejects.toThrow()
  expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
  // A native bundle stages the same pair with it: the binary, its omni pair, its tree-sitter and its rg.
  const native = await fixture()
  await stageCliArtifacts(native)
  expect((await readdir(native.directory)).sort()).toEqual([
    "manifest.json",
    "omni-linux-x64-baseline",
    "orchestra-linux-x64-baseline",
    "ripgrep-linux-x64-baseline",
    "tree-sitter-linux-x64-baseline",
  ])
}, STAGING_TIMEOUT)

test("prebuilt handoff carries the omni pair and refuses a producer without it", async () => {
  const input = await fixture(desktopCliTargets("win32", "x64"))
  await stageCliArtifacts(input)
  const received = { ...input, dist: join(input.root, "no-local-build"), prebuilt: input.directory, directory: join(input.root, "consumer") }
  await stageCliArtifacts(received)
  expect(await readFile(join(received.directory, "omni-linux-x64-baseline", "hugr_omni.node"), "utf8")).toBe(
    "hugr_omni.node linux-x64-baseline",
  )
  await rm(join(input.directory, "omni-linux-x64-baseline", "hugr-omni-supervisor"))
  await expect(stageCliArtifacts(received)).rejects.toBeInstanceOf(OmniPairMissingError)
  await expect(verifyPackagedCli(input.directory, "win32", "x64", input.version, checks)).rejects.toBeInstanceOf(
    OmniPairMissingError,
  )
}, STAGING_TIMEOUT)

test("WSL install accepts the staged Windows bundle end to end through the real artifact reader", async () => {
  // Like the real omni CLI preflight, the guest binary exits early unless the pair sits next to it.
  const input = await fixture(desktopCliTargets("win32", "x64"), (target) =>
    target.startsWith("linux-")
      ? `#!/bin/bash\n[[ -f "\${0%/*}/hugr_omni.node" && -x "\${0%/*}/hugr-omni-supervisor" ]] || exit 9\nprintf '1.18.27\\n'\n`
      : `owned ${target}`,
  )
  await stageCliArtifacts(input)
  const home = join(input.root, "home")
  await mkdir(home)
  const sha = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex")
  // wslpath: a Linux host path is already the guest path; a Windows one maps under /mnt/<drive>.
  const guest = (path: string) =>
    process.platform === "win32" ? path.replace(/^([A-Za-z]):/, (_, drive: string) => `/mnt/${drive.toLowerCase()}`).replaceAll("\\", "/") : path
  const installs: string[][] = []
  await installWslArtifact("Ubuntu", input.version, {
    directory: input.directory,
    // The staged stand-in rg is the guest's "pinned" executable here; the real pin is checked in core.
    ripgrepPin: (target) => createHash("sha256").update(`rg ${cliRipgrepKey(target)}`).digest("hex"),
    run: async (args) => {
      if (args[0] === "bash") return { code: 0, signal: null, stdout: "x86_64\nglibc 2.39\n", stderr: "" }
      if (args[0] === "wslpath") return { code: 0, signal: null, stdout: guest(args[3]!), stderr: "" }
      installs.push(args)
      // The guest script needs GNU coreutils; elsewhere the arguments it would receive are checked below.
      if (process.platform !== "linux") return { code: 0, signal: null, stdout: "", stderr: "" }
      const child = Bun.spawn(args, { env: { ...process.env, HOME: home }, cwd: home, stdout: "pipe", stderr: "pipe" })
      const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
      return { code, signal: null, stdout, stderr }
    },
  })
  const omni = join(input.directory, "omni-linux-x64-baseline")
  const binary = await verifyCliArtifact(input.directory, "linux-x64-baseline")
  expect(installs).toEqual([[
    "timeout", "--kill-after=1s", "18s", "bash", "-c", installGuestScript, "orchestra-install",
    guest(binary.path), await sha(binary.path), input.version,
    guest(join(omni, "hugr_omni.node")), await sha(join(omni, "hugr_omni.node")),
    guest(join(omni, "hugr-omni-supervisor")), await sha(join(omni, "hugr-omni-supervisor")),
    guest(join(input.directory, "tree-sitter-linux-x64-baseline")), expect.stringMatching(/^[a-f0-9]{64}$/),
    guest(join(input.directory, "ripgrep-linux-x64-baseline", "rg")),
    await sha(join(input.directory, "ripgrep-linux-x64-baseline", "rg")),
  ]])
  // On Linux the real guest script ran and accepted the host's tree-sitter digest.
  if (process.platform !== "linux") return
  await Promise.all(
    [...omniCompanions("linux-x64-baseline"), "orchestra"].map(async (name) =>
      expect(await sha(join(home, ".orchestra/bin", name))).toBe(
        await sha(name === "orchestra" ? binary.path : join(omni, name)),
      ),
    ),
  )
  const binding = join("tree-sitter-typescript", "prebuilds", "linux-x64", "tree-sitter-typescript.node")
  expect(await sha(join(home, ".orchestra/bin/tree-sitter", binding))).toBe(
    await sha(join(input.directory, "tree-sitter-linux-x64-baseline", binding)),
  )
  // The guest CLI finds rg in ripgrep/ beside itself (packages/core/src/ripgrep/binary.ts), executable.
  expect(await sha(join(home, ".orchestra/bin/ripgrep/rg"))).toBe(
    await sha(join(input.directory, "ripgrep-linux-x64-baseline", "rg")),
  )
  expect((await stat(join(home, ".orchestra/bin/ripgrep/rg"))).mode & 0o777).toBe(0o755)
}, STAGING_TIMEOUT)

test("every staged CLI ships its pinned rg in ripgrep-<target>/, signed by the CLI hook, or the build stops", async () => {
  const signed: string[] = []
  const input = {
    ...(await fixture(desktopCliTargets("win32", "x64"))),
    // The CLI's own signing hook signs the rg it ships too: it rewrites the bytes a signature would.
    sign: async (path: string, target: string, kind: "cli" | "ripgrep") => {
      signed.push(`${kind} ${target}`)
      if (kind === "ripgrep") await writeFile(path, `rg ${cliRipgrepKey(target)}`)
    },
    signing: (target: string) => (target.startsWith("windows-") ? ("required" as const) : undefined),
  }
  await stageCliArtifacts(input)
  expect(signed.toSorted()).toEqual(
    ["linux-arm64", "linux-x64-baseline", "windows-x64-baseline"]
      .flatMap((target) => [`cli ${target}`, `ripgrep ${target}`])
      .toSorted(),
  )
  await verifyPackagedCli(input.directory, "win32", "x64", input.version, checks)
  for (const [target, key, name] of [
    ["windows-x64-baseline", "x64-win32", "rg.exe"],
    ["linux-arm64", "arm64-linux", "rg"],
    ["linux-x64-baseline", "x64-linux", "rg"],
  ] as const) {
    const manifest = JSON.parse(await readFile(join(input.directory, `ripgrep-${target}`, "manifest.json"), "utf8"))
    expect(manifest.key).toBe(key)
    expect(manifest.executable.sha256).toBe(RipgrepRelease.archive(key)!.executable)
    expect(await readFile(join(input.directory, `ripgrep-${target}`, name), "utf8")).toBe(`rg ${key}`)
    if (process.platform !== "win32" && name === "rg")
      expect((await stat(join(input.directory, `ripgrep-${target}`, name))).mode & 0o777).toBe(0o755)
  }
  // A producer directory hands its staged copies on.
  const received = { ...input, dist: join(input.root, "no-local-build"), prebuilt: input.directory, directory: join(input.root, "consumer") }
  await stageCliArtifacts(received)
  expect(await readFile(join(received.directory, "ripgrep-linux-arm64", "rg"), "utf8")).toBe("rg arm64-linux")
  // A target whose build signs refuses an rg the hook left unsigned (here: the pinned bytes are impossible, so any
  // unsigned rg fails the signature instead).
  const before = await readFile(join(input.directory, "manifest.json"), "utf8")
  await expect(stageCliArtifacts({ ...input, sign: undefined, signature: async () => false })).rejects.toThrow(
    "has no valid signature",
  )
  // The build stops when an rg is missing or is not the pinned build for its CPU, keeping what was staged.
  const built = join(input.dist, "cli-linux-arm64", "bin", "ripgrep")
  await rename(built, `${built}.away`)
  await expect(stageCliArtifacts(input)).rejects.toThrow("ripgrep bundle missing")
  await writeRipgrepBundle(built, "x64-linux")
  await expect(stageCliArtifacts(input)).rejects.toThrow("is not the pinned ripgrep")
  expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
  await rm(built, { recursive: true })
  await rename(`${built}.away`, built)
  // The packaging check (beforePack, afterPack, afterSign) refuses a bundle whose rg changed after signing or is gone,
  // for the native target as for a guest.
  for (const target of ["windows-x64-baseline", "linux-x64-baseline"]) {
    const staged = join(input.directory, `ripgrep-${target}`, target.startsWith("windows-") ? "rg.exe" : "rg")
    const original = await readFile(staged)
    await writeFile(staged, "changed")
    await expect(verifyPackagedCli(input.directory, "win32", "x64", input.version, checks)).rejects.toThrow(
      "has no valid signature",
    )
    await rm(staged)
    await expect(verifyPackagedCli(input.directory, "win32", "x64", input.version, checks)).rejects.toThrow(
      "missing its executable",
    )
    await writeFile(staged, original, { mode: 0o755 })
  }
  await verifyPackagedCli(input.directory, "win32", "x64", input.version, checks)
  // RIPGREP_BUNDLED=false (Nix: rg on the wrapper PATH) stages none and the packaging check expects none.
  const previous = process.env.RIPGREP_BUNDLED
  process.env.RIPGREP_BUNDLED = "false"
  try {
    const nix = await fixture(["linux-x64-baseline"])
    await stageCliArtifacts(nix)
    expect(await readdir(nix.directory)).not.toContain("ripgrep-linux-x64-baseline")
    await verifyPackagedCli(nix.directory, "linux", "x64", nix.version)
  } finally {
    if (previous === undefined) delete process.env.RIPGREP_BUNDLED
    else process.env.RIPGREP_BUNDLED = previous
  }
}, STAGING_TIMEOUT)

test("the installed CLI takes its bundle's rg along, checked against the pin, and an install missing it is repaired", async () => {
  const input = await fixture(["darwin-arm64"])
  await stageCliArtifacts(input)
  const cache = join(input.root, "cache")
  const installed = await installCliArtifact(input.directory, "darwin-arm64", cache, { signature: fixtureSignature })
  // The compiled CLI runs ripgrep/rg beside itself (packages/core/src/ripgrep/binary.ts).
  const rg = join(dirname(installed.path), "ripgrep", "rg")
  expect(await readFile(rg, "utf8")).toBe("rg arm64-darwin")
  await rm(join(dirname(installed.path), "ripgrep"), { recursive: true })
  await installCliArtifact(input.directory, "darwin-arm64", cache, { signature: fixtureSignature })
  expect(await readFile(rg, "utf8")).toBe("rg arm64-darwin")
  // Without a signature check a signed rg is not the pinned executable, so the install refuses it.
  await rm(join(dirname(installed.path), "ripgrep"), { recursive: true })
  await expect(installCliArtifact(input.directory, "darwin-arm64", cache)).rejects.toThrow(
    "differs from the pinned archive's",
  )
  // A bundle rg changed after signing, or gone, refuses the install by name.
  const bundled = join(input.directory, "ripgrep-darwin-arm64", "rg")
  await writeFile(bundled, "changed")
  await expect(installCliArtifact(input.directory, "darwin-arm64", cache, { signature: fixtureSignature })).rejects.toThrow(
    "has no valid signature",
  )
  await rm(bundled)
  await expect(installCliArtifact(input.directory, "darwin-arm64", cache, { signature: fixtureSignature })).rejects.toThrow(
    "missing its executable",
  )
}, STAGING_TIMEOUT)

test("the installed CLI carries its bundle's omni pair beside the binary, and a cache without it is re-installed", async () => {
  const input = await fixture(["darwin-arm64"])
  await stageCliArtifacts(input)
  const cache = join(input.root, "cache")
  const installed = await installCliArtifact(input.directory, "darwin-arm64", cache, { signature: fixtureSignature })
  const directory = dirname(installed.path)
  for (const name of omniCompanions("darwin-arm64"))
    expect(await readFile(join(directory, name), "utf8")).toBe(`${name} darwin-arm64`)
  if (process.platform !== "win32")
    expect((await stat(join(directory, "hugr-omni-supervisor"))).mode & 0o777).toBe(0o755)
  // A 0.2.1-era cache without the pair is rebuilt in place, pair included, not returned as installed.
  await Promise.all(omniCompanions("darwin-arm64").map((name) => rm(join(directory, name))))
  await installCliArtifact(input.directory, "darwin-arm64", cache, { signature: fixtureSignature })
  for (const name of omniCompanions("darwin-arm64"))
    expect(await readFile(join(directory, name), "utf8")).toBe(`${name} darwin-arm64`)

  const windowsInput = await fixture(["windows-x64-baseline"])
  await stageCliArtifacts(windowsInput)
  const windowsCache = join(windowsInput.root, "cache")
  const windowsInstalled = await installCliArtifact(windowsInput.directory, "windows-x64-baseline", windowsCache, { signature: fixtureSignature })
  const windowsDirectory = dirname(windowsInstalled.path)
  for (const name of omniCompanions("windows-x64-baseline"))
    expect(await readFile(join(windowsDirectory, name), "utf8")).toBe(`${name} windows-x64-baseline`)
  // A 0.2.1-era cache without the pair is rebuilt in place, pair included, not returned as installed.
  await Promise.all(omniCompanions("windows-x64-baseline").map((name) => rm(join(windowsDirectory, name))))
  await installCliArtifact(windowsInput.directory, "windows-x64-baseline", windowsCache, { signature: fixtureSignature })
  expect(await readFile(join(windowsDirectory, "hugr_omni.node"), "utf8")).toBe("hugr_omni.node windows-x64-baseline")
  expect(await readFile(join(windowsDirectory, "hugr-omni-supervisor.exe"), "utf8")).toBe("hugr-omni-supervisor.exe windows-x64-baseline")
}, STAGING_TIMEOUT)

test("installCliArtifact rejects a source bundle without its omni pair", async () => {
  const input = await fixture(["darwin-arm64"])
  await stageCliArtifacts(input)
  await rm(join(input.directory, "omni-darwin-arm64"), { recursive: true })
  const cache = join(input.root, "cache")
  await expect(installCliArtifact(input.directory, "darwin-arm64", cache, { signature: fixtureSignature })).rejects.toBeInstanceOf(OmniPairMissingError)
}, STAGING_TIMEOUT)

test("prebuilt handoff verifies producer bytes before native signing and preserves output on mismatch", async () => {
  const input = await fixture(desktopCliTargets("win32", "x64"))
  await stageCliArtifacts(input)
  const producer = await readFile(join(input.directory, "manifest.json"), "utf8")
  const received = {
    ...input,
    dist: join(input.root, "no-local-build"),
    prebuilt: input.directory,
    directory: join(input.root, "consumer"),
    sign: async (path: string, target: string, kind: "cli" | "ripgrep") => {
      if (kind === "ripgrep") return
      expect(await readFile(path, "utf8")).toBe(`owned ${target}`)
      if (target.startsWith("windows-")) await writeFile(path, `signed ${target}`)
    },
  }
  await stageCliArtifacts(received)
  const manifest = await readCliManifest(received.directory)
  expect(manifest.artifacts.map((entry) => entry.target)).toEqual(input.targets)
  expect(manifest.artifacts[0]!.sha256).toBe(createHash("sha256").update(`signed ${input.targets[0]}`).digest("hex"))
  expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(producer)
  expect(await readFile((await verifyCliArtifact(input.directory, input.targets[0]!)).path, "utf8")).toBe(`owned ${input.targets[0]}`)
  const before = await readFile(join(received.directory, "manifest.json"), "utf8")
  await expect(stageCliArtifacts({ ...received, version: "wrong-version" })).rejects.toThrow("version")
  const native = await fixture([input.targets[0]!])
  await stageCliArtifacts(native)
  await expect(stageCliArtifacts({ ...received, prebuilt: native.directory })).rejects.toThrow("missing")
  const guest = await verifyCliArtifact(input.directory, "linux-arm64")
  await writeFile(guest.path, "changed in transit")
  await expect(stageCliArtifacts(received)).rejects.toThrow("digest")
  expect(await readFile(join(received.directory, "manifest.json"), "utf8")).toBe(before)
}, STAGING_TIMEOUT)

test("build helper uses explicit or environment prebuilt input without compiler fallback", async () => {
  const input = await fixture()
  await stageCliArtifacts(input)
  await writeFile(join(input.directory, "manifest.json"), "{}")
  await Promise.all(["explicit", "environment"].map(async (source) => {
    const worker = Bun.spawn([process.execPath, "-e", `
      const { buildCliToResources } = await import(${JSON.stringify(new URL("./utils.ts", import.meta.url).href)});
      await buildCliToResources(${source === "explicit" ? JSON.stringify({ prebuilt: input.directory }) : "{}"})
        .then(() => { throw new Error("Invalid prebuilt input accepted"); })
        .catch((error) => { console.log(error.message); process.exit(0); });
    `], {
      cwd: join(import.meta.dir, ".."), timeout: 15000, stdout: "pipe", stderr: "pipe",
      env: { ...process.env, PATH: "", RUST_TARGET: "", ORCHESTRA_VERSION: input.version,
        ORCHESTRA_CLI_PREBUILT_DIR: source === "environment" ? input.directory : "" },
    })
    const [code, stdout, stderr] = await Promise.all([worker.exited, new Response(worker.stdout).text(), new Response(worker.stderr).text()])
    if (code !== 0) throw new Error(`Prebuilt helper child failed: ${stderr}`)
    expect(stdout.trim()).toBe("Invalid CLI manifest schema/version/artifacts")
  }))
}, STAGING_TIMEOUT)

test("prebuilt source/output overlap is rejected before signing or replacing producer", async () => {
  const input = await fixture(desktopCliTargets("win32", "x64"))
  await stageCliArtifacts(input)
  const before = await readFile(join(input.directory, "manifest.json"), "utf8")
  const alias = join(input.root, "producer-alias")
  await symlink(input.directory, alias, process.platform === "win32" ? "junction" : "dir")
  await mkdir(join(input.root, "child"))
  await mkdir(join(input.root, "other"))
  await symlink(join(input.root, "child"), join(input.root, "other", "alias"), process.platform === "win32" ? "junction" : "dir")
  const signed: string[] = []
  // POSIX traverses the symlink before '..'; keep the raw spelling rather than
  // letting path.join normalize it into a different destination.
  const traversal = process.platform === "win32" ? [] : [`${join(input.root, "other", "alias")}/../cli`]
  await [...traversal, input.directory, alias, join(input.directory, "consumer"), join(alias, "new", "consumer"), input.root].reduce(async (previous, directory) => {
    await previous
    await expect(stageCliArtifacts({
      ...input, prebuilt: input.directory, directory, targets: ["linux-x64-baseline"],
      sign: async (_path, target) => { signed.push(target) },
    })).rejects.toThrow("overlap")
    expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
    await Promise.all(input.targets.map((target) => verifyCliArtifact(input.directory, target)))
  }, Promise.resolve())
  await expect(stageCliArtifacts({ ...input, prebuilt: `${input.directory}/../cli`, directory: join(input.root, "consumer") })).rejects.toThrow("ambiguous traversal")
  await expect(stageCliArtifacts({ ...input, prebuilt: input.directory, directory: `${input.directory}\\..\\consumer` })).rejects.toThrow("ambiguous traversal")
  expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
  expect(signed).toEqual([])
}, STAGING_TIMEOUT)

test("installed cache checks bytes, repairs tampering, rejects tampered source", async () => {
  const input = await fixture()
  await stageCliArtifacts(input)
  const cache = join(input.root, "cache")
  const first = await installCliArtifact(input.directory, input.targets[0]!, cache, { signature: fixtureSignature })
  await writeFile(first.path, "foreign cache")
  const repaired = await installCliArtifact(input.directory, input.targets[0]!, cache, { signature: fixtureSignature })
  expect(await readFile(repaired.path, "utf8")).toBe(`owned ${input.targets[0]}`)
  expect(repaired.version).toBe(input.version)
  const bundled = await verifyCliArtifact(input.directory, input.targets[0]!)
  await writeFile(bundled.path, "foreign source")
  await expect(installCliArtifact(input.directory, input.targets[0]!, cache, { signature: fixtureSignature })).rejects.toThrow("digest")
  expect(await readFile(first.path, "utf8")).toBe(`owned ${input.targets[0]}`)
}, STAGING_TIMEOUT)

test("every CLI target carries its tree-sitter through staging, handoff, packaging and install, or stops by name", async () => {
  const input = await fixture(desktopCliTargets("win32", "x64"))
  await stageCliArtifacts(input)
  await verifyPackagedCli(input.directory, "win32", "x64", input.version, checks)
  const before = await readFile(join(input.directory, "manifest.json"), "utf8")
  const binding = join("tree-sitter", "prebuilds", "linux-arm64", "tree-sitter.node")
  const built = join(input.dist, "cli-linux-arm64", "bin", "tree-sitter", binding)
  const arm = await readFile(built)
  // A missing binding, or one for another CPU, fails the build and keeps the previous resources.
  for (const replace of [() => rm(built), () => writeFile(built, Buffer.alloc(128))]) {
    await replace()
    await expect(stageCliArtifacts(input)).rejects.toThrow(`TREE_SITTER_BUNDLE_INCOMPLETE: linux-arm64`)
    expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
    await writeFile(built, arm)
  }
  // A producer directory hands its staged copies on.
  const received = { ...input, dist: join(input.root, "no-local-build"), prebuilt: input.directory, directory: join(input.root, "consumer") }
  await stageCliArtifacts(received)
  expect(await readFile(join(received.directory, "tree-sitter-linux-arm64", binding))).toEqual(arm)
  // The packaging check refuses a bundle without it, for the native target as for a guest.
  for (const target of ["windows-x64-baseline", "linux-arm64"]) {
    const staged = join(received.directory, `tree-sitter-${target}`)
    await rename(staged, `${staged}.away`)
    await expect(verifyPackagedCli(received.directory, "win32", "x64", input.version, checks)).rejects.toThrow(
      `TREE_SITTER_BUNDLE_INCOMPLETE: ${target.startsWith("windows-") ? "win32-x64" : "linux-arm64"}`,
    )
    await rename(`${staged}.away`, staged)
  }
  // The installed CLI finds its tree-sitter beside itself; an install missing it is repaired.
  const cache = join(input.root, "cache")
  const installed = await installCliArtifact(received.directory, "windows-x64-baseline", cache, { signature: fixtureSignature })
  const index = join(dirname(installed.path), "tree-sitter", "tree-sitter", "index.js")
  expect(await readFile(index, "utf8")).toBe("tree-sitter/index.js windows-x64-baseline")
  await rm(index)
  await installCliArtifact(received.directory, "windows-x64-baseline", cache, { signature: fixtureSignature })
  expect(await readFile(index, "utf8")).toBe("tree-sitter/index.js windows-x64-baseline")
}, STAGING_TIMEOUT)

test("packaging verifies effective root version and all Windows guest bytes", async () => {
  const input = await fixture(desktopCliTargets("win32", "x64"))
  await stageCliArtifacts(input)
  await verifyPackagedCli(input.directory, "win32", "x64", input.version, checks)
  await expect(verifyPackagedCli(input.directory, "win32", "x64", "local", checks)).rejects.toThrow("version")
  const guest = await verifyCliArtifact(input.directory, "linux-arm64")
  await writeFile(guest.path, "foreign guest bytes")
  await expect(verifyPackagedCli(input.directory, "win32", "x64", input.version, checks)).rejects.toThrow("digest")
  const native = await fixture(["windows-x64-baseline"])
  await stageCliArtifacts(native)
  // The packaging check refuses a bundle without the Windows guests' CLIs or their omni pairs.
  await expect(verifyPackagedCli(native.directory, "win32", "x64", native.version, checks)).rejects.toThrow("missing")
  // The host target's pair is checked too: a staged Linux bundle without it refuses by name.
  const host = await fixture(["linux-x64-baseline"])
  await stageCliArtifacts(host)
  await rm(join(host.directory, "omni-linux-x64-baseline"), { recursive: true })
  await expect(verifyPackagedCli(host.directory, "linux", "x64", host.version, checks)).rejects.toThrow(
    "linux-x64-baseline",
  )
}, STAGING_TIMEOUT)

test("staging rejects empty, duplicate and traversal targets before touching output", async () => {
  const input = await fixture()
  await expect(stageCliArtifacts({ ...input, targets: [] })).rejects.toThrow("target")
  await expect(stageCliArtifacts({ ...input, targets: ["../foreign"] })).rejects.toThrow("target")
  await expect(stageCliArtifacts({ ...input, targets: [...input.targets, ...input.targets] })).rejects.toThrow("target")
}, STAGING_TIMEOUT)

test("staging rejects symlink output directories and keeps previous resources", async () => {
  const input = await fixture()
  await stageCliArtifacts(input)
  const before = await readFile(join(input.directory, "manifest.json"), "utf8")
  const binaryDirectory = join(input.dist, `cli-${input.targets[0]}`, "bin")
  await rename(binaryDirectory, join(input.root, "foreign-bin"))
  await symlink(join(input.root, "foreign-bin"), binaryDirectory, process.platform === "win32" ? "junction" : "dir")
  await expect(stageCliArtifacts(input)).rejects.toThrow("regular")
  expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
}, STAGING_TIMEOUT)

// GitHub's Windows runners briefly hold a CLI that the sign hook just ran (provjobd.exe, up to 2.2 s measured), and
// Windows refuses to rename a directory while a file in it is open. A handle the test owns stands in for that holder.
test("a staged CLI held briefly after signing delays the rename into place instead of failing it", async () => {
  const input = await fixture()
  const start = performance.now()
  await stageCliArtifacts({
    ...input,
    sign: async (path, _target, kind) => {
      if (kind !== "cli") return
      const held = await open(path, "r")
      setTimeout(() => void held.close(), 300)
    },
  })
  expect((await readCliManifest(input.directory)).version).toBe(input.version)
  // Elsewhere an open file never blocked the rename; on Windows it did, so the rename waited for the release.
  if (process.platform === "win32") expect(performance.now() - start).toBeGreaterThanOrEqual(250)
}, STAGING_TIMEOUT)

test.skipIf(process.platform !== "win32")("a staged CLI held past the bound fails the rename and keeps the previous resources", async () => {
  const input = await fixture()
  await stageCliArtifacts(input)
  const before = await readFile(join(input.directory, "manifest.json"), "utf8")
  const holds: Promise<void>[] = []
  const error = await stageCliArtifacts({
    ...input,
    sign: async (path, _target, kind) => {
      if (kind !== "cli") return
      const held = await open(path, "r")
      // Longer than staging's 10 s bound on the rename.
      holds.push(new Promise((resolve) => setTimeout(() => void held.close().then(resolve), 14_000)))
    },
  }).then(
    () => undefined,
    (error: NodeJS.ErrnoException) => error,
  )
  // The rename fails with EPERM after the bound; removing the stage it still holds may then report EBUSY instead.
  expect(["EPERM", "EBUSY"]).toContain(error?.code)
  expect(await readFile(join(input.directory, "manifest.json"), "utf8")).toBe(before)
  await Promise.all(holds)
}, STAGING_TIMEOUT)
