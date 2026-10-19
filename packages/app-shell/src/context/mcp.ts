import { useMutation } from "@tanstack/solid-query"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSync } from "@/context/sync"
import { showToast } from "@/utils/toast"

export function useMcpToggle() {
  const sync = useSync()
  const language = useLanguage()
  const platform = usePlatform()

  return useMutation(() => ({
    mutationFn: (name: string) => sync().mcp.toggle(name, (url) => platform.openExternal(url)),
    onError: (error) =>
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      }),
  }))
}
