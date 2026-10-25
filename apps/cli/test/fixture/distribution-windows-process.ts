import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { open, realpath, type FileHandle } from "node:fs/promises"
import { finished } from "node:stream/promises"
import { Schema } from "effect"
import { WindowsProcessQuery } from "@orchestra/core/test/fixture/windows-process-query"
import { WindowsInventory } from "../../../../native/omni/campaign/windows-inventory"

const Identity = Schema.Struct({
  pid: Schema.Int.check(Schema.isGreaterThan(0)),
  startTime: Schema.String.check(Schema.isPattern(/^\d+$/)),
  executable: Schema.String.check(Schema.isMinLength(1)),
})
export type WindowsIdentity = typeof Identity.Type

// nodeExecutable resolves a candidate; only a fresh real Node process can prove
// its CPU. An x64 Node under ARM64 emulation must not qualify the native lane.
export async function nativeNodeCPU() {
  const output = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({
    arch: Schema.String, executable: Schema.String, version: Schema.String,
  }))))(await WindowsProcessQuery.invoke(`
if (process.versions.bun || process.release.name !== 'node' || process.platform !== 'win32')
  throw Error('WINDOWS_NATIVE_NODE_RUNTIME_INVALID');
console.log(JSON.stringify({arch:process.arch,executable:process.execPath,version:process.versions.node}));
`, "", { nonce: "native-node-cpu" }, 15_000))
  if (!["x64", "arm64"].includes(process.arch) || output.arch !== process.arch)
    throw new Error(`WINDOWS_NATIVE_NODE_CPU_MISMATCH: expected=${process.arch} observed=${output.arch}`)
  if ((await realpath(output.executable)).toLowerCase() !== (await realpath(WindowsProcessQuery.nodeExecutable())).toLowerCase())
    throw new Error("WINDOWS_NATIVE_NODE_EXECUTABLE_MISMATCH")
  await assertWindowsPE(output.executable, false)
  console.error(`NATIVE_WINDOWS_NODE_CPU ${JSON.stringify(output)}`)
  return output.arch
}

// Existing native-Node broker owns query admission, deadline, OS and pipe close.
// Existing CIM decoder decides inventory completeness and exact FileTime strings.
// Add ExecutablePath to its closed projection; never duplicate identity decoding.
const READER = `
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
const settings = JSON.parse(readFileSync(import.meta.filename + '.config', 'utf8'));
const source = readFileSync(fileURLToPath(settings.decoder), 'utf8');
const projection = 'export * as WindowsInventory from "./windows-inventory"';
if (!source.includes(projection)) throw Error('WINDOWS_INVENTORY_PROJECTION_MISSING');
const javascript = stripTypeScriptTypes(source.replace(projection, ''), {mode:'strip'});
const inventory = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
const requested = JSON.parse(process.argv[2]);
if (!Array.isArray(requested) || requested.length !== 2 || requested.some(pid => !Number.isSafeInteger(pid) || pid <= 0))
  throw Error('WINDOWS_IDENTITY_REQUEST_INVALID');
while (!existsSync(import.meta.filename + '.result')) await new Promise(resolve=>setTimeout(resolve,10));
const output = JSON.parse(readFileSync(import.meta.filename + '.result','utf8'));
if (output.closed !== true || output.error || output.code !== 0 || output.signal) throw Error('WINDOWS_QUERY_FAILED');
const raw = JSON.parse(output.stdout);
const rows = inventory.decode(raw,output.pid);
const identities = rows.filter(row => requested.includes(row.pid)).map(row => {
  const record = raw.find(value => value.ProcessId === row.pid);
  if (typeof record?.ExecutablePath !== 'string' || !record.ExecutablePath) throw Error('WINDOWS_EXECUTABLE_UNKNOWN: '+row.pid);
  return {pid:row.pid,startTime:row.startTime,executable:realpathSync(record.ExecutablePath)};
});
console.log(JSON.stringify(identities));
`

export async function windowsIdentity(pid: number): Promise<WindowsIdentity | undefined> {
  if (process.platform !== "win32" || !Number.isSafeInteger(pid) || pid <= 0)
    throw new Error("WINDOWS_IDENTITY_NATIVE_HOST_AND_PID_REQUIRED")
  const column = "Select-Object ProcessId,"
  if (!WindowsInventory.CIM.includes(column)) throw new Error("WINDOWS_CIM_PROJECTION_MISSING")
  // Wait for the reader's admission before census: authoritative decode also
  // requires the native reader itself in the complete process table.
  const query = WindowsInventory.CIM.replace(column, "Select-Object ExecutablePath,ProcessId,")
  const rows = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Array(Identity))))(
    await WindowsProcessQuery.invoke(READER,
      new URL("../../../../native/omni/campaign/windows-inventory.ts", import.meta.url).href, [process.pid, pid], 15_000,
      `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); ${query}`),
  )
  const host = rows.find((row) => row.pid === process.pid)
  if (!host || host.executable.toLowerCase() !== (await realpath(process.execPath)).toLowerCase())
    throw new Error("WINDOWS_IDENTITY_LIVE_HOST_CONTROL_FAILED")
  if (new Set(rows.map((row) => row.pid)).size !== rows.length || rows.some((row) => ![process.pid, pid].includes(row.pid)))
    throw new Error("WINDOWS_IDENTITY_REPLY_INVALID")
  return rows.find((row) => row.pid === pid)
}

// Do not race uncancellable positional filesystem operations and abandon their
// handles. Deadlines refuse new work and are checked again after each I/O joins.
// Streams additionally receive the signal so a full-file hash can be aborted.
export type WindowsPEDeadline = { signal: AbortSignal; deadline: number }

export function windowsPEIO(timeoutMs: number, parent?: WindowsPEDeadline) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("WINDOWS_PE_IO_BUDGET_INVALID")
  const now = performance.now()
  const deadline = Math.min(now + timeoutMs, parent?.deadline ?? Infinity)
  const timer = AbortSignal.timeout(Math.max(0, Math.ceil(deadline - now)))
  const signal = parent ? AbortSignal.any([parent.signal, timer]) : timer
  const check = (operation: string) => {
    if (signal.aborted || performance.now() >= deadline)
      throw new Error(`WINDOWS_PE_IO_DEADLINE_EXPIRED: ${operation}`, { cause: signal.reason })
  }
  return { signal, deadline, check, run: async <T>(operation: string, work: () => Promise<T>) => {
    check(operation)
    try { return await work() }
    finally { check(operation) }
  } }
}

export async function assertWindowsPE(file: string, dll: boolean, parent?: WindowsPEDeadline) {
  if (process.platform !== "win32" || !["x64", "arm64"].includes(process.arch))
    throw new Error("WINDOWS_PE_NATIVE_HOST_REQUIRED")
  const budget = windowsPEIO(15_000, parent)
  const io = { imageBytes: 0, bytesRead: 0, readCalls: 0 }
  const invalid = `WINDOWS_PE_${process.arch.toUpperCase()}_FLAGS_INVALID: ${file}`
  try {
    return await budget.run(`admit ${file}`, async () => {
      const handle = await open(file, "r")
      try {
        budget.check(`open ${file}`)
        const info = await handle.stat()
        budget.check(`stat ${file}`)
        io.imageBytes = info.size
        const read = async (position: number, length: number, error: string) => {
          const bytes = Buffer.alloc(length)
          const cursor = { offset: 0 }
          while (cursor.offset < length) {
            budget.check(`read ${file}`)
            const result = await handle.read(bytes, cursor.offset, length - cursor.offset, position + cursor.offset)
            io.readCalls++
            io.bytesRead += result.bytesRead
            budget.check(`read ${file}`)
            if (!result.bytesRead) throw new Error(error)
            cursor.offset += result.bytesRead
          }
          return bytes
        }
        if (!info.isFile() || info.size < 64) throw new Error(`WINDOWS_PE_MISSING: ${file}`)
        const dos = await read(0, 64, `WINDOWS_PE_MISSING: ${file}`)
        if (dos.readUInt16LE(0) !== 0x5a4d) throw new Error(`WINDOWS_PE_MISSING: ${file}`)
        const offset = dos.readUInt32LE(60)
        if (offset < 64 || offset > 1_048_576 || offset + 24 > info.size) throw new Error(invalid)
        const coff = await read(offset, 24, invalid)
        const length = coff.readUInt16LE(20)
        if (coff.readUInt32LE(0) !== 0x4550 || coff.readUInt16LE(4) !== (process.arch === "arm64" ? 0xaa64 : 0x8664) ||
            length < 112 || offset + 24 + length > info.size || !(coff.readUInt16LE(22) & 2) ||
            Boolean(coff.readUInt16LE(22) & 0x2000) !== dll) throw new Error(invalid)
        // SizeOfOptionalHeader is uint16: at most 64 + 24 + 65535 bytes
        // are read, independently of the full compiled executable's size.
        const optional = await read(offset + 24, length, invalid)
        if (optional.readUInt16LE(0) !== 0x20b) throw new Error(invalid)
        return { offset, coff, optional, mode: info.mode & 0o777, io }
      } finally { await handle.close() }
    })
  } catch (error) {
    if (error instanceof Error) throw Object.assign(error, { peIO: io })
    throw error
  }
}

export async function windowsPEField(handle: FileHandle, position: number, value: number, parent?: WindowsPEDeadline) {
  const budget = windowsPEIO(15_000, parent)
  return budget.run(`patch PE field at ${position}`, async () => {
    const bytes = Buffer.alloc(2)
    bytes.writeUInt16LE(value)
    const io = { bytesWritten: 0, bytesRead: 0 }
    while (io.bytesWritten < bytes.length) {
      budget.check("write PE field")
      const result = await handle.write(bytes, io.bytesWritten, bytes.length - io.bytesWritten, position + io.bytesWritten)
      io.bytesWritten += result.bytesWritten
      budget.check("write PE field")
      if (!result.bytesWritten) throw new Error("WINDOWS_PE_FIELD_WRITE_NO_PROGRESS")
    }
    const observed = Buffer.alloc(2)
    while (io.bytesRead < observed.length) {
      budget.check("read back PE field")
      const result = await handle.read(observed, io.bytesRead, observed.length - io.bytesRead, position + io.bytesRead)
      io.bytesRead += result.bytesRead
      budget.check("read back PE field")
      if (!result.bytesRead) throw new Error("WINDOWS_PE_FIELD_READ_SHORT")
    }
    if (!observed.equals(bytes)) throw new Error("WINDOWS_PE_FIELD_READBACK_MISMATCH")
    return io
  })
}

export async function windowsFileSHA256(file: string, parent?: WindowsPEDeadline) {
  const budget = windowsPEIO(30_000, parent)
  return budget.run(`hash ${file}`, async () => {
    const hash = createHash("sha256")
    const io = { bytesRead: 0 }
    const stream = createReadStream(file, { highWaterMark: 1024 * 1024, signal: budget.signal })
    try {
      for await (const chunk of stream) {
        budget.check(`hash ${file}`)
        hash.update(chunk)
        io.bytesRead += chunk.length
      }
      return { sha256: hash.digest("hex"), bytesRead: io.bytesRead }
    } finally {
      stream.destroy()
      await finished(stream, { cleanup: true }).catch((error: unknown) => {
        if (!budget.signal.aborted) throw error
      })
    }
  })
}
