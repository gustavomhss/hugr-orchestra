import { createMemo, Show } from "solid-js"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import type { Session } from "@opencode-ai/sdk/v2"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { useSessionTabAvatarState } from "@/pages/layout/project-avatar-state"
import {
  modelActivity,
  createPrincipalModel,
  resolveModelLogo,
  type ModelActivity,
  type ModelReference,
} from "./model-logo-resolver"

export function ModelLogo(props: {
  model?: ModelReference
  activity: ModelActivity
  name?: string
  provider?: string
}) {
  const language = useLanguage()
  const resolved = createMemo(() => resolveModelLogo(props.model))
  const label = createMemo(() =>
    language.t("orchestra.model.tooltip", {
      model: props.name ?? props.model?.id ?? "—",
      provider: props.provider ?? props.model?.providerID ?? "—",
      activity: language.t(
        props.activity === "waiting"
          ? "orchestra.model.waiting"
          : props.activity === "running"
            ? "orchestra.model.running"
            : "orchestra.model.idle",
      ),
    }),
  )
  return (
    <span
      data-slot="orchestra-model-logo"
      data-activity={props.activity}
      data-logo={resolved().logo}
      data-source={resolved().source}
      role="img"
      aria-label={label()}
      title={label()}
    >
      <Show
        when={resolved().source !== "neutral"}
        fallback={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v18M4 7.5l8 4.5 8-4.5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
        }
      >
        <ProviderIcon id={resolved().logo} width={20} height={20} aria-hidden="true" />
      </Show>
    </span>
  )
}

export function SessionModelLogo(props: { server: ServerConnection.Key; session: Session }) {
  const global = useGlobal()
  const tabs = useTabs()
  const principal = tabs.state(
    { type: "session", server: props.server, sessionId: props.session.id },
    "executed-model",
    createPrincipalModel,
  )
  const state = useSessionTabAvatarState(
    () => props.server,
    () => props.session.directory,
    () => props.session.id,
  )
  const sync = createMemo(() => {
    const conn = global.servers.list().find((item) => ServerConnection.key(item) === props.server)
    return conn ? global.ensureServerCtx(conn).sync : undefined
  })
  const model = createMemo(() => principal(sync()?.session.data.session_message[props.session.id]))
  const provider = createMemo(() => {
    const serverSync = sync()
    const ref = model()
    if (!serverSync || !ref) return
    return serverSync.child(props.session.directory, { bootstrap: false })[0].provider.all.get(ref.providerID)
  })
  return (
    <ModelLogo
      model={model()}
      name={provider()?.models[model()?.id ?? ""]?.name}
      provider={provider()?.name}
      activity={modelActivity({ waiting: state.needsAttention(), running: state.loading() })}
    />
  )
}
