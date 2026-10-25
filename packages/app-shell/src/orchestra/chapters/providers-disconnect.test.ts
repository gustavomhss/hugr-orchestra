import { expect, test } from "bun:test"
import { createRequire } from "node:module"
import type { ProviderCard } from "./providers-data"

const babel = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
Bun.plugin({
  name: "provider-disconnect-boundary",
  setup(build) {
    build.onLoad({ filter: /providers-list\.tsx\?disconnect-test$/ }, async (args) => {
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
const { disconnectProvider }: typeof import("./providers-list") = await import(
  `${Bun.resolveSync("./providers-list.tsx", import.meta.dir)}?disconnect-test`
)

test("an auth card removes the provider's stored credentials without touching config", async () => {
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
  const config: unknown[] = []
  await disconnectProvider(card, {
    directory: "/profile-b",
    failed: "Request failed",
    sdk: {
      orchestra: {
        integrations: {
          disconnect: async (payload: unknown) => {
            calls.push(payload)
          },
        },
      },
    } as unknown as Parameters<typeof disconnectProvider>[1]["sdk"],
    sync: {
      data: { config: { disabled_providers: ["already-disabled"] } },
      updateConfig: async (value: unknown) => {
        config.push(value)
      },
    } as unknown as Parameters<typeof disconnectProvider>[1]["sync"],
  })
  expect(calls).toEqual([{ integrationID: "custom-profile", location: { directory: "/profile-b" } }])
  expect(config).toEqual([])
})

test("an auth card whose removal fails reports the failure and never disables the provider", async () => {
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
  const config: unknown[] = []
  await expect(
    disconnectProvider(card, {
      directory: "",
      failed: "Request failed",
      sdk: {
        orchestra: {
          integrations: {
            disconnect: async () => {
              throw new Error("inherited")
            },
          },
        },
      } as unknown as Parameters<typeof disconnectProvider>[1]["sdk"],
      sync: {
        data: { config: {} },
        updateConfig: async (value: unknown) => {
          config.push(value)
        },
      } as unknown as Parameters<typeof disconnectProvider>[1]["sync"],
    }),
  ).rejects.toThrow("Request failed")
  expect(config).toEqual([])
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
