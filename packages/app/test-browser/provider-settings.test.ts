import { expect, test } from "bun:test"
import { createRequire } from "node:module"
import { createComponent, createEffect, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { insert, render } from "solid-js/web"
import { QueryClient } from "@tanstack/solid-query"

const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
const [state, setState] = createStore({
  protocol: "v2" as "v1" | "v2",
  loading: false,
  error: undefined as undefined | { cause: unknown },
})
const calls: string[] = []
const bindings: Array<[string, unknown]> = []
const selected = { type: "http" as const, http: { url: "http://server-b.test" } }
const queryClient = new QueryClient()
const discovery = {
  all: () => [],
  loading: () => state.loading,
  error: () => state.error,
  retry: () => {
    calls.push("retry")
  },
}
const container = (props: { children?: JSX.Element }) => {
  const node = document.createElement("div")
  insert(node, () => props.children)
  return node
}
const button = (props: { children?: JSX.Element; onClick?: (event: MouseEvent) => void; disabled?: boolean }) => {
  const node = document.createElement("button")
  insert(node, () => props.children)
  createEffect(() => {
    node.disabled = !!props.disabled
  })
  node.addEventListener("click", (event) => props.onClick?.(event))
  return node
}
const fixtures = {
  button: { Button: button, ButtonV2: button },
  dialog: { useDialog: () => ({ show() {}, close() {}, push() {} }) },
  language: { useLanguage: () => ({ locale: () => "en", t: (key: string) => key }) },
  providers: {
    popularProviders: ["openrouter"],
    useProviders: () => ({
      connected: () => [{ id: "openrouter", name: "OpenRouter", source: "api", models: {} }],
      all: () => new Map(),
      refresh: async () => {
        calls.push("refresh")
      },
    }),
    useProviderDiscovery: () => discovery,
  },
  sdk: {
    ServerSDKProvider: (props: { server?: () => unknown; children?: JSX.Element }) => {
      bindings.push(["sdk", props.server?.()])
      return container(props)
    },
    useServerProtocol: () => () => state.protocol,
    useServerSDK: () => () => ({
      api: {
        provider: { list: async () => ({ data: [{ id: "openrouter", integrationID: "openrouter" }] }) },
        integration: {
          list: async () => ({
            data: [
              { id: "openrouter", connections: [{ type: "credential", id: "synthetic-credential", label: "default" }] },
            ],
          }),
        },
        credential: {
          remove: async () => {
            calls.push("credential.remove")
          },
        },
      },
      client: {
        auth: {
          remove: async () => {
            calls.push("auth.remove")
          },
        },
        global: {
          dispose: async () => {
            calls.push("global.dispose")
          },
        },
      },
    }),
  },
  sync: {
    useServerSync: () => () => ({ data: { config: {} } }),
    ServerSyncProvider: (props: { server?: () => unknown; children?: JSX.Element }) => {
      bindings.push(["sync", props.server?.()])
      return container(props)
    },
  },
  global: {
    useGlobal: () => ({ settings: { server: { selected: () => selected } }, ensureServerCtx: () => ({ queryClient }) }),
  },
  settings: { useSettings: () => ({ general: { newLayoutDesigns: () => true } }) },
  models: {
    ModelsProvider: (props: { directory?: () => unknown; children?: JSX.Element }) => {
      bindings.push(["models", props.directory?.()])
      return container(props)
    },
  },
  toast: {
    showToast: () => {
      calls.push("toast")
    },
  },
  icon: { ProviderIcon: () => document.createElement("span") },
  tag: { Tag: container },
  list: { SettingsList: container },
  server: { SettingsServerScope: container, SettingsServerPicker: () => undefined },
  custom: { DialogCustomProvider: () => undefined, CustomProviderForm: () => undefined },
  spinner: { Spinner: () => document.createElement("span") },
}
const connect = `${Bun.resolveSync("../src/components/dialog-connect-provider.tsx", import.meta.dir)}?provider-settings`
const controller = `${Bun.resolveSync("../src/components/settings-v2/provider-controller.tsx", import.meta.dir)}?provider-settings`
Bun.plugin({
  name: "provider-settings-fixtures",
  setup(build) {
    build.onResolve({ filter: /^provider-settings:/ }, (args) => ({
      path: args.path.slice("provider-settings:".length),
      namespace: "provider-settings",
    }))
    build.onLoad({ filter: /.*/, namespace: "provider-settings" }, (args) => ({
      loader: "object",
      exports: fixtures[args.path as keyof typeof fixtures],
    }))
    build.onLoad(
      {
        filter:
          /(?:settings-providers|settings-server-picker|provider-controller|dialog-connect-provider)\.tsx\?provider-settings$/,
      },
      async (args) => {
        const source = (await Bun.file(args.path.replace(/\?provider-settings$/, "")).text())
          .replaceAll('"@orchestra/ui/button"', '"provider-settings:button"')
          .replaceAll('"@orchestra/ui/v2/button-v2"', '"provider-settings:button"')
          .replaceAll('"@orchestra/ui/context/dialog"', '"provider-settings:dialog"')
          .replaceAll('"@orchestra/ui/provider-icon"', '"provider-settings:icon"')
          .replaceAll('"@orchestra/ui/tag"', '"provider-settings:tag"')
          .replaceAll('"@orchestra/ui/spinner"', '"provider-settings:spinner"')
          .replaceAll('"@/context/language"', '"provider-settings:language"')
          .replaceAll('"@/context/server-sdk"', '"provider-settings:sdk"')
          .replaceAll('"@/context/server-sync"', '"provider-settings:sync"')
          .replaceAll('"@/context/global"', '"provider-settings:global"')
          .replaceAll('"@/context/settings"', '"provider-settings:settings"')
          .replaceAll('"@/context/models"', '"provider-settings:models"')
          .replaceAll('"@/hooks/use-providers"', '"provider-settings:providers"')
          .replaceAll('"@/utils/toast"', '"provider-settings:toast"')
          .replaceAll('"./dialog-connect-provider"', JSON.stringify(connect))
          .replaceAll('"../dialog-connect-provider"', JSON.stringify(connect))
          .replaceAll('"./settings-v2/provider-controller"', JSON.stringify(controller))
          .replaceAll('"./settings-list"', '"provider-settings:list"')
          .replaceAll('"./settings-server-picker"', '"provider-settings:server"')
          .replaceAll('"./dialog-custom-provider"', '"provider-settings:custom"')
        const result = await solid("@babel/core").transformAsync(source, {
          filename: args.path,
          presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
          parserOpts: { plugins: ["jsx", "typescript"] },
          configFile: false,
          babelrc: false,
        })
        return { contents: result.code, loader: "ts" }
      },
    )
  },
})
const { SettingsProviders }: typeof import("../src/components/settings-providers") = await import(
  `${Bun.resolveSync("../src/components/settings-providers.tsx", import.meta.dir)}?provider-settings`
)
const { SettingsServerScope }: typeof import("../src/components/settings-server-picker") = await import(
  `${Bun.resolveSync("../src/components/settings-server-picker.tsx", import.meta.dir)}?provider-settings`
)

test("global settings wrapper forwards the selected server to both SDK and sync", () => {
  bindings.length = 0
  const dispose = render(
    () => createComponent(SettingsServerScope, { children: "settings" }),
    document.createElement("div"),
  )
  try {
    expect(bindings).toEqual([
      ["sdk", selected],
      ["sync", selected],
      ["models", null],
    ])
  } finally {
    dispose()
    queryClient.clear()
  }
})

test("legacy settings renders discovery loading/error/retry", () => {
  calls.length = 0
  setState({ protocol: "v2", loading: true, error: undefined })
  const host = document.createElement("div")
  const dispose = render(() => createComponent(SettingsProviders, {}), host)
  try {
    expect(host.querySelector('[role="status"]')?.textContent).toBe("orchestra.providers.loading")
    setState({ loading: false, error: { cause: "" } })
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("common.requestFailed")
    const retry = [...host.querySelectorAll("button")].find((node) => node.textContent === "orchestra.providers.retry")
    expect(retry).toBeDefined()
    retry!.click()
    expect(calls).toEqual(["retry"])
  } finally {
    dispose()
  }
})

test("legacy settings disconnects V2 through credentials and preserves V1 auth removal", async () => {
  calls.length = 0
  setState({ protocol: "v2", loading: false, error: undefined })
  const host = document.createElement("div")
  const dispose = render(() => createComponent(SettingsProviders, {}), host)
  try {
    const disconnect = [...host.querySelectorAll("button")].find((node) => node.textContent === "common.disconnect")
    expect(disconnect).toBeDefined()
    disconnect!.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toEqual(["credential.remove", "refresh", "toast"])
    calls.length = 0
    setState("protocol", "v1")
    disconnect!.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toEqual(["auth.remove", "global.dispose", "toast"])
  } finally {
    dispose()
  }
})
