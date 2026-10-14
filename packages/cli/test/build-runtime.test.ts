import { afterAll, beforeAll, expect, test } from "bun:test"
import { chmod, copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createRequire } from "node:module"
import path from "node:path"
import { omniTargets, requireOmniFiles } from "@orchestra/script/omni"
import { requireElfLibc, requireTreeSitterBundle, treeSitterArtifactKey, treeSitterBundle } from "@orchestra/script/tree-sitter-prebuilds"
import { namedTargets } from "../script/targets"

const root = path.resolve(import.meta.dirname, "..")
const version = "1.18.27-closure-test"
const targets = [
  "linux-arm64",
  "linux-x64",
  "linux-x64-baseline",
  "linux-arm64-musl",
  "linux-x64-musl",
  "linux-x64-baseline-musl",
  "darwin-arm64",
  "darwin-x64",
  "darwin-x64-baseline",
  "windows-arm64",
  "windows-x64",
  "windows-x64-baseline",
]
const native = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`
const binary = path.join(root, `dist/cli-${native}/bin/orchestra${process.platform === "win32" ? ".exe" : ""}`)
let home: string
let env: Record<string, string | undefined>

beforeAll(async () => {
  if (process.env.GITHUB_ACTIONS !== "false" || !process.env.RUNNER_OS)
    throw new Error("Compiled CLI acceptance requires the Actions test-ci runner; local execution is forbidden")
  home = await mkdtemp(path.join(tmpdir(), "orchestra-cli-acceptance-"))
  await Promise.all(["data", "config", "cache", "state", "tmp"].map((dir) => mkdir(path.join(home, dir))))
  await Bun.write(path.join(home, "models.json"), "{}")
  env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !/^(ORCHESTRA_|XDG_|HOME$|USERPROFILE$|APPDATA$|LOCALAPPDATA$)/.test(key)),
    ),
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    LOCALAPPDATA: home,
    TMPDIR: path.join(home, "tmp"),
    TMP: path.join(home, "tmp"),
    TEMP: path.join(home, "tmp"),
    XDG_DATA_HOME: path.join(home, "data"),
    XDG_CONFIG_HOME: path.join(home, "config"),
    XDG_CACHE_HOME: path.join(home, "cache"),
    XDG_STATE_HOME: path.join(home, "state"),
    ORCHESTRA_TEST_HOME: home,
    ORCHESTRA_VERSION: version,
    ORCHESTRA_CHANNEL: "dev",
    ORCHESTRA_PURE: "1",
    ORCHESTRA_DISABLE_MODELS_FETCH: "1",
    MODELS_DEV_API_JSON: path.join(home, "models.json"),
  }
})

afterAll(async () => {
  if (home) await rm(home, { recursive: true, force: true })
})

async function run(argv: string[], timeout = 120_000, overrides = {}) {
  const child = Bun.spawn(argv, { cwd: root, env: { ...env, ...overrides }, stdout: "pipe", stderr: "pipe", timeout })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout: stdout.trim(), stderr: stderr.trim(), code }
}

async function build(args: string[], overrides = {}) {
  const result = await run([process.execPath, "script/build.ts", "--skip-install", ...args], 600_000, overrides)
  if (result.code !== 0) throw new Error(`Builder failed (${result.code}):\n${result.stdout}\n${result.stderr}`)
}

test("rejects bad targets before loading fixtures or touching any artifact", async () => {
  const sentinel = path.join(root, "dist/cli-preserved/sentinel")
  await Bun.write(sentinel, "preserve these bytes")
  for (const args of [
    ["--target", "../foreign"],
    ["--target"],
    ["--target", "linux-arm"],
    ["--target", native, "--target", native],
  ]) {
    const result = await run([process.execPath, "script/build.ts", "--skip-install", "--single", ...args], 30_000, {
      MODELS_DEV_API_JSON: path.join(home, "deliberately-missing.json"),
    })
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain("Invalid --target")
    expect(await Bun.file(sentinel).text()).toBe("preserve these bytes")
  }
}, 180_000)

test("compiled native CLI exposes owned help/version and isolated service/serve lifecycle", async () => {
  await build(["--single", "--target", native])
  const identity = await run([binary, "--version"])
  expect(identity.code).toBe(0)
  // Artifact consumers read the bare version (src/index.ts formatVersion).
  expect(identity.stdout).toBe(version)
  const help = await run([binary, "--help"])
  expect(help.code).toBe(0)
  expect(help.stdout).toContain("orchestra")
  expect(help.stdout).not.toContain("lildax")
  const launched = await run(["node", "bin/orchestra.cjs", "--version"], 30_000, { ORCHESTRA_BIN_PATH: binary })
  expect(launched.code).toBe(0)
  expect(launched.stdout).toBe(version)
  const launcher = path.join(home, "launcher/bin/orchestra.cjs")
  await Bun.write(launcher, Bun.file(path.join(root, "bin/orchestra.cjs")))
  await copyFile(binary, path.join(home, "launcher/bin/.orchestra"))
  expect((await run(["node", launcher, "--version"])).stdout).toBe(version)
  const installed = path.join(home, `launcher/node_modules/@orchestra/cli-${native}/bin`)
  await mkdir(installed, { recursive: true })
  await rename(path.join(home, "launcher/bin/.orchestra"), path.join(installed, path.basename(binary)))
  expect((await run(["node", launcher, "--version"])).stdout).toBe(version)
  const manifest = await Bun.file(path.join(root, `dist/cli-${native}/package.json`)).json()
  expect(manifest.version).toBe(version)
  expect(manifest.repository.url).toBe("git+https://github.com/gustavomhss/hugr-orchestra.git")
  expect((await run([binary, "service", "status"])).stdout).toBe("stopped")
  try {
    const started = await run([binary, "service", "start"])
    expect(started.code).toBe(0)
    expect(URL.canParse(started.stdout)).toBe(true)
    expect((await run([binary, "service", "status"])).stdout).toBe(`running ${started.stdout}`)
    expect((await run([binary, "service", "start"])).stdout).toBe(started.stdout)
    const registration = await Bun.file(path.join(home, "state/orchestra/server.json")).json()
    expect(registration.version).toBe(version)
    const password = await run([binary, "service", "password"])
    expect(password.code).toBe(0)
    expect(password.stdout.length > 0).toBe(true)
    await authenticatedHealth(started.stdout, password.stdout, registration.pid)
    const stopped = await run([binary, "service", "stop"])
    expect(stopped.code).toBe(0)
    expect((await run([binary, "service", "status"])).stdout).toBe("stopped")

    const child = Bun.spawn([binary, "serve", "--hostname", "127.0.0.1", "--port", "0"], {
      cwd: home, env, stdout: "pipe", stderr: "pipe", timeout: 30_000,
    })
    const errors = new Response(child.stderr).text()
    try {
      const reader = child.stdout.getReader()
      const decoder = new TextDecoder()
      let output = ""
      while (!/server listening on (http:\/\/\S+)/.test(output)) {
        const chunk = await reader.read()
        if (chunk.done) throw new Error(`Foreground serve exited before ready: ${await errors}`)
        output += decoder.decode(chunk.value, { stream: true })
      }
      await reader.cancel()
      const address = /server listening on (http:\/\/\S+)/.exec(output)
      if (!address) throw new Error("Missing foreground address")
      await authenticatedHealth(address[1], password.stdout, child.pid)
    } finally {
      child.kill()
      await child.exited
      await errors
    }
  } finally {
    const stop = await run([binary, "service", "stop"])
    if (stop.code !== 0) throw new Error(`Isolated daemon cleanup failed: ${stop.stderr}`)
  }
}, 900_000)

async function authenticatedHealth(url: string, password: string, pid: number) {
  expect(Number.isSafeInteger(pid)).toBe(true)
  expect(pid).toBeGreaterThan(0)
  const good = await fetch(new URL("/api/health", url), {
    headers: { authorization: `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}` },
    signal: AbortSignal.timeout(10_000),
  })
  expect(good.status).toBe(200)
  expect(await good.json()).toEqual({ healthy: true, pid })
  const bad = await fetch(new URL("/api/health", url), {
    headers: { authorization: `Basic ${Buffer.from("orchestra:wrong-credential").toString("base64")}` },
    signal: AbortSignal.timeout(10_000),
  })
  expect(bad.status).toBe(401)
}

// One host builds every target, as the cross lanes do, from the artifacts native hosts hand it: OMNI_ARTIFACTS and
// TREE_SITTER_ARTIFACTS. The fixtures stand in for those builds: an omni pair per enabled id (the builder only copies
// it). Linux parser bindings are independent synthetic ELF CPU/libc fixtures;
// other OS bindings retain published prebuild headers. These fixtures calibrate
// structural copying/admission, never parser or omni runtime qualification.
async function handedArtifacts() {
  const omni = path.join(home, "omni-artifacts")
  const treeSitter = path.join(home, "tree-sitter-artifacts")
  const python = path.dirname(
    createRequire(path.resolve(root, "../maestro-arsenal/package.json")).resolve("tree-sitter-python/package.json"),
  )
  await Promise.all(
    Object.values(omniTargets)
      .filter((item) => item.enabled)
      .flatMap((item) =>
        ["hugr_omni.node", `hugr-omni-supervisor${item.id.startsWith("win32-") ? ".exe" : ""}`].map(async (file) => {
          const destination = path.join(omni, item.id, file)
          const os = item.id.split("-")[0]
          const arch = item.id.split("-")[1]
          const supervisor = file.startsWith("hugr-omni-supervisor")
          await Bun.write(destination, os === "linux" ? elfBinding(arch, supervisor ? undefined : item.id.endsWith("-musl") ? "musl" : "glibc") :
            omniHeader(os, arch))
          if (supervisor && os !== "win32" && process.platform !== "win32") await chmod(destination, 0o755)
        }),
      ),
  )
  await Promise.all(
    namedTargets
      .filter((item) => item.avx2 === undefined)
      .flatMap((item) =>
        treeSitterBundle(item).map((file) =>
          Bun.write(
            path.join(treeSitter, treeSitterArtifactKey(item), file),
            file.endsWith(".node")
              ? item.os === "linux" ? elfBinding(item.arch, item.abi === "musl" ? "musl" : "glibc")
                : Bun.file(path.join(python, "prebuilds", `${item.os}-${item.arch}`, "tree-sitter-python.node"))
              : file,
          ),
        ),
      ),
  )
  return { OMNI_ARTIFACTS: omni, TREE_SITTER_ARTIFACTS: treeSitter }
}

// Independent ELF fixture: no production inspector generates these bytes and
// no glibc prebuild is relabeled musl. Shared object has no executable code.
function elfBinding(arch: string, libc?: "glibc" | "musl") {
  const bytes = Buffer.alloc(512)
  Buffer.from("7f454c46020101", "hex").copy(bytes)
  bytes.writeUInt16LE(3, 16)
  bytes.writeUInt16LE(arch === "x64" ? 62 : 183, 18)
  bytes.writeUInt32LE(1, 20)
  bytes.writeBigUInt64LE(64n, 32)
  bytes.writeUInt16LE(64, 52)
  bytes.writeUInt16LE(56, 54)
  bytes.writeUInt16LE(2, 56)
  bytes.writeUInt32LE(1, 64)
  bytes.writeUInt32LE(4, 68)
  bytes.writeBigUInt64LE(512n, 96)
  bytes.writeBigUInt64LE(512n, 104)
  bytes.writeBigUInt64LE(4096n, 112)
  if (!libc) { bytes.writeUInt16LE(1, 56); return bytes }
  bytes.writeUInt32LE(2, 120)
  bytes.writeUInt32LE(4, 124)
  bytes.writeBigUInt64LE(176n, 128)
  bytes.writeBigUInt64LE(176n, 136)
  bytes.writeBigUInt64LE(64n, 152)
  bytes.writeBigUInt64LE(64n, 160)
  bytes.writeBigUInt64LE(8n, 168)
  const strings = Buffer.from(`${libc === "glibc" ? "libc.so.6" : `libc.musl-${arch === "x64" ? "x86_64" : "aarch64"}.so.1`}\0`)
  strings.copy(bytes, 352)
  ;[[1n, 0n], [5n, 352n], [10n, BigInt(strings.length)], [0n, 0n]].forEach(([tag, value], i) => {
    bytes.writeBigInt64LE(tag, 176 + i * 16)
    bytes.writeBigUInt64LE(value, 184 + i * 16)
  })
  return bytes
}

function omniHeader(os: string, arch: string) {
  const bytes = Buffer.alloc(128)
  if (os === "darwin") { bytes.writeUInt32LE(0xfeedfacf); bytes.writeUInt32LE(arch === "x64" ? 0x01000007 : 0x0100000c, 4); return bytes }
  bytes.writeUInt16LE(0x5a4d)
  bytes.writeUInt32LE(64, 0x3c)
  bytes.writeUInt32LE(0x4550, 64)
  bytes.writeUInt16LE(arch === "x64" ? 0x8664 : 0xaa64, 68)
  bytes.writeUInt16LE(0x20b, 88)
  return bytes
}

test("all explicit targets produce correct executable format/architecture and preserve siblings", async () => {
  const sentinel = path.join(root, "dist/cli-preserved/sentinel")
  const artifacts = new Map<string, string>()
  const handed = await handedArtifacts()
  await Bun.write(sentinel, "preserve these bytes")
  // Local --single fallback is exercised from a copied producer module, never
  // by replacing the runner's genuine release companions. Fixtures are structural.
  const local = path.join(home, "local-producer")
  const producer = path.join(local, "packages/script/src")
  await Promise.all(["omni.ts", "tree-sitter-prebuilds.ts", "workspace-paths.ts", "module-catalog.ts", "module-resolver.ts"]
    .map((file) => Bun.write(path.join(producer, file), Bun.file(path.resolve(root, "../script/src", file)))))
  const modules = [
    { alias: "script", kind: "bun", scope: ".", name: "@orchestra/script", path: "packages/script" },
    { alias: "maestro-arsenal", kind: "bun", scope: ".", name: "@orchestra/maestro-arsenal", path: "tools/arsenal" },
  ]
  const domains = {
    omni: { path: "native/omni", manifest: "Cargo.toml" },
    atlas: { path: "domains/atlas", manifest: "package.json" },
  }
  await Bun.write(path.join(local, "package.json"), JSON.stringify({ name: "local-producer", private: true, type: "module" }))
  await Bun.write(path.join(local, "script/module-registry.json"), JSON.stringify({ format: 1, modules }))
  await Bun.write(path.join(local, "script/toolchain-registry.json"), JSON.stringify({ format: 1, roots: domains }))
  await Promise.all(modules.map((entry) => Bun.write(path.join(local, entry.path, "package.json"), JSON.stringify({ name: entry.name }))))
  await Promise.all(Object.values(domains).map((entry) => Bun.write(path.join(local, entry.path, entry.manifest),
    entry.manifest === "Cargo.toml" ? "[workspace]\n" : JSON.stringify({ name: "atlas", private: true }))))
  const schema = path.join(local, "node_modules/@orchestra/schema")
  await Bun.write(path.join(schema, "package.json"), JSON.stringify({ name: "@orchestra/schema", type: "module", exports: { "./elf": "./elf.ts" } }))
  await Bun.write(path.join(schema, "elf.ts"), Bun.file(path.resolve(root, "../schema/src/elf.ts")))
  const release = path.join(local, domains.omni.path, "target/release")
  // MUSL-POSIX-PROBES BEGIN: Unix permission semantics require a POSIX host.
  // Native Linux rows must exercise every Unix mode control. Windows still
  // exercises ARM64 PE/CPU admission; NTFS is not a Unix execute-bit oracle.
  const localTargets = [...(process.platform === "win32" ? [] :
    ["linux-x64-musl", "linux-x64-baseline-musl", "linux-arm64-musl"]), "windows-arm64"]
  const modeTargets: string[] = []
  const admittedTargets: string[] = []
  for (const selected of localTargets) {
    const item = namedTargets.find((item) => item.target === selected)!
    const id = omniTargets[selected].id
    const addon = path.join(release, item.os === "win32" ? "hugr_omni_node.dll" : "libhugr_omni_node.so")
    const supervisor = path.join(release, `hugr-omni-supervisor${item.os === "win32" ? ".exe" : ""}`)
    const probe = [process.execPath, "--eval", `import { resolveOmni } from ${JSON.stringify(path.join(producer, "omni.ts"))};
      const result = resolveOmni(${JSON.stringify({ name: selected, target: selected, os: item.os, single: true })});
      if (!result.omni.enabled || !result.omniFiles) throw new Error("OMNI_LOCAL_ADMISSION_EMPTY"); console.log("admitted")`]
    await rm(release, { recursive: true, force: true })
    const missing = await run(probe, 30_000, { OMNI_ARTIFACTS: undefined })
    expect(missing.code).not.toBe(0)
    expect(missing.stderr).toContain("OMNI_LOCAL_COMPANIONS_MISSING")
    await Bun.write(addon, Bun.file(path.join(handed.OMNI_ARTIFACTS, id, "hugr_omni.node")))
    const incomplete = await run(probe, 30_000, { OMNI_ARTIFACTS: undefined })
    expect(incomplete.code).not.toBe(0)
    expect(incomplete.stderr).toContain("OMNI_COMPANION_MISSING_OR_NOT_REGULAR")
    await Bun.write(supervisor, Bun.file(path.join(handed.OMNI_ARTIFACTS, id, path.basename(supervisor))))
    if (item.os !== "win32" && process.platform !== "win32") await chmod(supervisor, 0o755)
    expect((await run(probe, 30_000, { OMNI_ARTIFACTS: undefined })).stdout).toBe("admitted")
    const original = await readFile(addon)
    try {
      await Bun.write(addon, item.os === "linux" ? elfBinding(item.arch === "x64" ? "arm64" : "x64", "musl") : omniHeader("win32", "x64"))
      const wrongCPU = await run(probe, 30_000, { OMNI_ARTIFACTS: undefined })
      expect(wrongCPU.code).not.toBe(0)
      expect(wrongCPU.stderr).toContain("OMNI_COMPANION_CPU_MISMATCH")
      if (item.os === "linux") {
        await Bun.write(addon, elfBinding(item.arch, "glibc"))
        const wrongABI = await run(probe, 30_000, { OMNI_ARTIFACTS: undefined })
        expect(wrongABI.code).not.toBe(0)
        expect(wrongABI.stderr).toContain("ELF_LIBC_MISMATCH")
      }
    } finally { await Bun.write(addon, original) }
    const originalSupervisor = await readFile(supervisor)
    try {
      await Bun.write(supervisor, item.os === "linux" ? elfBinding(item.arch === "x64" ? "arm64" : "x64") : omniHeader("win32", "x64"))
      const wrongCPU = await run(probe, 30_000, { OMNI_ARTIFACTS: undefined })
      expect(wrongCPU.code).not.toBe(0)
      expect(wrongCPU.stderr).toContain("OMNI_COMPANION_CPU_MISMATCH")
      if (item.os === "linux") {
        await Bun.write(supervisor, elfBinding(item.arch, "musl"))
        const dynamic = await run(probe, 30_000, { OMNI_ARTIFACTS: undefined })
        expect(dynamic.code).not.toBe(0)
        expect(dynamic.stderr).toContain("OMNI_SUPERVISOR_INTERPRETER_MISMATCH")
        await Bun.write(supervisor, originalSupervisor)
        await chmod(supervisor, 0o644)
        const nonExecutable = await run(probe, 30_000, { OMNI_ARTIFACTS: undefined })
        expect(nonExecutable.code).not.toBe(0)
        expect(nonExecutable.stderr).toContain("OMNI_SUPERVISOR_NOT_EXECUTABLE")
        modeTargets.push(selected)
      }
    } finally {
      await Bun.write(supervisor, originalSupervisor)
      if (item.os !== "win32" && process.platform !== "win32") await chmod(supervisor, 0o755)
    }
    expect((await run(probe, 30_000, { OMNI_ARTIFACTS: undefined })).stdout).toBe("admitted")
    admittedTargets.push(selected)
  }
  expect(admittedTargets, "WINDOWS_ARM64_PE_CPU_CONTROL_REQUIRED").toContain("windows-arm64")
  if (process.platform === "linux") expect(modeTargets.toSorted(), "UNIX_PERMISSION_CONTROLS_REQUIRED_ON_NATIVE_LINUX")
    .toEqual(["linux-x64-musl", "linux-x64-baseline-musl", "linux-arm64-musl"].toSorted())
  // MUSL-POSIX-PROBES END
  // On the Windows runner Bun 1.3.14 fails to extract the compile targets it downloads ("Failed to extract executable
  // for 'bun-linux-aarch64-v1.3.14'" and 'bun-windows-aarch64-v1.3.14', actions runs 38150190807 and 38150514459), so
  // a Windows host proves only its own target, which needs no download. The Linux host, where the release producers
  // run, proves all of them.
  const built = process.platform === "win32" ? [native] : targets
  // test-ci installs for its own host; the other targets need the all-platform install the release lanes run, with the
  // runner's own package cache (the isolated HOME would download everything again). Every target's tree-sitter comes
  // from the handed bundles, so no install script needs to run. A host that builds only its own target needs no foreign
  // package and must not reinstall: Windows runners install the hoisted layout (setup-bun) and this install's default
  // isolated linker moves every package, while this test process keeps resolving through the hoisted paths it already
  // cached, so each later suite in it failed with "Cannot find package 'effect'" (actions run 38157021480). Asynchronous:
  // Bun 1.3.14's Windows spawnSync measures its timeout from the previous synchronous spawn's clock (oven-sh/bun#33932).
  if (built.some((target) => target !== native)) {
    const install = Bun.spawn(
      [process.execPath, "install", "--frozen-lockfile", "--ignore-scripts", "--os=*", "--cpu=*"],
      { cwd: root, stdout: "ignore", stderr: "pipe", timeout: 600_000 },
    )
    const [installError, installCode] = await Promise.all([new Response(install.stderr).text(), install.exited])
    if (installCode !== 0) throw new Error(`All-platform install failed (${installCode}):\n${installError}`)
  }
  // A cross target with no exported bundle still stops on its named error before anything is built.
  const foreign = namedTargets.find((item) => item.os !== process.platform && item.abi === undefined)!
  const refused = await run(
    [process.execPath, "script/build.ts", "--skip-install", "--target", foreign.target],
    120_000,
    { ...handed, TREE_SITTER_ARTIFACTS: path.join(home, "no-tree-sitter-artifacts") },
  )
  expect(refused.code).not.toBe(0)
  expect(refused.stderr).toMatch(/TREE_SITTER_(CORE_BINDING_MISSING|CORE_BUILD_STALE|PREBUILD_ARCH_MISMATCH): /)
  expect(await Bun.file(path.join(root, `dist/cli-${foreign.target}/bin`)).exists()).toBe(false)
  for (const target of built) {
    const item = namedTargets.find((item) => item.target === target)!
    const stale = path.join(root, `dist/cli-${target}/stale-output`)
    await Bun.write(stale, "selected target must replace this")
    const id = omniTargets[target].id
    const handedAddon = path.join(handed.OMNI_ARTIFACTS, id, "hugr_omni.node")
    const originalAddon = await readFile(handedAddon)
    try {
      await rm(handedAddon)
      const rejected = await run([process.execPath, "script/build.ts", "--skip-install", "--target", target], 120_000, handed)
      expect(rejected.code).not.toBe(0)
      expect(rejected.stderr).toContain("OMNI_COMPANION_MISSING_OR_NOT_REGULAR")
      expect(await Bun.file(stale).text()).toBe("selected target must replace this")
    } finally { await Bun.write(handedAddon, originalAddon) }
    if (item.os === "linux") {
      const binding = path.join(handed.TREE_SITTER_ARTIFACTS, treeSitterArtifactKey(item),
        "tree-sitter/prebuilds", `${item.os}-${item.arch}`, "tree-sitter.node")
      const original = await readFile(binding)
      const libc = item.abi === "musl" ? "musl" : "glibc"
      expect(requireElfLibc(binding, libc).needed).toEqual([libc === "musl" ?
        `libc.musl-${item.arch === "x64" ? "x86_64" : "aarch64"}.so.1` : "libc.so.6"])
      try {
        await Bun.write(binding, elfBinding(item.arch, libc === "musl" ? "glibc" : "musl"))
        const rejected = await run([process.execPath, "script/build.ts", "--skip-install", "--target", target], 120_000, handed)
        expect(rejected.code).not.toBe(0)
        expect(rejected.stderr).toContain("ELF_LIBC_MISMATCH")
        expect(await Bun.file(stale).text()).toBe("selected target must replace this")
        expect(await Bun.file(sentinel).text()).toBe("preserve these bytes")
      } finally { await Bun.write(binding, original) }
    }
    await build(["--target", target], handed)
    expect(await Bun.file(stale).exists()).toBe(false)
    expect(await Bun.file(sentinel).text()).toBe("preserve these bytes")
    const file = path.join(root, `dist/cli-${target}/bin/orchestra${target.startsWith("windows-") ? ".exe" : ""}`)
    artifacts.set(file, await digest(file))
    const handle = await open(file)
    const bytes = Buffer.alloc(4096)
    await handle.read(bytes, 0, bytes.length, 0).finally(() => handle.close())
    const arm = target.includes("arm64")
    if (target.startsWith("linux-")) {
      expect(bytes.subarray(0, 4).toString("hex")).toBe("7f454c46")
      expect(bytes[4]).toBe(2)
      expect(bytes.readUInt16LE(18)).toBe(arm ? 183 : 62)
    }
    if (target.startsWith("darwin-")) {
      expect(bytes.readUInt32LE(0)).toBe(0xfeedfacf)
      expect(bytes.readUInt32LE(4)).toBe(arm ? 0x100000c : 0x1000007)
    }
    if (target.startsWith("windows-")) {
      expect(bytes.subarray(0, 2).toString()).toBe("MZ")
      const pe = bytes.readUInt32LE(0x3c)
      expect(bytes.readUInt32LE(pe)).toBe(0x4550)
      expect(bytes.readUInt16LE(pe + 4)).toBe(arm ? 0xaa64 : 0x8664)
    }
    const manifest = await Bun.file(path.join(root, `dist/cli-${target}/package.json`)).json()
    expect(manifest.name).toBe(`@orchestra/cli-${target}`)
    expect(manifest.version).toBe(version)
    expect(manifest.os).toEqual([target.startsWith("windows-") ? "win32" : target.split("-")[0]])
    expect(manifest.cpu).toEqual([arm ? "arm64" : "x64"])
    const omni = omniTargets[target]!
    expect(await Bun.file(path.join(root, `dist/cli-${target}/bin/hugr_omni.node`)).exists()).toBe(omni.enabled)
    if (omni.enabled) {
      const source = path.join(handed.OMNI_ARTIFACTS, omni.id)
      const supervisor = `hugr-omni-supervisor${item.os === "win32" ? ".exe" : ""}`
      requireOmniFiles({ addon: path.join(source, "hugr_omni.node"), supervisor: path.join(source, supervisor) }, item)
      for (const file of ["hugr_omni.node", supervisor])
        expect(await digest(path.join(root, `dist/cli-${target}/bin`, file))).toBe(await digest(path.join(source, file)))
    }
    // Every ABI ships the handed bundle with unchanged internal OS/CPU paths.
    const shipped = path.join(root, `dist/cli-${target}/bin/tree-sitter`)
    requireTreeSitterBundle(shipped, item)
    const bundle = treeSitterBundle(item)
    expect(bundle.length).toBeGreaterThan(0)
    expect(bundle.filter((file) => file.endsWith(".node"))).toHaveLength(3)
    for (const file of bundle)
      expect(await digest(path.join(shipped, file))).toBe(
        await digest(path.join(handed.TREE_SITTER_ARTIFACTS, treeSitterArtifactKey(item), file)),
      )
  }
  for (const [file, hash] of artifacts) expect(await digest(file)).toBe(hash)
}, 1_800_000)

async function digest(file: string) {
  const hash = new Bun.CryptoHasher("sha256")
  await Bun.file(file).stream().pipeTo(
    new WritableStream({
      write: (chunk) => {
        hash.update(chunk)
      },
    }),
  )
  return hash.digest("hex")
}

test("single and baseline retain native-only selection semantics", async () => {
  await build(["--single", "--baseline"], await handedArtifacts())
  await requireDistInventory([
    native,
    ...(process.arch === "x64" ? [`${native}-baseline`] : []),
    ...(process.platform === "linux" && process.arch === "x64" ? [`${native}-baseline-musl`] : []),
  ], [version])
  await build(["--single"], await handedArtifacts())
  await requireDistInventory([native], [version])
}, 900_000)

test("explicit replacement retains two version-bound receipts outside the selected payload", async () => {
  const versions = [`${version}-first`, `${version}-second`]
  const handed = await handedArtifacts()
  await build(["--single"], { ...handed, ORCHESTRA_VERSION: versions[0] })
  await requireDistInventory([native], [versions[0]])
  const before = await readFile(path.join(root, "dist", `compile-evidence-${native}-${versions[0]}.json`))
  const first = await digest(binary)
  await build(["--single", "--target", native], { ...handed, ORCHESTRA_VERSION: versions[1] })
  await requireDistInventory([native], versions)
  expect(await readFile(path.join(root, "dist", `compile-evidence-${native}-${versions[0]}.json`))).toEqual(before)
  expect(await digest(binary)).not.toBe(first)
  expect(JSON.parse(before.toString("utf8")).binary.sha256).toBe(first)
}, 900_000)

async function requireDistInventory(selected: string[], versions: string[]) {
  // Exact allow-list, not an unknown-entry filter: both directories and versioned
  // receipts are producer outputs, and no receipt is part of an admitted payload.
  const expected = [...selected.map((target) => `cli-${target}`),
    ...selected.flatMap((target) => versions.map((version) => `compile-evidence-${target}-${version}.json`))].sort()
  expect((await readdir(path.join(root, "dist"))).sort()).toEqual(expected)
  for (const target of selected) {
    const directory = path.join(root, "dist", `cli-${target}`)
    const info = await lstat(directory)
    expect(info.isDirectory() && !info.isSymbolicLink()).toBe(true)
    expect((await readdir(directory)).sort()).toEqual(["bin", "package.json"])
    expect((await readdir(directory, { recursive: true })).some((name) => path.basename(name).startsWith("compile-evidence"))).toBe(false)
    const activeBinary = path.join(directory, "bin", `orchestra${target.startsWith("windows-") ? ".exe" : ""}`)
    for (const version of versions) {
      const file = path.join(root, "dist", `compile-evidence-${target}-${version}.json`)
      const info = await lstat(file)
      expect(info.isFile() && !info.isSymbolicLink() && info.nlink === 1).toBe(true)
      const receipt = await Bun.file(file).json()
      expect(receipt.schema).toBe("orchestra-compile-evidence-v2")
      expect(receipt.target).toBe(target)
      expect(receipt.version).toBe(version)
      expect(receipt.inputs.length).toBeGreaterThan(0)
      expect(Object.keys(receipt.analysisMetafile.inputs).length).toBe(receipt.inputs.length)
      expect(Object.keys(receipt.metafile.inputs).length).toBe(receipt.inputs.length)
      expect(receipt.transformLedger.toolchain.version).toBe("0.4.5")
      const replacements = receipt.inputs.filter((input: { transform: string }) => input.transform === "solid-runtime-replacement")
      expect(replacements.length).toBeGreaterThan(0)
      for (const input of replacements) {
        expect(input.capture).toBe("raw-resolved-file")
        expect(input.backing.path).not.toBe(input.path)
        expect(input.backing.sha256).toBe(await digest(input.backing.path))
        expect(input.analysisBytes).toBe(input.compilerBytes)
      }
      if (version === versions.at(-1)) expect(receipt.binary.sha256).toBe(await digest(activeBinary))
    }
  }
}
