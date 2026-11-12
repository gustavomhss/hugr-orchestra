import { meetingClient } from "./live-meeting-client"

export const fixtureCredentials = { username: "fixture", password: "meeting-proof" }
export const fixtureSegment = {
  id: "cd84522b-caf9-4cdd-8f74-7d94d4ba1eac", track: "me" as const,
  text: "Fixture transcript retained for delivery.", startMs: 0, endMs: 100,
}
export type DeliveryReport = {
  phase: "started" | "appended" | "failed" | "recovered" | "stop-called" | "stop-settled" | "stop-rejected" | "fixture-error"
  meetingID?: string
  pending?: number
}

// Only the controlled child executes the client. Importing its shared fixture data never starts a timer or request.
if (import.meta.main) {
  const mode = process.argv[2]
  const url = process.argv[3]
  const sessionID = process.argv[4]
  const directory = process.argv[5]
  if (!mode || !url || !sessionID || !directory || !["normal", "transient", "ended", "pending", "redirect"].includes(mode))
    throw new Error("Missing meeting fixture arguments")
  const report = async (event: DeliveryReport) => {
    const response = await fetch(new URL("/fixture/report", url), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event),
    })
    if (!response.ok) throw new Error("Meeting fixture report refused")
  }
  const failed = Promise.withResolvers<void>()
  const recovered = Promise.withResolvers<void>()
  const client = meetingClient({ url, directory, ...fixtureCredentials }, {
    failed: (_, pending) => { void report({ phase: "failed", pending }); failed.resolve() },
    recovered: () => { void report({ phase: "recovered" }); recovered.resolve() },
  })
  // These are fixture lifetime controls, not product deadlines. Parent finally kills and awaits this owned child.
  setInterval(() => {}, 1000)
  setTimeout(() => process.exit(2), 20_000)
  try {
    const meeting = await client.start(sessionID, "Delivery proof")
    await report({ phase: "started", meetingID: meeting.id })
    if (mode === "ended") {
      await client.stop(meeting.id)
      await report({ phase: "stop-settled" })
      client.append(meeting.id, fixtureSegment)
      await report({ phase: "appended" })
    }
    if (mode !== "ended") {
      client.append(meeting.id, fixtureSegment)
      await report({ phase: "appended" })
      if (mode === "transient") {
        await failed.promise
        await recovered.promise
      }
      if (mode === "pending") await failed.promise
      if (mode !== "redirect") {
        await report({ phase: "stop-called" })
        void client.stop(meeting.id).then(
          () => report({ phase: "stop-settled" }),
          () => report({ phase: "stop-rejected" }),
        )
      }
    }
  } catch {
    await report({ phase: "fixture-error" })
  }
}
