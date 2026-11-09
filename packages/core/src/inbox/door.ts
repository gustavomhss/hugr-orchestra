import type { DoorInput } from "./types"

export function door(input: DoorInput): { readonly href: string } | { readonly openApp: true } {
  if (input.from === "none" || !input.number) return { openApp: true }
  const trimmed = input.number.trim()
  if (!trimmed.startsWith("+")) return { openApp: true }
  const digits = trimmed.replace(/\D/g, "")
  if (digits.length < 8) return { openApp: true }
  return { href: `https://wa.me/${digits}` }
}
