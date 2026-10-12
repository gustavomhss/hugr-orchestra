import { createMemo, For, Show } from "solid-js"
import { LeanCoverage } from "@orchestra/schema/lean-coverage"
import { useLanguage } from "@/context/language"
import { leanNumber, leanTime } from "./lean-format"
import type { LeanViewProps } from "./lean-view-contract"

export function LeanDetail(props: LeanViewProps & { itemID: LeanCoverage.ItemID; onClose: () => void }) {
  const language = useLanguage()
  const history = createMemo(() => {
    const value = props.history
    if (value?.scope.profileID !== props.data?.scope.profileID || value?.itemID !== props.itemID) return
    return value
  })
  const number = (value: number | null) => leanNumber(value, language.intl(), language.t("lean.unavailable"), true)
  return (
    <section
      class="lean-detail"
      id={`lean-history-${props.itemID}`}
      aria-label={language.t("lean.page.history")}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return
        event.stopPropagation()
        props.onClose()
      }}
    >
      <header>
        <h3>{language.t("lean.page.history")}</h3>
        <button type="button" class="mx-link" onClick={props.onClose}>
          {language.t("lean.page.close")}
        </button>
      </header>
      <Show when={LeanCoverage.items.find((item) => item.id === props.itemID)?.mode === "preserve"}>
        <p class="lean-notice">
          {language.t(
            props.itemID === "jest" || props.itemID === "vitest"
              ? "lean.page.plaintextPreserveNote"
              : "lean.page.preserveNote",
          )}
        </p>
      </Show>
      <Show when={props.historyError}>
        <p class="mx-error" role="alert">
          {props.historyError}
        </p>
        <button
          type="button"
          class="mx-btn"
          disabled={props.historyLoading}
          onClick={() => props.onHistory(props.itemID)}
        >
          {language.t("lean.page.refresh")}
        </button>
      </Show>
      <Show
        when={!props.historyLoading && history()}
        fallback={
          <p class="lean-notice" role="status">
            {language.t(props.historyLoading ? "lean.page.loading" : "lean.page.historyUnavailable")}
          </p>
        }
      >
        {(data) => (
          <>
            <Show when={!data().complete}>
              <p class="lean-notice">{language.t("lean.page.partial")}</p>
            </Show>
            <Show
              when={data().executions.length}
              fallback={
                <p class="lean-notice" role="status">
                  {language.t("lean.page.historyEmpty")}
                </p>
              }
            >
              <ol class="lean-executions">
                <For each={data().executions}>
                  {(execution) => (
                    <li data-lean-execution={execution.callID}>
                      <code>{execution.command}</code>
                      <Show when={execution.commandTruncated}>
                        <span class="mx-badge">{language.t("lean.page.commandTruncated")}</span>
                      </Show>
                      <div class="lean-execution-meta">
                        <Show
                          when={leanTime(execution.time, language.intl())}
                          fallback={<span>{language.t("lean.unavailable")}</span>}
                        >
                          {(time) => <time dateTime={time().iso}>{time().label}</time>}
                        </Show>
                        <span class={execution.status === "error" ? "mx-badge bad" : "mx-badge good"}>
                          {language.t(`lean.page.status.${execution.status}`)}
                        </span>
                        <Show when={execution.exit !== null}>
                          <span>{language.t("lean.page.exit", { code: execution.exit! })}</span>
                        </Show>
                        <Show when={props.onOpenSession}>
                          <button
                            type="button"
                            class="mx-link"
                            onClick={() => props.onOpenSession?.(execution.sessionID)}
                          >
                            {language.t("lean.page.openSession")}
                          </button>
                        </Show>
                      </div>
                      <dl class="lean-execution-savings">
                        <div>
                          <dt>{language.t("lean.page.bytes")}</dt>
                          <dd
                            data-lean-value="bytes"
                            data-tone={
                              execution.bytesSaved !== null && execution.bytesSaved < 0 ? "negative" : undefined
                            }
                          >
                            {number(execution.bytesSaved)}
                          </dd>
                        </div>
                        <div>
                          <dt>{language.t("lean.page.tokens")}</dt>
                          <dd
                            data-lean-value="tokens"
                            data-tone={
                              execution.tokensSaved !== null && execution.tokensSaved < 0 ? "negative" : undefined
                            }
                          >
                            {number(execution.tokensSaved)}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  )}
                </For>
              </ol>
            </Show>
          </>
        )}
      </Show>
    </section>
  )
}
