// PID+birth and nonce oracles shared with campaign; Electron roots retained separately.
import type { ChildProcess } from "node:child_process"
import { identity, inventoryScope, kill9, matches, members, sleep, table, until, win, type Identity } from "../../../omni/campaign/lib"
import { WindowsInventory } from "../../../omni/campaign/windows-inventory"

export function owned(rows: ReturnType<typeof table>, roots: Identity[]) {
  if (!roots.length) throw new Error("Electron inventory requires explicit captured owner roots")
  return inventoryScope(rows, roots).filter((row) => row.pid !== process.pid)
}

export async function observe(started: number, boundMs: number, nonces: string[], retained: Identity[]) {
  const samples: { atMs: number; counts: number[]; retained: Identity[] }[] = []
  const deadline = started + boundMs
  while (Date.now() < deadline - 2100) {
    const rows = table(2000)
    const found = nonces.map((nonce) => members(nonce, rows))
    const atMs = Date.now() - started
    if (atMs >= boundMs) throw new Error(`desktop observation missed ${boundMs} ms deadline`)
    samples.push({ atMs, counts: found.map((fixture) => fixture.members.length + fixture.wrappers.length),
      retained: retained.filter((id) => rows.some((row) => matches(row, id) && !row.state.startsWith("Z"))) })
    await sleep(150)
  }
  if (!samples.length) throw new Error("desktop deadline produced empty snapshots")
  await sleep(Math.max(0, deadline - Date.now()))
  const last = samples.at(-1)!
  return { samples, last, zeroAtMs: samples.find((sample) => sample.counts.every((count) => count === 0) && sample.retained.length === 0)?.atMs,
    pass: last.counts.every((count) => count === 0) && last.retained.length === 0 }
}

/** Only after assertions. Retained handle closes even if inventory fails; cleanup failure stays red. */
export async function emergency(app: ChildProcess, roots: Identity[], retained: Identity[], nonces: string[]) {
  const errors: string[] = []
  try {
    const rows = table()
    const targets = [...owned(rows, [...roots, ...retained]), ...nonces.flatMap((nonce) => {
      const found = members(nonce, rows)
      return [...found.members, ...found.wrappers]
    })]
    const ids = [...new Map(targets.map((row) => [`${row.pid}:${row.startTime}`, identity(row.pid, rows)])).values()]
    if (win && ids.length) {
      const result = WindowsInventory.query(`$ErrorActionPreference='Stop'; $ids=ConvertFrom-Json '${JSON.stringify(ids)}'; foreach ($id in $ids) {$p=$null; try {$p=[Diagnostics.Process]::GetProcessById([int]$id.pid); $h=$p.Handle; if ($p.StartTime.ToFileTimeUtc().ToString() -eq $id.startTime) {$p.Kill(); if (!$p.WaitForExit(1000)) {throw 'owned Electron process exit unconfirmed'}}} catch [ArgumentException] {} finally {if ($p) {$p.Dispose()}}}; 'CLEANED'`, 20_000)
      if (result.status !== 0 || result.stdout.trim() !== "CLEANED") throw new Error(`desktop emergency cleanup: ${result.stderr}`)
    }
    if (!win) ids.forEach((id) => kill9(id))
    await until(10_000, "all emergency-owned identities gone", () => {
      const current = table(2000)
      return !current.some((row) => !row.state.startsWith("Z") && ids.some((id) => matches(row, id))) ? true : undefined
    })
  } catch (error) { errors.push(String(error)) }
  finally {
    if (app.exitCode === null && app.signalCode === null) app.kill("SIGKILL")
    app.stdin?.destroy()
    await until(5000, "owned Electron launcher exit", () => app.exitCode !== null || app.signalCode !== null ? true : undefined).catch((error) => errors.push(String(error)))
    if (win) await WindowsInventory.stop().catch((error) => errors.push(String(error)))
  }
  if (errors.length) throw new Error(errors.join("; "))
}
