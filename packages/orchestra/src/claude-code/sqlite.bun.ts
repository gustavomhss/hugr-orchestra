import { Database } from "bun:sqlite"
import { immediate } from "./sqlite-transaction"

/** Auxiliary native-state database; the storage owner holds every transaction through its durability barrier. */
export function open(file: string) {
  const db = new Database(file, { create: true, strict: true })
  return {
    close: () => db.close(),
    exec: (sql: string) => db.exec(sql),
    all: <A>(sql: string) => db.query<A, []>(sql).all(),
    get: <A>(sql: string) => db.query<A, []>(sql).get() ?? undefined,
    run: (sql: string, value: string) => db.query(sql).run(value),
    immediate: <A>(work: () => A) => immediate((sql) => db.exec(sql), work),
  }
}
