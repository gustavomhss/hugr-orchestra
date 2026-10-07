import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { Switch } from "@opencode-ai/ui/switch"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Show, type Component } from "solid-js"
import { useLocal } from "@/context/local"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useSync } from "@/context/sync"
import { ModelTooltip } from "./model-tooltip"
import { effectiveModelState, toggleModelRules, type ModelRule } from "./subagent-model-rules"
import { draftVersion, modelKey, pendingSelection, togglePending } from "./draft-subagent-models"

type ModelItem = ReturnType<ReturnType<typeof useLocal>["model"]["list"]>[number]

export const DialogSubagentModels: Component<{ sessionID?: string; directory: string }> = (props) => {
  const local = useLocal()
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const sync = useSync()

  const sessionRules = (): ModelRule[] => {
    if (!props.sessionID) return []
    return (sync().session.get(props.sessionID)?.permission ?? []) as ModelRule[]
  }

  const isAllowed = (providerID: string, modelID: string) => {
    // Drafts have no session yet: truth is the pending selection.
    // draftVersion() subscribes so plain-Set mutations re-render.
    if (!props.sessionID) {
      draftVersion()
      return pendingSelection(props.directory).has(modelKey(providerID, modelID))
    }
    return effectiveModelState(sessionRules(), providerID, modelID) === "allow"
  }

  const setAllowed = async (providerID: string, modelID: string, allow: boolean) => {
    if (!props.sessionID) {
      togglePending(props.directory, providerID, modelID)
      return
    }
    if ((await serverSDK().protocol) !== "v1") return
    await serverSDK().client.session.update({
      sessionID: props.sessionID,
      directory: props.directory,
      permission: toggleModelRules(sessionRules(), providerID, modelID, allow),
    })
  }

  return (
    <Dialog
      title={language.t("dialog.subagentModels.title")}
      description={language.t("dialog.subagentModels.description")}
    >
      <List
        class="px-3"
        search={{ placeholder: language.t("dialog.model.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.model.empty")}
        key={(x) => `${x?.provider?.id}:${x?.id}`}
        items={local.model.list().filter((m) => local.model.visible({ modelID: m.id, providerID: m.provider.id }))}
        filterKeys={["provider.name", "name", "id"]}
        sortBy={(a, b) => a.name.localeCompare(b.name)}
        groupBy={(x) => x.provider.name}
        groupHeader={(group) => <span>{group.items[0]?.provider.name}</span>}
        itemWrapper={(item, node) => (
          <Tooltip
            class="w-full"
            placement="right-start"
            gutter={12}
            openDelay={0}
            value={<ModelTooltip model={item} />}
          >
            {node}
          </Tooltip>
        )}
      >
        {(item: ModelItem) => (
          <div class="w-full flex items-center gap-x-2 text-13-regular">
            <span class="truncate">{item.name}</span>
            <Switch
              class="-mr-1 ml-auto"
              checked={isAllowed(item.provider.id, item.id)}
              onChange={(checked) => void setAllowed(item.provider.id, item.id, checked)}
              hideLabel
            >
              {item.name}
            </Switch>
          </div>
        )}
      </List>
      <div class="text-12-regular text-text-weak px-3 pb-1">{language.t("dialog.subagentModels.hint")}</div>
    </Dialog>
  )
}
