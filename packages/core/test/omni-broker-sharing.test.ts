import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { until, win } from "../../omni/campaign/lib.ts"
import { WindowsInventory } from "../../omni/campaign/windows-inventory.ts"

// Windows file-sharing semantics require real Windows handles; Linux success cannot prove this boundary.
if (win) test("real broker survives exclusive sharing and partial publication; read mutants fail exact controls", async () => {
  for (const mutation of ["none", "unprotected", "no-retry"] as const) {
    for (const fault of ["lock", "partial"] as const) {
      const dir = mkdtempSync(path.join(os.tmpdir(), "omni-sharing-control-"))
      const source = WindowsInventory.brokerScript(dir)
      const script = mutation === "unprotected"
        ? replace(source, "$p=$null; $closed=$true;", "$request=ConvertFrom-Json ([IO.File]::ReadAllText($file)); $p=$null; $closed=$true;")
        : mutation === "no-retry" ? replace(source, ".ToUnixTimeMilliseconds()+1000;", ".ToUnixTimeMilliseconds()+0;") : source
      const broker = powershell(script)
      const output = { stderr: "" }
      broker.stderr.on("data", (chunk) => (output.stderr += chunk))
      const file = path.join(dir, "request-first.json")
      const reply = path.join(dir, "reply-first.json")
      const executed = path.join(dir, "executed")
      const request = JSON.stringify({ command: "node", args: ["-e", `require('node:fs').appendFileSync(${JSON.stringify(executed)},'once\\n');console.log('FIRST_SNAPSHOT')`], deadline: Date.now() + 20_000 })
      const holder = fault === "lock" ? powershell(`$ErrorActionPreference='Stop'; $until=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+10000; while (!(Test-Path '${quote(file + ".tmp")}')) {if ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -ge $until) {throw 'lock fixture publication deadline'}; [Threading.Thread]::Sleep(5)}; $s=[IO.File]::Open('${quote(file + ".tmp")}',[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::Delete); try {[IO.File]::WriteAllText('${quote(path.join(dir, "locked"))}','locked'); while (!(Test-Path '${quote(path.join(dir, "release"))}')) {if ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -ge $until) {throw 'lock fixture release deadline'}; [Threading.Thread]::Sleep(5)}} finally {$s.Dispose()}`) : undefined
      try {
        // Holder starts after the complete temp snapshot exists, before atomic publication.
        // Its startup script waits for that file so handle creation cannot race this write.
        await until(10_000, "real broker ready", () => {
          if (broker.exitCode !== null || broker.signalCode !== null) throw new Error(`broker startup failed: ${output.stderr}`)
          return existsSync(path.join(dir, "ready.json")) ? true : undefined
        })
        writeFileSync(file + ".tmp", fault === "partial" ? '{"command":' : request)
        if (holder) await until(10_000, "exclusive Windows file handle", () => {
          if (holder.exitCode !== null || holder.signalCode !== null) throw new Error("exclusive file holder exited before lock")
          return existsSync(path.join(dir, "locked")) ? true : undefined
        })
        renameSync(file + ".tmp", file)
        await Bun.sleep(150)
        if (mutation === "none") {
          expect(broker.exitCode).toBeNull()
          expect(existsSync(reply)).toBe(false)
          expect(existsSync(executed)).toBe(false)
          expect(existsSync(path.join(dir, "owned-first.json"))).toBe(false)
        }
        if (holder) writeFileSync(path.join(dir, "release"), "release")
        if (fault === "partial") writeFileSync(file, request)
        await until(10_000, "recovered request or mutant failure", () => existsSync(reply) || broker.exitCode !== null || broker.signalCode !== null ? true : undefined)
        const recovered = existsSync(reply) && JSON.parse(readFileSync(reply, "utf8")).stdout.trim() === "FIRST_SNAPSHOT"
        expect(recovered).toBe(mutation === "none")
        if (mutation === "none") {
          expect(JSON.parse(readFileSync(reply, "utf8"))).toMatchObject({ status: 0, closed: true, timedOut: false })
          expect(readFileSync(executed, "utf8")).toBe("once\n")
          writeFileSync(file + ".ack", "ack")
          await until(5000, "request ack consumed", () => !existsSync(file) && !existsSync(reply) && !existsSync(file + ".ack") ? true : undefined)
          publish(dir, "second", "SECOND_SNAPSHOT")
          await until(10_000, "next exact request reply", () => existsSync(path.join(dir, "reply-second.json")) ? true : undefined)
          expect(JSON.parse(readFileSync(path.join(dir, "reply-second.json"), "utf8")).stdout.trim()).toBe("SECOND_SNAPSHOT")
          expect(readFileSync(executed, "utf8")).toBe("once\n")
        }
        console.log("BROKER_SHARING_MUTATION_PROOF " + JSON.stringify({ mutation, fault, recovered, brokerAlive: broker.exitCode === null && broker.signalCode === null }))
      } finally {
        writeFileSync(path.join(dir, "release"), "release")
        writeFileSync(path.join(dir, "stop"), "stop")
        await close(broker)
        if (holder) await close(holder)
        rmSync(dir, { recursive: true, force: true })
      }
    }
  }
}, 180_000)

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
  const file = path.join(dir, `request-${key}.json`)
  writeFileSync(file + ".tmp", JSON.stringify({ command: "node", args: ["-e", `console.log(${JSON.stringify(text)})`], deadline: Date.now() + 10_000 }))
  renameSync(file + ".tmp", file)
}

async function close(proc: ReturnType<typeof powershell>) {
  const timer = setTimeout(() => proc.kill("SIGKILL"), 2000)
  try { await Promise.race([proc.closed, Bun.sleep(5000).then(() => { throw new Error("sharing control helper close unconfirmed") })]) }
  finally { clearTimeout(timer) }
}

function replace(source: string, before: string, after: string) {
  if (!source.includes(before)) throw new Error(`mutation boundary missing: ${before}`)
  return source.replace(before, after)
}
