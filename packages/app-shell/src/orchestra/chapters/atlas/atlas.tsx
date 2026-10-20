import { useLocation, useNavigate } from "@solidjs/router"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createMemo, Match, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { setCrumbTrail } from "@/orchestra/crumbs"
import { formatServerError } from "@/utils/server-errors"
import "../kit.css"
import "../../relay/relay.css"
import "./atlas.css"
import { AtlasAPIError, createAtlasAPI } from "./atlas-api"
import { AtlasContext, type AtlasContextValue } from "./atlas-context"
import { createAtlasController } from "./atlas-controller"
import { createAtlasModel } from "./atlas-model"
import { AtlasRail } from "./atlas-rail"
import { AtlasKeys, AtlasPalette, AtlasShortcuts } from "./atlas-palette"
import { atlasHref, parseAtlasRoute, withQuery } from "./atlas-route"
import { Btn } from "./kit/controls"
import { Icon } from "./kit/chips"
import { num } from "./kit/format"
import { createToaster, Toast } from "./kit/toast"
import { AtlasSheetHost } from "./sheets/host"
import { AtlasSetup } from "./views/setup"
import { atlasInspector, atlasViews } from "./views"

// The Atlas chapter (D7): the sub-navigation rail, the main view chosen by the URL, the fact inspector, the toast.
export default function AtlasPage(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const location = useLocation()
  const navigate = useNavigate()
  const route = createMemo(() => parseAtlasRoute(location.pathname, location.search))
  const controller = createAtlasController((error) => {
    if (error instanceof AtlasAPIError)
      return { message: language.t("orchestra.atlas.frame.unavailable"), unavailable: error.reason === "unsupported" }
    return { message: formatServerError(error, language.t, language.t("error.chain.unknown")) }
  })
  void controller.select({
    server: ServerConnection.key(props.server),
    directory: props.directory,
    transport: createAtlasAPI(sdk(), serverSDK().orchestra),
  })
  onCleanup(() => controller.dispose())
  onCleanup(() => setCrumbTrail([]))
  // D6: refetch on window focus.
  makeEventListener(window, "focus", () => void controller.refresh())
  const model = createMemo(() => (controller.state.snapshot ? createAtlasModel(controller.state.snapshot) : undefined))
  const toaster = createToaster()
  const [frame, setFrame] = createStore({
    flush: false,
    palette: undefined as string | undefined,
    shortcuts: false,
    bannerHidden: readBannerHidden(),
  })
  const elements: { main?: HTMLElement } = {}
  const go = (href: string, replace?: boolean) => navigate(href, { replace })
  const value: AtlasContextValue = {
    route,
    model,
    controller,
    go,
    setQuery: (patch, replace) => go(withQuery(route(), patch), replace),
    open: (key) => go(route().view === "fact" ? atlasHref("fact", key) : withQuery(route(), { fact: key, why: undefined })),
    close: () => {
      const key = route().query.fact
      go(withQuery(route(), { fact: undefined, why: undefined }))
      setTimeout(
        () =>
          elements.main
            ?.querySelector<HTMLElement>(`[data-value="${CSS.escape(key ?? "")}"][data-action="open"]`)
            ?.focus({ preventScroll: true }),
        0,
      )
    },
    toast: (text, icon) => toaster.show(text, icon),
    crumbs: (items) => setCrumbTrail(items),
    setFlush: (on) => setFrame("flush", on),
    palette: (prefix) => setFrame("palette", prefix ?? ""),
    shortcuts: () => setFrame("shortcuts", true),
  }
  const view = () => atlasViews[route().view]
  const inspected = () => {
    const key = route().query.fact
    const current = model()
    if (!key || !current || !current.byKey[key] || route().view === "fact" || !atlasInspector) return
    return { key, model: current }
  }
  // The store banner: a store in git serves only machine-proven facts and refuses writes (mock app.js:60).
  const banner = () => {
    const current = model()
    return !!current && current.provenance() !== "trusted" && !frame.bannerHidden
  }

  return (
    <AtlasContext.Provider value={value}>
      <div class="atlas-scope wf-scope atlas-workbench" data-component="orchestra-atlas">
        <AtlasRail />
        <main ref={(element) => (elements.main = element)} class="atlas-main" classList={{ flush: frame.flush }} tabindex="-1">
          <Show when={banner()}>
            <div class="at-banner warm">
              <Icon name="lock" />
              <span>{language.t("orchestra.atlas.frame.banner.store", { total: num(model()?.facts.length ?? 0) })}</span>
              <a
                class="mx-link"
                href={atlasHref("overview", "", { show: "health" })}
                onClick={(event) => {
                  event.preventDefault()
                  go(atlasHref("overview", "", { show: "health" }))
                }}
              >
                {language.t("orchestra.atlas.frame.banner.why")}
              </a>
              <Btn
                icon="close"
                ariaLabel={language.t("orchestra.atlas.frame.banner.dismiss")}
                onClick={() => {
                  writeBannerHidden()
                  setFrame("bannerHidden", true)
                }}
              />
            </div>
          </Show>
          <Show when={controller.state.error}>
            {(error) => (
              <p class="mx-error" role="alert">
                {error()}
              </p>
            )}
          </Show>
          <Switch
            fallback={
              <div class="at-page narrow">
                <p class="mx-empty" role="status">
                  {language.t("orchestra.atlas.frame.loading")}
                </p>
              </div>
            }
          >
            <Match when={controller.state.unavailable}>
              <div class="at-page narrow">
                <div class="at-held">
                  <span class="mx-mark">
                    <Icon name="atlas" />
                  </span>
                  <h2>{language.t("orchestra.atlas.frame.unavailable")}</h2>
                </div>
              </div>
            </Match>
            <Match when={controller.state.empty}>
              <div class="at-page narrow">
                <div class="at-held">
                  <span class="mx-mark">
                    <Icon name="atlas" />
                  </span>
                  <h2>{language.t("orchestra.atlas.frame.empty.title")}</h2>
                  <p>{language.t("orchestra.atlas.frame.empty.body")}</p>
                  <AtlasSetup />
                </div>
              </div>
            </Match>
            <Match when={model()}>
              {(current) => (
                <Show
                  when={view()}
                  fallback={
                    <div class="at-page narrow">
                      <p class="mx-empty">{language.t("orchestra.atlas.frame.pending")}</p>
                    </div>
                  }
                >
                  {(component) => <Dynamic component={component()} route={route()} model={current()} />}
                </Show>
              )}
            </Match>
            <Match when={controller.state.error && !controller.state.loading}>
              <div class="at-page narrow">
                <Btn label={language.t("orchestra.atlas.frame.retry")} onClick={() => void controller.refresh()} />
              </div>
            </Match>
          </Switch>
        </main>
        <Show when={inspected()}>
          {(entry) => (
            <aside class="at-inspector" aria-label={language.t("orchestra.atlas.frame.inspector")}>
              <Dynamic component={atlasInspector} route={route()} model={entry().model} factKey={entry().key} />
            </aside>
          )}
        </Show>
        <Toast toaster={toaster} />
        <AtlasSheetHost />
        <AtlasKeys
          main={() => elements.main}
          blocked={() =>
            frame.palette !== undefined || frame.shortcuts || !!elements.main?.parentElement?.querySelector("dialog[open]")
          }
        />
        <Show when={frame.palette !== undefined}>
          <AtlasPalette prefix={frame.palette ?? ""} onClose={() => setFrame("palette", undefined)} />
        </Show>
        <Show when={frame.shortcuts}>
          <AtlasShortcuts onClose={() => setFrame("shortcuts", false)} />
        </Show>      </div>
    </AtlasContext.Provider>
  )
}

// The banner stays dismissed for this browser session (the mock's sessionStorage "atlas-banner").
function readBannerHidden() {
  try {
    return sessionStorage.getItem("atlas-banner") === "0"
  } catch {
    return false
  }
}

function writeBannerHidden() {
  try {
    sessionStorage.setItem("atlas-banner", "0")
  } catch {
    return
  }
}
