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
  if (process.platform === "darwin") {
    const hardware = await command(["/usr/sbin/sysctl", "-n", "hw.optional.arm64"], box, 15_000)
    if (hardware.code !== 0 || hardware.stdout.trim() !== (nativeCPU === "arm64" ? "1" : "0"))
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
  const host = { os: process.platform, cpu: nativeCPU, machine: nativeMachine }
  const directory = await mkdtemp(join(await realpath(box.cwd), ".installed-deno-"))
  const adapter = await readFile(resolve(import.meta.dirname, "../../../omni/bindings/node/index.js"))
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
import { createRequire } from "node:module"
import { realpathSync } from "node:fs"
import { machine } from "node:os"
import process from "node:process"
const paths = ${JSON.stringify(paths)}
const host = ${JSON.stringify(host)}
const executable = ${JSON.stringify(executable)}
const runtimeBinary = ${JSON.stringify(runtimeBinary)}
let stage = "identity"
try {
  const identity = { runtime: "deno", version: Deno.version.deno, versions: Deno.version,
    os: process.platform, cpu: process.arch, build: Deno.build, machine: machine(),
    execPath: realpathSync(Deno.execPath()), pid: Deno.pid, denoDir: Deno.env.get("DENO_DIR") }
  assert.equal(identity.version, "2.9.7", "INSTALLED_DENO_RUNTIME_VERSION_MISMATCH")
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
  stage = "configure"
  const omni = createRequire(import.meta.url)("./adapter.cjs")
  omni.configure(paths)
  stage = "spawn"
  const child = omni.spawn(executable, ["run", "--no-config", "--no-lock", "--cached-only", "child.mjs"], {
    cwd: ${JSON.stringify(directory)}, inheritEnv: false,
    env: { ...${JSON.stringify(childEnv)}, DENO_DIR: identity.denoDir },
    timeoutMs: 10_000, graceMs: 1_000, stdin: "closed", text: true,
  })
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
  console.log(JSON.stringify({ oracle: "installed-deno-companion", identity, host, runtimeBinary, paths,
    adapterSha256: ${JSON.stringify(adapterSha256)}, childPID: child.pid, exitCode: result.exitCode,
    stdout: output.stdout, stderr: output.stderr, reason: result.reason }))
} catch (error) {
  console.error("INSTALLED_DENO_COMPANION_PROBE_FAILED: " + JSON.stringify({ stage, paths, error: String(error) }))
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
    const admission = async () => {
      const cache = await mkdtemp(join(directory, "cache-"))
      await mkdir(join(cache, "tmp"))
      return command([executable, "run", "--no-config", "--no-lock", "--cached-only", "--no-prompt",
        `--allow-ffi=${paths.addon}`, "--allow-env", "--allow-read", "--allow-sys", join(directory, "probe.mjs")], {
        cwd: directory, env: { ...env, DENO_DIR: cache, TMPDIR: join(cache, "tmp"), TMP: join(cache, "tmp"), TEMP: join(cache, "tmp") },
      }, 30_000)
    }
    const first = await admission()
    if (first.code !== 0) return first
    const receipt = JSON.parse(first.stdout)
    if (receipt.oracle !== "installed-deno-companion" || receipt.exitCode !== 7 ||
        receipt.stdout !== "installed-deno-companion-child\n" || first.stderr !== "")
      throw new Error("INSTALLED_DENO_POSITIVE_RECEIPT_INVALID")
    const controls = []
    for (const member of ["addon", "supervisor"] as const) {
      const file = paths[member]
      const info = await lstat(file)
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
        throw new Error(`INSTALLED_DENO_CONTROL_FILE_NOT_OWNED_REGULAR: ${file}`)
      const original = await readFile(file)
      for (const kind of ["missing", "corrupt"] as const) {
        const backup = `${file}.deno-control-${randomUUID()}`
        await rename(file, backup)
        const failed = await (async () => {
          if (kind === "corrupt") await writeFile(file, "not an installed native companion", { flag: "wx", mode: info.mode & 0o777 })
          return admission()
        })().finally(async () => {
          if (kind === "corrupt") await rm(file, { force: true })
          await rename(backup, file)
        })
        if (!(await readFile(file)).equals(original) || (await lstat(file)).mode !== info.mode)
          throw new Error(`INSTALLED_DENO_CONTROL_RESTORATION_FAILED: ${file}`)
        const marker = "INSTALLED_DENO_COMPANION_PROBE_FAILED: "
        if (failed.code !== 1 || !failed.stderr.startsWith(marker) || failed.stdout !== "")
          throw new Error(`INSTALLED_DENO_NEGATIVE_CONTROL_FAILED: ${member}/${kind}: ${JSON.stringify(failed)}`)
        const failure = JSON.parse(failed.stderr.slice(marker.length))
        if (failure.stage !== (member === "addon" ? "configure" : "spawn") ||
            failure.paths?.[member] !== file || !String(failure.error).includes(file))
          throw new Error(`INSTALLED_DENO_NEGATIVE_CONTROL_UNCORROBORATED: ${member}/${kind}: ${failed.stderr}`)
        const restored = await admission()
        if (restored.code !== 0 || restored.stderr !== "" ||
            JSON.parse(restored.stdout).oracle !== "installed-deno-companion")
          throw new Error(`INSTALLED_DENO_RESTORED_ADMISSION_FAILED: ${member}/${kind}: ${JSON.stringify(restored)}`)
        controls.push({ member, kind, code: failed.code, stderr: failed.stderr, restored: true })
      }
    }
    return { ...first, stdout: JSON.stringify({ ...receipt, controls }) + "\n" }
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
