import { Database } from "bun:sqlite"
import type { AuthoringSqlite } from "./sqlite"

// The only file in the engine that may use a Bun API (test/runtime.test.ts).
export const connect = (file: string): AuthoringSqlite.Connection => {
  const db = new Database(file, { create: true, strict: true })
  return {
    exec: (sql) => db.run(sql),
    get: <A>(sql: string, ...params: ReadonlyArray<string>) => db.query<A, string[]>(sql).get(...params) ?? undefined,
    all: <A>(sql: string, ...params: ReadonlyArray<string>) => db.query<A, string[]>(sql).all(...params),
    run: (sql, ...params) => {
      db.query(sql).run(...params)
    },
    immediate: (body) => db.transaction(body).immediate(),
    close: () => db.close(),
  }
}
