import { createMemo, onCleanup, Show } from "solid-js"
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
  const access = { bearer: undefined as string | undefined }
  const model = createMemo(() => {
    state.revision
    const model = createIntegrationModel(createIntegrationsApi({ server: props.server.http,
      directory: props.directory, bearer: access.bearer, fetch: platform.fetch }))
    onCleanup(() => model.dispose())
    void model.load()
    return model
  })
  onCleanup(() => { access.bearer = undefined })
  return <>
    <Show when={state.invalid}><p role="alert">{language.t("orchestra.integrations.error.authorization")}</p></Show>
    <Show when={model()} keyed>{(model) => <IntegrationsScreen model={model} basic={!!props.server.http.password}
      onAuthorize={(bearer) => {
        if (props.server.http.password) return
        if (!/^[A-Za-z0-9_-]{43}(?![\s\S])/.test(bearer)) return setState("invalid", true)
        access.bearer = bearer
        setState({ revision: state.revision + 1, invalid: false })
      }} />}</Show>
  </>
}
