import fs from "fs/promises"
import path from "path"
import { Effect, ManagedRuntime } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Global } from "@orchestra/core/global"
import { SkillV2 } from "@orchestra/core/skill"
import { tmpdir } from "./tmpdir"

export type Entry = { name: string; version?: string; files: string[] }
export type Reply =
  | string
  | { kind: "status"; status: number }
  | { kind: "headers" }
  | { kind: "delay"; ms: number; body: string }
  | { kind: "stream"; first: string; intervalMs?: number }

type RequestSeen = { file: string; started: number; completed?: number; cancelled?: number; chunks: number }
type Outcome =
  | { state: "settled"; skills: SkillV2.Info[] }
  | { state: "failed"; error: unknown }
  | { state: "observer-deadline" }

export function markdown(name: string, body = `# ${name}`) {
  return `---\nname: ${name}\ndescription: ${name} fixture\n---\n${body}`
}

export function sizedMarkdown(name: string, size: number) {
  const header = markdown(name, "")
  return header + "x".repeat(size - Buffer.byteLength(header))
}

/** A real local HTTP peer and private cache; no HTTP/FS service replacement or production limit seam. */
export async function remote() {
  const tmp = await tmpdir()
  const state = {
    skills: [] as Entry[],
    index: undefined as Reply | undefined,
    cleaning: false,
    gate: 0,
    gateOpened: false,
  }
  const files = new Map<string, Reply | Reply[]>()
  const requests: RequestSeen[] = []
  const pending = new Set<{ controller: AbortController; done: Promise<Outcome> }>()
  const cleanup = new Set<() => void>()
  const gate = Promise.withResolvers<void>()
  const cancelled = Promise.withResolvers<void>()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0, // The peer must not supply a competing 10s server-side timeout.
    async fetch(request) {
      const file = decodeURIComponent(new URL(request.url).pathname.slice("/catalog/".length))
      const seen: RequestSeen = { file, started: performance.now(), chunks: 0 }
      requests.push(seen)
      const markCancelled = () => {
        if (state.cleaning || seen.completed !== undefined || seen.cancelled !== undefined) return
        seen.cancelled = performance.now()
        cancelled.resolve()
      }
      request.signal.addEventListener("abort", markCancelled, { once: true })
      if (file !== "index.json" && state.gate > 0) {
        if (requests.filter((item) => item.file !== "index.json").length >= state.gate) {
          state.gateOpened = true
          gate.resolve()
        }
        await gate.promise
      }
      const plan = file === "index.json" ? state.index ?? JSON.stringify({ skills: state.skills }) : files.get(file)
      const reply = Array.isArray(plan) ? plan.length > 1 ? plan.shift() : plan[0] : plan
      if (reply === undefined) return new Response("missing", { status: 404 })
      if (typeof reply === "string") { seen.completed = performance.now(); return new Response(reply) }
      if (reply.kind === "status") { seen.completed = performance.now(); return new Response("fixture status", { status: reply.status }) }
      if (reply.kind === "stream") {
        const owner = { stop: () => {} }
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            seen.chunks++
            controller.enqueue(new TextEncoder().encode(reply.first))
            const timer = reply.intervalMs === undefined ? undefined : setInterval(() => {
              seen.chunks++
              controller.enqueue(new TextEncoder().encode(" "))
            }, reply.intervalMs)
            const stop = () => {
              if (timer !== undefined) clearInterval(timer)
              cleanup.delete(stop)
              // Owner shutdown also closes streams whose client already disconnected.
              try { controller.close() } catch { /* already cancelled by the peer */ }
            }
            owner.stop = stop
            cleanup.add(stop)
            request.signal.addEventListener("abort", stop, { once: true })
          },
          cancel() { markCancelled(); owner.stop() },
        }))
      }
      // A headers stall never resolves until peer cancellation or fixture disposal. Delayed tiny files do resolve.
      return await new Promise<Response>((resolve) => {
        const timer = reply.kind === "delay" ? setTimeout(() => finish(new Response(reply.body)), reply.ms) : undefined
        const finish = (response: Response) => {
          if (timer !== undefined) clearTimeout(timer)
          cleanup.delete(stop)
          seen.completed = performance.now()
          resolve(response)
        }
        const stop = () => finish(new Response(null, { status: 499 }))
        cleanup.add(stop)
        request.signal.addEventListener("abort", stop, { once: true })
      })
    },
  })
  const url = new URL("/catalog/", server.url).href
  const runtime = ManagedRuntime.make(AppNodeBuilder.build(SkillV2.node, [
    [Global.node, Global.layerWith({ cache: tmp.path })],
  ]))
  await runtime.runPromise(Effect.gen(function* () {
    const skills = yield* SkillV2.Service
    yield* skills.transform((editor) => editor.source({ type: "url", url }))
  })).catch(async (error: unknown) => {
    await runtime.dispose()
    await server.stop(true)
    await tmp[Symbol.asyncDispose]()
    throw error
  })

  const start = () => {
    const controller = new AbortController()
    const done: Promise<Outcome> = runtime.runPromise(Effect.gen(function* () {
      const skills = yield* SkillV2.Service
      yield* skills.reload()
      return yield* skills.list()
    }), { signal: controller.signal }).then(
      (skills) => ({ state: "settled" as const, skills }),
      (error: unknown) => ({ state: "failed" as const, error }),
    )
    const operation = { controller, done }
    pending.add(operation)
    void done.then(() => pending.delete(operation))
    return operation
  }

  return {
    cache: tmp.path,
    url,
    state,
    files,
    requests,
    async list() {
      const outcome = await start().done
      if (outcome.state !== "settled") throw new Error("Actual skill list did not settle successfully", { cause: outcome })
      return outcome.skills
    },
    /** Capture semantic state BEFORE observer interruption. A pending old operation is an explicit assertion witness. */
    async observe(ms: number) {
      const operation = start()
      const deadline = Promise.withResolvers<Outcome>()
      const timer = setTimeout(() => deadline.resolve({ state: "observer-deadline" }), ms)
      const began = performance.now()
      const outcome = await Promise.race([operation.done, deadline.promise])
      const cancellationCount = requests.filter((item) => item.cancelled !== undefined).length
      clearTimeout(timer)
      if (outcome.state === "observer-deadline") {
        operation.controller.abort()
        await operation.done
      }
      return { outcome, cancellationCount, elapsed: performance.now() - began }
    },
    async peerCancelled() {
      const deadline = Promise.withResolvers<boolean>()
      const timer = setTimeout(() => deadline.resolve(false), 1_000)
      const result = await Promise.race([cancelled.promise.then(() => true), deadline.promise])
      clearTimeout(timer)
      return result
    },
    async paths() {
      return (await fs.readdir(tmp.path, { recursive: true })).map((file) => file.replaceAll("\\", "/"))
    },
    async storedBytes() {
      const entries = await fs.readdir(tmp.path, { recursive: true })
      const sizes = await Promise.all(entries.filter((file) => path.basename(file) !== ".orchestra-version").map(async (file) => {
        const stat = await fs.stat(path.join(tmp.path, file))
        return stat.isFile() ? stat.size : 0
      }))
      return sizes.reduce((sum, size) => sum + size, 0)
    },
    async [Symbol.asyncDispose]() {
      state.cleaning = true
      gate.resolve()
      const operations = [...pending]
      operations.forEach((operation) => operation.controller.abort())
      try {
        await Promise.all(operations.map((operation) => operation.done))
        await runtime.dispose()
      } finally {
        ;[...cleanup].forEach((stop) => stop())
        try { await server.stop(true) } finally { await tmp[Symbol.asyncDispose]() }
      }
    },
  }
}
