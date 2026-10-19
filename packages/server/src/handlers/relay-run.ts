import path from "path"
import { lstat, readdir, realpath } from "fs/promises"
import { Location } from "@orchestra/core/location"
import { RelayConflictError, RelayNotFoundError } from "@orchestra/protocol/groups/relay-document"
import { LedgerRead } from "@orchestra/relay/ledger/read"
import { LedgerVerify } from "@orchestra/relay/ledger/verify"
import { RelayExternal } from "@orchestra/schema/relay-external"
import { Effect, Option, Schema } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

// External runs are read from `<location>/.relay/runs/<runID>/ledger.jsonl`, the only source of truth; the run ID is
// the folder name.
export const RelayRunHandler = HttpApiBuilder.group(Api, "server.relay.run", (handlers) =>
  handlers
    .handle("relay.run.list", (ctx) =>
      response(
        Effect.gen(function* () {
          const location = yield* Location.Service
          const names = yield* Effect.promise(() =>
            readdir(path.join(location.directory, ".relay", "runs")).catch(() => []),
          )
          const runs = yield* Effect.forEach(names, (name) => load(name).pipe(Effect.option))
          return runs
            .flatMap((item) => (Option.isSome(item) ? [item.value.run] : []))
            .filter((run) => ctx.query.document === undefined || run.documentID === ctx.query.document)
            .toSorted((a, b) => b.startedAt - a.startedAt)
        }),
      ),
    )
    .handle("relay.run.get", (ctx) => response(load(ctx.params.runID).pipe(Effect.map((loaded) => loaded.run))))
    .handle("relay.run.audit", (ctx) => response(audit(ctx.params.runID)))
    .handle("relay.run.ledger", (ctx) =>
      response(load(ctx.params.runID).pipe(Effect.map((loaded) => loaded.entries.slice(ctx.query.after ?? 0)))),
    ),
)

const load = Effect.fnUntraced(function* (runID: string) {
  const ledger = yield* ledgerOf(runID)
  const entries = yield* LedgerRead.entries(ledger).pipe(
    Effect.mapError(
      (error) => new RelayConflictError({ code: "ledger-invalid", message: `The run ledger cannot be read: ${error._tag}` }),
    ),
  )
  const bodies = Schema.decodeUnknownOption(Schema.Array(RelayExternal.Body))(entries)
  const run = Option.isSome(bodies) ? RelayExternal.runFromLedger(runID, bodies.value) : undefined
  if (!run)
    return yield* new RelayConflictError({
      code: "ledger-invalid",
      message: `The ledger of ${runID} is not an external run that starts with run.start.`,
    })
  // A broken chain makes its self-reported steps untrustworthy, so the run shows only that it is broken.
  const verified = yield* LedgerVerify.verify(ledger)
  if (verified.exit === 0) return { entries, run }
  return {
    entries,
    run: {
      ...run,
      status: "failed" as const,
      failing: [],
      reason: `Ledger broken: ${`${verified.stdout}${verified.stderr}`.split("\n")[0]}`,
      endedAt: run.endedAt ?? run.startedAt,
      steps: [],
    },
  }
})

// The external process records its own checks, so an intact chain proves only that nothing changed afterwards.
const audit = Effect.fnUntraced(function* (runID: string) {
  const ledger = yield* ledgerOf(runID)
  const result = yield* LedgerVerify.verify(ledger)
  const message = `${result.stdout}${result.stderr}`.split("\n")[0] ?? ""
  if (result.exit === 0)
    return {
      status: "pending" as const,
      code: "external-self-reported",
      rows: [
        { label: "Chain", value: "chain intact, self-reported" },
        { label: "Verifier", value: message },
      ],
    }
  return { status: "fail" as const, code: "ledger-broken", rows: [{ label: "Chain", value: message }] }
})

// Only an ID that can name a run folder, whose folder and ledger are not symlinks and resolve inside
// `<location>/.relay/runs`.
const ledgerOf = Effect.fnUntraced(function* (runID: string) {
  const location = yield* Location.Service
  const missing = new RelayNotFoundError({ code: "run-missing", message: `No external run ${runID}.` })
  if (!RelayExternal.RUN_ID.test(runID)) return yield* missing
  const ledger = path.join(location.directory, ".relay", "runs", runID, "ledger.jsonl")
  if (!(yield* Effect.promise(() => contained(location.directory, ledger)))) return yield* missing
  return ledger
})

async function contained(directory: string, ledger: string) {
  const stats = await Promise.all([lstat(path.dirname(ledger)), lstat(ledger)]).catch(() => undefined)
  if (!stats || stats.some((stat) => stat.isSymbolicLink()) || !stats[1].isFile()) return false
  const real = await Promise.all([realpath(ledger), realpath(directory)]).catch(() => undefined)
  return real !== undefined && real[0] === path.join(real[1], path.relative(directory, ledger))
}
