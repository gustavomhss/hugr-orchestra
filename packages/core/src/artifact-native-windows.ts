export * as ArtifactNativeWindows from "./artifact-native-windows"

import { mkdtemp, readFile, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Pointer } from "bun:ffi"
import { Omni } from "./omni"

// Producer-only shim for Bun builds without TinyCC. No filesystem operations
// live here: the CLI retains its existing handle-relative NT implementation.
// The std-only Rust DLL binds the Windows 64-bit system ABI, with integer/pointer
// arguments only. N-API is resolved from the running executable, not node.lib.
type Owner = { directory: string; module: string; lifetime: "process" }
type Scalar = number | bigint | null
type Symbol = "NtCreateFile" | "NtQueryInformationFile" | "NtReadFile" | "NtWriteFile" | "NtQueryDirectoryFile" |
  "NtSetInformationFile" | "NtClose" | "QueryDosDeviceW" | "GetFinalPathNameByHandleW" | "CompareStringOrdinal"
type Attestation = { arch: NodeJS.Architecture; processMachine: number; nativeMachine: number; moduleMachine: number; invalidHandleStatus: number }
export type Native = {
  ptr(buffer: Uint8Array): Pointer
  attest(cpu?: NodeJS.Architecture, processHandle?: bigint): Attestation
  attestation: Attestation
  ownership: Owner
  compiler: { spawns: number; delegations: number }
  leases(): { pendingBuffers: number }
  dlopen(library: string, definitions: Record<string, unknown>): { symbols: Record<Symbol, (...args: Scalar[]) => number>; close(): void }
}
const state: { loaded?: Promise<Native> } = {}
const mapped = new Set<Owner>()
export function load(): Promise<Native> {
  return state.loaded ??= build()
}

export function ownership() {
  return [...mapped].map((entry) => ({ ...entry }))
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

export async function build(input: { source?: string; parent?: string; timeoutMs?: number } = {}): Promise<Native> {
  if (process.platform !== "win32" || !["arm64", "x64"].includes(process.arch))
    throw new Error("ARTIFACT_WINDOWS_NATIVE_HOST_REQUIRED")
  const timeout = input.timeoutMs ?? 120_000
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("ARTIFACT_WINDOWS_NATIVE_TIMEOUT_INVALID")
  requireImage(await readFile(process.execPath), process.arch, false)
  // This producer owns an explicit Omni child, independently of AppProcess.node's
  // cached/global spawner mode. No mode, environment or allowlist is mutated.
  const omni = await Omni.load()
  const directory = await mkdtemp(join(input.parent ?? tmpdir(), "orchestra-artifact-native-"))
  const output = join(directory, "artifact-native.node")
  const lifecycle = { directory, mapped: false, compilerJoined: true, removed: false, compiler: { spawns: 0, delegations: 0 } }
  try {
    const before = Omni.snapshot()
    const child = omni.spawn("rustup", ["run", "1.98.0", "rustc",
      "--crate-type", "cdylib", "--crate-name", "orchestra_artifact_native", "--edition", "2021", "-O", "--target",
      `${process.arch === "arm64" ? "aarch64" : "x86_64"}-pc-windows-msvc`,
      input.source ? resolve(input.source) : fileURLToPath(new URL("./artifact-native-windows.rs", import.meta.url)), "-o", output,
    ], { cwd: directory, env: Omni.childEnv(), inheritEnv: false, text: false, backpressure: true, stdin: "closed" })
    lifecycle.compilerJoined = false
    Omni.count("spawns") // A real, owned native child now exists; no delegation path exists here.
    const streams = { stdout: { bytes: 0, chunks: [] as Buffer[] }, stderr: { bytes: 0, chunks: [] as Buffer[] } }
    const drain = (async () => {
      for await (const chunk of child.output) {
        if (chunk.lostBefore) throw new Error("ARTIFACT_WINDOWS_NATIVE_COMPILER_OUTPUT_GAP")
        if (chunk.stream === "pty") throw new Error("ARTIFACT_WINDOWS_NATIVE_COMPILER_UNEXPECTED_PTY")
        const stream = streams[chunk.stream]
        stream.bytes += chunk.data.length
        if (stream.bytes > 1024 * 1024) throw new Error("ARTIFACT_WINDOWS_NATIVE_COMPILER_OUTPUT_LIMIT")
        stream.chunks.push(Buffer.from(chunk.data))
      }
    })()
    const timer: { current?: ReturnType<typeof setTimeout> } = {}
    const result = await (async () => {
      try {
        return await Promise.race([
          Promise.all([child.wait(), drain]).then(([exit]) => exit),
          new Promise<never>((_, reject) => {
            timer.current = setTimeout(() => reject(new Error("ARTIFACT_WINDOWS_NATIVE_BUILD_TIMEOUT")), timeout)
          }),
        ])
      } finally {
        clearTimeout(timer.current)
        // Join OS exit, pipe consumer and whole owned tree before touching the
        // private compiler directory. An unproved join is a retained failure.
        const joined = await Promise.allSettled([child.stop({ graceMs: 2_000 }), child.wait(), drain])
        const failures = joined.flatMap((item, index) => item.status === "rejected" && index !== 2 ? [item.reason] : [])
        if (failures.length) throw new AggregateError(failures, "ARTIFACT_WINDOWS_NATIVE_COMPILER_JOIN_FAILED")
        if ((await child.processes()).length !== 0) throw new Error("ARTIFACT_WINDOWS_NATIVE_COMPILER_TREE_NOT_EMPTY")
        lifecycle.compilerJoined = true
        const after = Omni.snapshot()
        lifecycle.compiler = { spawns: after.spawns - before.spawns, delegations: after.delegations - before.delegations }
        if (lifecycle.compiler.spawns <= 0 || lifecycle.compiler.delegations !== 0)
          throw new Error("ARTIFACT_WINDOWS_NATIVE_COMPILER_OWNERSHIP_FAILED")
      }
    })()
    const compiler = lifecycle.compiler
    if (result.exitCode !== 0) throw new Error(`ARTIFACT_WINDOWS_NATIVE_BUILD_FAILED: ${Buffer.concat(streams.stderr.chunks).toString("utf8")}`)
    requireImage(await readFile(output), process.arch, true)
    const native: {
      pointer(buffer: Uint8Array): number
      invoke(id: number, ...args: (number | bigint | null)[]): number
    } = createRequire(import.meta.url)(output)
    lifecycle.mapped = true
    // A successfully mapped N-API DLL cannot be unlinked on Windows. The module
    // registry owns its private directory through process exit, including later
    // export/attestation failures; this is not an untracked build-temp leak.
    const owner = { directory, module: output, lifetime: "process" as const }
    mapped.add(owner)
    if (typeof native.pointer !== "function" || typeof native.invoke !== "function")
      throw new Error("ARTIFACT_WINDOWS_NATIVE_EXPORTS_MISSING")
    // A numeric address does not keep its backing Buffer alive across N-API calls.
    // Retain every argument buffer through the synchronous native invocation.
    const pending = new Set<Uint8Array>()
    const ptr = (buffer: Uint8Array) => {
      try {
        const address = native.pointer(buffer) as Pointer
        pending.add(buffer)
        return address
      } catch (error) {
        pending.clear()
        throw error
      }
    }
    const attest = (cpu = process.arch, processHandle?: bigint) => {
      try {
        const processMachine = Buffer.alloc(2)
        const nativeMachine = Buffer.alloc(2)
        const result = processHandle === undefined
          ? native.invoke(10, ptr(processMachine), ptr(nativeMachine))
          : native.invoke(12, processHandle, ptr(processMachine), ptr(nativeMachine))
        if (result !== 1)
          throw new Error("ARTIFACT_WINDOWS_NATIVE_CPU_QUERY_FAILED")
        const proof = { arch: cpu, processMachine: processMachine.readUInt16LE(), nativeMachine: nativeMachine.readUInt16LE(),
          moduleMachine: native.invoke(11), invalidHandleStatus: native.invoke(6, 0n) >>> 0 }
        requireMachine(cpu, proof.processMachine, proof.nativeMachine, proof.moduleMachine)
        if (proof.invalidHandleStatus !== 0xc0000008) throw new Error("ARTIFACT_WINDOWS_NATIVE_NTSTATUS_CONTROL_FAILED")
        return proof
      } finally { pending.clear() }
    }
    const attestation = attest()
    console.error(`ARTIFACT_WINDOWS_NATIVE_ABI ${JSON.stringify(attestation)}`)
    return { ptr, attest, attestation, ownership: owner, compiler, leases: () => ({ pendingBuffers: pending.size }),
      dlopen: (library: string, definitions: Record<string, unknown>) => {
        const lease = { closed: false }
        const call = (id: number, args: (number | bigint | null)[]) => {
          try {
            if (lease.closed) throw new Error("ARTIFACT_WINDOWS_NATIVE_LIBRARY_CLOSED")
            return native.invoke(id, ...args)
          } finally { pending.clear() }
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
        if (!Object.keys(definitions).length || Object.keys(definitions).some((name) => !allowed.includes(name))) {
          pending.clear()
          throw new Error("ARTIFACT_WINDOWS_NATIVE_SYMBOL_UNSUPPORTED")
        }
        // N-API module stays mapped; closing this lease forbids further calls.
        return { symbols, close: () => { lease.closed = true; pending.clear() } }
      },
    }
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("ARTIFACT_WINDOWS_NATIVE_BUILD_UNKNOWN_FAILURE", { cause })
    if (!lifecycle.mapped && lifecycle.compilerJoined) {
      await rm(directory, { recursive: true, force: true }).catch((cleanup: unknown) => {
        throw Object.assign(new AggregateError([error, cleanup], "ARTIFACT_WINDOWS_NATIVE_BUILD_CLEANUP_FAILED"), { lifecycle })
      })
      lifecycle.removed = true
    }
    throw Object.assign(error, { lifecycle })
  }
}
