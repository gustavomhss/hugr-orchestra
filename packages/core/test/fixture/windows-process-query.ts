export * as WindowsProcessQuery from "./windows-process-query.ts"

import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { accessSync, constants, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"

// Broker control IPC is never inherited by source. Source has its own startup IPC, disconnected
// before source imports; parent acknowledges admission before source RUN. Close requires its receipt.
const LAUNCHER = `
import {pathToFileURL} from 'node:url';
await new Promise((resolve,reject)=>{process.once('message',message=>message==='RUN' ? resolve() : reject(Error('invalid source admission'))); process.once('disconnect',()=>reject(Error('source admission lost')))});
process.disconnect(); const file=process.argv[2]; process.argv.splice(1,2,file); await import(pathToFileURL(file).href);
`
const BROKER = `
import {spawn} from 'node:child_process';
import path from 'node:path';
if (process.versions.bun || process.release.name !== 'node' || !/^\\d+\\.\\d+\\.\\d+/.test(process.versions.node ?? '')) throw Error('native Node attestation rejected');
const [file,request,until,nonce] = process.argv.slice(2);
const deadline = performance.now() + Math.max(0, Number(until) - Date.now());
const receipt=value=>new Promise((resolve,reject)=>process.send({nonce,...value},error=>error ? reject(error) : resolve()));
await receipt({type:'attested',bun:false,release:process.release.name,version:process.versions.node});
const admitted = await new Promise(resolve => {
  process.stdin.once('data',data=>resolve(data.toString()==='RUN\\n'));
  process.stdin.once('end',()=>resolve(false)); process.stdin.resume();
});
const run=admitted && performance.now() < deadline;
if (!run) {await receipt({type:'not-admitted'}); process.exitCode=1; process.stdin.destroy(); process.disconnect()}
if (run) {
  const child=spawn(process.execPath,['--experimental-strip-types',path.join(path.dirname(file),'launcher.mjs'),file,request],{stdio:['ignore','pipe','pipe','ipc'],serialization:'json',windowsHide:true,detached:true});
  const stop=()=>{process.exitCode=1; try {if(child.pid) child.kill('SIGKILL')} catch(error) {console.error(error)}};
  process.stdin.once('end',stop); process.stdin.on('error',stop);
  if (process.stdin.readableEnded) stop();
  child.on('error',error=>{console.error(error); process.exitCode=1});
  child.once('spawn',()=>{
    process.stdin.once('data',data=>{if(data.toString()!=='SOURCE\\n') return stop(); child.send('RUN',error=>{if(error) stop()})});
    receipt({type:'admitted',source:{pid:child.pid,file,nonce}}).catch(stop);
  });
  child.stdout.on('error',stop); child.stderr.on('error',stop);
  child.stdout.pipe(process.stdout,{end:false}); child.stderr.pipe(process.stderr,{end:false});
  const timer=setTimeout(stop,Math.max(0,deadline-performance.now()));
  const [code,signal]=await new Promise(resolve=>child.once('close',(code,signal)=>resolve([code,signal])));
  await receipt(child.pid ? {type:'completed',pid:child.pid,osClosed:true,stdioClosed:true,code,signal} : {type:'not-admitted'});
  clearTimeout(timer); process.stdin.removeListener('end',stop); process.stdin.destroy(); process.disconnect();
  if (signal || code!==0) {console.error('source failed: code '+code+', signal '+signal); process.exitCode=code ?? 1}
}
`

/** Resolve a candidate without spawning; invoke must attest its runtime, not trust its filename. */
export function nodeExecutable(): string {
  const explicit = process.env.OMNI_CAMPAIGN_NODE
  if (explicit && !path.isAbsolute(explicit)) throw new Error("OMNI_CAMPAIGN_NODE must be an absolute native Node path")
  const native = !process.versions.bun && process.release.name === "node" && Boolean(process.versions.node)
  const search = Object.entries(process.env).find(([key]) => key.toLowerCase() === "path")?.[1] ?? ""
  const candidates = explicit ? [explicit] : native ? [process.execPath] : search.split(path.delimiter)
    .filter(Boolean).map((dir) => path.resolve(dir.replace(/^"|"$/g, ""), process.platform === "win32" ? "node.exe" : "node"))
  const bun = process.versions.bun ? realpathSync(process.execPath) : undefined
  const errors: unknown[] = []
  for (const candidate of candidates) {
    try {
      const resolved = realpathSync(candidate)
      if (resolved === bun || !statSync(resolved).isFile()) throw new Error("not a native Node executable")
      accessSync(resolved, constants.X_OK)
      return resolved
    } catch (error) { errors.push(error) }
  }
  throw new AggregateError(errors, "native Node executable unavailable")
}

/** Own the helper until OS exit AND stdio close; a failed join retains its files for diagnosis. */
export async function invoke(source: string, decoder: string, request: readonly number[] | { nonce: string }, deadlineMs = 15000): Promise<string> {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) throw new Error("Windows process query requires a positive deadline")
  const deadline = performance.now() + deadlineMs
  const node = nodeExecutable()
  const dir = mkdtempSync(path.join(os.tmpdir(), "omni-windows-query-"))
  const file = path.join(dir, "query.mjs")
  const nonce = randomUUID()
  const state = { closed: true, failure: undefined as unknown }
  try {
    writeFileSync(file, source)
    writeFileSync(file + ".config", JSON.stringify({ node, decoder }))
    writeFileSync(path.join(dir, "broker.mjs"), BROKER)
    writeFileSync(path.join(dir, "launcher.mjs"), LAUNCHER)
    if (performance.now() >= deadline) throw new Error("Windows process query deadline expired before startup")
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(node, ["--experimental-strip-types", path.join(dir, "broker.mjs"), file, JSON.stringify(request),
        String(Date.now() + Math.max(0, deadline - performance.now())), nonce], {
        windowsHide: true, stdio: ["pipe", "pipe", "pipe", "ipc"], serialization: "json",
      })
      state.closed = false
      const closed = Promise.withResolvers<void>()
      const output = { chunks: [] as Buffer[], bytes: 0, stderr: Buffer.alloc(0), controlBytes: 0,
        attested: false, complete: false, brokerClosed: false, controlClosed: false, code: null as number | null, signal: null as string | null,
        source: undefined as { pid: number; file: string; nonce: string } | undefined, error: undefined as Error | undefined }
      const timers = { operation: undefined as ReturnType<typeof setTimeout> | undefined, cleanup: undefined as ReturnType<typeof setTimeout> | undefined }
      const fail = (error: Error) => {
        if (output.error) return
        output.error = error
        clearTimeout(timers.operation)
        timers.cleanup = setTimeout(() => reject(Object.assign(new AggregateError([output.error],
          `Windows process query OS/stdio close unconfirmed; files retained: ${dir}; PID ${child.pid}`),
          { directory: dir, helperPID: child.pid, source: output.source, brokerClosed: output.brokerClosed, closed: closed.promise,
            diagnostics: { complete: output.complete, controlClosed: output.controlClosed, bytes: output.bytes, stderr: output.stderr.toString("utf8") } })), 2000)
        try {
          if (output.attested) child.stdin!.end()
          if (!output.attested && child.pid) child.kill("SIGKILL")
        }
        catch (killError) { output.error = new AggregateError([error, killError], "Windows process query kill failed") }
      }
      child.on("error", (error) => fail(new Error(`Windows process query spawn failed: ${error.message}`, { cause: error })))
      child.stdout!.on("error", fail)
      child.stderr!.on("error", fail)
      child.stdin!.on("error", fail)
      child.stdout!.on("data", (chunk: Buffer) => {
        if (output.error) return
        if (!output.attested) return fail(new Error("Windows process query native Node attestation missing"))
        output.bytes += chunk.length
        if (output.bytes > 64 * 1024 * 1024) return fail(new Error("Windows process query stdout exceeded 64 MiB"))
        output.chunks.push(chunk)
      })
      child.on("message", (message: unknown) => {
        try {
          output.controlBytes += Buffer.byteLength(JSON.stringify(message))
          if (output.controlBytes > 12288 || typeof message !== "object" || message === null) throw new Error("invalid control budget or frame")
          const reply = message as Record<string, unknown>
          const source = reply.source as typeof output.source
          if (reply.nonce !== nonce) throw new Error("control nonce mismatch")
          if (!output.attested && reply.type === "attested" && reply.bun === false && reply.release === "node" && typeof reply.version === "string" && /^\d+\.\d+\.\d+/.test(reply.version)) {
            output.attested = true
            if (!output.error && performance.now() < deadline) child.stdin!.write("RUN\n")
            if (output.error || performance.now() >= deadline) child.stdin!.end()
            return
          }
          if (output.attested && !output.source && !output.complete && reply.type === "not-admitted") { output.complete = true; return }
          if (output.attested && !output.source && !output.complete && reply.type === "admitted" && source && Number.isSafeInteger(source.pid) && source.pid > 0 && source.file === file && source.nonce === nonce) {
            output.source = source
            if (!output.error && performance.now() < deadline) child.stdin!.write("SOURCE\n")
            if (output.error || performance.now() >= deadline) child.stdin!.end()
            return
          }
          if (output.source && !output.complete && reply.type === "completed" && reply.pid === output.source.pid && reply.osClosed === true && reply.stdioClosed === true && (reply.code === null || Number.isInteger(reply.code)) && (reply.signal === null || typeof reply.signal === "string")) {
            output.complete = true; return
          }
          throw new Error("invalid control order or runtime identity")
        } catch (error) { fail(new Error("Windows process query native Node attestation/control invalid", { cause: error })) }
      })
      child.stderr!.on("data", (chunk: Buffer) => {
        output.stderr = Buffer.concat([output.stderr, chunk.subarray(0, Math.max(0, 16384 - output.stderr.length))])
      })
      const finish = () => {
        if (!output.brokerClosed || !output.controlClosed) return
        if (output.attested && !output.complete) return fail(new Error("Windows process query broker closed without source OS/stdio completion"))
        state.closed = true
        closed.resolve()
        clearTimeout(timers.operation)
        clearTimeout(timers.cleanup)
        if (output.error) return reject(output.error)
        if (performance.now() >= deadline) return reject(new Error("Windows process query deadline expired"))
        if (output.signal || output.code !== 0) return reject(new Error(`Windows process query failed: code ${output.code}, signal ${output.signal}: ${output.stderr.toString("utf8")}`))
        if (!output.attested) return reject(new Error("Windows process query native Node attestation missing"))
        const stdout = Buffer.concat(output.chunks).toString("utf8")
        if (!stdout.trim()) return reject(new Error("Windows process query empty output"))
        if (performance.now() >= deadline) return reject(new Error("Windows process query deadline expired"))
        resolve(stdout)
      }
      child.once("disconnect", () => { output.controlClosed = true; finish() })
      child.once("close", (code, signal) => { output.brokerClosed = true; output.code = code; output.signal = signal; finish() })
      timers.operation = setTimeout(() => fail(new Error("Windows process query deadline expired")), Math.max(0, deadline - performance.now()))
    })
  } catch (error) { state.failure = error; throw error }
  finally {
    if (state.closed) {
      try { rmSync(dir, { recursive: true, force: true }) }
      catch (error) {
        throw new AggregateError(state.failure === undefined ? [error] : [state.failure, error], "Windows process query file cleanup failed")
      }
    }
  }
}
