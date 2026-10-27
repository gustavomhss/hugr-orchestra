// Copy for the lead's shared-dictionary merge. Until then open-path errors use common.requestFailed.
export const DESKTOP_RECOVERY_COPY = {
  "desktop.recovery.openPathFailed": "Could not open {{path}}.",
  "desktop.recovery.appUnavailable": "The selected application is not available: {{app}}.",
}

export const DESKTOP_RECOVERY_COPY_BR: Record<keyof typeof DESKTOP_RECOVERY_COPY, string> = {
  "desktop.recovery.openPathFailed": "Não foi possível abrir {{path}}.",
  "desktop.recovery.appUnavailable": "O aplicativo selecionado não está disponível: {{app}}.",
}
