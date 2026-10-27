import { createResource, createSignal, For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsSec } from "./settings-sec"

// Folders the global config trusts. A trusted project's own local MCP servers, plugins and formatters run; a revoked
// one stops its running local MCP servers.
export function TrustedProjectsSection() {
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const [trusted, { refetch }] = createResource(() => serverSDK().orchestra["server.trust"].list())
  const [revoking, setRevoking] = createSignal<string>()
  const revoke = (directory: string) => {
    setRevoking(directory)
    void serverSDK()
      .orchestra["server.trust"].revoke({ directory })
      .then(() => refetch())
      .catch((err: unknown) =>
        showToast({
          title: language.t("orchestra.settings.trust.revokeFailed"),
          description: err instanceof Error ? err.message : String(err),
        }),
      )
      .finally(() => setRevoking(undefined))
  }

  return (
    <SettingsSec
      title={language.t("orchestra.settings.trust.title")}
      description={language.t("orchestra.settings.trust.description")}
    >
      <Switch>
        <Match when={trusted.error}>
          <div class="mx-empty" role="alert">
            <p>{language.t("orchestra.settings.trust.loadFailed")}</p>
            <button type="button" class="mx-btn" onClick={() => void refetch()}>
              {language.t("orchestra.mcp.retry")}
            </button>
          </div>
        </Match>
        <Match when={trusted()}>
          {(list) => (
            <Show
              when={list().length > 0}
              fallback={<div class="mx-empty" role="status">{language.t("orchestra.settings.trust.empty")}</div>}
            >
              <div class="mx-table">
                <For each={list()}>
                  {(directory) => (
                    <div class="mx-row" data-trust={directory}>
                      <div class="mx-grow">
                        <strong>
                          <bdi>{directory}</bdi>
                        </strong>
                      </div>
                      <button
                        type="button"
                        class="mx-btn"
                        aria-label={language.t("orchestra.settings.trust.revokeLabel", { project: directory })}
                        disabled={revoking() !== undefined}
                        onClick={() => revoke(directory)}
                      >
                        {language.t("orchestra.settings.trust.revoke")}
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          )}
        </Match>
        <Match when={true}>
          <div class="mx-empty" role="status">
            {language.t("orchestra.settings.trust.loading")}
          </div>
        </Match>
      </Switch>
    </SettingsSec>
  )
}
