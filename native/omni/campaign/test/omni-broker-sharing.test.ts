import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { until, win } from "../lib.ts"
import { WindowsInventory } from "../windows-inventory.ts"

// Windows file-sharing semantics require real Windows handles; Linux success cannot prove this boundary.
// The broker retries a transient read fault for one second. This fixture releases its fault only after the test has
// observed it, so the release instant measures host scheduling, not the broker. Recovery is therefore required by
// ordering: a fault released before the broker's last failed read attempt began must be recovered. A fault released
// later is a late fixture; it must still leave a bounded red reply that launched nothing, and the control repeats.
// No run passes without one real recovery, so a broker that never retries still fails.
const ATTEMPTS = 3

if (win) test("real broker survives exclusive sharing and partial publication; read mutants fail exact controls", async () => {
  for (const mutation of ["none", "unprotected", "no-retry"] as const) {
    for (const fault of ["lock", "partial"] as const) {
      const late: number[] = []
      for (;;) {
        const outcome = await control(mutation, fault)
        if (outcome.late !== undefined) {
          late.push(outcome.late)
          if (late.length < ATTEMPTS) continue
          throw new Error(`${fault}: no recovery in ${ATTEMPTS} attempts; each release came after the broker's last read attempt began (${late.join(", ")} ms after its first fault)`)
        }
        expect(outcome.recovered).toBe(mutation === "none")
        console.log("BROKER_SHARING_MUTATION_PROOF " + JSON.stringify({ mutation, fault, recovered: outcome.recovered, brokerAlive: outcome.brokerAlive, late }))
        break
      }
    }
  }
}, 180_000)

async function control(mutation: "none" | "unprotected" | "no-retry", fault: "lock" | "partial") {
  const dir = mkdtempSync(path.join(os.tmpdir(), "omni-sharing-control-"))
  // Observe the real read failure, then release its cause; no delay guesses broker scheduling. The reply carries
  // when the broker's first and last failed read attempts began.
  const source = [
    ["$stream=$null; $reader=$null;", "$attemptAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); $stream=$null; $reader=$null;"],
    ["$cause=$_.Exception;", "if ($null -eq $reply.firstFault) {$reply.firstFault=$attemptAt; Put ('blocked-'+$key) @{observed=$true}}; $reply.lastFault=$attemptAt; $cause=$_.Exception;"],
  ].reduce((script, [before, after]) => replace(script, before, after), WindowsInventory.brokerScript(dir))
  const script = mutation === "unprotected"
    ? replace(source, "$p=$null; $closed=$true;", "$request=ConvertFrom-Json ([IO.File]::ReadAllText($file)); $p=$null; $closed=$true;")
    : mutation === "no-retry" ? replace(source, ".ToUnixTimeMilliseconds()+1000;", ".ToUnixTimeMilliseconds()+0;") : source
  const broker = powershell(script)
  const output = { stderr: "" }
  broker.stderr.on("data", (chunk) => (output.stderr += chunk))
  const file = path.join(dir, "request-first.json")
  const reply = path.join(dir, "reply-first.json")
  const executed = path.join(dir, "executed")
  const released = path.join(dir, "released")
  const request = JSON.stringify({ command: "node", args: ["-e", `require('node:fs').appendFileSync(${JSON.stringify(executed)},'once\\n');console.log('FIRST_SNAPSHOT')`], deadline: Date.now() + 20_000 })
  // The holder records when its exclusive handle was closed, on the same wall clock the broker uses.
  const holder = fault === "lock" ? powershell(`$ErrorActionPreference='Stop'; $until=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+10000; while (!(Test-Path '${quote(path.join(dir, "write-closed"))}')) {if ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -ge $until) {throw 'lock fixture publication deadline'}; [Threading.Thread]::Sleep(5)}; $s=[IO.File]::Open('${quote(file + ".tmp")}',[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::Delete); try {[IO.File]::WriteAllText('${quote(path.join(dir, "locked"))}','locked'); while (!(Test-Path '${quote(path.join(dir, "release"))}')) {if ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -ge $until) {throw 'lock fixture release deadline'}; [Threading.Thread]::Sleep(5)}} finally {$s.Dispose(); [IO.File]::WriteAllText('${quote(released)}',[string][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())}`) : undefined
  try {
    // Production publisher confirms write closure before the holder can open the temp file.
    await until(10_000, "real broker ready", () => {
      if (broker.exitCode !== null || broker.signalCode !== null) throw new Error(`broker startup failed: ${output.stderr}`)
      return existsSync(path.join(dir, "ready.json")) ? true : undefined
    })
    WindowsInventory.publishRequest(file, fault === "partial" ? '{"command":' : request, () => {
      writeFileSync(path.join(dir, "write-closed"), "closed")
      if (!holder) return
      const deadline = performance.now() + 10_000
      while (!existsSync(path.join(dir, "locked"))) {
        if (performance.now() >= deadline) throw new Error("exclusive Windows handle acquisition deadline")
        Bun.sleepSync(5)
      }
    })
    await poll(3000, "broker observed injected read fault", () => existsSync(path.join(dir, "blocked-first.json")) || existsSync(reply) || broker.exitCode !== null || broker.signalCode !== null)
    if (mutation === "none") {
      expect(broker.exitCode).toBeNull()
      expect(existsSync(reply)).toBe(false)
      expect(existsSync(executed)).toBe(false)
      expect(existsSync(path.join(dir, "owned-first.json"))).toBe(false)
    }
    if (holder) writeFileSync(path.join(dir, "release"), "release")
    if (fault === "partial") {
      writeFileSync(file, request)
      writeFileSync(released, String(Date.now()))
    }
    await until(10_000, "recovered request or mutant failure", () => existsSync(reply) || broker.exitCode !== null || broker.signalCode !== null ? true : undefined)
    const recovered = existsSync(reply) && JSON.parse(readFileSync(reply, "utf8")).stdout.trim() === "FIRST_SNAPSHOT"
    const brokerAlive = broker.exitCode === null && broker.signalCode === null
    if (mutation !== "none") return { recovered, brokerAlive }
    if (!recovered) {
      // A missed recovery is acceptable only when the fault outlived the start of the final read attempt, and then the
      // broker must still be alive with a bounded red reply that never launched the request.
      await poll(10_000, "fixture release instant", () => existsSync(released))
      const answer = JSON.parse(readFileSync(reply, "utf8"))
      expect(brokerAlive).toBe(true)
      expect(answer).toMatchObject({ pid: 0, status: null, closed: true, timedOut: false })
      expect(typeof answer.error).toBe("string")
      expect(existsSync(executed)).toBe(false)
      expect(existsSync(path.join(dir, "owned-first.json"))).toBe(false)
      expect(Number(readFileSync(released, "utf8"))).toBeGreaterThanOrEqual(answer.lastFault)
      return { recovered, brokerAlive, late: Number(readFileSync(released, "utf8")) - answer.firstFault }
    }
    expect(JSON.parse(readFileSync(reply, "utf8"))).toMatchObject({ status: 0, closed: true, timedOut: false })
    expect(readFileSync(executed, "utf8")).toBe("once\n")
    writeFileSync(file + ".ack", "ack")
    await until(5000, "request ack consumed", () => !existsSync(file) && !existsSync(reply) && !existsSync(file + ".ack") ? true : undefined)
    publish(dir, "second", "SECOND_SNAPSHOT")
    await until(10_000, "next exact request reply", () => existsSync(path.join(dir, "reply-second.json")) ? true : undefined)
    expect(JSON.parse(readFileSync(path.join(dir, "reply-second.json"), "utf8")).stdout.trim()).toBe("SECOND_SNAPSHOT")
    expect(readFileSync(executed, "utf8")).toBe("once\n")
    return { recovered, brokerAlive }
  } finally {
    writeFileSync(path.join(dir, "release"), "release")
    writeFileSync(path.join(dir, "stop"), "stop")
    await close(broker)
    if (holder) await close(holder)
    rmSync(dir, { recursive: true, force: true })
  }
}

if (win) test("permanent malformed request stays bounded red; repaired consumed request never runs; next request succeeds", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "omni-malformed-control-"))
  const broker = powershell(WindowsInventory.brokerScript(dir))
  try {
    await until(10_000, "malformed control broker ready", () => existsSync(path.join(dir, "ready.json")) ? true : undefined)
    writeFileSync(path.join(dir, "request-bad.json"), '{"command":')
    const started = performance.now()
    await until(3000, "bounded malformed reply", () => existsSync(path.join(dir, "reply-bad.json")) ? true : undefined)
    const reply = JSON.parse(readFileSync(path.join(dir, "reply-bad.json"), "utf8"))
    expect(reply).toMatchObject({ pid: 0, closed: true, status: null })
    expect(typeof reply.error).toBe("string")
    expect(performance.now() - started).toBeLessThan(3000)
    publish(dir, "bad", "MUST_NOT_RUN")
    publish(dir, "good", "AFTER_BAD")
    await until(10_000, "healthy reply after invalid JSON", () => existsSync(path.join(dir, "reply-good.json")) ? true : undefined)
    expect(JSON.parse(readFileSync(path.join(dir, "reply-good.json"), "utf8")).stdout.trim()).toBe("AFTER_BAD")
    expect(JSON.parse(readFileSync(path.join(dir, "reply-bad.json"), "utf8"))).toEqual(reply)
    expect(broker.exitCode).toBeNull()
    console.log("BROKER_MALFORMED_PROOF " + JSON.stringify({ boundedRed: true, staleReplyRejected: true, nextRequestVisible: true }))
  } finally {
    writeFileSync(path.join(dir, "stop"), "stop")
    await close(broker)
    rmSync(dir, { recursive: true, force: true })
  }
}, 30_000)

function powershell(script: string) {
  const proc = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] })
  return Object.assign(proc, { closed: new Promise<void>((resolve) => proc.once("close", () => resolve())) })
}

function quote(value: string) {
  return value.replaceAll("'", "''")
}

function publish(dir: string, key: string, text: string) {
  WindowsInventory.publishRequest(path.join(dir, `request-${key}.json`), JSON.stringify({ command: "node", args: ["-e", `console.log(${JSON.stringify(text)})`], deadline: Date.now() + 10_000 }))
}

async function close(proc: ReturnType<typeof powershell>) {
  const timer = setTimeout(() => proc.kill("SIGKILL"), 2000)
  try { await Promise.race([proc.closed, Bun.sleep(5000).then(() => { throw new Error("sharing control helper close unconfirmed") })]) }
  finally { clearTimeout(timer) }
}

// The campaign until() polls every 200 ms; a fault the broker retries for one second is observed and released sooner.
async function poll(timeoutMs: number, what: string, probe: () => boolean) {
  const deadline = performance.now() + timeoutMs
  while (!probe()) {
    if (performance.now() >= deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)
    await Bun.sleep(5)
  }
}

function replace(source: string, before: string, after: string) {
  if (!source.includes(before)) throw new Error(`mutation boundary missing: ${before}`)
  return source.replace(before, after)
}
