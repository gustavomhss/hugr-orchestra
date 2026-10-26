import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { usePlatform, type LiveSeatPlatform } from "@/context/platform"
import { showToast } from "@/utils/toast"

// Only the desktop app has a live seat, so the commands exist only there.
export function LiveSeatCommands() {
  const command = useCommand()
  const language = useLanguage()
  const seat = usePlatform().liveSeat
  if (!seat) return null
  command.register("orchestra.live", () => [
    {
      id: "live.start",
      title: language.t("live.command.start"),
      category: language.t("command.category.live"),
      onSelect: () => void startLiveMeeting(seat, language.t),
    },
    {
      id: "live.stop",
      title: language.t("live.command.stop"),
      category: language.t("command.category.live"),
      onSelect: () => void seat.stop(),
    },
  ])
  return null
}

export function startLiveMeeting(seat: LiveSeatPlatform, t: ReturnType<typeof useLanguage>["t"]) {
  return seat
    .start()
    .catch(() => ({ ok: false, reason: "server" }) as const)
    .then((result) => {
      if (result.ok) return
      showToast({
        variant: "error",
        title: t("live.start.failed"),
        description: t(`live.start.reason.${result.reason}`),
      })
    })
}
