import { Icon } from "@opencode-ai/ui/v2/icon"
import { useLanguage } from "@/context/language"
import { OrchestraNavigationTooltip } from "./navigation-tooltip"

export function OrchestraNavigationToggle(props: {
  compact: boolean
  constrained: boolean
  iconOnly?: boolean
  onToggle: () => void
}) {
  const language = useLanguage()
  const label = () => language.t(props.compact ? "orchestra.nav.expand" : "orchestra.nav.collapse")
  return (
    <OrchestraNavigationTooltip
      enabled={props.compact || props.iconOnly === true}
      value={props.constrained ? language.t("orchestra.nav.compactWidth") : label()}
    >
      {(Trigger) => (
        <Trigger
          type="button"
          class="orchestra-nav-button orchestra-navigation-toggle"
          aria-label={label()}
          aria-controls="orchestra-navigation"
          aria-expanded={!props.compact}
          aria-disabled={props.constrained || undefined}
          onClick={props.onToggle}
        >
          <Icon name="sidebar-right" class="orchestra-navigation-toggle-icon" />
          <span class="orchestra-nav-label">{label()}</span>
        </Trigger>
      )}
    </OrchestraNavigationTooltip>
  )
}
