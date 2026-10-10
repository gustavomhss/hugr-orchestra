import { DatabaseSync } from "node:sqlite"
import { immediate } from "./sqlite-transaction"

/** Node/Electron counterpart of the same private SQLite transaction contract. */
export function open(file: string) {
  const db = new DatabaseSync(file)
  return {
    close: () => db.close(),
    exec: (sql: string) => db.exec(sql),
    all: <A>(sql: string) => db.prepare(sql).all() as A[],
    get: <A>(sql: string) => db.prepare(sql).get() as A | undefined,
    run: (sql: string, value: string) => db.prepare(sql).run(value),
    immediate: <A>(work: () => A) => immediate((sql) => db.exec(sql), work),
  }
}
