import { expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { CapabilityConnectionTable } from "../src/capability/sql"
import { CapabilityConnectionManagementFixture } from "./fixture/capability-connection-management"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionManagementFixture.layer)

it.live("management projects only nonempty bounded labels, never private connection/target/credential material", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionManagementFixture.fixture()
  yield* Effect.forEach(["", "x".repeat(128), "x".repeat(129)], (label) => Effect.gen(function* () {
    yield* f.database.db.update(CapabilityConnectionTable).set({ label }).where(eq(CapabilityConnectionTable.id, f.parent.id)).run()
    const read = yield* f.run(f.management.get(f.parent.id))
    const page = yield* f.run(f.management.list(CapabilityConnectionManagementFixture.placement, {}))
    expect(read).toEqual({ connection: f.parent, state: "active", credential: "present",
      ...(label.length === 128 ? { label } : {}) })
    expect(page.items).toEqual([read])
    ;[read, page].forEach((value) => {
      expect(JSON.stringify(value)).not.toContain(CapabilityConnectionManagementFixture.secret)
      expect(JSON.stringify(value)).not.toContain(f.credentialID)
      expect(Object.keys(read).sort()).toEqual(label.length === 128 ? ["connection", "credential", "label", "state"]
        : ["connection", "credential", "state"])
    })
  }))
}))
