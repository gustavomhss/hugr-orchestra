import { showToast } from "@/utils/toast"
import { RelayError } from "./client"
import type { RelaySource } from "./source"
import type { useRelayCopy } from "./ui"

export type InstallChange = "install" | "update" | "pause" | "uninstall"

// The install list after a change. Callers hold their switch until it lands: a click before then would repeat the
// old action against the old list ("already installed"). A paused refetch (offline) answers at once.
export const refreshInstalls = (source: RelaySource) =>
  source.queryClient().invalidateQueries({ queryKey: source.key("installs") })

// What the user is told when a hook change did not go through, or went through without its audit receipt. The server
// writes the change first and then records the receipt, so `receipt-unrecorded` means the change is in effect.
export function installNotice(copy: ReturnType<typeof useRelayCopy>, change: InstallChange, error: unknown) {
  const code = error instanceof RelayError ? error.code : undefined
  if (code === "receipt-unrecorded")
    return showToast({
      icon: "warning",
      title: copy.t(`orchestra.hooks.receipt.${change}`),
      description: copy.t("orchestra.hooks.receipt.body"),
    })
  return showToast({
    title: copy.t("orchestra.hooks.installFailed"),
    description: refusal(copy, code) ?? (error instanceof Error && error.message ? error.message : String(error)),
  })
}

// The server's wording names documents and installs by id; these refusals have a plain reading.
function refusal(copy: ReturnType<typeof useRelayCopy>, code: string | undefined) {
  if (code === "profile-overflow") return copy.t("orchestra.hooks.installFailed.overflow")
  if (code === "document-installed") return copy.t("orchestra.hooks.installFailed.installed")
  if (code === "install-missing") return copy.t("orchestra.hooks.installFailed.missing")
}
