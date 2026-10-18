import { expect, test } from "bun:test"
import { createRequire } from "node:module"
import type { ProviderCard } from "./providers-data"

const babel = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
Bun.plugin({
  name: "provider-disconnect-boundary",
  setup(build) {
    build.onLoad({ filter: /providers\.tsx\?disconnect-test$/ }, async (args) => {
      const source = await Bun.file(args.path.replace(/\?disconnect-test$/, "")).text()
      const node = babel("@babel/parser")
        .parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] })
        .program.body.find(
          (item: { type: string; declaration?: { id?: { name?: string } } }) =>
            item.type === "ExportNamedDeclaration" && item.declaration?.id?.name === "disconnectProvider",
        )
      if (!node) throw new Error("Production disconnect boundary not found")
      // Compile the actual exported action boundary. No DOM, component stubs, or copied action logic.
      return { contents: source.slice(node.start, node.end), loader: "ts" }
    })
  },
})
const { disconnectProvider }: typeof import("./providers") = await import(
  `${Bun.resolveSync("./providers.tsx", import.meta.dir)}?disconnect-test`
)

test("V1 custom disconnect surfaces removal/config failures and never disables after failed removal", async () => {
  const card: ProviderCard = {
    id: "custom-profile",
    base: "custom-profile",
    name: "Custom",
    connected: true,
    method: "custom",
    custom: true,
    models: [],
    disconnect: { type: "auth", custom: true },
  }
  const calls: unknown[] = []
  const state = { removeFails: true, disableFails: false }
  const remove = async (payload: unknown, options?: unknown) => {
    calls.push(["auth.remove", payload, options])
    if (state.removeFails) throw new Error("hidden-source/private-credential-path")
  }
  const input = {
    protocol: "v1" as const,
    directory: "/profile-b",
    failed: "Request failed",
    sdk: {
      client: { auth: { remove } },
      createClient: (options: unknown) => {
        calls.push(["createClient", options])
        return { auth: { remove } }
      },
    } as unknown as Parameters<typeof disconnectProvider>[1]["sdk"],
    sync: {
      data: { config: { disabled_providers: ["already-disabled"] } },
      updateConfig: async (value: unknown) => {
        calls.push(["updateConfig", value])
        if (state.disableFails) throw new Error("hidden-source/private-config-path")
      },
    } as unknown as Parameters<typeof disconnectProvider>[1]["sync"],
  }
  await expect(disconnectProvider(card, input)).rejects.toThrow("Request failed")
  expect(calls).toEqual([
    ["createClient", { directory: "/profile-b", throwOnError: true }],
    ["auth.remove", { providerID: "custom-profile" }, { throwOnError: true }],
  ])
  state.removeFails = false
  state.disableFails = true
  calls.length = 0
  await expect(disconnectProvider(card, input)).rejects.toThrow("Request failed")
  expect(calls.at(-1)).toEqual(["updateConfig", { disabled_providers: ["already-disabled", "custom-profile"] }])
  state.disableFails = false
  calls.length = 0
  await expect(disconnectProvider(card, input)).resolves.toBeUndefined()
  expect(calls).toEqual([
    ["createClient", { directory: "/profile-b", throwOnError: true }],
    ["auth.remove", { providerID: "custom-profile" }, { throwOnError: true }],
    ["updateConfig", { disabled_providers: ["already-disabled", "custom-profile"] }],
  ])
})

test("disconnect without a project is server-wide and sends no directory", async () => {
  const card: ProviderCard = {
    id: "anthropic",
    base: "anthropic",
    name: "Anthropic",
    connected: true,
    method: "credential",
    custom: false,
    models: [],
    disconnect: { type: "credentials", ids: ["credential-1"] },
  }
  const calls: unknown[] = []
  await disconnectProvider(card, {
    protocol: "v2",
    directory: "",
    failed: "Request failed",
    sdk: {
      api: {
        credential: {
          remove: async (payload: unknown) => {
            calls.push(payload)
          },
        },
      },
    } as unknown as Parameters<typeof disconnectProvider>[1]["sdk"],
    sync: { data: { config: {} } } as unknown as Parameters<typeof disconnectProvider>[1]["sync"],
  })
  expect(calls).toEqual([{ credentialID: "credential-1", location: undefined }])
})
