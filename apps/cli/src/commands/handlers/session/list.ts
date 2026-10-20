import { EOL } from "os"
import * as Effect from "effect/Effect"
import type { SessionsListOutput } from "@orchestra/client"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"

export default Runtime.handler(
  Commands.commands.session.commands.list,
  Effect.fn("cli.session.list")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const response = yield* Effect.promise(() =>
      client.sessions.list({ limit: input.limit, order: "desc" }),
    )
    if (response.data.length === 0) return
    process.stdout.write((input.format === "json" ? formatJSON(response.data) : formatTable(response.data)) + EOL)
  }),
)

type SessionsRow = SessionsListOutput["data"][number]

function formatTable(sessions: readonly SessionsRow[]): string {
  const maxIdWidth = Math.max(20, ...sessions.map((session) => session.id.length))
  const maxTitleWidth = Math.max(25, ...sessions.map((session) => session.title.length))
  const header = `Session ID${" ".repeat(maxIdWidth - 10)}  Title${" ".repeat(maxTitleWidth - 5)}  Updated`
  const lines = [header, "─".repeat(header.length)]
  for (const session of sessions) {
    const title = session.title.length > maxTitleWidth ? session.title.slice(0, maxTitleWidth - 1) + "…" : session.title
    lines.push(
      `${session.id.padEnd(maxIdWidth)}  ${title.padEnd(maxTitleWidth)}  ${new Date(session.time.updated).toLocaleString()}`,
    )
  }
  return lines.join(EOL)
}

function formatJSON(sessions: readonly SessionsRow[]): string {
  return JSON.stringify(
    sessions.map((session) => ({
      id: session.id,
      title: session.title,
      updated: session.time.updated,
      created: session.time.created,
      projectId: session.projectID,
      directory: session.location.directory,
    })),
    null,
    2,
  )
}