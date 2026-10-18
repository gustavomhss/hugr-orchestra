import { Dialog } from "@kobalte/core/dialog"
import { useLocation } from "@solidjs/router"
import { createEffect, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useCommand } from "@/context/command"
import { Icon } from "@orchestra/ui/v2/icon"
import { OrchestraSidebar } from "@/orchestra/sidebar"
import "./mobile-navigation.css"

export function MobileNavigation() {
  const language = useLanguage()
  const command = useCommand()
  const location = useLocation()
  const [state, setState] = createStore({ open: false })
  createEffect(() => {
    if (!state.open) return
    command.keybinds(false)
    onCleanup(() => command.keybinds(true))
  })
  createEffect(
    on(
      () => `${location.pathname}${location.search}`,
      () => setState("open", false),
      { defer: true },
    ),
  )
  return (
    <Dialog open={state.open} onOpenChange={(open) => setState("open", open)}>
      <Dialog.Trigger
        class="orchestra-nav-button orchestra-navigation-toggle orchestra-mobile-navigation-trigger shrink-0"
        aria-label={language.t("orchestra.shell.navigation")}
        aria-expanded={state.open}
        aria-controls="orchestra-mobile-navigation"
      >
        <Icon name="sidebar-right" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay class="orchestra-mobile-navigation-overlay" />
        <Dialog.Content
          id="orchestra-mobile-navigation"
          class="orchestra-mobile-navigation"
          data-navigation="expanded"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return
            event.preventDefault()
            event.stopPropagation()
            setState("open", false)
          }}
        >
          <Dialog.Title class="orchestra-sr-only">{language.t("orchestra.shell.navigation")}</Dialog.Title>
          <OrchestraSidebar
            compact={false}
            constrained={false}
            onToggle={() => setState("open", false)}
            onNavigate={() => setState("open", false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  )
}
