export * as ToolModelCapture from "./model-capture"

import type { ToolContent } from "@orchestra/schema/llm"
import { isDeepStrictEqual } from "node:util"

/** Same structural boundary as @orchestra/llm ToolOutput, without a runtime dependency. */
export interface Output {
  readonly structured: unknown
  readonly content: ReadonlyArray<ToolContent>
}

/** Host-owned execution facts. Structurally compatible with hugr-lean/core's Observation. */
export interface Observation {
  readonly source: "shell" | "other"
  readonly command: string
  readonly output: string
  readonly termination: { readonly kind: "exited"; readonly code: number } | { readonly kind: "unknown" | "timed_out" }
  readonly completeness: "complete" | "truncated" | "unknown"
  readonly presentation: "unknown" | "terminal-rendered"
}

export interface Input {
  readonly observation: Observation
  readonly textIndex: number
}

export interface Owner {
  readonly sessionID: string
  readonly callID: string
}

declare const CandidateId: unique symbol
export interface Candidate extends Input {
  readonly [CandidateId]: true
  readonly owner: Owner
  readonly template: Output
}

declare const BindingId: unique symbol
export interface Binding {
  readonly [BindingId]: true
  readonly candidate: Candidate
  /** Detached pre-hook snapshot, including structured status and media. */
  readonly baseline: Output
}

const captures = new WeakMap<object, Candidate>()
const issued = new WeakSet<object>()
const bindings = new WeakSet<object>()

/** Internal native-producer capability. Tool names and serialized metadata cannot issue it. */
export function record(carrier: Output, input: Input, owner: Owner): void {
  const part = carrier.content[input.textIndex]
  if (!Number.isSafeInteger(input.textIndex) || input.textIndex < 0 || part?.type !== "text" || part.text !== input.observation.output) return
  const template = snapshot(carrier)
  if (!template || !owner.sessionID || !owner.callID) return
  const observation = Object.freeze({ ...input.observation, termination: Object.freeze({ ...input.observation.termination }) })
  const candidate = Object.freeze({ observation, textIndex: input.textIndex, owner: Object.freeze({ ...owner }), template }) as Candidate
  issued.add(candidate)
  captures.set(carrier, candidate)
}

export const get = (carrier: object): Candidate | undefined => captures.get(carrier)
export const authentic = (candidate: Candidate): boolean => issued.has(candidate)

/** Called by the host only for this call's actual bounded policy view. */
export function bind(carrier: Output, baseline: Output, owner: Owner): Binding | undefined {
  const candidate = get(carrier)
  if (!candidate || candidate.owner.sessionID !== owner.sessionID || candidate.owner.callID !== owner.callID) return
  if (!isDeepStrictEqual(candidate.template.structured, baseline.structured)) return
  if (!isDeepStrictEqual(candidate.template.content.filter((part) => part.type === "file"), baseline.content.filter((part) => part.type === "file"))) return
  const copy = snapshot(baseline)
  if (!copy) return
  const binding = Object.freeze({ candidate, baseline: copy }) as Binding
  bindings.add(binding)
  return binding
}

export const bound = (binding: Binding): boolean => bindings.has(binding)

function snapshot(output: Output): Output | undefined {
  try {
    const copy = structuredClone(output)
    if (!plain(copy)) return undefined
    return freeze(copy)
  } catch {
    return undefined
  }
}

function plain(value: unknown, parents = new Set<object>()): boolean {
  if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value !== "object" || parents.has(value)) return false
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false
  parents.add(value)
  const valid = Object.values(value).every((child) => plain(child, parents))
  parents.delete(value)
  return valid
}

function freeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) freeze(child, seen)
  return Object.freeze(value)
}
