export * as AuthoringSqlite from "./sqlite"

// The SQLite surface the authoring store uses. `#sqlite` (package.json `imports`) resolves to sqlite.bun.ts under Bun
// and to sqlite.node.ts under Node, where the desktop server runs, as core's database adapter does. Parameters bind
// positionally.
export interface Connection {
  readonly exec: (sql: string) => void
  readonly get: <A>(sql: string, ...params: ReadonlyArray<string>) => A | undefined
  readonly all: <A>(sql: string, ...params: ReadonlyArray<string>) => A[]
  readonly run: (sql: string, ...params: ReadonlyArray<string>) => void
  // `body` between BEGIN IMMEDIATE and COMMIT; when it throws, the transaction rolls back and the error is rethrown.
  readonly immediate: <A>(body: () => A) => A
  readonly close: () => void
}
