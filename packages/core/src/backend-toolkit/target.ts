export * as BackendToolkitTarget from "./target"

import { spawnSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import { release } from "os"

/** The closed first-qualification target set, in npm `os`/`cpu` spelling. */
export type TargetId = "darwin-arm64" | "darwin-x64" | "linux-arm64" | "linux-x64" | "win32-x64"

export const TARGETS: ReadonlyArray<TargetId> = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"]

export type Host = {
  readonly platform: string
  readonly arch: string
  /** The Linux libc is musl rather than glibc. */
  readonly musl: boolean
  /** An x64 process translated by Rosetta on an Apple silicon Mac. */
  readonly rosetta: boolean
  /** The CPU reports AVX2. Only read on x64, where the toolkit claims AVX2 as its floor (F5.1). */
  readonly avx2: boolean
  /** `os.release()`: the Darwin kernel on macOS, the NT version on Windows. */
  readonly kernel: string
  /** The glibc version, e.g. `2.35`; absent when it could not be read, in which case no glibc floor is applied. */
  readonly glibc?: string
}

/**
 * The toolkit target for a host: an exact match or the reason there is none. Unlike the host installers it never
 * falls back to a payload built for another target, so a musl or Windows-on-ARM host is unsupported.
 */
export function detect(host: Host = current()): { readonly target: TargetId } | { readonly unsupported: string } {
  if (host.platform === "linux" && host.musl) return { unsupported: "libc-musl" }
  if (host.platform === "win32" && host.arch === "arm64") return { unsupported: "cpu-arm64-windows" }
  if (host.platform === "darwin" && host.arch === "x64" && host.rosetta) return { target: "darwin-arm64" }
  const target = TARGETS.find((id) => id === `${host.platform}-${host.arch}`)
  if (!target) return { unsupported: `platform-${host.platform}-${host.arch}` }
  const below = floor(host)
  return below ? { unsupported: below } : { target }
}

/**
 * Why a host on a supported target is still below the toolkit's floor. The OS minimums are Node 22's (glibc 2.28,
 * macOS 11 = Darwin 20, Windows 10), the runtime every hosted engine shares. They are lower bounds, not the
 * whole-closure maximum F5.4 requires: that audit and its owner acceptance (F5-D1) are open, so a higher floor must be
 * measured and added here rather than assumed.
 */
function floor(host: Host) {
  if (host.arch === "x64" && !host.avx2) return "cpu-baseline"
  const kernel = Number.parseInt(host.kernel, 10)
  if (host.platform === "darwin" && kernel < 20) return "macos-below-11"
  if (host.platform === "win32" && kernel < 10) return "windows-below-10"
  // Compared as major then minor: "2.9" is older than "2.28". An unreadable glibc applies no floor.
  const [major = 0, minor = 0] = host.glibc?.split(".").map(Number) ?? [Infinity]
  if (host.platform === "linux" && (major < 2 || (major === 2 && minor < 28))) return "glibc-below-2.28"
}

// Probing spawns processes (ldd, sysctl), so the host is described once per process.
let probed: Host | undefined

function current(): Host {
  if (probed) return probed
  const ldd = process.platform === "linux" ? lddOutput() : ""
  const rosetta =
    process.platform === "darwin" &&
    process.arch === "x64" &&
    spawnSync("sysctl", ["-in", "sysctl.proc_translated"], { encoding: "utf8" }).stdout?.trim() === "1"
  probed = {
    platform: process.platform,
    arch: process.arch,
    musl: process.platform === "linux" && (existsSync("/etc/alpine-release") || /musl/i.test(ldd)),
    rosetta,
    // A Rosetta process is mapped to the arm64 target, so the translated CPU's features never matter.
    avx2: process.arch === "x64" && !rosetta && hasAvx2(),
    kernel: release(),
    // glibc's `ldd --version` ends its first line with the version, e.g. `ldd (Ubuntu GLIBC 2.35-0ubuntu3.8) 2.35`.
    glibc: /\s(\d+\.\d+)\s*$/.exec(ldd.split("\n")[0] ?? "")?.[1],
  }
  return probed
}

function lddOutput() {
  // glibc's ldd prints its version on stdout; musl's prints its banner on stderr and exits non-zero.
  const result = spawnSync("ldd", ["--version"], { encoding: "utf8" })
  return `${result.stdout ?? ""}${result.stderr ?? ""}`
}

// Mirrors the host installer's probes (`install`, `packages/orchestra/bin/orchestra`): an unreadable probe is "no AVX2".
function hasAvx2() {
  if (process.platform === "linux") {
    return existsSync("/proc/cpuinfo") && /(^|\s)avx2(\s|$)/i.test(readFileSync("/proc/cpuinfo", "utf8"))
  }
  if (process.platform === "darwin")
    return spawnSync("sysctl", ["-n", "hw.optional.avx2_0"], { encoding: "utf8", timeout: 1500 }).stdout?.trim() === "1"
  if (process.platform === "win32") {
    // bun:ffi exists only under Bun. Anywhere else there is no cheap probe, so the floor is skipped rather than guessed.
    if (!process.versions.bun) return true
    // The installer asks PowerShell, whose Add-Type compile can outlast any sane timeout on a cold machine; the same
    // kernel32 call through FFI is immediate. 40 is PF_AVX2_INSTRUCTIONS_AVAILABLE.
    const ffi: typeof import("bun:ffi") = require("bun:ffi")
    const kernel32 = ffi.dlopen("kernel32.dll", { IsProcessorFeaturePresent: { args: [ffi.FFIType.u32], returns: ffi.FFIType.bool } })
    return kernel32.symbols.IsProcessorFeaturePresent(40)
  }
  return false
}
