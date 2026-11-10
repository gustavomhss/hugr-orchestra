import { A } from "@solidjs/router"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Dialog } from "@orchestra/ui/dialog"
import { useDialog } from "@orchestra/ui/context/dialog"
import { createMemo, For, onCleanup, onMount, Show, type JSX } from "solid-js"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { ModelsProvider } from "@/context/models"
import { SDKProvider } from "@/context/sdk"
import { ServerConnection } from "@/context/server"
import { ServerSDKProvider, useServerSDK } from "@/context/server-sdk"
import { ServerSyncProvider } from "@/context/server-sync"
import { createFabricContextController, type FabricContextIssue } from "./fabric-context-controller"
import { MxPage } from "./kit"

/** Fabric's bootstrap never borrows a Git directory or the app's fallback connection. */
export default function FabricEntry() {
  const global = useGlobal()
  const layout = useLayout()
  const language = useLanguage()
  const owner = createMemo(
    () => {
      const selected = layout.home.selection().server
      const connection = global.servers.list().find((item) => ServerConnection.key(item) === selected)
      if (!connection) return
      const context = global.ensureServerCtx(connection)
      return { sdk: context.sdk, sync: context.sync }
    },
    undefined,
    { equals: (previous, next) => previous?.sdk.orchestra === next?.sdk.orchestra },
  )

  return (
    <Show
      when={owner()}
      keyed
      fallback={
        <MxPage
          id="orchestra-fabric"
          title={language.t("orchestra.fabric.title")}
          eyebrow={language.t("orchestra.fabric.eyebrow")}
          description={language.t("orchestra.fabric.description")}
        >
          <div class="mx-empty">
            <h2>{language.t("orchestra.fabric.noServer")}</h2>
            <A class="mx-btn" data-fabric-action="choose-server" href="/">
              {language.t("orchestra.fabric.chooseServer")}
            </A>
          </div>
        </MxPage>
      }
    >
      {(captured) => (
        <ServerSDKProvider value={captured.sdk}>
          <ServerSyncProvider value={captured.sync}>
            <FabricContexts />
          </ServerSyncProvider>
        </ServerSDKProvider>
      )}
    </Show>
  )
}

function FabricContexts() {
  const language = useLanguage()
  const sdk = useServerSDK()()
  const dialog = useDialog()
  const controller = createFabricContextController(sdk.orchestra)
  const state = controller.state
  onCleanup(controller.dispose)
  onMount(() => {
    void controller.start(sdk.ready)
  })

  function revoke(ref: FabricContext.Ref) {
    const target = { id: ref.id, generation: ref.generation }
    void dialog.showOwned((close) => (
      <Dialog
        fit
        title={language.t("orchestra.fabric.confirmTitle")}
        description={language.t("orchestra.fabric.confirmDescription")}
      >
        <div class="mx-dialog-foot">
          <button type="button" class="mx-btn" autofocus data-fabric-action="dismiss-remove" onClick={close}>
            {language.t("orchestra.fabric.dismiss")}
          </button>
          <button
            type="button"
            class="mx-btn danger"
            data-fabric-action="confirm-remove"
            onClick={() => {
              close()
              void controller.remove(target)
            }}
          >
            {language.t("orchestra.fabric.confirm")}
          </button>
        </div>
      </Dialog>
    ))
  }

  return (
    <MxPage
      id="orchestra-fabric"
      title={language.t("orchestra.fabric.title")}
      eyebrow={language.t("orchestra.fabric.eyebrow")}
      description={language.t("orchestra.fabric.description")}
      action={
        <button
          type="button"
          class="mx-btn primary"
          data-fabric-action="create"
          disabled={
            state.starting ||
            !state.list.loaded ||
            !!state.connectionError ||
            state.create.loading ||
            !!state.create.key
          }
          onClick={() => {
            void controller.create()
          }}
        >
          {language.t("orchestra.fabric.create")}
        </button>
      }
    >
      <Show when={state.starting}>
        <p role="status" aria-busy="true">
          {language.t("orchestra.fabric.loading")}
        </p>
      </Show>
      <Show when={state.connectionError}>
        {(issue) => (
          <FabricIssue issue={issue()}>
            <button
              type="button"
              class="mx-btn"
              onClick={() => {
                void controller.start(sdk.ready)
              }}
            >
              {language.t("orchestra.fabric.retry")}
            </button>
          </FabricIssue>
        )}
      </Show>
      <Show when={state.create.error}>
        {(issue) => (
          <FabricIssue issue={issue()}>
            <p>{language.t("orchestra.fabric.ambiguous")}</p>
            <button
              type="button"
              class="mx-btn"
              data-fabric-action="retry-create"
              disabled={state.create.loading}
              onClick={() => {
                void controller.create(true)
              }}
            >
              {language.t("orchestra.fabric.retryCreate")}
            </button>
          </FabricIssue>
        )}
      </Show>
      <Show when={state.resolveError}>
        {(issue) => (
          <FabricIssue issue={issue()}>
            <button
              type="button"
              class="mx-btn"
              data-fabric-action="retry-resolve"
              disabled={state.resolving}
              onClick={() => {
                if (state.selected) void controller.open(state.selected)
              }}
            >
              {language.t("orchestra.fabric.retryResolve")}
            </button>
          </FabricIssue>
        )}
      </Show>
      <Show when={state.remove.error}>
        {(issue) => (
          <FabricIssue issue={issue()}>
            <p>{language.t("orchestra.fabric.ambiguous")}</p>
            <button
              type="button"
              class="mx-btn"
              data-fabric-action="retry-remove"
              disabled={state.remove.loading}
              onClick={() => {
                void controller.retryRemove()
              }}
            >
              {language.t("orchestra.fabric.retryRemove")}
            </button>
          </FabricIssue>
        )}
      </Show>

      <section aria-labelledby="fabric-contexts-title" aria-busy={state.list.loading}>
        <h2 class="mx-section" id="fabric-contexts-title">
          {language.t("orchestra.fabric.active")}
        </h2>
        <Show when={state.list.loading}>
          <p role="status">{language.t("orchestra.fabric.loading")}</p>
        </Show>
        <Show when={state.list.error}>
          {(issue) => (
            <FabricIssue issue={issue()}>
              <button
                type="button"
                class="mx-btn"
                disabled={state.list.loading}
                onClick={() => {
                  void controller.load("list")
                }}
              >
                {language.t("orchestra.fabric.retry")}
              </button>
            </FabricIssue>
          )}
        </Show>
        <Show when={state.list.loaded && !state.list.loading && !state.list.error && state.list.items.length === 0}>
          <div class="mx-empty">
            <h3>{language.t("orchestra.fabric.empty")}</h3>
            <p>{language.t("orchestra.fabric.emptyHint")}</p>
          </div>
        </Show>
        <div class="mx-grid">
          <For each={state.list.items}>
            {(ref) => (
              <article class="mx-card">
                <h3 class="font-mono break-all">{ref.id}</h3>
                <p>{language.t("orchestra.fabric.generation", { generation: ref.generation })}</p>
                <div class="mx-card-foot">
                  <button
                    type="button"
                    class="mx-btn"
                    data-fabric-action="open"
                    data-context-id={ref.id}
                    aria-label={language.t("orchestra.fabric.openContext", { id: ref.id })}
                    disabled={state.remove.loading && state.remove.ref?.id === ref.id}
                    onClick={() => {
                      void controller.open(ref)
                    }}
                  >
                    {language.t("orchestra.fabric.open")}
                  </button>
                  <button
                    type="button"
                    class="mx-btn danger"
                    data-fabric-action="revoke-context"
                    data-context-id={ref.id}
                    aria-label={language.t("orchestra.fabric.revoke", { id: ref.id })}
                    disabled={state.remove.loading || !!state.remove.key}
                    onClick={() => revoke(ref)}
                  >
                    {language.t("orchestra.fabric.revokeLabel")}
                  </button>
                </div>
              </article>
            )}
          </For>
        </div>
        <Show when={state.list.after}>
          {(after) => (
            <button
              type="button"
              class="mx-btn"
              data-fabric-action="list-more"
              disabled={state.list.loading}
              onClick={() => {
                void controller.load("list", after())
              }}
            >
              {language.t("orchestra.fabric.more")}
            </button>
          )}
        </Show>
      </section>

      <Show when={state.resolving}>
        <p role="status" aria-busy="true">
          {language.t("orchestra.fabric.opening")}
        </p>
      </Show>
      <Show when={state.active} keyed>
        {(info) => (
          <SDKProvider directory={info.location.directory}>
            <ModelsProvider directory={() => info.location.directory}>
              <section aria-labelledby="fabric-resolved-title">
                <h2 class="mx-section" id="fabric-resolved-title">
                  {language.t("orchestra.fabric.ready")}
                </h2>
                <p class="mx-empty">{language.t("orchestra.fabric.readyHint")}</p>
              </section>
            </ModelsProvider>
          </SDKProvider>
        )}
      </Show>

      <section aria-labelledby="fabric-preparing-title" aria-busy={state.preparing.loading}>
        <h2 class="mx-section" id="fabric-preparing-title">
          {language.t("orchestra.fabric.preparing")}
        </h2>
        <p class="mx-meta">{language.t("orchestra.fabric.preparingHint")}</p>
        <Show when={state.preparing.loading}>
          <p role="status">{language.t("orchestra.fabric.loading")}</p>
        </Show>
        <Show when={state.preparing.error}>
          {(issue) => (
            <FabricIssue issue={issue()}>
              <button
                type="button"
                class="mx-btn"
                disabled={state.preparing.loading}
                onClick={() => {
                  void controller.load("preparing")
                }}
              >
                {language.t("orchestra.fabric.retry")}
              </button>
            </FabricIssue>
          )}
        </Show>
        <Show
          when={
            state.preparing.loaded &&
            !state.preparing.loading &&
            !state.preparing.error &&
            state.preparing.items.length === 0
          }
        >
          <p>{language.t("orchestra.fabric.noPreparations")}</p>
        </Show>
        <div class="mx-grid">
          <For each={state.preparing.items}>
            {(ref) => (
              <article class="mx-card">
                <h3 class="font-mono break-all">{ref.id}</h3>
                <p>{language.t("orchestra.fabric.generation", { generation: ref.generation })}</p>
                <div class="mx-card-foot">
                  <button
                    type="button"
                    class="mx-btn"
                    data-fabric-action="cancel-preparation"
                    data-context-id={ref.id}
                    aria-label={language.t("orchestra.fabric.cancelPreparation", { id: ref.id })}
                    disabled={state.remove.loading || !!state.remove.key}
                    onClick={() => {
                      void controller.remove(ref)
                    }}
                  >
                    {language.t("orchestra.fabric.cancelPreparationLabel")}
                  </button>
                </div>
              </article>
            )}
          </For>
        </div>
        <Show when={state.preparing.after}>
          {(after) => (
            <button
              type="button"
              class="mx-btn"
              data-fabric-action="preparing-more"
              disabled={state.preparing.loading}
              onClick={() => {
                void controller.load("preparing", after())
              }}
            >
              {language.t("orchestra.fabric.more")}
            </button>
          )}
        </Show>
      </section>
    </MxPage>
  )
}

function FabricIssue(props: { issue: FabricContextIssue; children: JSX.Element }) {
  const language = useLanguage()
  return (
    <div class="mx-empty" role="alert">
      <p>{language.t(`orchestra.fabric.error.${props.issue}`)}</p>
      {props.children}
    </div>
  )
}
