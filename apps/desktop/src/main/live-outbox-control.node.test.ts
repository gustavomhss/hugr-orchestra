import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { test } from "node:test"

export const pragmaTrigger = (table: string) => `CREATE TRIGGER inspect_configuration BEFORE INSERT ON ${table} BEGIN SELECT CASE WHEN (SELECT synchronous FROM pragma_synchronous)!=2 THEN RAISE(ABORT,'fixture_requires_full') END; SELECT CASE WHEN (SELECT foreign_keys FROM pragma_foreign_keys)!=1 THEN RAISE(ABORT,'fixture_requires_fk') END; END`

test("runtime control uses actual Node SQLite and connection-local FULL/FK trigger observations", () => {
  assert.equal("bun" in process.versions, false)
  const sql = new DatabaseSync(":memory:")
  try {
    sql.exec("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; CREATE TABLE configuration(value TEXT)")
    sql.exec(pragmaTrigger("configuration"))
    sql.exec("INSERT INTO configuration VALUES('observed')")
    assert.equal(sql.prepare("SELECT value FROM configuration").get()?.value, "observed")
  } finally { sql.close() }
})
