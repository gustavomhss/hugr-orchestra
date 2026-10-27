import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useFlight } from "@/orchestra/chapters/flight-engineer/run"

// Only the desktop app has a live seat, so the commands exist only there.
// Starting always goes through the consent dialog, so the palette and the hotkey ask the same question.
export function LiveSeatCommands() {
  const command = useCommand()
  const language = useLanguage()
  const seat = usePlatform().liveSeat
  const flight = useFlight()
  if (!seat) return null
  command.register("orchestra.live", () => [
    {
      id: "live.start",
      title: language.t("live.command.start"),
      category: language.t("command.category.live"),
      onSelect: () => flight.requestStart(),
    },
    {
      id: "live.stop",
      title: language.t("live.command.stop"),
      category: language.t("command.category.live"),
      onSelect: () => void flight.stop(),
    },
  ])
  return null
}
