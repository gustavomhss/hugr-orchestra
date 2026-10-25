import type { Orchestra } from "@orchestra/client"
import type { TuiPromptAgentPart, TuiPromptFilePart } from "@orchestra/plugin/tui"

type Client = ReturnType<typeof Orchestra.make>
type Model = { providerID: string; modelID: string; variant?: string }

// The V2 server serves these session actions under `/api/session/:id/*`. The legacy `/session/:id/*`
// routes (abort, shell, command, summarize, revert, unrevert) are not served by it.
export function createSessionActions(client: Client) {
  async function select(input: { sessionID: string; agent: string; model: Model }) {
    await client.sessions.switchAgent({ sessionID: input.sessionID, agent: input.agent })
    await client.sessions.switchModel({
      sessionID: input.sessionID,
      model: { providerID: input.model.providerID, id: input.model.modelID, variant: input.model.variant },
    })
  }

  return {
    // Without a directory the V2 server places the Session in its own working directory.
    create: (input: { agent: string; model: Model; directory?: string; workspaceID?: string }) =>
      client.sessions.create({
        agent: input.agent,
        model: { providerID: input.model.providerID, id: input.model.modelID, variant: input.model.variant },
        location: input.directory ? { directory: input.directory, workspaceID: input.workspaceID } : undefined,
      }),
    // V1 sent the agent and model with every prompt; V2 prompts run on the Session's selection, so select first.
    // Editor context was a hidden synthetic part in V1; V2 admits it as a synthetic input that does not wake the
    // Session, so the prompt that follows carries it into the same turn.
    async prompt(input: {
      sessionID: string
      text: string
      context?: string
      agent: string
      model: Model
      files: ReadonlyArray<Pick<TuiPromptFilePart, "url" | "filename" | "source">>
      agents: ReadonlyArray<Pick<TuiPromptAgentPart, "name" | "source">>
    }) {
      await select(input)
      if (input.context)
        await client.sessions.synthetic({ sessionID: input.sessionID, text: input.context, resume: false })
      return client.sessions.prompt({
        sessionID: input.sessionID,
        prompt: {
          text: input.text,
          files: input.files.map(toFile),
          agents: input.agents.map((agent) => ({
            name: agent.name,
            source: agent.source
              ? { start: agent.source.start, end: agent.source.end, text: agent.source.value }
              : undefined,
          })),
        },
      })
    },
    interrupt: (sessionID: string) => client.sessions.interrupt({ sessionID }),
    // V2 compaction uses the Session's own model, so no model is passed.
    compact: (sessionID: string) => client.sessions.compact({ sessionID }),
    // V2 shell records the command and its output for the next turn; it takes no agent or model.
    shell: (input: { sessionID: string; command: string }) => client.sessions.shell(input),
    reply: (input: { sessionID: string; requestID: string; reply: "once" | "always" | "reject" }) =>
      client.permissions.reply(input),
    revert: (input: { sessionID: string; messageID: string }) => client.sessions.stage({ ...input, files: true }),
    unrevert: (sessionID: string) => client.sessions.clear({ sessionID }),
    // V2 commands run on the Session's selected agent and model, so select them first.
    async command(input: {
      sessionID: string
      command: string
      arguments: string
      agent: string
      model: Model
      files: ReadonlyArray<Pick<TuiPromptFilePart, "url" | "filename" | "source">>
    }) {
      await select(input)
      return client.sessions.command({
        sessionID: input.sessionID,
        command: input.command,
        arguments: input.arguments,
        files: input.files.map(toFile),
      })
    },
  }
}

function toFile(file: Pick<TuiPromptFilePart, "url" | "filename" | "source">) {
  return {
    uri: file.url,
    name: file.filename,
    source: file.source?.text
      ? { start: file.source.text.start, end: file.source.text.end, text: file.source.text.value }
      : undefined,
  }
}
