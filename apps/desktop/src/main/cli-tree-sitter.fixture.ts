import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { NATIVE_MACHINES, treeSitterBundle } from "@orchestra/script/tree-sitter-prebuilds"
import { cliTreeSitterTarget } from "./cli-artifacts"

/** Writes a CLI target's tree-sitter bundle into `dir`: text files, and bindings that carry only the CPU header. */
export function writeTreeSitterBundle(dir: string, target: string) {
  const bundle = cliTreeSitterTarget(target)
  const machine = NATIVE_MACHINES[`${bundle.os}-${bundle.arch}`]!
  return Promise.all(
    treeSitterBundle(bundle).map(async (file) => {
      await mkdir(dirname(join(dir, file)), { recursive: true })
      await writeFile(join(dir, file), file.endsWith(".node") ? binding(bundle.os, machine) : `${file} ${target}`)
    }),
  )
}

// ELF e_machine, Mach-O cputype or PE machine: what nativeMachines reads.
function binding(os: string, machine: number) {
  const bytes = Buffer.alloc(128)
  if (os === "linux") {
    bytes.writeUInt32BE(0x7f454c46, 0)
    bytes[4] = 2
    bytes[5] = 1
    bytes.writeUInt16LE(machine, 18)
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
