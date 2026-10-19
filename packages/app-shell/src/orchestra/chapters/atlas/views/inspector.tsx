import { createEffect, Match, on, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { isAtlasEmpty } from "../atlas-api"
import { useAtlas } from "../atlas-context"
import type { AtlasFact } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Icon } from "../kit/chips"
import { Btn } from "../kit/controls"
import { keepPromoteRun, openAtlasSheet } from "../sheets/state"
import { FactBody, useCopyLink } from "./fact-detail"
import { InspectorRetire } from "./inspector-retire"
import type { AtlasInspectorProps } from "./index"

// The fact inspector beside a list (specs/atlas-ui/mock/views.js:210-219): step through the list, open the fact as a
// page, close; the actions follow the fact's state (staged, changed, replaced, or up to date).
export default function AtlasInspector(props: AtlasInspectorProps) {
  return (
    <Show when={props.model.byKey[props.factKey] as AtlasFact | undefined}>
      {(fact) => <Inspector {...props} fact={fact()} />}
    </Show>
  )
}

function Inspector(props: AtlasInspectorProps & { fact: AtlasFact }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const copyLink = useCopyLink()
  const [state, setState] = createStore({ order: [] as string[], retiring: false })
  createEffect(on(() => props.factKey, () => requestAnimationFrame(() => setState("order", readOrder()))))
  const index = () => state.order.indexOf(props.factKey)
  const step = (delta: number) => {
    const order = readOrder()
    if (!order.length) return
    const at = order.indexOf(props.factKey)
    atlas.open(order[Math.max(0, Math.min(order.length - 1, at < 0 ? 0 : at + delta))])
  }
  const staged = () => props.fact.kind === "candidate" && !props.fact.promotedNow
  const factState = () => props.model.state(props.fact)
  // R2 (D15, D34): a held candidate stays staged and every promote skips it until it is put back.
  const held = () => atlas.controller.state.review?.held.includes(props.fact.key) ?? false
  const busy = () =>
    atlas.controller.state.pending.some((kind) => kind === "hold" || kind === "release" || kind === "promote")
  const review = async (kind: "hold" | "release") => {
    const input = { nodeKey: props.fact.key }
    const result = await (kind === "hold" ? atlas.controller.hold(input) : atlas.controller.release(input))
    if (!result || isAtlasEmpty(result)) return
    if (!result.ok)
      return atlas.toast(language.t("orchestra.atlas.fact.refused", { reason: result.rejected ?? "unknown" }), "xc")
    atlas.toast(
      language.t(kind === "hold" ? "orchestra.atlas.fact.kept" : "orchestra.atlas.fact.putBack"),
      kind === "hold" ? "clock" : "refresh",
    )
  }
  // Accept promotes this one row (`atlas promote <nodeKey>`); the result sheet shows its outcome.
  const accept = async () => {
    const staged = props.model.candidates.map((x) => x.key)
    const result = await atlas.controller.promote({ nodeKeys: [props.fact.key] })
    if (!result || isAtlasEmpty(result)) return
    keepPromoteRun({ run: result, staged })
    openAtlasSheet({ kind: "promote-result" })
  }
  const retire = () => {
    if (props.model.governing(props.fact))
      return atlas.toast(
        language.t(
          props.fact.tier === "T0" ? "orchestra.atlas.fact.retire.refusedCore" : "orchestra.atlas.fact.retire.refusedRatified",
        ),
        "xc",
      )
    setState("retiring", true)
  }
  return (
    <>
      <header class="ins-head">
        <span class="ins-kind">
          <Icon name="fact" />
          <span>{props.model.unitOf(props.fact.file)}</span>
        </span>
        <Btn
          icon="up"
          ariaLabel={language.t("orchestra.atlas.fact.previous")}
          tip={language.t("orchestra.atlas.fact.previous")}
          disabled={index() <= 0}
          onClick={() => step(-1)}
        />
        <Btn
          icon="down"
          ariaLabel={language.t("orchestra.atlas.fact.next")}
          tip={language.t("orchestra.atlas.fact.next")}
          disabled={index() < 0 || index() >= state.order.length - 1}
          onClick={() => step(1)}
        />
        <Btn
          icon="expand"
          ariaLabel={language.t("orchestra.atlas.fact.page")}
          tip={language.t("orchestra.atlas.fact.page")}
          onClick={() => atlas.go(atlasHref("fact", props.fact.key))}
        />
        <Btn
          icon="close"
          ariaLabel={language.t("orchestra.atlas.fact.close")}
          tip={language.t("orchestra.atlas.fact.close")}
          onClick={() => atlas.close()}
        />
      </header>
      <div class="ins-body">
        <FactBody fact={props.fact} model={props.model} route={props.route} />
      </div>
      <footer class="ins-foot">
        <Btn
          icon="link"
          ariaLabel={language.t("orchestra.atlas.fact.copyLink")}
          tip={language.t("orchestra.atlas.fact.copyLink")}
          onClick={() => copyLink(props.fact.key)}
        />
        <span class="grow" />
        <Switch>
          <Match when={staged()}>
            <Show
              when={held()}
              fallback={
                <>
                  <Btn
                    label={language.t("orchestra.atlas.fact.keep")}
                    write
                    disabled={busy()}
                    onClick={() => void review("hold")}
                  />
                  <Btn
                    label={language.t("orchestra.atlas.fact.accept")}
                    write
                    primary
                    disabled={busy()}
                    onClick={() => void accept()}
                  />
                </>
              }
            >
              <span class="at-hint">
                <Icon name="clock" />
                {language.t("orchestra.atlas.fact.held")}
              </span>
              <Btn
                label={language.t("orchestra.atlas.fact.release")}
                write
                disabled={busy()}
                onClick={() => void review("release")}
              />
            </Show>
          </Match>
          <Match when={factState() === "drifted"}>
            <Btn
              label={language.t("orchestra.atlas.fact.rewrite")}
              write
              primary
              cap="R8"
              onClick={() => openAtlasSheet({ kind: "edit", key: props.fact.key })}
            />
          </Match>
          <Match when={factState() === "retired"}>
            <span class="at-hint">{language.t("orchestra.atlas.fact.replaced")}</span>
          </Match>
          <Match when={factState() === "fresh"}>
            <Btn label={language.t("orchestra.atlas.fact.edit")} write onClick={() => openAtlasSheet({ kind: "edit", key: props.fact.key })} />
            <Show when={!props.fact.slot}>
              <Btn label={language.t("orchestra.atlas.fact.classify")} write onClick={() => openAtlasSheet({ kind: "classify", key: props.fact.key })} />
            </Show>
            <Btn label={language.t("orchestra.atlas.fact.retire")} write onClick={retire} />
            <Show when={!props.model.governing(props.fact)}>
              <Btn
                label={language.t("orchestra.atlas.fact.ratify")}
                write
                primary
                onClick={() => openAtlasSheet({ kind: "ratify", key: props.fact.key })}
              />
            </Show>
          </Match>
        </Switch>
      </footer>
      <Show when={state.retiring}>
        <InspectorRetire fact={props.fact} onClose={() => setState("retiring", false)} />
      </Show>
    </>
  )
}

// The fact keys of the rows in the main pane, in order, once each (the frame's j/k list).
function readOrder() {
  return [
    ...new Set(
      [...document.querySelectorAll<HTMLElement>('.atlas-main [data-action="open"][data-value]')].map((element) => element.dataset.value ?? ""),
    ),
  ]
}
