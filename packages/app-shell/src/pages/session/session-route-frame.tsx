import { createEffect, type ParentProps } from "solid-js"
import { ModelsProvider } from "@/context/models"
import { useNotification } from "@/context/notification"
import { TerminalProvider } from "@/context/terminal"
import { FileProvider } from "@/context/file"
import { PromptProvider } from "@/context/prompt"
import { CommentsProvider } from "@/context/comments"
import { ServerConnection } from "@/context/server"
import { SessionLineageBoundary } from "./session-lineage-boundary"
import { SessionErrorFallback } from "@/pages/session/session-fallback"

export function SessionRouteErrorBoundary(
  props: ParentProps<{ sessionID?: string; serverKey?: ServerConnection.Key; padded?: boolean }>,
) {
  return (
    <SessionLineageBoundary
      identity={() => JSON.stringify([props.serverKey, props.sessionID])}
      fallback={(error, reset) => (
        <SessionRouteFrame padded={props.padded}>
          <SessionPanelFrame raised={!!props.sessionID}>
            <SessionErrorFallback error={error} sessionID={props.sessionID} serverKey={props.serverKey} onRetry={reset} />
          </SessionPanelFrame>
        </SessionRouteFrame>
      )}
    >
      {props.children}
    </SessionLineageBoundary>
  )
}

export function TargetServerScopedProviders(
  props: ParentProps<{ directory?: () => string | undefined; sessionID?: () => string | undefined }>,
) {
  return (
    <>
      <MarkSessionNotificationsViewed sessionID={props.sessionID} />
      <ModelsProvider directory={props.directory}>{props.children}</ModelsProvider>
    </>
  )
}

export function MarkSessionNotificationsViewed(props: { sessionID?: () => string | undefined }) {
  const notification = useNotification()
  createEffect(() => {
    const sessionID = props.sessionID?.()
    if (!notification.ready() || !sessionID) return
    if (notification.session.unseenCount(sessionID) === 0) return
    notification.session.markViewed(sessionID)
  })
  return null
}

export function SessionProviders(props: ParentProps) {
  return (
    <TerminalProvider>
      <FileProvider>
        <PromptProvider>
          <CommentsProvider>{props.children}</CommentsProvider>
        </PromptProvider>
      </FileProvider>
    </TerminalProvider>
  )
}

export function SessionRouteFrame(props: ParentProps<{ padded?: boolean }>) {
  return (
    <div
      data-session-layout="surface"
      class="relative size-full overflow-hidden flex flex-col"
      classList={{ "p-2": props.padded }}
    >
      {props.children}
    </div>
  )
}

export function SessionPanelFrame(props: ParentProps<{ raised?: boolean }>) {
  return (
    <div
      data-session-layout="body"
      data-raised={props.raised ? "" : undefined}
      classList={{
        "flex-1 min-h-0 flex flex-col bg-v2-background-bg-base rounded-[10px] overflow-hidden": true,
        "shadow-[var(--v2-elevation-raised)]": !!props.raised,
      }}
    >
      {props.children}
    </div>
  )
}

