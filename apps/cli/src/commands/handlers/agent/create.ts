import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Option, Schema } from "effect"
import type { AgentsUpdateFileInput, Orchestra } from "@orchestra/client"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"
import { terminal, type Prompter } from "../prompt"

type Mode = NonNullable<AgentsUpdateFileInput["mode"]>

// Permission keys (not raw tool names): several tools can gate on one permission, e.g. write/edit/apply_patch on `edit`.
const AVAILABLE_PERMISSIONS = ["bash", "read", "edit", "glob", "grep", "webfetch", "task", "todowrite", "websearch", "lsp", "skill"]

export default Runtime.handler(
  Commands.commands.agent.commands.create,
  Effect.fn("cli.agent.create")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const file = yield* Effect.tryPromise({
      try: () =>
        createAgent(client, terminal, {
          directory: Option.getOrElse(input.path, () => process.cwd()),
          description: Option.getOrUndefined(input.description),
          mode: Option.getOrUndefined(input.mode),
          permissions: Option.getOrUndefined(input.permissions),
          model: Option.getOrUndefined(input.model),
          name: Option.getOrUndefined(input.name),
          system: Option.getOrUndefined(input.system),
        }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    })
    process.stdout.write(file + EOL)
  }),
)

const Generated = Schema.Struct({ identifier: Schema.String, whenToUse: Schema.String, systemPrompt: Schema.String })

/** Writes a new agent file and returns its path. The agent is generated from a description unless name and system are given. */
export async function createAgent(
  client: ReturnType<typeof Orchestra.make>,
  prompter: Prompter,
  input: {
    readonly directory: string
    readonly description?: string
    readonly mode?: Mode
    readonly permissions?: string
    readonly model?: string
    readonly name?: string
    readonly system?: string
  },
) {
  const location = { directory: input.directory }
  const description = input.description ?? (await prompter.text("Description (what should this agent do?)"))
  if (!description) throw new Error("A description is required")
  const generated =
    input.name && input.system
      ? { identifier: input.name, whenToUse: description, systemPrompt: input.system }
      : await generate(client, location, description, input.model)
  const allowed =
    input.permissions === undefined
      ? (await prompter.text(`Permissions to allow, comma-separated (empty for all of: ${AVAILABLE_PERMISSIONS.join(", ")})`))
      : input.permissions
  const selected = allowed.trim() ? allowed.split(",").map((item) => item.trim()) : AVAILABLE_PERMISSIONS
  const mode =
    input.mode ??
    (await prompter.select<Mode>("Agent mode", [
      { label: "all (primary and subagent roles)", value: "all" },
      { label: "primary (main agent)", value: "primary" },
      { label: "subagent (used by other agents)", value: "subagent" },
    ]))

  const existing = (await client.agents.getFile({ agentID: generated.identifier, location })).data
  if (existing.exists) throw new Error(`Agent file already exists: ${existing.path}`)
  const denied = AVAILABLE_PERMISSIONS.filter((permission) => !selected.includes(permission))
  const written = await client.agents.updateFile({
    agentID: generated.identifier,
    location,
    description: generated.whenToUse,
    mode,
    system: generated.systemPrompt,
    model: input.model,
    ...(denied.length ? { permission: Object.fromEntries(denied.map((permission) => [permission, "deny" as const])) } : {}),
  })
  return written.data.path
}

// A throwaway session carries the one-shot generation request.
async function generate(
  client: ReturnType<typeof Orchestra.make>,
  location: { directory: string },
  description: string,
  model: string | undefined,
) {
  const [providerID, ...rest] = model?.split("/") ?? []
  const session = await client.sessions.create({
    location,
    model: providerID && rest.length ? { providerID, id: rest.join("/") } : undefined,
  })
  const reply = await client.sessions
    .generate({
      sessionID: session.id,
      prompt: [
        "Create an agent configuration for the request below.",
        'Reply with only a JSON object: {"identifier": a short lowercase-hyphenated name, "whenToUse": one sentence on when to use the agent, "systemPrompt": the full system prompt for the agent}.',
        `Request: ${description}`,
      ].join("\n"),
    })
    .finally(() => client.sessions.remove({ sessionID: session.id }).catch(() => undefined))
  const parsed = Schema.decodeUnknownOption(Schema.fromJsonString(Generated))(
    reply.text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""),
  )
  if (Option.isNone(parsed)) throw new Error("LLM failed to generate agent: the reply was not the expected JSON")
  return parsed.value
}
