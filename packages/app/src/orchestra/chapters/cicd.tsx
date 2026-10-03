import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { createEffect, createResource, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { ServerConnection } from "@/context/server"
import { useTabs } from "@/context/tabs"
import type { ChapterPageProps } from "../chapter-route"
import { loadWorkflows, workflowFailure } from "./cicd-data"
import "./cicd.css"

export default function Cicd(props: ChapterPageProps) {
  const sdk = useSDK()
  const language = useLanguage()
  const tabs = useTabs()
  const abort = new AbortController()
  onCleanup(() => abort.abort())
  const [state, setState] = createStore({ selected: "" })
  const [inventory, actions] = createResource(() =>
    loadWorkflows(async (path) => {
      if ((await sdk().protocol) !== "v1")
        return sdk()
          .api.file.list({ path, location: { directory: props.directory } }, { signal: abort.signal })
          .then((result) => result.data)
      const result = await sdk().client.file.list({ path }, { signal: abort.signal, throwOnError: false })
      if (!result.response.ok) throw new Error("Workflow list failed", { cause: { status: result.response.status } })
      return result.data ?? []
    }),
  )
  createEffect(() => {
    const paths = inventory()?.paths ?? []
    if (!paths.includes(state.selected)) setState("selected", paths[0] ?? "")
  })
  const [source, preview] = createResource(
    () => state.selected || undefined,
    async (path) => {
      const content = async () => {
        if ((await sdk().protocol) === "v1") {
          const result = await sdk().client.file.read({ path }, { signal: abort.signal, throwOnError: false })
          if (!result.response.ok)
            throw new Error("Workflow read failed", { cause: { status: result.response.status } })
          if (!result.data || result.data.type !== "text" || result.data.encoding === "base64")
            throw new Error("Unsupported workflow content")
          return result.data.content
        }
        return sdk()
          .api.file.read({ path, location: { directory: props.directory } }, { signal: abort.signal })
          .then((bytes) => new TextDecoder().decode(bytes))
      }
      return content().then(
        (text) => ({ status: "ready" as const, text }),
        (error: unknown) => ({ status: workflowFailure(error), text: "" }),
      )
    },
  )

  return (
    <section class="orchestra-cicd" aria-labelledby="cicd-title">
      <header>
        <h1 id="cicd-title">{language.t("orchestra.cicd.title")}</h1>
        <p>{language.t("orchestra.cicd.description")}</p>
      </header>
      <div class="cicd-toolbar">
        <code dir="ltr">{language.t("orchestra.cicd.location")}</code>
        <ButtonV2
          variant="outline"
          disabled={inventory.loading || source.loading}
          onClick={() => {
            void actions.refetch()
            void preview.refetch()
          }}
        >
          {language.t("orchestra.cicd.refresh")}
        </ButtonV2>
      </div>
      <Show when={!inventory.loading} fallback={<p role="status">{language.t("orchestra.cicd.loading")}</p>}>
        <Show
          when={inventory()?.status === "ready"}
          fallback={
            <p role={inventory()?.status === "error" ? "alert" : "status"}>
              {language.t(
                inventory()?.status === "empty"
                  ? "orchestra.cicd.empty"
                  : inventory()?.status === "unavailable"
                    ? "orchestra.cicd.unavailable"
                    : "orchestra.cicd.error",
              )}
            </p>
          }
        >
          <div class="cicd-content">
            <nav class="cicd-list" aria-label={language.t("orchestra.cicd.workflows")}>
              <h2>{language.t("orchestra.cicd.workflows")}</h2>
              <For each={inventory()?.paths}>
                {(path) => (
                  <ButtonV2
                    variant="ghost"
                    aria-pressed={state.selected === path}
                    onClick={() => setState("selected", path)}
                  >
                    <bdi>{path}</bdi>
                  </ButtonV2>
                )}
              </For>
            </nav>
            <section class="cicd-preview" aria-label={language.t("orchestra.cicd.source")}>
              <div class="cicd-preview-heading">
                <h2>
                  <bdi>{state.selected}</bdi>
                </h2>
                <ButtonV2
                  disabled={!state.selected}
                  onClick={() =>
                    tabs.newDraft(
                      { server: ServerConnection.key(props.server), directory: props.directory },
                      language.t("orchestra.cicd.prompt", { path: state.selected }),
                    )
                  }
                >
                  {language.t("orchestra.cicd.discuss")}
                </ButtonV2>
              </div>
              <Show
                when={state.selected && !source.loading}
                fallback={<p role="status">{language.t("orchestra.cicd.previewLoading")}</p>}
              >
                <Show
                  when={source()?.status === "ready"}
                  fallback={
                    <p role="alert">
                      {language.t(
                        source()?.status === "unavailable"
                          ? "orchestra.cicd.previewUnavailable"
                          : "orchestra.cicd.previewError",
                      )}
                    </p>
                  }
                >
                  <pre tabindex="0" dir="ltr" data-slot="cicd-source">
                    <code>{source()?.text}</code>
                  </pre>
                </Show>
              </Show>
            </section>
          </div>
        </Show>
      </Show>
    </section>
  )
}
