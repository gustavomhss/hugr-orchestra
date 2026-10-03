import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { createMemo, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import type { ChapterPageProps } from "../chapter-route"
import { filterSkills, selectSkill, type SkillEntry } from "./skills-data"
import "./skills.css"

export default function Skills(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const abort = new AbortController()
  const [state, setState] = createStore({
    status: "loading" as "loading" | "ready" | "error" | "unavailable",
    skills: [] as SkillEntry[],
    query: "",
    selected: undefined as string | undefined,
  })
  const filtered = createMemo(() => filterSkills(state.skills, state.query))
  const selected = createMemo(() => selectSkill(filtered(), state.selected))

  async function load() {
    setState("status", "loading")
    const entries = await serverSDK().protocol.then(async (protocol) => {
      if (abort.signal.aborted) return []
      if (protocol === "v1") {
        const result = await sdk().client.app.skills(
          { directory: props.directory },
          { signal: abort.signal, throwOnError: false },
        )
        if (!result.response.ok) throw new Error("Skills request failed", { cause: { status: result.response.status } })
        if (!result.data) throw new Error("Skills response missing")
        return result.data
      }
      return (
        await serverSDK().currentApi.skill.list({ location: { directory: props.directory } }, { signal: abort.signal })
      ).data
    })
    if (abort.signal.aborted) return
    setState({ skills: entries, status: "ready" })
  }

  function refresh() {
    void load().catch((error: unknown) => {
      if (abort.signal.aborted) return
      const cause = error instanceof Error ? error.cause : undefined
      const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined
      setState("status", status === 404 || status === 405 || status === 501 ? "unavailable" : "error")
    })
  }

  onMount(refresh)
  onCleanup(() => abort.abort())

  return (
    <section class="orchestra-skills" aria-labelledby="skills-title">
      <header>
        <h1 id="skills-title">{language.t("orchestra.skills.title")}</h1>
        <p>{language.t("orchestra.skills.description")}</p>
      </header>
      <div class="skills-toolbar">
        <TextInputV2
          type="search"
          aria-label={language.t("orchestra.skills.search")}
          placeholder={language.t("orchestra.skills.search")}
          value={state.query}
          disabled={state.status !== "ready"}
          onInput={(event) => setState("query", event.currentTarget.value)}
        />
        <bdi class="skills-directory">{props.directory}</bdi>
      </div>
      <div role="status" aria-live="polite" class="skills-status">
        <Switch>
          <Match when={state.status === "loading"}>{language.t("orchestra.skills.loading")}</Match>
          <Match when={state.status === "error"}>{language.t("orchestra.skills.error")}</Match>
          <Match when={state.status === "unavailable"}>{language.t("orchestra.skills.unavailable")}</Match>
          <Match when={state.status === "ready" && !state.skills.length}>{language.t("orchestra.skills.empty")}</Match>
          <Match when={state.status === "ready" && state.skills.length && !filtered().length}>
            {language.t("orchestra.skills.noMatches")}
          </Match>
        </Switch>
      </div>
      <Show when={state.status === "error" || state.status === "unavailable"}>
        <ButtonV2 class="skills-retry" onClick={refresh}>
          {language.t("orchestra.skills.retry")}
        </ButtonV2>
      </Show>
      <Show when={state.status === "ready" && filtered().length}>
        <div class="skills-panels">
          <ul class="skills-catalog" aria-label={language.t("orchestra.skills.catalog")}>
            <For each={filtered()}>
              {(skill) => (
                <li class="skills-card" data-selected={selected()?.location === skill.location}>
                  <div class="skills-card-heading">
                    <h2>
                      <bdi>{skill.name}</bdi>
                    </h2>
                    <Tag>{language.t("orchestra.skills.registered")}</Tag>
                  </div>
                  <Show when={skill.description}>
                    <p>{skill.description}</p>
                  </Show>
                  <bdi class="skills-path">{skill.location}</bdi>
                  <ButtonV2
                    variant="outline"
                    aria-pressed={selected()?.location === skill.location}
                    onClick={() => setState("selected", skill.location)}
                  >
                    {language.t("orchestra.skills.read")}
                  </ButtonV2>
                </li>
              )}
            </For>
          </ul>
          <Show when={selected()}>
            {(skill) => (
              <article class="skills-reader" aria-labelledby="skills-reader-title">
                <header>
                  <h2 id="skills-reader-title">
                    <bdi>{skill().name}</bdi>
                  </h2>
                  <Tag>{language.t("orchestra.skills.registered")}</Tag>
                </header>
                <Show when={skill().description}>
                  <p>{skill().description}</p>
                </Show>
                <dl>
                  <dt>{language.t("orchestra.skills.location")}</dt>
                  <dd>
                    <bdi>{skill().location}</bdi>
                  </dd>
                </dl>
                <h3>{language.t("orchestra.skills.content")}</h3>
                <pre tabindex="0" aria-label={language.t("orchestra.skills.content")}>
                  {skill().content}
                </pre>
              </article>
            )}
          </Show>
        </div>
      </Show>
    </section>
  )
}
