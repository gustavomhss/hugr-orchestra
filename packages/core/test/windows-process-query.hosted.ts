// Exact-path hosted proof: Windows pins a .NET handle; Linux observes procfs birth and uses owner-directed shutdown.
import { beforeAll, expect, test } from "bun:test"
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
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
  const marker = path.join(dir, "source-executed")
  try {
    process.env.OMNI_CAMPAIGN_NODE = alternate
    expect(WindowsProcessQuery.nodeExecutable()).toBe(alternate)
    outcome.error = await WindowsProcessQuery.invoke(`import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)},'executed'); console.log('WRONG RUNTIME SUCCESS')`, decoder, [])
      .then(() => undefined, (error: Error) => error)
    expect(existsSync(marker)).toBe(false)
    expect(outcome.error?.message).toContain("native Node attestation")
  } finally {
    if (previous === undefined) delete process.env.OMNI_CAMPAIGN_NODE
    if (previous !== undefined) process.env.OMNI_CAMPAIGN_NODE = previous
    if (!outcome.error?.message.includes("close unconfirmed")) rmSync(dir, { recursive: true, force: true })
  }
})

test("real native wrong-nonce attestation rejects before RUN and source marker stays absent", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "query-wrong-nonce-"))
  const marker = path.join(dir, "source-executed")
  const result = await harness(dir, { phase: "attested", wrongNonce: true },
    `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)},'executed'); console.log('WRONG NONCE SUCCESS')`, [], 15000)
    .then((stdout) => ({ stdout, error: undefined }), (error: Error) => ({ stdout: "", error }))
  try {
    const frame = JSON.parse(readFileSync(path.join(dir, "forwarded.json"), "utf8"))
    expect(frame.native).toBe(true)
    expect(frame.forwardedNonce).not.toBe(frame.originalNonce)
    expect(existsSync(marker)).toBe(false)
    expect(result.error?.message).toContain("attestation/control invalid")
    expect((result.error?.cause as Error)?.message).toBe("control nonce mismatch")
    console.log("QUERY_WRONG_NONCE_PROOF " + JSON.stringify({ frame, sourceExecuted: existsSync(marker), error: result.error?.message }))
  } finally {
    if (!result.error?.message.includes("close unconfirmed")) rmSync(dir, { recursive: true, force: true })
  }
})

;(["attested", "admitted"] as const).forEach((phase) => test(`absolute deadline includes measured ${phase} delay plus bounded cleanup`, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), `query-delay-${phase}-`))
  const nonce = path.join(dir, "identity.json")
  const started = performance.now()
  const held = harness(dir, { phase, gate: true }, HOLDER, { nonce }, 6000)
    .then((stdout) => ({ stdout, error: undefined }), (error: Error & { directory?: string; closed?: Promise<void> }) => ({ stdout: "", error }))
  const observer = WindowsProcessQuery.invoke(OBSERVER, decoder, { nonce }, 35000)
    .then((stdout) => ({ stdout, error: "" }), (error: Error) => ({ stdout: "", error: error.message }))
  try {
    await until(() => existsSync(path.join(dir, "ready.json")), 2000)
    await new Promise((resolve) => setTimeout(resolve, 3200))
    writeFileSync(path.join(dir, "release"), "release")
    const result = await held
    const elapsedMs = performance.now() - started
    const frame = JSON.parse(readFileSync(path.join(dir, "forwarded.json"), "utf8"))
    expect(frame.native).toBe(true)
    expect(frame.forwardedAt - frame.queuedAt).toBeGreaterThanOrEqual(3200)
    expect(result.error?.message).toContain("close unconfirmed")
    // 6 s operation + documented 2 s cleanup; 0.5 s permits hosted scheduling, not a fresh phase budget.
    expect(elapsedMs).toBeLessThan(8500)
    expect(existsSync(nonce)).toBe(true)
    console.log("QUERY_ABSOLUTE_PHASE_PROOF " + JSON.stringify({ phase, frame, elapsedMs, operationMs: 6000, cleanupMs: 2000 }))
  } finally {
    writeFileSync(path.join(dir, "release"), "release")
    writeFileSync(path.join(dir, "reap"), "owner shutdown")
    const results = await Promise.all([held, observer])
    console.log("QUERY_PHASE_EXIT_PROOF " + JSON.stringify(results))
    requireExit(results[1], dir)
    const closed = { resolved: false }
    expect(results[0].error?.closed).toBeInstanceOf(Promise)
    results[0].error!.closed!.then(() => { closed.resolved = true })
    await until(() => closed.resolved, 5000)
    rmSync(results[0].error!.directory!, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
}, 45000))

test("full 64 MiB source payload fits independently of control receipts", async () => {
  const result = await WindowsProcessQuery.invoke(`process.stdout.write(Buffer.alloc(64 * 1024 * 1024, 120))`, decoder, []).catch((error: Error) => { console.log("QUERY_CAP_DIAGNOSTIC " + JSON.stringify(error)); throw error })
  expect(Buffer.byteLength(result)).toBe(64 * 1024 * 1024)
  expect(result[0]).toBe("x")
  expect(result.at(-1)).toBe("x")
})

test("real stdout beyond byte cap rejects", async () => {
  await expect(WindowsProcessQuery.invoke(`process.stdout.write(Buffer.alloc(64 * 1024 * 1024 + 1, 120))`, decoder, []))
    .rejects.toThrow("stdout exceeded 64 MiB")
})

test("held live helper times out; independent OS birth observation confirms exit", async () => {
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
    requireExit(results[1], dir)
    if (!results[0].error.includes("close unconfirmed"))
      rmSync(dir, { recursive: true, force: true })
  }
}, 45000)

test("inherited stdout holder forces unknown close; retain files until owner shutdown and real pipe close", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "query-inherited-pipe-"))
  const nonce = path.join(dir, "identity.json")
  const held = WindowsProcessQuery.invoke(HOLDER, decoder, { nonce }, 10000)
    .then((stdout) => ({ stdout, error: undefined }), (error: Error & { directory?: string; closed?: Promise<void>; errors?: Error[] }) => ({ stdout: "", error }))
  const observer = WindowsProcessQuery.invoke(OBSERVER, decoder, { nonce }, 35000)
    .then((stdout) => ({ stdout, error: "" }), (error: Error) => ({ stdout: "", error: error.message }))
  const closure = { resolved: false, at: 0 }
  try {
    await until(() => existsSync(path.join(dir, "live.json")), 8000)
    const pinned = JSON.parse(readFileSync(path.join(dir, "live.json"), "utf8"))
    const result = await held
    expect(result.error?.message).toContain("OS/stdio close unconfirmed")
    expect(result.error?.errors?.[0]?.message).toContain("deadline expired")
    expect(result.stdout).toBe("")
    expect(result.error?.closed).toBeInstanceOf(Promise)
    result.error!.closed!.then(() => { closure.resolved = true; closure.at = Date.now() })
    const live = JSON.parse(await WindowsProcessQuery.invoke(LIVE_CHECK, decoder, { nonce }))
    expect(live).toEqual(pinned)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(closure.resolved).toBe(false)
    const files = result.error!.directory!
    expect(existsSync(path.join(files, "query.mjs"))).toBe(true)
    expect(existsSync(path.join(files, "query.mjs.config"))).toBe(true)
    expect(existsSync(path.join(files, "holder.mjs"))).toBe(true)
    console.log("WINDOWS_QUERY_UNKNOWN_CLOSE " + JSON.stringify({ os: process.platform, live, files, closed: closure.resolved, error: result.error!.message }))
  } finally {
    // The holder consumes its own shutdown request; the observer never signals a Linux PID.
    writeFileSync(path.join(dir, "reap"), "reap")
    const results = await Promise.all([held, observer])
    console.log("WINDOWS_QUERY_INHERITED_PIPE_REAP " + JSON.stringify(results))
    const proof = requireExit(results[1], dir)
    expect(results[0].error?.closed).toBeInstanceOf(Promise)
    await until(() => closure.resolved, 5000)
    expect(existsSync(path.join(results[0].error!.directory!, "query.mjs"))).toBe(true)
    console.log("WINDOWS_QUERY_PIPE_CLOSE_CONFIRMED " + JSON.stringify({ os: process.platform, proof, closed: closure.resolved, closedAt: closure.at, files: results[0].error!.directory }))
    rmSync(results[0].error!.directory!, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
}, 45000)

test("source kills broker and stays live: admission is not completion, files and unresolved close retained", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "query-broker-death-"))
  const nonce = path.join(dir, "identity.json")
  const held = WindowsProcessQuery.invoke(`
import fs from 'node:fs'; import path from 'node:path';
const nonce=JSON.parse(process.argv[2]).nonce; const dir=path.dirname(nonce);
fs.writeFileSync(nonce+'.tmp',JSON.stringify({pid:process.pid,broker:process.ppid,nonce,file:import.meta.filename})); fs.renameSync(nonce+'.tmp',nonce);
console.log(JSON.stringify({type:'completed',osClosed:true,stdioClosed:true}));
const timer=setInterval(()=>{if(fs.existsSync(path.join(dir,'reap'))) {clearInterval(timer); return}},25);
while(!fs.existsSync(path.join(dir,'kill-broker'))) await new Promise(resolve=>setTimeout(resolve,25));
process.kill(process.ppid,'SIGKILL');
`, decoder, { nonce }, 15000).then((stdout) => ({ stdout, error: undefined }),
    (error: Error & { directory?: string; helperPID?: number; source?: { pid: number; file: string; nonce: string }; brokerClosed?: boolean; closed?: Promise<void> }) => ({ stdout: "", error }))
  const observer = WindowsProcessQuery.invoke(OBSERVER, decoder, { nonce }, 35000)
    .then((stdout) => ({ stdout, error: "" }), (error: Error) => ({ stdout: "", error: error.message }))
  const closure = { resolved: false }
  const retained = { helper: undefined as string | undefined }
  try {
    await until(() => existsSync(path.join(dir, "live.json")), 8000)
    const recorded = JSON.parse(readFileSync(nonce, "utf8"))
    writeFileSync(path.join(dir, "kill-broker"), "kill")
    const result = await held
    retained.helper = result.error?.directory
    expect(result.stdout).toBe("")
    expect(result.error?.message).toContain("OS/stdio close unconfirmed")
    expect(result.error?.source?.pid).toBe(recorded.pid)
    expect(result.error?.source?.file).toBe(recorded.file)
    expect(result.error?.source?.nonce).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.error?.helperPID).toBe(recorded.broker)
    expect(result.error?.brokerClosed).toBe(true)
    result.error!.closed!.then(() => { closure.resolved = true })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(closure.resolved).toBe(false)
    expect(existsSync(path.join(result.error!.directory!, "query.mjs"))).toBe(true)
    // A fresh independent OS observation proves the admitted source survived broker termination.
    const live = JSON.parse(await WindowsProcessQuery.invoke(LIVE_CHECK, decoder, { nonce }))
    expect(live).toEqual(JSON.parse(readFileSync(path.join(dir, "live.json"), "utf8")))
    console.log("WINDOWS_QUERY_BROKER_DEATH " + JSON.stringify({ os: process.platform, live, captured: result.error!.source, closed: closure.resolved }))
  } finally {
    writeFileSync(path.join(dir, "reap"), "owner shutdown")
    const results = await Promise.all([held, observer])
    console.log("WINDOWS_QUERY_BROKER_DEATH_SHUTDOWN " + JSON.stringify(results))
    const proof = requireExit(results[1], dir)
    expect(results[0].error?.brokerClosed).toBe(true)
    expect(closure.resolved).toBe(false)
    expect(existsSync(path.join(results[0].error!.directory!, "query.mjs"))).toBe(true)
    // Independent source exit cannot replace the lost combined receipt. Retain BOTH diagnostic directories.
    console.log("WINDOWS_QUERY_BROKER_DEATH_RETAINED " + JSON.stringify({ os: process.platform, proof, combinedClose: closure.resolved,
      retainedHelper: results[0].error!.directory, retainedOracle: dir }))
  }
  expect(existsSync(path.join(retained.helper!, "query.mjs"))).toBe(true)
  expect(existsSync(path.join(dir, "live.json"))).toBe(true)
}, 45000)

async function until(check: () => boolean, timeoutMs: number) {
  const deadline = performance.now() + timeoutMs
  while (!check()) {
    if (performance.now() >= deadline) throw new Error("independent observer readiness deadline expired")
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

function requireExit(result: { stdout: string; error: string }, dir: string) {
  if (result.error) throw new Error(`OS observation unknown; diagnostic files retained at ${dir}: ${result.error}`)
  const proof = JSON.parse(result.stdout)
  expect(proof).toEqual({ ...JSON.parse(readFileSync(path.join(dir, "live.json"), "utf8")), exited: true })
  return proof
}

function harness(dir: string, plan: { phase: "attested" | "admitted"; wrongNonce?: boolean; gate?: boolean }, source: string, request: readonly number[] | { nonce: string }, budget: number) {
  writeFileSync(path.join(dir, "harness.mjs"), `
import fs from 'node:fs'; import path from 'node:path';
if(path.basename(process.argv[1] ?? '')==='broker.mjs') {
  const plan=${JSON.stringify(plan)}; const dir=${JSON.stringify(dir)}; const send=process.send;
  const publish=(name,value)=>{const file=path.join(dir,name); fs.writeFileSync(file+'.tmp',JSON.stringify(value)); fs.renameSync(file+'.tmp',file)};
  process.send=function(message,...rest) {
    if(message.type!==plan.phase) return send.call(process,message,...rest);
    const queuedAt=Date.now(); publish('ready.json',{queuedAt,type:message.type,pid:process.pid});
    const end=performance.now()+12000; const lock=new Int32Array(new SharedArrayBuffer(4));
    while(plan.gate && !fs.existsSync(path.join(dir,'release'))) {if(performance.now()>=end) throw Error('runtime harness release absent'); Atomics.wait(lock,0,0,10)}
    const frame=plan.wrongNonce ? {...message,nonce:message.nonce+'-wrong'} : message;
    publish('forwarded.json',{queuedAt,forwardedAt:Date.now(),type:message.type,originalNonce:message.nonce,forwardedNonce:frame.nonce,
      native:!process.versions.bun && process.release.name==='node' && Boolean(process.versions.node)});
    return send.call(process,frame,...rest);
  };
}
`)
  const previous = process.env.NODE_OPTIONS
  try {
    process.env.NODE_OPTIONS = `${previous ?? ""} --import=${pathToFileURL(path.join(dir, "harness.mjs")).href}`.trim()
    // invoke starts async spawn before its first await; each actual child owns this captured environment.
    return WindowsProcessQuery.invoke(source, decoder, request, budget)
  } finally {
    if (previous === undefined) delete process.env.NODE_OPTIONS
    if (previous !== undefined) process.env.NODE_OPTIONS = previous
  }
}

const HOLDER = `
import fs from 'node:fs'; import path from 'node:path'; import {spawn} from 'node:child_process';
const request = JSON.parse(process.argv[2]); const file = path.join(path.dirname(import.meta.filename),'holder.mjs');
fs.writeFileSync(file, ${JSON.stringify(`
import fs from 'node:fs'; import path from 'node:path';
const nonce=process.argv[2];
fs.writeFileSync(nonce+'.tmp',JSON.stringify({pid:process.pid,nonce,file:import.meta.filename})); fs.renameSync(nonce+'.tmp',nonce);
const timer=setInterval(()=>{if(fs.existsSync(path.join(path.dirname(nonce),'reap'))) {clearInterval(timer); return}; console.log('INHERITED STDOUT HELD')},100);
`)});
// Detached raw descriptors preserve inherited stdout on Windows.
spawn(process.execPath,[file,request.nonce],{stdio:['ignore',1,2],windowsHide:true,detached:true});
console.log('SOURCE OUTPUT IS NOT CLOSE'); setInterval(()=>{},1000);
`

const OBSERVER = `
import fs from 'node:fs'; import path from 'node:path'; import {spawn} from 'node:child_process';
const {nonce} = JSON.parse(process.argv[2]); const deadline = performance.now() + 8000;
while (!fs.existsSync(nonce)) {if (performance.now() >= deadline) throw Error('held helper never started'); await new Promise(r => setTimeout(r,25))}
const record = JSON.parse(fs.readFileSync(nonce,'utf8')); const live = path.join(path.dirname(nonce),'live.json');
if (process.platform === 'win32') {
  const quote = text => "'" + text.replaceAll("'", "''") + "'";
  const script = "$ErrorActionPreference='Stop'; $p=[Diagnostics.Process]::GetProcessById(" + record.pid + "); $h=$p.Handle; try {" +
    "$row=Get-CimInstance Win32_Process -Filter ('ProcessId='+$p.Id); if ((!$row.CommandLine.Contains(" + quote(JSON.stringify(nonce).slice(1,-1)) + ") -and !$row.CommandLine.Contains(" + quote(nonce) + ")) -or !$row.CommandLine.Contains(" + quote(record.file) + ")) {throw 'identity mismatch'}; " +
    "$proof=@{pid=$p.Id;startTime=$p.StartTime.ToFileTimeUtc().ToString();nonce=" + quote(nonce) + "}; " +
    "[IO.File]::WriteAllText(" + quote(live+'.tmp') + ",(ConvertTo-Json -Compress $proof)); [IO.File]::Move(" + quote(live+'.tmp') + "," + quote(live) + "); " +
    "if (!$p.WaitForExit(25000)) {throw 'pinned OS handle still live'}; $proof.exited=$true; ConvertTo-Json -Compress $proof} finally {$p.Dispose()}";
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
    if(performance.now()>=end) throw Error('observed process still live'); await new Promise(r=>setTimeout(r,25))}
  console.log(JSON.stringify({...proof,exited:true}));
}
`

const LIVE_CHECK = `
import fs from 'node:fs'; import path from 'node:path'; import {spawn} from 'node:child_process';
const {nonce}=JSON.parse(process.argv[2]); const pinned=JSON.parse(fs.readFileSync(path.join(path.dirname(nonce),'live.json'),'utf8'));
if(process.platform==='win32') {
  const child=spawn('pwsh',['-NoProfile','-NonInteractive','-Command',"$p=[Diagnostics.Process]::GetProcessById("+pinned.pid+"); try {if ($p.HasExited -or $p.StartTime.ToFileTimeUtc().ToString() -ne '"+pinned.startTime+"') {throw 'source identity not live'}; 'LIVE'} finally {$p.Dispose()}"],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  const out={stdout:'',stderr:''}; child.stdout.on('data',chunk=>out.stdout+=chunk); child.stderr.on('data',chunk=>out.stderr+=chunk);
  child.on('error',error=>{throw error}); const code=await new Promise(resolve=>child.once('close',resolve)); if(code!==0 || out.stdout.trim()!=='LIVE') throw Error('source identity not live: '+out.stderr);
} else {
  const stat=fs.readFileSync('/proc/'+pinned.pid+'/stat','utf8').split(') ').pop().split(' ');
  if(stat[0]==='Z' || stat[19]!==pinned.startTime) throw Error('source identity not live');
}
console.log(JSON.stringify(pinned));
`
