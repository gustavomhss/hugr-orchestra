import { createMemo, onCleanup, Show, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { createIntegrationsApi } from "./integrations-api"
import { createIntegrationModel } from "./integrations-model"
import { IntegrationsScreen } from "./integrations-screen"

export default function IntegrationsPage(props: ChapterPageProps) {
  const language = useLanguage()
  const platform = usePlatform()
  const [state, setState] = createStore({ revision: 0, invalid: false })
  const transport = createMemo(() => Object.freeze({ directory: props.directory,
    server: Object.freeze({ url: props.server.http.url, username: props.server.http.username,
      password: props.server.http.password }) }))
  const access = { bearer: undefined as string | undefined, owner: transport() }
  const session = createMemo(() => {
    state.revision
    const owner = transport()
    if (access.owner !== owner) {
      access.bearer = undefined
      access.owner = owner
    }
    const model = createIntegrationModel(createIntegrationsApi({ server: owner.server,
      directory: owner.directory, bearer: access.bearer, fetch: platform.fetch }))
    const lifetime = { disposed: false }
    onCleanup(() => { lifetime.disposed = true; model.dispose() })
    untrack(() => { void model.load() })
    return { model, basic: !!owner.server.password, authorize: (bearer: string) => {
      if (lifetime.disposed || transport() !== owner || owner.server.password) return
      if (!/^[A-Za-z0-9_-]{43}(?![\s\S])/.test(bearer)) return setState("invalid", true)
      access.bearer = bearer
      setState({ revision: state.revision + 1, invalid: false })
    } }
  })
  onCleanup(() => { access.bearer = undefined })
  return <>
    <Show when={state.invalid}><p role="alert">{language.t("orchestra.integrations.error.authorization")}</p></Show>
    <Show when={session()} keyed>{(session) => <IntegrationsScreen model={session.model} basic={session.basic}
      onAuthorize={session.authorize} />}</Show>
  </>
}
