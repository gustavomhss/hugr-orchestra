import { resolveTemplate } from "@solid-primitives/i18n"
import type { useLanguage } from "@/context/language"

export const SESSION_RECOVERY_COPY = {
  "common.retry": "Retry",
  "session.archive.unavailable": "Archive unavailable on this server",
  "session.review.detailFailed": "Could not load changes for {{file}}.",
} as const

// Feature-owned English fallback; registered locale translations take precedence.
export function sessionRecoveryLanguage(language: ReturnType<typeof useLanguage>) {
  return {
    ...language,
    t: (key: Parameters<typeof language.t>[0], params?: Record<string, string | number | boolean>) => {
      const translated = language.t(key, params)
      if (translated) return translated
      const fallback = SESSION_RECOVERY_COPY[key as keyof typeof SESSION_RECOVERY_COPY]
      return fallback ? resolveTemplate(fallback, params ?? {}) : translated
    },
  }
}
