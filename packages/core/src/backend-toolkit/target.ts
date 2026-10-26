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
 * macOS 11 = Darwin 20, Windows 10), the runtime every hosted engine shares. They are lower bounds: the measured
 * floor of each pinned engine and runtime (F5.4) is recorded on its pack and checked per engine by `below`.
 */
function floor(host: Host) {
  if (host.arch === "x64" && !host.avx2) return "cpu-baseline"
  const kernel = Number.parseInt(host.kernel, 10)
  if (host.platform === "darwin" && kernel < 20) return "macos-below-11"
  if (host.platform === "win32" && kernel < 10) return "windows-below-10"
  // An unreadable glibc applies no floor.
  if (host.platform === "linux" && host.glibc && compareVersions(host.glibc, "2.28") < 0) return "glibc-below-2.28"
}

/** The minimum host an engine or runtime needs on one target, measured with `script/toolkit-floors.ts`. */
export type Floor = {
  /** Highest glibc symbol version the binaries import, e.g. `2.34`. */
  readonly glibc?: string
  /** Lowest macOS the binaries declare, e.g. `12.0`; only the major is compared (macOS 11-15 is Darwin N + 9, macOS 26 is Darwin 25). */
  readonly macos?: string
  /** Lowest Windows build the binaries import APIs from, e.g. `10.0.17763`. */
  readonly windows?: string
}

/** Numeric dotted-version order: `2.9` is older than `2.28`. */
export function compareVersions(a: string, b: string) {
  const left = a.split(".").map(Number)
  const right = b.split(".").map(Number)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference) return difference
  }
  return 0
}

/**
 * Why a host is below a measured floor, as `glibc-below-2.34`, `macos-below-12` or `windows-below-10.0.17763`. A host
 * on another platform than the target (a cross-target prefetch) and an unreadable glibc apply no floor.
 */
export function below(host: Host, target: TargetId, floor: Floor | undefined) {
  if (!floor || !target.startsWith(host.platform)) return
  if (host.platform === "linux" && floor.glibc && host.glibc && compareVersions(host.glibc, floor.glibc) < 0)
    return `glibc-below-${floor.glibc}`
  const major = Number.parseInt(floor.macos ?? "", 10)
  if (host.platform === "darwin" && major >= 11 && Number.parseInt(host.kernel, 10) < (major >= 26 ? major - 1 : major + 9)) return `macos-below-${major}`
  if (host.platform === "win32" && floor.windows && compareVersions(host.kernel, floor.windows) < 0)
    return `windows-below-${floor.windows}`
}

// Probing spawns processes (ldd, sysctl), so the host is described once per process.
let probed: Host | undefined

export function current(): Host {
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

// Mirrors the host installer's probes (`apps/cli/distribution/install.sh`): an unreadable probe is "no AVX2".
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
