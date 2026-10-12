import { Dialog } from "@orchestra/ui/dialog"
import { List } from "@orchestra/ui/list"
import { Switch } from "@orchestra/ui/switch"
import { Tooltip } from "@orchestra/ui/tooltip"
import { createMemo, Show } from "solid-js"
import type { Provider } from "@orchestra/sdk/v2/client"
import { useLanguage } from "@/context/language"
import { ModelTooltip } from "./model-tooltip"
import {
  connectedSubagentModels,
  createModelRuleEditor,
  effectiveModelState,
  hasModelScope,
  modelUnavailable,
  parseModelKey,
  type ModelRule,
} from "./subagent-model-rules"
import { clearPending, draftVersion, modelKey, pendingSelection, togglePending } from "./draft-subagent-models"

/** The picker owns interaction; its caller supplies the selected directory's catalog and session persistence. */
export function SubagentModelPicker(props: {
  sessionID?: string
  directory: string
  pendingKey?: string
  providers: readonly Provider[]
  status: "pending" | "error" | "success"
  supported: boolean | undefined
  rulesReady: boolean
  readRules: () => ModelRule[]
  writeRules: (rules: ModelRule[]) => Promise<ModelRule[]>
  onRetry: () => void
}) {
  const language = useLanguage()
  const pendingKey = () => props.pendingKey ?? props.directory
  const models = createMemo(() => connectedSubagentModels(props.providers))
  const modelIndex = createMemo(() => new Map(models().map((model) => [modelKey(model.provider.id, model.id), model])))
  const editor = createModelRuleEditor({
    read: props.readRules,
    write: props.writeRules,
  })

  const inherited = () => {
    draftVersion()
    return props.sessionID ? !hasModelScope(editor.rules()) : pendingSelection(pendingKey()).size === 0
  }
  const unavailable = createMemo(
    () => {
      draftVersion()
      if (props.status !== "success" || !props.rulesReady) return []
      const selected = props.sessionID
        ? editor
            .rules()
            .filter((rule) => rule.permission === "task" && !/[?*]/.test(rule.pattern))
            .map((rule) => rule.pattern)
        : [...pendingSelection(pendingKey())]
      return [...new Set(selected)].flatMap((key) => {
        const parsed = parseModelKey(key)
        if (!parsed || modelIndex().has(key)) return []
        if (props.sessionID && effectiveModelState(editor.rules(), parsed.providerID, parsed.modelID) !== "allow")
          return []
        return [{ key, ...parsed }]
      })
    },
    undefined,
    {
      equals: (left, right) =>
        left.length === right.length && left.every((item, index) => item.key === right[index].key),
    },
  )
  const choices = createMemo(() => [
    ...models().map((model) => ({ provider: model.provider, id: model.id, name: model.name, model })),
    ...unavailable().map((model) => ({
      provider: { id: model.providerID, name: model.providerID },
      id: model.modelID,
      name: model.modelID,
      model: undefined,
    })),
  ])

  const isAllowed = (providerID: string, modelID: string) => {
    // Drafts have no session yet: truth is the pending selection.
    // draftVersion() subscribes so plain-Set mutations re-render.
    if (!props.sessionID) {
      draftVersion()
      return pendingSelection(pendingKey()).has(modelKey(providerID, modelID))
    }
    return effectiveModelState(editor.rules(), providerID, modelID) === "allow"
  }

  const setAllowed = async (providerID: string, modelID: string, allow: boolean) => {
    if (!canChange()) return
    if (allow && modelUnavailable(modelIndex().get(modelKey(providerID, modelID)))) return
    if (!props.sessionID) {
      togglePending(pendingKey(), providerID, modelID, allow)
      return
    }
    await editor.set(providerID, modelID, allow)
  }
  const canChange = () => props.supported && props.status === "success" && props.rulesReady && !editor.state.saving

  return (
    <Dialog
      title={language.t("dialog.subagentModels.title")}
      description={language.t("dialog.subagentModels.description")}
    >
      <Show when={props.supported === false}>
        <p class="text-12-regular text-text-weak px-3" role="status">
          {language.t("dialog.subagentModels.unsupported")}
        </p>
      </Show>
      <Show when={editor.state.failed}>
        <p class="text-12-regular text-text-weak px-3" role="alert">
          {language.t("dialog.subagentModels.saveFailed")}
        </p>
      </Show>
      <Show when={!props.rulesReady || props.supported === undefined}>
        <p class="text-12-regular text-text-weak px-3" role="status">
          {language.t("orchestra.agents.loadingFile")}
        </p>
      </Show>
      <Show when={props.rulesReady && inherited()}>
        <p class="text-12-regular text-text-weak px-3" role="status" data-status="inherited">
          {language.t("dialog.subagentModels.inherited")}
        </p>
      </Show>
      <Show
        when={
          props.rulesReady &&
          props.status === "success" &&
          !inherited() &&
          models().length > 0 &&
          models().every((model) => !isAllowed(model.provider.id, model.id))
        }
      >
        <p class="text-12-regular text-text-weak px-3" role="status" data-status="none-allowed">
          {language.t("dialog.subagentModels.noneAllowed")}
        </p>
      </Show>
      <Show when={!props.sessionID && !inherited()}>
        <button class="text-12-regular text-text-weak px-3" type="button" onClick={() => clearPending(pendingKey())}>
          {language.t("orchestra.agents.choice.inherit")}
        </button>
      </Show>
      <Show when={props.status !== "success"}>
        <p class="text-12-regular text-text-weak px-3" role={props.status === "error" ? "alert" : "status"}>
          {language.t(props.status === "error" ? "orchestra.agents.models.error" : "orchestra.agents.models.loading")}
        </p>
        <Show when={props.status === "error"}>
          <button type="button" class="text-12-regular text-text-weak px-3" onClick={props.onRetry}>
            {language.t("orchestra.agents.retry")}
          </button>
        </Show>
      </Show>
      <Show when={props.status === "success"}>
        <List
          class="px-3"
          virtual={{ rowHeight: 64, height: 360 }}
          aria-label={language.t("dialog.subagentModels.title")}
          search={{ placeholder: language.t("dialog.model.search.placeholder"), autofocus: true }}
          emptyMessage={language.t(choices().length ? "dialog.model.empty" : "orchestra.agents.models.empty")}
          key={(x) => `${x?.provider?.id}:${x?.id}`}
          items={choices()}
          onSelect={(item) => item && void setAllowed(item.provider.id, item.id, !isAllowed(item.provider.id, item.id))}
          filterKeys={["provider.name", "name", "id"]}
          sortBy={(a, b) => a.name.localeCompare(b.name)}
          groupBy={(x) => x.provider.id}
          groupHeader={(group) => <span>{group.items[0]?.provider.name}</span>}
          itemWrapper={(item, node) => (
            <Tooltip
              class="w-full"
              placement={language.direction() === "rtl" ? "left-start" : "right-start"}
              gutter={12}
              openDelay={0}
              value={
                item.model ? (
                  <ModelTooltip model={item.model} />
                ) : (
                  language.t("orchestra.agents.model.unavailable", { model: `${item.provider.id}/${item.id}` })
                )
              }
            >
              <div class="w-full flex items-center gap-x-2">
                {node}
                <Switch
                  class="me-2 shrink-0"
                  checked={isAllowed(item.provider.id, item.id)}
                  disabled={
                    !props.supported ||
                    !props.rulesReady ||
                    (!!modelUnavailable(item.model) && !isAllowed(item.provider.id, item.id))
                  }
                  readOnly={editor.state.saving}
                  aria-disabled={editor.state.saving || undefined}
                  aria-busy={editor.state.saving || undefined}
                  onChange={(checked) => void setAllowed(item.provider.id, item.id, checked)}
                  hideLabel
                >
                  {item.name}
                </Switch>
              </div>
            </Tooltip>
          )}
        >
          {(item) => (
            <div class="w-full flex items-center gap-x-2 text-13-regular">
              <span class="truncate">
                <bdi>{item.name}</bdi>
                <Show when={modelUnavailable(item.model)}>
                  {(issue) => (
                    <span class="block text-12-regular text-text-weak">
                      {language.t(`orchestra.agents.model.${issue()}`, { model: item.id })}
                    </span>
                  )}
                </Show>
              </span>
            </div>
          )}
        </List>
      </Show>
      <Show when={props.rulesReady && !inherited()}>
        <div class="text-12-regular text-text-weak px-3 pb-1">{language.t("dialog.subagentModels.hint")}</div>
      </Show>
    </Dialog>
  )
}
