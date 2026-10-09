export * as WindowsProcessQuery from "./windows-process-query.ts"

import { spawn } from "node:child_process"
import { accessSync, constants, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"

/** Resolve without bootstrapping Node through Bun's Windows synchronous spawn path. */
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
  const state = { closed: true, failure: undefined as unknown }
  try {
    writeFileSync(file, source)
    writeFileSync(file + ".config", JSON.stringify({ node, decoder }))
    if (performance.now() >= deadline) throw new Error("Windows process query deadline expired before startup")
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(node, ["--experimental-strip-types", file, JSON.stringify(request)], {
        windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      })
      state.closed = false
      const output = { chunks: [] as Buffer[], bytes: 0, stderr: Buffer.alloc(0), error: undefined as Error | undefined }
      const timers = { operation: undefined as ReturnType<typeof setTimeout> | undefined, cleanup: undefined as ReturnType<typeof setTimeout> | undefined }
      const fail = (error: Error) => {
        if (output.error) return
        output.error = error
        clearTimeout(timers.operation)
        timers.cleanup = setTimeout(() => reject(new AggregateError([output.error],
          `Windows process query OS/stdio close unconfirmed; files retained: ${dir}; PID ${child.pid}`)), 2000)
        try { if (child.pid) child.kill("SIGKILL") }
        catch (killError) { output.error = new AggregateError([error, killError], "Windows process query kill failed") }
      }
      child.on("error", (error) => fail(new Error(`Windows process query spawn failed: ${error.message}`, { cause: error })))
      child.stdout.on("error", fail)
      child.stderr.on("error", fail)
      child.stdout.on("data", (chunk: Buffer) => {
        output.bytes += chunk.length
        if (output.bytes > 64 * 1024 * 1024) return fail(new Error("Windows process query stdout exceeded 64 MiB"))
        if (!output.error) output.chunks.push(chunk)
      })
      child.stderr.on("data", (chunk: Buffer) => {
        output.stderr = Buffer.concat([output.stderr, chunk.subarray(0, Math.max(0, 16384 - output.stderr.length))])
      })
      child.once("close", (code, signal) => {
        state.closed = true
        clearTimeout(timers.operation)
        clearTimeout(timers.cleanup)
        if (output.error) return reject(output.error)
        if (performance.now() >= deadline) return reject(new Error("Windows process query deadline expired"))
        if (signal || code !== 0) return reject(new Error(`Windows process query failed: code ${code}, signal ${signal}: ${output.stderr.toString("utf8")}`))
        const stdout = Buffer.concat(output.chunks).toString("utf8")
        if (!stdout.trim()) return reject(new Error("Windows process query empty output"))
        if (performance.now() >= deadline) return reject(new Error("Windows process query deadline expired"))
        resolve(stdout)
      })
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
