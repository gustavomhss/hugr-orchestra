import { createUniqueId, Show } from "solid-js"
import type { Translate } from "./contract"

export function Check(p: { t: Translate; label: string; name: string; checked: boolean; disabled: boolean; hint: string }) {
  const id = createUniqueId()
  return <label class={`check-field ${p.disabled ? "ad-disabled" : ""}`}>
    <input type="checkbox" name={p.name} value="true" checked={p.checked} disabled={p.disabled} aria-describedby={id} />
    <span><strong>{p.label}</strong><small id={id}>{p.hint}</small></span>
  </label>
}

export function Field(p: { t: Translate; label: string; name: string; value?: string; select?: readonly { value: string; label: string }[]; type?: "number" | "text"; min?: string; required?: boolean; sensitive?: boolean; mono?: boolean; disabled?: boolean; locked?: boolean; placeholder?: string; hint?: string }) {
  const id = createUniqueId()
  const hintID = createUniqueId()
  const attributes = { id, "aria-label": p.label, "aria-describedby": p.hint ? hintID : undefined }
  const control = p.select
    ? <><select name={p.name} {...attributes} disabled={p.disabled || p.locked} required={p.required}>
        <Show when={!p.select.some((option) => option.value === p.value)}><option value="" disabled selected>{p.t("orchestra.actions.chooseValue")}</option></Show>
        {p.select.map((option) => <option value={option.value} selected={option.value === p.value}>{option.label}</option>)}
      </select>{p.locked && <input type="hidden" name={p.name} value={p.value ?? ""} />}</>
    : <input name={p.name} value={p.value ?? ""} type={p.sensitive ? "password" : p.type ?? "text"} readOnly={p.locked}
        min={p.min} required={p.required} disabled={p.disabled} {...attributes}
        autocomplete={p.sensitive ? "new-password" : "off"} placeholder={p.placeholder}
        class={p.mono ? "ad-code" : undefined} dir={p.mono ? "ltr" : undefined} spellcheck={p.mono ? false : undefined} />
  return <label class="mx-field"><span>{p.label}{p.required && <span class="ad-required" aria-hidden="true">*</span>}</span>{control}{p.hint && <small id={hintID}>{p.hint}</small>}</label>
}
