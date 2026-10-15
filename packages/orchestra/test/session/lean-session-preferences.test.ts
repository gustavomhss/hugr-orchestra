import { expect } from "bun:test"
import { Effect } from "effect"
import path from "node:path"
import { Global } from "@orchestra/core/global"
import { LeanEngine } from "@orchestra/schema/lean-engine"
import { fixture } from "./lean-session.fixture"
import { provideInstance, tmpdirScoped, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { makeHttp } from "./prompt.fixture"

const it = testEffect(makeHttp())

it.instance("same resolved SessionTools executor reads real profile writes on every native call", () => Effect.gen(function* () {
  const f = yield* fixture()
  const initial = yield* f.invoke()
  expect(initial.metric).toMatchObject({ itemID: "go", engine: LeanEngine.current, orchestraProfile: f.profileID, status: "applied" })
  expect(initial.output.output).not.toContain("=== RUN")
  yield* f.preferences.update(f.owner, { itemID: "go", enabled: false })
  const disabled = yield* f.invoke()
  expect(disabled.metric).toMatchObject({ itemID: "go", status: "passthrough", reason: "item_disabled", bytes: { saved: 0 } })
  expect(disabled.output.output).toContain("=== RUN")
  expect(disabled.metric.filterProfile).toBeUndefined()
  const stored = JSON.parse(yield* f.fs.readFileString(f.file))
  expect(stored.items).toEqual({ go: false })
  yield* f.preferences.update(f.owner, { itemID: "go", enabled: true })
  expect((yield* f.invoke()).metric.status).toBe("applied")
}), 180000)

it.instance("profile master explicitly overrides legacy global off; item override remains independent", () => Effect.gen(function* () {
  const f = yield* fixture(false)
  const initial = yield* f.invoke()
  expect(initial.metric).toMatchObject({ itemID: "go", status: "passthrough", reason: "disabled", bytes: { saved: 0 } })
  yield* f.preferences.update(f.owner, { enabled: true })
  expect((yield* f.invoke()).metric.status).toBe("applied")
  yield* f.preferences.update(f.owner, { itemID: "go", enabled: false })
  expect((yield* f.invoke()).metric.reason).toBe("item_disabled")
  yield* f.preferences.update(f.owner, { itemID: "go", enabled: true })
  expect((yield* f.invoke()).metric.status).toBe("applied")
  yield* f.preferences.update(f.owner, { enabled: false })
  expect((yield* f.invoke()).metric.reason).toBe("disabled")
}), 180000)

it.instance("corrupt oversized and unreadable actual preferences preserve settled native text and flags", () => Effect.gen(function* () {
  const f = yield* fixture()
  yield* f.preferences.update(f.owner, { enabled: true })
  const valid = yield* f.fs.readFileString(f.file)
  for (const text of ["{", " ".repeat(4097)]) {
    yield* f.fs.writeFileString(f.file, text)
    const result = yield* f.invoke()
    expect(result.metric).toMatchObject({ status: "passthrough", reason: "preferences_unavailable", bytes: { saved: 0 } })
    expect(result.output.output).toContain("=== RUN")
    expect(result.metric.orchestraProfile).toBeUndefined()
    expect(yield* f.fs.readFileString(f.file)).toBe(text)
  }
  yield* f.fs.remove(f.file)
  yield* f.fs.makeDirectory(f.file)
  const refused = yield* f.invoke()
  expect(refused.metric.reason).toBe("preferences_unavailable")
  expect(refused.output.output).toContain("=== RUN")
  yield* f.fs.remove(f.file, { recursive: true })
  yield* f.fs.writeFileString(f.file, valid)
  expect((yield* f.invoke()).metric.status).toBe("applied")
}), 180000)

it.live("same native Project ID different selected directories use distinct exact owner keys in SessionTools", () => Effect.gen(function* () {
  const first = yield* tmpdirScoped()
  const second = yield* tmpdirScoped()
  const global = Global.make({ data: path.join(first, ".lean-data"), state: path.join(first, ".lean-state") })
  const a = yield* fixture(true, global).pipe(provideInstance(first))
  const b = yield* fixture(true, global).pipe(provideInstance(second))
  expect(a.owner.projectID).toBe(b.owner.projectID)
  expect(a.owner.directory).not.toBe(b.owner.directory)
  expect(a.profileID).not.toBe(b.profileID)
  yield* a.preferences.update(a.owner, { itemID: "go", enabled: false })
  expect((yield* a.invoke()).metric.reason).toBe("item_disabled")
  expect((yield* b.invoke()).metric.status).toBe("applied")
  yield* b.preferences.update(b.owner, { enabled: false })
  expect((yield* b.invoke()).metric.reason).toBe("disabled")
  yield* a.preferences.update(a.owner, { itemID: "go", enabled: true })
  expect((yield* a.invoke()).metric.status).toBe("applied")
  expect((yield* b.preferences.read(b.owner)).enabled).toBe(false)
}).pipe(Effect.provide(testInstanceStoreLayer)), 180000)
