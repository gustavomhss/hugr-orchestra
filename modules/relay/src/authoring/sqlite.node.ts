import { DatabaseSync, type StatementSync } from "node:sqlite"
import type { AuthoringSqlite } from "./sqlite"

export const connect = (file: string): AuthoringSqlite.Connection => {
  const db = new DatabaseSync(file)
  // Prepared once per SQL text, as `query` caches them in sqlite.bun.ts.
  const statements = new Map<string, StatementSync>()
  const prepare = (sql: string) => statements.get(sql) ?? statements.set(sql, db.prepare(sql)).get(sql)!
  return {
    exec: (sql) => db.exec(sql),
    get: <A>(sql: string, ...params: ReadonlyArray<string>) => prepare(sql).get(...params) as A | undefined,
    all: <A>(sql: string, ...params: ReadonlyArray<string>) => prepare(sql).all(...params) as A[],
    run: (sql, ...params) => {
      prepare(sql).run(...params)
    },
    // `transaction(body).immediate()` in sqlite.bun.ts: the rollback runs only while a transaction is still open, so a
    // failed BEGIN is rethrown as it is.
    immediate: (body) => {
      db.exec("BEGIN IMMEDIATE")
      try {
        const result = body()
        db.exec("COMMIT")
        return result
      } catch (error) {
        if (db.isTransaction) db.exec("ROLLBACK")
        throw error
      }
    },
    close: () => db.close(),
  }
}
