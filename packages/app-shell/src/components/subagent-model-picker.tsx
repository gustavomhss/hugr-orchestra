import { Dialog } from "@orchestra/ui/dialog"
import { List } from "@orchestra/ui/list"
import { Switch } from "@orchestra/ui/switch"
import { Tooltip } from "@orchestra/ui/tooltip"
import { createMemo, Show } from "solid-js"
import type { Provider } from "@/v2-wire"
import { useLanguage } from "@/context/language"
import { ModelTooltip } from "./model-tooltip"
import {
  allowsEveryModel,
  connectedSubagentModels,
  createModelPolicyEditor,
  createModelRuleEditor,
  effectiveModelState,
  hasModelScope,
  modelUnavailable,
  parseModelKey,
  type ModelRule,
  type ModelPolicySnapshot,
  type SubagentModelPolicy,
} from "./subagent-model-rules"
import { clearPending, draftVersion, modelKey, pendingPolicy, pendingSelection, togglePending } from "./draft-subagent-models"
import { sessionRecoveryLanguage } from "@/i18n/session-recovery"

/** The picker owns interaction; its caller supplies the selected directory's catalog and session persistence. */
export function SubagentModelPicker(props: {
  sessionID?: string
  directory: string
  pendingKey?: string
  providers: readonly Provider[]
  status: "pending" | "error" | "success"
  supported: boolean | undefined
  protocol?: "v2"
  loadFailed?: boolean
  rulesReady: boolean
  readRules: () => ModelRule[]
  writeRules: (rules: ModelRule[]) => Promise<ModelRule[]>
  policy?: {
    read: () => ModelPolicySnapshot
    write: (policy: SubagentModelPolicy) => Promise<SubagentModelPolicy | ModelPolicySnapshot>
  }
  onRetry: () => void
}) {
  const language = sessionRecoveryLanguage(useLanguage())
  const pendingKey = () => props.pendingKey ?? props.directory
  const models = createMemo(() => connectedSubagentModels(props.providers))
  const modelIndex = createMemo(() => new Map(models().map((model) => [modelKey(model.provider.id, model.id), model])))
  const editor = createModelRuleEditor({
    read: props.readRules,
    write: props.writeRules,
  })
  const policyEditor = createModelPolicyEditor({
    read: () => props.policy?.read() ?? { policy: { mode: "inherit" } },
    write: (policy) => {
      if (!props.policy) return Promise.reject(new Error(language.t("session.subagentModels.unsupported")))
      return props.policy.write(policy)
    },
  })
  const policy = () => {
    draftVersion()
    return props.sessionID ? policyEditor.policy() : pendingPolicy(pendingKey())
  }
  const saving = () => props.protocol === "v2" ? policyEditor.state.saving : editor.state.saving
  const denyAll = () => {
    const current = policy()
    return current.mode === "allowlist" && current.models.length === 0
  }

  const inherited = () => {
    draftVersion()
    if (!props.sessionID) return pendingPolicy(pendingKey()).mode === "inherit"
    if (props.protocol === "v2") return policy().mode === "inherit"
    return !hasModelScope(editor.rules()) || allowsEveryModel(editor.rules())
  }
  const unavailable = createMemo(
    () => {
      draftVersion()
      if (props.status !== "success" || !props.rulesReady) return []
      const current = policy()
      const selected =
        props.protocol === "v2"
          ? current.mode === "allowlist"
            ? current.models.map((model) => modelKey(model.providerID, model.id))
            : []
          : props.sessionID
            ? editor
                .rules()
                .filter((rule) => rule.permission === "task" && !/[?*]/.test(rule.pattern))
                .map((rule) => rule.pattern)
            : [...pendingSelection(pendingKey())]
      return [...new Set(selected)].flatMap((key) => {
        const parsed = parseModelKey(key)
        if (!parsed || modelIndex().has(key)) return []
        if (
          props.protocol !== "v2" && props.sessionID &&
          effectiveModelState(editor.rules(), parsed.providerID, parsed.modelID) !== "allow"
        )
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
    if (props.protocol === "v2") {
      const current = policy()
      return current.mode === "allowlist" &&
        current.models.some((model) => model.providerID === providerID && model.id === modelID)
    }
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
    if (props.protocol === "v2") return policyEditor.set(providerID, modelID, allow)
    await editor.set(providerID, modelID, allow)
  }
  const canChange = () => props.supported && props.status === "success" && props.rulesReady && !saving()
  const canInherit = () => props.supported && props.rulesReady && !saving()
  const inherit = () => {
    if (!canInherit()) return
    if (!props.sessionID) return clearPending(pendingKey())
    if (props.protocol === "v2") return policyEditor.inherit()
    return editor.inherit()
  }

  return (
    <Dialog
      title={language.t("dialog.subagentModels.title")}
      description={language.t("dialog.subagentModels.description")}
    >
      <Show when={props.supported === false}>
        <p class="text-12-regular text-text-weak px-3" role="status">
          {language.t(props.protocol === "v2" ? "session.subagentModels.unsupported" : "dialog.subagentModels.unsupported")}
        </p>
      </Show>
      <Show when={props.protocol === "v2" ? policyEditor.state.failed : editor.state.failed}>
        <p class="text-12-regular text-text-weak px-3" role="alert">
          {language.t("dialog.subagentModels.saveFailed")}
        </p>
        <Show when={props.protocol === "v2"}>
          <button
            type="button" class="text-12-regular text-text-weak px-3"
            disabled={!canChange()} onClick={() => void policyEditor.retry()}
          >
            {language.t("common.retry")}
          </button>
        </Show>
      </Show>
      <Show when={props.loadFailed}>
        <p class="text-12-regular text-text-weak px-3" role="alert">
          {language.t("session.subagentModels.loadFailed")}
        </p>
        <button type="button" class="text-12-regular text-text-weak px-3" disabled={props.supported === false} onClick={props.onRetry}>
          {language.t("common.retry")}
        </button>
      </Show>
      <Show when={!props.loadFailed && props.supported !== false && (!props.rulesReady || props.supported === undefined)}>
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
          (!props.sessionID || props.protocol === "v2"
            ? denyAll()
            : models().length > 0 && models().every((model) => !isAllowed(model.provider.id, model.id)))
        }
      >
        <p class="text-12-regular text-text-weak px-3" role="status" data-status="none-allowed">
          {language.t(!props.sessionID || props.protocol === "v2" ? "session.subagentModels.denyAll" : "dialog.subagentModels.noneAllowed")}
        </p>
      </Show>
      <Show when={!inherited()}>
        <button class="text-12-regular text-text-weak px-3" type="button" disabled={!canInherit()} onClick={() => void inherit()}>
          {language.t("orchestra.agents.choice.inherit")}
        </button>
      </Show>
      <Show when={props.status !== "success"}>
        <p class="text-12-regular text-text-weak px-3" role={props.status === "error" ? "alert" : "status"}>
          {language.t(props.status === "error" ? "orchestra.agents.models.error" : "orchestra.agents.models.loading")}
        </p>
        <Show when={props.status === "error"}>
          <button type="button" class="text-12-regular text-text-weak px-3" disabled={props.supported === false} onClick={props.onRetry}>
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
          onKeyEvent={(event) => {
            if (event.key !== "Enter" || event.isComposing) return
            if (!(event.target instanceof HTMLButtonElement) || !event.target.matches('[data-slot="list-item"][data-key]')) return
            const key = event.target.getAttribute("data-key")
            const item = choices().find((choice) => `${choice.provider.id}:${choice.id}` === key)
            if (!item) return
            event.preventDefault()
            void setAllowed(item.provider.id, item.id, !isAllowed(item.provider.id, item.id))
          }}
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
                    props.status !== "success" ||
                    !props.rulesReady ||
                    (!!modelUnavailable(item.model) && !isAllowed(item.provider.id, item.id))
                  }
                  readOnly={saving()}
                  aria-disabled={saving() || undefined}
                  aria-busy={saving() || undefined}
                  onClick={(event: MouseEvent) => event.stopPropagation()}
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
