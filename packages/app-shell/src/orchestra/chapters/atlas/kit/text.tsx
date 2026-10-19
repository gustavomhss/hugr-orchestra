import { For, type JSX, Show } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useAtlas } from "../atlas-context"

// Copy strings keep the mock's inline markup: <code>, <b>, <em>, <mark> and <small> around plain text. Rich renders
// those five tags as elements and everything else as text, so neither copy nor a parameter can inject markup.
type RichTag = "code" | "b" | "em" | "mark" | "small"
export type RichPart = { tag?: RichTag; text: string }
const TAGS = /<(code|b|em|mark|small)>([\s\S]*?)<\/\1>/g

export function richParts(text: string): RichPart[] {
  const matches = [...text.matchAll(TAGS)]
  const starts = [0, ...matches.map((match) => (match.index ?? 0) + match[0].length)]
  return [
    ...matches.flatMap((match, index): RichPart[] => [
      { text: text.slice(starts[index], match.index ?? 0) },
      { tag: match[1] as RichTag, text: match[2] },
    ]),
    { text: text.slice(starts[matches.length]) },
  ].filter((part) => !!part.tag || part.text !== "")
}

export function Rich(props: { text: string }) {
  return (
    <For each={richParts(props.text)}>
      {(part) => (
        <Show when={part.tag} fallback={part.text}>
          {(tag) => <Dynamic component={tag()}>{part.text}</Dynamic>}
        </Show>
      )}
    </For>
  )
}

// A link to another Atlas page (the mock's href="#/..."): a real href for open-in-new-tab, navigation through the
// Atlas context on a plain click.
export function AtlasLink(props: { href: string; class?: string; replace?: boolean; children: JSX.Element }) {
  const atlas = useAtlas()
  return (
    <a
      class={props.class}
      href={props.href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        atlas.go(props.href, props.replace)
      }}
    >
      {props.children}
    </a>
  )
}
