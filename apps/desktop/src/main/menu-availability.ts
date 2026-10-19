const PREFIX = "command:"

export function menuItemId(command: string, index: number) {
  return `${PREFIX}${command}#${index}`
}

type MenuLike = { items: ItemLike[] }
type ItemLike = { id?: string; enabled: boolean; submenu?: MenuLike | null }

/**
 * Enables or disables every menu item bound to a renderer command. `available` is the renderer's last report of
 * commands that are registered and not disabled; null means no report yet, so everything stays enabled.
 */
export function applyMenuAvailability(menu: MenuLike | null, available: readonly string[] | null) {
  if (!menu) return
  const allowed = available && new Set(available)
  const walk = (items: ItemLike[]) => {
    items.forEach((item) => {
      if (item.submenu) walk(item.submenu.items)
      if (!item.id?.startsWith(PREFIX)) return
      item.enabled = !allowed || allowed.has(item.id.slice(PREFIX.length).split("#")[0])
    })
  }
  walk(menu.items)
}
