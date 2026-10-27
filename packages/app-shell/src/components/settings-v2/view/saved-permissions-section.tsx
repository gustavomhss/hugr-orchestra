import { createResource, createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"
import { SettingsSec } from "./settings-sec"

// The "Allow always" rules saved for this project. Removing one makes that request ask again.
export function SavedPermissionsSection() {
  const language = useLanguage()
  const sdk = useSDK()
  const [saved, { refetch }] = createResource(() => sdk().api.permission.saved.list())
  const [removing, setRemoving] = createSignal<string>()

  const remove = (id: string) => {
    setRemoving(id)
    sdk()
      .api.permission.saved.remove({ id })
      .then(() => refetch())
      .catch((err: unknown) =>
        showToast({
          title: language.t("common.requestFailed"),
          description: err instanceof Error ? err.message : String(err),
        }),
      )
      .finally(() => setRemoving(undefined))
  }

  const toolName = (action: string) => {
    const key = `settings.permissions.tool.${action}.title`
    const value = language.t(key as Parameters<typeof language.t>[0])
    if (value === key) return action
    return value
  }

  return (
    <SettingsSec
      title={language.t("orchestra.settings.savedPermissions.title")}
      description={language.t("orchestra.settings.savedPermissions.description")}
    >
      <Show
        when={!saved.error}
        fallback={<div class="mx-empty">{language.t("orchestra.settings.savedPermissions.loadFailed")}</div>}
      >
        <Show
          when={saved()}
          fallback={<div class="mx-empty">{language.t("orchestra.settings.savedPermissions.loading")}</div>}
        >
          {(rows) => (
            <Show
              when={rows().length > 0}
              fallback={<div class="mx-empty">{language.t("orchestra.settings.savedPermissions.empty")}</div>}
            >
              <div class="perm-table">
                <For each={rows()}>
                  {(row) => (
                    <div class="perm-tool" data-saved-permission={row.id}>
                      <div>
                        <div class="tname">{toolName(row.action)}</div>
                        <div class="tdesc">
                          <code class="break-all">{row.resource}</code>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="mx-btn"
                        disabled={removing() === row.id}
                        onClick={() => remove(row.id)}
                      >
                        {language.t("orchestra.settings.savedPermissions.remove")}
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          )}
        </Show>
      </Show>
    </SettingsSec>
  )
}
