// Process identities and rows, and the pure decoding of a Unix `ps` table (re-exported by lib.ts).

import { readFileSync } from "node:fs"

export type Identity = { pid: number; startTime: string }
export type Row = Identity & { parent: number; args: string | null; state: string; session?: number }

/** Exact ps decoding boundary; Linux cross-checks start time and argv through the same /proc identity. */
export function decodeUnixTable(stdout: string, queryPID: number): Row[] {
  const rows = stdout.split("\n")
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.*)$/)
      if (!match) throw new Error(`malformed ps row: ${line}`)
      const pid = Number(match[1])
      // macOS ps runs in UTC/C; preserve that clock in the identity, never reinterpret local lstart.
      if (process.platform !== "linux") return [{ pid, parent: Number(match[2]), state: match[3]!, startTime: `UTC:${match[4]!}`, args: match[5]! }]
      const observed = (() => {
        try {
          const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
          const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ").trim()
          const checked = readFileSync(`/proc/${pid}/stat`, "utf8")
          const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
          const now = checked.slice(checked.lastIndexOf(")") + 2).split(" ")
          if (fields[19] !== now[19]) throw new Error(`PID ${pid} changed identity during /proc query`)
          return { fields: now, args: args || null }
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined // It exited after the ps snapshot.
          throw error
        }
      })()
      if (observed === undefined) return []
      if (!/^\d+$/.test(observed.fields[19]!)) throw new Error(`malformed /proc/${pid}/stat start time`)
      return [{ pid, parent: Number(observed.fields[1]), state: observed.fields[0]!, startTime: observed.fields[19]!, args: observed.args }]
    })
    .filter((row) => row.pid !== queryPID)
  if (!rows.some((row) => row.pid === process.pid)) throw new Error("ps returned an incomplete or malformed process table (querying host missing)")
  return rows
}

export function matches(row: Identity, pinned: Identity) {
  return row.pid === pinned.pid && row.startTime === pinned.startTime
}

export function hasNonce(args: string | null, nonce: string) {
  return args !== null && new RegExp(`(?:^|[\\s"'])${nonce.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s"'])`).test(args)
}

export function birth(row: Identity) {
  if (typeof row.startTime === "string" && /^\d+$/.test(row.startTime)) return BigInt(row.startTime)
  const match = typeof row.startTime === "string" && row.startTime.match(/^UTC:(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/)
  const date = new Date(match ? Date.parse(row.startTime.slice(4) + " GMT") : NaN)
  if (!match || !Number.isFinite(date.getTime()) || date.getUTCFullYear() !== Number(match[7]) || date.getUTCMonth() !== ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(match[2]!) || date.getUTCDate() !== Number(match[3]) || date.getUTCHours() !== Number(match[4]) || date.getUTCMinutes() !== Number(match[5]) || date.getUTCSeconds() !== Number(match[6]) || date.getUTCDay() !== ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(match[1]!))
    throw new Error(`campaign birth time unavailable/unparseable for PID ${row.pid}: ${row.startTime}`)
  return BigInt(date.getTime())
}
