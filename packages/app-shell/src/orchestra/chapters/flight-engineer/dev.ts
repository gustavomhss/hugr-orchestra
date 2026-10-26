import { createSignal } from "solid-js"
import type { LiveSeatPlatform } from "@/context/platform"
import type { Meetings } from "./source"

// Set only by fixture.ts, which a production build never loads (run.ts imports it behind import.meta.env.DEV).
export const [devSeat, setDevSeat] = createSignal<LiveSeatPlatform | undefined>()
export const [devMeetings, setDevMeetings] = createSignal<Meetings | undefined>()
