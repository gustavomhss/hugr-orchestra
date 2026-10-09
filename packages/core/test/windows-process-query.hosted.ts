// Exact-path hosted proof; OS observations come from real Node and a pinned .NET handle/procfs identity.
import { beforeAll, expect, test } from "bun:test"
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { WindowsProcessQuery } from "./fixture/windows-process-query"

const decoder = new URL("../../omni/campaign/windows-inventory.ts", import.meta.url).href
beforeAll(() => { expect(process.env.CI).toBeTruthy() })

test("real native Node receives request and config; files survive until close", async () => {
  const result = JSON.parse(await WindowsProcessQuery.invoke(`
import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync(import.meta.filename + '.config', 'utf8'));
console.log(JSON.stringify({config, request: JSON.parse(process.argv[2]), file: import.meta.filename,
  native: !process.versions.bun && process.release.name === 'node', executable: fs.realpathSync(process.execPath)}));
`, decoder, [process.pid]))
  expect(result.native).toBe(true)
  expect(result.executable).toBe(WindowsProcessQuery.nodeExecutable())
  expect(result.config).toEqual({ node: result.executable, decoder })
  expect(result.request).toEqual([process.pid])
  expect(existsSync(path.dirname(result.file))).toBe(false)
})

test("namespace loads unchanged under Node strip-types and invokes nested real Node", async () => {
  const module = new URL("./fixture/windows-process-query.ts", import.meta.url).href
  expect(await WindowsProcessQuery.invoke(`
import { WindowsProcessQuery } from ${JSON.stringify(module)};
process.stdout.write(await WindowsProcessQuery.invoke('console.log("nested native node")', '', {nonce:'nested'}));
`, decoder, { nonce: "strip-types" })).toBe("nested native node\n")
})

test("real failed script rejects even with stdout; bounded stderr retains diagnostic", async () => {
  const error = await WindowsProcessQuery.invoke(`console.log('not success'); console.error('failure-marker' + 'x'.repeat(100000)); process.exitCode = 7`, decoder, [])
    .then(() => undefined, (error: Error) => error)
  expect(error?.message).toContain("code 7")
  expect(error?.message).toContain("failure-marker")
  expect(error!.message.length).toBeLessThan(17000)
})

test("real empty script rejects", async () => {
  await expect(WindowsProcessQuery.invoke("", decoder, [])).rejects.toThrow("empty output")
})

test("copied real Bun cannot masquerade as native Node; scoped override restored", async () => {
  expect(process.versions.bun).toBeTruthy()
  const dir = mkdtempSync(path.join(os.tmpdir(), "query-alternate-bun-"))
  const alternate = path.join(dir, process.platform === "win32" ? "alternate-bun.exe" : "alternate-bun")
  copyFileSync(process.execPath, alternate)
  chmodSync(alternate, 0o755)
  const previous = process.env.OMNI_CAMPAIGN_NODE
  const outcome = { error: undefined as Error | undefined }
  try {
    process.env.OMNI_CAMPAIGN_NODE = alternate
    expect(WindowsProcessQuery.nodeExecutable()).toBe(alternate)
    outcome.error = await WindowsProcessQuery.invoke("console.log('WRONG RUNTIME SUCCESS')", decoder, [])
      .then(() => undefined, (error: Error) => error)
    expect(outcome.error?.message).toContain("native Node attestation")
  } finally {
    if (previous === undefined) delete process.env.OMNI_CAMPAIGN_NODE
    if (previous !== undefined) process.env.OMNI_CAMPAIGN_NODE = previous
    if (!outcome.error?.message.includes("close unconfirmed")) rmSync(dir, { recursive: true, force: true })
  }
})

test("full 64 MiB source payload fits independently of attestation header", async () => {
  const result = await WindowsProcessQuery.invoke(`process.stdout.write(Buffer.alloc(64 * 1024 * 1024, 120))`, decoder, [])
  expect(Buffer.byteLength(result)).toBe(64 * 1024 * 1024)
  expect(result[0]).toBe("x")
  expect(result.at(-1)).toBe("x")
})

test("real stdout beyond byte cap rejects", async () => {
  await expect(WindowsProcessQuery.invoke(`process.stdout.write(Buffer.alloc(64 * 1024 * 1024 + 1, 120))`, decoder, []))
    .rejects.toThrow("stdout exceeded 64 MiB")
})

test("held live helper times out; independent pinned identity confirms exit", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "query-deadline-proof-"))
  const nonce = path.join(dir, "identity.json")
  const live = path.join(dir, "live.json")
  const started = performance.now()
  const held = WindowsProcessQuery.invoke(`
import fs from 'node:fs';
const request = JSON.parse(process.argv[2]);
fs.writeFileSync(request.nonce + '.tmp', JSON.stringify({pid:process.pid, nonce:request.nonce, file:import.meta.filename}));
fs.renameSync(request.nonce + '.tmp', request.nonce);
setTimeout(() => console.log('LATE SUCCESS'), 20000);
`, decoder, { nonce }, 10000).then((stdout) => ({ stdout, error: "" }), (error: Error) => ({ stdout: "", error: error.message }))
  const observer = WindowsProcessQuery.invoke(OBSERVER, decoder, { nonce }, 35000)
    .then((stdout) => ({ stdout, error: "" }), (error: Error) => ({ stdout: "", error: error.message }))
  try {
    await until(() => existsSync(live), 8000)
    const recorded = JSON.parse(readFileSync(nonce, "utf8"))
    const pinned = JSON.parse(readFileSync(live, "utf8"))
    expect(pinned.pid).toBe(recorded.pid)
    expect(pinned.startTime).toMatch(/^\d+$/)
    expect(pinned.nonce).toBe(nonce)
    const result = await held
    const elapsedMs = performance.now() - started
    const proof = await observer
    console.log("WINDOWS_QUERY_DEADLINE_PROOF " + JSON.stringify({ os: process.platform, pinned, elapsedMs, result, proof }))
    expect(result.error).toContain("deadline expired")
    expect(result.stdout).toBe("")
    expect(elapsedMs).toBeLessThan(15000)
    expect(proof.error).toBe("")
    expect(JSON.parse(proof.stdout)).toEqual({ ...pinned, exited: true })
    expect(existsSync(path.dirname(recorded.file))).toBe(false)
  } finally {
    const results = await Promise.all([held, observer])
    console.log("WINDOWS_QUERY_CLEANUP_PROOF " + JSON.stringify(results))
    if (!results[0].error.includes("close unconfirmed") && !results[1].error && JSON.parse(results[1].stdout).exited === true)
      rmSync(dir, { recursive: true, force: true })
  }
}, 45000)

test("inherited stdout holder forces unknown close; retain files until pinned reap and real pipe close", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "query-inherited-pipe-"))
  const nonce = path.join(dir, "identity.json")
  const held = WindowsProcessQuery.invoke(`
import fs from 'node:fs'; import path from 'node:path'; import {spawn} from 'node:child_process';
const request = JSON.parse(process.argv[2]); const file = path.join(path.dirname(import.meta.filename),'holder.mjs');
fs.writeFileSync(file, ${JSON.stringify(`
import fs from 'node:fs';
const nonce = process.argv[2];
fs.writeFileSync(nonce + '.tmp', JSON.stringify({pid:process.pid,nonce,file:import.meta.filename}));
fs.renameSync(nonce + '.tmp',nonce);
setInterval(()=>console.log('INHERITED STDOUT HELD'),100);
`)});
// Detached raw descriptors preserve real inherited stdout on Windows; stream-object inheritance did not.
spawn(process.execPath,[file,request.nonce],{stdio:['ignore',1,2],windowsHide:true,detached:true});
console.log('SOURCE OUTPUT IS NOT CLOSE'); setInterval(()=>{},1000);
`, decoder, { nonce }, 10000).then((stdout) => ({ stdout, error: undefined }), (error: Error & { directory?: string; closed?: Promise<void>; errors?: Error[] }) => ({ stdout: "", error }))
  const observer = WindowsProcessQuery.invoke(OBSERVER, decoder, { nonce }, 35000)
    .then((stdout) => ({ stdout, error: "" }), (error: Error) => ({ stdout: "", error: error.message }))
  try {
    await until(() => existsSync(path.join(dir, "live.json")), 8000)
    const pinned = JSON.parse(readFileSync(path.join(dir, "live.json"), "utf8"))
    const result = await held
    expect(result.error?.message).toContain("OS/stdio close unconfirmed")
    expect(result.error?.errors?.[0]?.message).toContain("deadline expired")
    expect(result.stdout).toBe("")
    expect(result.error?.closed).toBeInstanceOf(Promise)
    const files = result.error!.directory!
    expect(existsSync(path.join(files, "query.mjs"))).toBe(true)
    expect(existsSync(path.join(files, "query.mjs.config"))).toBe(true)
    expect(existsSync(path.join(files, "holder.mjs"))).toBe(true)
    console.log("WINDOWS_QUERY_UNKNOWN_CLOSE " + JSON.stringify({ os: process.platform, pinned, files, error: result.error!.message }))
  } finally {
    // The independent observer owns the pinned descendant, not a bare PID kill in this test.
    writeFileSync(path.join(dir, "reap"), "reap")
    const results = await Promise.all([held, observer])
    console.log("WINDOWS_QUERY_INHERITED_PIPE_REAP " + JSON.stringify(results))
    if (!results[1].error && JSON.parse(results[1].stdout).exited === true) {
      if (results[0].error?.closed) {
        const joined = { closed: false }
        results[0].error.closed.then(() => { joined.closed = true })
        await until(() => joined.closed, 5000)
        expect(existsSync(path.join(results[0].error.directory!, "query.mjs"))).toBe(true)
        console.log("WINDOWS_QUERY_PIPE_CLOSE_CONFIRMED " + JSON.stringify({ os: process.platform, closed: joined.closed, files: results[0].error.directory }))
        rmSync(results[0].error.directory!, { recursive: true, force: true })
      }
      rmSync(dir, { recursive: true, force: true })
    }
  }
}, 45000)

async function until(check: () => boolean, timeoutMs: number) {
  const deadline = performance.now() + timeoutMs
  while (!check()) {
    if (performance.now() >= deadline) throw new Error("independent observer readiness deadline expired")
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

const OBSERVER = `
import fs from 'node:fs'; import path from 'node:path'; import {spawn} from 'node:child_process';
const {nonce} = JSON.parse(process.argv[2]); const deadline = performance.now() + 8000;
while (!fs.existsSync(nonce)) {if (performance.now() >= deadline) throw Error('held helper never started'); await new Promise(r => setTimeout(r,25))}
const record = JSON.parse(fs.readFileSync(nonce,'utf8')); const live = path.join(path.dirname(nonce),'live.json'); const reap = path.join(path.dirname(nonce),'reap');
if (process.platform === 'win32') {
  const quote = text => "'" + text.replaceAll("'", "''") + "'";
  const script = "$ErrorActionPreference='Stop'; $p=[Diagnostics.Process]::GetProcessById(" + record.pid + "); $h=$p.Handle; try {" +
    "$row=Get-CimInstance Win32_Process -Filter ('ProcessId='+$p.Id); if ((!$row.CommandLine.Contains(" + quote(JSON.stringify(nonce).slice(1,-1)) + ") -and !$row.CommandLine.Contains(" + quote(nonce) + ")) -or !$row.CommandLine.Contains(" + quote(record.file) + ")) {throw 'identity mismatch'}; " +
    "$proof=@{pid=$p.Id;startTime=$p.StartTime.ToFileTimeUtc().ToString();nonce=" + quote(nonce) + "}; " +
    "[IO.File]::WriteAllText(" + quote(live+'.tmp') + ",(ConvertTo-Json -Compress $proof)); [IO.File]::Move(" + quote(live+'.tmp') + "," + quote(live) + "); " +
    "$end=[DateTime]::UtcNow.AddSeconds(25); $killed=$false; while (!$p.WaitForExit(25)) {if (!$killed -and (Test-Path " + quote(reap) + ")) {$p.Kill(); $killed=$true}; if ([DateTime]::UtcNow -ge $end) {throw 'pinned OS handle still live'}}; $proof.exited=$true; ConvertTo-Json -Compress $proof} finally {$p.Dispose()}";
  const child=spawn('pwsh',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr); child.on('error',error=>{throw error});
  const code=await new Promise(resolve=>child.once('close',resolve)); if (code!==0) throw Error('OS observer failed: '+code);
} else {
  const stat=()=>{try {const s=fs.readFileSync('/proc/'+record.pid+'/stat','utf8').split(') ').pop().split(' '); return {state:s[0],startTime:s[19]}} catch(e) {if(e.code==='ENOENT') return; throw e}};
  const birth=stat(); const cmd=fs.readFileSync('/proc/'+record.pid+'/cmdline','utf8');
  if (!birth || birth.state==='Z' || !cmd.includes(nonce) || !cmd.includes(record.file)) throw Error('identity mismatch');
  const proof={pid:record.pid,startTime:birth.startTime,nonce}; fs.writeFileSync(live+'.tmp',JSON.stringify(proof)); fs.renameSync(live+'.tmp',live);
  const end=performance.now()+25000;
  for (;;) {const now=stat(); if (!now || now.state==='Z' || now.startTime!==birth.startTime) break;
    if(fs.existsSync(reap)) process.kill(record.pid,'SIGKILL');
    if(performance.now()>=end) throw Error('pinned process still live'); await new Promise(r=>setTimeout(r,25))}
  console.log(JSON.stringify({...proof,exited:true}));
}
`
