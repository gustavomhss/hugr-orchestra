# Decisive evidence — s2.l2.app-session

## Bound inputs and claim status

All source excerpts below are exact UTF-8 spans from captured commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`. `sources.json` binds each directly used file to its actual Git blob SHA and SHA256. The sole factual build predecessor is accepted `s2.l1.app-session`, body SHA256 `67a2787d0813738c8930a23253c9d185933cc228e997d530056cd4fa98b0b16e`, under manifest `accepted/l1.json` SHA256 `8bb7bb5298f42eefe3fb34246a8303ad974947ef54ac99f1390ed40e276644c8`.

L2 contributes an explanation of ownership and maintenance consequences. Most facts are inherited from the nine accepted L1 sections. N1–N4 identify the few details newly made explicit here and give bounded primary support. C1–C7 corroborate inherited claims. Maintenance inferences are recommendations derived from the named mechanisms, not invented feature intent. No product code, tests, benchmarks, native operations, provider calls or filesystem skill writes were executed.

## Synthesis and bounded primary support

### N1 — Newly explicit static observation: optimistic cleanup is separate from durable admission outcome

L2 section: **Durable admission, optimistic state and draft storage**. Accepted support: `s2.l1.app-session` §Prompt admission and draft ownership.

The new detail is the visible removeOptimisticMessage/restoreInput/settleEmptySession(true) failure sequence. Session/request retention, policy checks and draft handoff are inherited from accepted L1. The inference is that local visual cleanup cannot settle an ambiguous server outcome; no universal rollback guarantee is claimed.

`packages/app-shell/src/components/prompt-input/submit.ts:442–466` · file SHA256 `9fc3fde5e453fe6e36b92909488249be788189d640c132d83c9c7a5407b42c80` · excerpt SHA256 `18b26d32fa21394a757a866191975d4e5212b03107343e2960b5e7b65c8554b9`

```text
    const messageID = Identifier.ascending("message")
    const removeOptimisticMessage = () => {
      if (ownsSource()) syncState.session.optimistic.remove({ directory: sessionDirectory, sessionID: session.id,
        messageID: isNewSession ? admission.request?.id ?? messageID : messageID })
    }
    admission.cleanup = trackPendingPrompt(directorySDK.scope, session.id, {
      abort: controller,
      cleanup: () => { removeOptimisticMessage(); restoreInput() },
      draft: isNewSession ? {
        key: rulesKey, target, scope: directorySDK.scope, directory: projectDirectory,
        sessionID: session.id, api, serverState,
      } : undefined,
    })
    // A first send that fails leaves the Session this draft created behind, empty, in the sidebar. The draft itself
    // (text, context, subagent models, worktree) stays as it was for the next try.
    // Once the prompt was dispatched, the Session is kept and labelled: the server may have admitted it before the
    // failure (an admitted input is not a message until it is promoted), so the retry must reuse this Session and
    // message ID. Only a send that never left (its policy write failed) deletes a Session the server confirms empty.
    const settleEmptySession = async (dispatched: boolean) => {
      const created = admission.session
      if (!isNewSession || !created || admission.request?.admitted) return
      const empty = await sessionHasNoMessages(server, created.id, sessionDirectory).catch(() => undefined)
      if (empty === false) return
      const removed = !dispatched && empty === true &&
        (await api.remove({ sessionID: created.id, directory: sessionDirectory }).then(() => true, () => false))
```

`packages/app-shell/src/components/prompt-input/submit.ts:660–672` · file SHA256 `9fc3fde5e453fe6e36b92909488249be788189d640c132d83c9c7a5407b42c80` · excerpt SHA256 `b5bb3a0da0690c92b3898c93aa344b3b11081ad2e7c4020f0bfe8f67e02454de`

```text
      .catch(async (err) => {
        if (controller.signal.aborted) return false
        if (ownsSource() && (isCommand || sessionDirectory === projectDirectory) && !queued) {
          syncState.set("session_status", session.id, { type: "idle" })
        }
        if (ownsSource()) showToast({
          title: language.t(isCommand ? "prompt.toast.commandSendFailed.title" : "prompt.toast.promptSendFailed.title"),
          description: isCommand && !hookRefusal(err) ? formatServerError(err, language.t, language.t("common.requestFailed")) : errorMessage(err),
        })
        removeOptimisticMessage()
        restoreInput()
        await settleEmptySession(true)
        return false
```

### N2 — Newly explicit instruction: Schema contract ownership

L2 section: **Visual resources and prescribed maintenance**. Accepted support: `s2.l1.app-session` §Authority, composition and identity.

This is an instruction from captured package authority, not a claim that an architectural checker ran or that every module complies.

`packages/schema/AGENTS.md:1–10` · file SHA256 `ca79ab26b6eb07d1ed35a76851852d69475ec554dad7624714d3e47c15dce057` · excerpt SHA256 `8e813ab66a0b53d8451e4750095982833e27fb016bbbb101b68f3a0d2ce85858`

```text
# Schema Package Guide

`@orchestra/schema` owns browser-safe wire and storage contracts shared by protocol, server, core, and generated SDKs. Keep runtime behavior, service layers, side effects, and host-local implementation details in the domain package that owns them.

## Package Boundary

- Preserve the dependency direction: `@orchestra/schema <- @orchestra/protocol <- @orchestra/server`.
- Schema values should be serializable contract definitions, not service implementations or runtime registries.
- A domain may keep a minimal public wire contract here when SDK generation needs it, but do not move the broader runtime model into Schema just because an event is public. `plugin.added` is the current example: Schema may own the minimum browser-safe event payload, while plugin runtime behavior stays outside Schema.
- The root barrel exports canonical current domain contracts. Specialized event modules, manifests, and infrastructure modules use direct entrypoints instead of becoming first-class root exports.
```

### N3 — Newly explicit instruction: repository maintenance material and runtime skills have different destinations

L2 section: **Visual resources and prescribed maintenance**. Accepted support: `s2.l1.app-session` §Authority, composition and identity.

The repository-only classification is attributed to root AGENTS. The accepted L1 supports the existence and intended use of the five maintainer/onboarding skills and six guides; their installation statements remain unverified.

`AGENTS.md:146–154` · file SHA256 `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f` · excerpt SHA256 `8fa4debd4f7a4a28198b8620029467c1cd1f107c3645ff0157969b637a752721`

```text
## What Ships and What Stays in the Repo

The release carries only what someone who installs and uses Orchestra needs. Material for people who change the code stays in the repository.

- Ships: compiled code, including seat prompts (`modules/maestro/coordination/src/seats/prompt/*.txt`); the skill trees a seat lists in `seat.skills` (`Seats.skillSource`, embedded at build time by `modules/maestro/coordination/src/seat-skills-module.ts`); Maestro playbooks (`modules/maestro/coordination/playbooks`), including the Orchestra guide under `maestro-orchestra`; the `extraResources` in `apps/desktop/electron-builder.config.ts`; the CLI package's `bin`.
- Repo-only: `.orchestra/skills/*` (maintenance, ownership and contributor usage skills, seen only when this repository is the open project), `docs/` (specs and guides), and this file.
- Knowledge an agent needs at runtime goes in its prompt or a shipped seat skill, never only in `.orchestra/skills`.
- Never add a maintenance or ownership skill to a seat's `skills`.
- `docs/guides` is written for users but is not published yet; a user-facing change still updates its guide.
```

### N4 — Newly explicit instruction and known limit: agent terminal safety path

L2 section: **Permission requests and terminal boundaries**. Accepted support: `s2.l1.app-session` §Requests, terminals and auxiliary lifetimes.

L1 already identifies the separate Core safety boundary. This L2 spells out the root instruction about sandbox wrapping, sanitized model text, nonce-bound shell marks and the recorded slow-reader limit. These are prescribed/recorded boundaries, not executed security verification.

`AGENTS.md:182–192` · file SHA256 `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f` · excerpt SHA256 `4f5b2378f8eb397a98a143b26af09bf856f0a06ad9204f8567ae8beda212ffab`

```text
## Terminal and PTY

Background: `docs/specs/terminal/`; ownership and traps: `.orchestra/skills/terminal-maintenance`.

- The agent terminal exists only in the V2 session core's bash tool (`packages/core`). The agent runs a bash command in a PTY only through `AgentTerminal.run` (`packages/core/src/tool/agent-terminal.ts`) inside the bash tool, after `ToolSafetySandbox.wrap`. Never build an agent PTY from `Pty.create` with the default environment, which inherits `process.env` and skips the sandbox.
- Text that goes to the model is `AgentTerminal.sanitize`d. Terminal output is data, never instruction.
- Shell marks (OSC 133) count only with the session's nonce. OSC 7 (`Info.cwd`) is a hint without one; do not use it for decisions that need trust.
- The PTY cursor and ring (`BUFFER_LIMIT`) count UTF-16 characters, not bytes.
- The `Pty` service is served over HTTP by `packages/server/src/handlers/pty.ts`. The app uses `/api/pty`.
- `ORCHESTRA_AGENT_TERMINAL` and `ORCHESTRA_SHELL_INTEGRATION` are permanent opt-in flags in `flag/flag.ts`; read them through `Flag`, never `process.env`.
- Known limit: a WebSocket client that stops reading makes the server grow; not solved.
```

### C1 — Corroboration: identity values and owner generations serve different lifetimes

L2 section: **Composition, identity and asynchronous ownership**. Accepted support: `s2.l1.app-session` §Authority, composition and identity.

The explanatory three-identity table and maintenance implication synthesize accepted observations. The excerpts corroborate credential disposal and irreversible generation expiry; they add no claim of exhaustive asynchronous correctness.

`packages/app-shell/src/context/global.tsx:68–98` · file SHA256 `310f02897847804b5a2d0320d02f40351c37368e2fdab4a021f270e84ec4e813` · excerpt SHA256 `3163cc32e79fecdf5778809e82cc4c501fffc5edb8dbc53a746da9073212fc67`

```text
// Tab/project identity stays stable; transport credentials belong to a disposable context lifetime.
export function createServerContextCache<T>(
  servers: Accessor<ServerConnection.Any[]>,
  create: (conn: ServerConnection.Any) => T,
) {
  const owner = getOwner()
  const contexts = new Map<ServerConnection.Key, { identity: string; dispose: () => void; value: T }>()
  const ensure = (input: ServerConnection.Any) => {
    const key = ServerConnection.key(input)
    // Callers may still hold a previous connection object after editing the same server.
    const conn = servers().find((item) => ServerConnection.key(item) === key) ?? input
    const identity = JSON.stringify([
      conn.type,
      conn.http.url,
      conn.http.username,
      conn.http.password,
      conn.type === "http" && conn.authToken,
    ])
    const existing = contexts.get(key)
    if (existing?.identity === identity) return existing.value
    existing?.dispose()
    const root = createRoot(
      (dispose) => ({
        identity,
        dispose,
        value: create({ ...conn, http: { ...conn.http } }),
      }),
      owner,
    )
    contexts.set(key, root)
    return root.value
```

`packages/app-shell/src/pages/session/session-ownership.ts:3–33` · file SHA256 `36dbb4e8d45c32243d957b299de5de279d6dcf24f5a594447b827f4dba47f482` · excerpt SHA256 `cd00e143087a08dbad7f6d8fd4b515d903df2bfc6346eaa5056efadf4bbe4af4`

```text
export function createSessionOwnership(sessionKey: () => string) {
  let current = sessionKey()
  let generation = 0
  const transition = () => {
    const next = sessionKey()
    if (next === current) return
    current = next
    generation++
  }
  createComputed(transition)
  onCleanup(() => generation++)

  return {
    key: () => {
      transition()
      return `${generation}:${current}`
    },
    capture() {
      transition()
      const captured = generation
      return {
        key: `${captured}:${current}`,
        current: () => {
          transition()
          return generation === captured
        },
        run<T>(action: () => T) {
          transition()
          if (generation !== captured) return
          return action()
        },
```

### C2 — Corroboration: exact retry does not equal projection equivalence

L2 section: **Durable admission, optimistic state and draft storage**. Accepted support: `s2.l1.app-session` §Prompt admission and draft ownership.

The comparison distinction is already explicit in accepted L1. Prompt context is not added to the retry identity by this explanation.

`packages/core/src/session/input.ts:291–316` · file SHA256 `c5c418685f90aac45034890e2f8a2e2ee9787505e0134b9331a7edbb6be6e7bc` · excerpt SHA256 `249f596d94c394e09943e64fa36f16eb158e0f3ae47d32e60bcf24064acef803`

```text
export const equivalent = (
  input: Admitted,
  expected: {
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly delivery: Delivery
  },
) => input.delivery === expected.delivery && matchesPrompt(input, expected)

const matchesPrompt = (input: Admitted, expected: { readonly sessionID: SessionSchema.ID; readonly prompt: Prompt }) =>
  input.sessionID === expected.sessionID &&
  JSON.stringify(encodePrompt(input.prompt)) === JSON.stringify(encodePrompt(expected.prompt))

const matchesProjection = (
  input: Admitted,
  expected: {
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly promptContext?: PromptContext.Info
    readonly delivery: Delivery
    readonly timeCreated: DateTime.Utc
  },
) =>
  equivalent(input, expected) &&
  JSON.stringify(input.promptContext) === JSON.stringify(expected.promptContext) &&
  DateTime.toEpochMillis(input.timeCreated) === DateTime.toEpochMillis(expected.timeCreated)
```

### C3 — Corroboration: bounded live SSE does not supply durable replay

L2 section: **Transport, liveness and canonical recovery**. Accepted support: `s2.l1.app-session` §Transport, stream health and canonical recovery.

The reconnect-and-reconcile interpretation follows the no-ID frame and bounded listener/heartbeat observations already accepted. It makes no losslessness or real overload result claim.

`packages/server/src/handlers/event.ts:13–20` · file SHA256 `ca51a6d6bd47e97cda8d43b629e4a590cbe21e1a263b6146d3609d30bceae427` · excerpt SHA256 `ba1e8e697e68001d7b71935a3d00f2b534b89e7a74bc22ecc12c6e722c7f99d6`

```text
export const eventFrames = (encode: (data: unknown) => string = encodeEvent) => {
  const frames = new WeakMap<object, string>()
  return (data: object): Sse.Event => {
    const cached = frames.get(data)
    const json = cached ?? encode(data)
    if (cached === undefined) frames.set(data, json)
    return { _tag: "Event", event: "message", id: undefined, data: json }
  }
```

`packages/server/src/handlers/event.ts:25–43` · file SHA256 `ca51a6d6bd47e97cda8d43b629e4a590cbe21e1a263b6146d3609d30bceae427` · excerpt SHA256 `23ea3e429cfddf1be5e7971055f0ee1a69c44adf2bdce194d88ca2bfaa660ff1`

```text
// enough to ride out such a stall; an event is a few hundred bytes, so a full queue is still small.
export const subscriberCapacity = 4096

export const eventStream = (events: EventV2.Interface, frame = eventFrames()) => {
  const connected = {
    id: EventV2.ID.create(),
    type: "server.connected",
    data: {},
  }
  const output = Stream.unwrap(
    Effect.gen(function* () {
      // Acquiring the bounded stream installs its listener before readiness is observable.
      const live = yield* EventV2.allBounded(events, subscriberCapacity)
      return Stream.make(connected).pipe(Stream.concat(live))
    }),
  ).pipe(Stream.map(frame), Stream.pipeThroughChannel(Sse.encode()))
  // A comment frame keeps idle connections open and tells the client the server is alive.
  const heartbeat = Stream.tick("15 seconds").pipe(Stream.map(() => ": heartbeat\n\n"))
  return output.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }), Stream.encodeText)
```

### C4 — Corroboration: canonical read receipts are client-local ordering evidence

L2 section: **Transport, liveness and canonical recovery**. Accepted support: `s2.l1.app-session` §Transport, stream health and canonical recovery.

Generation rejection, policy-repeat behavior and snapshot provenance limits support the recovery explanation. This is not a backend revision or post-crash provider continuation proof.

`packages/app-shell/src/context/session-recovery.ts:45–64` · file SHA256 `5812a355724bfe9ae15a5cff5abd273b17cfb657e778c93228780b88e85eb59e` · excerpt SHA256 `8a39dbd07bb88c2c0614516cca942b870abefc4651c45e6f0538221fdcfa7b20`

```text
    const state = { policyGeneration: {}, policy: floor ?? fences.get(sessionID) ?? cached }
    const request = (): Promise<AppSession> => {
      const policyGeneration = state.policyGeneration
      return input.request(sessionID).then((result) => {
        if (input.generations.get(sessionID) !== active) throw new DOMException("Session recovery superseded", "AbortError")
        if (state.policyGeneration !== policyGeneration) return request()
        const observed = mergeSessionManagementInfo(state.policy,
          mergeSessionManagementInfo(fences.get(sessionID), input.read(sessionID) ?? result))
        // Compatibility SDK snapshots carry no canonical V2 policy provenance.
        if (input.source === "snapshot") return input.retain(mergeSessionManagementInfo(observed, result))
        local.receipt = Math.max(local.receipt, observed.subagentModelsReadReceipt ?? 0) + 1
        return input.retain({
          ...result,
          subagentModelsChangedAt: observed.subagentModelsChangedAt,
          subagentModelsRevision: observed.subagentModelsRevision,
          subagentModelsReadReceipt: local.receipt,
        })
      }, (error: unknown) => {
        if (input.generations.get(sessionID) === active && state.policyGeneration !== policyGeneration) return request()
        throw error
```

### C5 — Corroboration: Skills decoder, access and write lifecycle must remain separate

L2 section: **Skills catalog, content and editing ownership**. Accepted support: `s2.l1.app-session` §Skills catalog, editing and ownership.

All Skills facts in the body are inherited from the accepted L1r3 Skills section. These excerpts preserve the whole-array decoder, lexical governed-root precedence, path/mtime mapping and the absence of a page signal on write calls. No filesystem implementation is inferred.

`packages/app-shell/src/orchestra/chapters/skills-data.ts:11–28` · file SHA256 `0001420dcb688c672b55f1070284df5b5086be8d1655df75f7a25585981f4931` · excerpt SHA256 `fab2c3bceb35ea5912556b9d16716f54baeb2f0c1995a10205d8c0a75f93b76a`

```text

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

`packages/app-shell/src/orchestra/chapters/skills-data.ts:54–56` · file SHA256 `0001420dcb688c672b55f1070284df5b5086be8d1655df75f7a25585981f4931` · excerpt SHA256 `5e7ce3ec9c0e0620f8c32ba3882ca5612a6ff138ce9b66f3a5687359df328e04`

```text

const PROJECT_ROOTS = [".orchestra/skills/", ".orchestra/skill/", ".claude/skills/", ".agents/skills/"]
const GOVERNED_ROOT = ".orchestra/skills/own/"
```

`packages/app-shell/src/orchestra/chapters/skills-data.ts:69–81` · file SHA256 `0001420dcb688c672b55f1070284df5b5086be8d1655df75f7a25585981f4931` · excerpt SHA256 `d9e4bd803855c9bce06e4a4f420738335e84e5b5d935fd435cf07dbd2ce557dd`

```text
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
```

`packages/app-shell/src/orchestra/chapters/skills-dialog.tsx:43–57` · file SHA256 `4d765b72649145007edfaeed34a5a397b311c6518b75ca5fc25defd31a77251a` · excerpt SHA256 `0d2345674e0ec5f15617e613404844d09dab0fa2e13d03f2edd49318cb025d30`

```text

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

`packages/app-shell/src/orchestra/chapters/skills.tsx:100–125` · file SHA256 `7e60597bb282ef3fdd525224acfff4efd94c07cfc2a3069c403b4b39b1b0cd31` · excerpt SHA256 `c86663f9835c1576d1eb02c7a99af006b356b2d988388a075f0a0546de4fff72`

```text
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
```

### C6 — Corroboration: rendering and permission policy retain narrow contracts

L2 section: **Shared rendering, files and evidence interpretation**. Accepted support: `s2.l1.app-session` §Rendering, evidence and reusable utility contracts; `s2.l1.app-session` §Requests, terminals and auxiliary lifetimes.

The renderer model declaration and sanitizer fallback support bounded rendering ownership. The Relay hook exclusion supports the separate request section. These are not broad security/accessibility assurances.

`packages/session-ui/src/transcript-model.ts:1–6` · file SHA256 `23d5dbdc3efc71cb44f0284fa53b963f15a1690a8ac0fc1eed27b210cd829736` · excerpt SHA256 `ed4ec071a320647016f068ec5eade0122a25b27979d3dc511a9fa051462090d3`

```text
export * as Transcript from "./transcript-model"

// Transcript view model: the message, part and session shapes the transcript renderer reads.
// The app projects the server's V2 Session messages into these shapes; nothing here is a wire
// contract. Free-form records (`metadata`, tool `input`, JSON schemas) stay `any`-valued because
// renderers read nested fields from them directly.
```

`packages/session-ui/src/components/markdown-cache.tsx:35–38` · file SHA256 `c1ced6b1bc3299137f952aa74fe9decff11b2780d16386c9975d780427732079` · excerpt SHA256 `6abacc1c914a3e9c25bd998eeddfe27499b4a6ff02029086a79bda98efdb07e5`

```text
export function sanitizeMarkdown(html: string) {
  if (!DOMPurify.isSupported) return ""
  return DOMPurify.sanitize(html, config)
}
```

`packages/app-shell/src/context/permission-auto-respond.ts:59–69` · file SHA256 `618f180631a888789103d7e23ccb21f7f69f9de25813a90658b2a1a1a5bbca39` · excerpt SHA256 `6156bdbc8d4a8769e5694496097f3dabd4228a4c68b1a107557d7e64cc934444`

```text
export function sessionAutoAccept(
  autoAccept: Record<string, boolean>,
  session: { id: string; parentID?: string }[],
  permission: AutoRespondRequest,
  directory?: string,
) {
  if (isHookAsk(permission)) return false
  return sessionLineage(session, permission.sessionID)
    .map((id) => accepted(autoAccept, id, directory))
    .find((item): item is boolean => item !== undefined)
}
```

### C7 — Corroboration: settings optimism does not prove server persistence

L2 section: **Navigation, settings and feature controllers**. Accepted support: `s2.l1.app-session` §Navigation, settings and feature-family disposition.

The accepted settings observation is explained as reversible client presentation; the source restores the previous shell value when updateConfig rejects.

`packages/app-shell/src/components/settings-v2/general-controllers.ts:75–88` · file SHA256 `d43394eabf14250c3e052afb0f34465885866f68ec627cc6bf12d36c8c53c428` · excerpt SHA256 `e380c4dcfc67f694b66c756da255b4f907e75a9e48f6f11a4424e3ca3511f140`

```text
      serverSync().set("config", "shell", value)
      serverSync()
        .updateConfig({ shell: value })
        .catch((err: unknown) => {
          serverSync().set("config", "shell", before)
          showToast({
            title: language.t("common.requestFailed"),
            description: err instanceof Error ? err.message : String(err),
          })
        })
    },
  }
}

```

## Complete meaningful-family mapping

The accepted coverage input is `producers/app-session/coverage.json`, SHA256 `c93eff70f252f2e7c4cb6f4676a0a193b2b64eccc7a836001033ce3656c34759`. The following 59 rows retain its 1,887-path partition. The machine-readable `family-map.json` also preserves each family's original depth counts and limitation. A family mapped here is not a claim that every member was read for L2.

| Family ID | Paths | L2 explanation section | Accepted L1 support |
|---|---:|---|---|
| `authority` | 18 | Visual resources and prescribed maintenance | §Authority, composition and identity |
| `history` | 8 | Visual resources and prescribed maintenance | §Authority, composition and identity |
| `skills` | 5 | Visual resources and prescribed maintenance | §Authority, composition and identity |
| `guides` | 6 | Visual resources and prescribed maintenance | §Authority, composition and identity |
| `bootstrap` | 55 | Composition, identity and asynchronous ownership | §Authority, composition and identity |
| `transport` | 27 | Transport, liveness and canonical recovery | §Transport, stream health and canonical recovery |
| `sync` | 42 | Transport, liveness and canonical recovery | §Transport, stream health and canonical recovery |
| `prompt` | 57 | Durable admission, optimistic state and draft storage | §Prompt admission and draft ownership |
| `persistence` | 19 | Durable admission, optimistic state and draft storage | §Prompt admission and draft ownership |
| `requests` | 10 | Permission requests and terminal boundaries | §Requests, terminals and auxiliary lifetimes |
| `session-route` | 34 | Composition, identity and asynchronous ownership | §Authority, composition and identity |
| `timeline` | 47 | Shared rendering, files and evidence interpretation | §Rendering, evidence and reusable utility contracts |
| `files` | 39 | Shared rendering, files and evidence interpretation | §Rendering, evidence and reusable utility contracts |
| `terminal` | 16 | Permission requests and terminal boundaries | §Requests, terminals and auxiliary lifetimes |
| `dock` | 13 | Host capabilities and auxiliary lifetimes | §Requests, terminals and auxiliary lifetimes |
| `home` | 39 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `commands` | 15 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `settings` | 66 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `agents` | 7 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `actions` | 73 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `relay` | 65 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `atlas` | 87 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `integrations` | 20 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `lean` | 8 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `board` | 13 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `guardrails` | 6 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `schedule` | 10 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `rag` | 4 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `mcp-skills` | 14 | Navigation, settings and feature controllers; Skills catalog, content and editing ownership | §Navigation, settings and feature-family disposition; §Skills catalog, editing and ownership |
| `plugins` | 5 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `workspace-tools` | 14 | Navigation, settings and feature controllers | §Navigation, settings and feature-family disposition |
| `live` | 16 | Host capabilities and auxiliary lifetimes | §Requests, terminals and auxiliary lifetimes |
| `wsl` | 7 | Host capabilities and auxiliary lifetimes | §Requests, terminals and auxiliary lifetimes |
| `cockpit` | 42 | Shared rendering, files and evidence interpretation | §Rendering, evidence and reusable utility contracts |
| `session-ui-contract` | 46 | Shared rendering, files and evidence interpretation | §Rendering, evidence and reusable utility contracts |
| `session-ui-markdown` | 19 | Shared rendering, files and evidence interpretation | §Rendering, evidence and reusable utility contracts |
| `session-ui-editor` | 10 | Durable admission, optimistic state and draft storage | §Prompt admission and draft ownership |
| `session-ui-review` | 39 | Shared rendering, files and evidence interpretation | §Rendering, evidence and reusable utility contracts |
| `palette-source` | 15 | Visual resources and prescribed maintenance | §Assets, localization and verification evidence |
| `palette-generated` | 7 | Visual resources and prescribed maintenance | §Assets, localization and verification evidence |
| `styles` | 71 | Visual resources and prescribed maintenance | §Assets, localization and verification evidence |
| `localization` | 190 | Visual resources and prescribed maintenance | §Assets, localization and verification evidence |
| `avatars` | 90 | Visual resources and prescribed maintenance | §Assets, localization and verification evidence |
| `wallpaper-assets` | 79 | Visual resources and prescribed maintenance | §Assets, localization and verification evidence |
| `brand-assets` | 18 | Visual resources and prescribed maintenance | §Assets, localization and verification evidence |
| `zen-assets` | 2 | Visual resources and prescribed maintenance | §Assets, localization and verification evidence |
| `evidence-fixtures` | 37 | Shared rendering, files and evidence interpretation; Verification limits and ownership use | §Rendering, evidence and reusable utility contracts; §Assets, localization and verification evidence |
| `browser-tests` | 106 | Verification limits and ownership use | §Assets, localization and verification evidence |
| `e2e-tests` | 155 | Verification limits and ownership use | §Assets, localization and verification evidence |
| `benchmarks` | 53 | Visual resources and prescribed maintenance; Verification limits and ownership use | §Authority, composition and identity; §Assets, localization and verification evidence |
| `test-support` | 2 | Verification limits and ownership use | §Assets, localization and verification evidence |
| `entry-recovery` | 5 | Composition, identity and asynchronous ownership | §Authority, composition and identity |
| `janitor` | 6 | Host capabilities and auxiliary lifetimes | §Requests, terminals and auxiliary lifetimes |
| `controls` | 4 | Shared rendering, files and evidence interpretation | §Rendering, evidence and reusable utility contracts |
| `diagnostics` | 1 | Host capabilities and auxiliary lifetimes | §Requests, terminals and auxiliary lifetimes |
| `identity-utils` | 9 | Composition, identity and asynchronous ownership | §Rendering, evidence and reusable utility contracts |
| `dom-input` | 7 | Shared rendering, files and evidence interpretation | §Rendering, evidence and reusable utility contracts |
| `feedback` | 7 | Shared rendering, files and evidence interpretation | §Rendering, evidence and reusable utility contracts |
| `pull-request` | 2 | Shared rendering, files and evidence interpretation | §Rendering, evidence and reusable utility contracts |

## Captured maintenance guidance consulted

Root and app-shell/session-ui/Schema AGENTS were read. The five captured `.orchestra/skills/.../SKILL.md` files listed in `sources.json` were read for scope and maintenance obligations: agent-screen, agent-avatars, HuGR Composer, onboarding and settings. They were treated as attributed instructions or intended workflows. Their installation, account, trust and native-operation instructions were not performed. Root/package dependency and generation rules, session/timeline benchmark obligations and immutable English localization rules remain prescribed rather than executed.

## Preserved limits and discrepancies

The app README/browserSafe policy distinction and separate Client prohibition; readiness PID-or-healthy versus health healthy-only predicates; admission/retry versus projection equivalence; local read receipt versus durable sequence; lexical skill access versus filesystem authority; unsignalled writes versus suppressed late UI; retained legacy CI source versus actual Actions routing; unregistered Guardrails; generic avatar sizing versus the captured sample; and generated palette outputs versus authored CSS remain explicit. The accepted L1 failed-lookup/capture ledger and 30 metadata-only leaves are not reclassified by this L2.

Native host/scanner behavior, PTY slow-reader resolution, provider/OAuth/storage outcomes, Core scheduling, RAG retrieval quality, Board mutations, SkillV2/SkillFile filesystem enforcement, exhaustive specialized renderers and per-locale/per-asset provenance remain unestablished. Browser suites, E2E mocks, stories, fixture logs and benchmark guidance are evidence of intended checks, not passing executions. No pending navigation destination is used as proof.
