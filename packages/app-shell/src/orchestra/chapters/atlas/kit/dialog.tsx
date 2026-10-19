import { For, type JSX, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasFact } from "../atlas-model"
import { type AtlasReq, Icon, NewDot, Second, StateChip, useAtlasWords } from "./chips"
import { highlight, num } from "./format"
import type { AtlasIconName } from "./icons"

// Layout parts of specs/atlas-ui/mock/ui.js (A.btn, A.bar, A.meter, A.empty, A.tech, A.code) and the shared
// helpers of mock/views.js (acc, kpi, seven, factRow).

// A write button stays visible on a read-only store, disabled, with the reason as its tooltip.
export function Btn(props: {
  label?: string
  onClick?: (event: MouseEvent) => void
  primary?: boolean
  icon?: AtlasIconName
  disabled?: boolean
  tip?: string
  ariaLabel?: string
  cap?: AtlasReq
  write?: boolean
  type?: "button" | "submit"
}) {
  const atlas = useAtlas()
  const words = useAtlasWords()
  const locked = () => {
    const model = atlas.model()
    return !!props.write && !!model && !model.writable()
  }
  return (
    <button
      type={props.type ?? "button"}
      class={`mx-btn${props.primary ? " primary" : ""}${props.icon && !props.label ? " icon" : ""}`}
      disabled={locked() || props.disabled}
      data-tip={locked() ? words.refusal("untrusted-store") : props.tip}
      aria-label={props.ariaLabel}
      onClick={(event) => props.onClick?.(event)}
    >
      <Show when={props.icon}>{(name) => <Icon name={name()} />}</Show>
      {props.label}
      <Show when={props.cap}>{(id) => <NewDot id={id()} />}</Show>
    </button>
  )
}

// A distribution bar: one segment per [tone, value] with a positive value.
export function Bar(props: { parts: readonly (readonly [string, number])[]; class?: string }) {
  return (
    <span class={props.class ? `at-bar ${props.class}` : "at-bar"}>
      <For each={props.parts.filter((part) => part[1] > 0)}>
        {(part) => <i class={part[0]} style={{ flex: String(part[1]) }} />}
      </For>
    </span>
  )
}

export function Meter(props: { label: string; value: number; cap: number; tone?: string }) {
  return (
    <div class={props.tone ? `at-meter ${props.tone}` : "at-meter"}>
      <div class="at-meter-top">
        <span>{props.label}</span>
        <span>
          <b>{num(props.value)}</b> / {num(props.cap)}
        </span>
      </div>
      <div class="at-meter-track">
        <i style={{ "inline-size": `${Math.min(100, (props.value / props.cap) * 100)}%` }} />
      </div>
    </div>
  )
}

export function Empty(props: { title: string; children: JSX.Element; action?: JSX.Element }) {
  return (
    <div class="mx-empty">
      <strong>{props.title}</strong>
      <p>{props.children}</p>
      {props.action}
    </div>
  )
}

// Technical details: hashes, Atlas codes and file paths live only here. Falsy rows are skipped.
export function Tech(props: { rows: readonly (readonly [string, JSX.Element] | false | null | undefined)[]; label?: string }) {
  const language = useLanguage()
  return (
    <details class="ins-tech">
      <summary>
        <Icon name="chev" />
        {props.label ?? language.t("orchestra.atlas.kit.tech")}
      </summary>
      <dl class="at-kv">
        <For each={props.rows.filter((row): row is readonly [string, JSX.Element] => !!row)}>
          {(row) => (
            <>
              <dt>{row[0]}</dt>
              <dd>{row[1]}</dd>
            </>
          )}
        </For>
      </dl>
    </details>
  )
}

// A code excerpt with line numbers. `highlight` lists highlighted line numbers; `kinds` adds a class per line.
export function Code(props: {
  file: string
  start: number
  lines: readonly string[]
  highlight?: readonly number[]
  kinds?: Record<number, string>
  sha?: string
  head?: JSX.Element
}) {
  return (
    <div class="at-code">
      <div class="at-code-head">
        <span>
          {props.file}
          {props.sha ? ` @ ${props.sha}` : ""}
        </span>
        {props.head}
      </div>
      <pre>
        <For each={props.lines}>
          {(text, index) => (
            <div
              class={`ln ${props.highlight?.includes(props.start + index()) ? "hl" : ""} ${props.kinds?.[props.start + index()] ?? ""}`}
            >
              <span>{props.start + index()}</span>
              {/* highlight() escapes the line before adding its spans. */}
              <span innerHTML={highlight(text)} />
            </div>
          )}
        </For>
      </pre>
    </div>
  )
}

export function Kpi(props: { label: string; value: JSX.Element; foot: JSX.Element; tone?: string }) {
  return (
    <div class={props.tone ? `at-kpi ${props.tone}` : "at-kpi"}>
      <span>{props.label}</span>
      <b>{props.value}</b>
      <small>{props.foot}</small>
    </div>
  )
}

// Remembers whether a <details> section is open, per id, in this browser only (the mock's data-acc). Use it as the
// element's ref and do not also pass `open`: rememberOpen("unit-briefing", true).
export function rememberOpen(id: string, fallback = false) {
  return (element: HTMLDetailsElement) => {
    element.dataset.acc = id
    element.open = readOpen(id) ?? fallback
    element.addEventListener("toggle", () => writeOpen(id, element.open))
  }
}

export function Acc(props: {
  id: string
  icon: AtlasIconName
  title: JSX.Element
  purpose: JSX.Element
  summary?: JSX.Element
  open?: boolean
  children: JSX.Element
}) {
  return (
    <details class="at-acc" ref={rememberOpen(props.id, props.open)}>
      <summary>
        <span class="at-acc-ic">
          <Icon name={props.icon} />
        </span>
        <span class="at-acc-t">
          <strong>{props.title}</strong>
          <small>{props.purpose}</small>
        </span>
        <span class="at-acc-sum">{props.summary}</span>
        <Icon name="chev" class="at-acc-chev" />
      </summary>
      <div class="at-acc-body">{props.children}</div>
    </details>
  )
}

// The first `first` rows (7 by default), then "Show N more"; the count lives in the query as n-<id>.
export function Seven<T>(props: { id: string; rows: readonly T[]; first?: number; children: (row: T) => JSX.Element }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const shown = () => Number(atlas.route().query[`n-${props.id}`] ?? props.first ?? 7)
  return (
    <>
      <For each={props.rows.slice(0, shown())}>{(row) => props.children(row)}</For>
      <Show when={props.rows.length > shown()}>
        <div class="at-more">
          <span>{language.t("orchestra.atlas.kit.more", { count: num(props.rows.length - shown()) })}</span>
          <Btn
            label={language.t("orchestra.atlas.kit.showMore", { count: Math.min(25, props.rows.length - shown()) })}
            onClick={() => atlas.setQuery({ [`n-${props.id}`]: String(shown() + 25) }, true)}
          />
        </div>
      </Show>
    </>
  )
}

// A fact row: the sentence on one line, the file as text, at most two chips (state, then tier or family).
export function FactRow(props: { fact: AtlasFact; noFile?: boolean; short?: boolean; extra?: JSX.Element }) {
  const atlas = useAtlas()
  const state = () =>
    props.fact.kind === "candidate" && !props.fact.promotedNow ? "pending" : (atlas.model()?.state(props.fact) ?? "fresh")
  return (
    <div
      class="at-item"
      classList={{ selected: atlas.route().query.fact === props.fact.key }}
      data-action="open"
      data-value={props.fact.key}
      tabindex="0"
      role="button"
      onClick={() => atlas.open(props.fact.key)}
    >
      <StateChip state={state()} />
      <div class="at-item-main">
        <div class="at-item-text clamp">{props.fact.claim}</div>
        <div class="at-item-meta">
          <Show when={!props.noFile}>
            <span class="at-meta-file">{props.short ? props.fact.file.split("/").at(-1) : props.fact.file}</span>
          </Show>
          <Show when={props.fact.slot}>{(slot) => <span>{slot()}</span>}</Show>
          {props.extra}
        </div>
      </div>
      <Second fact={props.fact} />
    </div>
  )
}

// localStorage can be absent or throw (private mode, quota); a failure only forgets the section state.
function readOpen(id: string) {
  try {
    const value = localStorage.getItem(`atlas-acc:${id}`)
    return value === null ? undefined : value === "1"
  } catch {
    return undefined
  }
}

function writeOpen(id: string, open: boolean) {
  try {
    localStorage.setItem(`atlas-acc:${id}`, open ? "1" : "0")
  } catch {
    return
  }
}
</write> 
<|start|><|start|>assistant to=write<|channel|>analysis <|constrain|>xml<|message|><rfl:parameter name="content">
import { type JSX, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"

// One native modal dialog (the mock's #dialog and its head()/foot()), like chapters/skills-dialog.tsx. The owner
// mounts it to open it and unmounts it in onClose; Escape, the backdrop and Cancel all close it.
export function AtDialog(props: {
  title: string
  text?: string
  wide?: boolean
  onClose: () => void
  onSubmit?: (event: SubmitEvent & { currentTarget: HTMLFormElement }) => void
  children: JSX.Element
  footer?: JSX.Element
}) {
  let dialog!: HTMLDialogElement
  onMount(() => {
    dialog.showModal()
    dialog.querySelector<HTMLElement>("textarea, input")?.focus()
  })
  return (
    <dialog
      ref={dialog}
      class="mx-dialog"
      classList={{ wide: !!props.wide }}
      aria-labelledby="atlas-dialog-title"
      // A Kobalte layer behind this modal can take Escape on the document; the modal is the top layer, so it takes it first.
      on:keydown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return
        event.preventDefault()
        dialog.close()
      }}
      onClose={() => props.onClose()}
      onClick={(event) => {
        if (event.target !== dialog) return
        const rect = dialog.getBoundingClientRect()
        const inside =
          event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
        if (!inside) dialog.close()
      }}
    >
      <form
        autocomplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          props.onSubmit?.(event)
        }}
      >
        <header class="mx-dialog-head">
          <div>
            <h2 id="atlas-dialog-title">{props.title}</h2>
            <Show when={props.text}>
              <p>{props.text}</p>
            </Show>
          </div>
        </header>
        <div class="mx-dialog-body">{props.children}</div>
        {props.footer}
      </form>
    </dialog>
  )
}

// The sheet footer: a note on the left, Cancel, then the primary action.
export function AtDialogFoot(props: {
  note?: JSX.Element
  label: string
  onConfirm: () => void
  onCancel: () => void
  disabled?: boolean
}) {
  const language = useLanguage()
  return (
    <footer class="mx-dialog-foot">
      <span class="at-foot-note">{props.note}</span>
      <button type="button" class="mx-btn" onClick={() => props.onCancel()}>
        {language.t("orchestra.atlas.kit.cancel")}
      </button>
      <button type="button" class="mx-btn primary" disabled={props.disabled} onClick={() => props.onConfirm()}>
        {props.label}
      </button>
    </footer>
  )
}
