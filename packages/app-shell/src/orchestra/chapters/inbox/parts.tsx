import { Icon } from "@orchestra/ui/icon"
import { A } from "@solidjs/router"
import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { openHref, openLabel, type Action, type Item, type Source } from "./model"
import { brands } from "./brands"

const paths: Partial<Record<Source, string>> = {
  mail: "M2 4h12v9H2V4Zm0 0 6 5 6-5",
  board: "M2 3h3v10H2V3Zm4.5 0h3v7h-3V3ZM11 3h3v4h-3V3Z",
  calendar: "M2 4h12v10H2V4ZM2 7h12M5 2v4M11 2v4M5 10h2M9 10h2",
  rss: "M3 3a10 10 0 0 1 10 10M3 7a6 6 0 0 1 6 6M3 11v2h2",
}

export function SourceMark(props: { source: Source }) {
  return (
    <span class="inbox-source-mark" data-source={props.source} aria-hidden="true">
      <Show
        when={props.source === "github" || props.source === "discord"}
        fallback={
          <svg
            viewBox={brands[props.source] ? "0 0 24 24" : "0 0 16 16"}
            fill={brands[props.source] ? "currentColor" : "none"}
            stroke={brands[props.source] ? "none" : "currentColor"}
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d={brands[props.source] ?? paths[props.source]} />
          </svg>
        }
      >
        <Icon name={props.source === "github" ? "github" : "discord"} size="small" />
      </Show>
    </span>
  )
}

export function OpenItem(props: { item: Item; primary?: boolean }) {
  const language = useLanguage()
  return (
    <Show
      when={props.item.source === "board"}
      fallback={
        <a
          class="inbox-button"
          classList={{ primary: props.primary }}
          href={openHref(props.item)}
          target="_blank"
          rel="noreferrer"
        >
          {language.t(
            props.primary
              ? openLabel(props.item)
              : props.item.source === "whatsapp"
                ? "orchestra.inbox.openWhatsApp"
                : "orchestra.inbox.open",
          )}
          <Icon name="square-arrow-top-right" size="small" />
        </a>
      }
    >
      <A class="inbox-button" classList={{ primary: props.primary }} href="/orchestra/board">
        {language.t(openLabel(props.item))}
        <Icon name="arrow-right" size="small" />
      </A>
    </Show>
  )
}

export function InboxMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m3 14 3-9h12l3 9v6H3v-6Z" />
      <path d="M3 14h5l2 3h4l2-3h5M9 2h6" />
    </svg>
  )
}

export function ActionMark(props: { action: Action }) {
  return (
    <Show
      when={props.action === "remind"}
      fallback={
        <Icon
          name={props.action === "handoff" ? "brain" : props.action === "read" ? "check" : "archive"}
          size="small"
        />
      }
    >
      <svg
        class="inbox-small-mark"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6v4l3 2" />
      </svg>
    </Show>
  )
}

export function RefreshMark() {
  return (
    <svg
      class="inbox-small-mark"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M16 8a6.2 6.2 0 1 0 .2 4M16 3v5h-5" />
    </svg>
  )
}
