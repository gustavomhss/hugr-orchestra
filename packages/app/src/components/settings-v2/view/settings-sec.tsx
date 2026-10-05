import { Show, type JSX } from "solid-js"

// One section: the mock places a section's single action above its title.
export function SettingsSec(props: {
  title: string
  description?: string
  action?: JSX.Element
  children: JSX.Element
}) {
  return (
    <>
      <Show when={props.action}>
        <div class="mx-toolbar">{props.action}</div>
      </Show>
      <div class="settings-sec">
        <h3>{props.title}</h3>
        <Show when={props.description}>
          <p>{props.description}</p>
        </Show>
        {props.children}
      </div>
    </>
  )
}
