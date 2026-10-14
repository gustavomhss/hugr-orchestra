import { afterAll, beforeAll, expect, test } from "bun:test"
import { lstat, mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve, sep } from "node:path"
import { assertVersion, buildVersions, captureOracle, cli, snapshot, target } from "./fixture/distribution-native"
import type { Built } from "./fixture/distribution-native"
import { npmChannel } from "./fixture/distribution-native-npm"
import { emergencyStop, stopServices } from "./fixture/distribution-native-proof"
import { assertWindowsPE, nativeNodeCPU, windowsIdentity } from "./fixture/distribution-windows-process"
import { expectSpawn } from "../../core/test/fixture/omni-expect"
import { namedTargets } from "../script/targets"
import { WindowsProcessQuery } from "../../core/test/fixture/windows-process-query"
import { Schema } from "effect"

// Native hosted Windows x64-baseline and ARM64, matching their builder rows.
// Requires Bun 1.3.14, native Node >=22.13 (stripTypeScriptTypes), PowerShell 7,
// tar.exe, frozen workspace dependencies incl. native tree-sitter, and real
// release omni DLL/supervisor from omni-binaries action. No unavailable skips.
// Host HUGR_OMNI_* feeds harness only; sandbox removes all companion overrides.
// Source checkout stays readable; source CLI is never a launcher fallback.
const state: { directory?: string; built?: Built } = {}
const interrupt = () => { void stopServices().then(() => process.exit(1), () => process.exit(1)) }

beforeAll(async () => {
  if (process.platform !== "win32" || !["x64", "arm64"].includes(process.arch) || process.env.RUNNER_OS !== "Windows" ||
       process.env.RUNNER_ENVIRONMENT !== "github-hosted")
    throw new Error("NATIVE_WINDOWS_HOST_REQUIRED: hosted Windows x64 or ARM64")
  expect(process.env.RUNNER_ARCH).toBe(process.arch === "arm64" ? "ARM64" : "X64")
  if (process.versions.bun !== "1.3.14") throw new Error("BUN_VERSION_MISMATCH: require 1.3.14")
  expect(target).toBe(process.arch === "arm64" ? "windows-arm64" : "windows-x64-baseline")
  expect(namedTargets.find((item) => item.target === target)).toEqual(process.arch === "arm64"
    ? { target, os: "win32", arch: "arm64" }
    : { target, os: "win32", arch: "x64", avx2: false })
  expect(await nativeNodeCPU()).toBe(process.arch)
  await assertWindowsPE(process.execPath, false)
  // Query must see this live PE before it may prove detached daemon absence.
  expect((await windowsIdentity(process.pid))?.pid).toBe(process.pid)
  state.directory = await mkdtemp(join(await realpath(tmpdir()), "nw-"))
  expect(state.directory.toLowerCase().startsWith((await realpath(resolve(cli, "../.."))).toLowerCase() + sep)).toBe(false)
  process.once("exit", emergencyStop)
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  state.built = await buildVersions(state.directory)
  for (const payload of state.built.payloads) {
    await assertWindowsPE(join(payload.payload, "bin/orchestra.exe"), false)
    await assertWindowsPE(join(payload.payload, "bin/hugr-omni-supervisor.exe"), false)
    const bindings = payload.manifest.files.filter((file) => file.path.endsWith(".node"))
    expect(bindings.length).toBeGreaterThan(1)
    for (const binding of bindings) await assertWindowsPE(join(payload.payload, binding.path), true)
    expect(await snapshot(payload.payload)).toEqual(payload.snapshot)
  }
  expect((await captureOracle()).trees).toEqual(state.built.oracle.trees)
}, 1_800_000)

afterAll(async () => {
  // Any failed/unproved daemon join keeps original fixture and emergency hook.
  await stopServices()
  process.off("exit", emergencyStop)
  process.off("SIGINT", interrupt)
  process.off("SIGTERM", interrupt)
  if (state.directory) await rm(state.directory, { recursive: true, force: true })
}, 120_000)

test("native Windows npm install, update and exact downgrade qualify PE closure, public CMD launcher and owned daemon exit", async () => {
  expectSpawn(import.meta.path)
  if (!state.directory || !state.built) throw new Error("NATIVE_WINDOWS_BUILD_FIXTURE_MISSING")
  await npmChannel(state.directory, state.built, async (installed) => {
    // Separately diagnose compiled runtime before the required public CMD shim
    // on install, update and downgrade. Same env, cwd, 15 s budget, owned tree.
    await assertVersion(join(installed.payload, "bin/orchestra.exe"), installed.version, installed.box)
  })
  for (const payload of state.built.payloads) expect(await snapshot(payload.payload)).toEqual(payload.snapshot)
  expect((await captureOracle()).trees).toEqual(state.built.oracle.trees)
}, 900_000)

test("native Windows PE admission rejects wrong machine, PE32 and executable/DLL flag corruption before restored real images pass", async () => {
  if (!state.directory || !state.built) throw new Error("NATIVE_WINDOWS_BUILD_FIXTURE_MISSING")
  for (const image of [
    { path: "bin/orchestra.exe", dll: false },
    { path: "bin/hugr-omni-supervisor.exe", dll: false },
    { path: "bin/hugr_omni.node", dll: true },
  ]) {
    // Mutate copies of actual compiled payload images, never fabricated PE bytes.
    const original = Buffer.from(await Bun.file(join(state.built.payloads[0].payload, image.path)).arrayBuffer())
    const file = join(state.directory, `pe-control-${image.path.slice(4)}`)
    const offset = original.readUInt32LE(60)
    await Bun.write(file, original)
    await assertWindowsPE(file, image.dll)
    for (const mutation of [
      { name: "wrong-machine", offset: offset + 4, value: process.arch === "arm64" ? 0x8664 : 0xaa64 },
      { name: "pe32", offset: offset + 24, value: 0x10b },
      { name: "short-optional-header", offset: offset + 20, value: 2 },
      { name: "not-executable", offset: offset + 22, value: original.readUInt16LE(offset + 22) & ~2 },
      { name: "wrong-dll-flag", offset: offset + 22, value: original.readUInt16LE(offset + 22) ^ 0x2000 },
    ]) {
      const corrupt = Buffer.from(original)
      corrupt.writeUInt16LE(mutation.value, mutation.offset)
      try {
        await Bun.write(file, corrupt)
        await expect(assertWindowsPE(file, image.dll)).rejects.toThrow(`WINDOWS_PE_${process.arch.toUpperCase()}_FLAGS_INVALID:`)
      } finally { await Bun.write(file, original) }
      await assertWindowsPE(file, image.dll)
      expect(Buffer.from(await Bun.file(file).arrayBuffer())).toEqual(original)
      console.error(`NATIVE_WINDOWS_PE_CONTROL ${JSON.stringify({ arch: process.arch, image: image.path,
        mutation: mutation.name, rejected: true, restored: true })}`)
    }
    await rm(file)
  }
  for (const payload of state.built.payloads) expect(await snapshot(payload.payload)).toEqual(payload.snapshot)
}, 60_000)

test("native Windows broker closes owned pwsh after forced reader death and absolute timeout", async () => {
  const identity = Schema.Struct({ pid: Schema.Int, startTime: Schema.String })
  const cleanup = Schema.Struct({
    complete: Schema.Boolean, sourceComplete: Schema.Boolean, brokerClosed: Schema.Boolean, controlClosed: Schema.Boolean,
    query: Schema.Struct({ pid: Schema.Int, osClosed: Schema.Boolean, stdioClosed: Schema.Boolean }),
  })
  for (const mode of ["forced", "timeout"] as const) {
    const directory = await mkdtemp(join(await realpath(tmpdir()), "nw-query-control-"))
    const marker = join(directory, "query.json")
    const terminate = join(directory, "terminate")
    const reader = `
import {existsSync} from 'node:fs';
while(!existsSync(${JSON.stringify(marker)})) await new Promise(resolve=>setTimeout(resolve,10));
while(!existsSync(${JSON.stringify(terminate)})) await new Promise(resolve=>setTimeout(resolve,10));
process.kill(process.pid,'SIGKILL');
`
    const query = `$ErrorActionPreference='Stop'; $self=Get-CimInstance Win32_Process -Filter ('ProcessId='+$PID);
      [IO.File]::WriteAllText('${marker.replaceAll("'", "''")}.tmp',(ConvertTo-Json -Compress -InputObject @{pid=$PID;startTime=$self.CreationDate.ToFileTimeUtc().ToString()}));
      [IO.File]::Move('${marker.replaceAll("'", "''")}.tmp','${marker.replaceAll("'", "''")}');
      while($true) {[Threading.Thread]::Sleep(100)}`
    const held = WindowsProcessQuery.invoke(reader, "", { nonce: directory }, 15_000, query)
      .then(() => { throw new Error("WINDOWS_QUERY_CONTROL_UNEXPECTED_SUCCESS") }, (error: unknown) => error)
    try {
      // Calibration observes real live pwsh identity before provoking reader loss.
      const deadline = Date.now() + 10_000
      while (!(await Bun.file(marker).exists())) {
        if (Date.now() >= deadline) {
          await held
          throw new Error(`WINDOWS_QUERY_CONTROL_NOT_ADMITTED: ${directory}`)
        }
        await Bun.sleep(25)
      }
      const pinned = Schema.decodeUnknownSync(identity)(await Bun.file(marker).json())
      const live = await windowsIdentity(pinned.pid)
      expect(live?.pid).toBe(pinned.pid)
      expect(live?.startTime).toBe(pinned.startTime)
      expect(live?.executable.toLowerCase()).toEndWith("pwsh.exe")
      if (mode === "forced") await Bun.write(terminate, "terminate owned reader")
      const error = await held
      if (!(error instanceof Error) || !("cleanup" in error) || !("directory" in error) || typeof error.directory !== "string")
        throw new Error(`WINDOWS_QUERY_CONTROL_CLOSE_UNPROVEN: ${directory}`, { cause: error })
      expect(error.message).toContain(mode === "forced" ? "Windows process query failed:" : "deadline expired")
      const joined = Schema.decodeUnknownSync(cleanup)(error.cleanup)
      expect(joined).toEqual({ complete: true, sourceComplete: true, brokerClosed: true, controlClosed: true,
        query: { pid: pinned.pid, osClosed: true, stdioClosed: true } })
      // Independent fresh census: disappearance accepted only alongside live host control.
      expect(await windowsIdentity(pinned.pid)).toBeUndefined()
      const removed = await lstat(error.directory).then(() => false, (failure: unknown) => {
        if (failure && typeof failure === "object" && "code" in failure && failure.code === "ENOENT") return true
        throw failure
      })
      expect(removed).toBe(true)
      // Unproved joins keep boundary files; failed controls keep their markers.
      await rm(directory, { recursive: true })
    } finally { await held }
  }
}, 90_000)

test("native Windows broker preserves split UTF-8 bytes from owned PowerShell pipes", async () => {
  const reader = `
import {existsSync,readFileSync} from 'node:fs';
const result=process.argv[1]+'.result';
while(!existsSync(result)) await new Promise(resolve=>setTimeout(resolve,10));
console.log(readFileSync(result,'utf8'));
`
  // Each actual one-byte write is separated so the first UTF-8 character must
  // cross an observed pipe-chunk boundary; the receipt proves that boundary.
  const query = `$ErrorActionPreference='Stop'; $out=[Console]::OpenStandardOutput(); $err=[Console]::OpenStandardError();
    foreach($byte in @(195,169,230,188,162,240,159,152,128)) {
      $out.WriteByte([byte]$byte); $out.Flush(); $err.WriteByte([byte]$byte); $err.Flush(); [Threading.Thread]::Sleep(250)
    }`
  const output = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
    stdout: Schema.String, stderr: Schema.String, stdoutBytes: Schema.Int, stderrBytes: Schema.Int,
    stdoutChunks: Schema.Int, stderrChunks: Schema.Int, firstStdoutChunkBytes: Schema.Int,
    code: Schema.Int, closed: Schema.Boolean, error: Schema.String,
  }))))(await WindowsProcessQuery.invoke(reader, "", { nonce: "split-utf8" }, 15_000, query))
  expect(output).toMatchObject({ stdout: "é漢😀", stderr: "é漢😀", stdoutBytes: 9, stderrBytes: 9,
    firstStdoutChunkBytes: 1, code: 0, closed: true, error: "" })
  expect(output.stdoutChunks).toBeGreaterThan(1)
  expect(output.stderrChunks).toBeGreaterThan(1)
}, 30_000)
