// Only browser-scoped callers meet this message: a Linux-scoped call reports the missing workspace instead.
export function toolErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message === "App Dock has no open tabs" ? `${message}; open one with dock_open` : message
}
const busy = "The app did not answer in time; it may be busy, e.g. showing a dialog an action opened. Look again (ui_look) before retrying an action: it may already have happened"
// What the model can do next for codes that otherwise led unscripted runs into blind retries. Native codes reach
// agents only through the linux agent's ui_* tools; unsupported-backend only through a browser-scoped call.
const hints: Record<string, string> = {
  "unstable-ref": 'This control sits below virtual ancestry (lists, trees); retry ui_act with mode: "observed"',
  "unsupported-interface": 'This field has no editable-text interface; retry ui_type with mode: "keyboard"',
  "stale-ref": "Native refs expire when the app changes; pass target {name, role} to locate and act in one call",
  "unsupported-backend": "dock_* tools act on browser tabs: read the page with dock_read and use its numeric refs. Apps in the Linux workspace are operated by the linux agent; hand that work to it",
  timeout: busy,
  "transport-timeout": busy,
  "app-not-responding": "The app stopped answering, likely busy in a dialog it opened. Do not repeat the action; look again (ui_look) in a moment, and if the app stays missing, report it",
  "menu-closed": "Open the menu that holds this item first (ui_act on the menu, e.g. File), then act on the item",
}

export function hintFor(code: string) {
  return hints[code]
}

export * as AppDockHints from "./app-dock-hints"
