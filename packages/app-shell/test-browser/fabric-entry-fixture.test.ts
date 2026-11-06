import { expect, test } from "bun:test"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Schema } from "effect"
import { FabricEntryFixture } from "./fabric-entry-fixture"

test("FENF00 shared native fixture uses canonical distinct contexts and a body-read release boundary", async () => {
  const first = FabricEntryFixture.context("/managed/first")
  const second = FabricEntryFixture.context("/managed/second")
  expect(Schema.decodeUnknownSync(FabricContext.Info)(first)).toEqual(first)
  expect(Schema.decodeUnknownSync(FabricContext.Info)(second)).toEqual(second)
  expect(first.context.id).not.toBe(second.context.id)
  expect(first.location.project.id).toBe(second.location.project.id)
  expect(first.location.directory).not.toBe(second.location.directory)
  const held = FabricEntryFixture.held(200, first)
  const status = { delivered: false }
  void held.delivered.then(() => { status.delivered = true })
  const body = held.response.text()
  try {
    await held.reading
    await Promise.resolve()
    expect(status.delivered).toBe(false)
    held.release()
    expect(JSON.parse(await body)).toEqual(first)
    await held.delivered
    expect(status.delivered).toBe(true)
  } finally {
    held.release()
    await body
  }
}, 5000)
