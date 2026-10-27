import { For, Show } from "solid-js"
import type { PermissionRequest } from "@/v2-types"
import { Button } from "@orchestra/ui/button"
import { DockPrompt } from "@orchestra/session-ui/dock-prompt"
import { Icon } from "@orchestra/ui/icon"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"
import { agentLabel } from "@/pages/session/timeline/orchestra-turn"
import { alwaysScope } from "./session-permission-scope"

export function SessionPermissionDock(props: {
  request: PermissionRequest
  responding: boolean
  onDecide: (response: "once" | "always" | "reject") => void
  onStop: () => void
}) {
  const language = useLanguage()
  const sync = useSync()

  const toolTitle = () => {
    const key = `settings.permissions.tool.${props.request.permission}.title`
    const value = language.t(key as Parameters<typeof language.t>[0])
    if (value === key) return props.request.permission
    return value
  }

  const toolDescription = () => {
    const key = `settings.permissions.tool.${props.request.permission}.description`
    const value = language.t(key as Parameters<typeof language.t>[0])
    if (value === key) return ""
    return value
  }

  // The seat that asked is the owner of the request's session; a subagent's request names the subagent.
  const askedBy = () => agentLabel(sync().data.session.find((item) => item.id === props.request.sessionID)?.agent)

  // A Relay hook's Ask carries the hook's own words, and each one takes a live reply, so it offers no "always".
  const hookAsk = () => props.request.metadata?.action === "relay_hook"
  const hookMessage = () => {
    const message = props.request.metadata?.message
    return hookAsk() && typeof message === "string" ? message : ""
  }

  const scope = () => (hookAsk() ? undefined : alwaysScope(props.request.always))

  return (
    <DockPrompt
      kind="permission"
      header={
        <div data-slot="permission-row" data-variant="header">
          <span data-slot="permission-icon">
            <Icon name="warning" size="normal" />
          </span>
          <div data-slot="permission-header-title">{language.t("notification.permission.title")}</div>
        </div>
      }
      footer={
        <>
          <Button variant="ghost" size="normal" data-action="prompt-stop-run" onClick={() => props.onStop()}>
            {language.t("orchestra.chat.stop")}
          </Button>
          <div data-slot="permission-footer-actions">
            <Button variant="ghost" size="normal" onClick={() => props.onDecide("reject")} disabled={props.responding}>
              {language.t("ui.permission.deny")}
            </Button>
            <Show when={scope()}>
              <Button
                variant="secondary"
                size="normal"
                onClick={() => props.onDecide("always")}
                disabled={props.responding}
              >
                {language.t("orchestra.chat.permission.allowProject")}
              </Button>
            </Show>
            <Button variant="primary" size="normal" onClick={() => props.onDecide("once")} disabled={props.responding}>
              {language.t("ui.permission.allowOnce")}
            </Button>
          </div>
        </>
      }
    >
      <Show when={askedBy()}>
        {(agent) => (
          <div data-slot="permission-row">
            <span data-slot="permission-spacer" aria-hidden="true" />
            <div data-slot="permission-hint">{language.t("orchestra.chat.permission.askedBy", { agent: agent() })}</div>
          </div>
        )}
      </Show>

      <Show when={hookMessage()}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-hint">{hookMessage()}</div>
        </div>
      </Show>

      <div data-slot="permission-row">
        <span data-slot="permission-spacer" aria-hidden="true" />
        <div data-slot="permission-hint">
          {toolTitle()}
          <Show when={toolDescription()}>{` · ${toolDescription()}`}</Show>
        </div>
      </div>

      <Show when={props.request.patterns.length > 0}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div>
            <div data-slot="permission-hint">{language.t("orchestra.chat.permission.requested")}</div>
            <div data-slot="permission-patterns">
              <For each={props.request.patterns}>
                {(pattern) => (
                  <code class="text-12-regular text-text-base break-all whitespace-pre-wrap">{pattern}</code>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>

      <Show when={scope()}>
        {(value) => (
          <div data-slot="permission-row">
            <span data-slot="permission-spacer" aria-hidden="true" />
            <div data-slot="permission-hint">
              {language.t(
                value() === "any" ? "orchestra.chat.permission.scope.any" : "orchestra.chat.permission.scope.exact",
                { tool: toolTitle() },
              )}
            </div>
          </div>
        )}
      </Show>
    </DockPrompt>
  )
}
