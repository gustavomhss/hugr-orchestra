export * as FrontendRecovery from "./frontend-recovery"
export { subagentModels } from "./frontend-recovery/subagent-models"
import type { ModelExecution } from "@orchestra/schema/model-execution"

export function modelExecutionReasonKey(reason?: ModelExecution.Reason) {
  if (!reason) return "model.execution.unavailable"
  return ({
    "model-missing": "model.execution.reason.missing",
    "model-disabled": "model.execution.reason.disabled",
    "connection-unavailable": "model.execution.reason.connection",
    "model-denied": "model.execution.reason.denied",
    "unsupported-api": "model.execution.reason.unsupported",
    "invalid-options": "model.execution.reason.options",
    "variant-unavailable": "model.execution.reason.variant",
    "host-unregistered": "model.execution.reason.engineMissing",
    "host-unavailable": "model.execution.reason.engineUnavailable",
    "host-model-unsupported": "model.execution.reason.unsupported",
    "host-options-unsupported": "model.execution.reason.engineOptions",
  } as const)[reason]
}

// Share the existing picker copy so legacy locale dictionaries can add recovery overlays without growing.
export const subagentModelsBase = {
  "dialog.subagentModels.title": "Subagent models",
  "dialog.subagentModels.description": "Choose which models this session's subagents may use.",
  "dialog.subagentModels.hint": "Unchecked models are denied for subagents in this session.",
}

export const FRONTEND_RECOVERY_COPY = {
  "model.execution.unavailable": "This model is unavailable for this session. Choose an available model or try again.",
  "model.execution.reason.missing": "Model is no longer available",
  "model.execution.reason.disabled": "Model is disabled",
  "model.execution.reason.connection": "Connect this provider to use the model",
  "model.execution.reason.denied": "Model is not allowed for this session",
  "model.execution.reason.unsupported": "Model is not supported by this engine",
  "model.execution.reason.options": "Model settings are invalid",
  "model.execution.reason.variant": "Selected variant is unavailable",
  "model.execution.reason.engineMissing": "Selected engine is not installed",
  "model.execution.reason.engineUnavailable": "Selected engine is unavailable",
  "model.execution.reason.engineOptions": "Selected settings are not supported by this engine",
  "settings.general.row.janitor.title": "Janitor assistant",
  "settings.general.row.janitor.description":
    "Show Janitor findings and notifications. Off by default; enable it when you want proactive maintenance advice.",
} as const

export const FRONTEND_RECOVERY_COPY_BR: Record<keyof typeof FRONTEND_RECOVERY_COPY, string> = {
  "model.execution.unavailable": "Este modelo está indisponível para esta sessão. Escolha um modelo disponível ou tente novamente.",
  "model.execution.reason.missing": "O modelo não está mais disponível",
  "model.execution.reason.disabled": "O modelo está desativado",
  "model.execution.reason.connection": "Conecte este provedor para usar o modelo",
  "model.execution.reason.denied": "O modelo não é permitido nesta sessão",
  "model.execution.reason.unsupported": "Este mecanismo não oferece suporte ao modelo",
  "model.execution.reason.options": "As configurações do modelo são inválidas",
  "model.execution.reason.variant": "A variante selecionada está indisponível",
  "model.execution.reason.engineMissing": "O mecanismo selecionado não está instalado",
  "model.execution.reason.engineUnavailable": "O mecanismo selecionado está indisponível",
  "model.execution.reason.engineOptions": "Este mecanismo não oferece suporte às configurações selecionadas",
  "settings.general.row.janitor.title": "Assistente Janitor",
  "settings.general.row.janitor.description": "Mostra os achados e notificações do Janitor. Desligado por padrão; ative quando quiser conselhos proativos de manutenção.",
}
