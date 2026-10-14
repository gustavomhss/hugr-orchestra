import { createEffect, createUniqueId, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { ViewProps } from "./contract"
import { createResourceScopes, defaultResourceScope, resourceScopeOptions } from "./resource-scopes"

/** Shared native scope control for variable browsing and create/replace forms. */
export function ResourceScopeField(p: ViewProps & {
  value?: string
  name?: string
  filter?: boolean
  disabled?: boolean
  locked?: boolean
  onChange?: (scope: string) => void
}) {
  const id = createUniqueId()
  const scopes = createResourceScopes(p.model)
  const provider = () => p.model.state.binding?.provider.kind ?? "github"
  const initial = () => p.value ?? (p.filter && provider() === "gitlab" ? "" : defaultResourceScope(provider()))
  const [selection, setSelection] = createStore({ value: initial() })
  createEffect(() => setSelection("value", initial()))
  const options = () => resourceScopeOptions(provider(), scopes.names, [
    ...(p.model.state.resources.value?.items ?? []).filter((item) => item.kind === "variables" && item.bindingID === p.model.state.binding?.id)
      .flatMap((item) => item.scope === undefined ? [] : [item.scope]),
    ...(selection.value ? [selection.value] : []),
  ])
  const label = (value: string) => value === defaultResourceScope(provider())
    ? p.t(provider() === "github" ? "orchestra.actions.repositoryScope" : "orchestra.actions.project") : value
  const change = (value: string) => {
    if (p.disabled || p.locked) return
    setSelection("value", value)
    p.onChange?.(value)
  }
  return <div class="ad-scope-field" aria-busy={scopes.status === "loading"}>
    <label class="mx-field" for={id}>
      <span>{p.t("orchestra.actions.scope")}</span>
      <Show when={provider() === "github" && p.locked} fallback={<>
        <input id={id} name={p.name} list={`${id}-options`} value={selection.value} required={!p.filter} maxLength={1024}
          disabled={p.disabled} readOnly={p.locked} dir="auto" autocomplete="off" aria-describedby={`${id}-status`}
          placeholder={p.filter && provider() === "gitlab" ? p.t("orchestra.actions.all") : undefined} onChange={(event) => change(event.currentTarget.value)} />
        <datalist id={`${id}-options`}><For each={options()}>{(value) => <option value={value} label={label(value)} dir="auto" />}</For></datalist>
      </>}>
        <select id={id} name={p.name} required={!p.filter} disabled={p.disabled || p.locked}
          aria-describedby={`${id}-status`} onChange={(event) => change(event.currentTarget.value)}>
          <For each={options()}>{(value) => <option value={value} selected={value === selection.value} dir="auto">{label(value)}</option>}</For>
        </select>
        <Show when={p.locked}><input type="hidden" name={p.name} value={selection.value} /></Show>
      </Show>
    </label>
    <div id={`${id}-status`}>
      <Show when={scopes.status === "loading"}><small role="status">{p.t("orchestra.actions.environments")} · {p.t("orchestra.actions.loading")}</small></Show>
      <Show when={scopes.status === "error"}><small role="alert">{p.t("orchestra.actions.environments")} · {p.t(scopes.error?.message ?? "orchestra.actions.providerRequestFailed")}</small></Show>
      <Show when={scopes.truncated || scopes.error?.kind === "metadata_truncated"}><small role="status">{p.t("orchestra.actions.resourceScopesTruncated")}</small></Show>
    </div>
  </div>
}
