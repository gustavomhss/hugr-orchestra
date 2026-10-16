import { resolveTemplate } from "@solid-primitives/i18n"
import type { useLanguage } from "@/context/language"

export const SESSION_RECOVERY_COPY = {
  "common.retry": "Retry",
  "session.archive.unavailable": "Archive unavailable on this server",
  "session.restore.unavailable": "Restore unavailable on this server",
  "session.restore.title": "Restore session",
  "session.archived.title": "Archived sessions",
  "session.archived.description": "Restore archived sessions in this directory.",
  "session.archived.empty": "No archived sessions in this directory.",
  "session.archived.loadFailed": "Could not load archived sessions.",
  "session.subagentModels.unsupported": "Subagent models unavailable on this server",
  "session.subagentModels.denyAll": "No models allowed. Subagent delegation is disabled.",
  "session.review.detailFailed": "Could not load changes for {{file}}.",
} as const

// Feature-owned English fallback; registered locale translations take precedence.
export function sessionRecoveryLanguage(language: ReturnType<typeof useLanguage>) {
  return {
    ...language,
    t: (key: Parameters<typeof language.t>[0] | keyof typeof SESSION_RECOVERY_COPY, params?: Record<string, string | number | boolean>) => {
      const translated = language.t(key as Parameters<typeof language.t>[0], params)
      if (translated && translated !== key) return translated
      const fallback = SESSION_RECOVERY_COPY[key as keyof typeof SESSION_RECOVERY_COPY]
      return fallback ? resolveTemplate(fallback, params ?? {}) : translated
    },
  }
}
