import { For, Show, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { RadioGroupV2, RadioItemV2 } from "@opencode-ai/ui/v2/radio-v2"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import type { ChapterPageProps } from "../chapter-route"
import { repositoryWorkspaces, workspaceFailure } from "./workspaces-model"
import "./workspaces.css"

export default function Workspaces(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const sync = useServerSync()
  const tabs = useTabs()
  const [state, setState] = createStore({
    status: "loading" as "loading" | "ready" | "empty" | "error" | "unavailable",
    workspaces: [] as ReturnType<typeof repositoryWorkspaces>,
    selected: props.directory,
  })
  const requests = { generation: 0, disposed: false }
  onCleanup(() => {
    requests.disposed = true
  })

  async function load() {
    const generation = ++requests.generation
    setState("status", "loading")
    await sdk()
      .protocol.then(async (protocol) => {
        if (requests.disposed) return []
        if (protocol !== "v1") return sdk().api.project.list()
        // The legacy compatibility adapter throws only the response body, losing
        // the status needed to distinguish an unsupported endpoint from an error.
        const result = await sdk().client.project.list(undefined, { throwOnError: false })
        if (!result.response.ok) throw new Error("UnexpectedStatus", { cause: { status: result.response.status } })
        return result.data ?? []
      })
      .then(
        (projects) => {
          if (requests.disposed || generation !== requests.generation) return
          const workspaces = repositoryWorkspaces(projects, props.directory)
          setState({
            workspaces,
            selected: workspaces.find((workspace) => workspace.selected)?.directory ?? props.directory,
            status: workspaces.length ? "ready" : "empty",
          })
        },
        (error: unknown) => {
          if (requests.disposed || generation !== requests.generation) return
          setState("status", workspaceFailure(error))
        },
      )
  }
  onMount(() => void load())

  return (
    <section class="orchestra-workspaces" aria-labelledby="workspaces-title">
      <header>
        <h1 id="workspaces-title">{language.t("orchestra.workspaces.title")}</h1>
        <p>{language.t("orchestra.workspaces.description")}</p>
      </header>
      <div class="workspaces-toolbar">
        <ButtonV2
          disabled={state.status !== "ready"}
          onClick={() =>
            void tabs.newDraft({ server: ServerConnection.key(props.server), directory: state.selected }, "")
          }
        >
          {language.t("orchestra.workspaces.openChat")}
        </ButtonV2>
        <ButtonV2 variant="ghost" disabled={state.status === "loading"} onClick={() => void load()}>
          {language.t("orchestra.workspaces.refresh")}
        </ButtonV2>
      </div>
      <Show when={state.status !== "ready"}>
        <p class="workspaces-state" role={state.status === "error" ? "alert" : "status"}>
          {language.t(`orchestra.workspaces.${state.status}`)}
        </p>
      </Show>
      <Show when={state.status === "ready"}>
        <RadioGroupV2
          class="workspaces-list"
          label={language.t("orchestra.workspaces.choose")}
          value={state.selected}
          onChange={(directory) => setState("selected", directory)}
        >
          <For each={state.workspaces}>
            {(workspace) => {
              // Read only branches already known to this server's directory store.
              const branch = () => sync().child(workspace.directory, { bootstrap: false })[0].vcs?.branch
              return (
                <article
                  class="workspaces-card"
                  data-directory={workspace.directory}
                  data-selected={state.selected === workspace.directory}
                >
                  <RadioItemV2 value={workspace.directory} label={<bdi>{workspace.name}</bdi>} />
                  <code dir="ltr">{workspace.directory}</code>
                  <div class="workspaces-meta">
                    <Tag>
                      {language.t(workspace.root ? "orchestra.workspaces.root" : "orchestra.workspaces.sandbox")}
                    </Tag>
                    <Show when={branch()}>
                      {(branch) => (
                        <Tag>
                          <bdi>{branch()}</bdi>
                        </Tag>
                      )}
                    </Show>
                    <Show when={state.selected === workspace.directory}>
                      <Tag variant="accent">{language.t("orchestra.workspaces.selected")}</Tag>
                    </Show>
                  </div>
                </article>
              )
            }}
          </For>
        </RadioGroupV2>
      </Show>
    </section>
  )
}
