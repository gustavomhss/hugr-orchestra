import { getFilename } from "@opencode-ai/core/util/path"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { displayName } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import { Persist, persisted } from "@/utils/persist"
import type { ChapterPageProps } from "../chapter-route"
import { MxBadge, MxPage, MxToggle } from "./kit"
import { SkillDialog, type SkillDialogState, type SkillSaveInput } from "./skills-dialog"
import { filterSkills, skillAccess, skillErrorMessage, skillSource, sortSkills, type SkillEntry } from "./skills-data"
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
  // No server setting decides which skills a profile offers, so availability is this app's per-profile choice,
  // keyed by skill file location because names can repeat across folders.
  const [local, setLocal] = persisted(
    Persist.serverWorkspace(serverSDK().scope, props.directory, "orchestra-skills"),
    createStore({ disabled: [] as string[] }),
  )
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
    setState({ skills: sortSkills(entries, props.directory), status: "ready" })
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

  async function save(input: SkillSaveInput) {
    const protocol = await serverSDK().protocol
    // V2 goes through the legacy SDK's generated v2 group: `currentApi` is the vendored @opencode-ai/client
    // release, which predates the skill write routes.
    const result = await (
      protocol === "v1"
        ? sdk().client.app.skillSave({ directory: props.directory, skillSaveInput: input }, { throwOnError: false })
        : sdk().client.v2.skill.save(
            { location: { directory: props.directory }, skillV2SaveInput: input },
            { throwOnError: false },
          )
    ).catch(() => undefined)
    if (!result?.data) return writeFailure(result?.response?.status, result?.error)
    const saved = "data" in result.data ? result.data.data : result.data
    if (abort.signal.aborted) return
    setDialog(undefined)
    setState("pending", saved.location)
    await load().catch(() => refresh())
  }

  async function remove(skill: SkillEntry) {
    const protocol = await serverSDK().protocol
    const result = await (
      protocol === "v1"
        ? sdk().client.app.skillRemove({ directory: props.directory, path: skill.location }, { throwOnError: false })
        : sdk().client.v2.skill.remove(
            { location: { directory: props.directory }, path: skill.location },
            { throwOnError: false },
          )
    ).catch(() => undefined)
    if (!result?.response?.ok) return writeFailure(result?.response?.status, result?.error)
    if (abort.signal.aborted) return
    setDialog(undefined)
    setState("pending", undefined)
    setLocal("disabled", (locations) => locations.filter((location) => location !== skill.location))
    await load().catch(() => refresh())
  }

  function writeFailure(status: number | undefined, error: unknown) {
    if (status === 404 || status === 405 || status === 501) return language.t("orchestra.skills.writeUnavailable")
    return skillErrorMessage(error) ?? language.t("orchestra.skills.writeFailed")
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
              const enabled = () => !local.disabled.includes(skill.location)
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
                    <MxBadge tone={enabled() ? "good" : undefined}>
                      {language.t(enabled() ? "orchestra.skills.registered" : "orchestra.skills.disabled")}
                    </MxBadge>
                  </div>
                  <footer class="mx-card-foot">
                    <button
                      type="button"
                      class="mx-btn"
                      onClick={() => setDialog({ type: "edit", skill, access: access() })}
                    >
                      {language.t(access() === "edit" ? "orchestra.skills.read" : "orchestra.skills.readOnly")}
                    </button>
                    <MxToggle
                      checked={enabled()}
                      label={language.t("orchestra.skills.toggle", { name: skill.name })}
                      onChange={(next) =>
                        setLocal("disabled", (locations) =>
                          next
                            ? locations.filter((location) => location !== skill.location)
                            : [...locations, skill.location],
                        )
                      }
                    />
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
      <Show when={state.status === "ready" && state.skills.length}>
        <p class="mx-note">{language.t("orchestra.skills.localNote")}</p>
      </Show>
      <Show when={dialog()} keyed>
        {(current) => (
          <SkillDialog
            state={current}
            onClose={() => setDialog(undefined)}
            onSave={save}
            onRemove={remove}
            onAskRemove={(skill) => setDialog({ type: "remove", skill })}
          />
        )}
      </Show>
    </MxPage>
  )
}
