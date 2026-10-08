// Windows OS instrument only. A PowerShell 7 watchdog owns query handles and OS waits, including
// executable startup. The caller's monotonic deadline independently rejects late observations.
import { spawn, type ChildProcess } from "node:child_process"
import { randomUUID } from "node:crypto"
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Identity, Row } from "./lib.ts"

const TIMEOUT_MS = 10_000
const broker = { proc: undefined as ChildProcess | undefined, close: undefined as Promise<void> | undefined,
  closed: false, dir: undefined as string | undefined, stderr: undefined as number | undefined, identity: undefined as Identity | undefined }
// A CIM row can outlive its process. Access denial preserves unknown; only OS missing/exited removes it.
export const CIM = "$ErrorActionPreference='Stop'; ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process | Where-Object {if ($null -ne $_.CommandLine) {return $true}; $p=$null; try {$p=[Diagnostics.Process]::GetProcessById([int]$_.ProcessId); return !$p.HasExited} catch [ArgumentException] {return $false} catch {return $true} finally {if ($p) {$p.Dispose()}}} | Select-Object ProcessId,ParentProcessId,CommandLine,SessionId,@{Name='StartTime';Expression={if ($_.CreationDate) {$_.CreationDate.ToFileTimeUtc().ToString()}}})"

/** Exact OS watchdog source, shared with real file-sharing fault controls. */
export function brokerScript(dir: string) {
  return `
$ErrorActionPreference='Stop'; $dir='${dir.replaceAll("'", "''")}';
$utf8=[Text.UTF8Encoding]::new($false);
function Put($name,$value) {$file=Join-Path $dir $name; [IO.File]::WriteAllText(($file+'.tmp'),(ConvertTo-Json -Compress -Depth 8 -InputObject $value),$utf8); [IO.File]::Move(($file+'.tmp'),$file,$true)}
$self=Get-CimInstance Win32_Process -Filter ('ProcessId='+$PID);
Put 'ready.json' @{pid=$PID;startTime=$self.CreationDate.ToFileTimeUtc().ToString()};
while (!(Test-Path (Join-Path $dir 'stop'))) {
  foreach ($file in [IO.Directory]::GetFiles($dir,'request-*.json')) {
    $key=[IO.Path]::GetFileName($file).Substring(8); $replyFile=Join-Path $dir ('reply-'+$key);
    if (Test-Path $replyFile) {if (Test-Path ($file+'.ack')) {[IO.File]::Delete($file); [IO.File]::Delete($replyFile); [IO.File]::Delete(($file+'.ack'))}; continue}
    $p=$null; $closed=$true;
    $reply=@{pid=0;status=$null;stdout='';stderr='';closed=$true;timedOut=$false};
    try {
      # Published files are immutable. Share deletion too: antivirus/indexers can retain handles.
      # Retry transient sharing and incomplete JSON without consuming the request or launching work.
      $readUntil=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+1000;
      while ($true) {
        $stream=$null; $reader=$null;
        try {
          $stream=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete));
          $reader=[IO.StreamReader]::new($stream,$utf8); $text=$reader.ReadToEnd();
          $request=ConvertFrom-Json -ErrorAction Stop $text;
          if ($request.command -isnot [string] -or !$request.command -or $request.args -isnot [array] -or @($request.args | Where-Object {$_ -isnot [string]}).Count -ne 0 -or $request.deadline -isnot [ValueType] -or [double]::IsNaN([double]$request.deadline) -or [double]::IsInfinity([double]$request.deadline)) {throw 'Malformed Windows helper request'}
          break;
        } catch {
          $cause=$_.Exception; while ($cause.InnerException) {$cause=$cause.InnerException};
          if ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -ge $readUntil -or (($cause.HResult -band 65535) -notin @(32,33) -and $_.FullyQualifiedErrorId -notlike '*ConvertFromJson*' -and $cause.Message -ne 'Malformed Windows helper request')) {throw}
          [Threading.Thread]::Sleep(5);
        } finally {if ($reader) {$reader.Dispose()} elseif ($stream) {$stream.Dispose()}}
      }
      $info=[Diagnostics.ProcessStartInfo]::new(); $info.FileName=[string]$request.command;
      $info.UseShellExecute=$false; $info.CreateNoWindow=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true;
      $info.StandardOutputEncoding=$utf8; $info.StandardErrorEncoding=$utf8;
      foreach ($arg in $request.args) {$info.ArgumentList.Add([string]$arg)}
      $p=[Diagnostics.Process]::new(); $p.StartInfo=$info;
      $left=[int][Math]::Max(0,([double]$request.deadline-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()));
      if ($left -le 0) {throw 'Windows helper missed deadline before startup'}
      if (!$p.Start()) {throw 'Windows helper did not start'}; $h=$p.Handle; $closed=$false; $reply.pid=$p.Id;
      Put ('owned-'+$key) @{pid=$p.Id;startTime=$p.StartTime.ToFileTimeUtc().ToString()};
      $stdout=$p.StandardOutput.ReadToEndAsync(); $stderr=$p.StandardError.ReadToEndAsync();
      $left=[int][Math]::Max(1,([double]$request.deadline-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()));
      if (!$p.WaitForExit($left)) {$reply.timedOut=$true; $p.Kill()}
      if (!$p.WaitForExit(2000)) {throw 'Windows helper kill did not confirm OS exit'}; $closed=$true;
      if (!$stdout.Wait(2000) -or !$stderr.Wait(2000)) {throw 'Windows helper pipes did not close'}
      $reply.stdout=$stdout.Result; $reply.stderr=$stderr.Result; $reply.status=$p.ExitCode;
      if ($reply.stdout.Length -gt 67108864 -or $reply.stderr.Length -gt 67108864) {throw 'Windows helper output exceeded 64 MiB'}
    } catch {$reply.error=$_.Exception.Message}
    finally {
      if ($p -and !$closed) {try {$p.Kill(); $closed=$p.WaitForExit(2000)} catch {$reply.error=$_.Exception.Message}}
      $reply.closed=$closed;
      if ($p -and $closed) {$p.Dispose()}
    }
    Put ('reply-'+$key) $reply;
  }
  [Threading.Thread]::Sleep(5)
}`
}

function ensureBroker(deadline: number) {
  if (broker.identity && !broker.closed) return
  if (broker.proc) throw new Error("Windows watchdog is not ready; ownership retained for teardown")
  broker.dir = mkdtempSync(path.join(os.tmpdir(), "omni-inventory-watchdog-"))
  broker.stderr = openSync(path.join(broker.dir, "stderr"), "w+")
  const close = Promise.withResolvers<void>()
  broker.close = close.promise
  broker.closed = false
  const proc = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(brokerScript(broker.dir), "utf16le").toString("base64")], { windowsHide: true, stdio: ["ignore", "ignore", broker.stderr] })
  broker.proc = proc
  proc.on("error", () => { broker.closed = true }) // Close still must confirm process/stdio teardown.
  proc.on("close", () => { broker.closed = true; close.resolve() })
  if (!proc.pid) throw new Error("Windows watchdog has no PID; close unconfirmed")
  while (!existsSync(path.join(broker.dir, "ready.json")) && performance.now() < deadline) Bun.sleepSync(5)
  if (!existsSync(path.join(broker.dir, "ready.json"))) { proc.kill("SIGKILL"); throw new Error("Windows watchdog startup deadline expired; close unconfirmed") }
  const ready = JSON.parse(readFileSync(path.join(broker.dir, "ready.json"), "utf8")) as Identity
  if (ready.pid !== proc.pid || typeof ready.startTime !== "string" || !/^\d+$/.test(ready.startTime)) { proc.kill("SIGKILL"); throw new Error("malformed Windows watchdog ready; close unconfirmed") }
  broker.identity = ready
}

function waitClose(close: Promise<void>, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    close.then(() => { clearTimeout(timer); resolve(true) })
  })
}

async function stopBroker() {
  const proc = broker.proc
  if (!proc) return
  const dir = broker.dir!
  writeFileSync(path.join(dir, "stop"), "stop\n")
  try {
    if (!await waitClose(broker.close!, 2000)) { proc.kill("SIGKILL"); if (!await waitClose(broker.close!, 2000)) throw new Error("Windows watchdog kill did not confirm close") }
    // Unconfirmed query leases survive a failed caller/broker. Recovery retains an OS handle,
    // compares the same kernel StartTime, kills only that identity, and confirms exit.
    for (const file of readdirSync(dir).filter((file) => file.startsWith("owned-"))) {
      const owned = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Identity
      if (!Number.isSafeInteger(owned.pid) || owned.pid <= 0 || typeof owned.startTime !== "string" || !/^\d+$/.test(owned.startTime)) throw new Error(`malformed owned Windows helper lease: ${file}`)
      const script = `$ErrorActionPreference='Stop'; $p=$null; try {$p=[Diagnostics.Process]::GetProcessById(${owned.pid}); $h=$p.Handle} catch [ArgumentException] {Write-Output 'RECOVERY_OK'; exit 0}; try {if ($p.StartTime.ToFileTimeUtc().ToString() -eq '${owned.startTime}') {$p.Kill(); if (!$p.WaitForExit(2000)) {throw 'owned query exit unconfirmed'}}; Write-Output 'RECOVERY_OK'} finally {$p.Dispose()}`
      const recovery = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
      const output = { stdout: "", stderr: "" }
      recovery.stdout.on("data", (chunk) => (output.stdout += chunk))
      recovery.stderr.on("data", (chunk) => (output.stderr += chunk))
      const close = new Promise<void>((resolve) => recovery.once("close", () => resolve()))
      recovery.on("error", (error) => (output.stderr += String(error)))
      try {
        if (!await waitClose(close, TIMEOUT_MS)) throw new Error("owned Windows query recovery deadline expired")
        if (recovery.exitCode !== 0 || !output.stdout.includes("RECOVERY_OK")) throw new Error(`owned Windows query recovery failed: ${output.stderr}`)
        rmSync(path.join(dir, file))
      } finally {
        if (recovery.exitCode === null && recovery.signalCode === null) { recovery.kill("SIGKILL"); if (!await waitClose(close, 2000)) throw new Error("Windows recovery helper kill did not confirm close") }
      }
    }
    closeSync(broker.stderr!)
    rmSync(dir, { recursive: true, force: true })
    broker.proc = undefined
    broker.close = undefined
    broker.dir = undefined
    broker.stderr = undefined
    broker.identity = undefined
  } finally {
    if (!broker.closed) { proc.kill("SIGKILL"); if (!await waitClose(broker.close!, 2000)) throw new Error("Windows watchdog close remains unconfirmed; ownership retained") }
  }
}

/** The independent .NET OS watchdog covers executable startup and query, then confirms its owned
 * process handle exited. On missing confirmation, leases/handles remain owned until async stop.
 */
export function run(command: string, args: string[], timeoutMs = TIMEOUT_MS) {
  if (process.platform !== "win32") throw new Error("Windows instrument requires Windows")
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Windows helper has no deadline budget")
  const deadline = performance.now() + timeoutMs
  ensureBroker(deadline)
  const key = `${randomUUID()}.json`
  const file = path.join(broker.dir!, `request-${key}`)
  // Close the complete JSON write before publishing; the broker never enumerates temporary files.
  writeFileSync(file + ".tmp", JSON.stringify({ command, args, deadline: Date.now() + Math.max(0, deadline - performance.now()) }))
  renameSync(file + ".tmp", file)
  const replyFile = path.join(broker.dir!, `reply-${key}`)
  // Two seconds belong to failed-operation teardown only; no late result can pass the caller's KPI.
  while (!existsSync(replyFile) && performance.now() < deadline + 2000) Bun.sleepSync(5)
  if (!existsSync(replyFile)) throw new Error(`Windows helper deadline expired after ${timeoutMs} ms; OS exit unconfirmed: ${readFileSync(path.join(broker.dir!, "stderr"), "utf8").slice(-2000)}`)
  const reply = JSON.parse(readFileSync(replyFile, "utf8")) as { pid: number; status: number | null; stdout: string; stderr: string; closed: boolean; timedOut: boolean; error?: string }
  if (reply.closed !== true) throw Object.assign(new Error("Windows helper OS exit remains unconfirmed"), { helperPID: reply.pid })
  if (typeof reply.timedOut !== "boolean" || reply.error !== undefined && typeof reply.error !== "string") throw new Error("malformed Windows helper closure result")
  rmSync(path.join(broker.dir!, `owned-${key}`), { force: true })
  // Only the watchdog removes request/reply files, after its enumeration has consumed them.
  writeFileSync(file + ".ack", "ack\n")
  if (reply.timedOut || performance.now() >= deadline) throw Object.assign(new Error(`Windows helper deadline expired after ${timeoutMs} ms`), { helperPID: reply.pid })
  if (reply.error) throw new Error(`Windows helper failed: ${reply.error}`)
  if (!Number.isSafeInteger(reply.pid) || reply.pid <= 0 || !Number.isInteger(reply.status) || typeof reply.stdout !== "string" || typeof reply.stderr !== "string") throw new Error("malformed Windows helper result")
  return { ...reply, instrument: broker.identity! }
}

export function query(command: string, timeoutMs = TIMEOUT_MS) {
  return run("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); ${command}`, "utf16le").toString("base64")], timeoutMs)
}

export function decode(input: unknown, queryPID: number): Row[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error("Get-CimInstance returned no process table")
  const rows = input.flatMap((value: unknown) => {
    if (typeof value !== "object" || value === null) throw new Error("malformed Get-CimInstance row")
    const row = value as Record<string, unknown>
    if (row.ProcessId === queryPID || row.ProcessId === 0 || row.ProcessId === 4) return []
    if (typeof row.ProcessId !== "number" || !Number.isSafeInteger(row.ProcessId) || row.ProcessId <= 0 || typeof row.ParentProcessId !== "number" || !Number.isSafeInteger(row.ParentProcessId) || row.ParentProcessId < 0 || (row.CommandLine !== null && typeof row.CommandLine !== "string") || typeof row.StartTime !== "string" || !/^\d+$/.test(row.StartTime) || typeof row.SessionId !== "number" || !Number.isSafeInteger(row.SessionId) || row.SessionId < 0)
      throw new Error(`Get-CimInstance cannot establish process identity for PID ${row.ProcessId}: ${JSON.stringify(row)}`)
    return [{ pid: row.ProcessId, parent: row.ParentProcessId, args: typeof row.CommandLine === "string" && row.CommandLine.trim() ? row.CommandLine : null, startTime: row.StartTime, session: row.SessionId, state: "live" }]
  })
  if (!rows.some((row) => row.pid === process.pid)) throw new Error("Get-CimInstance returned an incomplete process table (querying host missing)")
  return rows
}

export function kill(pinned: Identity) {
  const out = query(`$p=$null; try {$p=[Diagnostics.Process]::GetProcessById(${pinned.pid}); $h=$p.Handle} catch [ArgumentException] {return 'STALE'}; try {$r=Get-CimInstance Win32_Process -Filter 'ProcessId=${pinned.pid}'; if (!$r -or !$r.CreationDate -or $r.CreationDate.ToFileTimeUtc().ToString() -ne '${pinned.startTime.replaceAll("'", "''")}') {return 'STALE'}; $p.Kill(); if (!$p.WaitForExit(2000)) {throw 'captured process kill did not confirm exit'}; 'KILLED'} finally {$p.Dispose()}`)
  if (out.status !== 0) throw new Error(`captured Windows process kill failed: ${out.stderr}`)
  if (out.stdout.trim() === "STALE") return false
  if (out.stdout.trim() !== "KILLED") throw new Error(`malformed Windows kill result: ${out.stdout}`)
  return true
}

/** Each recorder owns its exact child/close promise. Fault controls use real child executables through this boundary. */
export function makeRecorder(input = { command: "powershell", args: ["-NoProfile", "-NonInteractive", "-Command", `
$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process -Filter 'ProcessId=${process.pid}' | Out-Null;
Write-Output '{"ready":true}';
while ($line=[Console]::ReadLine()) {
  $request=ConvertFrom-Json $line;
  try {$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$request.pid);
    $reply=if ($p) {@{pid=[int]$p.ProcessId;startTime=$p.CreationDate.ToFileTimeUtc().ToString()}} else {@{pid=[int]$request.pid;gone=$true}}
  } catch {$reply=@{pid=[int]$request.pid;error=$_.Exception.Message}}
  ConvertTo-Json -Compress -InputObject $reply
}`] }, timeoutMs = TIMEOUT_MS) {
  const state = { proc: undefined as ChildProcess | undefined, ready: undefined as Promise<void> | undefined,
    close: undefined as Promise<void> | undefined, closed: false, failed: undefined as Error | undefined, lastPID: undefined as number | undefined }
  const pending = new Map<number, ReturnType<typeof Promise.withResolvers<Identity | undefined>>>()
  const waitClose = () => Promise.race([state.close!.then(() => true), new Promise<false>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    state.close!.finally(() => clearTimeout(timer))
  })])
  const stop = async (force = false) => {
    const proc = state.proc
    if (!proc) return
    if (force && !state.closed) proc.kill("SIGKILL")
    if (!force && !state.closed) proc.stdin!.end()
    const graceful = await waitClose()
    if (!graceful) {
      proc.kill("SIGKILL")
      if (!await waitClose()) throw new Error(`identity recorder kill did not confirm close for PID ${proc.pid}`)
    }
    // References clear only after close confirms exit and pipe closure, including forced shutdown.
    state.proc = undefined
    state.ready = undefined
    state.close = undefined
    pending.clear()
    if (!graceful) throw new Error("identity recorder shutdown deadline expired; forced close confirmed")
  }
  const prepare = async () => {
    if (state.ready) {
      if (state.failed || state.closed) { const error = state.failed ?? new Error("identity recorder is not live"); await stop(true); throw error }
      return state.ready
    }
    const ready = Promise.withResolvers<void>()
    const close = Promise.withResolvers<void>()
    state.ready = ready.promise
    state.close = close.promise
    state.closed = false
    state.failed = undefined
    const proc = spawn(input.command, input.args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
    state.proc = proc
    state.lastPID = proc.pid
    const text = { stdout: "", stderr: "", ready: false }
    const fail = (error: unknown) => { state.failed = error instanceof Error ? error : new Error(String(error)); ready.reject(state.failed); pending.forEach((request) => request.reject(state.failed)); pending.clear() }
    proc.stderr!.on("data", (chunk) => (text.stderr += chunk))
    proc.stdin!.on("error", fail)
    proc.on("error", fail)
    proc.on("close", () => { state.closed = true; close.resolve(); fail(new Error(`identity recorder closed: ${text.stderr}`)) })
    proc.stdout!.on("data", (chunk) => {
      text.stdout += chunk
      for (;;) {
        const end = text.stdout.indexOf("\n")
        if (end < 0) return
        const line = text.stdout.slice(0, end)
        text.stdout = text.stdout.slice(end + 1)
        try {
          const reply = JSON.parse(line) as { ready?: boolean; pid: number; startTime?: string; gone?: boolean; error?: string }
          if (!text.ready) {
            if (reply.ready !== true || Object.keys(reply).length !== 1) throw new Error(`malformed identity recorder ready: ${line}`)
            text.ready = true; ready.resolve(); continue
          }
          const request = pending.get(reply.pid)
          if (!request || !Number.isSafeInteger(reply.pid) || reply.pid <= 0 || reply.ready !== undefined || reply.gone !== undefined && reply.gone !== true)
            throw new Error(`malformed identity recorder reply: ${line}`)
          pending.delete(reply.pid)
          if (reply.error || !reply.gone && (typeof reply.startTime !== "string" || !/^\d+$/.test(reply.startTime))) { request.reject(new Error(`identity recorder failed: ${line}`)); continue }
          request.resolve(reply.gone ? undefined : { pid: reply.pid, startTime: reply.startTime! })
        } catch (error) { fail(error); proc.kill("SIGKILL") }
      }
    })
    const timer = setTimeout(() => fail(new Error("identity recorder readiness deadline expired")), timeoutMs)
    try { await ready.promise }
    catch (error) { await stop(true); throw error }
    finally { clearTimeout(timer) }
  }
  const capture = async (pid: number) => {
    await prepare()
    const request = Promise.withResolvers<Identity | undefined>()
    pending.set(pid, request)
    const timer = setTimeout(() => request.reject(new Error(`identity capture deadline expired for PID ${pid}`)), timeoutMs)
    state.proc!.stdin!.write(JSON.stringify({ pid }) + "\n")
    try { return await request.promise }
    catch (error) { await stop(true); throw error }
    finally { clearTimeout(timer) }
  }
  return { prepare, capture, stop, snapshot: () => ({ pid: state.proc?.pid, lastPID: state.lastPID, closed: state.closed, pending: pending.size }) }
}

const recorder = makeRecorder()
export const prepare = async () => { ensureBroker(performance.now() + TIMEOUT_MS); await recorder.prepare() }
export const capture = (pid: number) => recorder.capture(pid)
export async function stop() {
  try { await recorder.stop() }
  finally { await stopBroker() }
}

export * as WindowsInventory from "./windows-inventory"
