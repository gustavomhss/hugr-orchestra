/** @jsxImportSource @opentui/solid */
import { expect, spyOn, test } from "bun:test"
import { reconcile } from "solid-js/store"
import { Schema } from "effect"
import { Model } from "@orchestra/schema/model"
import { ModelExecution } from "@orchestra/schema/model-execution"
import { json } from "../../../fixture/tui-sdk"
import { decision, model, mount, ref, wait } from "./model-execution-consumer.fixture"

const key = `${ref.providerID}/${ref.id}`
const namedDefault = Model.Info.make({ ...model, variants: [
  { id: Model.VariantID.make("default"), headers: {}, body: {} }, ...model.variants,
] })

// Explicit controlled READY decisions, not a replica of server eligibility. The generated SDK
// still serializes each request and the real Local provider, DialogVariant and Prompt consume it.
function readyReply(metadata: Model.Info) { return async (request: Request) => {
  const input = Schema.decodeUnknownSync(ModelExecution.Input)(await request.clone().json())
  const response = decision("ready", input.model?.variant)
  return json({ location: { directory: new URL(request.url).searchParams.get("location[directory]") },
    data: { ...response, models: [{ model: metadata, status: "ready", engine: "orchestra" }] } })
} }

async function preferences(file: string, predicate: (value: { variant?: Record<string, string>; variantIntent?: Record<string, unknown> }) => boolean) {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    if (await Bun.file(file).exists()) {
      const value: { variant?: Record<string, string>; variantIntent?: Record<string, unknown> } = await Bun.file(file).json()
      if (predicate(value)) return value
    }
    await Bun.sleep(10)
  }
  throw new Error("Fixture deadline: actual variant preferences persisted")
}

test.each([false, true])("E6 TUI legacy default pins once from the actual known variants; named=%s", async (named) => {
  const fixture = await mount({ preferences: { variant: { [key]: "default" } },
    catalogModel: named ? namedDefault : model, reply: readyReply(named ? namedDefault : model) })
  try {
    await wait(() => fixture.context.local.model.ready && fixture.context.local.model.intent().variant === (named ? "default" : null), "legacy preference pinned from known model metadata")
    const stored = await preferences(fixture.preferenceFile, (value) => value.variantIntent?.[key] === (named ? "default" : null))
    expect(stored.variant).toEqual({ [key]: "default" })
    expect(stored.variantIntent?.[key]).toBe(named ? "default" : null)
    fixture.prompt.set({ input: "legacy variant", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.admissions().length === 1, "actual legacy variant prompt POST")
    expect(fixture.calls.find((call) => call.path.endsWith("/model") && call.method === "POST")?.body)
      .toEqual({ model: named ? { ...ref, variant: "default" } : ref })
  } finally { await fixture.dispose() }
})

test("E6 TUI pinned named default stays literal after catalog removal and reload", async () => {
  const fixture = await mount({ preferences: { variant: { [key]: "default" } }, catalogModel: namedDefault, reply: readyReply(namedDefault) })
  try {
    await wait(() => fixture.context.local.model.intent().variant === "default" && fixture.context.local.model.ready, "named legacy preference loaded")
    await preferences(fixture.preferenceFile, (value) => value.variantIntent?.[key] === "default")
    fixture.control.catalogModel = model
    fixture.control.reply = readyReply(model)
    const actual = fixture.context.sync.data.provider[0]!.models[ref.id]!
    fixture.context.sync.set("provider", 0, "models", ref.id, "variants", reconcile({ high: actual.variants!.high! }))
    await fixture.reload()
    await wait(() => fixture.context.local.model.ready, "pinned preference reloaded without named default metadata")
    expect(fixture.context.local.model.intent().variant).toBe("default")
    expect(fixture.context.local.model.variant.current()).toBe("default")
    await wait(() => fixture.context.sync.status === "complete" && fixture.context.local.model.variant.list().includes("high") &&
      !fixture.context.local.model.variant.list().includes("default"), "actual reloaded catalog has high but no named default")
    const selecting = spyOn(fixture.context.local.model.variant, "set")
    try {
      fixture.showVariants()
      await wait(() => { void fixture.app.renderOnce(); return fixture.app.captureCharFrame().includes("Selected variant is unavailable") }, "actual removed named variant row remains visible with its reason")
      await fixture.app.renderOnce()
      expect(fixture.app.captureCharFrame()).toContain("Model default")
      expect(fixture.app.captureCharFrame()).toContain("default")
      await fixture.app.mockInput.pressEnter()
      await fixture.app.renderOnce()
      expect(selecting.mock.calls).toHaveLength(0)
      expect(fixture.context.dialog.stack).toHaveLength(1)
      expect(fixture.context.local.model.intent().variant).toBe("default")
    } finally { selecting.mockRestore(); fixture.context.dialog.clear() }
    fixture.prompt.set({ input: "removed named default", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.admissions().length === 1, "literal pinned variant reaches actual adapter")
    expect(fixture.calls.find((call) => call.path.endsWith("/model") && call.method === "POST")?.body)
      .toEqual({ model: { ...ref, variant: "default" } })
  } finally { await fixture.dispose() }
})

test("E6 TUI actual variant dialog distinguishes model default from the literal default variant", async () => {
  const fixture = await mount({ catalogModel: namedDefault, args: { model: `${ref.providerID}/${ref.id}`, variant: "default" }, reply: readyReply(namedDefault) })
  try {
    await wait(() => fixture.context.local.model.ready && fixture.context.local.model.current()?.modelID === ref.id, "CLI literal variant and READY chosen model")
    expect(fixture.context.local.model.intent().variant).toBe("default")
    fixture.showVariants()
    await wait(() => { void fixture.app.renderOnce(); return fixture.app.captureCharFrame().includes("Model default") }, "actual DialogVariant with distinct model-default and named rows")
    await fixture.app.mockInput.pressKey("up")
    await fixture.app.mockInput.pressEnter()
    await wait(() => fixture.context.local.model.intent().variant === null, "model-default row delegates undefined to real setter")
    fixture.prompt.set({ input: "explicit model default", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.admissions().length === 1 && fixture.prompt.current.input === "", "first actual prompt completed")
    expect(fixture.calls.filter((call) => call.path.endsWith("/model") && call.method === "POST").at(-1)?.body).toEqual({ model: ref })
    fixture.showVariants()
    await wait(() => { void fixture.app.renderOnce(); return fixture.app.captureCharFrame().includes("Model default") }, "second actual DialogVariant")
    await fixture.app.mockInput.pressKey("down")
    await fixture.app.mockInput.pressEnter()
    await wait(() => fixture.context.local.model.intent().variant === "default", "named row delegates exact literal default")
    fixture.prompt.set({ input: "literal named default", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.admissions().length === 2, "second actual prompt POST")
    expect(fixture.calls.filter((call) => call.path.endsWith("/model") && call.method === "POST").at(-1)?.body)
      .toEqual({ model: { ...ref, variant: "default" } })
    const stored = await preferences(fixture.preferenceFile, (value) => value.variantIntent?.[key] === "default")
    expect(stored.variantIntent?.[key]).toBe("default")
  } finally { await fixture.dispose() }
})

test("E6 TUI explicit missing CLI ref and literal default survive catalog loading until a manual choice wins", async () => {
  const fixture = await mount({ args: { model: "provider/removed", variant: "default" } })
  try {
    await wait(() => fixture.context.local.model.ready, "real CLI preference setter and async file load settled")
    expect(fixture.context.local.model.intent()).toEqual({ model: { providerID: ref.providerID, modelID: "removed" }, variant: "default" })
    expect(fixture.context.local.model.current()).toEqual({ providerID: ref.providerID, modelID: "removed" })
    await wait(() => fixture.queries().length > 0, "actual missing CLI choice canonical request")
    expect(fixture.queries().at(-1)?.body).toMatchObject({ model: { ...ref, id: "removed", variant: "default" } })
    fixture.context.local.model.set({ providerID: ref.providerID, modelID: ref.id })
    expect(fixture.context.local.model.intent().model).toEqual({ providerID: ref.providerID, modelID: ref.id })
  } finally { await fixture.dispose() }
})

test("E6 TUI invalid new preference entries do not erase a valid explicit default", async () => {
  const fixture = await mount({ preferences: { variant: { [key]: "high" }, variantIntent: { [key]: null, ignored: 3, other: false } }, reply: readyReply(model) })
  try {
    await wait(() => fixture.context.local.model.ready, "real validated preference load")
    expect(fixture.context.local.model.intent().variant).toBeNull()
    expect(fixture.context.local.model.variant.current()).toBeUndefined()
    fixture.context.local.model.variant.set(undefined)
    const stored = await preferences(fixture.preferenceFile, (value) => value.variantIntent?.[key] === null && !("ignored" in value.variantIntent) && !("other" in value.variantIntent))
    expect(stored.variantIntent).toEqual({ [key]: null })
    expect(stored.variant).toEqual({ [key]: "high" })
    fixture.context.local.model.variant.set("default")
    const named = await preferences(fixture.preferenceFile, (value) => value.variantIntent?.[key] === "default")
    expect(named.variantIntent).toEqual({ [key]: "default" })
    expect(named.variant).toEqual({ [key]: "high" })
  } finally { await fixture.dispose() }
})
