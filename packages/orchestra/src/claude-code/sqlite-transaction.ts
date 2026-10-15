/** Keep both causes when SQLite cannot undo failed work or a failed COMMIT. */
export function immediate<A>(exec: (sql: string) => unknown, work: () => A) {
  exec("BEGIN IMMEDIATE")
  try {
    const result = work()
    exec("COMMIT")
    return result
  } catch (cause) {
    try {
      exec("ROLLBACK")
    } catch (rollback) {
      throw new AggregateError([cause, rollback], "Claude Code SQLite rollback failed")
    }
    throw cause
  }
}
