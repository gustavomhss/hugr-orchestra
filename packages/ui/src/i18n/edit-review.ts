// Feature-owned copy. English is the base for every locale; locales with a translation layer it on top (see EDIT_REVIEW_COPY_BR).
// These keys stay out of the per-locale ui dictionaries because the parity suite requires every locale file to carry every English key.
export const EDIT_REVIEW_COPY = {
  "ui.messagePart.edit.awaitingReview": "Awaiting review",
  "ui.message.copyFailed": "Could not copy",
} as const

export const EDIT_REVIEW_COPY_BR: Record<keyof typeof EDIT_REVIEW_COPY, string> = {
  "ui.messagePart.edit.awaitingReview": "Aguardando revisão",
  "ui.message.copyFailed": "Não foi possível copiar",
}
