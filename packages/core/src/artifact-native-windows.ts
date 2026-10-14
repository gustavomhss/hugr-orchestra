export * as ArtifactNativeWindows from "./artifact-native-windows"

import { mkdtemp, readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Pointer } from "bun:ffi"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "./process"
import { LayerNode } from "./effect/layer-node"

// Producer-only shim for Bun builds without TinyCC. No filesystem operations
// live here: the CLI retains its existing handle-relative NT implementation.
// The std-only Rust DLL binds the Windows 64-bit system ABI, with integer/pointer
// arguments only. N-API is resolved from the running executable, not node.lib.
const state: { loaded?: ReturnType<typeof build> } = {}
export function load() {
  return state.loaded ??= build()
}

export function requireImage(bytes: Buffer, cpu: string, dll: boolean) {
  if (!["arm64", "x64"].includes(cpu)) throw new Error("ARTIFACT_WINDOWS_CPU_UNSUPPORTED")
  if (bytes.length < 64 || bytes.readUInt16LE(0) !== 0x5a4d) throw new Error("ARTIFACT_WINDOWS_PE_INVALID")
  const offset = bytes.readUInt32LE(60)
  if (offset < 64 || offset > 1_048_576 || offset + 26 > bytes.length || bytes.readUInt32LE(offset) !== 0x4550 ||
      bytes.readUInt16LE(offset + 4) !== (cpu === "arm64" ? 0xaa64 : 0x8664) ||
      bytes.readUInt16LE(offset + 20) < 112 || offset + 24 + bytes.readUInt16LE(offset + 20) > bytes.length ||
      bytes.readUInt16LE(offset + 24) !== 0x20b || !(bytes.readUInt16LE(offset + 22) & 2) ||
      Boolean(bytes.readUInt16LE(offset + 22) & 0x2000) !== dll)
    throw new Error("ARTIFACT_WINDOWS_PE_CPU_OR_FLAGS_INVALID")
}

export function requireMachine(cpu: string, processMachine: number, nativeMachine: number, moduleMachine: number) {
  if (!["arm64", "x64"].includes(cpu) || processMachine !== 0 ||
      nativeMachine !== (cpu === "arm64" ? 0xaa64 : 0x8664) || moduleMachine !== nativeMachine)
    throw new Error("ARTIFACT_WINDOWS_NATIVE_ABI_MISMATCH")
}

async function build() {
  if (process.platform !== "win32" || !["arm64", "x64"].includes(process.arch))
    throw new Error("ARTIFACT_WINDOWS_NATIVE_HOST_REQUIRED")
  requireImage(await readFile(process.execPath), process.arch, false)
  const directory = await mkdtemp(join(tmpdir(), "orchestra-artifact-native-"))
  const output = join(directory, "artifact-native.node")
  const result = await Effect.runPromise(Effect.gen(function* () {
    const service = yield* AppProcess.Service
    return yield* service.run(ChildProcess.make("rustup", ["run", "1.98.0", "rustc",
      "--crate-type", "cdylib", "--crate-name", "orchestra_artifact_native", "--edition", "2021", "-O", "--target",
      `${process.arch === "arm64" ? "aarch64" : "x86_64"}-pc-windows-msvc`,
      fileURLToPath(new URL("./artifact-native-windows.rs", import.meta.url)), "-o", output,
    ], { cwd: directory, env: process.env, stdin: "ignore", stdout: "pipe", stderr: "pipe", forceKillAfter: "2 seconds" }),
    { timeout: "120 seconds", maxOutputBytes: 1024 * 1024, maxErrorBytes: 1024 * 1024 })
  }).pipe(Effect.provide(LayerNode.compile(AppProcess.node)), Effect.scoped))
  if (result.exitCode !== 0 || result.stdoutTruncated || result.stderrTruncated)
    throw new Error(`ARTIFACT_WINDOWS_NATIVE_BUILD_FAILED: ${result.stderr.toString("utf8")}`)
  requireImage(await readFile(output), process.arch, true)
  // Windows keeps a loaded addon mapped until process exit. Retain this isolated
  // producer temp directory; never unlink a live DLL or reuse a caller's cache.
  const native: {
    pointer(buffer: Uint8Array): number
    invoke(id: number, ...args: (number | bigint | null)[]): number
  } = createRequire(import.meta.url)(output)
  if (typeof native.pointer !== "function" || typeof native.invoke !== "function")
    throw new Error("ARTIFACT_WINDOWS_NATIVE_EXPORTS_MISSING")
  // A numeric address does not keep its backing Buffer alive across N-API calls.
  // Retain every argument buffer through the synchronous native invocation.
  const pending = new Set<Uint8Array>()
  const ptr = (buffer: Uint8Array) => {
    pending.add(buffer)
    return native.pointer(buffer) as Pointer
  }
  const processMachine = Buffer.alloc(2)
  const nativeMachine = Buffer.alloc(2)
  if (native.invoke(10, ptr(processMachine), ptr(nativeMachine)) !== 1)
    throw new Error("ARTIFACT_WINDOWS_NATIVE_CPU_QUERY_FAILED")
  const attestation = { arch: process.arch, processMachine: processMachine.readUInt16LE(),
    nativeMachine: nativeMachine.readUInt16LE(), moduleMachine: native.invoke(11), invalidHandleStatus: native.invoke(6, 0n) >>> 0 }
  pending.clear()
  requireMachine(attestation.arch, attestation.processMachine, attestation.nativeMachine, attestation.moduleMachine)
  if (attestation.invalidHandleStatus !== 0xc0000008) throw new Error("ARTIFACT_WINDOWS_NATIVE_NTSTATUS_CONTROL_FAILED")
  console.error(`ARTIFACT_WINDOWS_NATIVE_ABI ${JSON.stringify(attestation)}`)
  return { ptr, attestation, dlopen: (library: string, definitions: Record<string, unknown>) => {
    const lease = { closed: false }
    const call = (id: number, args: (number | bigint | null)[]) => {
      if (lease.closed) throw new Error("ARTIFACT_WINDOWS_NATIVE_LIBRARY_CLOSED")
      try { return native.invoke(id, ...args) }
      finally { pending.clear() }
    }
    const symbols = {
      NtCreateFile: (...args: (number | bigint | null)[]) => call(0, args),
      NtQueryInformationFile: (...args: (number | bigint | null)[]) => call(1, args),
      NtReadFile: (...args: (number | bigint | null)[]) => call(2, args),
      NtWriteFile: (...args: (number | bigint | null)[]) => call(3, args),
      NtQueryDirectoryFile: (...args: (number | bigint | null)[]) => call(4, args),
      NtSetInformationFile: (...args: (number | bigint | null)[]) => call(5, args),
      NtClose: (...args: (number | bigint | null)[]) => call(6, args),
      QueryDosDeviceW: (...args: (number | bigint | null)[]) => call(7, args),
      GetFinalPathNameByHandleW: (...args: (number | bigint | null)[]) => call(8, args),
      CompareStringOrdinal: (...args: (number | bigint | null)[]) => call(9, args),
    }
    const allowed = library === "ntdll.dll" ? Object.keys(symbols).slice(0, 7)
      : library === "kernel32.dll" ? Object.keys(symbols).slice(7) : []
    if (!Object.keys(definitions).length || Object.keys(definitions).some((name) => !allowed.includes(name)))
      throw new Error("ARTIFACT_WINDOWS_NATIVE_SYMBOL_UNSUPPORTED")
    // N-API module stays mapped; closing this lease forbids further calls.
    return { symbols, close: () => { lease.closed = true } }
  } }
}
