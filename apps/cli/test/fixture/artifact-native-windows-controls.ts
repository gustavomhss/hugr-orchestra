import { afterEach, expect, test } from "bun:test"
import { lstat, mkdtemp, readdir, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, parse } from "node:path"
import { fileURLToPath } from "node:url"
import { Schema } from "effect"
import { ArtifactNativeWindows } from "@orchestra/core/artifact-native-windows"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { command } from "./distribution-native-process"
import { artifactNative } from "../../script/artifact-fs"

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

const Compiler = Schema.Struct({ boundary: Schema.Literal("omni"), pid: Schema.NullOr(Schema.Int),
  stopped: Schema.Boolean, osClosed: Schema.Boolean, outputSettled: Schema.Boolean, outputClosed: Schema.Boolean,
  treeEmpty: Schema.Boolean, exitCode: Schema.NullOr(Schema.Int),
  telemetry: Schema.Struct({ spawns: Schema.Int, delegations: Schema.Int }) })
const Lifecycle = Schema.Struct({ directory: Schema.String, mapped: Schema.Boolean, compilerJoined: Schema.Boolean,
  removed: Schema.Boolean, compiler: Compiler })

function expectJoinedCompiler(compiler: typeof Compiler.Type) {
  expect(compiler.pid).toBeGreaterThan(0)
  expect(compiler).toMatchObject({ boundary: "omni", stopped: true, osClosed: true,
    outputSettled: true, outputClosed: true, treeEmpty: true })
}

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
  const filesystem = await artifactNative()
  try {
    const directory = filesystem.root(parse(await realpath(tmpdir())).root)
    try {
      expect(directory.handle).toBeGreaterThan(0n)
      expect(directory.identity).toMatch(/^[0-9a-f]{48}$/)
      if (!directory.validateRoot) throw new Error("ARTIFACT_WINDOWS_NATIVE_DIRECTORY_CONTROL_UNVALIDATED")
      directory.validateRoot()
      native.ptr(left)
      expect(native.leases().pendingBuffers).toBe(1)
      // This live, identity-validated NT directory is not a process object.
      // IsWow64Process2 must fail at the OS query after leasing both outputs;
      // unlike NULL, this nonzero handle cannot select the current-process default.
      expect(() => native.attest(process.arch, directory.handle)).toThrow("ARTIFACT_WINDOWS_NATIVE_CPU_QUERY_FAILED")
      expect(native.leases().pendingBuffers).toBe(0)
    } finally { filesystem.closeDirectory(directory) }
  } finally { filesystem.close() }
  native.ptr(left)
  expect(() => native.attest(process.arch === "arm64" ? "x64" : "arm64")).toThrow("ARTIFACT_WINDOWS_NATIVE_ABI_MISMATCH")
  expect(native.leases().pendingBuffers).toBe(0)
  expect(native.attest().arch).toBe(process.arch)
  expect(native.leases().pendingBuffers).toBe(0)
  expectJoinedCompiler(native.compiler)
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
    expect(lifecycle).toMatchObject({ mapped: false, compilerJoined: true, removed: true })
    expectJoinedCompiler(lifecycle.compiler)
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
  expect(lifecycle).toMatchObject({ mapped: true, compilerJoined: true, removed: false })
  expectJoinedCompiler(lifecycle.compiler)
  expect((await lstat(lifecycle.directory)).isDirectory()).toBe(true)
  expect(ArtifactNativeWindows.ownership()).toContainEqual({ directory: lifecycle.directory,
    module: join(lifecycle.directory, "artifact-native.node"), lifetime: "process" })
}, 180_000)

test("native Windows compiler uses strict owned Omni with cached disabled or invalid global AppProcess modes", async () => {
  expectSpawn(import.meta.path)
  const input = await source('compile_error!("owned compiler control");\n')
  const script = `
import { Effect } from 'effect';
import { AppProcess } from ${JSON.stringify(new URL("../../../../packages/core/src/process.ts", import.meta.url).href)};
import { LayerNode } from ${JSON.stringify(new URL("../../../../packages/core/src/effect/layer-node.ts", import.meta.url).href)};
import { ArtifactNativeWindows } from ${JSON.stringify(new URL("../../../../packages/core/src/artifact-native-windows.ts", import.meta.url).href)};
await Effect.runPromise(Effect.gen(function*(){ const service = yield* AppProcess.Service; return service; }).pipe(Effect.provide(LayerNode.compile(AppProcess.node)),Effect.scoped));
try { await ArtifactNativeWindows.build({source:${JSON.stringify(input.file)},parent:${JSON.stringify(input.root)}}); throw Error('UNEXPECTED_COMPILER_SUCCESS'); }
catch(error) { if (!error?.lifecycle) throw error; console.log(JSON.stringify({flag:process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER,lifecycle:error.lifecycle})); }
`
  for (const flag of ["0", "invalid-control-mode"]) {
    const result = await command([process.execPath, "--eval", script], { cwd: fileURLToPath(new URL("../../../../packages/core", import.meta.url)),
      env: { ...process.env, ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: flag } }, 150_000)
    expect(result.code, result.stderr).toBe(0)
    const reply = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
      flag: Schema.String, lifecycle: Lifecycle,
    }))))(result.stdout)
    if (!reply.lifecycle.compilerJoined) retained.add(input.root)
    expect(reply.flag).toBe(flag)
    expect(reply.lifecycle).toMatchObject({ mapped: false, compilerJoined: true, removed: true })
    expectJoinedCompiler(reply.lifecycle.compiler)
    await expect(lstat(reply.lifecycle.directory)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readdir(input.root)).toEqual(["fault.rs"])
  }
}, 330_000)

test("native Windows compiler accepts its joined child during unrelated concurrent on-mode delegation", async () => {
  expectSpawn(import.meta.path)
  // Isolate the real legacy delegation from the parent suite's strict counters.
  // No environment flags or telemetry values are mutated in either process.
  const script = `
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { AppProcess } from ${JSON.stringify(new URL("../../../../packages/core/src/process.ts", import.meta.url).href)};
import { CrossSpawnSpawner } from ${JSON.stringify(new URL("../../../../packages/core/src/cross-spawn-spawner.ts", import.meta.url).href)};
import { Omni } from ${JSON.stringify(new URL("../../../../packages/core/src/omni.ts", import.meta.url).href)};
import { ArtifactNativeWindows } from ${JSON.stringify(new URL("../../../../packages/core/src/artifact-native-windows.ts", import.meta.url).href)};
const spawner = Layer.effect(ChildProcessSpawner.ChildProcessSpawner, CrossSpawnSpawner.makeWith('on', {windowsHide:true}))
  .pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)));
const service = await Effect.runPromise(Effect.gen(function*(){
  const app = yield* AppProcess.Service; return app;
}).pipe(Effect.provide(AppProcess.layerWith('on').pipe(Layer.provide(spawner))), Effect.scoped));
const pipeline = ChildProcess.make(process.execPath, ['--eval', "process.stdout.write('unrelated-delegation')"])
  .pipe(ChildProcess.pipeTo(ChildProcess.make(process.execPath, ['--eval', 'process.stdin.pipe(process.stdout)'])));
const before = Omni.snapshot();
const state = {settled:false};
const held = ArtifactNativeWindows.build().then(native=>({native}), error=>({error})).finally(()=>{state.settled=true});
try {
  const deadline = Date.now()+15000;
  while(Omni.snapshot().spawns === before.spawns) {
    if(state.settled || Date.now() >= deadline) throw Error('ARTIFACT_WINDOWS_CONCURRENT_CONTROL_NOT_ADMITTED');
    await Bun.sleep(1);
  }
  if(state.settled) throw Error('ARTIFACT_WINDOWS_CONCURRENT_CONTROL_MISSED_ADMISSION');
  const start = Omni.snapshot().delegations;
  const unrelated = await Effect.runPromise(service.run(pipeline, {
    timeout:20000, maxOutputBytes:4096, maxErrorBytes:4096,
  }).pipe(Effect.scoped));
  const delegations = Omni.snapshot().delegations-start;
  if(unrelated.exitCode !== 0 || unrelated.stdout.toString('utf8') !== 'unrelated-delegation' || delegations < 1)
    throw Error('ARTIFACT_WINDOWS_CONCURRENT_CONTROL_DELEGATION_UNPROVEN');
  const result = await held;
  if('error' in result) throw result.error;
  // Positive telemetry here proves interference occurred inside the compiler's
  // observation window; telemetry is not the producer's admission predicate.
  if(result.native.compiler.telemetry.delegations < 1)
    throw Error('ARTIFACT_WINDOWS_CONCURRENT_CONTROL_MISSED_COMPILER_WINDOW');
  console.log(JSON.stringify({compiler:result.native.compiler,delegations,output:unrelated.stdout.toString('utf8')}));
} finally { await held; }
`
  const result = await command([process.execPath, "--eval", script], {
    cwd: fileURLToPath(new URL("../../../../packages/core", import.meta.url)), env: process.env,
  }, 180_000)
  expect(result.code, result.stderr).toBe(0)
  const reply = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
    compiler: Compiler, delegations: Schema.Int, output: Schema.String,
  }))))(result.stdout)
  expect(reply.delegations).toBeGreaterThan(0)
  expect(reply.output).toBe("unrelated-delegation")
  expect(reply.compiler.telemetry.delegations).toBeGreaterThan(0)
  expectJoinedCompiler(reply.compiler)
  expect(reply.compiler.exitCode).toBe(0)
}, 210_000)
