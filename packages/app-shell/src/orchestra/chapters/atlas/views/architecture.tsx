import { createEffect, For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import { atlasHref } from "../atlas-route"
import { Icon } from "../kit/chips"
import { AtlasLink } from "../kit/text"
import { ARCH_CHAPTERS } from "./architecture-data"
import type { AtlasViewProps } from "./index"

// Architecture: how Atlas keeps knowledge, one chapter at a time (specs/atlas-ui/mock/views-arch.js:165-183).
export default function AtlasArchitectureView(props: AtlasViewProps) {
  const atlas = useAtlas()
  const language = useLanguage()
  createEffect(() => atlas.crumbs([language.t("orchestra.atlas.architecture.crumb")]))
  const index = () => Math.max(0, ARCH_CHAPTERS.findIndex((item) => item[0] === props.route.query.ch))
  const chapter = () => ARCH_CHAPTERS[index()][0]
  const prev = () => (index() > 0 ? ARCH_CHAPTERS[index() - 1] : undefined)
  const next = () => (index() < ARCH_CHAPTERS.length - 1 ? ARCH_CHAPTERS[index() + 1] : undefined)
  return (
    <div class="at-page wide">
      <section class="at-gen-hero">
        <div>
          <div class="mx-eyebrow">{language.t("orchestra.atlas.architecture.eyebrow")}</div>
          <h1>{language.t("orchestra.atlas.architecture.title")}</h1>
        </div>
      </section>
      <nav class="at-chapters">
        <For each={ARCH_CHAPTERS}>
          {(item, n) => (
            <AtlasLink
              class={item[0] === chapter() ? "on" : undefined}
              href={atlasHref("architecture", "", { ch: item[0] })}
            >
              <span>{n() + 1}</span>
              <Icon name={item[2]} />
              {language.t(item[1])}
            </AtlasLink>
          )}
        </For>
      </nav>
      <section class="at-chapter">
        <Switch>
          <Match when={chapter() === "overview"}>
            {null /* A28B: overview chapter */}
          </Match>
          <Match when={chapter() === "write"}>
            {null /* A28C: write chapter */}
          </Match>
          <Match when={chapter() === "read"}>
            {null /* A28C: read chapter */}
          </Match>
          <Match when={chapter() === "store"}>
            {null /* A28C: store chapter */}
          </Match>
          <Match when={chapter() === "identity"}>
            {null /* A28D: identity chapter */}
          </Match>
          <Match when={chapter() === "packages"}>
            {null /* A28D: packages chapter */}
          </Match>
          <Match when={chapter() === "portable"}>
            {null /* A28D: portable chapter */}
          </Match>
        </Switch>
      </section>
      <div class="at-ch-next">
        <Show when={prev()} fallback={<span />}>
          {(item) => (
            <AtlasLink href={atlasHref("architecture", "", { ch: item()[0] })}>
              <Icon name="back" />
              {language.t(item()[1])}
            </AtlasLink>
          )}
        </Show>
        <Show when={next()}>
          {(item) => (
            <AtlasLink class="primary" href={atlasHref("architecture", "", { ch: item()[0] })}>
              {language.t("orchestra.atlas.architecture.next", { chapter: language.t(item()[1]) })}
              <Icon name="arrow" />
            </AtlasLink>
          )}
        </Show>
      </div>
    </div>
  )
}
