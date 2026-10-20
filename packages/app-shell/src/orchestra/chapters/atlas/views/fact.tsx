import { createEffect, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasFact } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Btn, Empty } from "../kit/controls"
import { FactBody, useCopyLink } from "./fact-detail"
import type { AtlasViewProps } from "./index"

// A fact as a page (specs/atlas-ui/mock/views.js:222-229): the same body as the inspector, with Back and Copy link.
export default function AtlasFactView(props: AtlasViewProps) {
  const atlas = useAtlas()
  const language = useLanguage()
  const copyLink = useCopyLink()
  const fact = () => props.model.byKey[props.route.param] as AtlasFact | undefined
  createEffect(() => {
    const x = fact()
    atlas.crumbs(
      x
        ? [language.t("orchestra.atlas.fact.crumb.knowledge"), x.file.split("/").at(-1) ?? x.file]
        : [language.t("orchestra.atlas.fact.crumb.fact")],
    )
  })
  return (
    <Show
      when={fact()}
      fallback={
        <div class="at-page narrow">
          <Empty
            title={language.t("orchestra.atlas.fact.missing")}
            action={
              <Btn
                label={language.t("orchestra.atlas.fact.missing.back")}
                onClick={() => atlas.go(atlasHref("explore", "", { view: "list" }))}
              />
            }
          >
            {language.t("orchestra.atlas.fact.missing.text")}
          </Empty>
        </div>
      }
    >
      {(x) => (
        <div class="at-page narrow">
          <div class="mx-heading">
            <div>
              <div class="mx-eyebrow">{props.model.unitOf(x().file)}</div>
            </div>
            <div class="heading-actions">
              <Btn label={language.t("orchestra.atlas.fact.back")} icon="back" onClick={() => history.back()} />
              <Btn label={language.t("orchestra.atlas.fact.copyLink")} icon="link" onClick={() => copyLink(x().key)} />
            </div>
          </div>
          <div class="at-pagecard">
            <FactBody fact={x()} model={props.model} route={props.route} />
          </div>
        </div>
      )}
    </Show>
  )
}
