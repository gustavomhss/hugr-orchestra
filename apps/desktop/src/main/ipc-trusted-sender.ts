import { isRendererOrigin } from "./renderer-origin.ts"

// Shared security boundary for the existing Main wrapper and its Live registrations.
export function requireTrustedSender(
  event: { readonly senderFrame?: { readonly url: string } | null },
  rendererDevURL: string | undefined,
  channel: string,
): void {
  if (!isRendererOrigin(event.senderFrame?.url, rendererDevURL)) throw new Error(`Untrusted IPC sender: ${channel}`)
}
