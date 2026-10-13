import { expect, test } from "bun:test"
import type { NormalizedProviderListResponse } from "@orchestra/session-ui/context"
import {
  resolveDefaultModel,
  selectProviderCatalog,
  settingsProviderDirectory,
  settingsProviderOwner,
} from "./provider-catalog"
import type { ServerConnection } from "@/context/server"

const catalog = (id: string): NormalizedProviderListResponse => ({
  all: new Map([[id, { id, name: id, source: "api", env: [], options: {}, models: {} }]]),
  connected: [id],
  default: { [id]: `${id}-model` },
})

test("selects the ready catalog for an explicit directory", () => {
  const directory = catalog("directory")

  expect(
    selectProviderCatalog({
      explicit: true,
      directory: "/repo",
      catalog: { ready: true, providers: directory },
    }),
  ).toBe(directory)
})

test("returns an empty catalog while an explicit directory is unresolved", () => {
  expect(selectProviderCatalog({ explicit: true })).toEqual({ all: new Map(), connected: [], default: {} })
  expect(
    selectProviderCatalog({
      explicit: true,
      directory: "/repo",
      catalog: { ready: false, providers: catalog("directory") },
    }),
  ).toEqual({ all: new Map(), connected: [], default: {} })
})

test("uses the route catalog when it is ready", () => {
  const directory = catalog("directory")

  expect(
    selectProviderCatalog({
      explicit: false,
      directory: "/repo",
      catalog: { ready: true, providers: directory },
      global: catalog("global"),
    }),
  ).toBe(directory)
})

test("uses the global catalog only without a directory", () => {
  const global = catalog("global")

  expect(selectProviderCatalog({ explicit: false, global })).toBe(global)
  expect(
    selectProviderCatalog({
      explicit: false,
      directory: "/repo",
      catalog: { ready: false, providers: catalog("directory") },
      global,
    }),
  ).toEqual({ all: new Map(), connected: [], default: {} })
})

test("preserves an empty ready directory catalog instead of substituting another project's models", () => {
  const directory = { all: new Map(), connected: [], default: {} }
  expect(
    selectProviderCatalog({
      explicit: false,
      directory: "/empty-project",
      catalog: { ready: true, providers: directory },
      global: catalog("other-project"),
    }),
  ).toBe(directory)
})

test("uses the current server default model", () => {
  expect(resolveDefaultModel({ providerID: "openai", modelID: "gpt-5" }, "anthropic/claude")).toEqual({
    providerID: "openai",
    modelID: "gpt-5",
  })
})

test("does not use legacy config when the current server has no default", () => {
  expect(resolveDefaultModel(null, "anthropic/claude")).toBeUndefined()
})

test("uses config for legacy servers", () => {
  expect(resolveDefaultModel(undefined, "anthropic/claude")).toEqual({
    providerID: "anthropic",
    modelID: "claude",
  })
})

test("preserves nested model IDs in legacy defaults", () => {
  expect(resolveDefaultModel(undefined, "openrouter/meta-llama/llama-3.3-70b-instruct:free")).toEqual({
    providerID: "openrouter",
    modelID: "meta-llama/llama-3.3-70b-instruct:free",
  })
})

test("ignores incomplete legacy defaults", () => {
  for (const value of ["openrouter", "/model", "openrouter/", ""]) {
    expect(resolveDefaultModel(undefined, value)).toBeUndefined()
  }
})

test("settings distinguishes Home global scope from unresolved session, draft and chapter scopes", () => {
  const input = { draft: () => undefined, session: () => undefined, home: undefined }
  expect(settingsProviderDirectory({ type: "home" }, input)).toBeNull()
  expect(settingsProviderDirectory({ type: "draft", draftID: "pending" }, input)).toBeUndefined()
  expect(settingsProviderDirectory({ type: "session", sessionId: "pending" }, input)).toBeUndefined()
  expect(settingsProviderDirectory({ type: "chapter", chapter: "providers" }, input)).toBeUndefined()
  expect(settingsProviderDirectory({ type: "home" }, { ...input, home: "/selected" })).toBe("/selected")
  expect(settingsProviderDirectory({ type: "chapter", chapter: "providers" }, { ...input, home: "/selected" })).toBe(
    "/selected",
  )
  expect(settingsProviderDirectory({ type: "draft", draftID: "draft" }, { ...input, draft: () => "/draft" })).toBe(
    "/draft",
  )
  expect(
    settingsProviderDirectory({ type: "session", sessionId: "session" }, { ...input, session: () => "/session" }),
  ).toBe("/session")
  expect(settingsProviderDirectory({ type: "dir-new-sesssion", dir: "/legacy", dirBase64: "" }, input)).toBe("/legacy")
})

test("settings resolves the server and directory as one owner instead of combining Home B with current A", () => {
  const a = "server-a" as ServerConnection.Key
  const b = "server-b" as ServerConnection.Key
  const requested: Array<[ServerConnection.Key, string]> = []
  const input = {
    current: a,
    home: { server: b, directory: "/b" },
    draft: () => ({ server: b, directory: "/draft-b" }),
    session: (server: ServerConnection.Key, id: string) => {
      requested.push([server, id])
      return server === b ? "/session-b" : undefined
    },
  }
  expect(settingsProviderOwner({ type: "home" }, input)).toEqual({ server: b, directory: "/b" })
  expect(settingsProviderOwner({ type: "chapter", chapter: "providers" }, input)).toEqual({
    server: b,
    directory: "/b",
  })
  expect(settingsProviderOwner({ type: "draft", draftID: "draft" }, input)).toEqual({
    server: b,
    directory: "/draft-b",
  })
  expect(settingsProviderOwner({ type: "session", sessionId: "s", server: b }, input)).toEqual({
    server: b,
    directory: "/session-b",
  })
  expect(requested).toEqual([[b, "s"]])
  expect(settingsProviderOwner({ type: "home" }, { ...input, home: { server: b } })).toEqual({
    server: b,
    directory: null,
  })
})
