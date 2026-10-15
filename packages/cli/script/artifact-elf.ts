import { open } from "node:fs/promises"
import { basename } from "node:path"

// /proc/self/exe pins the running image even if its on-disk pathname is replaced.
// Loader presence elsewhere in /lib says nothing about the process's libc/TCB.
export async function artifactLinuxRuntime() {
  const handle = await open("/proc/self/exe", "r")
  return handle
    .stat()
    .then(async (stat) => {
      const header = Buffer.alloc(64)
      if (
        (await handle.read(header, 0, 64, 0)).bytesRead !== 64 ||
        header.subarray(0, 6).toString("hex") !== "7f454c460201" ||
        header.readUInt16LE(54) !== 56 ||
        header.readUInt16LE(18) !== (process.arch === "x64" ? 62 : process.arch === "arm64" ? 183 : 0)
      )
        throw new Error("Unsupported artifact Linux runtime ELF ABI")
      const offset = header.readBigUInt64LE(32)
      const count = header.readUInt16LE(56)
      if (!count || offset > BigInt(stat.size) || offset + BigInt(count * 56) > BigInt(stat.size))
        throw new Error("Invalid artifact Linux runtime program headers")
      const headers = Buffer.alloc(count * 56)
      if ((await handle.read(headers, 0, headers.length, Number(offset))).bytesRead !== headers.length)
        throw new Error("Incomplete artifact Linux runtime program headers")
      const index = Array.from({ length: count }, (_, index) => index * 56).find(
        (index) => headers.readUInt32LE(index) === 3,
      )
      if (index === undefined) throw new Error("Unsupported artifact Linux runtime: PT_INTERP missing")
      const start = headers.readBigUInt64LE(index + 8)
      const length = headers.readBigUInt64LE(index + 32)
      if (length < 2n || length > 4096n || start + length > BigInt(stat.size))
        throw new Error("Invalid artifact Linux runtime interpreter")
      const buffer = Buffer.alloc(Number(length))
      if (
        (await handle.read(buffer, 0, buffer.length, Number(start))).bytesRead !== buffer.length ||
        buffer.indexOf(0) !== buffer.length - 1
      )
        throw new Error("Incomplete artifact Linux runtime interpreter")
      const interpreter = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, -1))
      const name = basename(interpreter)
      if (name === `ld-musl-${process.arch === "arm64" ? "aarch64" : "x86_64"}.so.1`)
        return { kind: "musl" as const, interpreter, library: interpreter }
      if (name === (process.arch === "arm64" ? "ld-linux-aarch64.so.1" : "ld-linux-x86-64.so.2"))
        return { kind: "glibc" as const, interpreter, library: "libc.so.6" }
      throw new Error(`Unsupported artifact Linux runtime interpreter: ${interpreter}`)
    })
    .finally(() => handle.close())
}
