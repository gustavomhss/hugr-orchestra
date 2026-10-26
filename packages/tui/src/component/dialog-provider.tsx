import { createMemo, createSignal, onMount, Show } from "solid-js"
import { useSync } from "../context/sync"
import { map, pipe, sortBy } from "remeda"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { DialogPrompt } from "../ui/dialog-prompt"
import { Link } from "../ui/link"
import { useTheme } from "../context/theme"
import { TextAttributes } from "@opentui/core"
import type { ProviderAuthMethod } from "../types"
import { DialogModel } from "./dialog-model"
import { useToast } from "../ui/toast"
import { useConnected } from "./use-connected"
import { useBindings } from "../keymap"
import { useClipboard } from "../context/clipboard"

const PROVIDER_PRIORITY: Record<string, number> = {
  openai: 0,
  "github-copilot": 1,
  anthropic: 2,
  google: 3,
}

const CUSTOM_PROVIDER_OPTION_VALUE = "__orchestra_custom_provider__"
const CUSTOM_PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/

type ProviderOptionBase = {
  title: string
  value: string
  description?: string
  category: string
}

type ProviderOption =
  | (ProviderOptionBase & {
      type: "provider"
      providerID: string
    })
  | (ProviderOptionBase & {
      type: "custom"
    })

export function providerOptions(list: { id: string; name: string }[]): ProviderOption[] {
  return [
    ...pipe(
      list,
      sortBy(
        (x) => PROVIDER_PRIORITY[x.id] ?? 99,
        (x) => x.name.toLowerCase(),
        (x) => x.id,
      ),
      map((provider) => ({
        type: "provider" as const,
        title: provider.name,
        value: provider.id,
        providerID: provider.id,
        description: {
          anthropic: "(API key)",
          openai: "(ChatGPT Plus/Pro or API key)",
        }[provider.id],
        category: provider.id in PROVIDER_PRIORITY ? "Popular" : "Providers",
      })),
    ),
    {
      type: "custom",
      title: "Other",
      value: CUSTOM_PROVIDER_OPTION_VALUE,
      description: "Custom provider",
      category: "Providers",
    },
  ]
}

export function normalizeCustomProviderID(value: string) {
  const providerID = value.trim().replace(/^@ai-sdk\//, "")
  if (!CUSTOM_PROVIDER_ID.test(providerID)) return
  return providerID
}

export function createDialogProviderOptions() {
  const sync = useSync()
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const { theme } = useTheme()
  const onboarded = useConnected()

  async function promptCustomProviderID(): Promise<string | undefined> {
    const value = await DialogPrompt.show(dialog, "Other", {
      placeholder: "Provider id",
      description: () => (
        <text fg={theme.textMuted}>
          This only stores a credential. Configure the provider in orchestra.json to use it.
        </text>
      ),
    })
    if (value === null) return

    const providerID = normalizeCustomProviderID(value)
    if (providerID) return providerID

    toast.show({
      variant: "error",
      message:
        "Provider ids must start with a lowercase letter or number and only use lowercase letters, numbers, hyphens, and underscores",
    })
    return promptCustomProviderID()
  }

  const options = createMemo(() => {
    return pipe(
      providerOptions(sync.data.provider_next.all),
      map((provider) => {
        if (provider.type === "custom") {
          return {
            title: provider.title,
            value: provider.value,
            description: provider.description,
            category: provider.category,
            async onSelect() {
              const providerID = await promptCustomProviderID()
              if (!providerID) return
              return dialog.replace(() => <ApiMethod providerID={providerID} title="API key" custom />)
            },
          }
        }

        const providerID = provider.providerID
        const connected = sync.data.provider_next.connected.includes(providerID)

        return {
          title: provider.title,
          value: provider.value,
          description: provider.description,
          category: provider.category,
          gutter: connected && onboarded() ? () => <text fg={theme.success}>✓</text> : undefined,
          async onSelect() {
            const integration = await sdk.api.integrations
              .get({ integrationID: providerID, location: { directory: sdk.directory } })
              .catch(() => undefined)
            const listed = (integration?.data?.methods ?? []).flatMap((method): AuthMethod[] => {
              if (method.type === "oauth")
                return [{ type: "oauth" as const, id: method.id, label: method.label, prompts: method.prompts }]
              if (method.type === "key")
                return [{ type: "api" as const, label: method.label ?? "API key", prompts: method.prompts }]
              return []
            })
            const methods: AuthMethod[] = listed.length ? listed : [{ type: "api" as const, label: "API key", prompts: undefined }]
            let index: number | null = 0
            if (methods.length > 1) {
              index = await new Promise<number | null>((resolve) => {
                dialog.replace(
                  () => (
                    <DialogSelect
                      title="Select auth method"
                      options={methods.map((x, index) => ({
                        title: x.label,
                        value: index,
                      }))}
                      onSelect={(option) => resolve(option.value)}
                    />
                  ),
                  () => resolve(null),
                )
              })
            }
            if (index == null) return
            const method = methods[index]
            if (method.type === "oauth") {
              let inputs: Record<string, string> | undefined
              if (method.prompts?.length) {
                const value = await PromptsMethod({
                  dialog,
                  prompts: method.prompts,
                })
                if (!value) return
                inputs = value
              }

              const result = await sdk.api.integrations
                .connectOauth({
                  integrationID: providerID,
                  location: { directory: sdk.directory },
                  methodID: method.id,
                  inputs: inputs ?? {},
                })
                .then(
                  (value) => ({ data: value.data, error: undefined }),
                  (error: unknown) => ({ data: undefined, error }),
                )
              if (!result.data) {
                toast.show({
                  variant: "error",
                  message: JSON.stringify(result.error),
                })
                dialog.clear()
                return
              }
              const authorization = result.data
              if (authorization.mode === "code") {
                dialog.replace(() => (
                  <CodeMethod providerID={providerID} title={method.label} authorization={authorization} />
                ))
              }
              if (authorization.mode === "auto") {
                dialog.replace(() => (
                  <AutoMethod providerID={providerID} title={method.label} authorization={authorization} />
                ))
              }
            }
            if (method.type === "api") {
              const metadata = method.prompts?.length
                ? await PromptsMethod({ dialog, prompts: method.prompts })
                : undefined
              if (metadata === null) return
              return dialog.replace(() => (
                <ApiMethod providerID={providerID} title={method.label} metadata={metadata} />
              ))
            }
          },
        }
      }),
    )
  })
  return options
}

export function DialogProvider() {
  const options = createDialogProviderOptions()
  return <DialogSelect title="Connect a provider" options={options()} />
}

type AuthMethod =
  | { type: "oauth"; id: string; label: string; prompts: ProviderAuthMethod["prompts"] }
  | { type: "api"; label: string; prompts: ProviderAuthMethod["prompts"] }

type OauthAttempt = { attemptID: string; url: string; instructions: string }

interface AutoMethodProps {
  providerID: string
  title: string
  authorization: OauthAttempt
}
function AutoMethod(props: AutoMethodProps) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const dialog = useDialog()
  const sync = useSync()
  const toast = useToast()
  const clipboard = useClipboard()

  useBindings(() => ({
    bindings: [
      {
        key: "c",
        desc: "Copy provider code",
        group: "Dialog",
        cmd: () => {
          const code =
            props.authorization.instructions.match(/[A-Z0-9]{4}-[A-Z0-9]{4,5}/)?.[0] ?? props.authorization.url
          clipboard
            .write?.(code)
            .then(() => toast.show({ message: "Copied to clipboard", variant: "info" }))
            .catch(toast.error)
        },
      },
    ],
  }))

  onMount(async () => {
    const status = await waitForOauth(sdk, props.providerID, props.authorization.attemptID)
    if (status !== "complete") {
      toast.show({ variant: "error", message: "OAuth authorization failed. Try /connect again." })
      dialog.clear()
      return
    }
    await sync.bootstrap()
    dialog.replace(() => <DialogModel providerID={props.providerID} />)
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <box gap={1}>
        <Link href={props.authorization.url} fg={theme.primary} />
        <text fg={theme.textMuted}>{props.authorization.instructions}</text>
      </box>
      <text fg={theme.textMuted}>Waiting for authorization…</text>
      <text fg={theme.text}>
        c <span style={{ fg: theme.textMuted }}>copy</span>
      </text>
    </box>
  )
}

interface CodeMethodProps {
  title: string
  providerID: string
  authorization: OauthAttempt
}
function CodeMethod(props: CodeMethodProps) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const sync = useSync()
  const dialog = useDialog()
  const [error, setError] = createSignal(false)

  return (
    <DialogPrompt
      title={props.title}
      placeholder="Authorization code"
      onConfirm={async (value) => {
        const completed = await sdk.api.integrations
          .oauthComplete({
            integrationID: props.providerID,
            attemptID: props.authorization.attemptID,
            location: { directory: sdk.directory },
            code: value,
          })
          .then(
            () => true,
            () => false,
          )
        if (completed) {
          await sync.bootstrap()
          dialog.replace(() => <DialogModel providerID={props.providerID} />)
          return
        }
        setError(true)
      }}
      description={() => (
        <box gap={1}>
          <text fg={theme.textMuted}>{props.authorization.instructions}</text>
          <Link href={props.authorization.url} fg={theme.primary} />
          <Show when={error()}>
            <text fg={theme.error}>Invalid code</text>
          </Show>
        </box>
      )}
    />
  )
}

interface ApiMethodProps {
  providerID: string
  title: string
  custom?: boolean
  metadata?: Record<string, string>
}
function ApiMethod(props: ApiMethodProps) {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()

  return (
    <DialogPrompt
      title={props.title}
      placeholder="API key"
      onConfirm={async (value) => {
        if (!value) return
        const saved = await sdk.api.integrations
          .connectKey({
            integrationID: props.providerID,
            location: { directory: sdk.directory },
            key: value,
            metadata: props.metadata,
          })
          .then(
            () => ({ error: undefined }),
            (error: unknown) => ({ error }),
          )
        if (saved.error) {
          toast.show({ variant: "error", message: JSON.stringify(saved.error) })
          return
        }
        await sync.bootstrap()
        if (props.custom && !sync.data.provider_next.all.some((provider) => provider.id === props.providerID)) {
          toast.show({
            variant: "info",
            message: `Saved credential for ${props.providerID}. Configure it in orchestra.json to use it.`,
          })
          dialog.clear()
          return
        }
        dialog.replace(() => <DialogModel providerID={props.providerID} />)
      }}
    />
  )
}

interface PromptsMethodProps {
  dialog: ReturnType<typeof useDialog>
  prompts: readonly NonNullable<ProviderAuthMethod["prompts"]>[number][]
}
async function PromptsMethod(props: PromptsMethodProps) {
  const inputs: Record<string, string> = {}
  for (const prompt of props.prompts) {
    if (prompt.when) {
      const value = inputs[prompt.when.key]
      if (value === undefined) continue
      const matches = prompt.when.op === "eq" ? value === prompt.when.value : value !== prompt.when.value
      if (!matches) continue
    }

    if (prompt.type === "select") {
      const value = await new Promise<string | null>((resolve) => {
        props.dialog.replace(
          () => (
            <DialogSelect
              title={prompt.message}
              options={prompt.options.map((x) => ({
                title: x.label,
                value: x.value,
                description: x.hint,
              }))}
              onSelect={(option) => resolve(option.value)}
            />
          ),
          () => resolve(null),
        )
      })
      if (value === null) return null
      inputs[prompt.key] = value
      continue
    }

    const value = await new Promise<string | null>((resolve) => {
      props.dialog.replace(
        () => (
          <DialogPrompt title={prompt.message} placeholder={prompt.placeholder} onConfirm={(value) => resolve(value)} />
        ),
        () => resolve(null),
      )
    })
    if (value === null) return null
    inputs[prompt.key] = value
  }
  return inputs
}

// V2 OAuth runs as a server attempt; the auto flow polls it until it settles, like the earlier runtime's blocking callback.
async function waitForOauth(sdk: ReturnType<typeof useSDK>, integrationID: string, attemptID: string): Promise<string> {
  const status = await sdk.api.integrations
    .oauthStatus({ integrationID, attemptID, location: { directory: sdk.directory } })
    .then(
      (result) => result.data.status,
      () => "failed",
    )
  if (status !== "pending") return status
  await Bun.sleep(1000)
  return waitForOauth(sdk, integrationID, attemptID)
}
