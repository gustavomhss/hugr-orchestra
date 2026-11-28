import { Effect } from "effect"
import { DatabaseMigration } from "../../src/database/migration"
import { run, migration } from "./migration-safety"

const file = process.argv[2]!
const selected = process.argv[3]!
const operation = process.argv[4] ?? "apply"
await run(file, (db) => DatabaseMigration[operation === "conversion" ? "applyOnly" : "apply"](db,
  operation === "conversion" ? [] : selected === "sql-mutated" ? [migration("000_base"), migration("001_A", "committed-too-early"), {
    id: "002_B", up: (tx) => Effect.gen(function* () {
      yield* tx.run("INSERT INTO note VALUES ('inflight-B')")
      yield* pause("sql-mutated")
    }),
  }] : [migration("000_base"), migration("001_A", "applied-once")], {
    backup: {
      observe: (event: { kind: string; slot?: string; nextPhase?: string }) => {
        const key = event.slot ? `${event.kind}:${event.slot}:${event.nextPhase}` : event.kind
        if (key !== selected) return Effect.void
        return pause(key)
      },
    },
  }))
console.log("migration-worker-completed")


function pause(key: string) {
  return Effect.acquireUseRelease(
    Effect.sync(() => setInterval(() => {}, 1000)),
    () => Effect.gen(function* () {
      process.stdout.write(`migration-crash-boundary:${key}\n`)
      yield* Effect.never
    }),
    (timer) => Effect.sync(() => clearInterval(timer)),
  )
}
