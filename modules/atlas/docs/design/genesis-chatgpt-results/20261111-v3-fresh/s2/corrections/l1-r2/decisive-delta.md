# Decisive delta — S2 L1 correction

Execution: `46d09d97-39a9-482a-a290-646ba1d94c99`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Scope: app-session catalog/editor boundary and design-tui session-action boundary.

These are exact bounded excerpts from the verified captures listed in `sources-delta.json`. Existing `decisive-evidence.md` files remain untouched. Protocol descriptions are declared semantics; comments are source assertions; a test body is an unexecuted assertion. No excerpt is a runtime result or a semantic approval.

The corrected bodies add level-two headings so the real reader can address each contract independently: `Skills catalog, editing and ownership` and `V2 session action boundary`. The latter is closed by `Terminal interaction and supporting contracts`, preserving all following terminal prose. Exact section byte measurements are in `verification.json`.

## skills-decoder

Array contract, field optionality/nullability and whole-load decoder failure.

Source: `packages/app-shell/src/orchestra/chapters/skills-data.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `81fe5f7a2a5c6bc45d59ae9e88b42d1b36f76037`; SHA-256 `0001420dcb688c672b55f1070284df5b5086be8d1655df75f7a25585981f4931`.

Exact lines 3–28:

```ts
export type SkillEntry = {
  name: string
  description?: string | null
  location: string
  content: string
  mtime?: number | null
  internal?: boolean | null
}

const decodeSkills = Schema.decodeUnknownOption(
  Schema.Array(
    Schema.Struct({
      name: Schema.String,
      description: Schema.optional(Schema.NullOr(Schema.String)),
      location: Schema.String,
      content: Schema.String,
      mtime: Schema.optional(Schema.NullOr(Schema.Number)),
      internal: Schema.optional(Schema.NullOr(Schema.Boolean)),
    }),
  ),
)

// The catalog reply is untrusted: a malformed one fails the load, which the page shows as its error with Retry.
export function readSkills(value: unknown): readonly SkillEntry[] {
  return Option.getOrThrowWith(decodeSkills(value), () => new Error("Skills response is malformed"))
}
```

## skills-visibility

Internal/tree-node visibility and construction of the prefix set before filtering.

Source: `packages/app-shell/src/orchestra/chapters/skills-data.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `81fe5f7a2a5c6bc45d59ae9e88b42d1b36f76037`; SHA-256 `0001420dcb688c672b55f1070284df5b5086be8d1655df75f7a25585981f4931`.

Exact lines 30–49:

```ts
/** Skills for agent use only declare `internal: true` in their frontmatter; the server reports it and the catalog does not list them. */
export function isInternalSkill(skill: Pick<SkillEntry, "internal">) {
  return skill.internal === true
}

/**
 * The skills the catalog lists: neither internal nor a skill tree node. A node is a `SKILL.md` inside the folder of
 * another listed `SKILL.md`; it loads only through its parent's index, the same rule as the server's `SkillV2.nested`.
 */
export function listedSkills(skills: readonly SkillEntry[]) {
  const folders = skills
    .map((skill) => slash(skill.location))
    .filter((location) => location.endsWith("/SKILL.md"))
    .map((location) => location.slice(0, -"SKILL.md".length))
  return skills.filter((skill) => {
    if (isInternalSkill(skill)) return false
    const location = slash(skill.location)
    return !folders.some((folder) => location !== `${folder}SKILL.md` && location.startsWith(folder))
  })
}
```

## skills-access

Source/access classes, allowed roots, governed priority, lexical normalization, search/order and error-message extraction.

Source: `packages/app-shell/src/orchestra/chapters/skills-data.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `81fe5f7a2a5c6bc45d59ae9e88b42d1b36f76037`; SHA-256 `0001420dcb688c672b55f1070284df5b5086be8d1655df75f7a25585981f4931`.

Exact lines 51–99:

```ts
export type SkillSource = "project" | "global" | "builtin"
/** Mirrors the server's write rule: only the project's own skill folders change, never Atlas-governed skills. */
export type SkillAccess = "edit" | "builtin" | "global" | "governed" | "fixed"

const PROJECT_ROOTS = [".orchestra/skills/", ".orchestra/skill/", ".claude/skills/", ".agents/skills/"]
const GOVERNED_ROOT = ".orchestra/skills/own/"

const SOURCE_ORDER: SkillSource[] = ["project", "global", "builtin"]

export function filterSkills(skills: SkillEntry[], query: string) {
  const search = query.trim().toLowerCase()
  return skills.filter((skill) =>
    [skill.name, skill.description ?? "", skill.location].some((value) => value.toLowerCase().includes(search)),
  )
}

// A server's built-in skills live under the virtual absolute path /builtin/.
// Orchestra's own server ships none (playbooks are files), but other servers may.
export function skillSource(location: string, directory: string): SkillSource {
  if (location.startsWith("/builtin/")) return "builtin"
  return slash(location).startsWith(root(directory)) ? "project" : "global"
}

export function skillAccess(location: string, directory: string): SkillAccess {
  const source = skillSource(location, directory)
  if (source !== "project") return source
  const relative = slash(location).slice(root(directory).length)
  if (relative.startsWith(GOVERNED_ROOT)) return "governed"
  if (!relative.endsWith(".md") || !PROJECT_ROOTS.some((item) => relative.startsWith(item))) return "fixed"
  return "edit"
}

/** Project skills first, then the user's global skills, then built-ins; names break ties. */
export function sortSkills(skills: readonly SkillEntry[], directory: string) {
  return skills.toSorted(
    (a, b) =>
      SOURCE_ORDER.indexOf(skillSource(a.location, directory)) -
        SOURCE_ORDER.indexOf(skillSource(b.location, directory)) || a.name.localeCompare(b.name),
  )
}

/** Reads the message from a `{ message }` error body. */
export function skillErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return
  if ("message" in error && typeof error.message === "string") return error.message
}

const slash = (value: string) => value.replaceAll("\\", "/")
const root = (directory: string) => slash(directory).replace(/\/*$/, "/")
```

## skills-page-identity

Server/directory cache identity, same-dialog close guard, decode pipeline and unavailable/error distinction.

Source: `packages/app-shell/src/orchestra/chapters/skills.tsx`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `896a17a54e8782536917564083031da05af9023d`; SHA-256 `7e60597bb282ef3fdd525224acfff4efd94c07cfc2a3069c403b4b39b1b0cd31`.

Exact lines 29–55:

```ts
const warm = createWarm<SkillEntry[]>(8)

export default function Skills(props: ChapterPageProps) {
  const language = useLanguage()
  const global = useGlobal()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const abort = new AbortController()
  const warmKey = `${serverSDK().scope}\0${pathKey(props.directory)}`
  // The last list paints at once; the page still asks the server for a fresh one.
  const warmed = warm.read(warmKey)
  const [state, setState] = createStore({
    status: (warmed ? "ready" : "loading") as "loading" | "ready" | "error" | "unavailable",
    cause: undefined as unknown,
    skills: warmed ?? ([] as SkillEntry[]),
    query: "",
    // A saved file the server has not listed yet (its configuration predates the skill folder).
    pending: undefined as string | undefined,
  })
  // A signal, not a store field: setting a store path to an object merges into the previous object, so the keyed
  // dialog would not remount and the previous dialog's pending close event would clear the next one.
  const [dialog, setDialog] = createSignal<SkillDialogState>()
  const close = (current: SkillDialogState) => {
    if (dialog() === current) setDialog(undefined)
  }
  const unlisted = createMemo(() =>
    state.pending && !state.skills.some((skill) => skill.location === state.pending) ? state.pending : undefined,
```

Exact lines 69–97:

```ts
  const message = createMemo(() => {
    if (state.status === "loading") return language.t("orchestra.skills.loading")
    if (state.status === "error") return withServerReason(language.t("orchestra.skills.error"), state.cause)
    if (state.status === "unavailable") return language.t("orchestra.skills.unavailable")
    if (!state.skills.length) return language.t("orchestra.skills.empty")
    if (!filtered().length) return language.t("orchestra.skills.noMatches")
  })

  async function load() {
    const entries = await serverSDK().ready.then(async () => {
      if (abort.signal.aborted) return []
      return (
        await serverSDK().currentApi.skill.list({ location: { directory: props.directory } }, { signal: abort.signal })
      ).data
    })
    if (abort.signal.aborted) return
    const skills = sortSkills(listedSkills(readSkills(entries)), props.directory)
    warm.write(warmKey, skills)
    setState({ skills, status: "ready" })
  }

  function refresh(quiet = false) {
    if (!quiet) setState("status", "loading")
    void load().catch((error: unknown) => {
      if (abort.signal.aborted) return
      const cause = error instanceof Error ? error.cause : undefined
      const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined
      setState({ status: status === 404 || status === 405 || status === 501 ? "unavailable" : "error", cause: error })
    })
```

## skills-page-writes

Save/remove payload boundary, pending path, failure display, cleanup, retry and access handoff.

Source: `packages/app-shell/src/orchestra/chapters/skills.tsx`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `896a17a54e8782536917564083031da05af9023d`; SHA-256 `7e60597bb282ef3fdd525224acfff4efd94c07cfc2a3069c403b4b39b1b0cd31`.

Exact lines 100–137:

```ts
  async function save(current: SkillDialogState, input: SkillSaveInput) {
    const result = await sdk()
      .orchestra.skills.save({ location: { directory: props.directory }, ...input })
      .then(
        (saved) => ({ saved, error: undefined }),
        (error: unknown) => ({ saved: undefined, error }),
      )
    if (!result.saved) return writeFailure(result.error)
    if (abort.signal.aborted) return
    close(current)
    setState("pending", result.saved.data.location)
    await load().catch(() => refresh())
  }

  async function remove(current: SkillDialogState, skill: SkillEntry) {
    const error = await sdk()
      .orchestra.skills.remove({ location: { directory: props.directory }, path: skill.location })
      .then(
        () => undefined,
        (error: unknown) => ({ error }),
      )
    if (error) return writeFailure(error.error)
    if (abort.signal.aborted) return
    close(current)
    setState("pending", undefined)
    await load().catch(() => refresh())
  }

  // An undeclared answer throws a ClientError with its status and no message worth showing.
  function writeFailure(error: unknown) {
    const status = errorStatus(error)
    if (status === 404 || status === 405 || status === 501) return language.t("orchestra.skills.writeUnavailable")
    return (error instanceof ClientError ? undefined : skillErrorMessage(error)) ?? language.t("orchestra.skills.writeFailed")
  }


  onMount(() => refresh(warmed !== undefined))
  onCleanup(() => abort.abort())
```

Exact lines 175–187:

```ts
      <Show when={state.status === "error" || state.status === "unavailable"}>
        <button type="button" class="mx-btn orchestra-skills-retry" onClick={() => refresh()}>
          {language.t("orchestra.skills.retry")}
        </button>
      </Show>
      <Show when={state.status === "ready" && filtered().length}>
        <ul class="mx-grid orchestra-skills-grid" aria-label={language.t("orchestra.skills.catalog")}>
          <For each={filtered()}>
            {(skill) => {
              const source = () => skillSource(skill.location, props.directory)
              const access = () => skillAccess(skill.location, props.directory)
              return (
                <li class="mx-card skills-card" data-skill-location={skill.location}>
```

Exact lines 208–210:

```ts
                      onClick={() => setDialog({ type: "edit", skill, access: access() })}
                    >
                      {language.t(access() === "edit" ? "orchestra.skills.read" : "orchestra.skills.readOnly")}
```

Exact lines 219–238:

```ts
      <Show when={unlisted()}>
        {(location) => (
          <p class="mx-note orchestra-skills-notice">
            {language.t("orchestra.skills.notListed", { location: location() })}{" "}
            <button type="button" class="mx-link" onClick={() => refresh()}>
              {language.t("orchestra.skills.reload")}
            </button>
          </p>
        )}
      </Show>
      <Show when={dialog()} keyed>
        {(current) => (
          <SkillDialog
            state={current}
            onClose={() => close(current)}
            onSave={(input) => save(current, input)}
            onRemove={(skill) => remove(current, skill)}
            onAskRemove={(skill) => {
              if (dialog() === current) setDialog({ type: "remove", skill })
            }}
```

## skills-dialog

Client write shape, path/mtime identity, busy/lifetime handling and editable/removal affordances.

Source: `packages/app-shell/src/orchestra/chapters/skills-dialog.tsx`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `498439a6b815a1b51dfe756dc891fb450bae2e09`; SHA-256 `4d765b72649145007edfaeed34a5a397b311c6518b75ca5fc25defd31a77251a`.

Exact lines 5–26:

```ts
export type SkillDialogState =
  | { type: "add" }
  | { type: "edit"; skill: SkillEntry; access: SkillAccess }
  | { type: "remove"; skill: SkillEntry }

export type SkillSaveInput = { name: string; description: string; content: string; path?: string; mtime?: number }

// Mock `modal()`: one native modal dialog whose content is replaced per step. Each action resolves to
// an error message, or undefined once the page has applied it and closed the dialog.
export function SkillDialog(props: {
  state: SkillDialogState
  onClose: () => void
  onSave: (input: SkillSaveInput) => Promise<string | undefined>
  onRemove: (skill: SkillEntry) => Promise<string | undefined>
  onAskRemove: (skill: SkillEntry) => void
}) {
  const language = useLanguage()
  const [error, setError] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)
  const lifetime = { disposed: false }
  const skill = props.state.type === "add" ? undefined : props.state.skill
  const editable = props.state.type === "add" || (props.state.type === "edit" && props.state.access === "edit")
```

Exact lines 34–57:

```ts
  async function run(action: () => Promise<string | undefined>) {
    if (busy()) return
    setBusy(true)
    setError(undefined)
    const failure = await action().catch(() => language.t("orchestra.skills.writeFailed"))
    if (lifetime.disposed) return
    setBusy(false)
    setError(failure)
  }

  function submit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    const state = props.state
    if (state.type === "remove") return void run(() => props.onRemove(state.skill))
    const data = new FormData(event.currentTarget)
    void run(() =>
      props.onSave({
        name: String(data.get("name") ?? ""),
        description: String(data.get("description") ?? ""),
        content: String(data.get("instructions") ?? ""),
        path: skill?.location,
        mtime: skill?.mtime ?? undefined,
      }),
    )
```

Exact lines 134–175:

```ts
            <label class="mx-field">
              <span>{language.t("orchestra.skills.dialog.name")}</span>
              <input name="name" type="text" value={skill?.name ?? ""} required readOnly={!editable || busy()} />
            </label>
            <label class="mx-field">
              <span>{language.t("orchestra.skills.dialog.description")}</span>
              <input
                name="description"
                type="text"
                value={skill?.description ?? ""}
                required
                readOnly={!editable || busy()}
              />
            </label>
            <label class="mx-field">
              <span>{language.t("orchestra.skills.content")}</span>
              <textarea
                name="instructions"
                value={skill?.content ?? ""}
                readOnly={!editable || busy()}
                rows={Math.min(16, (skill?.content ?? "").split("\n").length)}
              />
            </label>
            <Show when={props.state.type === "edit" && editable && skill}>
              {(target) => (
                <button type="button" class="mx-btn" disabled={busy()} onClick={() => props.onAskRemove(target())}>
                  {language.t("orchestra.skills.dialog.remove")}
                </button>
              )}
            </Show>
          </Show>
        </div>
        <footer class="mx-dialog-foot">
          <button type="button" class="mx-btn" onClick={() => dialog.close()}>
            {language.t("orchestra.skills.dialog.cancel")}
          </button>
          <Show when={editable || props.state.type === "remove"}>
            <button class="mx-btn primary" type="submit" disabled={busy()}>
              {language.t(
                props.state.type === "remove" ? "orchestra.skills.remove.confirm" : "orchestra.skills.dialog.save",
              )}
            </button>
```

## skills-protocol

Declared list/save/remove API and documented write ownership; not proof of filesystem enforcement.

Source: `packages/protocol/src/groups/skill.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `28b28134f9b9c751f9564737ea46034a9b36761e`; SHA-256 `290c280836fb40fbd5d963492088a4ff60c7b1d1d6315125e1317d6f58ce756f`.

Exact lines 8–56:

```ts
export const SkillRemoveQuery = Schema.Struct({
  ...LocationQuery.fields,
  path: Schema.String,
}).annotate({ identifier: "SkillRemoveQuery" })

export const SkillGroup = HttpApiGroup.make("server.skill")
  .add(
    HttpApiEndpoint.get("skill.list", "/api/skill", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Skill.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.skill.list",
          summary: "List skills",
          description: "Retrieve currently registered skills.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.put("skill.save", "/api/skill", {
      query: LocationQuery,
      payload: Skill.SaveInput,
      success: Location.response(Skill.Info),
      error: [InvalidRequestError, ConflictError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.skill.save",
          summary: "Save skill",
          description:
            "Create a project skill under .orchestra/skills, or rewrite a registered project skill file given its path. Global, built-in and Atlas-governed skills are read-only. Front matter is re-serialized as YAML.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.delete("skill.remove", "/api/skill", {
      query: SkillRemoveQuery,
      success: Location.response(Schema.Boolean),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.skill.remove",
          summary: "Remove skill",
          description: "Delete a registered project skill file given its path, and its folder when that is left empty.",
```

## skills-handler

Location-scoped service delegation and conflict/invalid-request mapping.

Source: `packages/server/src/handlers/skill.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c06aa460901ac45fcfa0abee5b1d3833a9da8c88`; SHA-256 `e03ed59e0234bb6fd002db5a6e1ace5627ba1b0a70b1949ca934b2efd9d14a9c`.

Exact lines 10–46:

```ts
export const SkillHandler = HttpApiBuilder.group(Api, "server.skill", (handlers) =>
  handlers
    .handle("skill.list", () => response(SkillV2.Service.use((skill) => skill.list())))
    .handle(
      "skill.save",
      Effect.fn(function* (ctx) {
        const skill = yield* SkillV2.Service
        const location = yield* Location.Service
        const input = ctx.payload
        return yield* response(
          skill.save(location.directory, {
            name: input.name,
            description: input.description,
            content: input.content,
            location: input.path,
            mtime: input.mtime,
          }),
        ).pipe(Effect.catchTag("SkillWriteError", (error) => Effect.fail(writeError(error))))
      }),
    )
    .handle(
      "skill.remove",
      Effect.fn(function* (ctx) {
        const skill = yield* SkillV2.Service
        const location = yield* Location.Service
        return yield* response(skill.remove(location.directory, ctx.query.path).pipe(Effect.as(true))).pipe(
          Effect.catchTag("SkillWriteError", (error) =>
            Effect.fail(new InvalidRequestError({ message: error.message, kind: error.reason, field: "path" })),
          ),
        )
      }),
    ),
)

function writeError(error: SkillFile.WriteError) {
  if (error.reason === "conflict") return new ConflictError({ message: error.message, resource: "skill" })
  return new InvalidRequestError({ message: error.message, kind: error.reason })
```

## tui-adapter

Complete adapter contract and mapping; no execution, transaction, fallback or retry proof.

Source: `packages/tui/src/context/session-actions.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `255420d1e93ce0fca21b941c673abdede087e91e`; SHA-256 `e858f281b3b0a8ac722faadab2d0f7218d846b968e02f9ec06a0d32e958d82bd`.

Exact lines 4–92:

```ts
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
    // The earlier runtime sent the agent and model with every prompt; V2 prompts run on the Session's selection, so select first.
    // Editor context was a hidden synthetic part in the earlier runtime; V2 admits it as a synthetic input that does not wake the
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
```

## tui-session-protocol-create-select-admit

Exact create, selection, prompt, command and compact route contracts with declared semantics.

Source: `packages/protocol/src/groups/session.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5830f50001c8dc01227a920f04276054c0e29570`; SHA-256 `2dad331fa3b169d4eff2f870b70a4524f24497cb4a08dda3ee4a09cf3783af1f`.

Exact lines 157–165:

```ts
      HttpApiEndpoint.post("session.create", "/api/session", {
        payload: Schema.Struct({
          id: Session.ID.pipe(Schema.optional),
          agent: Agent.ID.pipe(Schema.optional),
          model: Model.Ref.pipe(Schema.optional),
          location: Location.Ref.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: Session.Info }),
        error: SessionNotFoundError,
```

Exact lines 301–394:

```ts
      HttpApiEndpoint.post("session.switchAgent", "/api/session/:sessionID/agent", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ agent: Agent.ID }),
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.switchAgent",
            summary: "Switch session agent",
            description: "Switch the agent used by subsequent provider turns.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.switchModel", "/api/session/:sessionID/model", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ model: Model.Ref }),
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.switchModel",
            summary: "Switch session model",
            description: "Switch the model used by subsequent provider turns.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.prompt", "/api/session/:sessionID/prompt", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({
          id: SessionMessage.ID.pipe(Schema.optional),
          prompt: PromptInput.Prompt,
          delivery: SessionInput.Delivery.pipe(Schema.optional),
          resume: Schema.Boolean.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: SessionInput.Admitted }),
        error: [ConflictError, SessionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.prompt",
            summary: "Send message",
            description: "Durably admit one session input and schedule agent-loop execution unless resume is false.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.command", "/api/session/:sessionID/command", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({
          id: SessionMessage.ID.pipe(Schema.optional),
          command: Schema.String,
          arguments: Schema.String.pipe(Schema.optional),
          files: PromptInput.Prompt.fields.files,
          agents: PromptInput.Prompt.fields.agents,
          delivery: SessionInput.Delivery.pipe(Schema.optional),
          resume: Schema.Boolean.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: SessionInput.Admitted }),
        error: [ConflictError, SessionNotFoundError, InvalidRequestError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.command",
            summary: "Run command",
            description:
              "Render a configured command or an MCP prompt (`server:prompt`) with its arguments and admit the result as one session input.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.compact", "/api/session/:sessionID/compact", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: Schema.Struct({ compacted: Schema.Boolean }) }).annotate({
          identifier: "SessionCompactResult",
        }),
        error: [SessionNotFoundError, ConflictError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.compact",
            summary: "Compact session",
            description:
              "Summarize the conversation now into a compaction checkpoint. `compacted` is false when there was nothing to summarize. A running Session is refused as busy.",
          }),
        ),
```

## tui-session-protocol-other-actions

Exact shell/synthetic/stage/clear/commit/interrupt declarations; adapter exposes no commit action.

Source: `packages/protocol/src/groups/session.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5830f50001c8dc01227a920f04276054c0e29570`; SHA-256 `2dad331fa3b169d4eff2f870b70a4524f24497cb4a08dda3ee4a09cf3783af1f`.

Exact lines 431–443:

```ts
      HttpApiEndpoint.post("session.shell", "/api/session/:sessionID/shell", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ id: Schema.String.pipe(Schema.optional), command: Schema.NonEmptyString }),
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, ConflictError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.shell",
            summary: "Run shell command",
            description:
              "Run a shell command in the Session's location and record it with its output for the next turn. No turn starts.",
```

Exact lines 464–479:

```ts
      HttpApiEndpoint.post("session.synthetic", "/api/session/:sessionID/synthetic", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({
          id: SessionMessage.ID.pipe(Schema.optional),
          text: Schema.String,
          resume: Schema.Boolean.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: Schema.Struct({ id: SessionMessage.ID }) }),
        error: [SessionNotFoundError, ConflictError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.synthetic",
            summary: "Add synthetic context",
            description: "Record text as synthetic context, then run a turn unless resume is false.",
```

Exact lines 550–582:

```ts
      HttpApiEndpoint.post("session.revert.stage", "/api/session/:sessionID/revert/stage", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ messageID: SessionMessage.ID, files: Schema.Boolean.pipe(Schema.optional) }),
        success: Schema.Struct({ data: Revert.State }),
        error: [MessageNotFoundError, SessionNotFoundError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.revert.stage",
            summary: "Stage session revert",
            description: "Stage or move a reversible session boundary and optionally apply its file changes.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.revert.clear", "/api/session/:sessionID/revert/clear", {
        params: { sessionID: Session.ID },
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(OpenApi.annotations({ identifier: "v2.session.revert.clear", summary: "Clear staged revert" })),
    )
    .add(
      HttpApiEndpoint.post("session.revert.commit", "/api/session/:sessionID/revert/commit", {
        params: { sessionID: Session.ID },
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({ identifier: "v2.session.revert.commit", summary: "Commit staged revert" }),
```

Exact lines 655–665:

```ts
      HttpApiEndpoint.post("session.interrupt", "/api/session/:sessionID/interrupt", {
        params: { sessionID: Session.ID },
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.interrupt",
            summary: "Interrupt session execution",
            description: "Interrupt active execution owned by this Orchestra process. Idle interruption is a no-op.",
```

## tui-permission-protocol

Both IDs, reply payload, optional message and declared missing-session/request errors.

Source: `packages/protocol/src/groups/permission.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a34d8726146a5cdc1b989b583a4943290584d34b`; SHA-256 `9cef92dd60326651b2ee4b6d5946e4381ea6791076c017da532122b9be0fa1ab`.

Exact lines 119–134:

```ts
      HttpApiEndpoint.post("session.permission.reply", "/api/session/:sessionID/permission/:requestID/reply", {
        params: { sessionID: Session.ID, requestID: Permission.ID },
        payload: Schema.Struct({
          reply: Permission.Reply,
          message: Schema.String.pipe(Schema.optional),
        }),
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, PermissionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.permission.reply",
            summary: "Reply to pending permission request",
            description: "Respond to a pending permission request owned by a session.",
          }),
```

## tui-request-assertions

Real-client/replaced-transport assertions for paths, bodies and order; read only, never run.

Source: `packages/tui/test/context/session-actions.test.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9d22d47f255e6a1c73a1ce2bfe40ce87c467a27a`; SHA-256 `48423aa811be59b328fc29d306cca600f8aa9aaa91a96e1e53b832cb59e39e42`.

Exact lines 5–27:

```ts
// The real client builds every request; only the transport is replaced, to record what it sends.
function recorder() {
  const calls: { method: string; path: string; body: unknown }[] = []
  const fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      calls.push({
        method: request.method,
        path: new URL(request.url).pathname,
        body: request.body ? await request.json() : undefined,
      })
      if (request.url.endsWith("/compact")) return Response.json({ data: { compacted: true } })
      if (request.url.endsWith("/prompt") || request.url.endsWith("/synthetic"))
        return Response.json({ data: { id: "msg_1" } })
      if (request.method === "POST" && request.url.endsWith("/api/session"))
        return Response.json({ data: { id: "ses_new" } })
      return request.url.endsWith("/revert/stage") || request.url.endsWith("/command")
        ? Response.json({ data: {} })
        : new Response(null, { status: 204 })
    },
    { preconnect: globalThis.fetch.preconnect },
  )
  return { calls, actions: createSessionActions(Orchestra.make({ baseUrl: "http://localhost:1", fetch })) }
```

Exact lines 30–62:

```ts
test("interrupt, compact, shell, revert and unrevert hit the V2 session routes", async () => {
  const { calls, actions } = recorder()
  await actions.interrupt("ses_1")
  await actions.compact("ses_1")
  await actions.shell({ sessionID: "ses_1", command: "ls" })
  await actions.revert({ sessionID: "ses_1", messageID: "msg_1" })
  await actions.unrevert("ses_1")
  expect(calls).toEqual([
    { method: "POST", path: "/api/session/ses_1/interrupt", body: undefined },
    { method: "POST", path: "/api/session/ses_1/compact", body: undefined },
    { method: "POST", path: "/api/session/ses_1/shell", body: { command: "ls" } },
    { method: "POST", path: "/api/session/ses_1/revert/stage", body: { messageID: "msg_1", files: true } },
    { method: "POST", path: "/api/session/ses_1/revert/clear", body: undefined },
  ])
})

test("command selects the agent and model, then maps file parts to V2 files", async () => {
  const { calls, actions } = recorder()
  await actions.command({
    sessionID: "ses_1",
    command: "review",
    arguments: "src",
    agent: "build",
    model: { providerID: "p", modelID: "m", variant: "high" },
    files: [{ url: "file:///a.ts", filename: "a.ts", source: undefined }],
  })
  expect(calls.map((call) => call.path)).toEqual([
    "/api/session/ses_1/agent",
    "/api/session/ses_1/model",
    "/api/session/ses_1/command",
  ])
  expect(calls[1].body).toEqual({ model: { providerID: "p", id: "m", variant: "high" } })
  expect(calls[2].body).toEqual({ command: "review", arguments: "src", files: [{ uri: "file:///a.ts", name: "a.ts" }] })
```

Exact lines 65–85:

```ts
test("create places the Session in the given directory with the chosen agent and model", async () => {
  const { calls, actions } = recorder()
  await actions.create({
    agent: "build",
    model: { providerID: "p", modelID: "m" },
    directory: "/repo/app",
    workspaceID: "ws_1",
  })
  await actions.create({ agent: "build", model: { providerID: "p", modelID: "m" } })
  expect(calls).toEqual([
    {
      method: "POST",
      path: "/api/session",
      body: {
        agent: "build",
        model: { providerID: "p", id: "m" },
        location: { directory: "/repo/app", workspaceID: "ws_1" },
      },
    },
    { method: "POST", path: "/api/session", body: { agent: "build", model: { providerID: "p", id: "m" } } },
  ])
```

Exact lines 88–149:

```ts
test("prompt selects agent and model, admits editor context without waking, then sends the prompt", async () => {
  const { calls, actions } = recorder()
  await actions.prompt({
    sessionID: "ses_1",
    text: "fix @a.ts with @review",
    context: "selection: line 3",
    agent: "build",
    model: { providerID: "p", modelID: "m", variant: "high" },
    files: [
      {
        url: "file:///a.ts",
        filename: "a.ts",
        source: { type: "file", path: "a.ts", text: { start: 4, end: 9, value: "@a.ts" } },
      },
    ],
    agents: [{ name: "review", source: { start: 15, end: 22, value: "@review" } }],
  })
  expect(calls).toEqual([
    { method: "POST", path: "/api/session/ses_1/agent", body: { agent: "build" } },
    {
      method: "POST",
      path: "/api/session/ses_1/model",
      body: { model: { providerID: "p", id: "m", variant: "high" } },
    },
    { method: "POST", path: "/api/session/ses_1/synthetic", body: { text: "selection: line 3", resume: false } },
    {
      method: "POST",
      path: "/api/session/ses_1/prompt",
      body: {
        prompt: {
          text: "fix @a.ts with @review",
          files: [{ uri: "file:///a.ts", name: "a.ts", source: { start: 4, end: 9, text: "@a.ts" } }],
          agents: [{ name: "review", source: { start: 15, end: 22, text: "@review" } }],
        },
      },
    },
  ])
})

test("prompt without editor context sends no synthetic input", async () => {
  const { calls, actions } = recorder()
  await actions.prompt({
    sessionID: "ses_1",
    text: "hi",
    agent: "build",
    model: { providerID: "p", modelID: "m" },
    files: [],
    agents: [],
  })
  expect(calls.map((call) => call.path)).toEqual([
    "/api/session/ses_1/agent",
    "/api/session/ses_1/model",
    "/api/session/ses_1/prompt",
  ])
})

test("reply answers the permission request on the V2 route", async () => {
  const { calls, actions } = recorder()
  await actions.reply({ sessionID: "ses_1", requestID: "per_1", reply: "once" })
  expect(calls).toEqual([
    { method: "POST", path: "/api/session/ses_1/permission/per_1/reply", body: { reply: "once" } },
  ])
```

