import { createEffect, createMemo, For, Show } from "solid-js"
import { Icon } from "@orchestra/ui/icon"
import { createStore } from "solid-js/store"
import { LeanCoverage } from "@orchestra/schema/lean-coverage"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import { useLanguage } from "@/context/language"
import { MxBadge, MxPage, MxToggle } from "./kit"
import { leanBytes, leanNumber, leanTokens } from "./lean-format"
import { LeanDetail } from "./lean-detail"
import type { LeanViewProps } from "./lean-view-contract"
import "./lean.css"

export function LeanProfileView(props: LeanViewProps) {
  const language = useLanguage()
  const [state, setState] = createStore({ failed: undefined as symbol | undefined })
  const profileID = createMemo(() => props.data?.scope.profileID)
  const generation = createMemo(() => Symbol(profileID()))
  createEffect(() => {
    generation()
    setState("failed", undefined)
  })
  const number = (value: number | null | undefined, signed = false) =>
    leanNumber(
      value,
      language.intl(),
      language.t(props.loading && !props.data ? "lean.page.loading" : "lean.unavailable"),
      signed,
    )
  const update = (value: LeanDashboard.Update) => {
    if (!profileID()) return
    const started = generation()
    setState("failed", undefined)
    const save = async () => {
      await props.onUpdate(value)
    }
    void save().catch(() => {
      if (generation() === started) setState("failed", started)
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
            <dd>
              <LeanValue kind="bytes" savings={props.data?.savings} total loading={props.loading} />
            </dd>
          </div>
          <div class="lean-total">
            <dt>{language.t("lean.page.tokens")}</dt>
            <dd>
              <LeanValue kind="tokens" savings={props.data?.savings} total loading={props.loading} />
            </dd>
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
              <Show when={props.data}>{(data) => <span class="lean-count-total"> / {number(data().items.length)}</span>}</Show>
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
        <Show when={state.failed === generation()}>
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
  const [state, setState] = createStore({
    search: "",
    category: "all",
    detail: undefined as LeanCoverage.ItemID | undefined,
  })
  const open = (itemID: LeanCoverage.ItemID) => {
    if (state.detail === itemID) return void setState("detail", undefined)
    setState("detail", itemID)
    props.onHistory(itemID)
  }
  const close = (itemID: LeanCoverage.ItemID) => {
    setState("detail", undefined)
    document.getElementById(`lean-trigger-${itemID}`)?.focus()
  }
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
  const icons = {
    build: "console",
    test: "checklist",
    lint: "code",
    install: "download",
    search: "magnifying-glass",
  } as const
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
                <>
                  <tr data-lean-item={item.id} aria-busy={props.pending?.has(item.id)}>
                    <th scope="row">
                      <button
                        id={`lean-trigger-${item.id}`}
                        type="button"
                        class="mx-link lean-item"
                        aria-expanded={state.detail === item.id}
                        aria-controls={state.detail === item.id ? `lean-history-${item.id}` : undefined}
                        onClick={() => open(item.id)}
                      >
                        <span class="mx-mark" aria-hidden="true">
                          <Icon name={icons[catalog.category]} size="small" />
                        </span>
                        <bdi>{catalog.label}</bdi>
                        <Show when={catalog.mode === "preserve"}>
                          <MxBadge>
                            {language.t(
                              item.id === "jest" || item.id === "vitest"
                                ? "lean.page.plaintextPreserve"
                                : "lean.page.preserve",
                            )}
                          </MxBadge>
                        </Show>
                      </button>
                    </th>
                    <td>
                      <LeanValue kind="bytes" savings={item.savings} />
                    </td>
                    <td>
                      <LeanValue kind="tokens" savings={item.savings} />
                    </td>
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
                  <Show when={state.detail === item.id}>
                    <tr class="lean-detail-row">
                      <td colSpan={4}>
                        <LeanDetail {...props} itemID={item.id} onClose={() => close(item.id)} />
                      </td>
                    </tr>
                  </Show>
                </>
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

function LeanValue(props: {
  kind: "bytes" | "tokens"
  savings?: LeanDashboard.Savings
  total?: boolean
  loading?: boolean
}) {
  const language = useLanguage()
  const value = () => (props.kind === "bytes" ? props.savings?.bytesSaved : leanTokens(props.savings))
  const unavailable = () => language.t(props.loading && !props.savings ? "lean.page.loading" : "lean.unavailable")
  const tone = () => {
    const number = value()
    if (number === null || number === undefined || !Number.isSafeInteger(number)) return "unavailable"
    return number < 0 ? "negative" : "default"
  }
  const exact = () =>
    props.kind === "bytes" && tone() !== "unavailable"
      ? language.t("lean.page.exactBytes", { value: leanNumber(value(), language.intl(), unavailable(), true) })
      : undefined
  return (
    <>
      <span
        data-lean-total={props.total ? props.kind : undefined}
        data-lean-value={!props.total ? props.kind : undefined}
        data-tone={tone()}
        title={exact()}
        aria-label={exact()}
      >
        {props.kind === "bytes"
          ? leanBytes(value(), language.intl(), unavailable())
          : leanNumber(value(), language.intl(), unavailable(), true)}
      </span>
      <Show when={props.kind === "tokens" && props.savings && props.savings.tokenCalls < props.savings.calls}>
        <small class="lean-coverage" data-lean-coverage>
          {language.t("lean.page.tokenCoverage", {
            measured: leanNumber(props.savings?.tokenCalls, language.intl(), unavailable()),
            calls: leanNumber(props.savings?.calls, language.intl(), unavailable()),
          })}
        </small>
      </Show>
    </>
  )
}
