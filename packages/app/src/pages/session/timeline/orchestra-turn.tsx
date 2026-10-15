import { Show, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import { getRelativeTime } from "@/utils/time"

// One transcript entry in the approved layout: a 30px mark, who/when, then the entry body.
// Rows after the first of a turn continue in the body column without repeating the head.
// Without `chrome` the entry renders bare, as the compact (mobile) transcript has no turn styles.
export function OrchestraTurn(props: {
  chrome: boolean
  role: "user" | "assistant"
  head: boolean
  who?: string
  time?: number
  children: JSX.Element
}) {
  const language = useLanguage()
  return (
    <Show when={props.chrome} fallback={props.children}>
      <div data-component="orchestra-turn" data-role={props.role} data-head={props.head ? "" : undefined}>
        <Show when={props.head}>
          <span data-slot="orchestra-turn-mark" aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <Show
                when={props.role === "user"}
                fallback={<path d="M8 2.2 9.1 6.2 13.1 7.3 9.1 8.4 8 12.4 6.9 8.4 2.9 7.3 6.9 6.2z" />}
              >
                <circle cx="8" cy="5.6" r="2.6" />
                <path d="M3 13.4c.4-2.5 2.4-3.9 5-3.9s4.6 1.4 5 3.9" />
              </Show>
            </svg>
          </span>
        </Show>
        <div data-slot="orchestra-turn-body">
          <Show when={props.head}>
            <div data-slot="orchestra-turn-meta">
              <span data-slot="orchestra-turn-who">
                {props.role === "user" ? language.t("orchestra.chat.you") : props.who}
              </span>
              <Show when={props.time}>
                {(time) => (
                  <time data-slot="orchestra-turn-when" datetime={new Date(time()).toISOString()}>
                    {getRelativeTime(new Date(time()).toISOString(), language.t)}
                  </time>
                )}
              </Show>
            </div>
          </Show>
          {props.children}
        </div>
      </div>
    </Show>
  )
}

export function agentLabel(agent: string | undefined) {
  if (!agent) return
  return agent.charAt(0).toUpperCase() + agent.slice(1)
}
