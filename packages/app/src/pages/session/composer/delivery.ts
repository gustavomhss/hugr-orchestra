import { createStore } from "solid-js/store"
import { useServerSDK } from "@/context/server-sdk"
import { useSettings } from "@/context/settings"

export type Delivery = "steer" | "queue"

// The composer's Steer/Queue choice per session, for the window's lifetime. A session without a
// choice uses the follow-up setting. Only V2 servers admit an explicit delivery mode.
const [choices, setChoices] = createStore<Record<string, Delivery>>({})

export function useSessionDelivery(sessionID: () => string | undefined) {
  const settings = useSettings()
  const serverSDK = useServerSDK()
  const supported = () => serverSDK().protocolKind() === "v2"
  const choice = () => {
    const id = sessionID()
    if (!id) return settings.general.followup()
    return choices[id] ?? settings.general.followup()
  }
  return {
    supported,
    choice,
    // What the next prompt sends: nothing at all where the server cannot honor a mode.
    delivery: (): Delivery | undefined => (sessionID() && supported() ? choice() : undefined),
    toggle() {
      const id = sessionID()
      if (!id || !supported()) return
      setChoices(id, choice() === "queue" ? "steer" : "queue")
    },
  }
}
