export * as FrontendRecovery from "./frontend-recovery"
export { subagentModels } from "./frontend-recovery/subagent-models"

// Share the existing picker copy so legacy locale dictionaries can add recovery overlays without growing.
export const subagentModelsBase = {
  "dialog.subagentModels.title": "Subagent models",
  "dialog.subagentModels.description": "Choose which models this session's subagents may use.",
  "dialog.subagentModels.hint": "Unchecked models are denied for subagents in this session.",
}

export const FRONTEND_RECOVERY_COPY = {
  "settings.general.row.janitor.title": "Janitor assistant",
  "settings.general.row.janitor.description":
    "Show Janitor findings and notifications. Off by default; enable it when you want proactive maintenance advice.",
} as const

export const FRONTEND_RECOVERY_COPY_BR: Record<keyof typeof FRONTEND_RECOVERY_COPY, string> = {
  "settings.general.row.janitor.title": "Assistente Janitor",
  "settings.general.row.janitor.description": "Mostra os achados e notificações do Janitor. Desligado por padrão; ative quando quiser conselhos proativos de manutenção.",
}
