import { readEvaluationStateFile } from "./evaluation-state-io.js"
import { decodeNativeUtf8 } from "./genesis-native-io.js"
import { existsSync, mkdirSync, renameSync, rmdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { id } from "@atlas/kernel"
import { nativeKeys, nativeRecord } from "./genesis-native-format.js"

export interface EvaluationReadBudget {
  readonly id: string; readonly mode: string
  readonly limits: { readonly index_calls: number; readonly read_calls: number; readonly body_bytes_total: number }
}

/** Finite per-candidate/generation/case ledger. Contention refuses; no uncertain retry or silent reset. */
export function chargeEvaluationRead(root: string, candidate: string, generation: string, consumer: EvaluationReadBudget, operation: "index" | "read" | "body", bytes = 0): void {
  const key = id({ candidate, generation, consumer: consumer.id, mode: consumer.mode })
  const file = join(root, ".atlas", `evaluation-budget-${key}.json`), lock = `${file}.lock`, next = `${file}.next`
  mkdirSync(lock)
  try {
    const value = existsSync(file) ? JSON.parse(decodeNativeUtf8(readEvaluationStateFile(root, `evaluation-budget-${key}.json`))) : { schema: "evaluation-read-budget/v1", candidate, generation, consumer: consumer.id, mode: consumer.mode, index_calls: 0, read_calls: 0, body_bytes_total: 0 }
    const budget = nativeRecord(value, "budget")
    nativeKeys(budget, ["schema", "candidate", "generation", "consumer", "mode", "index_calls", "read_calls", "body_bytes_total"], "budget")
    if (budget.schema !== "evaluation-read-budget/v1" || budget.candidate !== candidate || budget.generation !== generation || budget.consumer !== consumer.id || budget.mode !== consumer.mode) throw new Error("evaluation-budget-identity")
    for (const field of ["index_calls", "read_calls", "body_bytes_total"]) if (!Number.isSafeInteger(budget[field]) || Number(budget[field]) < 0) throw new Error("evaluation-budget-corrupt")
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("evaluation-budget-bytes")
    const field = operation === "body" ? "body_bytes_total" : `${operation}_calls`
    const amount = Number(budget[field]) + (operation === "body" ? bytes : 1)
    if (amount > consumer.limits[field as keyof EvaluationReadBudget["limits"]]) throw new Error("evaluation-budget-exhausted")
    const updated = { ...budget, [field]: amount }
    writeFileSync(next, JSON.stringify(updated) + "\n", { flag: "wx" })
    renameSync(next, file)
  } finally { rmdirSync(lock) }
}
