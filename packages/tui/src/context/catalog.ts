import type { Orchestra } from "@orchestra/client"
import type {
  Agent,
  Command,
  Config,
  LspStatus,
  McpStatus,
  Provider,
  Session,
  SessionMessage,
  SessionStatus,
  SnapshotFileDiff,
  Todo,
  VcsInfo,
} from "../compat/schema"

type Client = ReturnType<typeof Orchestra.make>
type Location = { directory?: string; workspace?: string }
type V2Model = Awaited<ReturnType<Client["models"]["list"]>>["data"][number]
type V2Session = Awaited<ReturnType<Client["sessions"]["get"]>>

// The TUI store still holds the V1 shapes its components render, so the V2 catalog routes are read here
// and mapped into them. The legacy `/config/providers`, `/provider`, `/agent`, `/config`, `/session` and
// `/command` routes are not served by the V2 server.
export function createCatalog(client: Client) {
  return {
    async bootstrap(location: Location) {
      const [providers, models, fallback, agents, config] = await Promise.all([
        client.providers.list({ location }),
        client.models.list({ location }),
        client.models.default({ location }),
        client.agents.list({ location }),
        client.config.get(),
      ])
      const all = providers.data.map(
        (provider): Provider => ({
          id: provider.id,
          name: provider.name,
          source: "config",
          env: [],
          options: {},
          models: Object.fromEntries(
            models.data.filter((model) => model.providerID === provider.id).map((model) => [model.id, toModel(model)]),
          ),
        }),
      )
      const connected = all.filter((provider) => !providers.data.find((item) => item.id === provider.id)?.disabled)
      // V1 picked each provider's default model by ranking; V2 names one default model, so the other providers
      // fall back to their first model. The default model's provider goes first because the TUI falls back to
      // the first provider when nothing else selects a model.
      const defaults = Object.fromEntries(
        connected.flatMap((provider) => {
          const model =
            fallback.data?.providerID === provider.id ? fallback.data.id : Object.keys(provider.models).at(0)
          return model ? [[provider.id, model]] : []
        }),
      )
      return {
        provider: connected.toSorted(
          (a, b) => Number(b.id === fallback.data?.providerID) - Number(a.id === fallback.data?.providerID),
        ),
        default: defaults,
        next: { all, default: defaults, connected: connected.map((provider) => provider.id) },
        agent: agents.data.map(
          (agent): Agent => ({
            id: agent.id,
            name: agent.name ?? agent.id,
            description: agent.description,
            mode: agent.mode,
            hidden: agent.hidden,
            color: agent.color,
            model: agent.model ? { modelID: agent.model.id, providerID: agent.model.providerID } : undefined,
            variant: agent.model?.variant,
          }),
        ),
        config: {
          model: config.model,
          shell: config.shell,
          disabled_providers: [...config.disabledProviders],
        } satisfies Config,
      }
    },
    location: (location: Location) => client.location.get({ location }),
    directories: (projectID: string) => client.projects.directories({ projectID }),
    commands: (location: Location) =>
      client.commands.list({ location }).then((result) =>
        result.data.map(
          (command): Command => ({
            name: command.name,
            description: command.description,
            agent: command.agent,
            model: command.model ? `${command.model.providerID}/${command.model.id}` : undefined,
            template: command.template,
            subtask: command.subtask,
            hints: [],
          }),
        ),
      ),
    vcs: (location: Location) =>
      client.vcs.get({ location }).then(
        (result): VcsInfo => ({
          branch: result.data.branch ?? undefined,
          default_branch: result.data.default_branch ?? undefined,
        }),
      ),
    lsp: (location: Location) =>
      client["server.lsp"]
        .status({ location })
        .then((result): LspStatus[] => result.data.map((server) => ({ ...server }))),
    mcp: (location: Location) =>
      client.mcp
        .list({ location })
        .then(
          (result): Record<string, McpStatus> =>
            Object.fromEntries(result.data.map((server) => [server.name, { ...server.status }])),
        ),
    // V2 lists sessions by project and subpath instead of V1's `scope` and `path`, and has no start-time window.
    sessions: (input: { workspace?: string; project?: string; subpath?: string }) =>
      client.sessions
        .list({ ...input, limit: 100, order: "desc" })
        .then((result) => result.data.map(toSession).toSorted((a, b) => a.id.localeCompare(b.id))),
    session: (sessionID: string) => client.sessions.get({ sessionID }).then(toSession),
    // Newest first, as V2 returns them; the store projects them into the V1 message and part shapes.
    messages: (sessionID: string) =>
      client.messages.list({ sessionID, limit: 100 }).then((result) => result.data as SessionMessage[]),
    // V2 has no per-Session diff route. A Session's diff is the working-tree status of the files its steps
    // changed, which matches V1's diff while those changes are uncommitted.
    diff: (location: Location, files: ReadonlySet<string>) =>
      files.size === 0
        ? Promise.resolve<SnapshotFileDiff[]>([])
        : client.vcs
            .status({ location })
            .then((result): SnapshotFileDiff[] =>
              result.data.filter((item) => files.has(item.file)).map((item) => ({ ...item })),
            ),
    todo: (sessionID: string) =>
      client.sessions.todo({ sessionID }).then((todos): Todo[] => todos.map((todo) => ({ ...todo }))),
    // V2 reports running Sessions only; every other Session is idle.
    status: () =>
      client.sessions
        .active()
        .then(
          (active): Record<string, SessionStatus> =>
            Object.fromEntries(Object.keys(active).map((sessionID) => [sessionID, { type: "busy" }])),
        ),
  }
}

function toSession(session: V2Session): Session {
  return {
    id: session.id,
    slug: session.id,
    projectID: session.projectID,
    workspaceID: session.location.workspaceID,
    directory: session.location.directory,
    path: session.subpath,
    parentID: session.parentID,
    cost: session.cost,
    tokens: { ...session.tokens, cache: { ...session.tokens.cache } },
    title: session.title,
    agent: session.agent,
    model: session.model ? { ...session.model } : undefined,
    version: "v2",
    time: { ...session.time },
    revert: session.revert
      ? {
          messageID: session.revert.messageID,
          partID: session.revert.partID,
          snapshot: session.revert.snapshot,
          diff: session.revert.diff,
        }
      : undefined,
  }
}

function toModel(model: V2Model): Provider["models"][string] {
  const cost = model.cost.find((item) => item.tier === undefined) ?? model.cost.at(0)
  const input = new Set(model.capabilities.input)
  const output = new Set(model.capabilities.output)
  return {
    id: model.id,
    providerID: model.providerID,
    api: { id: model.api.id, url: model.api.url ?? "", npm: model.api.type === "aisdk" ? model.api.package : "" },
    name: model.name,
    family: model.family,
    capabilities: {
      temperature: true,
      reasoning: model.variants.length > 0,
      attachment: [...input].some((kind) => kind !== "text"),
      toolcall: model.capabilities.tools,
      input: {
        text: input.has("text"),
        audio: input.has("audio"),
        image: input.has("image"),
        video: input.has("video"),
        pdf: input.has("pdf"),
      },
      output: {
        text: output.has("text"),
        audio: output.has("audio"),
        image: output.has("image"),
        video: output.has("video"),
        pdf: output.has("pdf"),
      },
      interleaved: false,
    },
    cost: {
      input: cost?.input ?? 0,
      output: cost?.output ?? 0,
      cache: { read: cost?.cache.read ?? 0, write: cost?.cache.write ?? 0 },
    },
    limit: { ...model.limit },
    status: model.status,
    options: {},
    headers: { ...model.request.headers },
    release_date: new Date(model.time.released).toISOString().slice(0, 10),
    variants: Object.fromEntries(model.variants.map((variant) => [variant.id, { ...variant.body }])),
  }
}
