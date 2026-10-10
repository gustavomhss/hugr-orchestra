import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { LeanCoverage } from "@orchestra/schema/lean-coverage"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import { useLanguage } from "@/context/language"
import { MxBadge, MxPage, MxToggle } from "./kit"
import { leanNumber, leanTokens } from "./lean-format"
import type { LeanViewProps } from "./lean-view-contract"
import "./lean.css"

export function LeanProfileView(props: LeanViewProps) {
  const language = useLanguage()
  const [state, setState] = createStore({ failed: undefined as string | undefined })
  const number = (value: number | null | undefined, signed = false) =>
    leanNumber(
      value,
      language.intl(),
      language.t(props.loading && !props.data ? "lean.page.loading" : "lean.unavailable"),
      signed,
    )
  const update = (value: LeanDashboard.Update) => {
    const profileID = props.data?.scope.profileID
    if (!profileID) return
    setState("failed", undefined)
    void Promise.resolve()
      .then(() => props.onUpdate(value))
      .catch(() => {
        if (props.data?.scope.profileID === profileID) setState("failed", profileID)
      })
  }
  return (
    <MxPage
      id="orchestra-lean"
      eyebrow={language.t("lean.page.profile", { profile: props.profileName })}
      title={language.t("orchestra.nav.lean")}
      description={language.t("lean.page.description")}
      action={
        <Show when={props.data}>
          {(data) => (
            <div class="lean-control" aria-busy={props.pending?.has("profile")}>
              <span>{language.t("lean.page.profileToggle")}</span>
              <MxToggle
                checked={data().enabled}
                label={language.t("lean.page.profileToggleLabel", { profile: props.profileName })}
                disabled={props.loading || props.pending?.has("profile")}
                onChange={(enabled) => update({ enabled })}
              />
            </div>
          )}
        </Show>
      }
    >
      <div class="lean-page">
        <dl class="mx-card lean-summary" aria-label={language.t("lean.page.summary")}>
          <div class="lean-total">
            <dt>{language.t("lean.page.bytes")}</dt>
            <dd data-lean-total="bytes">{number(props.data?.savings.bytesSaved, true)}</dd>
          </div>
          <div class="lean-total">
            <dt>{language.t("lean.page.tokens")}</dt>
            <dd data-lean-total="tokens">{number(leanTokens(props.data?.savings), true)}</dd>
          </div>
          <div class="lean-count">
            <dt>{language.t("lean.page.calls")}</dt>
            <dd>{number(props.data?.savings.calls)}</dd>
          </div>
          <div class="lean-count">
            <dt>{language.t("lean.page.active")}</dt>
            <dd>
              {number(
                props.data
                  ? props.data.enabled
                    ? props.data.items.filter((item) => item.enabled).length
                    : 0
                  : undefined,
              )}
            </dd>
          </div>
        </dl>
        <div class="lean-caption">
          <p>{language.t("lean.page.scope")}</p>
          <button type="button" class="mx-link" disabled={props.loading} onClick={props.onRefresh}>
            {language.t("lean.page.refresh")}
          </button>
        </div>
        <Show when={props.error}>
          <p class="mx-error" role="alert">
            {props.error}
          </p>
        </Show>
        <Show when={state.failed && state.failed === props.data?.scope.profileID}>
          <p class="mx-error" role="alert">
            {language.t("lean.page.saveFailed")}
          </p>
        </Show>
        <Show
          when={props.data?.scope.profileID}
          keyed
          fallback={
            <div class="mx-empty" role="status">
              {language.t(props.loading ? "lean.page.loading" : "lean.page.unavailable")}
            </div>
          }
        >
          {(_profileID) => <LeanItems {...props} onUpdate={update} />}
        </Show>
      </div>
    </MxPage>
  )
}

function LeanItems(props: LeanViewProps) {
  const language = useLanguage()
  const [state, setState] = createStore({ search: "", category: "all" })
  const categories = ["build", "test", "lint", "install", "search"] as const
  const rows = createMemo(() =>
    LeanCoverage.items.flatMap((catalog) => {
      const item = props.data?.items.find((item) => item.id === catalog.id)
      if (!item || (state.category !== "all" && catalog.category !== state.category)) return []
      if (
        !catalog.label
          .toLocaleLowerCase(language.intl())
          .includes(state.search.trim().toLocaleLowerCase(language.intl()))
      )
        return []
      return [{ catalog, item }]
    }),
  )
  const number = (value: number | null | undefined) =>
    leanNumber(value, language.intl(), language.t("lean.unavailable"), true)
  return (
    <>
      <div class="mx-toolbar lean-toolbar">
        <input
          type="search"
          class="mx-search"
          aria-label={language.t("lean.page.search")}
          placeholder={language.t("lean.page.search")}
          value={state.search}
          onInput={(event) => setState("search", event.currentTarget.value)}
        />
        <label class="mx-field lean-category">
          <span class="sr-only">{language.t("lean.page.category")}</span>
          <select value={state.category} onChange={(event) => setState("category", event.currentTarget.value)}>
            <option value="all">{language.t("lean.page.category.all")}</option>
            <For each={categories}>
              {(category) => <option value={category}>{language.t(`lean.page.category.${category}`)}</option>}
            </For>
          </select>
        </label>
      </div>
      <Show when={!props.data?.enabled}>
        <p class="lean-notice" role="status">
          {language.t("lean.page.paused")}
        </p>
      </Show>
      <Show when={!props.data?.complete}>
        <p class="lean-notice" role="status">
          {language.t("lean.page.partial")}
        </p>
      </Show>
      <div class="mx-table lean-table-wrap" tabIndex={0} role="region" aria-label={language.t("lean.page.items")}>
        <table class="lean-table">
          <caption class="sr-only">{language.t("lean.page.items")}</caption>
          <thead>
            <tr>
              <th scope="col">{language.t("lean.page.item")}</th>
              <th scope="col">{language.t("lean.page.bytes")}</th>
              <th scope="col">{language.t("lean.page.tokens")}</th>
              <th scope="col">{language.t("lean.page.onOff")}</th>
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {({ catalog, item }) => (
                <tr data-lean-item={item.id} aria-busy={props.pending?.has(item.id)}>
                  <th scope="row">
                    <button type="button" class="mx-link lean-item" onClick={() => props.onHistory(item.id)}>
                      <span class="mx-mark" aria-hidden="true">
                        {catalog.label.slice(0, 2)}
                      </span>
                      <bdi>{catalog.label}</bdi>
                      <Show when={catalog.mode === "preserve"}>
                        <MxBadge>{language.t("lean.page.preserve")}</MxBadge>
                      </Show>
                    </button>
                  </th>
                  <td data-lean-value="bytes">{number(item.savings.bytesSaved)}</td>
                  <td data-lean-value="tokens">{number(leanTokens(item.savings))}</td>
                  <td>
                    <MxToggle
                      checked={item.enabled}
                      disabled={props.loading || props.pending?.has("profile") || props.pending?.has(item.id)}
                      label={language.t("lean.page.itemToggle", { item: catalog.label })}
                      onChange={(enabled) => {
                        void props.onUpdate({ itemID: item.id, enabled })
                      }}
                    />
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={!rows().length}>
          <p class="lean-empty" role="status">
            {language.t(props.data?.items.length ? "lean.page.noMatches" : "lean.page.empty")}
          </p>
        </Show>
      </div>
      <p class="mx-note">{language.t("lean.page.estimate")}</p>
    </>
  )
}
