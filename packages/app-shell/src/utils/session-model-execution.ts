import type { makeModelExecutionQuery } from "@orchestra/client"

type Execute = Parameters<typeof makeModelExecutionQuery>[0]["execute"]
const executions = new WeakMap<object, Execute>()

export function registerSessionModelExecution(api: object, execute: Execute) {
  executions.set(api, execute)
}

export function modelExecutionForSession(api: object) {
  return executions.get(api)
}

export function inheritSessionModelExecution(from: object, to: object) {
  const execute = executions.get(from)
  if (execute) executions.set(to, execute)
}
