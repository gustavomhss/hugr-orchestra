// Shared security boundary for the existing Main wrapper and its Live registrations.
export function requireTrustedSender(
  _event: { readonly senderFrame?: { readonly url: string } | null },
  _rendererDevURL: string | undefined,
  _channel: string,
): void {
  throw new Error("Trusted IPC boundary is not implemented")
}
