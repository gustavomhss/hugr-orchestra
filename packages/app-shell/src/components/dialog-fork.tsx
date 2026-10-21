import { Component, createEffect, createMemo, onCleanup } from "solid-js"
import { useLocation, useNavigate, useParams } from "@solidjs/router"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { usePrompt } from "@/context/prompt"
import { useDialog } from "@orchestra/ui/context/dialog"
import { Dialog } from "@orchestra/ui/dialog"
import { List } from "@orchestra/ui/list"
import { showToast } from "@/utils/toast"
import { extractPromptFromParts } from "@/utils/prompt"
import type { TextPart } from "@/v2-types"
import { base64Encode } from "@orchestra/core/util/encode"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { ServerConnection } from "@/context/server"
import { sessionHref } from "@/utils/session-route"

interface ForkableMessage {
  id: string
  text: string
  time: string
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { timeStyle: "short" })
}

export const DialogFork: Component = () => {
  const params = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname
  const sync = useSync()
  const sdk = useSDK()
  const prompt = usePrompt()
  const dialog = useDialog()
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const source = sdk()
  const sourceSync = sync()
  const sourceID = params.id
  const server = ServerConnection.key(serverSDK().server)
  let active = true
  let pending = false
  onCleanup(() => {
    active = false
  })
  createEffect(() => {
    if (location.pathname !== pathname || params.id !== sourceID || sdk().scope !== source.scope) active = false
  })

  const messages = createMemo((): ForkableMessage[] => {
    const sessionID = sourceID
    if (!sessionID) return []

    const msgs = sourceSync.data.message[sessionID] ?? []
    const result: ForkableMessage[] = []

    for (const message of msgs) {
      if (message.role !== "user") continue

      const parts = sourceSync.data.part[message.id] ?? []
      const textPart = parts.find((x): x is TextPart => x.type === "text" && !x.synthetic && !x.ignored)
      if (!textPart) continue

      result.push({
        id: message.id,
        text: textPart.text.replace(/\n/g, " ").slice(0, 200),
        time: formatTime(new Date(message.time.created)),
      })
    }

    return result.reverse()
  })

  const handleSelect = (item: ForkableMessage | undefined) => {
    if (!item || !active || pending) return

    const sessionID = sourceID
    if (!sessionID) return

    const parts = sourceSync.data.part[item.id] ?? []
    const restored = extractPromptFromParts(parts, {
      directory: source.directory,
      attachmentName: language.t("common.attachment"),
    })
    const dir = base64Encode(source.directory)
    pending = true

    return source.api.session
      .fork({ sessionID, messageID: item.id })
      .then((forked) => {
        if (!active || location.pathname !== pathname || params.id !== sourceID || sdk().scope !== source.scope) return
        const target = prompt.capture({ dir, id: forked.id })
        target.set(restored)
        dialog.close()
        navigate(sessionHref(server, forked.id))
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
      .finally(() => {
        pending = false
      })
  }

  return (
    <Dialog title={language.t("command.session.fork")}>
      <List
        class="flex-1 px-3 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0"
        search={{ placeholder: language.t("common.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.fork.empty")}
        key={(x) => x.id}
        items={messages}
        filterKeys={["text"]}
        onSelect={handleSelect}
      >
        {(item) => (
          <div class="w-full flex items-center gap-2">
            <span class="truncate flex-1 min-w-0 text-left font-normal">{item.text}</span>
            <span class="text-text-weak shrink-0 font-normal">{item.time}</span>
          </div>
        )}
      </List>
    </Dialog>
  )
}
