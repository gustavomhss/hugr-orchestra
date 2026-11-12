import { beforeAll, expect, spyOn, test } from "bun:test"
import { createComponent, render } from "solid-js/web"
import { createStore } from "solid-js/store"
import { Schema } from "effect"
import { ModelExecution } from "@orchestra/schema/model-execution"
import { createSourceFile, isCallExpression, isFunctionDeclaration, isIdentifier, isObjectLiteralExpression, isPropertyAssignment, isVariableStatement, ScriptKind, ScriptTarget } from "typescript"
import type { ModelSelection } from "@/context/local"
import type { PromptInputV2SelectControl } from "@orchestra/session-ui/v2/prompt-input/interaction"
import type { PromptInputV2StoreInput } from "@orchestra/session-ui/v2/prompt-input/store"
import type { useLanguage } from "@/context/language"
import { solidDom } from "./solid-dom"
import { composer, decision, json, model, ref, selection, send, transport, wait } from "./model-execution-consumer.fixture"

const consumer = Bun.resolveSync("../src/components/prompt-input-v2.tsx", import.meta.dir)
beforeAll(() => {
  Bun.plugin({ name: "actual-app-variant-config", setup(build) {
    build.onLoad({ filter: /prompt-input-v2\.tsx\?variant-intent-acceptance$/ }, async () => {
      const source = createSourceFile(consumer, await Bun.file(consumer).text(), ScriptTarget.Latest, true, ScriptKind.TSX)
      const component = (name: string) => {
        const node = source.statements.find((value) => isFunctionDeclaration(value) && value.name?.text === name)
        if (!node || !isFunctionDeclaration(node) || !node.body) throw new Error(`Missing actual ${name}`)
        return node.body
      }
      const variable = (body: { statements: readonly import("typescript").Statement[] }, name: string) => {
        const statement = body.statements.find((value) => isVariableStatement(value) && value.declarationList.declarations.some((entry) => isIdentifier(entry.name) && entry.name.text === name))
        if (!statement || !isVariableStatement(statement)) throw new Error(`Missing actual variable ${name}`)
        return statement
      }
      const constructor = variable(component("usePromptInputV2Controller"), "controller").declarationList.declarations[0]!.initializer
      if (!constructor || !isCallExpression(constructor)) throw new Error("Actual controller call missing")
      const config = constructor.arguments[0]
      if (!config || !isObjectLiteralExpression(config)) throw new Error("Actual controller config missing")
      const property = (object: typeof config, name: string) => {
        const node = object.properties.find((value) => isPropertyAssignment(value) && isIdentifier(value.name) && value.name.text === name)
        if (!node || !isPropertyAssignment(node) || !isObjectLiteralExpression(node.initializer)) throw new Error(`Missing actual ${name} object`)
        return node.initializer
      }
      const variant = property(property(config, "view"), "variant")
      const body = component("PromptInputV2Composer")
      // Extract unchanged production statements/config, rather than recoding variant selection or labels.
      return { loader: "ts", contents: `
        import { createMemo } from "solid-js"
        import { createPromptInputV2Controller } from "@orchestra/session-ui/v2/prompt-input/interaction"
        ${variable(source, "modelDefaultVariantID").getFullText(source)}
        export function mount(selection, language, store) {
          const props = { controls: { model: { selection } } }
          ${variable(component("usePromptInputV2Controller"), "variants").getFullText(source)}
          const controller = createPromptInputV2Controller({ store, commands: () => [], context: () => [], searchContextFiles: () => [],
            view: { variant: ${variant.getText(source)}, submit: { stopping: () => false, onSubmit() {}, onStop() {} } } })
          return wrap(controller, language)
        }
        function wrap(controller, language) {
          const props = { controller }
          ${variable(body, "variant").getFullText(source)}
          ${variable(body, "view").getFullText(source)}
          return view.variant
        }
      ` }
    })
  } })
})

async function menu(model: ModelSelection) {
  const actual: { mount(model: ModelSelection, language: ReturnType<typeof useLanguage>, store: PromptInputV2StoreInput): PromptInputV2SelectControl } = await import(`${consumer}?variant-intent-acceptance`)
  const select: typeof import("@orchestra/session-ui/v2/prompt-input") = await import(solidDom("@orchestra/session-ui/v2/prompt-input", import.meta.dir))
  const language: typeof import("../src/context/language") = await import(solidDom("../src/context/language.tsx", import.meta.dir))
  const platform: typeof import("../src/context/platform") = await import(solidDom("../src/context/platform.tsx", import.meta.dir))
  const host = document.createElement("div")
  document.body.append(host)
  const state: { control?: PromptInputV2SelectControl } = {}
  function Probe() {
    state.control = actual.mount(model, language.useLanguage(), createStore({ prompt: [], context: { items: [] } }))
    return createComponent(select.PromptInputV2Select, { title: "Variant choice", get options() { return state.control!.options() },
      get current() { return state.control!.current() }, onSelect: (id) => state.control!.onSelect(id) })
  }
  const dispose = render(() => createComponent(platform.PlatformProvider, { value: { platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} },
    get children() { return createComponent(language.LanguageProvider, { locale: "en", get children() { return createComponent(Probe, {}) } }) } }), host)
  if (!state.control) { dispose(); host.remove(); throw new Error("Actual variant consumer did not mount") }
  return { host, control: state.control, dispose: () => { dispose(); host.remove() }, async open() {
    const button = host.querySelector("button")
    if (!button) throw new Error("Actual variant trigger missing")
    button.focus()
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
    await wait(() => document.querySelectorAll('[role="menuitemradio"]').length > 0, "actual shared variant menu opened")
    return [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
  } }
}

async function knownDefault() {
  const calls = transport({ reply: async (request) => {
    const input = Schema.decodeUnknownSync(ModelExecution.Input)(await request.clone().json())
    return json({ location: { directory: calls.directory }, data: decision("ready", input.model?.variant) })
  } })
  const owner = selection(calls, "session-1")
  owner.local.model.set({ providerID: ref.providerID, modelID: ref.id })
  owner.setView("catalog", "all", (catalog) => {
    const provider = catalog.get(ref.providerID)!
    return new Map(catalog).set(ref.providerID, { ...provider, models: { ...provider.models,
      [ref.id]: { ...provider.models[ref.id]!, variants: { ...provider.models[ref.id]!.variants, default: {} } } } })
  })
  await wait(() => owner.local.model.execution.ready(), "real Local canonical view ready")
  return { calls, owner }
}

test("E6 App actual variant controller and menu distinguish model default from literal default in SDK payloads", async () => {
  const { calls, owner } = await knownDefault()
  const sender = composer("default payload", { model: owner.local.model })
  const mounted = await menu(owner.local.model)
  try {
    const rows = await mounted.open()
    const modelDefault = rows.find((row) => row.textContent?.trim() === "Model default")
    const literalDefault = rows.find((row) => row.textContent?.includes("default") && row !== modelDefault)
    expect(modelDefault).toBeDefined()
    expect(literalDefault).toBeDefined()
    expect(mounted.control.options().map((option) => option.id)).toContain(JSON.stringify(["variant", "default"]))
    modelDefault!.click()
    await wait(() => owner.local.model.intent().variant === null, "actual model-default callback writes explicit null intent")
    expect(await send(sender)).toBe(true)
    expect(calls.calls.filter((call) => call.path.endsWith("/model")).at(-1)?.body).toEqual({ model: ref })
    const namedRows = await mounted.open()
    namedRows.find((row) => row.textContent?.includes("default") && row.textContent?.trim() !== "Model default")!.click()
    await wait(() => owner.local.model.intent().variant === "default", "actual named callback preserves literal default")
    sender.prompt.set([{ type: "text", content: "literal payload", start: 0, end: 15 }], 15)
    expect(await send(sender)).toBe(true)
    expect(calls.calls.filter((call) => call.path.endsWith("/model")).at(-1)?.body).toEqual({ model: { ...ref, variant: "default" } })
  } finally { mounted.dispose(); sender.dispose(); owner.dispose() }
})

test("E6 App actual variant menu retains a removed literal as disabled and refuses a direct callback", async () => {
  const { calls, owner } = await knownDefault()
  owner.local.model.variant.set("removed")
  calls.control.reply = () => json({ location: { directory: calls.directory }, data: ModelExecution.Response.make({
    ...decision("unavailable", "removed"), models: [{ model, status: "unavailable", reason: "variant-unavailable", engine: "orchestra" }],
  }) })
  await wait(() => {
    const view = owner.local.model.execution.read()
    return owner.local.model.intent().variant === "removed" && view.status === "ready" &&
      view.response.data.selection?.status === "unavailable" && view.response.data.selection.ref.variant === "removed"
  }, "current exact removed variant refusal")
  const mounted = await menu(owner.local.model)
  const selecting = spyOn(owner.local.model.variant, "set")
  try {
    const rows = await mounted.open()
    const removed = rows.find((row) => row.textContent?.includes("removed"))
    expect(removed).toBeDefined()
    expect(removed?.getAttribute("aria-disabled")).toBe("true")
    removed!.click()
    mounted.control.onSelect(JSON.stringify(["variant", "removed"]))
    expect(selecting.mock.calls).toHaveLength(0)
    expect(owner.local.model.intent().variant).toBe("removed")
    const modelDefault = rows.find((row) => row.textContent?.trim() === "Model default")
    const high = rows.find((row) => row.textContent?.includes("high"))
    expect(modelDefault?.getAttribute("aria-disabled")).not.toBe("true")
    expect(high?.getAttribute("aria-disabled")).not.toBe("true")
    const beforeHigh = calls.queries().length
    high!.click()
    await wait(() => owner.local.model.intent().variant === "high" && calls.queries().length > beforeHigh, "known choice remains an intent correction and queries freshly")
    expect(calls.queries().at(-1)?.body).toMatchObject({ model: { ...ref, variant: "high" } })
    expect(calls.admissions()).toEqual([])
    const correctionRows = await mounted.open()
    const beforeDefault = calls.queries().length
    correctionRows.find((row) => row.textContent?.trim() === "Model default")!.click()
    await wait(() => owner.local.model.intent().variant === null && calls.queries().length > beforeDefault, "actual model default remains an intent correction")
    expect(calls.admissions()).toEqual([])
    expect(selecting.mock.calls).toEqual([["high"], [undefined]])
  } finally { selecting.mockRestore(); mounted.dispose(); owner.dispose() }
})
