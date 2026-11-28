export * as ActivityQuarantineExecutor from "./activity-quarantine-executor"

import { ActivityQuarantine } from "./activity-quarantine"

export type Target = Readonly<{ id: string; generation: string; identity: string }>
export type Facts = { original: ActivityQuarantine.Reading; quarantine: ActivityQuarantine.Reading }
export type Adapter = Readonly<{
  prepare: (target: Target, transition: ActivityQuarantine.Transition) => Promise<{
    facts: Facts
    claimant: "absent" | "present" | "unknown"
    mutation?: () => Promise<"accepted" | "refused" | "unknown">
    release?: () => Promise<void>
  } | undefined>
  reread: (target: Target) => Promise<Facts>
}>

type Result = "Verified" | "Refused" | "Unknown"
type Candidate = NonNullable<Awaited<ReturnType<Adapter["prepare"]>>>
type Prepared = Candidate & { mutation: NonNullable<Candidate["mutation"]> }

export async function execute(adapter: Adapter, target: Target, transition: ActivityQuarantine.Transition): Promise<Result> {
  if (transition === "empty") return "Refused"
  const captured = { ...target }
  const prepared = await prepare(adapter, captured, transition)
  if (!prepared) return "Refused"
  try {
    return await mutate(adapter, captured, transition, prepared)
  } finally {
    await release(prepared)
  }
}

export async function executeEmpty(
  adapter: Adapter,
  targets: readonly Target[],
  currentRows: Parameters<typeof ActivityQuarantine.emptyTargets>[0],
): Promise<Result> {
  const ids = ActivityQuarantine.emptyTargets(currentRows)
  const captured = targets.map((target) => ({ ...target }))
  if (!ids || ids.length > 16 || captured.length !== ids.length ||
      new Set(captured.map((target) => target.id)).size !== captured.length ||
      captured.some((target) => !ids.includes(target.id))) return "Refused"
  const prepared: Prepared[] = []
  try {
    for (const target of captured) {
      const item = await prepare(adapter, target, "empty")
      if (!item) return "Refused"
      prepared.push(item)
    }
    for (const [index, target] of captured.entries()) {
      const result = await mutate(adapter, target, "empty", prepared[index]!)
      if (result !== "Verified") return index === 0 ? result : "Unknown"
    }
    return "Verified"
  } finally {
    await Promise.all(prepared.map(release))
  }
}

async function prepare(adapter: Adapter, target: Target, transition: ActivityQuarantine.Transition): Promise<Prepared | undefined> {
  if (!target.id.trim() || !target.generation.trim() || !target.identity.trim()) return undefined
  try {
    const item = await adapter.prepare(target, transition)
    if (!item) return undefined
    const source = transition === "apply" ? item.facts.original : item.facts.quarantine
    const destination = transition === "apply" ? item.facts.quarantine : item.facts.original
    if (item.claimant !== "absent" || !item.mutation || source.state !== "present" || source.identity !== target.identity ||
      (transition !== "empty" && destination.state !== "absent")) {
      await release(item)
      return undefined
    }
    return { ...item, mutation: item.mutation }
  } catch {
    return undefined
  }
}

async function mutate(adapter: Adapter, target: Target, transition: ActivityQuarantine.Transition, item: Prepared): Promise<Result> {
  try {
    const result = await item.mutation()
    if (result === "refused") return "Refused"
    if (result !== "accepted") return "Unknown"
    return ActivityQuarantine.verify(transition, target.identity, await adapter.reread(target)) === "verified"
      ? "Verified"
      : "Unknown"
  } catch {
    return "Unknown"
  }
}

async function release(item: Candidate) {
  // Releasing a prepare-time handle must be attempted even for refused or uncertain operations.
  await Promise.resolve().then(() => item.release?.()).catch(() => undefined)
}
