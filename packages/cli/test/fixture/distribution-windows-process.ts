import { realpath } from "node:fs/promises"
import { Schema } from "effect"
import { WindowsProcessQuery } from "../../../core/test/fixture/windows-process-query"
import { WindowsInventory } from "../../../omni/campaign/windows-inventory"

const Identity = Schema.Struct({
  pid: Schema.Int.check(Schema.isGreaterThan(0)),
  startTime: Schema.String.check(Schema.isPattern(/^\d+$/)),
  executable: Schema.String.check(Schema.isMinLength(1)),
})
export type WindowsIdentity = typeof Identity.Type

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
      new URL("../../../omni/campaign/windows-inventory.ts", import.meta.url).href, [process.pid, pid], 15_000,
      `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); ${query}`),
  )
  const host = rows.find((row) => row.pid === process.pid)
  if (!host || host.executable.toLowerCase() !== (await realpath(process.execPath)).toLowerCase())
    throw new Error("WINDOWS_IDENTITY_LIVE_HOST_CONTROL_FAILED")
  if (new Set(rows.map((row) => row.pid)).size !== rows.length || rows.some((row) => ![process.pid, pid].includes(row.pid)))
    throw new Error("WINDOWS_IDENTITY_REPLY_INVALID")
  return rows.find((row) => row.pid === pid)
}

export async function assertWindowsPE(file: string, dll: boolean) {
  const bytes = Buffer.from(await Bun.file(file).arrayBuffer())
  if (bytes.length < 64 || bytes.readUInt16LE(0) !== 0x5a4d) throw new Error(`WINDOWS_PE_MISSING: ${file}`)
  const offset = bytes.readUInt32LE(60)
  if (offset < 64 || offset > 1_048_576 || offset + 26 > bytes.length ||
      bytes.readUInt32LE(offset) !== 0x4550 || bytes.readUInt16LE(offset + 4) !== 0x8664 ||
      bytes.readUInt16LE(offset + 24) !== 0x20b || !(bytes.readUInt16LE(offset + 22) & 2) ||
      Boolean(bytes.readUInt16LE(offset + 22) & 0x2000) !== dll)
    throw new Error(`WINDOWS_PE_X64_FLAGS_INVALID: ${file}`)
}
