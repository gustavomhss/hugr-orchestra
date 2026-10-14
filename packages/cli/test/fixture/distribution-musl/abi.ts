import { expect } from "bun:test"
import { chmod, lstat, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { inspectElf, NATIVE_MACHINES, requireElfLibc } from "@orchestra/script/tree-sitter-prebuilds"
import { assertVersion, command, nativeLibc, sha256, successful } from "../distribution-native"
import type { Sandbox } from "../distribution-native"

export async function muslPayloadAbi(payload: string, version: string, box: Sandbox, negative = false) {
  if (nativeLibc?.kind !== "musl") throw new Error("MUSL_PAYLOAD_ABI_NATIVE_HOST_REQUIRED")
  const executable = join(payload, "bin/orchestra")
  const elf = inspectElf(executable)
  expect(elf.machine).toBe(NATIVE_MACHINES[`linux-${process.arch}`])
  expect(elf.interpreter).toBe(nativeLibc.interpreter)
  expect(elf.needed).not.toContain("libc.so.6")
  const bindings = [join(payload, "bin/hugr_omni.node"), ...["tree-sitter", "tree-sitter-python", "tree-sitter-typescript"].map((name) =>
    join(payload, "bin/tree-sitter", name, "prebuilds", `linux-${process.arch}`, `${name}.node`))]
  bindings.forEach((file) => expect(requireElfLibc(file, "musl").machine).toBe(elf.machine))
  const supervisor = inspectElf(join(payload, "bin/hugr-omni-supervisor"))
  expect(supervisor.machine).toBe(elf.machine)
  expect(supervisor.interpreter).toBeUndefined()
  expect(supervisor.needed).toEqual([])
  // Fresh Bun process dlopens exact installed files. Maps prove actual loaded
  // libc plus each binding inode; CPU/dependency declarations alone are not load.
  const script = `
import { linuxRuntimeLibc } from ${JSON.stringify(resolve(import.meta.dirname, "../../../../script/src/tree-sitter-prebuilds.ts"))}
import { readFileSync, realpathSync, statSync } from "node:fs"
const files = ${JSON.stringify(bindings)}
for (const file of files) require(file)
const maps = readFileSync("/proc/self/maps", "utf8").trim().split("\\n")
for (const file of files) {
  const canonical = realpathSync(file)
  const stat = statSync(canonical, { bigint: true })
  if (!maps.some((line) => {
    const fields = /^(\\S+)\\s+([rwxps-]{4})\\s+\\S+\\s+([0-9a-f]+):([0-9a-f]+)\\s+(\\d+)\\s+(.*)$/.exec(line)
    return fields && fields[6] === canonical && fields[2].includes("x") && BigInt(fields[5]) === stat.ino &&
      BigInt(parseInt(fields[3], 16)) === ((stat.dev >> 8n & 0xfffn) | (stat.dev >> 32n & 0xfffff000n)) &&
      BigInt(parseInt(fields[4], 16)) === ((stat.dev & 0xffn) | (stat.dev >> 12n & 0xffffff00n))
  })) throw new Error("MUSL_INSTALLED_BINDING_NOT_MAPPED: " + file)
}
const libc = linuxRuntimeLibc()
if (libc.kind !== "musl") throw new Error("MUSL_INSTALLED_BINDING_LOADER_MISMATCH")
console.log(JSON.stringify({ libc, files }))`
  const loaded = JSON.parse(await successful([process.execPath, "--eval", script], box, 30_000))
  expect(loaded.libc).toEqual(nativeLibc)
  expect(loaded.files).toEqual(bindings)
  await assertVersion(executable, version, box)
  if (!negative) return { executable: sha256(await readFile(executable)), elf, loaded, supervisor }
  const controls = [
    { installed: bindings[0], foreign: "/proof/controls/glibc-addon.node", kind: "addon" },
    ...bindings.slice(1).map((installed) => ({ installed, foreign: "/proof/controls/glibc-python.node", kind: "parser" })),
  ]
  for (const control of controls) {
    const original = await readFile(control.installed)
    const mode = (await lstat(control.installed)).mode & 0o777
    const foreign = await readFile(control.foreign)
    expect(requireElfLibc(control.foreign, "glibc").machine).toBe(elf.machine)
    expect(() => requireElfLibc(control.foreign, "musl")).toThrow("ELF_LIBC_MISMATCH")
    try {
      await writeFile(control.installed, foreign)
      expect(sha256(await readFile(control.installed))).toBe(sha256(foreign))
      expect(() => requireElfLibc(control.installed, "musl")).toThrow("ELF_LIBC_MISMATCH")
      if (control.kind === "addon") {
        const refused = await command([executable, "--version"], box, 15_000)
        expect(refused.code).not.toBe(0)
        expect(refused.stderr).toContain("hugr-omni CLI preflight failed:")
      }
      if (control.kind === "parser") {
        for (const sample of ["sample.py", "sample.ts"]) {
          const refused = JSON.parse(await successful([executable, "debug", "symbols", join(box.cwd, sample)], box))
          expect(refused).toMatchObject({ symbols: [], imports: [], coverage: { complete: false, reason: "parser-unavailable" } })
          expect(refused.coverage.detail).toContain(`ELF_LIBC_MISMATCH: ${control.installed}`)
        }
      }
    } finally { await writeFile(control.installed, original); await chmod(control.installed, mode) }
    expect(sha256(await readFile(control.installed))).toBe(sha256(original))
    await assertVersion(executable, version, box)
  }
  const parser = JSON.parse(await successful([executable, "debug", "symbols", join(box.cwd, "sample.py")], box))
  expect(parser.coverage).toMatchObject({ complete: true })
  expect(parser.symbols.map((symbol: { name: string }) => symbol.name)).toEqual(["join"])
  return { executable: sha256(await readFile(executable)), elf, loaded, supervisor,
    controls: controls.map((control) => ({ kind: control.kind, path: control.foreign })) }
}
