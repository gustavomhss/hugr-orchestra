import { getFilename } from "@orchestra/core/util/path"
import { createMemo, onCleanup } from "solid-js"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useTabs } from "@/context/tabs"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { displayName } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import { formatServerError } from "@/utils/server-errors"
import { createLeanAPI, LeanAPIError } from "./lean-api"
import { createLeanController, LeanResponseError } from "./lean-controller"
import { LeanProfileView } from "./lean-view"

export default function LeanPage(props: ChapterPageProps) {
  const global = useGlobal()
  const language = useLanguage()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const tabs = useTabs()
  const key = pathKey(props.directory)
  const profileName = createMemo(() => {
    const project = global.ensureServerCtx(props.server).projects.list()
      .find((item) => pathKey(item.worktree) === key || item.sandboxes?.some((directory) => pathKey(directory) === key))
    return project ? displayName(project) : getFilename(props.directory) || props.directory
  })
  const controller = createLeanController((error) => {
    if (error instanceof LeanAPIError) return {
      message: language.t("lean.page.unavailable"), unavailable: error.reason === "unsupported",
    }
    if (error instanceof LeanResponseError) return {
      message: language.t(error.reason === "scope" ? "lean.invalidScope" : "lean.page.historyUnavailable"),
    }
    return { message: formatServerError(error, language.t, language.t("error.chain.unknown")) }
  })
  void controller.select({ server: ServerConnection.key(props.server), directory: props.directory, transport: createLeanAPI(sdk()) })
  onCleanup(() => controller.dispose())
  onCleanup(serverSDK().event.listen((event) => {
    if (event.name !== "global" && pathKey(event.name) !== key) return
    const type: string = event.details.type
    if (type === "config.updated" || type === "global.disposed" || type === "server.instance.disposed")
      void controller.refresh()
  }))
  return <LeanProfileView
    profileName={profileName()}
    {...controller.state}
    onUpdate={controller.update}
    onHistory={(itemID) => void controller.history(itemID)}
    onRefresh={() => void controller.refresh()}
    onOpenSession={(sessionId) => {
      tabs.select(tabs.addSessionTab({ server: ServerConnection.key(props.server), sessionId }))
    }}
  />
}
