export * as BackendToolkitTarget from "./target"

import { spawnSync } from "child_process"
import { existsSync } from "fs"

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
  if (target) return { target }
  return { unsupported: `platform-${host.platform}-${host.arch}` }
}

function current(): Host {
  return {
    platform: process.platform,
    arch: process.arch,
    musl: process.platform === "linux" && (existsSync("/etc/alpine-release") || lddIsMusl()),
    rosetta:
      process.platform === "darwin" &&
      process.arch === "x64" &&
      spawnSync("sysctl", ["-in", "sysctl.proc_translated"], { encoding: "utf8" }).stdout?.trim() === "1",
  }
}

function lddIsMusl() {
  // glibc's ldd prints its version on stdout; musl's prints its banner on stderr and exits non-zero.
  const result = spawnSync("ldd", ["--version"], { encoding: "utf8" })
  return /musl/i.test(`${result.stdout ?? ""}${result.stderr ?? ""}`)
}
