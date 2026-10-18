// Imported nowhere but through the `@/` alias (JE-AC-X2): a relative-only resolver finds no reference to it.
export function aliasOnly(label: string) {
  return `alias:${label}`
}
