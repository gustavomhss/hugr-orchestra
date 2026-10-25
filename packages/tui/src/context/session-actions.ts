import type { Orchestra } from "@orchestra/client"
import type { FilePart } from "../compat/schema"

type Client = ReturnType<typeof Orchestra.make>

// The V2 server serves these session actions under `/api/session/:id/*`. The legacy `/session/:id/*`
// routes (abort, shell, command, summarize, revert, unrevert) are not served by it.
export function createSessionActions(client: Client) {
  return {
    interrupt: (sessionID: string) => client.sessions.interrupt({ sessionID }),
    // V2 compaction uses the Session's own model, so no model is passed.
    compact: (sessionID: string) => client.sessions.compact({ sessionID }),
    // V2 shell records the command and its output for the next turn; it takes no agent or model.
    shell: (input: { sessionID: string; command: string }) => client.sessions.shell(input),
    revert: (input: { sessionID: string; messageID: string }) => client.sessions.stage({ ...input, files: true }),
    unrevert: (sessionID: string) => client.sessions.clear({ sessionID }),
    // V2 commands run on the Session's selected agent and model, so select them first.
    async command(input: {
      sessionID: string
      command: string
      arguments: string
      agent: string
      model: { providerID: string; modelID: string; variant?: string }
      files: ReadonlyArray<Pick<FilePart, "url" | "filename" | "source">>
    }) {
      await client.sessions.switchAgent({ sessionID: input.sessionID, agent: input.agent })
      await client.sessions.switchModel({
        sessionID: input.sessionID,
        model: { providerID: input.model.providerID, id: input.model.modelID, variant: input.model.variant },
      })
      return client.sessions.command({
        sessionID: input.sessionID,
        command: input.command,
        arguments: input.arguments,
        files: input.files.map((file) => ({
          uri: file.url,
          name: file.filename,
          source: file.source?.text
            ? { start: file.source.text.start, end: file.source.text.end, text: file.source.text.value }
            : undefined,
        })),
      })
    },
  }
}
