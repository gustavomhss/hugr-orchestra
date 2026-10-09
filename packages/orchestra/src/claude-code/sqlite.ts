type Value = string | number | bigint | null | Uint8Array

/** Private archive driver; a Bun global on Node does not select Bun's native module. */
export async function openDatabase(file: string) {
  const native = await (async () => {
    if (process.versions.bun) {
      const { Database } = await import("bun:sqlite")
      return new Database(file, { create: true, strict: true })
    }
    const { DatabaseSync } = await import("node:sqlite")
    return new DatabaseSync(file)
  })()
  const statements = new Set<{ finalize(): void }>()
  return {
    exec: (sql: string) => native.exec(sql),
    query<Row = Record<string, unknown>, Args extends Value[] = Value[]>(sql: string) {
      const statement = native.prepare(sql)
      if ("finalize" in statement) statements.add(statement)
      return {
        run: (...args: Args) => statement.run(...args),
        get: (...args: Args) => statement.get(...args) as Row | null | undefined,
        all: (...args: Args) => statement.all(...args) as Row[],
      }
    },
    transaction<A>(callback: () => A) {
      return { immediate() {
        native.exec("BEGIN IMMEDIATE")
        try {
          const result = callback()
          native.exec("COMMIT")
          return result
        } catch (primary) {
          try { native.exec("ROLLBACK") }
          catch (rollback) { throw new AggregateError([primary, rollback], "Private SQLite transaction and rollback failed") }
          throw primary
        }
      } }
    },
    close() {
      const errors: unknown[] = []
      for (const statement of statements) {
        try { statement.finalize() } catch (error) { errors.push(error) }
      }
      statements.clear()
      try { if ("transaction" in native) native.close(true); else native.close() } catch (error) { errors.push(error) }
      if (errors.length) throw new AggregateError(errors, "Private SQLite close failed")
    },
  }
}
