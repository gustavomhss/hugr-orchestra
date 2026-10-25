import { getFilename } from "@orchestra/core/util/path"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { ClientError } from "@orchestra/client"
import { useServerSDK } from "@/context/server-sdk"
import { displayName } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import type { ChapterPageProps } from "../chapter-route"
import { errorStatus } from "./agents-roster"
import { MxBadge, MxPage } from "./kit"
import { SkillDialog, type SkillDialogState, type SkillSaveInput } from "./skills-dialog"
import {
  filterSkills,
  readSkills,
  skillAccess,
  skillErrorMessage,
  skillSource,
  sortSkills,
  type SkillEntry,
} from "./skills-data"
import "./skills.css"

export default function Skills(props: ChapterPageProps) {
  const language = useLanguage()
  const global = useGlobal()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const abort = new AbortController()
  const [state, setState] = createStore({
    status: "loading" as "loading" | "ready" | "error" | "unavailable",
    skills: [] as SkillEntry[],
    query: "",
    // A saved file the server has not listed yet (its configuration predates the skill folder).
    pending: undefined as string | undefined,
  })
  // A signal, not a store field: setting a store path to an object merges into the previous object, so the keyed
  // dialog would not remount and the previous dialog's pending close event would clear the next one.
  const [dialog, setDialog] = createSignal<SkillDialogState>()
  const close = (current: SkillDialogState) => {
    if (dialog() === current) setDialog(undefined)
  }
  const unlisted = createMemo(() =>
    state.pending && !state.skills.some((skill) => skill.location === state.pending) ? state.pending : undefined,
  )
  const filtered = createMemo(() => filterSkills(state.skills, state.query))
  const profile = createMemo(() => {
    const directory = pathKey(props.directory)
    const project = global
      .ensureServerCtx(props.server)
      .projects.list()
      .find(
        (item) =>
          pathKey(item.worktree) === directory || item.sandboxes?.some((sandbox) => pathKey(sandbox) === directory),
      )
    return project ? displayName(project) : getFilename(props.directory) || props.directory
  })
  const message = createMemo(() => {
    if (state.status === "loading") return language.t("orchestra.skills.loading")
    if (state.status === "error") return language.t("orchestra.skills.error")
    if (state.status === "unavailable") return language.t("orchestra.skills.unavailable")
    if (!state.skills.length) return language.t("orchestra.skills.empty")
    if (!filtered().length) return language.t("orchestra.skills.noMatches")
  })

  async function load() {
    const entries = await serverSDK().protocol.then(async (protocol) => {
      if (abort.signal.aborted) return []
      return (
        await serverSDK().currentApi.skill.list({ location: { directory: props.directory } }, { signal: abort.signal })
      ).data
    })
    if (abort.signal.aborted) return
    setState({ skills: sortSkills(readSkills(entries), props.directory), status: "ready" })
  }

  function refresh() {
    setState("status", "loading")
    void load().catch((error: unknown) => {
      if (abort.signal.aborted) return
      const cause = error instanceof Error ? error.cause : undefined
      const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined
      setState("status", status === 404 || status === 405 || status === 501 ? "unavailable" : "error")
    })
  }

  async function save(current: SkillDialogState, input: SkillSaveInput) {
    const result = await sdk()
      .orchestra.skills.save({ location: { directory: props.directory }, ...input })
      .then(
        (saved) => ({ saved, error: undefined }),
        (error: unknown) => ({ saved: undefined, error }),
      )
    if (!result.saved) return writeFailure(result.error)
    if (abort.signal.aborted) return
    close(current)
    setState("pending", result.saved.data.location)
    await load().catch(() => refresh())
  }

  async function remove(current: SkillDialogState, skill: SkillEntry) {
    const error = await sdk()
      .orchestra.skills.remove({ location: { directory: props.directory }, path: skill.location })
      .then(
        () => undefined,
        (error: unknown) => ({ error }),
      )
    if (error) return writeFailure(error.error)
    if (abort.signal.aborted) return
    close(current)
    setState("pending", undefined)
    await load().catch(() => refresh())
  }

  // An undeclared answer throws a ClientError with its status and no message worth showing.
  function writeFailure(error: unknown) {
    const status = errorStatus(error)
    if (status === 404 || status === 405 || status === 501) return language.t("orchestra.skills.writeUnavailable")
    return (error instanceof ClientError ? undefined : skillErrorMessage(error)) ?? language.t("orchestra.skills.writeFailed")
  }


  onMount(refresh)
  onCleanup(() => abort.abort())

  return (
    <MxPage
      id="orchestra-skills"
      eyebrow={language.t("orchestra.skills.eyebrow", { profile: profile() })}
      title={language.t("orchestra.skills.title")}
      description={language.t("orchestra.skills.description")}
      action={
        <button
          type="button"
          class="mx-btn primary"
          disabled={state.status !== "ready"}
          onClick={() => setDialog({ type: "add" })}
        >
          {language.t("orchestra.skills.add")}
        </button>
      }
    >
      <div class="mx-toolbar">
        <input
          class="mx-search"
          type="text"
          aria-label={language.t("orchestra.skills.search")}
          placeholder={language.t("orchestra.skills.search")}
          value={state.query}
          disabled={state.status !== "ready"}
          onInput={(event) => setState("query", event.currentTarget.value)}
        />
        <MxBadge>
          <bdi>{profile()}</bdi>
        </MxBadge>
      </div>
      <div role="status" aria-live="polite">
        <Show when={message()}>
          <p class="mx-empty orchestra-skills-empty">{message()}</p>
        </Show>
      </div>
      <Show when={state.status === "error" || state.status === "unavailable"}>
        <button type="button" class="mx-btn orchestra-skills-retry" onClick={refresh}>
          {language.t("orchestra.skills.retry")}
        </button>
      </Show>
      <Show when={state.status === "ready" && filtered().length}>
        <ul class="mx-grid orchestra-skills-grid" aria-label={language.t("orchestra.skills.catalog")}>
          <For each={filtered()}>
            {(skill) => {
              const source = () => skillSource(skill.location, props.directory)
              const access = () => skillAccess(skill.location, props.directory)
              return (
                <li class="mx-card skills-card" data-skill-location={skill.location}>
                  <div class="mx-card-top">
                    <span class="mx-mark">
                      <svg class="orchestra-skills-ic" viewBox="0 0 16 16" aria-hidden="true">
                        <path d="m8 1 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" />
                      </svg>
                    </span>
                    <h3>
                      <bdi>{skill.name}</bdi>
                    </h3>
                  </div>
                  <p title={skill.description ?? undefined}>
                    {skill.description || language.t("orchestra.skills.noDescription")}
                  </p>
                  <div class="mx-meta">
                    <MxBadge>{language.t(`orchestra.skills.source.${source()}`)}</MxBadge>
                  </div>
                  <footer class="mx-card-foot">
                    <button
                      type="button"
                      class="mx-btn"
                      onClick={() => setDialog({ type: "edit", skill, access: access() })}
                    >
                      {language.t(access() === "edit" ? "orchestra.skills.read" : "orchestra.skills.readOnly")}
                    </button>
                  </footer>
                </li>
              )
            }}
          </For>
        </ul>
      </Show>
      <Show when={unlisted()}>
        {(location) => (
          <p class="mx-note orchestra-skills-notice">
            {language.t("orchestra.skills.notListed", { location: location() })}{" "}
            <button type="button" class="mx-link" onClick={refresh}>
              {language.t("orchestra.skills.reload")}
            </button>
          </p>
        )}
      </Show>
      <Show when={dialog()} keyed>
        {(current) => (
          <SkillDialog
            state={current}
            onClose={() => close(current)}
            onSave={(input) => save(current, input)}
            onRemove={(skill) => remove(current, skill)}
            onAskRemove={(skill) => {
              if (dialog() === current) setDialog({ type: "remove", skill })
            }}
          />
        )}
      </Show>
    </MxPage>
  )
}
