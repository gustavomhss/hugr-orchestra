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

test("an auth card fails without disabling the provider, since no V2 route removes its stored key", async () => {
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
  await expect(
    disconnectProvider(card, {
      directory: "/profile-b",
      failed: "Request failed",
      sdk: {} as unknown as Parameters<typeof disconnectProvider>[1]["sdk"],
      sync: {
        data: { config: { disabled_providers: ["already-disabled"] } },
        updateConfig: async (value: unknown) => {
          calls.push(value)
        },
      } as unknown as Parameters<typeof disconnectProvider>[1]["sync"],
    }),
  ).rejects.toThrow("Request failed")
  expect(calls).toEqual([])
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
