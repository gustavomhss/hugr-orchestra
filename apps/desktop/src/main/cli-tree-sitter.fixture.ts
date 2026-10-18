import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { NATIVE_MACHINES, treeSitterBundle } from "@orchestra/script/tree-sitter-prebuilds"
import { cliTreeSitterTarget } from "./cli-artifacts"

/** Synthetic structural bundle only: valid CPU headers and ELF libc dependencies, never runnable parser code. */
export function writeTreeSitterBundle(dir: string, target: string) {
  const bundle = cliTreeSitterTarget(target)
  const machine = NATIVE_MACHINES[`${bundle.os}-${bundle.arch}`]!
  return Promise.all(
    treeSitterBundle(bundle).map(async (file) => {
      await mkdir(dirname(join(dir, file)), { recursive: true })
      await writeFile(join(dir, file), file.endsWith(".node") ? binding(bundle.os, machine, bundle.abi) : `${file} ${target}`)
    }),
  )
}

// ELF e_machine, Mach-O cputype or PE machine: what nativeMachines reads.
function binding(os: string, machine: number, abi?: string) {
  const bytes = Buffer.alloc(os === "linux" ? 512 : 128)
  if (os === "linux") {
    bytes.writeUInt32BE(0x7f454c46, 0)
    bytes[4] = 2
    bytes[5] = 1
    bytes[6] = 1
    bytes.writeUInt16LE(3, 16)
    bytes.writeUInt16LE(machine, 18)
    bytes.writeUInt32LE(1, 20)
    bytes.writeBigUInt64LE(64n, 32)
    bytes.writeUInt16LE(64, 52)
    bytes.writeUInt16LE(56, 54)
    bytes.writeUInt16LE(2, 56)
    // PT_LOAD maps the complete file; PT_DYNAMIC contains NEEDED/STRTAB/STRSZ/NULL.
    bytes.writeUInt32LE(1, 64)
    bytes.writeUInt32LE(4, 68)
    bytes.writeBigUInt64LE(512n, 96)
    bytes.writeBigUInt64LE(512n, 104)
    bytes.writeBigUInt64LE(4096n, 112)
    bytes.writeUInt32LE(2, 120)
    bytes.writeUInt32LE(4, 124)
    bytes.writeBigUInt64LE(176n, 128)
    bytes.writeBigUInt64LE(176n, 136)
    bytes.writeBigUInt64LE(64n, 152)
    bytes.writeBigUInt64LE(64n, 160)
    bytes.writeBigUInt64LE(8n, 168)
    const library = abi === "musl" ? `libc.musl-${machine === 62 ? "x86_64" : "aarch64"}.so.1` : "libc.so.6"
    const strings = Buffer.from(`${library}\0`)
    strings.copy(bytes, 352)
    ;[[1n, 0n], [5n, 352n], [10n, BigInt(strings.length)], [0n, 0n]].forEach(([tag, value], i) => {
      bytes.writeBigInt64LE(tag!, 176 + i * 16)
      bytes.writeBigUInt64LE(value!, 184 + i * 16)
    })
  }
  if (os === "darwin") {
    bytes.writeUInt32LE(0xfeedfacf, 0)
    bytes.writeUInt32LE(machine, 4)
  }
  if (os === "win32") {
    bytes.write("MZ", 0)
    bytes.writeUInt32LE(64, 0x3c)
    bytes.writeUInt32BE(0x50450000, 64)
    bytes.writeUInt16LE(machine, 68)
  }
  return bytes
}
