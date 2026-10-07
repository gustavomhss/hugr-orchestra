import { useDialog } from "@opencode-ai/ui/context/dialog"
import { getFilename } from "@opencode-ai/core/util/path"
import { createMemo, For, Match, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerProtocol, useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import {
  behaviorProfileDirectory,
  filterBehaviors,
  removeBehavior,
  saveBehavior,
  toggleBehavior,
  type BehaviorCardLabels,
  type LlmBehavior,
} from "@/utils/llm-behaviors"
import { llmBehaviors } from "@/utils/llm-behaviors-store"
import { pathKey } from "@/utils/path-key"
import { MxBadge, MxPage, MxToggle } from "./kit"
import { BehaviorDialog, PluginIcon, RemoveDialog } from "./plugins-dialog"
import "./plugins.css"

export default function PluginsPage(props: ChapterPageProps) {
  const language = useLanguage()
  const global = useGlobal()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const protocol = useServerProtocol()
  const platform = usePlatform()
  const dialog = useDialog()
  // Same profile resolution as the composer, so a sandbox selection still edits its repository's behaviors.
  const store = createMemo(() =>
    llmBehaviors(platform, serverSDK().scope, behaviorProfileDirectory(serverSync().data.project, props.directory)),
  )
  const [state, setState] = createStore({ query: "" })
  // Only the V1 prompt contract carries per-message instructions; elsewhere an enabled behavior is saved, not active.
  const applied = () => protocol() === "v1"
  const labels: BehaviorCardLabels = {
    get kind() {
      return language.t("orchestra.plugins.kind")
    },
    get custom() {
      return language.t("orchestra.plugins.custom")
    },
    get configure() {
      return language.t("orchestra.plugins.configure")
    },
    status: (behavior) =>
      language.t(
        !behavior.enabled
          ? "orchestra.plugins.disabled"
          : applied()
            ? "orchestra.plugins.active"
            : "orchestra.plugins.enabled",
      ),
  }
  const visible = createMemo(() => filterBehaviors(store().behaviors(), state.query, labels))
  const profile = createMemo(() => {
    const project = global
      .ensureServerCtx(props.server)
      .projects.list()
      .find((item) => pathKey(item.worktree) === pathKey(props.directory))
    return project?.name || getFilename(props.directory) || props.directory
  })

  function edit(behavior?: LlmBehavior) {
    void dialog.showOwned(() => (
      <BehaviorDialog
        behavior={behavior}
        applied={applied()}
        onSave={(next) => {
          store().update(saveBehavior(store().behaviors(), next))
          dialog.close()
        }}
        onRemove={(id) => confirmRemove(id)}
        onCancel={() => dialog.close()}
      />
    ))
  }

  function confirmRemove(id: string) {
    void dialog.showOwned(() => (
      <RemoveDialog
        profile={profile()}
        onConfirm={() => {
          store().update(removeBehavior(store().behaviors(), id))
          dialog.close()
        }}
        onCancel={() => dialog.close()}
      />
    ))
  }

  return (
    <MxPage
      id="orchestra-plugins"
      eyebrow={language.t("orchestra.plugins.eyebrow", { profile: profile() })}
      title={language.t("orchestra.plugins.title")}
      description={language.t("orchestra.plugins.description")}
      action={
        <button type="button" class="mx-btn primary" onClick={() => edit()}>
          {language.t("orchestra.plugins.add")}
        </button>
      }
    >
      <div class="mx-toolbar">
        <input
          class="mx-search"
          placeholder={language.t("orchestra.plugins.search")}
          aria-label={language.t("orchestra.plugins.searchLabel")}
          value={state.query}
          onInput={(event) => setState("query", event.currentTarget.value)}
        />
        <MxBadge>
          <bdi>{profile()}</bdi>
        </MxBadge>
      </div>
      <Switch>
        <Match when={store().loading()}>
          <div class="mx-empty" role="status">
            {language.t("orchestra.plugins.loading")}
          </div>
        </Match>
        <Match when={!store().behaviors().length}>
          <div class="mx-empty">
            {language.t("orchestra.plugins.empty")}
            <br />
            {language.t("orchestra.plugins.emptyHint")}
          </div>
        </Match>
        <Match when={true}>
          <div class="mx-grid">
            <For each={visible()}>
              {(behavior) => (
                <article class="mx-card" data-mx-card data-behavior={behavior.id}>
                  <div class="mx-card-top">
                    <span class="mx-mark">
                      <PluginIcon />
                    </span>
                    <h3>
                      <bdi>{behavior.name}</bdi>
                    </h3>
                  </div>
                  <p>{behavior.description}</p>
                  <div class="mx-meta">
                    <MxBadge>{labels.kind}</MxBadge>
                    <MxBadge>{behavior.intensity ?? labels.custom}</MxBadge>
                    <MxBadge tone={behavior.enabled ? "good" : undefined}>{labels.status(behavior)}</MxBadge>
                  </div>
                  <footer class="mx-card-foot">
                    <button type="button" class="mx-btn" onClick={() => edit(behavior)}>
                      {labels.configure}
                    </button>
                    <MxToggle
                      checked={behavior.enabled}
                      label={language.t("orchestra.plugins.enable", { name: behavior.name })}
                      onChange={(enabled) => store().update(toggleBehavior(store().behaviors(), behavior.id, enabled))}
                    />
                  </footer>
                </article>
              )}
            </For>
          </div>
        </Match>
      </Switch>
      <Show when={protocol()}>
        {(kind) => (
          <p class="mx-note" data-slot="plugins-application">
            {language.t(kind() === "v1" ? "orchestra.plugins.applied" : "orchestra.plugins.notApplied")}
          </p>
        )}
      </Show>
    </MxPage>
  )
}
