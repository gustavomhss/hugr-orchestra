import { Cause, Effect, Exit } from "effect"

const clock = performance.now()
const state = {
  count: 0, ready: false, online: false, start: false, done: false,
  terminateCalls: 0, terminateSettled: false, exited: false, timer: undefined, worker: undefined,
}
const emit = (type, payload) => {
  if (state.count++ >= 64) return
  process.stdout.write(JSON.stringify({ type, payload }) + "\n")
}
const trace = (event, facts = {}) => emit("TRACE", {
  event, atMs: performance.now() - clock, threadId: state.worker?.threadId ?? null, ...facts,
})
const errorFacts = (error) => ({
  name: error instanceof Error ? error.name.slice(0, 40) : "Unknown",
  message: String(error instanceof Error ? error.message : error).slice(0, 160),
})

async function main() {
  const { executeWithLimits } = await import(process.argv[2])
  const pattern = "^" + "(?=a+$)".repeat(2048) + "a+$"
  const code = process.argv[3] === "CPU-native"
    ? `console.log("regex-phase"); const subject = "a".repeat(8388608); /${pattern}/.test(subject); console.log("regex-completed"); return 1`
    : "return 1"
  emit("HOST_READY", { atMs: performance.now() - clock, mode: process.argv[3] })
  state.timer = setTimeout(() => emit("SNAPSHOT", {
    atMs: performance.now() - clock, ready: state.ready, online: state.online, start: state.start, done: state.done,
    terminateCalls: state.terminateCalls, terminateSettled: state.terminateSettled,
    exited: state.exited, threadId: state.worker?.threadId ?? null,
  }), 3000)
  try {
    const exit = await Effect.runPromiseExit(executeWithLimits(
      { code },
      { timeoutMs: process.argv[3] === "CPU-native" ? 1500 : undefined, maxToolCalls: undefined, maxOutputBytes: undefined },
      [],
      (worker) => {
        state.worker = worker
        trace("OBSERVE")
        worker.on("online", () => { state.online = true; trace("ONLINE") })
        worker.on("message", (message) => {
          if (message?.type === "ready") { state.ready = true; trace("READY"); return }
          if (message?.type === "log") { trace("LOG", { line: String(message.line).slice(0, 100) }); return }
          if (message?.type === "done") {
            state.done = true
            trace("DONE", { ok: message.result?.ok === true, kind: message.result?.error?.kind ?? null })
          }
        })
        worker.on("error", (error) => trace("WORKER_ERROR", errorFacts(error)))
        worker.on("exit", (code) => { state.exited = true; trace("WORKER_EXIT", { code }) })
        for (const method of ["postMessage", "terminate"]) {
          const original = worker[method]
          worker[method] = function (...args) {
            const type = method === "postMessage" && typeof args[0]?.type === "string" ? args[0].type.slice(0, 32) : null
            if (type === "start") state.start = true
            if (method === "terminate") state.terminateCalls++
            trace("METHOD_START", { method, type })
            try {
              const returned = Reflect.apply(original, this, args)
              trace("METHOD_RETURN", { method, returnedType: returned instanceof Promise ? "Promise" : typeof returned })
              if (returned instanceof Promise) returned.then(
                (value) => {
                  if (method === "terminate") state.terminateSettled = true
                  trace("METHOD_PROMISE_SETTLED", { method, status: "success", value: typeof value === "number" ? value : null })
                },
                (error) => trace("METHOD_PROMISE_SETTLED", { method, status: "failure", ...errorFacts(error) }),
              )
              return returned
            } catch (error) {
              trace("METHOD_THROW", { method, ...errorFacts(error) })
              throw error
            }
          }
        }
      },
      process.argv[4] === undefined ? undefined : new URL(process.argv[4]),
    ))
    clearTimeout(state.timer)
    emit("RESULT", Exit.isSuccess(exit) ? {
      status: "success", ok: exit.value.ok,
      value: exit.value.ok ? exit.value.value : null,
      kind: exit.value.ok ? null : exit.value.error.kind,
      toolCalls: exit.value.toolCalls.length,
    } : {
      status: "failure", interrupted: Cause.hasInterruptsOnly(exit.cause),
      reasons: exit.cause.reasons.map((reason) => reason._tag),
    })
  } finally {
    clearTimeout(state.timer)
  }
}

await main().catch((error) => {
  clearTimeout(state.timer)
  emit("FIXTURE_ERROR", errorFacts(error))
  process.exitCode = 1
})
