import { createStore } from "solid-js/store"
import { useSettings } from "@/context/settings"

export type Delivery = "steer" | "queue"

// The composer's Steer/Queue choice per session, for the window's lifetime. A session without a
// choice uses the follow-up setting.
const [choices, setChoices] = createStore<Record<string, Delivery>>({})

export function useSessionDelivery(sessionID: () => string | undefined) {
  const settings = useSettings()
  const choice = () => {
    const id = sessionID()
    if (!id) return settings.general.followup()
    return choices[id] ?? settings.general.followup()
  }
  return {
    choice,
    // What the next prompt sends.
    delivery: (): Delivery | undefined => (sessionID() ? choice() : undefined),
    toggle() {
      const id = sessionID()
      if (!id) return
      setChoices(id, choice() === "queue" ? "steer" : "queue")
    },
  }
}
