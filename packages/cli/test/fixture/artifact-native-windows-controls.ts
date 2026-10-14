import { afterEach, expect, test } from "bun:test"
import { lstat, mkdtemp, readdir, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Schema } from "effect"
import { ArtifactNativeWindows } from "@orchestra/core/artifact-native-windows"
import { expectSpawn } from "../../../core/test/fixture/omni-expect"
import { command } from "./distribution-native-process"

const roots: string[] = []
const retained = new Set<string>()
afterEach(async () => {
  await Promise.all(roots.splice(0).filter((root) => !retained.has(root)).map((root) => rm(root, { recursive: true, force: true })))
})

async function source(text: string) {
  const root = await mkdtemp(join(await realpath(tmpdir()), "artifact-native-control-"))
  roots.push(root)
  const file = join(root, "fault.rs")
  await Bun.write(file, text)
  return { root, file }
}

const Lifecycle = Schema.Struct({ directory: Schema.String, mapped: Schema.Boolean, compilerJoined: Schema.Boolean,
  removed: Schema.Boolean, compiler: Schema.Struct({ spawns: Schema.Int, delegations: Schema.Int }) })

test("native Windows adapter releases buffer leases on failed pointers, closed calls and rejected live attestation", async () => {
  const native = await ArtifactNativeWindows.load()
  const library = native.dlopen("kernel32.dll", { CompareStringOrdinal: {} })
  const handles = native.dlopen("ntdll.dll", { NtClose: {} })
  const left = Buffer.from("é漢😀\0", "utf16le")
  const right = Buffer.from("é漢😀\0", "utf16le")
  native.ptr(left)
  expect(native.leases().pendingBuffers).toBe(1) // Positive control for the lease observer.
  expect(() => native.ptr(Buffer.alloc(0))).toThrow("ARTIFACT_WINDOWS_NATIVE_ARGUMENT_INVALID")
  expect(native.leases().pendingBuffers).toBe(0)
  expect(library.symbols.CompareStringOrdinal(native.ptr(left), -1, native.ptr(right), -1, 1)).toBe(2)
  expect(library.symbols.CompareStringOrdinal(native.ptr(left), -1n, native.ptr(right), -1n, 1)).toBe(2)
  expect(native.leases().pendingBuffers).toBe(0)
  for (const length of [-2147483649, 2147483648, 0.5, NaN, Infinity, -2147483649n]) {
    expect(() => library.symbols.CompareStringOrdinal(native.ptr(left), length, native.ptr(right), -1, 1))
      .toThrow("ARTIFACT_WINDOWS_NATIVE_ARGUMENT_INVALID")
    expect(native.leases().pendingBuffers).toBe(0)
  }
  expect(() => library.symbols.CompareStringOrdinal(-1, -1, native.ptr(right), -1, 1))
    .toThrow("ARTIFACT_WINDOWS_NATIVE_ARGUMENT_INVALID")
  expect(() => handles.symbols.NtClose(-1n)).toThrow("ARTIFACT_WINDOWS_NATIVE_ARGUMENT_INVALID")
  handles.close()
  expect(native.leases().pendingBuffers).toBe(0)
  library.close()
  native.ptr(left)
  expect(native.leases().pendingBuffers).toBe(1)
  expect(() => library.symbols.CompareStringOrdinal(native.ptr(left), -1, native.ptr(right), -1, 1))
    .toThrow("ARTIFACT_WINDOWS_NATIVE_LIBRARY_CLOSED")
  expect(native.leases().pendingBuffers).toBe(0)
  native.ptr(left)
  // NULL is a real invalid process handle: the OS query fails after both
  // native output-buffer pointers have been leased, before receipt decoding.
  expect(() => native.attest(process.arch, 0n)).toThrow("ARTIFACT_WINDOWS_NATIVE_CPU_QUERY_FAILED")
  expect(native.leases().pendingBuffers).toBe(0)
  native.ptr(left)
  expect(() => native.attest(process.arch === "arm64" ? "x64" : "arm64")).toThrow("ARTIFACT_WINDOWS_NATIVE_ABI_MISMATCH")
  expect(native.leases().pendingBuffers).toBe(0)
  expect(native.attest().arch).toBe(process.arch)
  expect(native.leases().pendingBuffers).toBe(0)
  expect(native.compiler.spawns).toBeGreaterThan(0)
  expect(native.compiler.delegations).toBe(0)
}, 180_000)

test("native Windows compiler failure and deadline join owned tree before private output cleanup", async () => {
  expectSpawn(import.meta.path)
  const input = await source('#[link(name="orchestra_native_control_missing_library")] extern "C" { fn missing(); }\n#[no_mangle] pub unsafe extern "C" fn force_link() { missing(); }\n')
  for (const mode of ["link-failure", "deadline"] as const) {
    const failure = await ArtifactNativeWindows.build({ source: mode === "link-failure" ? input.file : undefined,
      parent: input.root, timeoutMs: mode === "deadline" ? 1 : 120_000 }).then(
      () => { throw new Error("ARTIFACT_WINDOWS_NATIVE_FAULT_CONTROL_UNEXPECTED_SUCCESS") }, (error: unknown) => error)
    if (!(failure instanceof Error) || !("lifecycle" in failure)) throw failure
    const lifecycle = Schema.decodeUnknownSync(Lifecycle)(failure.lifecycle)
    if (!lifecycle.compilerJoined) retained.add(input.root)
    expect(failure.message).toContain(mode === "deadline" ? "ARTIFACT_WINDOWS_NATIVE_BUILD_TIMEOUT" : "ARTIFACT_WINDOWS_NATIVE_BUILD_FAILED")
    expect(lifecycle).toMatchObject({ mapped: false, compilerJoined: true, removed: true, compiler: { delegations: 0 } })
    expect(lifecycle.compiler.spawns).toBeGreaterThan(0)
    await expect(lstat(lifecycle.directory)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readdir(input.root)).toEqual(["fault.rs"])
    expect(await Bun.file(input.file).text()).toContain("force_link")
  }
}, 180_000)

test("native Windows mapped addon export failure retains explicit process-lifetime directory ownership", async () => {
  expectSpawn(import.meta.path)
  const input = await source('use std::ffi::c_void;\n#[no_mangle] pub extern "C" fn napi_register_module_v1(_: *mut c_void, exports: *mut c_void) -> *mut c_void { exports }\n')
  const failure = await ArtifactNativeWindows.build({ source: input.file }).then(
    () => { throw new Error("ARTIFACT_WINDOWS_NATIVE_MAPPED_CONTROL_UNEXPECTED_SUCCESS") }, (error: unknown) => error)
  if (!(failure instanceof Error) || !("lifecycle" in failure)) throw failure
  expect(failure.message).toBe("ARTIFACT_WINDOWS_NATIVE_EXPORTS_MISSING")
  const lifecycle = Schema.decodeUnknownSync(Lifecycle)(failure.lifecycle)
  expect(lifecycle).toMatchObject({ mapped: true, compilerJoined: true, removed: false, compiler: { delegations: 0 } })
  expect(lifecycle.compiler.spawns).toBeGreaterThan(0)
  expect((await lstat(lifecycle.directory)).isDirectory()).toBe(true)
  expect(ArtifactNativeWindows.ownership()).toContainEqual({ directory: lifecycle.directory,
    module: join(lifecycle.directory, "artifact-native.node"), lifetime: "process" })
}, 180_000)

test("native Windows compiler uses strict owned Omni with cached disabled or invalid global AppProcess modes", async () => {
  expectSpawn(import.meta.path)
  const input = await source('compile_error!("owned compiler control");\n')
  const script = `
import { Effect } from 'effect';
import { AppProcess } from ${JSON.stringify(new URL("../../../core/src/process.ts", import.meta.url).href)};
import { LayerNode } from ${JSON.stringify(new URL("../../../core/src/effect/layer-node.ts", import.meta.url).href)};
import { ArtifactNativeWindows } from ${JSON.stringify(new URL("../../../core/src/artifact-native-windows.ts", import.meta.url).href)};
await Effect.runPromise(Effect.gen(function*(){ const service = yield* AppProcess.Service; return service; }).pipe(Effect.provide(LayerNode.compile(AppProcess.node)),Effect.scoped));
try { await ArtifactNativeWindows.build({source:${JSON.stringify(input.file)},parent:${JSON.stringify(input.root)}}); throw Error('UNEXPECTED_COMPILER_SUCCESS'); }
catch(error) { if (!error?.lifecycle) throw error; console.log(JSON.stringify({flag:process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER,lifecycle:error.lifecycle})); }
`
  for (const flag of ["0", "invalid-control-mode"]) {
    const result = await command([process.execPath, "--eval", script], { cwd: fileURLToPath(new URL("../../../core", import.meta.url)),
      env: { ...process.env, ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: flag } }, 150_000)
    expect(result.code, result.stderr).toBe(0)
    const reply = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
      flag: Schema.String, lifecycle: Lifecycle,
    }))))(result.stdout)
    if (!reply.lifecycle.compilerJoined) retained.add(input.root)
    expect(reply.flag).toBe(flag)
    expect(reply.lifecycle).toMatchObject({ mapped: false, compilerJoined: true, removed: true, compiler: { delegations: 0 } })
    expect(reply.lifecycle.compiler.spawns).toBeGreaterThan(0)
    await expect(lstat(reply.lifecycle.directory)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readdir(input.root)).toEqual(["fault.rs"])
  }
}, 330_000)
