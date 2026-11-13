import { afterEach, expect, test } from "bun:test"
import { DESKTOP_NATIVE_ENGLISH } from "@orchestra/app/i18n/desktop-native"
import { setNativeTranslations } from "./native-translations"
import { startupFailureDialog } from "./startup-failure"

afterEach(() => {
  setNativeTranslations({ locale: "en", messages: { ...DESKTOP_NATIVE_ENGLISH } })
})

test("startup failure dialog keeps the English bytes and follows the native bundle", () => {
  expect(startupFailureDialog("disk full\nmore", "/tmp/logs")).toEqual({
    title: "HuGR Orchestra could not start",
    message: "disk full\n\nLogs: /tmp/logs",
  })

  setNativeTranslations({
    locale: "br",
    messages: {
      ...DESKTOP_NATIVE_ENGLISH,
      "desktop.startup.failed": "traduzido",
      "desktop.startup.failed.detail": "{{reason}} // {{logs}}",
    },
  })

  expect(startupFailureDialog("disk full\nmore", "/tmp/logs")).toEqual({
    title: "traduzido",
    message: "disk full // /tmp/logs",
  })
})
