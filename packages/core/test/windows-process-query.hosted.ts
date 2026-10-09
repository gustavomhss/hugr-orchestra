// Exact-path hosted proof; OS observations come from real Node and a pinned .NET handle/procfs identity.
import { beforeAll, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
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
fs.writeFileSync(request.nonce, JSON.stringify({pid:process.pid, nonce:request.nonce, file:import.meta.filename}));
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
  } finally { await Promise.all([held, observer]); rmSync(dir, { recursive: true, force: true }) }
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
const record = JSON.parse(fs.readFileSync(nonce,'utf8')); const live = path.join(path.dirname(nonce),'live.json');
if (process.platform === 'win32') {
  const quote = text => "'" + text.replaceAll("'", "''") + "'";
  const script = "$ErrorActionPreference='Stop'; $p=[Diagnostics.Process]::GetProcessById(" + record.pid + "); $h=$p.Handle; try {" +
    "$row=Get-CimInstance Win32_Process -Filter ('ProcessId='+$p.Id); if (!$row.CommandLine.Contains(" + quote(nonce) + ") -or !$row.CommandLine.Contains(" + quote(record.file) + ")) {throw 'identity mismatch'}; " +
    "$proof=@{pid=$p.Id;startTime=$p.StartTime.ToFileTimeUtc().ToString();nonce=" + quote(nonce) + "}; " +
    "[IO.File]::WriteAllText(" + quote(live) + ",(ConvertTo-Json -Compress $proof)); " +
    "if (!$p.WaitForExit(25000)) {throw 'pinned OS handle still live'}; $proof.exited=$true; ConvertTo-Json -Compress $proof} finally {$p.Dispose()}";
  const child=spawn('pwsh',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr); child.on('error',error=>{throw error});
  const code=await new Promise(resolve=>child.once('close',resolve)); if (code!==0) throw Error('OS observer failed: '+code);
} else {
  const stat=()=>{try {const s=fs.readFileSync('/proc/'+record.pid+'/stat','utf8').split(') ').pop().split(' '); return {state:s[0],startTime:s[19]}} catch(e) {if(e.code==='ENOENT') return; throw e}};
  const birth=stat(); const cmd=fs.readFileSync('/proc/'+record.pid+'/cmdline','utf8');
  if (!birth || birth.state==='Z' || !cmd.includes(nonce) || !cmd.includes(record.file)) throw Error('identity mismatch');
  const proof={pid:record.pid,startTime:birth.startTime,nonce}; fs.writeFileSync(live,JSON.stringify(proof));
  const end=performance.now()+25000;
  for (;;) {const now=stat(); if (!now || now.state==='Z' || now.startTime!==birth.startTime) break;
    if(performance.now()>=end) throw Error('pinned process still live'); await new Promise(r=>setTimeout(r,25))}
  console.log(JSON.stringify({...proof,exited:true}));
}
`
