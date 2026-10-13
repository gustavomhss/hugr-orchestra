import { Database } from "bun:sqlite"
import { mkdir, mkdtemp, realpath } from "node:fs/promises"
import { createRequire } from "node:module"
import { join } from "node:path"
import { isDeepStrictEqual } from "node:util"
import type { UpstreamAttribution } from "../../packages/schema/src/upstream-attribution"
import type { Denied } from "../../packages/orchestra/src/maestro/upstream-provenance"
import type { Plan } from "./archie-host-plan"
import { stopOwned, within } from "./archie-host-process"

// Offline adversarial copies only. Original DB, captured frames and provider execution remain immutable.
export async function runS14(plan: Plan, launch: typeof import("./archie-host-acceptance").launch) {
  const report = object(await Bun.file(join(plan.out, "report.json")).json())
  const positive = object(object(report.checks).d)
  requireFact(positive.pass === true, "S14_SOURCE_OBSERVER_NOT_ACCEPTED")
  const { Schema } = (await import(createRequire(join(plan.repo, "packages/orchestra/package.json")).resolve("effect"))) as typeof import("../../packages/orchestra/script/archie-host-effect")
  const { UpstreamAttribution } = (await import(join(plan.repo, "packages/schema/src/upstream-attribution.ts"))) as typeof import("../../packages/schema/src/upstream-attribution")
  const input = Schema.decodeUnknownSync(UpstreamAttribution.V2)(positive.attribution)
  requireFact(input.dispatch.kind === "claude-code-agent", "S14_SOURCE_DISPATCH_KIND_INVALID")
  const source = new Database(plan.env.ORCHESTRA_DB, { readonly: true })
  const bytes = source.serialize()
  // This capture has retained legacy messages only. A future dual projection needs explicit coordinated mutations.
  requireFact(!source.query("SELECT id FROM session_message WHERE id IN (?, ?)").get(input.parentMessageID, input.authorMessageID), "S14_SOURCE_DUAL_PROJECTION_REQUIRES_COORDINATED_MUTATIONS")
  requireFact(message(source, input.parentMessageID).agent === "maestro" && message(source, input.authorMessageID).agent === "archie", "S14_SOURCE_MESSAGE_BINDING_INVALID")
  const sourcePart = part(source, input)
  requireFact(object(sourcePart.value.metadata).providerExecuted === true, "S14_SOURCE_PROVIDER_EXECUTION_INVALID")
  requireFact(dispatch(sourcePart.value).toolUseID === input.parentCallID, "S14_SOURCE_CALL_BINDING_INVALID")
  source.close()
  const out = await mkdtemp(join(plan.out, "s14-"))
  const controls: Control[] = [
    { name: "positive", mutate: () => {} },
    { name: "notProviderExecuted", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => changePart(db, input, (value) => { object(value.metadata).providerExecuted = false }) },
    { name: "lowercaseTool", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => changePart(db, input, (value) => { value.tool = "task" }) },
    { name: "unscopedSeat", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => changePart(db, input, (value) => { object(object(value.state).input).subagent_type = "archie" }) },
    { name: "missingGrant", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => changePart(db, input, (value) => { delete dispatch(value).grantID }) },
    { name: "missingToolName", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => changePart(db, input, (value) => { delete dispatch(value).toolName }) },
    { name: "extraMetadata", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => changePart(db, input, (value) => { dispatch(value).verified = true }) },
    { name: "wrongToolUseID", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => changePart(db, input, (value) => { dispatch(value).toolUseID = `${input.parentCallID}-foreign` }) },
    { name: "wrongRawName", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => changePart(db, input, (value) => { dispatch(value).toolName = "Task" }) },
    { name: "wrongExecutor", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => changePart(db, input, (value) => { dispatch(value).executor = "orchestra" }) },
    { name: "wrongSeatEvidence", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => changePart(db, input, (value) => { dispatch(value).seat = "backend" }) },
    { name: "emptyAgentID", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => changePart(db, input, (value) => { dispatch(value).agentID = "" }) },
    { name: "background", code: "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE", message: "HOLD: claude-code-agent upstream dispatch must run in the foreground", mutate: (db) => changePart(db, input, (value) => { dispatch(value).background = true }) },
    { name: "emptyGrantRoots", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => changePart(db, input, (value) => { dispatch(value).writeRoots = [] }) },
    { name: "relativeGrantRoot", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => changePart(db, input, (value) => { dispatch(value).writeRoots = ["proposal.md"] }) },
    { name: "changedChildRoot", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => {
      const row = db.query<{ permission: string }, [string]>("SELECT permission FROM session WHERE id = ?").get(input.authorSessionID)
      requireFact(row && typeof row.permission === "string", "S14_CHILD_PERMISSION_MISSING")
      const permissions: unknown = JSON.parse(row.permission)
      requireFact(Array.isArray(permissions), "S14_CHILD_PERMISSION_INVALID")
      const changed = permissions.map((item) => { const rule = object(item); return rule.permission === "tool_safety_write_root" && rule.action === "allow" ? { ...rule, pattern: join(plan.project, "not-granted.md") } : rule })
      requireFact(!isDeepStrictEqual(permissions, changed), "S14_CHILD_ROOT_MUTATION_DID_NOT_CHANGE_DATA")
      requireFact(db.query("UPDATE session SET permission = ? WHERE id = ?").run(JSON.stringify(changed), input.authorSessionID).changes === 1, "S14_CHILD_ROOT_UPDATE_MISSING")
    } },
    { name: "notMaestro", code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", mutate: (db) => {
      const value = message(db, input.parentMessageID)
      value.agent = "general"
      requireFact(db.query("UPDATE message SET data = ? WHERE id = ?").run(JSON.stringify(value), input.parentMessageID).changes === 1, "S14_DISPATCHER_UPDATE_MISSING")
    } },
    { name: "doneWithBlocker", code: "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE", mutate: (db) => {
      const rows = db.query<{ id: string; data: string }, [string]>("SELECT id, data FROM part WHERE message_id = ? AND json_extract(data, '$.type') = 'text'").all(input.authorMessageID)
      requireFact(rows.length === 1, "S14_AUTHOR_TEXT_NOT_UNIQUE")
      const value = object(JSON.parse(rows[0].data))
      value.text = "```upstream-result\n" + JSON.stringify({ outcome: "done", artifacts: [], blockers: [{ kind: "context", reason: "S14 injected unresolved blocker" }], risks: [], nextActions: [] }) + "\n```"
      requireFact(db.query("UPDATE part SET data = ? WHERE id = ?").run(JSON.stringify(value), rows[0].id).changes === 1, "S14_AUTHOR_UPDATE_MISSING")
    } },
  ]
  const results: Record<string, unknown>[] = []
  const active: { value?: ReturnType<typeof launch> } = {}
  const cancelling: { value?: Promise<void> } = {}
  const cancel = () => { if (cancelling.value) return; cancelling.value = (active.value ? stopOwned(active.value.child, active.value.finished) : Promise.resolve()).then(() => process.exit(143), (error: unknown) => { console.error(String(error)); process.exit(1) }) }
  process.on("SIGTERM", cancel)
  process.on("SIGINT", cancel)
  // One AppRuntime process at a time: concurrent cases contend for RAM and obscure timeout attribution.
  try {
  for (const control of controls) {
    const dir = join(out, control.name)
    await mkdir(dir)
    const dbPath = join(dir, "session.sqlite")
    await Bun.write(dbPath, bytes)
    const database = new Database(dbPath)
    database.transaction(() => control.mutate(database))()
    database.close()
    const casePlan = { ...plan, out: await realpath(dir), env: { ORCHESTRA_CONFIG: plan.env.ORCHESTRA_CONFIG, ORCHESTRA_DB: dbPath, ORCHESTRA_INHERIT_CREDENTIALS: "0", ORCHESTRA_DISABLE_PROJECT_CONFIG: "true", ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "0", XDG_DATA_HOME: join(dir, "data"), XDG_CONFIG_HOME: join(dir, "config"), XDG_STATE_HOME: join(dir, "state"), XDG_CACHE_HOME: join(dir, "cache") } }
    await Promise.all(["data", "config", "state", "cache"].map((name) => mkdir(join(dir, name))))
    await Bun.write(join(dir, "plan.json"), JSON.stringify(casePlan, null, 2))
    await Bun.write(join(dir, "s14-input.json"), JSON.stringify(input, null, 2))
    const child = launch(casePlan, "s14-observe")
    active.value = child
    const receipt = await within(child.finished, 180_000)
    if (!receipt.completed) { await stopOwned(child.child, child.finished); throw new Error(`S14_OBSERVER_TIMEOUT: ${control.name}`) }
    const code = receipt.value
    active.value = undefined
    requireFact(code === 0, `S14_OBSERVER_PROCESS_FAILED: ${control.name}, exit ${code}`)
    const observed = object(await Bun.file(join(dir, "s14-observation.json")).json())
    const denied = observed.denied === undefined ? undefined : object(observed.denied)
    const pass = control.code ? denied?.code === control.code && (!control.message || denied.message === control.message) : isDeepStrictEqual(observed.attribution, input)
    results.push({ name: control.name, expectedCode: control.code, expectedMessage: control.message, pass, observed, evidence: casePlan.out })
    await Bun.write(join(out, "report.json"), JSON.stringify({ verdict: "INCOMPLETE", source: plan.env.ORCHESTRA_DB, results }, null, 2))
  }
  } finally {
    if (active.value) await stopOwned(active.value.child, active.value.finished)
    process.removeListener("SIGTERM", cancel)
    process.removeListener("SIGINT", cancel)
  }
  const passed = results.length === controls.length && results.length > 1 && results.every((result) => result.pass === true)
  const final = { verdict: passed ? "PASS" : "FAIL", scope: "S14 stored-evidence mutation matrix on copies of retained legacy S13 records; not a new provider execution or dual-projection proof", sourceDB: plan.env.ORCHESTRA_DB, sourceInput: input, controls: results, total: results.length, evidence: await realpath(out) }
  await Bun.write(join(out, "report.json"), JSON.stringify(final, null, 2))
  console.log(JSON.stringify(final))
  if (!passed) process.exitCode = 1
}

export async function observeS14(plan: Plan) {
  console.error("S14_OBSERVER_START")
  const { Effect, Schema } = (await import(createRequire(join(plan.repo, "packages/orchestra/package.json")).resolve("effect"))) as typeof import("../../packages/orchestra/script/archie-host-effect")
  console.error("S14_EFFECT_READY")
  const { UpstreamAttribution } = (await import(join(plan.repo, "packages/schema/src/upstream-attribution.ts"))) as typeof import("../../packages/schema/src/upstream-attribution")
  console.error("S14_SCHEMA_READY")
  const { AppRuntime } = (await import(join(plan.repo, "packages/orchestra/src/effect/app-runtime.ts"))) as typeof import("../../packages/orchestra/src/effect/app-runtime")
  console.error("S14_RUNTIME_READY")
  const { InstanceStore } = (await import(join(plan.repo, "packages/orchestra/src/project/instance-store.ts"))) as typeof import("../../packages/orchestra/src/project/instance-store")
  const { InstanceRef } = (await import(join(plan.repo, "packages/orchestra/src/effect/instance-ref.ts"))) as typeof import("../../packages/orchestra/src/effect/instance-ref")
  const { UpstreamProvenance } = (await import(join(plan.repo, "packages/orchestra/src/maestro/upstream-provenance.ts"))) as typeof import("../../packages/orchestra/src/maestro/upstream-provenance")
  const input = Schema.decodeUnknownSync(UpstreamAttribution.V2)(await Bun.file(join(plan.out, "s14-input.json")).json())
  console.error("S14_IMPORTS_READY")
  const result = await AppRuntime.runPromise(Effect.gen(function* () {
    const instances = yield* InstanceStore.Service
    const loaded = yield* instances.load({ directory: plan.project })
    console.error("S14_PLACEMENT_READY")
    return yield* UpstreamProvenance.observe({ ...input, dispatchKind: "claude-code-agent" }).pipe(
      Effect.provideService(InstanceRef, loaded),
      Effect.match({ onSuccess: (attribution) => ({ attribution }), onFailure: (error) => ({ denied: { code: error.code, message: error.message } }) }),
    )
  }))
  await Bun.write(join(plan.out, "s14-observation.json"), JSON.stringify(result, null, 2))
  await AppRuntime.dispose()
  process.exit(0)
}

type Control = { name: string; code?: Denied["code"]; message?: string; mutate: (database: Database) => void }

function requireFact(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

function object(value: unknown): Record<string, unknown> {
  requireFact(typeof value === "object" && value !== null && !Array.isArray(value), "S14_RECORD_INVALID")
  return value as Record<string, unknown>
}

function message(database: Database, id: string) {
  const row = database.query<{ data: string }, [string]>("SELECT data FROM message WHERE id = ?").get(id)
  requireFact(row, `S14_MESSAGE_MISSING: ${id}`)
  return object(JSON.parse(row.data))
}

function part(database: Database, input: UpstreamAttribution.V2) {
  const rows = database.query<{ id: string; data: string }, [string, string]>("SELECT id, data FROM part WHERE message_id = ? AND json_extract(data, '$.callID') = ?").all(input.parentMessageID, input.parentCallID)
  requireFact(rows.length === 1, "S14_DISPATCH_PART_NOT_UNIQUE")
  return { id: rows[0].id, value: object(JSON.parse(rows[0].data)) }
}

function dispatch(value: Record<string, unknown>) {
  return object(object(object(value.state).metadata).claudeCodeDispatch)
}

function changePart(database: Database, input: UpstreamAttribution.V2, mutate: (value: Record<string, unknown>) => void) {
  const row = part(database, input)
  const before = JSON.stringify(row.value)
  mutate(row.value)
  requireFact(JSON.stringify(row.value) !== before, "S14_PART_MUTATION_DID_NOT_CHANGE_DATA")
  requireFact(database.query("UPDATE part SET data = ? WHERE id = ?").run(JSON.stringify(row.value), row.id).changes === 1, "S14_PART_UPDATE_MISSING")
}
