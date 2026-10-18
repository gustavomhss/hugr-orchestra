import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { machine } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { command } from "./distribution-native-process"

// Independent installed-companion oracle; the lead qualifies the public CLI separately.
// Every admission and mutation starts a new Deno process with a new owned cache.
export async function denoInstalledProbe(
  payload: string,
  box: { cwd: string; env: Record<string, string | undefined> },
): Promise<{ code: number; stdout: string; stderr: string }> {
  const launcher = process.env.ORCHESTRA_DISTRIBUTION_DENO
  if (!launcher || !isAbsolute(launcher)) throw new Error("INSTALLED_DENO_ABSOLUTE_EXECUTABLE_REQUIRED")
  if (process.env.ORCHESTRA_DISTRIBUTION_DENO_VERSION !== "2.9.7")
    throw new Error("INSTALLED_DENO_VERSION_PIN_REQUIRED: 2.9.7")
  if (!["linux", "darwin", "win32"].includes(process.platform) || !["x64", "arm64"].includes(process.arch))
    throw new Error("INSTALLED_DENO_HOST_UNSUPPORTED")
  const nativeMachine = machine()
  const nativeCPU = /^(aarch64|arm64)$/i.test(nativeMachine) ? "arm64"
    : /^(x86_64|amd64|x64)$/i.test(nativeMachine) ? "x64" : undefined
  if (nativeCPU !== process.arch) throw new Error("INSTALLED_DENO_HOST_CPU_EMULATION")
  const hardware = process.platform === "darwin"
    ? await command(["/usr/sbin/sysctl", "-n", "hw.cputype"], box, 15_000) : undefined
  if (hardware) {
    // Darwin reports CPU_TYPE_X86 (7) on Intel hardware, including 64-bit hosts.
    // Accept only known x86/ARM64 values, then corroborate with machine/process/header CPU.
    const hardwareCPU = hardware.stdout.trim() === "16777228" ? "arm64"
      : ["7", "16777223"].includes(hardware.stdout.trim()) ? "x64" : undefined
    if (hardware.code !== 0 || hardwareCPU !== nativeCPU)
      throw new Error("INSTALLED_DENO_HOST_HARDWARE_CPU_MISMATCH")
  }
  if (process.platform === "linux") {
    const ldd = await readFile("/usr/bin/ldd", "utf8")
    if (ldd.includes("musl") || !/GNU C Library|GNU libc/.test(ldd))
      throw new Error("INSTALLED_DENO_REQUIRES_GLIBC_HOST")
  }
  const executable = await realpath(launcher)
  const runtimeBinary = await executableHeader(executable, process.platform, nativeCPU)
  const bin = await realpath(join(payload, "bin"))
  const paths = {
    addon: join(bin, "hugr_omni.node"),
    supervisor: join(bin, `hugr-omni-supervisor${process.platform === "win32" ? ".exe" : ""}`),
  }
  const host = { os: process.platform, cpu: nativeCPU, machine: nativeMachine,
    ...(hardware ? { hardware: { query: "hw.cputype", value: hardware.stdout.trim() } } : {}) }
  const expectedFiles = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([member, path]) => {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw new Error(`INSTALLED_DENO_CONTROL_FILE_NOT_OWNED_REGULAR: ${path}`)
    return [member, { path, state: "present", sha256: createHash("sha256").update(await readFile(path)).digest("hex") }]
  })))
  const directory = await mkdtemp(join(await realpath(box.cwd), ".installed-deno-"))
  const adapter = await readFile(resolve(import.meta.dirname, "../../../../native/omni/bindings/node/index.js"))
  const adapterSha256 = createHash("sha256").update(adapter).digest("hex")
  const env = Object.fromEntries(Object.entries(box.env).filter(([key, value]) => value !== undefined && [
    "PATH", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PATHEXT",
    "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME",
    "XDG_CACHE_HOME", "TMPDIR", "TMP", "TEMP",
  ].includes(key.toUpperCase())))
  const childEnv = Object.fromEntries(Object.entries(env).filter(([key]) => [
    "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PATHEXT", "TMPDIR", "TMP", "TEMP",
  ].includes(key.toUpperCase())))
  const script = `
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { lstatSync, readFileSync, realpathSync } from "node:fs"
import { machine } from "node:os"
import process from "node:process"
const paths = ${JSON.stringify(paths)}
const host = ${JSON.stringify(host)}
const executable = ${JSON.stringify(executable)}
const runtimeBinary = ${JSON.stringify(runtimeBinary)}
const expectedVersion = Deno.args[0]
let stage = "identity"
let identity
let identityValidated = false
let configured = false
let observed = null
let omni
function physical(path) {
  try {
    const info = lstatSync(path)
    assert(info.isFile() && !info.isSymbolicLink(), "INSTALLED_DENO_COMPANION_NOT_REGULAR")
    return { path, state: "present", sha256: createHash("sha256").update(readFileSync(path)).digest("hex") }
  } catch (error) {
    if (error.code === "ENOENT") return { path, state: "missing" }
    throw error
  }
}
try {
  identity = { runtime: "deno", version: Deno.version.deno, versions: Deno.version,
    os: process.platform, cpu: process.arch, build: Deno.build, machine: machine(),
    execPath: realpathSync(Deno.execPath()), pid: Deno.pid, denoDir: Deno.env.get("DENO_DIR") }
  stage = "identity-version"
  assert.equal(identity.version, expectedVersion, "INSTALLED_DENO_RUNTIME_VERSION_MISMATCH")
  stage = "identity"
  assert.equal(identity.execPath, executable, "INSTALLED_DENO_EXECUTABLE_MISMATCH")
  assert.equal(realpathSync(process.execPath), executable, "INSTALLED_DENO_NODE_EXECUTABLE_MISMATCH")
  assert.equal(identity.os, host.os, "INSTALLED_DENO_RUNTIME_OS_MISMATCH")
  assert.equal(identity.cpu, host.cpu, "INSTALLED_DENO_RUNTIME_CPU_MISMATCH")
  assert.equal(identity.machine.toLowerCase(), host.machine.toLowerCase(), "INSTALLED_DENO_NATIVE_MACHINE_MISMATCH")
  assert.equal(Deno.build.os, host.os === "win32" ? "windows" : host.os, "INSTALLED_DENO_BUILD_OS_MISMATCH")
  assert.equal(Deno.build.arch, host.cpu === "x64" ? "x86_64" : "aarch64", "INSTALLED_DENO_BUILD_CPU_MISMATCH")
  if (host.os === "linux") assert.equal(Deno.build.env, "gnu", "INSTALLED_DENO_REQUIRES_GNU_RUNTIME")
  assert(!Object.keys(process.env).some((key) => /^HUGR_|^CARGO_|^ORCHESTRA_DISTRIBUTION_DENO/i.test(key)),
    "INSTALLED_DENO_OVERRIDE_LEAK")
  identityValidated = true
  stage = "companion-observation"
  observed = { addon: physical(paths.addon), supervisor: physical(paths.supervisor) }
  stage = "adapter-import"
  omni = createRequire(import.meta.url)("./adapter.cjs")
  stage = "configure"
  omni.configure(paths)
  configured = true
  stage = "spawn"
  const child = omni.spawn(executable, ["run", "--no-config", "--no-lock", "--cached-only", "child.mjs"], {
    cwd: ${JSON.stringify(directory)}, inheritEnv: false,
    env: { ...${JSON.stringify(childEnv)}, DENO_DIR: identity.denoDir },
    timeoutMs: 10_000, graceMs: 1_000, stdin: "closed", text: true,
  })
  stage = "child-output"
  assert(Number.isSafeInteger(child.pid) && child.pid > 0 && child.pid !== Deno.pid, "INSTALLED_DENO_CHILD_PID_INVALID")
  const output = { stdout: "", stderr: "" }
  const result = await (async () => {
    for await (const chunk of child.output) {
      assert.equal(chunk.lostBefore ?? 0, 0, "INSTALLED_DENO_CHILD_OUTPUT_LOST")
      assert(chunk.stream === "stdout" || chunk.stream === "stderr", "INSTALLED_DENO_CHILD_UNEXPECTED_STREAM")
      output[chunk.stream] += chunk.data
      assert(output.stdout.length + output.stderr.length <= 4096, "INSTALLED_DENO_CHILD_OUTPUT_LIMIT")
    }
    return await child.wait()
  })().finally(() => child.stop({ graceMs: 1_000 }))
  assert.equal(result.exitCode, 7, "INSTALLED_DENO_CHILD_EXIT_INVALID")
  assert.equal(result.reason, "exit", "INSTALLED_DENO_CHILD_REASON_INVALID")
  assert.equal(result.signal, null, "INSTALLED_DENO_CHILD_SIGNAL_INVALID")
  assert.equal(result.success, false, "INSTALLED_DENO_CHILD_SUCCESS_INVALID")
  assert.equal(output.stdout, "installed-deno-companion-child\\n", "INSTALLED_DENO_CHILD_STDOUT_INVALID")
  assert.equal(output.stderr, "", "INSTALLED_DENO_CHILD_STDERR_INVALID")
  assert.deepEqual(child.droppedBytes, { stdout: 0, stderr: 0 }, "INSTALLED_DENO_CHILD_DROPPED_OUTPUT")
  assert.deepEqual(await child.processes(), [], "INSTALLED_DENO_CHILD_TREE_SURVIVED")
  console.log(JSON.stringify({ oracle: "installed-deno-companion", identity, identityValidated, configured,
    expectedVersion, observed, host, runtimeBinary, paths,
    adapterSha256: ${JSON.stringify(adapterSha256)}, childPID: child.pid, exitCode: result.exitCode,
    stdout: output.stdout, stderr: output.stderr, reason: result.reason }))
} catch (error) {
  console.error("INSTALLED_DENO_COMPANION_PROBE_FAILED: " + JSON.stringify({ stage, paths, identity,
    identityValidated, configured, expectedVersion, observed, error: String(error),
    nativeError: !!omni && error instanceof omni.OmniError,
    errorName: error?.name ?? null, errorCode: error?.code ?? null,
    errorMessage: error instanceof Error ? error.message : String(error) }))
  Deno.exitCode = 1
}
`
  return (async () => {
    // Copy canonical bytes, never rewrite process logic or resolve a checkout addon.
    await writeFile(join(directory, "adapter.cjs"), adapter, { flag: "wx" })
    await writeFile(join(directory, "probe.mjs"), script, { flag: "wx" })
    await writeFile(join(directory, "child.mjs"),
      'await Deno.stdout.write(new TextEncoder().encode("installed-deno-companion-child\\n")); Deno.exit(7)\n',
      { flag: "wx" })
    const admission = async (expectedVersion = "2.9.7") => {
      const cache = await mkdtemp(join(directory, "cache-"))
      await mkdir(join(cache, "tmp"))
      return command([executable, "run", "--no-config", "--no-lock", "--cached-only", "--no-prompt",
        `--allow-ffi=${paths.addon}`, "--allow-env", "--allow-read", "--allow-sys", join(directory, "probe.mjs"), expectedVersion], {
        cwd: directory, env: { ...env, DENO_DIR: cache, TMPDIR: join(cache, "tmp"), TMP: join(cache, "tmp"), TEMP: join(cache, "tmp") },
      }, 30_000)
    }
    const first = await admission()
    if (first.code !== 0) return first
    const positive = (result: Awaited<ReturnType<typeof command>>) => {
      if (result.code !== 0 || result.stderr !== "")
        throw new Error(`INSTALLED_DENO_POSITIVE_ADMISSION_FAILED: ${JSON.stringify(result)}`)
      const receipt = JSON.parse(result.stdout)
      if (receipt.oracle !== "installed-deno-companion" || receipt.exitCode !== 7 || receipt.stderr !== "" ||
          receipt.stdout !== "installed-deno-companion-child\n" || receipt.identityValidated !== true ||
          receipt.configured !== true || receipt.expectedVersion !== "2.9.7" || receipt.identity?.version !== "2.9.7")
        throw new Error("INSTALLED_DENO_POSITIVE_RECEIPT_INVALID")
      assert.deepEqual(receipt.paths, paths, "INSTALLED_DENO_POSITIVE_PATHS_INVALID")
      assert.deepEqual(receipt.observed, expectedFiles, "INSTALLED_DENO_POSITIVE_FILES_INVALID")
      assert.deepEqual(receipt.host, host, "INSTALLED_DENO_POSITIVE_HOST_INVALID")
      assert.deepEqual(receipt.runtimeBinary, runtimeBinary, "INSTALLED_DENO_POSITIVE_HEADER_INVALID")
      return receipt
    }
    const negative = (result: Awaited<ReturnType<typeof command>>) => {
      const marker = "INSTALLED_DENO_COMPANION_PROBE_FAILED: "
      if (result.code !== 1 || !result.stderr.startsWith(marker) || result.stdout !== "")
        throw new Error(`INSTALLED_DENO_NEGATIVE_CONTROL_FAILED: ${JSON.stringify(result)}`)
      return JSON.parse(result.stderr.slice(marker.length))
    }
    const identity = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value)
      .filter(([key]) => !["pid", "denoDir"].includes(key)))
    // Addon dlopen errors are wrapped before setup(); supervisor errors must be
    // actual native OmniError/IO during spawn, after identity and configure succeed.
    const companionFailure = (failure: Record<string, unknown>, member: "addon" | "supervisor") =>
      failure.stage === (member === "addon" ? "configure" : "spawn") &&
      failure.identityValidated === true && failure.expectedVersion === "2.9.7" &&
      failure.configured === (member === "supervisor") && typeof failure.errorMessage === "string" &&
      (member === "addon" ? failure.nativeError === false && failure.errorName === "Error" &&
        failure.errorMessage.startsWith(`hugr-omni could not load its native addon ${paths.addon}:`)
        : failure.nativeError === true && failure.errorName === "OmniError" && failure.errorCode === "IO" &&
          /^IO: (cannot start the hugr-omni supervisor: |the hugr-omni supervisor \(generation \d+\) did not start: )/.test(failure.errorMessage))
    const receipt = positive(first)
    const wrongVersion = await admission("2.9.6")
    const versionFailure = negative(wrongVersion)
    if (versionFailure.stage !== "identity-version" || versionFailure.expectedVersion !== "2.9.6" ||
        versionFailure.identityValidated !== false || versionFailure.configured !== false ||
        versionFailure.nativeError !== false || versionFailure.errorCode !== "ERR_ASSERTION" ||
        !versionFailure.errorMessage.startsWith("INSTALLED_DENO_RUNTIME_VERSION_MISMATCH") ||
        versionFailure.observed !== null || companionFailure(versionFailure, "addon") ||
        companionFailure(versionFailure, "supervisor"))
      throw new Error(`INSTALLED_DENO_VERSION_CONTROL_UNCORROBORATED: ${wrongVersion.stderr}`)
    assert.deepEqual(identity(versionFailure.identity), identity(receipt.identity), "INSTALLED_DENO_VERSION_CONTROL_RUNTIME_CHANGED")
    const versionRestored = positive(await admission())
    assert.deepEqual(identity(versionRestored.identity), identity(receipt.identity), "INSTALLED_DENO_VERSION_RESTORATION_RUNTIME_CHANGED")
    const controls = []
    for (const member of ["addon", "supervisor"] as const) {
      const file = paths[member]
      const info = await lstat(file)
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
        throw new Error(`INSTALLED_DENO_CONTROL_FILE_NOT_OWNED_REGULAR: ${file}`)
      const original = await readFile(file)
      for (const kind of ["missing", "corrupt"] as const) {
        const before = positive(await admission())
        assert.deepEqual(identity(before.identity), identity(receipt.identity), "INSTALLED_DENO_CONTROL_RUNTIME_CHANGED")
        const corrupt = Buffer.from("not an installed native companion")
        const changed = { ...expectedFiles, [member]: kind === "missing" ? { path: file, state: "missing" }
          : { path: file, state: "present", sha256: createHash("sha256").update(corrupt).digest("hex") } }
        if (kind === "corrupt" && changed[member].sha256 === expectedFiles[member].sha256)
          throw new Error("INSTALLED_DENO_CONTROL_MUTATION_DID_NOT_CHANGE_BYTES")
        const backup = `${file}.deno-control-${randomUUID()}`
        await rename(file, backup)
        const failed = await (async () => {
          if (kind === "corrupt") await writeFile(file, corrupt, { flag: "wx", mode: info.mode & 0o777 })
          return admission()
        })().finally(async () => {
          if (kind === "corrupt") await rm(file, { force: true })
          await rename(backup, file)
        })
        if (!(await readFile(file)).equals(original) || (await lstat(file)).mode !== info.mode)
          throw new Error(`INSTALLED_DENO_CONTROL_RESTORATION_FAILED: ${file}`)
        const failure = negative(failed)
        if (!companionFailure(failure, member))
          throw new Error(`INSTALLED_DENO_NEGATIVE_CONTROL_UNCORROBORATED: ${member}/${kind}: ${failed.stderr}`)
        assert.deepEqual(failure.paths, paths, "INSTALLED_DENO_NEGATIVE_PATHS_INVALID")
        assert.deepEqual(failure.observed, changed, "INSTALLED_DENO_NEGATIVE_PHYSICAL_MUTATION_UNPROVEN")
        assert.deepEqual(identity(failure.identity), identity(receipt.identity), "INSTALLED_DENO_NEGATIVE_RUNTIME_CHANGED")
        const restored = positive(await admission())
        assert.deepEqual(identity(restored.identity), identity(receipt.identity), "INSTALLED_DENO_RESTORED_RUNTIME_CHANGED")
        controls.push({ member, kind, code: failed.code, stderr: failed.stderr, stage: failure.stage,
          nativeError: failure.nativeError, errorCode: failure.errorCode, before: before.observed,
          changed: failure.observed, after: restored.observed, restored: true })
      }
    }
    return { ...first, stdout: JSON.stringify({ ...receipt, controls,
      identityControls: [{ kind: "wrong-version", expectedVersion: "2.9.6", observedVersion: versionFailure.identity.version,
        code: wrongVersion.code, stderr: wrongVersion.stderr, stage: versionFailure.stage,
        companionOracleAccepted: companionFailure(versionFailure, "addon") || companionFailure(versionFailure, "supervisor"),
        restored: true }] }) + "\n" }
  })().finally(() => rm(directory, { recursive: true, force: true }))
}

// Fixed ELF64/Mach-O64/PE32+ headers, matching runtime-proof.ts's native CPU checks.
async function executableHeader(file: string, os: string, cpu: string) {
  const handle = await open(file, "r")
  return (async () => {
    const header = Buffer.alloc(64)
    if ((await handle.read(header, 0, 64, 0)).bytesRead !== 64)
      throw new Error("INSTALLED_DENO_EXECUTABLE_HEADER_TRUNCATED")
    if (os === "linux") {
      if (header.readUInt32BE(0) !== 0x7f454c46 || header[4] !== 2 || header[5] !== 1 || header[6] !== 1 ||
          ![2, 3].includes(header.readUInt16LE(16))) throw new Error("INSTALLED_DENO_EXECUTABLE_NOT_ELF64")
      if (header.readUInt16LE(18) !== (cpu === "x64" ? 62 : 183))
        throw new Error("INSTALLED_DENO_EXECUTABLE_CPU_MISMATCH")
      return { format: "elf", cpu }
    }
    if (os === "darwin") {
      if (header.readUInt32LE(0) !== 0xfeedfacf || header.readUInt32LE(12) !== 2)
        throw new Error("INSTALLED_DENO_EXECUTABLE_NOT_MACHO64")
      if (header.readUInt32LE(4) !== (cpu === "x64" ? 0x01000007 : 0x0100000c))
        throw new Error("INSTALLED_DENO_EXECUTABLE_CPU_MISMATCH")
      return { format: "macho", cpu }
    }
    if (header.readUInt16LE(0) !== 0x5a4d) throw new Error("INSTALLED_DENO_EXECUTABLE_NOT_PE")
    const offset = header.readUInt32LE(60)
    if (offset < 64 || offset > 1_048_576 || offset + 26 > (await handle.stat()).size)
      throw new Error("INSTALLED_DENO_PE_HEADER_OFFSET_INVALID")
    const pe = Buffer.alloc(26)
    if ((await handle.read(pe, 0, 26, offset)).bytesRead !== 26 || pe.readUInt32LE(0) !== 0x4550 ||
        pe.readUInt16LE(24) !== 0x20b || !(pe.readUInt16LE(22) & 2))
      throw new Error("INSTALLED_DENO_EXECUTABLE_NOT_PE64")
    if (pe.readUInt16LE(4) !== (cpu === "x64" ? 0x8664 : 0xaa64))
      throw new Error("INSTALLED_DENO_EXECUTABLE_CPU_MISMATCH")
    return { format: "pe", cpu }
  })().finally(() => handle.close())
}
