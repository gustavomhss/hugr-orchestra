import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import { join, sep } from "node:path"
import { Arsenal } from "../src/index"
import { captureContext } from "../src/context"
import type { ArsenalContext } from "../src/contract"
import { validateArgs } from "../src/validate"
import { fixture } from "./fixture"

test("selected handler consumes a validated snapshot across lazy import, never caller mutation", async () => {
  const calls = { getter: 0 }
  const input = { id: "original", surfaces: [{ name: "User", kind: "type", signature: "type User = string" }] }
  const pending = Arsenal.execute("contract-freezer", input)
  Object.defineProperty(input, "id", { enumerable: true, get() { calls.getter++; throw new Error("unvalidated getter") } })
  input.surfaces[0].signature = "mutated after admission"
  const result = await pending
  expect(result.isError).not.toBe(true)
  expect(JSON.parse(result.content[0].text)).toMatchObject({ id: "original", surfaces: [{ signature: "type User = string" }] })
  expect(calls.getter).toBe(0)
})

test("context capture drops pure authority and freezes declared effectful authority", async () => {
  const calls: { directory: string; effect: string; frozen: boolean }[] = []
  const context: ArsenalContext = {
    directory: "/original", stateDirectory: "/state", projectID: "project",
    async authorize(request) {
      calls.push({ directory: this.directory, effect: request.effect,
        frozen: Object.isFrozen(request) && Object.isFrozen(request.paths) && Object.isFrozen(request.commands) })
    },
  }
  expect(captureContext([], context)).toBeUndefined()
  const captured = captureContext(["read"], context)
  if (!captured) throw new Error("declared read authority missing")
  context.directory = "/mutated"
  context.authorize = async () => { throw new Error("replacement authorizer reached") }
  expect(Object.isFrozen(captured)).toBe(true)
  await captured.authorize({ effect: "read", paths: ["/original/file"], commands: [] })
  await expect(captured.authorize({ effect: "process", paths: [], commands: ["git merge topic"] })).rejects.toThrow("undeclared_effect")
  expect(calls).toEqual([{ directory: "/original", effect: "read", frozen: true }])
  const effect = { reads: 0 }
  await captured.authorize({ get effect() { return ++effect.reads === 1 ? "read" : "process" }, paths: ["/original/file"], commands: [] })
  expect(effect.reads).toBe(1)
  expect(calls[1]).toEqual({ directory: "/original", effect: "read", frozen: true })
})

test("actual selected profile handler uses host snapshot despite mutation during lazy import", async () => {
  const tmp = await fixture()
  await mkdir(tmp.context.stateDirectory)
  const original = { ...tmp.context }
  const pending = Arsenal.execute("profile", { action: "set", patch: { scrutiny: "balanced" } }, tmp.context)
  tmp.context.directory = join(tmp.base, "changed-repo")
  tmp.context.stateDirectory = join(tmp.base, "changed-state")
  tmp.context.projectID = "changed-project"
  tmp.context.authorize = async () => { throw new Error("replacement authorizer reached") }
  const result = await pending.then(async (result) => {
    if (result.isError) throw new Error(result.content.map((item) => item.text).join("\n"))
    expect(await Bun.file(join(original.stateDirectory, original.projectID, "profile", "preferences.json")).json()).toMatchObject({ scrutiny: "balanced" })
    return result
  }).finally(tmp.cleanup)
  if (result.isError) throw new Error(result.content.map((item) => item.text).join("\n"))
  expect(result.isError).not.toBe(true)
  expect(JSON.parse(result.content[0].text).profile.scrutiny).toBe("balanced")
  expect(tmp.requests.length).toBeGreaterThan(0)
  expect(tmp.requests.every((request) => request.paths.every((path) => path === original.directory || path.startsWith(`${original.stateDirectory}${sep}`) || path === original.stateDirectory))).toBe(true)
  expect(tmp.requests.some((request) => request.effect === "write" && request.paths.some((path) => path.startsWith(`${original.stateDirectory}${sep}`)))).toBe(true)
})

test("actual pure registry execution never inspects supplied host context", async () => {
  const context: ArsenalContext = {
    get directory(): string { throw new Error("pure context directory read") },
    get stateDirectory(): string { throw new Error("pure context state read") },
    get projectID(): string { throw new Error("pure context project read") },
    get authorize(): ArsenalContext["authorize"] { throw new Error("pure context authorizer read") },
  }
  const result = await Arsenal.execute("contract-freezer", {
    id: "pure", surfaces: [{ name: "User", kind: "type", signature: "type User = string" }],
  }, context)
  expect(result.isError).not.toBe(true)
  expect(JSON.parse(result.content[0].text).id).toBe("pure")
})

test("malformed schemas cannot become matches through not, unions or inactive branches", () => {
  const cases = [
    [{ not: { mystery: true } }, "anything"],
    [{ anyOf: [{ mystery: true }, { type: "string" }] }, "anything"],
    [{ oneOf: [{ type: "string" }, { type: "number", minimum: "invalid" }] }, "anything"],
    [{ type: "object", additionalProperties: "false" }, { unexpected: 1 }],
    [{ type: "object", properties: { absent: { mystery: true } } }, {}],
    [{ not: { type: ["object"] } }, "anything"],
    [{ type: "array", items: { type: "string" }, uniqueItems: "yes" }, []],
    [{ type: "object", properties: { absent: { type: "string", pattern: "[" } } }, {}],
  ] as const
  cases.forEach(([schema, value]) => {
    const result = validateArgs(schema, value)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("malformed schema became valid")
    expect(result.errors.join(";")).toContain("schema")
  })
  expect(validateArgs({ not: { type: "number" } }, "anything")).toEqual({ ok: true })
  expect(validateArgs({ anyOf: [{ type: "number" }, { type: "string" }] }, "anything")).toEqual({ ok: true })
})

test("const, enum and uniqueItems use structural JSON equality with ordered arrays", () => {
  const first = { a: 1, b: { c: [2, 3], d: true } }
  const reordered = { b: { d: true, c: [2, 3] }, a: 1 }
  expect(validateArgs({ const: first }, reordered)).toEqual({ ok: true })
  expect(validateArgs({ enum: [first] }, reordered)).toEqual({ ok: true })
  expect(validateArgs({ type: "array", items: { type: "object" }, uniqueItems: true }, [first, reordered]).ok).toBe(false)
  expect(validateArgs({ const: first }, { a: 1, b: { c: [3, 2], d: true } }).ok).toBe(false)
  expect(validateArgs({ const: { a: 1 } }, Object.assign(Object.create(null), { a: 1 }))).toEqual({ ok: true })
})
