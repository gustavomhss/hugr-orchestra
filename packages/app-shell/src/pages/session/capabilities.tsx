import { Icon } from "@orchestra/ui/icon"
import { ToolPartSlot } from "@orchestra/session-ui/context"
import type { SessionV1 } from "@orchestra/schema/session-v1"
import type { SessionID } from "@orchestra/schema/session-id"
import { createContext, createMemo, For, onCleanup, untrack, useContext, type ParentProps } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { useSync } from "@/context/sync"
import { bytes } from "@/orchestra/actions/format"
import type { Part } from "@/v2-wire"
import { createArtifactsApi } from "./artifacts-api"
import { artifactChips, createArtifactsModel, previewKind, type ArtifactRef } from "./artifacts-model"
import { processItems, runningCount } from "./process-control-data"
import { useSessionLayout } from "./session-layout"
import "./capabilities.css"

const KIND_ICON = { image: "photo", video: "photo", pdf: "open-file", sheet: "bullet-list", download: "download" } as const

function createSessionCapabilities(props: { revealPart: (partID: string) => boolean }) {
  const platform = usePlatform()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const sync = useSync()
  const layout = useSessionLayout()
  const parts = createMemo(() => {
    const id = layout.params.id
    if (!id) return []
    const data = sync().data
    return (data.message[id] ?? []).flatMap((message) => data.part[message.id] ?? [])
  })
  const session = createMemo(() => {
    const id = layout.params.id
    if (!id) return
    const http = serverSDK().server.http
    const api = createArtifactsApi({ server: http, directory: sdk().directory, sessionID: id as SessionID, fetch: platform.fetch })
    const model = createArtifactsModel(api)
    onCleanup(model.dispose)
    untrack(() => void model.load())
    return { api, model, sessionID: id as SessionID, directory: sdk().directory }
  })
  const processes = createMemo(() => processItems(parts()))
  const running = createMemo(() => runningCount(processes()))
  const openArtifact = (ref: ArtifactRef) => {
    const current = session()
    if (!current) return
    void current.model.select(ref)
    if (!artifactsOpen()) toggleArtifacts()
  }
  const artifactsOpen = () => layout.view().reviewPanel.opened() && layout.tabs().active() === "artifacts"
  // The tab strip mounts with the panel; select the tab once it exists, as the Tasks auto-open does.
  const toggleArtifacts = () => {
    if (artifactsOpen()) return layout.view().reviewPanel.close()
    layout.view().reviewPanel.open()
    layout.tabs().open("artifacts")
    queueMicrotask(() => layout.tabs().setActive("artifacts"))
  }
  const revealCall = (callID: string) => {
    const part = parts().find((item) => item.type === "tool" && item.callID === callID)
    if (!part || !props.revealPart(part.id)) return
    // The virtualizer mounts the row after the scroll lands, so flash it on the next frames.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-timeline-part-id="${CSS.escape(part.id)}"]`)
      if (!row) return
      row.removeAttribute("data-capability-flash")
      void row.offsetWidth
      row.setAttribute("data-capability-flash", "")
      setTimeout(() => row.removeAttribute("data-capability-flash"), 1600)
    }))
  }
  return { session, processes, running, artifactsOpen, toggleArtifacts, openArtifact, revealCall }
}

type SessionCapabilities = ReturnType<typeof createSessionCapabilities>

const SessionCapabilitiesContext = createContext<SessionCapabilities>()

/** Absent outside a Session route, so shared chrome renders without capability controls. */
export const useSessionCapabilities = () => useContext(SessionCapabilitiesContext)

export function SessionCapabilitiesProvider(props: ParentProps<{ revealPart: (partID: string) => boolean }>) {
  const value = createSessionCapabilities(props)
  return (
    <SessionCapabilitiesContext.Provider value={value}>
      <ToolPartSlot.Provider value={ArtifactChips}>{props.children}</ToolPartSlot.Provider>
    </SessionCapabilitiesContext.Provider>
  )
}

function ArtifactChips(props: { part: typeof SessionV1.ToolPart.Encoded }) {
  const language = useLanguage()
  const capabilities = useSessionCapabilities()
  // The transcript's v1 tool part and the v2 wire part share the fields the chip reader looks at.
  const refs = createMemo(() => artifactChips(props.part as unknown as Part))
  return (
    <div data-component="artifact-chips" hidden={refs().length === 0 || undefined}>
      <For each={refs()}>
        {(ref) => {
          const row = createMemo(() => capabilities?.session()?.model.state.artifacts
            .find((item) => item.artifact.id === ref.id && item.artifact.revision === ref.revision))
          const kind = createMemo(() => {
            const current = row()
            return current ? previewKind(current.mime) : "download"
          })
          const label = () => language.t(`orchestra.artifacts.kind.${kind()}`)
          return (
            <button
              type="button"
              data-slot="artifact-chip"
              aria-label={language.t("orchestra.artifacts.chip", { kind: label() })}
              title={language.t("orchestra.artifacts.chip.label", { id: ref.id, n: ref.revision })}
              onClick={() => capabilities?.openArtifact(ref)}
            >
              <Icon name={KIND_ICON[kind()]} size="small" />
              <span data-slot="artifact-chip-kind">{row() ? label() : language.t("orchestra.artifacts.revision", { n: ref.revision })}</span>
              <span data-slot="artifact-chip-meta" hidden={!row() || undefined}>{bytes(row()?.bytes)}</span>
            </button>
          )
        }}
      </For>
    </div>
  )
}
