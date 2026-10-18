import type { JSX } from "solid-js"
import { Show } from "solid-js"
import "./kit.css"

// Page frame shared by the capability screens (mock `.mx-page`): eyebrow, title, description,
// one header action, then the body.
export function MxPage(props: {
  id: string
  eyebrow?: string
  title: string
  description: string
  action?: JSX.Element
  children: JSX.Element
}) {
  return (
    <section class="mx-page" aria-labelledby={`${props.id}-title`} data-mx-page={props.id}>
      <div class="mx-inner">
        <header class="mx-heading">
          <div>
            <Show when={props.eyebrow}>
              <div class="mx-eyebrow">{props.eyebrow}</div>
            </Show>
            <h1 id={`${props.id}-title`}>{props.title}</h1>
            <p>{props.description}</p>
          </div>
          <Show when={props.action}>
            <div>{props.action}</div>
          </Show>
        </header>
        {props.children}
      </div>
    </section>
  )
}

export function MxBadge(props: { tone?: "good" | "bad"; children: JSX.Element }) {
  return <span class={props.tone ? `mx-badge ${props.tone}` : "mx-badge"}>{props.children}</span>
}

export function MxToggle(props: { checked: boolean; label: string; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      class="mx-toggle"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    />
  )
}
