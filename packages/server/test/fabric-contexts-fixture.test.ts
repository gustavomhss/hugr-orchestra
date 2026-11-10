import { expect, test } from "bun:test"
import { lstat } from "node:fs/promises"
import { sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { FabricContextsFixture } from "./fabric-contexts-fixture"

test("FHF00 actual host graphs expose the bootstrap contract without acquiring a context on authentication failure", async () => {
  for (const mode of ["focused", "default", "embedded"] as const) {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const fixture = yield* FabricContextsFixture.make({ mode,
        ...(mode === "embedded" ? {} : { password: "synthetic-http-password" }) })
      const issued = yield* fixture.issue()
      const auth = mode === "embedded" ? issued.header : fixture.basic
      const denied = yield* fixture.request("/api/fabric/contexts")
      expect([mode, denied.status]).toEqual([mode, 401])
      const docs = yield* fixture.request("/openapi.json", { auth })
      expect([mode, docs.status]).toEqual([mode, 200])
      const document = yield* Effect.promise(() => docs.json()).pipe(Effect.flatMap(Schema.decodeUnknownEffect(
        Schema.Struct({ paths: Schema.Record(Schema.String, Schema.Unknown) }),
      )))
      expect(document.paths["/api/fabric/contexts"]).toHaveProperty("get")
      expect(document.paths["/api/fabric/contexts"]).toHaveProperty("post")
      expect(yield* fixture.database.db.all(sql`SELECT * FROM fabric_context`)).toEqual([])
      const exists = yield* Effect.promise(() => lstat(fixture.root).then(() => true, (error: unknown) => {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false
        throw error
      }))
      expect(exists).toBe(false)
    })))
  }
}, 90000)
