import type { ServerSDK } from "@/context/server-sdk"
import type { Detail, StartOptions, Summary } from "./model"
import type { MeetingDeleteOutput } from "@orchestra/client"

export type Receipt = MeetingDeleteOutput["data"]
export type Verdict = "confirmed" | "disputed" | "dismissed"
export type Page = { items: readonly Summary[]; next?: string | null }

// The meeting calls the screens use. Production reads the server; a dev build can swap in the fixture (fixture.ts).
export type Meetings = {
  list(input: { query?: string; person?: string; limit?: number; before?: string }, signal?: AbortSignal): Promise<Page>
  read(meetingID: string, signal?: AbortSignal): Promise<Detail>
  rename(meetingID: string, title: string): Promise<void>
  remove(meetingID: string): Promise<Receipt>
  confirm(meetingID: string, items: { id: string; verdict: Verdict }[]): Promise<void>
  commitment(id: string, state: "accepted" | "done" | "dropped"): Promise<void>
  handoff(meetingID: string, itemIDs: string[]): Promise<readonly string[]>
}

export function serverMeetings(sdk: () => ServerSDK, directory: string): Meetings {
  const api = () => sdk().orchestra.meeting
  const location = { directory }
  return {
    list: (input, signal) => api().list({ location, ...input }, { signal }).then((result) => result.data),
    read: (meetingID, signal) => api().read({ location, meetingID }, { signal }).then((result) => result.data),
    rename: (meetingID, title) => api().rename({ location, meetingID, title }).then(() => undefined),
    remove: (meetingID) => api().delete({ location, meetingID }).then((result) => result.data),
    confirm: (meetingID, items) => api().confirm({ location, meetingID, items }).then(() => undefined),
    commitment: (id, state) => api().commitment({ location, id, state }).then(() => undefined),
    handoff: (meetingID, itemIDs) => api().handoff({ location, meetingID, itemIDs }).then((result) => result.data.sent),
  }
}

export type { StartOptions }
