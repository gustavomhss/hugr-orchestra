# Projeção curta para revisão independente: Actions, Board e agendamento

Artefato `s1.core.automation` · baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38` · repositório `gustavomhss/hugr-orchestra`.

Todos os blocos são transcrições literais dos bytes UTF-8 capturados por `github.fetch_blob`. Linhas são 1-based inclusivas; intervalos separados omitem contexto, não inserem código. Git blob SHA1 e SHA256 são da fonte completa, não de uma versão reformatada. Cada fence preserva os bytes de seu intervalo (a quebra que fecha o fence não é parte da fonte quando a última linha não a contém).

O archive é `sources/<path>`; `captures.json` fixa os 204 arquivos e `coverage.jsonl` fixa suas disposições. Os IDs abaixo ligam este documento às seções do `body.md`. Só leitura estática ocorreu; testes existentes são NOT_RUN.

Esta é uma seleção para juízes sem ferramentas, não o inventário completo de prova. `evidence.md` conserva intervalos mais amplos para cada ID, incluindo as 115 implementações substantivas. Se um claim depender de contexto não exibido aqui, use REQUEST_EVIDENCE com ID/path/intervalo; não promova a ausência de contexto a aceitação. As inferências de wake e revogação de bundle continuam explicitamente estáticas.


## A01 — Fachada preguiçosa, snapshot e roteamento

Vínculo: `body.md` §1, 3; archive de evidência: `evidence.md`, seção `A01`.


### `packages/core/src/actions.ts`

Archive: `sources/packages/core/src/actions.ts` · bytes: 12779 · Git blob: `4f81df84763bd63e7680de8fd40c60b583ef68ca` · SHA256: `08c5f306bc1c53b978a4254eba0fc708d9a4bfbb30fb63ead23c237f359fceef`.


Linhas **129–133**; SHA256 do intervalo `f571a1a7430bec9be2f80cab02b03895e5d3cac380a6ab881d0365b21562c042`:

~~~~typescript
    reconcile: Effect.fn("Actions.reconcile")(function* (ref, id) {
      const binding = yield* bindings.get(ref)
      const service = yield* operations
      return yield* service.reconcile(binding, id, (intent, acknowledged) =>
        ActionsReadback.observe(reader(binding), binding, intent, acknowledged))
~~~~


Linhas **192–202**; SHA256 do intervalo `648bdeec784cf6a4ebba41e13aa795e4425de9a764616e6f7f3b439af0f651fb`:

~~~~typescript
          const { ActionsGitLabCommands } = yield* Effect.promise(() => import("./actions/gitlab/commands"))
          return yield* ActionsGitLabCommands.make({ transport, reader: gitlab }).perform(binding, intent, payload)
        })
        transient.output = result.output === undefined ? undefined : yield* Schema.decodeUnknownEffect(Schema.toType(Actions.CommandOutput), {
          onExcessProperty: "error",
        })(result.output).pipe(Effect.mapError(() => new ActionsError({
          kind: "outcome_unknown", message: "Native command returned an invalid one-time output",
        })))
        return result.acknowledgement
      }))
      return { operation, ...(transient.output === undefined ? {} : { output: transient.output }) }
~~~~


## A02 — Binding físico e estado externo

Vínculo: `body.md` §1; archive de evidência: `evidence.md`, seção `A02`.


### `packages/core/src/actions/binding.ts`

Archive: `sources/packages/core/src/actions/binding.ts` · bytes: 11296 · Git blob: `0012bd2c459c7c9899ce63aa6d4bb69760e9647a` · SHA256: `fa7b2380b5ea1c3b10195b17e2015fed34f0501df2e16cfa7fe497969dba83bc`.


Linhas **54–75**; SHA256 do intervalo `9f841e5459e617eaad3ebc3366756836a10ce77fa2100e49ab06b86940fd053b`:

~~~~typescript
    // Validate every fetch URL, including git's insteadOf expansion, before touching provider authentication.
    const raw = yield* git(["config", "--null", "--get-all", `remote.${decoded.remote}.url`])
    const effective = yield* git(["remote", "get-url", "--all", decoded.remote])
    yield* checked(() => [...raw.split("\0").filter(Boolean), ...effective.split(/\r?\n/)].forEach((remote) =>
      matchRemote(remote, provider, projectPath)))
    const identity = yield* input.resolve(provider, projectPath)
    if (!identity.projectID.trim() || /[\x00-\x20\x7f]/.test(identity.projectID) ||
      !identity.account || /[\x00-\x20\x7f]/.test(identity.account))
      return yield* new ActionsError({ kind: "transport_failed", message: "Provider returned invalid project or account identity." })
    yield* checked(() => ActionsState.projectPath(provider.kind, identity.projectPath))
    if (!samePath(provider.kind, projectPath, identity.projectPath))
      return yield* new ActionsError({ kind: "host_mismatch", message: "Provider returned a different project path." })
    return { ...decoded, provider, projectID: identity.projectID, projectPath: identity.projectPath, account: identity.account }
  })
  const record = Effect.fnUntraced(function* (document: ActionsState.Document, ref: Actions.BindingRef) {
    // A Binding is also a BindingRef; project away caller metadata and use only the trusted store's Location.
    const decoded = yield* Schema.decodeUnknownEffect(Actions.BindingRef)(ref).pipe(Effect.mapError(invalid))
    const current = document.records.find((item) => item.binding.id === decoded.id)
    if (!current) return yield* new ActionsError({ kind: "binding_missing", message: "Actions binding does not exist at this Location." })
    if (current.binding.revision !== decoded.revision)
      return yield* new ActionsError({ kind: "binding_stale", message: "Actions binding revision has changed.", bindingID: decoded.id })
    return current
~~~~


### `packages/core/src/actions/state.ts`

Archive: `sources/packages/core/src/actions/state.ts` · bytes: 8827 · Git blob: `c24ab01417fdea32688d26007e04d8fdac1d43ca` · SHA256: `a47ce41b196dd2c95e9724824d554472f93466be0220a02f1b019e855c3b9faf`.


Linhas **139–151**; SHA256 do intervalo `934290e7fb0bca1e5491421ca6f6b95f1a575643f3bbc7fa55b60ad2857bd007`:

~~~~typescript
  const parts = text.split("/")
  if ((kind === "github" ? parts.length !== 2 : parts.length < 2) ||
    parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part) || part === "." || part === ".." || part.endsWith(".git")))
    throw new ActionsError({ kind: "invalid_input", message: "Invalid provider project path." })
  return text
}

export function provider(input: Actions.Provider): Actions.Provider {
  const host = Option.getOrUndefined(url(`https://${input.hostname}`))
  const api = Option.getOrUndefined(url(input.apiOrigin))
  if (!host || !api || !/^[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(input.hostname) ||
    host.username || host.password || host.pathname !== "/" || host.search || host.hash ||
    host.hostname.endsWith(".") || host.hostname.split(".").some((part) => !part || part.startsWith("-") || part.endsWith("-")) ||
~~~~


## A03 — Identidade de cursor e capacidades qualificadas

Vínculo: `body.md` §1; archive de evidência: `evidence.md`, seção `A03`.


### `packages/core/src/actions/cursor.ts`

Archive: `sources/packages/core/src/actions/cursor.ts` · bytes: 3689 · Git blob: `3c61a40570a65ef162d6ab908f70b09b1a22aa93` · SHA256: `42629421f0bb3f1c6c48c37c256899929890a718f6072228669d58340ad56373`.


Linhas **24–37**; SHA256 do intervalo `a852cfdd1fe80d0442ccd5c1d3957ee05312cbffa4f3c2411c95bfd89938e930`:

~~~~typescript
  if (Option.isNone(value) || value.value.binding !== binding.id || value.value.revision !== binding.revision ||
    value.value.provider !== binding.provider.kind || value.value.host !== binding.provider.hostname ||
    value.value.project !== binding.projectID || value.value.scope !== scope || value.value.filters !== fingerprint(filters))
    throw new ActionsError({ kind: "invalid_input", message: "Actions cursor does not belong to this binding and selection", disposition: "definitely_unsent" })
  return value.value.page
}

export function encode(binding: Actions.Binding, scope: string, filters: Readonly<Record<string, unknown>>, page: number) {
  return Buffer.from(JSON.stringify(Cursor.make({
    binding: binding.id, revision: binding.revision, provider: binding.provider.kind,
    host: binding.provider.hostname, project: binding.projectID, scope, filters: fingerprint(filters), page,
  }))).toString("base64url")
}

~~~~


### `packages/core/src/actions/github/catalog.ts`

Archive: `sources/packages/core/src/actions/github/catalog.ts` · bytes: 7466 · Git blob: `6fba4351d5bb942754a6609c3ddb82c55ae3dc36` · SHA256: `d6dfdfe937306ddec89ca7c43589d3c812f445797f5365c839af6ba303da2c04`.


Linhas **78–88**; SHA256 do intervalo `cd16e7a7f689b5777277d4eb726622204cca29a49b9faa932c970368317cc29c`:

~~~~typescript
  yield* workflows(transport, binding, { limit: 1 })
  const observedAt = Date.now()
  const scopes = repo.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
  const evidence = [scopes === undefined ? undefined : `Observed classic OAuth scopes: ${scopes.join(", ") || "none"}`,
    repo.native.permissions === undefined ? undefined : `Observed repository permissions: ${Object.entries(repo.native.permissions).map(([key, value]) => `${key}=${value}`).join(", ")}`]
    .filter((value) => value !== undefined).join("; ")
  return [Actions.Capability.make({ operation: "workflows.list", state: "available", scope: `repository:${binding.projectID}`,
    reason: "Native workflows GET succeeded", observedAt }),
    ...["source.read", "runs.list", "runs.read", "jobs.list", "workflow.dispatch", "workflow.enable", "workflow.disable", "source.write", "run.retry", "run.cancel", "run.delete"].map((operation) =>
      Actions.Capability.make({ operation, state: "unknown", scope: `repository:${binding.projectID}`,
        reason: `Endpoint or target eligibility has not been proved${evidence ? `; ${evidence}` : ""}`, observedAt }))]
~~~~


## A04 — Catálogo e fonte GitHub com identidade imutável

Vínculo: `body.md` §1; archive de evidência: `evidence.md`, seção `A04`.


### `packages/core/src/actions/github/native.ts`

Archive: `sources/packages/core/src/actions/github/native.ts` · bytes: 7552 · Git blob: `9de483d99f461e35c200b1fdcc2a0ce3f6224dac` · SHA256: `8624a7b9db3ea727bd4142c0233b37259f0a92ba457c31c658a8ce52f096a712`.


Linhas **60–69**; SHA256 do intervalo `5b0bcd1ab6121cf5f9fa4654d234b3c897f4ea08f71faea8746e0998e926d537`:

~~~~typescript
export const repository = Effect.fn("ActionsGitHubRead.repository")(function* (transport: ActionsContract.Transport, binding: Actions.Binding) {
  if (binding.provider.kind !== "github") return yield* error(binding, "host_mismatch", "GitHub read adapter requires a GitHub binding")
  const target = yield* checked(binding, () => id(binding, binding.projectID))
  const response = yield* get(transport, binding, { method: "GET", path: `repositories/${target}` })
  return yield* checked(binding, () => {
    const native = decode(binding, Repository, response.data, "repository")
    if (String(native.id) !== binding.projectID) throw error(binding, "binding_stale", "GitHub repository ID does not match the binding")
    return { native, path: `repositories/${target}`, headers: response.headers }
  })
})
~~~~


### `packages/core/src/actions/github/catalog.ts`

Archive: `sources/packages/core/src/actions/github/catalog.ts` · bytes: 7466 · Git blob: `6fba4351d5bb942754a6609c3ddb82c55ae3dc36` · SHA256: `d6dfdfe937306ddec89ca7c43589d3c812f445797f5365c839af6ba303da2c04`.


Linhas **60–72**; SHA256 do intervalo `1920422371518c1f1a898013c31d79849d52af2bb9e1d4c51fb980a4e7f22d81`:

~~~~typescript
      throw GitHubNative.error(binding, "source_unresolved", "GitHub source is not canonical Base64")
    const bytes = Buffer.from(encoded, "base64")
    if (bytes.toString("base64") !== encoded || bytes.length !== content.size)
      throw GitHubNative.error(binding, "source_unresolved", "GitHub source content is incomplete")
    // GitHub supports both repository object algorithms; preserve either full ID.
    // https://docs.github.com/en/rest/repos/repos#get-the-hash-algorithm-for-a-repository
    if (createHash(content.sha.length === 40 ? "sha1" : "sha256").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== content.sha.toLowerCase())
      throw GitHubNative.error(binding, "source_unresolved", "GitHub source bytes do not match the authoritative blob ID")
    return { native: content, bytes }
  })
  const text = yield* Effect.try({ try: () => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content.bytes),
    catch: () => GitHubNative.error(binding, "source_unresolved", "GitHub source is not valid UTF-8") })
  return { bindingID: binding.id, path: content.native.path, ref: input.ref, commit: commit.sha, version: content.native.sha, text, editable: false }
~~~~


## A05 — Runs e jobs GitHub preservam tentativa

Vínculo: `body.md` §1; archive de evidência: `evidence.md`, seção `A05`.


### `packages/core/src/actions/github/runs.ts`

Archive: `sources/packages/core/src/actions/github/runs.ts` · bytes: 9329 · Git blob: `ab56898ee021b474d882ecb6ef84282fe618ed30` · SHA256: `03a7cb4acf1a709fb8c289cede6f44045b70735107117d890e6c61f3fc1594c4`.


Linhas **65–80**; SHA256 do intervalo `6e8b29d2e6e3290ef15ea764e12d89397b0a5901d8c81f0e259b7628b619c8bc`:

~~~~typescript
  // Native updated_at is not an authoritative completion time, so it never becomes finishedAt; once a run is
  // completed it is the last native stamp, which is what the GitHub UI and CLI use for run duration.
  const duration = data.status === "completed" && data.updated_at !== undefined && data.run_started_at !== undefined
    ? Math.round((Date.parse(data.updated_at) - Date.parse(data.run_started_at)) / 1000) : undefined
  return { id: String(data.id), bindingID: binding.id, workflowID: String(data.workflow_id), name: data.name,
    ref: data.head_branch, commit: data.head_sha, event: data.event, status: data.status,
    repositoryID: String(data.repository.id), createdAt: data.created_at, url: data.html_url,
    ...(data.actor == null ? {} : { actor: data.actor.login }),
    ...(data.triggering_actor == null ? {} : { triggeringActor: data.triggering_actor.login }),
    ...(data.updated_at === undefined ? {} : { updatedAt: data.updated_at }),
    ...(data.conclusion === undefined ? {} : { conclusion: data.conclusion }),
    ...(data.run_attempt === undefined ? {} : { attempt: data.run_attempt }),
    ...(data.display_title === undefined ? {} : { title: data.display_title }),
    ...(data.run_number === undefined ? {} : { number: data.run_number }),
    ...(duration === undefined || !Number.isFinite(duration) || duration < 0 ? {} : { duration }),
    ...(data.run_started_at === undefined ? {} : { startedAt: data.run_started_at }) }
~~~~


### `packages/core/src/actions/github/jobs.ts`

Archive: `sources/packages/core/src/actions/github/jobs.ts` · bytes: 4682 · Git blob: `dbd8e1e17265f8439ba932be4b88d002b6984d79` · SHA256: `7bc8c9a73de49cc8acefbff94fdf03d72ca3a595e3d0451012db6b54a23ffc86`.


Linhas **22–30**; SHA256 do intervalo `97bab589edd7d906086476d3a2344ce18097412fa014e1b1d040b08f6558bea6`:

~~~~typescript
export const list = Effect.fn("ActionsGitHubRead.jobs")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: { runID: string; attempt?: number; cursor?: string }) {
  yield* GitHubNative.checked(binding, () => {
    GitHubNative.id(binding, input.runID)
    if (input.attempt !== undefined && (!Number.isSafeInteger(input.attempt) || input.attempt < 1))
      throw GitHubNative.error(binding, "invalid_input", "GitHub run attempt must be a positive safe integer")
  })
  const repo = yield* GitHubNative.repository(transport, binding)
  const run = yield* GitHubRuns.at(transport, binding, repo.path, input.runID)
  const attempt = input.attempt ?? run.attempt
~~~~


## A06 — GitLab: um slot de CI e fonte local qualificada

Vínculo: `body.md` §1; archive de evidência: `evidence.md`, seção `A06`.


### `packages/core/src/actions/gitlab/native.ts`

Archive: `sources/packages/core/src/actions/gitlab/native.ts` · bytes: 10614 · Git blob: `d6cf026dcbfb9023285415a9dd16842951e39ac0` · SHA256: `4f61c33643ab30ba295e4e84619c1a3ec4d1dd029d6ce32407029553691eadcc`.


Linhas **79–90**; SHA256 do intervalo `ba8308503ade5bd6047ba0d95a5b62f2ee8023beb503de210a2d2dd8a8fdf70d`:

~~~~typescript
    const target = yield* checked(binding, () => {
      const host = URL.parse(`https://${binding.provider.hostname}`)
      const origin = URL.parse(binding.provider.apiOrigin)
      if (!host || !origin || host.host !== binding.provider.hostname || host.pathname !== "/" || host.username || host.password || host.search || host.hash ||
        origin.protocol !== "https:" || origin.host !== host.host || origin.username || origin.password || origin.search || origin.hash ||
        (binding.provider.apiOrigin !== host.origin && binding.provider.apiOrigin !== `${host.origin}/api/v4`))
        throw error(binding, "host_mismatch", "GitLab metadata requires the exact canonical bound HTTPS host and API origin")
      return { hostname: binding.provider.hostname, apiOrigin: binding.provider.apiOrigin }
    })
    // Authenticated W1 transport supplies this observation, never client Provider.version.
    // https://docs.gitlab.com/api/metadata/
    const response = yield* get(binding, "metadata")
~~~~


### `packages/core/src/actions/gitlab/catalog.ts`

Archive: `sources/packages/core/src/actions/gitlab/catalog.ts` · bytes: 7296 · Git blob: `a7a087856e35e01764382211abebfddfa00c133d` · SHA256: `546e21ae307d414ec385b7de7963b1756535a22beb66ff277c007111fe0b6478`.


Linhas **21–31**; SHA256 do intervalo `7c47abf6cb64a132d649f48a9a2cf8b6896e3f49162fa6203ccf0b60af56e112`:

~~~~typescript
      (input.state === undefined || workflow.state === input.state) ? [workflow] : []
    return { items, total: items.length, capturedAt: Date.now() }
  })
  const source = Effect.fn("ActionsGitLabRead.source")(function* (binding: Actions.Binding, input: { readonly path: string; readonly ref: string }) {
    yield* ActionsGitLabNative.checked(binding, () => {
      ActionsGitLabNative.selection(binding, input, ["path", "ref"], Schema.Struct({ path: Schema.NonEmptyString, ref: Schema.NonEmptyString }))
      if (!ActionsGitLabNative.localPath(input.path)) throw ActionsGitLabNative.error(binding, "source_unresolved",
        "GitLab external, project-qualified or dynamic CI source requires separate resolution; no local configuration fallback")
      if (!input.ref || /[\x00-\x1f\x7f\\]/.test(input.ref) || input.ref.split("/").some((part) => !part || part === "." || part === ".."))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab source ref must name an exact commit, branch or tag")
    })
~~~~


Linhas **61–72**; SHA256 do intervalo `14e54a9c14cc479567d89065ddf341d6580d12272121bfff2bc9993b10f8c537`:

~~~~typescript
    })
  })
  const capabilities = Effect.fn("ActionsGitLabRead.capabilities")(function* (binding: Actions.Binding) {
    const project = yield* native.project(binding)
    const observedAt = Date.now()
    const scope = `projects/${binding.projectID}`
    const permissions = [project.permissions?.project_access?.access_level, project.permissions?.group_access?.access_level]
      .filter((value) => value !== undefined)
    const context = `Native project read succeeded; access levels ${permissions.length ? permissions.join(",") : "unobserved"}; advisory client version ${binding.provider.version ?? "unset"}; native version unobserved by this inspection`
    return [Actions.Capability.make({ operation: "workflows.read", state: "available", reason: context, scope, observedAt }),
      ...["source.read", "runs.read", "jobs.read"].map((operation) => Actions.Capability.make({ operation, state: "unknown", scope, observedAt,
        reason: `${context}; endpoint-specific read permission not observed` })),
~~~~


## A07 — Runs/jobs/bridges GitLab sem tentativa fabricada

Vínculo: `body.md` §1; archive de evidência: `evidence.md`, seção `A07`.


### `packages/core/src/actions/gitlab/runs.ts`

Archive: `sources/packages/core/src/actions/gitlab/runs.ts` · bytes: 9251 · Git blob: `5c1611e2e163457eb6f17cc44f386f597ccaccd6` · SHA256: `4cb9c8b7a73b12019ee9f60b36b2c116ccac833ab12f73307e5c37ba6341cdab`.


Linhas **91–102**; SHA256 do intervalo `4e4f20a89e56c18b211f6530fb979f7982a5d50f7b1c379486b89f34ebf963e6`:

~~~~typescript
    name: pipeline.name === undefined ? `Pipeline ${pipeline.id}` : pipeline.name, ref: pipeline.ref, commit: pipeline.sha, event: pipeline.source,
    repositoryID: String(pipeline.project_id),
    ...(pipeline.name ? { title: pipeline.name } : {}),
    ...(pipeline.iid === undefined ? {} : { number: Number(pipeline.iid) }),
    status: pipeline.status, ...(ActionsGitLabNative.conclusion(pipeline.status) === undefined ? {} : { conclusion: pipeline.status }),
    ...(pipeline.user ? { actor: pipeline.user.username } : {}),
    ...(pipeline.created_at === undefined || pipeline.created_at === null ? {} : { createdAt: pipeline.created_at }),
    ...(pipeline.started_at === undefined || pipeline.started_at === null ? {} : { startedAt: pipeline.started_at }),
    ...(pipeline.finished_at === undefined || pipeline.finished_at === null ? {} : { finishedAt: pipeline.finished_at }),
    ...(pipeline.updated_at === undefined || pipeline.updated_at === null ? {} : { updatedAt: pipeline.updated_at }),
    ...(pipeline.duration === undefined || pipeline.duration === null ? {} : { duration: pipeline.duration }),
    ...(pipeline.web_url === undefined || pipeline.web_url === null ? {} : { url: pipeline.web_url }),
~~~~


### `packages/core/src/actions/gitlab/jobs.ts`

Archive: `sources/packages/core/src/actions/gitlab/jobs.ts` · bytes: 4992 · Git blob: `5eef5ef7e30087596d06535bf9f4775704a8d033` · SHA256: `5f2ef28c5898a8375a57a0c85d053cea34a3f3981319d1bbb619db7599a5f8bf`.


Linhas **22–34**; SHA256 do intervalo `270cad718488ecb574bf6d74c2c212ff4869a518624d6f205d70b5aa2e4ba840`:

~~~~typescript
      }))
      ActionsGitLabNative.nativeID(binding, input.runID, "pipeline ID")
      if (input.attempt !== undefined) throw ActionsGitLabNative.error(binding, "capability_unavailable", "GitLab job retries have native job IDs, not pipeline run_attempt numbers")
      return ActionsCursor.page(binding, "gitlab.jobs", filters, input.cursor)
    })
    yield* native.project(binding)
    yield* native.pipeline(binding, input.runID)
    const bridges = position > bridgeOffset
    const page = bridges ? position - bridgeOffset : position
    // The documented bridges route retains compatibility with pre-19.2 GitLab.
    // https://docs.gitlab.com/api/jobs/#list-all-trigger-jobs-by-pipeline
    const response = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/pipelines/${input.runID}/${bridges ? "bridges" : "jobs"}`,
      { page, per_page: perPage, ...(bridges ? {} : { include_retried: true }) })
~~~~


## A08 — Orçamento e segurança do parser YAML

Vínculo: `body.md` §2; archive de evidência: `evidence.md`, seção `A08`.


### `packages/core/src/actions/source/document.ts`

Archive: `sources/packages/core/src/actions/source/document.ts` · bytes: 13276 · Git blob: `52ec9f767dad9ba0cec28ec25ec4f7e4c16a163b` · SHA256: `7948e08d19341892df7f4cd8ae38f3cdb27694a197e1b462c3b4efdb96d90ce3`.


Linhas **10–27**; SHA256 do intervalo `f5530c017c93c909a1494a752fefe926ab1f80a7ecb00aa8b9830815dfabccc7`:

~~~~typescript
export function diagnostics() {
  const items: string[] = []
  const severity = { partial: false, unresolved: false }
  return {
    items,
    work: { lexemes: 0, triviaPeak: 0, parserNext: 0, parserEnd: 0, cstNodes: 0, compositions: 0, resolutions: 0, merges: 0 },
    add(kind: "partial" | "unresolved", message: string, critical = false) {
      severity[kind] = true
      if (critical && items.length >= limits.diagnostics - 1) {
        items[limits.diagnostics - 1] = `source_${kind}:${message}; diagnostics_truncated`.slice(0, limits.diagnosticLength)
        return
      }
      if (items.length < limits.diagnostics - 1) {
        items.push(`source_${kind}:${message}`.slice(0, limits.diagnosticLength))
        return
      }
      if (items.length === limits.diagnostics - 1) items.push("source_partial:diagnostics_truncated")
    },
~~~~


Linhas **183–191**; SHA256 do intervalo `91ca7b2c0a6866f26549b9952fbcc909494f8d9ac7142b3f0bd663cfb4734cb4`:

~~~~typescript
      if (target) pending.push({ node: target, depth: entry.depth, path: entry.path })
    }
    if (isPair(entry.node)) {
      if (isScalar(entry.node.key) && ["__proto__", "constructor", "prototype"].includes(String(entry.node.key.value))) {
        report.add("unresolved", "unsafe_key:prototype-sensitive mapping key")
        return
      }
      const key = isScalar(entry.node.key) ? String(entry.node.key.value) : ""
      pending.push({ node: entry.node.key, depth: entry.depth, path: entry.path }, {
~~~~


## A09 — Grafo de definição GitHub

Vínculo: `body.md` §2; archive de evidência: `evidence.md`, seção `A09`.


### `packages/core/src/actions/source/graph.ts`

Archive: `sources/packages/core/src/actions/source/graph.ts` · bytes: 3845 · Git blob: `9979794cf9f26e006fa36651ba026ecf044a65e2` · SHA256: `0219fc70d60d16887c37ac9cd9a3b9cf9aac5e586716d918d5cb2667550c8e0f`.


Linhas **45–53**; SHA256 do intervalo `2754300c846818417302a29299c4938e54eea316f0682325e43c0179973cbf8f`:

~~~~typescript
  }
  return { source, ...result, header: document.header, inputs, state: report.state(), diagnostics: report.items }
}

function inputDefinitions(header: Schema.JsonObject, report: Diagnostics): Actions.InputDefinition[] {
  if (!object(header.spec)) return []
  if (header.spec.include !== undefined) report.add("partial", "inputs_include_unresolved:external input definitions not fetched")
  if (!object(header.spec.inputs)) return []
  return Object.entries(header.spec.inputs).flatMap(([name, configuration]) => {
~~~~


### `packages/core/src/actions/source/github.ts`

Archive: `sources/packages/core/src/actions/source/github.ts` · bytes: 3773 · Git blob: `48042830d79b37d23fa901759eeeaa2f56fd8253` · SHA256: `18b5e3799d02c347f7c80b58264e4e8bc6c5d8c07f7d1559a65186a9313c6bca`.


Linhas **30–43**; SHA256 do intervalo `8a06bc003ddc570623d9a60285664f329d06726b44b2f7c8266955227d8f664d`:

~~~~typescript
    if (matrix !== undefined && expression(matrix)) report.add("partial", `matrix_dynamic:jobs.${id}`)
    if (matrix !== undefined && !object(matrix) && typeof matrix !== "string") report.add("unresolved", `matrix_invalid:jobs.${id}`)
    if (typeof configuration.uses === "string") report.add("partial", `reusable_unresolved:jobs.${id}`)
    if (configuration.uses !== undefined && typeof configuration.uses !== "string") report.add("unresolved", `reusable_invalid:jobs.${id}`)
    if (Object.hasOwn(configuration, "<<")) report.add("partial", `yaml_merge_unsupported:jobs.${id}`)
    const steps = configuration.steps === undefined ? [] : Array.isArray(configuration.steps)
      ? configuration.steps.flatMap((step, index): Actions.GraphStep[] => {
        if (!object(step)) {
          report.add("unresolved", `step_invalid:jobs.${id}.steps.${index}`)
          return []
        }
        if (step.uses !== undefined && typeof step.uses !== "string" || step.run !== undefined && typeof step.run !== "string") {
          report.add("unresolved", `step_command_invalid:jobs.${id}.steps.${index}`)
        }
~~~~


## A10 — Resolução local de GitLab

Vínculo: `body.md` §2; archive de evidência: `evidence.md`, seção `A10`.


### `packages/core/src/actions/source/gitlab.ts`

Archive: `sources/packages/core/src/actions/source/gitlab.ts` · bytes: 11989 · Git blob: `2c78794a932b7b1680a0571a975201c55676feef` · SHA256: `cc2827422fb5962c93b849d212d0755eb040485689cd1c43219d7e885550c79c`.


Linhas **94–111**; SHA256 do intervalo `58f6e1b5e094f7d54a075a735e91693c30e5a61c53e587f51ade0d2d65afc57d`:

~~~~typescript
    }
    resolved.set(id, effective)
    levels.set(id, 1 + parents.reduce((maximum, parent) => Math.max(maximum, levels.get(parent) ?? 0), 0))
    return effective
  }
  const jobs = Array.from(definitions).flatMap(([id, raw]): Actions.GraphJob[] => {
    if (id.startsWith(".")) return []
    if (!id || !object(raw)) {
      report.add("unresolved", `job_invalid:${id}`)
      return []
    }
    const effective = resolve(id)
    // Unfetched includes may redefine even known templates/jobs. Keep only source-local projections.
    const config = effective ? applyDefaults(document, effective, report, opaque, id) : raw
    if (inputExpression(id) || inputExpression(config)) report.add("partial", `inputs_unresolved:${id}:native interpolation retained`)
    const uncertain = opaque([id, "<<"])
    if (uncertain) report.add("partial", `merge_unresolved:opaque native reference at ${id}`)
    const stage = uncertain || opaque([id, "stage"]) || inputExpression(config.stage) ? undefined : typeof config.stage === "string" ? config.stage
~~~~


Linhas **207–217**; SHA256 do intervalo `9e4ee796284bdc3895930372b0ead4189e312f23a02bc823468ce58378f0355e`:

~~~~typescript
  }
  if (inheritance === false) return config
  const allowed = new Set<string>()
  if (Array.isArray(inheritance) && !inheritance.every((key) => {
    if (!mergeVisit(report)) return false
    if (typeof key !== "string" || !defaultKeys.has(key)) return false
    allowed.add(key)
    return true
  })) {
    report.add("partial", "defaults_unresolved:unsupported or excessive inherit:default allowlist")
    return config
~~~~


## A11 — Base e input de autoria

Vínculo: `body.md` §2; archive de evidência: `evidence.md`, seção `A11`.


### `packages/core/src/actions/authoring/base.ts`

Archive: `sources/packages/core/src/actions/authoring/base.ts` · bytes: 4981 · Git blob: `3c18b87555faf8d09b789ac5dc7316c6721f0f58` · SHA256: `401a807ef4861a182c4ad70985f5d13d9b43a714693ec78ad2d9ec0dc1b83d7d`.


Linhas **23–32**; SHA256 do intervalo `ed03d05ddc348171044fcfe064f412a1cd8865a30da9b66e0dd6b2e3c351ae9e`:

~~~~typescript
    if (ref !== undefined) branch(binding, ref)
    return { binding: { ...binding, provider: { ...binding.provider } }, ref }
  })
  if (frozen.binding.provider.kind === "github") {
    const repository = yield* GitHubNative.repository(services.transport, frozen.binding)
    const selected = frozen.ref ?? repository.native.default_branch
    if (!selected) return yield* error(frozen.binding, "source_unresolved", "GitHub repository has no observed default branch")
    const name = yield* guard(frozen.binding, () => branch(frozen.binding, selected))
    const response = yield* GitHubNative.get(services.transport, frozen.binding,
      { method: "GET", path: `${repository.path}/git/ref/heads/${name.split("/").map(encodeURIComponent).join("/")}` })
~~~~


Linhas **58–72**; SHA256 do intervalo `972e1a5fdabcd37a64cfa7b95d8d3ae7200a7636f9ed113dec394e3667eb4cc8`:

~~~~typescript
    if (binding.provider.kind === "github" && (!path.startsWith(".github/workflows/") || path.split("/").length !== 3 || !/\.ya?ml$/i.test(path)))
      throw error(binding, "invalid_input", "GitHub draft path must be a workflow YAML file")
    if (binding.provider.kind === "gitlab" && !ActionsGitLabNative.localPath(path))
      throw error(binding, "invalid_input", "GitLab draft path must be a local repository path")
    // A draft digest identifies local text, never a native optimistic mutation version.
    const source: Actions.Source = { bindingID: admitted.bindingID, path, ref: admitted.ref, commit: admitted.commit,
      version: `draft:sha256:${createHash("sha256").update(draftBytes).digest("hex")}`, text: draft, editable: false }
    decode(binding, Schema.toType(Actions.Source), source)
    return { binding: { ...binding, provider: { ...binding.provider } }, base: { ...admitted }, source }
  })
  const current = yield* read(services, frozen.binding, frozen.base.ref)
  if (current.commit.toLowerCase() !== frozen.base.commit.toLowerCase())
    return yield* error(frozen.binding, "source_conflict", "Source branch moved after base admission")
  return yield* ActionsAuthoring.make(services).validate(frozen.binding, frozen.source)
})
~~~~


## A12 — Publicação GitHub em fases

Vínculo: `body.md` §2; archive de evidência: `evidence.md`, seção `A12`.


### `packages/core/src/actions/authoring/github.ts`

Archive: `sources/packages/core/src/actions/authoring/github.ts` · bytes: 6777 · Git blob: `fefe6fd6df55ea6fee6f898b9b5e37b13c650307` · SHA256: `bdcb41b748e4a4ac148867cfbcffe6638ed5dc2b07f3e6bfc25746f7f9134790`.


Linhas **33–45**; SHA256 do intervalo `82d3609f9a4f8dfcd994606aac31567e5cbd314cf07fa14d4a0e83b8c598fed2`:

~~~~typescript
  const path = yield* guard(binding, () => sourcePath(binding, intent.target.path))
  const repo = yield* GitHubCommandCommon.authority(services, binding)
  const ref = yield* head(services, binding, repo.root, intent.target.ref ?? "")
  if (ref.toLowerCase() !== intent.expected?.commit?.toLowerCase())
    return yield* error(binding, "source_conflict", "Source branch moved after admission")
  if (intent.kind !== "source.write" && intent.expected?.sourceVersion !== undefined) yield* current(services, binding, intent)

  if ("branch" in command) {
    if (command.branch !== intent.target.resourceID)
      return yield* error(binding, "invalid_input", "New source branch differs from admission")
    if (intent.expected?.sourceVersion === undefined)
      yield* absent(services, binding, `${repo.root}/contents/${GitHubNative.path(binding, path)}`, ref)
    return {
~~~~


## A13 — Publicação GitLab em fases

Vínculo: `body.md` §2; archive de evidência: `evidence.md`, seção `A13`.


### `packages/core/src/actions/authoring/gitlab.ts`

Archive: `sources/packages/core/src/actions/authoring/gitlab.ts` · bytes: 7205 · Git blob: `2e17c642d355cdb595332f3069a0928ef192ae08` · SHA256: `aba55ae13260350fc70490bbf9930e19cb648babb5f555b23c3c350161e479a9`.


Linhas **39–56**; SHA256 do intervalo `cce66a6dd0ba41707d0e6565a807ffb6dd5e2fd6defb15cd2648c552df8815af`:

~~~~typescript
    return yield* error(binding, "source_conflict", "GitLab source branch moved after admission")
  if (intent.kind !== "source.write" && intent.expected?.sourceVersion !== undefined) yield* current(services, binding, intent)
  if ("branch" in command) {
    if (command.branch !== intent.target.resourceID)
      return yield* error(binding, "invalid_input", "New source branch differs from admission")
    if (intent.expected?.sourceVersion === undefined)
      yield* absent(services, binding, `${root}/repository/files/${encodeURIComponent(path)}`, ref)
    return {
      request: { method: "POST", path: `${root}/repository/branches`, body: { branch: command.branch, ref } }, status: 201,
      acknowledge: (response) => guard(binding, () => {
        const value = decode(binding, Ref, response.data, true)
        if (value.name !== command.branch || value.commit.id.toLowerCase() !== ref.toLowerCase())
          throw error(binding, "outcome_unknown", "GitLab did not prove the exact new branch and base commit", "unknown")
        return { acknowledgement: { resourceID: command.branch } }
      }),
    }
  }
  if ("mode" in command) {
~~~~


## A14 — Readback de autoria, lint e editor schedule

Vínculo: `body.md` §2; archive de evidência: `evidence.md`, seção `A14`.


### `packages/core/src/actions/authoring/remote.ts`

Archive: `sources/packages/core/src/actions/authoring/remote.ts` · bytes: 8787 · Git blob: `0ef1c6bbc54e8e4a73bc9e82a7f1b6653161d3d7` · SHA256: `458a706a6415cb1e3d554169149215269f49bcbd5a5fc77f51162840cfcb13d8`.


Linhas **114–129**; SHA256 do intervalo `366a60f056eb086b1cacd1955ad2d02d36f9ddfa912f3d5c31a0dd73b7c97c79`:

~~~~typescript

export const send = Effect.fn("ActionsAuthoring.send")(function* (services: Services, binding: Actions.Binding, plan: Plan) {
  yield* actor(services, binding)
  const response = yield* services.transport.request(binding, plan.request).pipe(Effect.mapError((cause) => {
    const disposition = cause.disposition === "definitely_unsent" || cause.disposition === "definitely_rejected" ? cause.disposition : "unknown"
    return error(binding, disposition === "unknown" ? "outcome_unknown" : cause.kind, "Source provider write failed", disposition)
  }))
  if (response.status !== plan.status) {
    if ([400, 401, 403, 404, 409, 422, 429].includes(response.status)) {
      const failure = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
      return yield* error(binding, failure.kind, "Source provider write was rejected", "definitely_rejected")
    }
    return yield* error(binding, "outcome_unknown", "Source write returned an unqualified native status", "unknown")
  }
  return yield* after(binding, plan.acknowledge(response))
})
~~~~


### `packages/core/src/actions/authoring/lint.ts`

Archive: `sources/packages/core/src/actions/authoring/lint.ts` · bytes: 2071 · Git blob: `dca58f1b7cf7eaa4b4afdb25f18bb4ec9234d868` · SHA256: `35372e153a34ae76a23bc8d631ca762c169994db3a1d452c4e4ceb8f2920d5cc`.


Linhas **13–21**; SHA256 do intervalo `628d8cac78051fd671afad64c3e24ae30ba6fb08dd739ba3d1c75bd49d1b51ea`:

~~~~typescript
): Effect.fn.Return<Actions.Graph, ActionsError> {
  // CI lint is an explicit user-requested computation, not a durable mutation or a dry-run pipeline.
  const root = yield* guard(binding, () => ActionsGitLabNative.projectPath(binding))
  const result = yield* services.transport.request(binding, {
    method: "POST", path: `${root}/ci/lint`,
    body: { content: source.text, include_jobs: false, dry_run: false },
  }).pipe(Effect.map((response) => response.status === 200 ? Schema.decodeUnknownOption(Lint)(response.data) : Option.none()),
    Effect.catch(() => Effect.succeed(Option.none())))
  const report = diagnostics()
~~~~


## A15 — Admissão durável da intenção

Vínculo: `body.md` §3; archive de evidência: `evidence.md`, seção `A15`.


### `packages/core/src/actions/operations.ts`

Archive: `sources/packages/core/src/actions/operations.ts` · bytes: 12124 · Git blob: `83c0b9e03b063bd59bc2d30317f7de85cbb99ee4` · SHA256: `f4180bfeabef99c0eaddace3f1da7242fb8dacd7d63fb948b84cc014f59a89d4`.


Linhas **83–101**; SHA256 do intervalo `51c8ba75a4365ca2aa253bbdadd500ecba79048bf17b015546765e5082983c3c`:

~~~~typescript
      if (existing) {
        if (!matches(existing, binding) || !equivalent(intent(existing), decoded))
          return yield* Effect.fail(error("intent_conflict", "Actions logical intent was already bound to another command", existing.id))
        const expired = unavailable(existing, now)
        if (expired) return yield* Effect.fail(expired)
        return receipt(existing)
      }
      const ledger = yield* tx.select({ total: count() }).from(ActionsOperationTable).get()
      if (!ledger || ledger.total >= LEDGER_LIMIT)
        return yield* Effect.fail(error("maintenance_required", "Actions admission ledger requires maintenance"))
      const unknown = yield* tx.select({ total: count() }).from(ActionsOperationTable)
        .where(eq(ActionsOperationTable.state, "outcome_unknown")).get()
      if (!unknown || unknown.total >= UNKNOWN_LIMIT)
        return yield* Effect.fail(error("maintenance_required", "Actions unknown outcome storage requires maintenance"))
      const inserted = yield* tx.insert(ActionsOperationTable).values({
        id: Actions.OperationID.create(),
        location_key: location,
        project_id: input.projectID,
        directory,
~~~~


### `packages/core/src/actions/operations/sql.ts`

Archive: `sources/packages/core/src/actions/operations/sql.ts` · bytes: 1580 · Git blob: `63cad8cb4926acd4adc6c285bd6b1f1f64a238cc` · SHA256: `07f2de775a5e5352859f1bf041e32865b3681ec2db85fd4e367823fe2a00da75`.


Linhas **27–35**; SHA256 do intervalo `583fdd02cb072b4c5f35857d46168a685fdeb03e8b51d4d03b2d0fb842e25f36`:

~~~~typescript
    result: text({ mode: "json" }).$type<Actions.Operation["result"]>(),
    reason: text(),
  },
  (table) => [
    uniqueIndex("actions_operation_location_binding_client_idx").on(table.location_key, table.binding_id, table.client_id),
    index("actions_operation_state_expires_idx").on(table.state, table.time_expires),
    index("actions_operation_state_updated_idx").on(table.state, table.time_updated),
  ],
)
~~~~


## A16 — CAS, limite de execução e recuperação sem replay

Vínculo: `body.md` §3; archive de evidência: `evidence.md`, seção `A16`.


### `packages/core/src/actions/operations.ts`

Archive: `sources/packages/core/src/actions/operations.ts` · bytes: 12124 · Git blob: `83c0b9e03b063bd59bc2d30317f7de85cbb99ee4` · SHA256: `f4180bfeabef99c0eaddace3f1da7242fb8dacd7d63fb948b84cc014f59a89d4`.


Linhas **138–165**; SHA256 do intervalo `a38d4d5955bdf0e9ce3dcb97a51a6ddaafecc8fd0a60dfc203eac7ed19067727`:

~~~~typescript
      // Register before the durable claim so disposal cannot race the CAS/cleanup
      // handoff. This fiber remains the caller's request, never a shared worker.
      lifetime.requests.add(fiber)
      return yield* Effect.gen(function* () {
        if (lifetime.closed) return yield* Effect.fail(error("binding_missing", "Actions operation Location was disposed"))
        const claimed = yield* safe(database.db.transaction((tx) => Effect.gen(function* () {
          if (lifetime.closed) return yield* Effect.fail(error("binding_missing", "Actions operation Location was disposed"))
          // Sample time after acquiring SQLite's write reservation, not before
          // waiting for it. A lease may expire while the request waits to claim.
          const claimTime = yield* Clock.currentTimeMillis
          return yield* tx.update(ActionsOperationTable).set({ state: "sending", time_updated: claimTime })
            .where(and(
              eq(ActionsOperationTable.id, row.id), eq(ActionsOperationTable.location_key, location),
              eq(ActionsOperationTable.binding_id, binding.id), eq(ActionsOperationTable.binding_revision, binding.revision),
              eq(ActionsOperationTable.actor, row.actor), eq(ActionsOperationTable.state, "prepared"),
              gt(ActionsOperationTable.time_expires, claimTime),
            )).returning().get()
        }), { behavior: "immediate" }))
        if (!claimed) return yield* get(binding, row.id)
        yield* restore(Effect.suspend(() => lifetime.closed ? Effect.interrupt : perform(intent(claimed), submission.input)).pipe(
          Effect.flatMap(checkedAcknowledgement),
          Effect.scoped,
          Effect.timeout(DEADLINE),
          Effect.raceFirst(Deferred.await(disposed).pipe(Effect.andThen(Effect.interrupt))),
          Effect.catchCause((cause) => Cause.hasInterrupts(cause)
            ? Effect.interrupt
            : Effect.fail(definitive(cause) ?? error("outcome_unknown", "Actions provider outcome was not established", row.id))),
        )).pipe(Effect.onExit((exit) => finalize(database.db, row.id, exit)))
~~~~


### `packages/core/src/actions/operations/storage.ts`

Archive: `sources/packages/core/src/actions/operations/storage.ts` · bytes: 7588 · Git blob: `d7633da87c8fe5b41319e23c6ca9e9092d152e4e` · SHA256: `433462cdc96bbeda49a85f46e9c96954cee753822165329caac5c26c748ff2b4`.


Linhas **88–99**; SHA256 do intervalo `7843d98ac19a6e979df626a1fc5847f98f21c706e6b46a0b2d3aa26568291cc4`:

~~~~typescript
    yield* db.update(ActionsOperationTable).set({ state: "expired", time_updated: now, result: null, reason: LEASE_EXPIRED }).where(
      and(eq(ActionsOperationTable.state, "prepared"), lte(ActionsOperationTable.time_expires, now)),
    ).run()
    // Keep the admission key and intent forever. Deleting a receipt would allow
    // a delayed prepare with the same logical intent to issue another command.
    yield* db.update(ActionsOperationTable).set({ state: "expired", result: null, reason: RECEIPT_EXPIRED }).where(and(
      inArray(ActionsOperationTable.state, ["accepted", "confirmed", "rejected"]),
      lte(ActionsOperationTable.time_updated, now - RETENTION),
    )).run()
  })

// Database identity outlives Location services. Rebuilding a Location must never
~~~~


## A17 — Reconciliação exata e seus limites

Vínculo: `body.md` §3; archive de evidência: `evidence.md`, seção `A17`.


### `packages/core/src/actions/readback.ts`

Archive: `sources/packages/core/src/actions/readback.ts` · bytes: 2118 · Git blob: `26e01af0e8dad921d4f7a408e2642a851da3903d` · SHA256: `891d45078014fc821bba1a9ea69e68b4a822545e79cf1e5ee5f9f0bcc86acac2`.


Linhas **14–35**; SHA256 do intervalo `55f253871675d48a8e41279ea68aebb77c6ea5c82cb3f0916cc324992ef2646d`:

~~~~typescript
  // Unattributed dispatch cannot be recovered by guessing a nearby run.
  if (acknowledged?.unattributed || !acknowledged?.runID) return { state: "pending" }
  const run = yield* reader.run(binding, acknowledged.runID)
  if (intent.expected?.commit && run.commit !== intent.expected.commit) return { state: "pending" }
  if (intent.target.runID && run.id !== intent.target.runID) return { state: "pending" }
  if (intent.kind === "workflow.dispatch") {
    if (intent.target.workflowID && run.workflowID !== intent.target.workflowID) return { state: "pending" }
    if (intent.target.ref && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(intent.target.ref) &&
      run.ref !== intent.target.ref.replace(/^refs\/heads\//, "")) return { state: "pending" }
    if (intent.target.ref && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(intent.target.ref) &&
      run.commit.toLowerCase() !== intent.target.ref.toLowerCase()) return { state: "pending" }
    if (run.event !== "workflow_dispatch" && binding.provider.kind === "github") return { state: "pending" }
    return { state: "confirmed", acknowledgement: acknowledged }
  }
  if ((intent.kind === "run.retry" || intent.kind === "run.retryFailed") && acknowledged.attempt !== undefined &&
    run.attempt !== undefined && run.attempt >= acknowledged.attempt)
    return { state: "confirmed", acknowledgement: acknowledged }
  if ((intent.kind === "run.cancel" || intent.kind === "run.forceCancel") &&
    (run.conclusion === "cancelled" || run.status === "canceled"))
    return { state: "confirmed", acknowledgement: acknowledged }
  return { state: "pending" }
})
~~~~


## A18 — Dispatch GitHub, autoridade e inputs

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A18`.


### `packages/core/src/actions/github/commands/common.ts`

Archive: `sources/packages/core/src/actions/github/commands/common.ts` · bytes: 13052 · Git blob: `e9ee98a334dd701d076a29900dc47ccdba7a3f01` · SHA256: `b1a6b5b2081d754e5b57f93fadaf56153ca38d133450a05e3c7145bcbf21cfa7`.


Linhas **84–98**; SHA256 do intervalo `ef58b648235f7e516d1fe79ecd020f704a569ac3cd8279f691ab79e9252dec24`:

~~~~typescript
  const scopes = response.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
  if (scopes?.length && !scopes.includes("repo") && !(native.private === false && scopes.includes("public_repo")))
    return yield* fail(binding, "permission_denied", "Observed classic OAuth scopes deny repository writes")
  // Missing scope/role evidence stays unknown. Native authorization decides this
  // explicit command; no available write capability or fine-grained role is invented.
  return { root, native, headers: response.headers }
})

const actor = Effect.fn("ActionsGitHubCommands.actor")(function* (services: Services, binding: Actions.Binding) {
  if (!binding.account) return yield* fail(binding, "binding_stale", "GitHub binding has no verified actor account")
  const user = yield* get(services, binding, "user")
  const account = yield* guard(binding, () => GitHubNative.decode(binding, Account, user.data, "signed-in account"), "not_authenticated")
  if (account.login.toLowerCase() !== binding.account.toLowerCase())
    return yield* fail(binding, "binding_stale", "GitHub signed-in account changed after command admission")
})
~~~~


### `packages/core/src/actions/github/commands/workflow.ts`

Archive: `sources/packages/core/src/actions/github/commands/workflow.ts` · bytes: 6811 · Git blob: `bc9677ced86d82f08db5a38ae948bcca3b1406eb` · SHA256: `7330ca26082e22e8a81c89285afc18002903188555c96d1d60565fae993f7b2f`.


Linhas **31–47**; SHA256 do intervalo `d57f9d750039362cebecb112c60aaf767bba429f888f2a49538781baabaee8ad`:

~~~~typescript
  }, "source_unresolved")
  const inputs = yield* GitHubCommandCommon.guard(binding, () => GitHubDispatchInputs.values(binding, definitions, input.inputs))
  yield* Effect.forEach(Object.entries(definitions).filter(([name, definition]) => definition.type === "environment" && Object.hasOwn(inputs, name)), ([name]) => Effect.gen(function* () {
    const target = yield* GitHubCommandCommon.guard(binding, () => {
      const value = inputs[name]
      if (typeof value !== "string" || !value || value.length > 255 || value !== value.trim() || /[\\%{}:\x00-\x1f\x7f]/.test(value) || value.split("/").some((part) => !part || part === "." || part === ".."))
        throw GitHubCommandCommon.fail(binding, "invalid_input", "Environment input requires an exact native environment name")
      return { value, segment: encodeURIComponent(value) }
    })
    const response = yield* GitHubCommandCommon.get(services, binding, `${repository.root}/environments/${target.segment}`)
    yield* GitHubCommandCommon.guard(binding, () => {
      const environment = GitHubNative.decode(binding, Schema.Struct({ id: GitHubNative.ID, name: Schema.NonEmptyString }), response.data, "environment")
      if (environment.name.toLowerCase() !== target.value.toLowerCase()) throw GitHubCommandCommon.fail(binding, "source_conflict", "Native environment identity changed during preflight")
    })
  }))
  const response = yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${repository.root}/actions/workflows/${workflow.id}/dispatches`, body: { ref: input.ref, inputs } }, [200, 204])
  if (response.status === 204) return { acknowledgement: { unattributed: true } }
~~~~


## A19 — Run/job GitHub: elegibilidade e acknowledgment

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A19`.


### `packages/core/src/actions/github/commands/run.ts`

Archive: `sources/packages/core/src/actions/github/commands/run.ts` · bytes: 4900 · Git blob: `20a65fe64b3559988856c829670ebb82296f9113` · SHA256: `a54d15a5e3870a09fc98708de4ee41aa09acaf2175b6d9c9e0e4249e6646fe78`.


Linhas **21–35**; SHA256 do intervalo `9c5befef4cd68365563258a8e1cbff3d23f572024290221ffe514c4996822949`:

~~~~typescript
  if (intent.kind === "run.retry" || intent.kind === "run.retryFailed") {
    if (run.status !== "completed" || (intent.kind === "run.retryFailed" && !["failure", "cancelled", "timed_out"].includes(run.conclusion ?? "")))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native run is not eligible for the admitted retry mode")
    yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${target}/${intent.kind === "run.retry" ? "rerun" : "rerun-failed-jobs"}`,
      body: debug === undefined ? {} : { enable_debug_logging: debug } }, [201, 204])
    // The admitted run is known; the newly-created attempt is not returned here.
    return { acknowledgement: { runID: id } }
  }
  if (intent.kind === "run.cancel" || intent.kind === "run.forceCancel") {
    if (run.status === null || !active.has(run.status))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native run is not in a cancelable execution state")
    if (intent.kind === "run.forceCancel" && (binding.provider.hostname !== "github.com" || binding.provider.apiOrigin !== "https://api.github.com" || repository.headers["x-github-api-version-selected"] !== "2026-03-10"))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native force-cancel route has no observed supported host/API-version evidence")
    yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${target}/${intent.kind === "run.cancel" ? "cancel" : "force-cancel"}` }, [202])
    return { acknowledgement: { runID: id } }
~~~~


### `packages/core/src/actions/github/commands/job.ts`

Archive: `sources/packages/core/src/actions/github/commands/job.ts` · bytes: 2482 · Git blob: `01828a587ca7443e08fc0ecdcff55bf1ebeca863` · SHA256: `b753ad05386cd13df639a4000b7fd35db4db8431e66f1ab27633acdbeb314591`.


Linhas **24–33**; SHA256 do intervalo `cd537bc089a8ff5384a6c1105f4a46341bef23c54109546e49398a1dff7e22f9`:

~~~~typescript
  if (job.run_attempt === undefined) return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native job attempt was not observed")
  if (job.run_attempt !== run.attempt || job.head_sha.toLowerCase() !== run.commit.toLowerCase())
    return yield* GitHubCommandCommon.fail(binding, "source_conflict", "Native job source or attempt is stale")
  if (job.status !== "completed" || run.status !== "completed")
    return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native job/run is not terminal for retry")
  yield* GitHubCommandCommon.historical(services, binding, intent, run)
  yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${repository.root}/actions/jobs/${id}/rerun`,
    body: debug === undefined ? {} : { enable_debug_logging: debug } }, [201, 204])
  return { acknowledgement: { jobID: id, runID: String(job.run_id) } }
})
~~~~


## A20 — GitLab: plano, role, dispatch e trigger

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A20`.


### `packages/core/src/actions/gitlab/commands/native.ts`

Archive: `sources/packages/core/src/actions/gitlab/commands/native.ts` · bytes: 5006 · Git blob: `96c48f417a9df123e151215ff757186932fe1895` · SHA256: `ceac62595d8c7647e4a4277dbc893f9f7c4a71faada7fc50b1614a4474cdfc63`.


Linhas **25–38**; SHA256 do intervalo `6107e0a880ec1bd18e13fd0369e72380e7823ce0a28d23ba9fec19d4380e1d32`:

~~~~typescript
export function make(transport: ActionsContract.Transport) {
  const read = ActionsGitLabNative.make(transport)
  return { ...read,
    project: Effect.fn("ActionsGitLabCommands.project")(function* (binding: Actions.Binding) {
      const response = yield* read.get(binding, ActionsGitLabNative.projectPath(binding))
      return yield* ActionsGitLabNative.checked(binding, () => {
        const project = GitLabCommandShared.native(binding, Project, response.data)
        if (String(project.id) !== binding.projectID) throw GitLabCommandShared.error(binding, "binding_stale", "GitLab native project differs from the admitted project")
        return project
      })
    }),
    ref: Effect.fn("ActionsGitLabCommands.ref")(function* (binding: Actions.Binding, ref: string) {
      const response = yield* read.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/branches/${encodeURIComponent(ref)}`)
        .pipe(Effect.catch((error) => error.kind === "not_found"
~~~~


### `packages/core/src/actions/gitlab/commands/launch.ts`

Archive: `sources/packages/core/src/actions/gitlab/commands/launch.ts` · bytes: 4234 · Git blob: `69db848d7513a074b960851e27c12a39438ebd47` · SHA256: `444fe50cc00d0aaed2895b18ca25e11baca9fe281a917c0260674b5449540579`.


Linhas **33–52**; SHA256 do intervalo `9401b67cf47132aaadb3db1e53a305a56e6948861277b7bd3f9e2df79d4cbcae`:

~~~~typescript
      if (!path || !ActionsGitLabNative.localPath(path)) return yield* GitLabCommandShared.error(binding, "source_unresolved", "GitLab explicit input/source preconditions require resolved local CI configuration")
      const source = yield* GitLabCommandShared.source(binding, intent, input.reader, sha, path)
      if (!source) return yield* GitLabCommandShared.error(binding, "source_unresolved", "GitLab launch did not establish ref-bound source")
      yield* GitLabCommandInputs.check(binding, input.transport, source, command.inputs)
    }
    const body = yield* ActionsGitLabNative.checked(binding, () => {
      if ("token" in command) return GitLabCommandShared.json(binding, { ref: command.ref, token: command.token,
        ...(command.variables === undefined ? {} : { variables: command.variables }), ...(command.inputs === undefined ? {} : { inputs: command.inputs }) })
      if (command.variables && new Set(command.variables.map((variable) => variable.key)).size !== command.variables.length)
        throw GitLabCommandShared.error(binding, "invalid_input", "GitLab pipeline variables must have distinct native keys")
      return GitLabCommandShared.json(binding, { ref: command.ref,
        ...(command.variables === undefined ? {} : { variables: command.variables.map((variable) => ({ key: variable.key, value: variable.value,
          ...(variable.variable_type === undefined ? {} : { variable_type: variable.variable_type }) })) }),
        ...(command.inputs === undefined ? {} : { inputs: command.inputs }) })
    })
    return { request: { method: "POST", path: `${ActionsGitLabNative.projectPath(binding)}/${"token" in command ? "trigger/pipeline" : "pipeline"}`, body },
      statuses: [201], acknowledge: (response) => ActionsGitLabNative.checked(binding, () => GitLabCommandShared.pipeline(binding, response.data,
        { commit: sha, ref: command.ref, sources: "token" in command ? ["trigger", "pipeline"] : ["api"] })) }
  })
}
~~~~


## A21 — GitLab: inputs autoritativos e merge request

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A21`.


### `packages/core/src/actions/gitlab/commands/inputs.ts`

Archive: `sources/packages/core/src/actions/gitlab/commands/inputs.ts` · bytes: 4814 · Git blob: `12ba907ddadcd0103fa07da0eeabe7bede5fc9f5` · SHA256: `c1f72bbe27861b2f51e5f0fa2fe67bcbca6f48d2a7c0b08acd451395c9ab476f`.


Linhas **15–28**; SHA256 do intervalo `05d1cc6d5ae32a53734c2b774aeb16d677443d007fbb5d2f78fa491b5cc5ad46`:

~~~~typescript
const Header = Schema.Struct({ spec: Schema.Struct({ inputs: Schema.optional(Schema.Record(Schema.String, Schema.NullOr(Input))) }) })

export const check = Effect.fn("ActionsGitLabCommands.inputs")(function* (
  binding: Actions.Binding, transport: ActionsContract.Transport, source: Actions.Source, supplied?: Readonly<Record<string, ActionsContract.Json>>,
) {
  const values = yield* ActionsGitLabNative.checked(binding, () => validate(binding, source, supplied))
  if (supplied !== undefined) {
    const native = ActionsGitLabNative.make(transport)
    const observation = yield* native.metadata(binding)
    // API inputs: 17.10 feature-flagged; 18.1 GA. No client-version or flag guesses.
    // https://docs.gitlab.com/api/pipelines/#create-a-new-pipeline
    // https://gitlab.com/gitlab-org/gitlab/-/blob/v18.1.0-ee/lib/api/ci/helpers/pipelines_helpers.rb
    yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.requireVersion(binding, observation, [18, 1], "pipeline inputs"))
  }
~~~~


### `packages/core/src/actions/gitlab/commands/merge-request.ts`

Archive: `sources/packages/core/src/actions/gitlab/commands/merge-request.ts` · bytes: 4177 · Git blob: `38a983b2834d42964934b1699b17d92637e8fab8` · SHA256: `4db4f1c18a91be6292d2b8a10c493ffe81a5893036f45b8fdee62a3e40b000b1`.


Linhas **21–32**; SHA256 do intervalo `6a10e7b7c906e605cb610d82250123467538961ba3e3c05ad7ee4927f8651853`:

~~~~typescript
    const path = `${ActionsGitLabNative.projectPath(binding)}/merge_requests/${iid}`
    const response = yield* native.get(binding, path)
    const mr = yield* ActionsGitLabNative.checked(binding, () => {
      const value = GitLabCommandShared.native(binding, GitLabCommandNative.MergeRequest, response.data)
      if (String(value.iid) !== iid || String(value.project_id) !== binding.projectID || String(value.target_project_id) !== binding.projectID)
        throw GitLabCommandShared.error(binding, "binding_stale", "GitLab merge request IID does not belong to the admitted native project")
      if (value.state !== "opened") throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab merge request pipeline requires an open native merge request")
      if (String(value.source_project_id) !== binding.projectID)
        throw GitLabCommandShared.error(binding, "source_unresolved", "Fork merge request execution requires separate native source-project placement proof")
      GitLabCommandShared.commit(binding, intent, value.sha, value.source_branch)
      return value
    })
~~~~


## A22 — Run/job GitLab: sem equivalências GitHub

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A22`.


### `packages/core/src/actions/gitlab/commands/runs.ts`

Archive: `sources/packages/core/src/actions/gitlab/commands/runs.ts` · bytes: 3685 · Git blob: `999c7e5cd6c6d8d33cbe63ad601923b308eff3e4` · SHA256: `0c210556925c4d2f025c6942b2512e8ab782ae748aa51b0336dde859c441ec30`.


Linhas **21–26**; SHA256 do intervalo `ccb8710e06e66eb57e42771f4f60dc5bb628fd468821444f39184e1815bab248`:

~~~~typescript
    const project = yield* native.project(binding)
    const level = yield* ActionsGitLabNative.checked(binding, () => GitLabCommandNative.role(binding, project, intent.kind === "run.delete" ? 50 : 30))
    if (intent.kind === "run.rename") {
      const observation = yield* native.metadata(binding)
      // https://gitlab.com/gitlab-org/gitlab/-/blob/v18.4.0-ee/lib/api/ci/pipelines.rb
      yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.requireVersion(binding, observation, [16, 6], "pipeline name metadata"))
~~~~


Linhas **37–45**; SHA256 do intervalo `a0ed7437d7344a71314498064c61803d61024f1fb5ef6562447caa64416f5f3a`:

~~~~typescript
    if (intent.kind === "run.delete") return { request: { method: "DELETE", path }, statuses: [204],
      acknowledge: (response) => ActionsGitLabNative.checked(binding, () => {
        if (response.data !== null) throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab deletion did not return an exact native empty acknowledgement", true)
        return { runID: run.id }
      }) }
    return { request: { method: name === undefined ? "POST" : "PUT", path: `${path}/${name === undefined ? intent.kind === "run.retry" ? "retry" : "cancel" : "metadata"}`,
      ...(name === undefined ? {} : { body: { name } }) }, statuses: intent.kind === "run.retry" ? [200, 201] : [200],
      acknowledge: (response) => ActionsGitLabNative.checked(binding, () => GitLabCommandShared.pipeline(binding, response.data,
        { id: run.id, commit: run.commit, sources: [run.event], ref: run.ref, name })) }
~~~~


### `packages/core/src/actions/gitlab/commands/jobs.ts`

Archive: `sources/packages/core/src/actions/gitlab/commands/jobs.ts` · bytes: 11307 · Git blob: `176a10632f895603fc8cc2b7baef1327db90377e` · SHA256: `0e59d1b73ef755e2e29d0e0dcb829c127f9cc6b642773c973510afe5d3e0f310`.


Linhas **55–68**; SHA256 do intervalo `0a437cb55208c14eb9aa5668e1e16db81e7cdc2a434bc7ab1037c64e7de48c73`:

~~~~typescript
      if (intent.kind === "job.retry" && !["success", "failed", "canceled"].includes(status ?? ""))
        throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab job retry requires an observed finished retryable job")
      if (intent.kind === "job.erase" && (!GitLabCommandShared.terminal.includes(status ?? "") || detail?.erased_at))
        throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab erase requires a terminal, non-archived, unerased job")
      if (intent.kind === "job.cancel") GitLabCommandNative.cancellation(binding, project, level)
      return detail
    })
    if (intent.kind === "job.erase" && level < 40) {
      if (!job || job.user?.username !== binding.account) return yield* GitLabCommandShared.error(binding, "permission_denied", "GitLab erase requires Maintainer access or the job's unprotected-ref creator")
      const ref = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/branches/${encodeURIComponent(job.ref)}`)
      yield* ActionsGitLabNative.checked(binding, () => {
        const branch = GitLabCommandShared.native(binding, Schema.Struct({ ...GitLabCommandNative.Ref.fields, protected: Schema.Boolean }), ref.data)
        if (branch.name !== job.ref || branch.protected) throw GitLabCommandShared.error(binding, "permission_denied", "GitLab developer-owned erase requires a proved unprotected native ref")
      })
~~~~


## A23 — Recursos, versão e fases parciais

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A23`.


### `packages/core/src/actions/resources.ts`

Archive: `sources/packages/core/src/actions/resources.ts` · bytes: 3620 · Git blob: `7d4d4c2248900819af4ace7731982ede0f67179f` · SHA256: `cb6e5bc0a32a104f697459fb39550b0ae12dc6f68c94d38364fff903d6726b94`.


Linhas **29–46**; SHA256 do intervalo `e7914228ef73e88d1241f5f8f99ae2942c66cf31c23f6b34f575c390f3fb309a`:

~~~~typescript
    const { ActionsResourceGraphQL } = yield* Effect.promise(() => import("./resources/gitlab-graphql"))
    const graphql = ActionsResourceGraphQL.make(input.directory, input.proc)
    if (kind === "runners") {
      const { ActionsRunners } = yield* Effect.promise(() => import("./resources/runners"))
      return ActionsRunners.make({ ...services, graphql })
    }
    if (kind === "caches") {
      const { ActionsCaches } = yield* Effect.promise(() => import("./resources/caches"))
      return ActionsCaches.make({ ...services, graphql })
    }
    if (kind === "schedules") {
      const { ActionsSchedules } = yield* Effect.promise(() => import("./resources/schedules"))
      const { ActionsAuthoring } = yield* Effect.promise(() => import("./authoring/index"))
      const authoring = ActionsAuthoring.make(services)
      return ActionsSchedules.make({ ...services, publish: (binding, intent, source, text) => authoring.perform(binding, {
        ...intent, kind: "source.write", target: { path: source.path, ref: source.ref },
        expected: { commit: source.commit, sourceVersion: source.version },
      }, { provider: binding.provider.kind, mode: "update", text, message: "Update workflow schedule" }) })
~~~~


### `packages/core/src/actions/resources/native.ts`

Archive: `sources/packages/core/src/actions/resources/native.ts` · bytes: 13033 · Git blob: `948787643b01ec9d52340a7b5e913b6ca071749d` · SHA256: `a53465358378f169c381ca67f90597976732655e9da173bb8125df7601f101e1`.


Linhas **138–150**; SHA256 do intervalo `6df9ee03f2174457dd73daa749bd955432d161f318d58473ebdfb75bc5c2122c`:

~~~~typescript
// Snapshot versions cover decoded, explicitly selected metadata, never enrollment secrets.
export function version(value: ActionsContract.Json) {
  const canonical = (item: ActionsContract.Json): string => item !== null && typeof item === "object"
    ? Array.isArray(item) ? `[${item.map(canonical).join(",")}]`
      : `{${Object.entries<ActionsContract.Json>(item).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`).join(",")}}`
    : JSON.stringify(item)
  return `native:${createHash("sha256").update(canonical(value)).digest("hex")}`
}

export function requireVersion(binding: Actions.Binding, intent: Actions.OperationIntent, current: string) {
  if (intent.expected?.resourceVersion !== undefined && intent.expected.resourceVersion !== current)
    throw error(binding, "source_conflict", "Native resource metadata changed after admission")
~~~~


### `packages/core/src/actions/resources/config-common.ts`

Archive: `sources/packages/core/src/actions/resources/config-common.ts` · bytes: 12418 · Git blob: `091480332aea03f03b8ab3cfcd21dfbe8b27fa84` · SHA256: `aee5e20b10091ab8c4c20daf21c72e45a583e7cfc162b0a5e5e162a61e5b7afd`.


Linhas **153–169**; SHA256 do intervalo `aa196df6ea769cf7f0cbcb40484e3ae4e0e1acf551e5b2dc4254476ed5143d41`:

~~~~typescript
  yield* actor(services, binding)
  const response = yield* services.transport.request(binding, request).pipe(Effect.mapError((error) =>
    fail(binding, error.disposition === "definitely_unsent" || error.disposition === "definitely_rejected" ? error.kind : "outcome_unknown",
      "Provider configuration write failed", error.disposition ?? "unknown", error.retryAfter)))
  if (statuses.includes(response.status)) return response
  const rejected = [400, 401, 403, 404, 409, 412, 422, 429].includes(response.status)
  return yield* fail(binding, rejected ? httpKind(response.status) : "outcome_unknown", `Provider configuration write returned HTTP ${response.status}`,
    rejected ? "definitely_rejected" : "unknown")
})

export const stages = Effect.fn("ActionsConfig.stages")(function* (services: Services, binding: Actions.Binding,
  requests: readonly { request: ActionsContract.Request; statuses: readonly number[]; phase: string }[]) {
  yield* Effect.forEach(requests, (stage, index) => send(services, binding, stage.request, stage.statuses).pipe(
    Effect.mapError((error) => index === 0 ? fail(binding, error.kind, `Environment phase '${stage.phase}' failed (${error.kind})`, error.disposition ?? "unknown", error.retryAfter)
      : fail(binding, "outcome_unknown", `Environment configuration partially applied; phase '${stage.phase}' failed (${error.kind}); read back before another operation`, "unknown", error.retryAfter)),
  ), { concurrency: 1, discard: true })
})
~~~~


## A24 — Variables/secrets: scope, redaction e criptografia

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A24`.


### `packages/core/src/actions/resources/variables.ts`

Archive: `sources/packages/core/src/actions/resources/variables.ts` · bytes: 17420 · Git blob: `2b8bf42f1867f93bd05188893c5a1d49fa6b0c93` · SHA256: `4483cec419b1ac22628dd01c1386b9470fcd5511b2d0cd9a956b9736cfc2ca4e`.


Linhas **40–53**; SHA256 do intervalo `b96fdb7c1d63fd76f762a6dfba6ac92d928209549cc57247fe9984eafc69dff0`:

~~~~typescript
      }
      const scope = frozen.scope ?? "Repository"
      const path = yield* githubScope(services, binding, project.path, scope)
      const page = yield* ActionsVariableGitHubPage.list(services, binding, { ...frozen, scope }, path)
      return yield* C.guard(binding, () => {
        return { items: page.rows.map((item) => githubResource(binding, item, scope)).filter((item) =>
          (frozen.resourceID === undefined || item.name === frozen.resourceID) && (frozen.query === undefined || item.name.includes(frozen.query))),
          ...(page.next === undefined ? {} : { next: page.next }), capturedAt: page.capturedAt }
      })
    }),
    perform: Effect.fn("ActionsVariables.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* C.guard(binding, () => {
        const capture = C.capture(binding, intent, "variables")
        const input = C.decode(binding, intent.kind === "resource.delete" ? Delete : Form, structuredClone(payload))
~~~~


Linhas **189–207**; SHA256 do intervalo `7c2390cd9dcae2d4cd4df1a06036144630577d2063e411fc7247edbe14676644`:

~~~~typescript
    return yield* C.fail(binding, "capability_unavailable", "GitLab hidden is create-only; existing hiding state must be retained")
  const masked = input.masked ?? (input.type === "Secret")
  if (input.type === "Secret" && !masked && !input.hidden) return yield* C.fail(binding, "invalid_input", "GitLab has no independent Secret type; Secret requires masked or hidden controls")
  if (input.hidden && !masked) return yield* C.fail(binding, "invalid_input", "GitLab hidden creation requires masked_and_hidden")
  if (!existing && input.hidden) {
    const response = yield* C.get(services, binding, { method: "GET", path: "metadata" })
    const native = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ version: C.Text }), response.data, true))
    const version = /^(\d+)\.(\d+)\.(\d+)(?:-(?:ee|ce))?$/.exec(native.version)
    if (!version || Number(version[1]) < 17 || (Number(version[1]) === 17 && Number(version[2]) < 4))
      return yield* C.fail(binding, "capability_unavailable", "Hidden variable creation requires observed GitLab 17.4 or newer")
  }
  yield* C.send(services, binding, { method: existing ? "PUT" : "POST", path: existing ? `${collection}/${encodeURIComponent(input.name)}` : collection,
    ...(existing ? { query } : {}), body: { ...(existing ? {} : { key: input.name }), value: input.value, environment_scope: input.scope,
      protected: input.protected ?? existing?.protected ?? false, masked,
      ...(input.hidden && !existing ? { masked_and_hidden: true } : {}),
      variable_type: existing?.variable_type ?? "env_var", ...(existing?.raw === undefined ? {} : { raw: existing.raw }) } }, [200, 201])
  // GitLab echoes values after writes. Only admitted native identity may leave this callback.
  return { acknowledgement: { resourceID: input.name } }
})
~~~~


## A25 — Environments e reviewers representáveis

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A25`.


### `packages/core/src/actions/resources/config-environment-reviewers.ts`

Archive: `sources/packages/core/src/actions/resources/config-environment-reviewers.ts` · bytes: 2604 · Git blob: `9110df8c9a839c9db3476ecdfbfe6e9d9955bc6e` · SHA256: `64222df345434d4400ec50653b25f03b94252d2bf0ecee5a8090ffa24f34c65e`.


Linhas **8–21**; SHA256 do intervalo `c5baec12185debe408b09260b7a140e4e3edbfb02506fe165af3a0df799b06f0`:

~~~~typescript

export const read = Effect.fn("ActionsEnvironmentReviewers.read")(function* (services: ActionsConfigCommon.Services,
  binding: Actions.Binding, policies: readonly (typeof ActionsEnvironmentSchema.Protected.Type)[], name: string) {
  const matching = policies.filter((policy) => ActionsEnvironmentGitLab.matches(policy.name, name))
  if (matching.some((policy) => policy.name.includes("*"))) return { reviewersReadOnly: true }
  const exact = matching.filter((policy) => policy.name === name)
  if (exact.length !== 1) return { reviewersReadOnly: true }
  const policy = exact[0]
  if (policy.required_approval_count !== undefined && policy.approval_rules === undefined && policy.required_approval_count !== 0)
    return { reviewersReadOnly: true }
  const rules = policy.approval_rules ?? []
  if (rules.length > 6 || rules.some((rule) => rule.user_id == null || rule.group_id != null || rule.access_level != null || rule.required_approvals !== 1))
    return { reviewersReadOnly: true }
  const ids = yield* ActionsConfigCommon.guard(binding, () => rules.map((rule) => ActionsConfigCommon.decode(binding, ActionsConfigCommon.ID, rule.user_id, true)))
~~~~


### `packages/core/src/actions/resources/config-environment-gitlab.ts`

Archive: `sources/packages/core/src/actions/resources/config-environment-gitlab.ts` · bytes: 10953 · Git blob: `610ab3c2831e40f288decfde7667af2387be313f` · SHA256: `873b53054d0e9bb1fad5a94400fefb7cbb11b96a23244cb9260e31f7e0e5f7ac`.


Linhas **25–36**; SHA256 do intervalo `0ea71ea591f5cc1f763166421421626299180af09faab8e1ec88713db23f0f71`:

~~~~typescript

export function resource(binding: Actions.Binding, environment: typeof S.GitLab.Type, protectedEnvironments: readonly (typeof S.Protected.Type)[],
  project: typeof C.Project.Type): Actions.Resource {
  const policies = protectedEnvironments.filter((item) => matches(item.name, environment.name))
  const metadata = { ...environment, protectedPolicies: policies }
  return { id: environment.name, name: environment.name, bindingID: binding.id, kind: "environments", scope: "Project", owner: "Project",
    status: environment.state, data: { ...metadata, nativeIdentity: C.identity(binding, environment.name, "Project", String(environment.id)),
      resourceVersion: JSON.stringify(metadata), ...(environment.description === undefined ? {} : { description: environment.description }),
      reviewerIdentities: policies.flatMap((policy) => (policy.approval_rules ?? []).map((rule) => ({ ...rule, policyName: policy.name }))),
      sourceUnresolved: "GitLab reviewer rules identify users, groups and roles by native ID; display names require lookup",
      refs: { state: "source_unresolved", source: "CI configuration rules", reason: "Protected environments do not enforce branch or tag patterns" },
      ...(project.allow_pipeline_trigger_approve_deployment === undefined ? {} : {
~~~~


## A26 — Deployment review e assimetria do listing

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A26`.


### `packages/core/src/actions/resources/environments.ts`

Archive: `sources/packages/core/src/actions/resources/environments.ts` · bytes: 5333 · Git blob: `bf40e7c0a1e0eb17c0ac15f64b27ccaee1203292` · SHA256: `fc92638ae218671edd85d17f5c52b3de8b899d209dda930afd3fffdab5cee9fa`.


Linhas **19–29**; SHA256 do intervalo `59518038261c0cff9a8b7c5ac8a65c6a6ee2f1de45a6b2dbd7c96832237db4e3`:

~~~~typescript
    list: Effect.fn("ActionsEnvironments.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* C.guard(binding, () => {
        const selected = C.selection(binding, input, "environments", ["resourceID", "runID", "scope"])
        if (selected.scope !== undefined && selected.scope !== (binding.provider.kind === "github" ? "Repository" : "Project"))
          throw C.fail(binding, "invalid_input", "Environment list scope must match the native project scope")
        return selected
      })
      const project = yield* C.project(services, binding)
      if (frozen.runID !== undefined) {
        if (frozen.cursor !== undefined || frozen.limit !== undefined) return yield* C.fail(binding, "invalid_input", "Pending deployment review uses a bounded native snapshot, not list pagination")
        return yield* ActionsDeploymentReview.list(services, binding, frozen.runID, frozen.resourceID)
~~~~


### `packages/core/src/actions/resources/config-deployment-review.ts`

Archive: `sources/packages/core/src/actions/resources/config-deployment-review.ts` · bytes: 9534 · Git blob: `53cd89baf0c85dfd338c6da6a119445ecb101066` · SHA256: `fcd8809b52ee73a044bc0ab61f88377cb882b72054708fa72e77771c81c5b400`.


Linhas **99–110**; SHA256 do intervalo `a6650f75d7e81999b9b482de8b037b779c929980aad40345bf013e1642d79193`:

~~~~typescript
  return { acknowledgement: { runID: frozen.runID, resourceID: frozen.name } }
})

const checkedRun = Effect.fn("ActionsEnvironments.reviewRun")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, runID: string) {
  if (!/^[1-9]\d*$/.test(runID)) return yield* C.fail(binding, "invalid_input", "Deployment review requires a native decimal run ID")
  const run = yield* services.reader.run(binding, runID).pipe(Effect.mapError((error) => C.fail(binding, error.kind, `Deployment run read failed (${error.kind})`)))
  if (run.id !== runID || run.bindingID !== binding.id || run.repositoryID !== binding.projectID)
    return yield* C.fail(binding, "binding_stale", "Reader did not prove deployment run project ownership")
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(run.commit))
    return yield* C.fail(binding, "source_unresolved", "Reader did not prove a native deployment source commit")
  return run
})
~~~~


## A27 — Policy local versus configuração remota

Vínculo: `body.md` §1, 4; archive de evidência: `evidence.md`, seção `A27`.


### `packages/core/src/actions/resources/policy.ts`

Archive: `sources/packages/core/src/actions/resources/policy.ts` · bytes: 7481 · Git blob: `17cfdc17b154c76d935cd8e99d8ea2e07f71c68b` · SHA256: `c0e90e28da9148e24a6fc56df68566122215d9ba6d1b47f6222fc4b079b425e2`.


Linhas **15–27**; SHA256 do intervalo `2d5b3bbb766e36b0c816a5eb54213d53930221f9786e2e44235c01983ba8b6c3`:

~~~~typescript
  builds_access_level: Schema.optionalKey(Schema.String), ci_config_path: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ci_pipeline_variables_minimum_override_role: Schema.optionalKey(Schema.String),
  allow_pipeline_trigger_approve_deployment: Schema.optionalKey(Schema.Boolean),
})
const Form = Schema.Struct({ provider: C.Provider,
  retention: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3650 }))),
  policy: Schema.optionalKey(Schema.Literals(["Project default", "Restricted to approved actions"])) })

export function make(services: ActionsConfigCommon.Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsPolicy.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      yield* C.guard(binding, () => {
        const frozen = C.selection(binding, input, "policy", ["resourceID", "scope"])
~~~~


## A28 — Caches e fronteira GraphQL GitLab

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A28`.


### `packages/core/src/actions/resources/caches.ts`

Archive: `sources/packages/core/src/actions/resources/caches.ts` · bytes: 13087 · Git blob: `d272111f079a5a22c09fde175c43c132e8048cca` · SHA256: `1cf002b729c4043e352d60d02a81f0aacd58d58b971bba16f834a2ab6be6b95b`.


Linhas **24–43**; SHA256 do intervalo `40070663c3f331f6717c860cc1da83cc446b6e808142d4b726797f3b36fea20c`:

~~~~typescript
        binding.provider.kind === "github" ? ["resourceID", "ref", "query", "cursor", "limit"] : []))
      const current = frozen.binding
      if (current.provider.kind === "gitlab") {
        const project = yield* ActionsGitLabNative.make(services.transport).project(current)
        return { items: [{ id: current.projectID, bindingID: current.id, kind: "caches" as const, name: "Project runner caches",
          scope: ActionsResourceNative.scope(current), data: { nativeID: current.projectID, projectID: current.projectID,
            scope: "Every cache key in this project", storage: "Runner or external object storage", inventory: "native_unavailable",
            projectWide: true, existingBlobsRetained: true, futureJobsOnly: true, resourceVersion: projectVersion(project) } }], total: 1, capturedAt: Date.now() }
      }
      const repo = yield* GitHubNative.repository(services.transport, current)
      const selected = yield* ActionsResourceNative.checked(current, () => {
        if (frozen.input.resourceID !== undefined) ActionsResourceNative.id(current, frozen.input.resourceID)
        if (frozen.input.ref !== undefined) cacheRef(current, frozen.input.ref)
        return GitHubNative.selection(current, "github.caches", { ...(frozen.input.query === undefined ? {} : { key: frozen.input.query }),
          ...(frozen.input.ref === undefined ? {} : { ref: frozen.input.ref }) }, frozen.input.cursor, frozen.input.limit)
      })
      const query = { page: selected.page, per_page: selected.per_page, ...(frozen.input.query === undefined ? {} : { key: frozen.input.query }),
        ...(frozen.input.ref === undefined ? {} : { ref: frozen.input.ref }) }
      const response = yield* ActionsResourceNative.get(services, current, `${repo.path}/actions/caches`, query)
      const measured = yield* usage(services, current)
~~~~


Linhas **68–84**; SHA256 do intervalo `4b2f908b3a9485fbb515a105bb1f262df3ec0711d4ed86028f753ae03f85fc36`:

~~~~typescript
        const project = yield* ActionsResourceNative.before(current, ActionsGitLabNative.make(services.transport).project(current))
        yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.requireVersion(current, admitted, projectVersion(project)))
        if (!services.graphql) return yield* ActionsResourceNative.error(current, "capability_unavailable", "GitLab cache clear requires bound /api/graphql transport; /api/v4/graphql is not a native endpoint")
        const response = yield* services.graphql(current, { kind: "cacheClear" }).pipe(Effect.mapError((cause) =>
          ActionsResourceNative.error(current, cause.disposition === "definitely_unsent" || cause.disposition === "definitely_rejected" ? cause.kind : "outcome_unknown",
            "GitLab cache-clear request failed", cause.disposition ?? "unknown")))
        return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const native = ActionsResourceNative.decode(current, Clear, response.data, true)
          if (response.status !== 200 || native.errors?.length || !native.data.runnerCacheClear || native.data.runnerCacheClear.errors.length)
            throw ActionsResourceNative.error(current, "outcome_unknown", "GitLab did not acknowledge project cache namespace invalidation", "unknown")
          return { acknowledgement: { resourceID: current.projectID } }
        }))
      }
      const input = yield* ActionsResourceNative.checked(current, () => {
        const value = ActionsResourceNative.input(current, Delete, frozen.payload)
        if (!admitted.target.resourceID && !value.name) throw ActionsResourceNative.error(current, "invalid_input", "GitHub cache deletion requires a native ID or exact cache key")
        if (value.ref !== undefined) cacheRef(current, value.ref)
~~~~


## A29 — Runner ownership e enrollment

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A29`.


### `packages/core/src/actions/resources/runners.ts`

Archive: `sources/packages/core/src/actions/resources/runners.ts` · bytes: 26618 · Git blob: `5d27a887b6a1890a92d83b0310b3bc624f83bf47` · SHA256: `87a6b7a7a23e4aaa162366761f68282f64190e7a2555cf353f67a22aa3cac0b6`.


Linhas **180–199**; SHA256 do intervalo `86a5b9fc6e991baedd8d363712fd9b1a1c451a5acb057dfd724149b4c657e719`:

~~~~typescript
        const owned = yield* ActionsResourceNative.get(services, current, `projects/${owner.projectID}`)
        yield* ActionsResourceNative.checked(current, () => {
          const project = ActionsResourceNative.decode(current, GitLabCommandNative.Project, owned.data)
          if (String(project.id) !== owner.projectID) throw ActionsResourceNative.error(current, "binding_stale", "Runner owner project identity changed during assignment preflight")
          GitLabCommandNative.role(current, project, 40)
          if (native.locked === true && owner.projectID !== current.projectID)
            throw ActionsResourceNative.error(current, "permission_denied", "Locked runner cannot be assigned outside its owning project")
        })
        const written = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${authority.root}/runners`, body: { runner_id: runnerID } }, [201])
        yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          if (String(ActionsResourceNative.decode(current, GitLabRunner, written.data, true).id) !== runnerID)
            throw ActionsResourceNative.error(current, "outcome_unknown", "Runner assignment response did not prove its exact native ID", "unknown")
        }))
        return { acknowledgement: { resourceID: runnerID } }
      }
      if (!native.projects?.some((project) => String(project.id) === current.projectID))
        return yield* ActionsResourceNative.error(current, "binding_stale", "Runner is not currently assigned to the bound native project")
      if (admitted.kind !== "resource.update") {
        if (native.projects.length !== 1) return yield* ActionsResourceNative.error(current, "permission_denied", "Deleting this runner would affect other projects; remove their assignments in the owning native scope first")
        yield* ActionsResourceNative.send(services, current, { method: "DELETE", path: `runners/${runnerID}` }, [204])
~~~~


Linhas **249–261**; SHA256 do intervalo `4fe92e0fee936fed62db077ff729766568e5cf5feea5cfa458c9534bf0fbfc48`:

~~~~typescript
const ownership = Effect.fn("ActionsRunners.gitlabOwnership")(function* (services: Services, binding: Actions.Binding, runner: typeof GitLabRunner.Type) {
  if (runner.runner_type !== "project_type") return { projectID: undefined, labels: runner.tag_list ?? [] }
  if (!services.graphql) return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitLab runner ownership requires the bound /api/graphql seam; REST assignments do not prove owner project")
  const response = yield* ActionsResourceNative.before(binding, services.graphql(binding, { kind: "runner", id: String(runner.id) }))
  return yield* ActionsResourceNative.checked(binding, () => {
    const native = ActionsResourceNative.decode(binding, Owner, response.data)
    if (response.status !== 200 || native.errors?.length || !native.data.runner || native.data.runner.id !== `gid://gitlab/Ci::Runner/${runner.id}` || native.data.runner.runnerType !== "PROJECT_TYPE")
      throw ActionsResourceNative.error(binding, "capability_unavailable", "GitLab did not prove this project runner's native ownership")
    const owner = native.data.runner.ownerProject?.id
    if (!owner || !/^gid:\/\/gitlab\/Project\/[1-9]\d*$/.test(owner))
      throw ActionsResourceNative.error(binding, "capability_unavailable", "GitLab runner owner project is not visible to the current actor")
    return { projectID: owner.split("/").at(-1), labels: native.data.runner.tagList ?? [] }
  })
~~~~


## A30 — Schedules GitLab nativos

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A30`.


### `packages/core/src/actions/resources/schedules.ts`

Archive: `sources/packages/core/src/actions/resources/schedules.ts` · bytes: 31805 · Git blob: `700bc3658ebb06113d9027f740ff16d1e5f69cea` · SHA256: `e5664133d84a54b2187f6ba5b61d4d564579d7a58e6ed5801cc437f5454cc4ab`.


Linhas **112–126**; SHA256 do intervalo `42be1d25f3b8ee1ff814b4775c12b87f41ce35aa785902d127458ad0d646a7d4`:

~~~~typescript
        yield* ActionsResourceNative.before(current, GitLabCommandInputs.check(current, services.transport, source, overrides.inputs))
      }
      const path = `${authority.root}/pipeline_schedules${id === undefined ? "" : `/${id}`}`
      if (admitted.kind === "schedule.play") {
        const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${path}/play` }, [201])
        yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const data = ActionsResourceNative.decode(current, Schema.Struct({ message: Schema.Literal("201 Created") }), response.data, true)
          return data
        }))
        return { acknowledgement: { resourceID: id, unattributed: true } }
      }
      if (admitted.kind === "schedule.takeOwnership") {
        const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${path}/take_ownership` }, [201, 200])
        return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const data = ActionsResourceNative.decode(current, Schedule, response.data, true)
~~~~


Linhas **178–190**; SHA256 do intervalo `6bfaa203f903106309d1bc643cc07390ffb3c5b701391a31c90b8f89044382e9`:

~~~~typescript
        native.variables.filter((item) => !overrides.variables?.some((variable) => variable.key === item.key)),
        (variable) => Effect.gen(function* () {
          const response = yield* ActionsResourceNative.send(services, current, { method: "DELETE",
            path: `${authority.root}/pipeline_schedules/${written.id}/variables/${encodeURIComponent(variable.key)}` }, [202])
          yield* ActionsResourceNative.checked(current, () => {
            const deleted = ActionsResourceNative.decode(current, Schema.Struct({ key: Schema.NonEmptyString, variable_type: Schema.Literals(["env_var", "file"]) }), response.data, true)
            if (deleted.key !== variable.key || deleted.variable_type !== variable.variable_type)
              throw ActionsResourceNative.error(current, "outcome_unknown", "Schedule variable deletion did not acknowledge its exact native key/type", "unknown")
          })
        }), { concurrency: 1 },
      ))
      return { acknowledgement: { resourceID: String(written.id) } }
    }),
~~~~


## A31 — Schedules GitHub são source.write

Vínculo: `body.md` §2, 4; archive de evidência: `evidence.md`, seção `A31`.


### `packages/core/src/actions/resources/schedules.ts`

Archive: `sources/packages/core/src/actions/resources/schedules.ts` · bytes: 31805 · Git blob: `700bc3658ebb06113d9027f740ff16d1e5f69cea` · SHA256: `e5664133d84a54b2187f6ba5b61d4d564579d7a58e6ed5801cc437f5454cc4ab`.


Linhas **299–326**; SHA256 do intervalo `0e77224d73efcfb8e67f12e8bd98fe54e734052a04345529c1613c302200dff0`:

~~~~typescript
    return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitHub schedules are workflow YAML; play/ownership controls have no native schedule API")
  const input = yield* ActionsResourceNative.checked(binding, () => intent.kind === "resource.delete"
    ? ActionsResourceNative.input(binding, ActionsResourceNative.ProviderOnly, payload) : ActionsResourceNative.input(binding, Form, payload))
  if (input.provider !== "github") return yield* ActionsResourceNative.error(binding, "invalid_input", "Schedule payload belongs to another provider")
  if (!services.publish) return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitHub schedule changes require the owning SourcePublisher callback; open Edit YAML")
  const workflowID = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.id(binding, intent.target.workflowID ?? intent.target.resourceID ?? ""))
  if (intent.target.resourceID !== undefined && intent.target.resourceID !== workflowID)
    return yield* ActionsResourceNative.error(binding, "invalid_input", "Schedule workflow and resource target identities differ")
  const authority = yield* ActionsResourceNative.authority(services, binding)
  const scopes = authority.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
  if (scopes?.length && !scopes.includes("workflow"))
    return yield* ActionsResourceNative.error(binding, "permission_denied", "Observed classic OAuth scopes deny publishing workflow-source changes")
  const repo = yield* GitHubNative.repository(services.transport, binding)
  if (!repo.native.default_branch || intent.target.ref !== repo.native.default_branch || !intent.expected?.sourceVersion || !intent.expected.commit)
    return yield* ActionsResourceNative.error(binding, "invalid_input", "GitHub schedule authoring requires captured default-branch ref, sourceVersion and commit")
  const response = yield* ActionsResourceNative.get(services, binding, `${repo.path}/actions/workflows/${workflowID}`)
  const workflow = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.decode(binding, Workflow, response.data))
  if (String(workflow.id) !== workflowID || workflow.path !== intent.target.path || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(workflow.path))
    return yield* ActionsResourceNative.error(binding, "source_conflict", "Captured schedule source path differs from the exact native workflow")
  const source = yield* ActionsResourceNative.before(binding, services.reader.source(binding, { path: workflow.path, ref: intent.target.ref }))
  if (source.bindingID !== binding.id || source.path !== workflow.path || source.ref !== intent.target.ref || source.version !== intent.expected.sourceVersion || source.commit !== intent.expected.commit)
    return yield* ActionsResourceNative.error(binding, "source_conflict", "Workflow schedule source moved after admission")
  const text = yield* ActionsResourceNative.checked(binding, () => {
    ActionsResourceNative.requireVersion(binding, intent, ActionsResourceNative.version({ workflowID, sourceVersion: source.version, state: workflow.state }))
    const existing = ActionsScheduleYaml.inspect(binding, source.text)
    if (intent.kind === "resource.delete") return ActionsScheduleYaml.edit(binding, source.text, [])
    if (!Schema.is(Form)(input)) throw ActionsResourceNative.error(binding, "invalid_input", "Schedule command requires its exact native form")
    if (input.name !== workflow.name || input.zone !== "UTC" || input.ref !== intent.target.ref || input.input || input.inputs !== undefined || input.variables !== undefined || input.inputMode !== undefined || input.enabled !== undefined)
~~~~


## A32 — CLI GitHub e lifecycle de processo

Vínculo: `body.md` §5; archive de evidência: `evidence.md`, seção `A32`.


### `packages/core/src/actions/transport/cli.ts`

Archive: `sources/packages/core/src/actions/transport/cli.ts` · bytes: 5166 · Git blob: `695d1c8b2cc0872ad8e2a3d554a4b010674f834c` · SHA256: `94d766a8ffb45ec126698e2cf571f7a328261579edc1969147f2043c500df819`.


Linhas **15–27**; SHA256 do intervalo `fa241fdb2bbc8293f7cb41af1b7c9e1321af6713434f8041fcb2f092c2bd3393`:

~~~~typescript

export const target = Effect.fn("ActionsTransport.target")(function* (provider: Actions.Provider) {
  const host = URL.parse(`https://${provider.hostname}`)
  if (!host || host.host !== provider.hostname || host.pathname !== "/" || host.username || host.password || host.search || host.hash)
    return yield* error(provider, "host_mismatch", "Provider hostname must be an explicit canonical HTTPS host", "definitely_unsent")
  const origin = provider.kind === "github" && provider.hostname === "github.com"
    ? "https://api.github.com"
    : host.origin
  const base = provider.kind === "gitlab" ? `${origin}/api/v4` : `${origin}/api/v3`
  if (provider.apiOrigin !== origin && (provider.hostname === "github.com" || provider.apiOrigin !== base))
    return yield* error(provider, "host_mismatch", "Provider API origin does not match the CLI hostname", "definitely_unsent")
  if ((provider.kind === "gitlab" && provider.hostname === "github.com") ||
      (provider.kind === "github" && provider.hostname === "gitlab.com"))
~~~~


### `packages/core/src/actions/transport/process.ts`

Archive: `sources/packages/core/src/actions/transport/process.ts` · bytes: 5454 · Git blob: `5da8d9899becf4814f9a3011adfafc50d20c5239` · SHA256: `03b52b82e18a5a9a0ec515895218574eefbc433597eeb64b0fb13f452575ce9b`.


Linhas **61–77**; SHA256 do intervalo `2d547a87b0040934a1c314da44f122a02d15acb4dd87bfb1ee24ffc7cf6dc95a`:

~~~~typescript
      const exit = yield* pull.pipe(Effect.raceFirst(stderrFailure), Effect.raceFirst(Deferred.await(stopped)), Effect.exit)
      if (yield* Deferred.isDone(stopped)) return yield* Deferred.await(stopped)
      return yield* exit
    })))
  })).pipe(
    Stream.mapError((cause) => cause instanceof ActionsError ? cause : ActionsCli.error(provider, "transfer_failed", "Provider CLI byte transfer failed")),
  )
}

const collect = Effect.fn("ActionsTransport.collect")(function* (
  proc: AppProcess.Interface, provider: Actions.Provider, command: ChildProcess.Command,
  stdin: Stream.Stream<Uint8Array, ActionsError> = Stream.empty,
) {
  const handle = yield* proc.spawn(command)
  const result = yield* Effect.all({
    stdout: bounded(handle.stdout, provider, METADATA_LIMIT),
    stderr: bounded(handle.stderr, provider, STDERR_LIMIT),
~~~~


## A33 — Snapshot de credenciais e HTTP GitLab

Vínculo: `body.md` §5; archive de evidência: `evidence.md`, seção `A33`.


### `packages/core/src/actions/transport/credentials.ts`

Archive: `sources/packages/core/src/actions/transport/credentials.ts` · bytes: 5469 · Git blob: `e9fb72f248bb8500d5fc14d053ddb95396be3819` · SHA256: `36b0b3a3ed180de68ed8c8497c7231728ec4aabfd79fd67de34e33654b109010`.


Linhas **13–27**; SHA256 do intervalo `bf46a0b4ae7ad24391b2ae477236f9fc37a573d0b630bd70580107b56fc68040`:

~~~~typescript
const commit = "570955d4252f860d6b0cbf3fd2ec44f86a7e6957"
const keys = ["token", "job_token", "is_oauth2", "ca_cert", "client_cert", "client_key"] as const

// Request-memory only. This module neither reads/copies a CLI config file nor
// exports credential values through the public Transport response/identity seam.
export const read = Effect.fn("ActionsTransport.credentials")(function* (proc: AppProcess.Interface, directory: string, provider: Actions.Provider) {
  const executable = yield* ActionsCli.target(provider)
  const command = ActionsCli.command(directory, provider, executable, [], "ignore")
  const get = (args: string[]) => Effect.scoped(Effect.gen(function* () {
    const handle = yield* proc.spawn(ChildProcess.make(executable, args, command.options))
    const result = yield* Effect.all({
      stdout: capture(handle.stdout), stderr: capture(handle.stderr), code: handle.exitCode,
    }, { concurrency: "unbounded" })
    if (result.code !== 0) return yield* ActionsCli.error(provider, "not_authenticated", "GitLab local sign-in configuration could not be read", "definitely_unsent")
    return yield* Effect.try({
~~~~


### `packages/core/src/actions/transport/gitlab.ts`

Archive: `sources/packages/core/src/actions/transport/gitlab.ts` · bytes: 5999 · Git blob: `a21535f1c3014d492d7f07e98250bfb9e6cc3b3a` · SHA256: `94a67ca1521b8ce37b40b34a93d36d9986bdbf3727e2152399dd69b14214aef0`.


Linhas **19–32**; SHA256 do intervalo `354795c99666a2499ba29cbb3dee741779217add006e3c56ff3d49258986fcd2`:

~~~~typescript
    const account = ActionsIdentity.account(binding.provider, user.data)
    if (Option.isNone(account) || account.value !== binding.account)
      return yield* ActionsCli.error(binding.provider, "binding_stale", "GitLab sign-in identity changed; rebind before mutation", "definitely_unsent")
  })
  return {
    resolve: Effect.fn("ActionsTransport.gitlabResolve")(function* (provider: Actions.Provider, projectPath: string) {
      const snapshot = yield* ActionsCredentials.read(proc, directory, provider)
      const project = yield* ActionsHttp.metadata(provider, snapshot, { method: "GET", path: `projects/${encodeURIComponent(projectPath)}` })
      const identity = ActionsIdentity.project(provider, project.data)
      if (Option.isNone(identity)) return yield* ActionsCli.error(provider, "transport_failed", "Provider did not return native project identity")
      const user = yield* ActionsHttp.metadata(provider, snapshot, { method: "GET", path: "user" })
      const account = ActionsIdentity.account(provider, user.data)
      if (Option.isNone(account)) return yield* ActionsCli.error(provider, "not_authenticated", "Provider did not return the current signed-in account")
      return { ...identity.value, account: account.value }
~~~~


## A34 — Classificação de resposta e incerteza

Vínculo: `body.md` §5; archive de evidência: `evidence.md`, seção `A34`.


### `packages/core/src/actions/transport/response.ts`

Archive: `sources/packages/core/src/actions/transport/response.ts` · bytes: 4934 · Git blob: `09aed710878c0e33f33b7e1a8d566074a44ad30a` · SHA256: `dbe2d9284661b36cee41b379cba34f29cd6910df7757b10b94136eb12e6d8192`.


Linhas **56–76**; SHA256 do intervalo `1ebfeea36895201d250369da55982b9f902e3425c7dfdd8ee7db16385ee280ca`:

~~~~typescript
export function failure(provider: Actions.Provider, exitCode: number, stderr: Buffer, status?: number, headers: Record<string, string> = {}, complete = false) {
  const code = status ?? Number(/\bHTTP[ :]+(\d{3})\b/i.exec(stderr.toString("utf8"))?.[1])
  const retry = headers["retry-after"]
  const seconds = retry && /^\d+$/.test(retry) ? Number(retry)
    : retry ? Math.max(0, Math.ceil((Date.parse(retry) - Date.now()) / 1000))
    : headers["x-ratelimit-remaining"] === "0" && /^\d+$/.test(headers["x-ratelimit-reset"] ?? "")
      ? Math.max(0, Number(headers["x-ratelimit-reset"]) - Math.floor(Date.now() / 1000)) : undefined
  const kind = code === 429 || (code === 403 && (retry !== undefined || headers["x-ratelimit-remaining"] === "0"))
    ? "rate_limited" : code === 401 ? "not_authenticated" : code === 403 ? "permission_denied" : code === 404 ? "not_found"
      : (provider.kind === "github" && exitCode === 4) || /auth login|not logged in|not authenticated|login first|invalid token/i.test(stderr.toString("utf8"))
        ? "not_authenticated" : "transport_failed"
  // Provider diagnostics can echo submitted secrets. Only classifications leave this boundary.
  return new ActionsError({
    kind, provider: provider.kind, message: `Provider request failed${code ? ` (HTTP ${code})` : ""}`,
    retryAfter: seconds !== undefined && Number.isFinite(seconds) ? seconds : undefined,
    // Require complete bounded JSON and a normal CLI HTTP-error exit. Partial
    // output, stderr HTTP hints and exit codes alone cannot prove rejection.
    disposition: complete && (exitCode === 0 || exitCode === 1) && status !== undefined && [400, 401, 403, 404, 409, 422, 429].includes(status)
      ? "definitely_rejected" : "unknown",
  })
}
~~~~


### `packages/core/src/actions/transport/http.ts`

Archive: `sources/packages/core/src/actions/transport/http.ts` · bytes: 10713 · Git blob: `cb71e6424c0f4b9c7e714667f1298e46fe3a502d` · SHA256: `b3e60d9d087592f8847f53d94e60d3ece75cf827014407f9b4a66dfc78cc0ae7`.


Linhas **91–104**; SHA256 do intervalo `9531d8e343d90d4c6b4fdc22163de6c9eb7fb1b32dbe57fb3e67f5739131c49b`:

~~~~typescript
  const req = yield* Effect.acquireRelease(Effect.try({
    try: () => request(url, {
      method: input.method, agent: false, rejectUnauthorized: true, minVersion: "TLSv1.2", signal: abort.signal,
      ca: snapshot.ca, cert: snapshot.cert, key: snapshot.key,
      // Verification success precedes authenticated HTTP. Keep this transition
      // sticky: later renegotiation/certificate/TLS failures cannot prove unsent.
      checkServerIdentity: (hostname, certificate) => {
        const error = checkServerIdentity(hostname, certificate)
        if (!error) state.phase = "http_possible"
        return error
      },
      headers: { ...snapshot.headers, "Content-Type": contentType, Connection: "close" },
    }),
    catch: () => ActionsCli.error(provider, "invalid_input", "GitLab HTTPS request could not be constructed safely", "definitely_unsent"),
~~~~


## A35 — Alvos de bytes e identidade do artifact

Vínculo: `body.md` §5; archive de evidência: `evidence.md`, seção `A35`.


### `packages/core/src/actions/output/target.ts`

Archive: `sources/packages/core/src/actions/output/target.ts` · bytes: 7464 · Git blob: `9195013d45d2b5deec234398d8a4fde834bf8edd` · SHA256: `162391bc77848f4dc03cb6b340375cfc732bc7f3137a810998196ef17f03bf2d`.


Linhas **35–46**; SHA256 do intervalo `36be716fd3fd79799813b13fba8f9700efa886bc3a89cd7ed2dc1f5094758fa3`:

~~~~typescript
  if (binding.provider.kind === "gitlab") {
    const response = yield* OutputNative.get(transport, binding, `${root}/jobs/${input.id}`)
    const job = yield* OutputNative.checked(binding, () => {
      const job = OutputNative.decode(binding, OutputNative.GitLabJob, response.data)
      OutputNative.gitlabOwner(binding, job, input.id, input.runID)
      if (job.erased_at) throw OutputNative.error(binding, "not_found", "GitLab job output was erased")
      if (input.kind === "artifact" && OutputNative.gitlabState(job) === "expired")
        throw OutputNative.error(binding, "not_found", "GitLab job artifacts are expired or unavailable")
      if (input.kind === "artifact" && !OutputNative.gitlabArchive(job))
        throw OutputNative.error(binding, "capability_unavailable", "GitLab job has no native downloadable artifact archive")
      return job
    })
~~~~


### `packages/core/src/actions/output/native.ts`

Archive: `sources/packages/core/src/actions/output/native.ts` · bytes: 10694 · Git blob: `93f8202c25955c4105c25f2ccdfada2df3352ad3` · SHA256: `200f3167fa58f45c0d9470ae9d50145392a05bb23f193c22e750214ca73a775b`.


Linhas **142–167**; SHA256 do intervalo `ee7c3631dbea8f91763b54d4ce250a2e44decbafdde0bb1b60df85631a988073`:

~~~~typescript
export function gitlabOwner(binding: Actions.Binding, job: typeof GitLabJob.Type, jobID?: string, runID?: string) {
  if (String(job.pipeline.project_id) !== binding.projectID || (jobID !== undefined && String(job.id) !== jobID) ||
    (runID !== undefined && String(job.pipeline.id) !== runID))
    throw error(binding, "binding_stale", "GitLab artifact job does not belong to the selected project, pipeline and job")
}

export function artifactOwner(binding: Actions.Binding, artifact: typeof Artifact.Type, artifactID?: string, runID?: string) {
  if (String(artifact.workflow_run.repository_id) !== binding.projectID || (artifactID !== undefined && String(artifact.id) !== artifactID) ||
    (runID !== undefined && String(artifact.workflow_run.id) !== runID))
    throw error(binding, "binding_stale", "GitHub artifact does not belong to the selected repository, run and artifact")
}

export function gitlabState(job: typeof GitLabJob.Type) {
  if (job.erased_at) return "erased"
  if (job.artifacts_expire_at && Date.parse(job.artifacts_expire_at) <= Date.now()) return "expired"
  if (gitlabArchive(job)) return "available"
  return "unavailable"
}

export function gitlabArchive(job: typeof GitLabJob.Type) {
  const file = job.artifacts_file
  if (file && "filename" in file && typeof file.filename === "string" && "size" in file && typeof file.size === "number" && file.filename)
    return { filename: file.filename, size: file.size }
  const artifact = job.artifacts.find((file) => file.file_type === "archive" && !!file.filename)
  return artifact && { filename: artifact.filename, size: artifact.size }
}
~~~~


## A36 — URL assinada, renovação e headers

Vínculo: `body.md` §5; archive de evidência: `evidence.md`, seção `A36`.


### `packages/core/src/actions/output/download.ts`

Archive: `sources/packages/core/src/actions/output/download.ts` · bytes: 2496 · Git blob: `b3e1e73f3a0f7f3604bae702cb749983f4178f29` · SHA256: `4dcb6f81b4fd186dbcd19da13ff1a0c0a47df7ba9e4ea7eb8ee5734959d4b8f7`.


Linhas **9–37**; SHA256 do intervalo `a3f21215360507114eb977c0beb546cf4c5cf7241a514afb3ccc3f77c8cdbd19`:

~~~~typescript
import { OutputSigned } from "./signed"
import { OutputTarget } from "./target"

export const open = Effect.fn("ActionsOutput.downloadOpen")(function* (
  transport: ActionsContract.Transport, reader: ActionsContract.ReadAdapter, binding: Actions.Binding,
  input: Actions.TransferInput, target: OutputTarget.Target, renew = false,
): Effect.fn.Return<{ response: ActionsContract.RawResponse; info: Actions.TransferInfo }, ActionsError, Scope.Scope> {
  if (!transport.open) return yield* OutputNative.error(binding, "capability_unavailable", "GitLab CI output requires the scoped native raw-opening transport")
  const native = yield* transport.open(binding, target.request)
  if (native.status >= 200 && native.status < 300) return { response: native, info: target.info }
  if (![301, 302, 303, 307, 308].includes(native.status)) {
    yield* native.close
    return yield* ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), native.status, { ...native.headers })
  }
  const location = native.headers.location
  yield* native.close
  if (!location) return yield* OutputNative.error(binding, "transfer_failed", "Native CI output redirect has no Location")
  const base = yield* OutputNative.checked(binding, () => new URL(`${new URL(binding.provider.apiOrigin).origin}/api/v4/${target.request.path}`))
  const signed = yield* OutputSigned.follow(binding, location, base)
  if (signed.status >= 200 && signed.status < 300) return { response: signed, info: target.info }
  yield* signed.close
  // One read-only renewal, before any byte reaches caller. Revalidate identities
  // and GET original native endpoint; never replay an expired signed URL.
  if (renew && [401, 403, 404].includes(signed.status)) {
    const fresh = yield* OutputTarget.resolve(transport, reader, binding, input)
    if (fresh.request.path !== target.request.path)
      return yield* OutputNative.error(binding, "binding_stale", "Signed URL renewal changed the selected native output endpoint")
    return yield* open(transport, reader, binding, input, fresh, false)
  }
~~~~


### `packages/core/src/actions/output/signed.ts`

Archive: `sources/packages/core/src/actions/output/signed.ts` · bytes: 5817 · Git blob: `e3f97544c559f1cc5b67623a047a431a37219117` · SHA256: `0432ae5abfc0aa4d7cefb225433a0da3e3cff8539e110dab54dafedf9e833bc8`.


Linhas **19–31**; SHA256 do intervalo `0a028a88dbd0c3abcc9ae84566db350e79ecb687580a48d8723262bbf13857d4`:

~~~~typescript
    throw OutputNative.error(binding, "host_mismatch", "Signed CI output destination must be credential-free HTTPS without fragments or controls")
  return url
}

// Bare Node HTTPS. Deliberately accepts neither native credentials, client TLS
// material, cookies nor caller headers. Every redirect is separately validated.
export const open = Effect.fn("ActionsOutput.signedOpen")(function* (
  binding: Actions.Binding, url: URL,
): Effect.fn.Return<ActionsContract.RawResponse, ActionsError, Scope.Scope> {
  yield* OutputNative.checked(binding, () => destination(binding, url.href))
  const scope = yield* Scope.make()
  yield* Effect.addFinalizer((exit) => Scope.close(scope, exit))
  return yield* Effect.gen(function* () {
~~~~


## A37 — Mutações de artifact e versão selecionada

Vínculo: `body.md` §4, 5; archive de evidência: `evidence.md`, seção `A37`.


### `packages/core/src/actions/output/mutations.ts`

Archive: `sources/packages/core/src/actions/output/mutations.ts` · bytes: 4523 · Git blob: `2d165747ebfc35f05a4c0244fd06134780482b88` · SHA256: `b9151642332518eec3151825cb55bd2b0f65ba275d77e1d107ac29feb3a323e0`.


Linhas **25–36**; SHA256 do intervalo `14eeb8778d7b3cb150f311f62a9f5e631eff8dffeebb7aa3ec5eedcf418ebc54`:

~~~~typescript
      return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitHub Actions has no native artifact keep operation")
    const authority = yield* ActionsResourceNative.authority(services, binding, intent.kind === "artifact.keep" ? 30 : 40)
    if (binding.provider.kind === "github") {
      const path = `${authority.root}/actions/artifacts/${id}`
      const response = yield* ActionsResourceNative.get(services, binding, path)
      yield* ActionsResourceNative.before(binding, ActionsResourceNative.checked(binding, () => {
        const native = ActionsResourceNative.decode(binding, OutputNative.Artifact, response.data)
        OutputNative.artifactOwner(binding, native, id, intent.target.runID)
        if (intent.target.scope !== undefined && intent.target.scope !== String(native.workflow_run.id))
          throw ActionsResourceNative.error(binding, "binding_stale", "Artifact scope differs from its admitted native run")
        ActionsResourceNative.requireVersion(binding, intent, OutputVersion.github(native))
      }))
~~~~


Linhas **45–58**; SHA256 do intervalo `0fe53daa773fffd31f2081c7e7119ba85d3ea22dd954c4d32a8c920114db014f`:

~~~~typescript
        throw ActionsResourceNative.error(binding, "binding_stale", "Artifact scope differs from its admitted native pipeline")
      ActionsResourceNative.requireVersion(binding, intent, OutputVersion.gitlab(native))
      return native
    }))
    const response = yield* ActionsResourceNative.send(services, binding, { method: intent.kind === "artifact.keep" ? "POST" : "DELETE",
      path: `${authority.root}/jobs/${id}/artifacts${intent.kind === "artifact.keep" ? "/keep" : ""}` }, intent.kind === "artifact.keep" ? [200] : [204])
    if (intent.kind === "artifact.keep") yield* ActionsResourceNative.after(binding, ActionsResourceNative.checked(binding, () => {
      const kept = ActionsResourceNative.decode(binding, OutputNative.GitLabJob, response.data, true)
      OutputNative.gitlabOwner(binding, kept, id, String(native.pipeline.id))
      if (kept.artifacts_expire_at !== null) throw ActionsResourceNative.error(binding, "outcome_unknown", "Native artifact keep response did not prove removed expiry", "unknown")
    }))
    return { acknowledgement: { resourceID: id } }
  })
}
~~~~


## B01 — Serviço Board e porta Maestro

Vínculo: `body.md` §6; archive de evidência: `evidence.md`, seção `B01`.


### `packages/core/src/board/board.ts`

Archive: `sources/packages/core/src/board/board.ts` · bytes: 83719 · Git blob: `0488f3819c967df78abd4d6a5a94805e48b3213e` · SHA256: `9b0f56eb1b4c8a78bec8b6af3ce16a71a25bfdcb4e3a3b581317b4126f99141d`.


Linhas **181–191**; SHA256 do intervalo `a5ea906ff67fe689af9f1e2f8544a4b7042bbfbe03dcc711b6334a6ffcd18ff6`:

~~~~typescript
      const quiet = <A, E>(work: (tx: Tx) => Effect.Effect<A, E>) =>
        db.transaction(work, { behavior: "immediate" }).pipe(dieOnStorage)

      // Every committed board write is one forecast evaluation of its project; GitHub mirror writes are not.
      const write = <A extends { readonly changed: Changed }, E>(work: (tx: Tx) => Effect.Effect<A, E>) =>
        quiet((tx) => work(tx).pipe(Effect.tap((result) => BoardMoney.evaluate(tx, result.changed.project)))).pipe(
          Effect.tap((result) => events.publish(Board.Event.Changed, result.changed)),
        )

      const reading = <A, E>(work: (tx: Tx) => Effect.Effect<A, E>) =>
        db.transaction(work).pipe(dieOnStorage)
~~~~


### `packages/core/src/board/tools.ts`

Archive: `sources/packages/core/src/board/tools.ts` · bytes: 8288 · Git blob: `d1ba07e4231da173fb5aa5478375cba7f99c00b4` · SHA256: `87638e1e13b803490987df2a5d33fd39e9c899ad7208a7b9d54d6f0635463eb5`.


Linhas **153–161**; SHA256 do intervalo `c580a703b01bd6731a21bd72896e18eadee5fb848d05516ef9c1304bfaf8f6e9`:

~~~~typescript
  ),
  deps: [ApplicationTools.node, Board.node],
})

function guard<A>(context: Tool.Context, effect: Effect.Effect<A, Board.Error>) {
  if (context.agent !== AgentV2.defaultID)
    return Effect.fail(new Tool.Failure({ message: "The board tools belong to Maestro; ask Maestro to change the board." }))
  return effect.pipe(Effect.mapError((error) => new Tool.Failure({ message: error.message })))
}
~~~~


## B02 — Transições e autoridade do card

Vínculo: `body.md` §6; archive de evidência: `evidence.md`, seção `B02`.


### `packages/core/src/board/board.ts`

Archive: `sources/packages/core/src/board/board.ts` · bytes: 83719 · Git blob: `0488f3819c967df78abd4d6a5a94805e48b3213e` · SHA256: `9b0f56eb1b4c8a78bec8b6af3ce16a71a25bfdcb4e3a3b581317b4126f99141d`.


Linhas **427–441**; SHA256 do intervalo `2d6dae25e7ea22c5f0361b45215fd328aa1f402d39dc49899cd0d90fb63a6941`:

~~~~typescript
      const requireActive = (project: ProjectRow, issue?: IssueRow): Effect.Effect<void, RefusedError> => {
        if (project.status === "archived") return Effect.fail(archived(project))
        if (project.status === "paused")
          return Effect.fail(
            new RefusedError({
              message: `${project.key} is paused by the owner${project.paused_reason ? ` (${project.paused_reason})` : ""}; only board_question works until they resume it.`,
            }),
          )
        if (issue?.paused)
          return Effect.fail(
            new RefusedError({
              message: `${project.key}-${issue.number} is paused by the owner; only board_question works until they resume it.`,
            }),
          )
        return Effect.void
~~~~


Linhas **1062–1089**; SHA256 do intervalo `d23bb3b4e4968535e1bddcf2f3d02a45da24959b480691f34ded27ce88ad91c7`:

~~~~typescript
              yield* requireActive(project, issue)
              if (issue.stage === "intake")
                return yield* new RefusedError({ message: `${ref} is in Intake; the owner accepts or declines it first.` })
              if (issue.stage === "queue")
                return yield* new RefusedError({ message: `${ref} is queued; take it out with board_dequeue first.` })
              if (input.stage === "review" && !issue.pr_number)
                return yield* new RefusedError({ message: `${ref} has no PR; link one with board_issue before Review.` })
              if (input.stage === "shipped" && issue.hold_before_merge)
                return yield* new RefusedError({
                  message: `${ref} is on hold before merge; only the owner can release it. Do not merge its PR.`,
                })
              if (input.stage === "shipped" && issue.pr_number) {
                if (issue.pr_number !== checked.issue.pr_number || !proof)
                  return yield* new RefusedError({ message: `${ref}'s PR changed while it was being checked; try again.` })
                if (proof.state === "none")
                  return yield* new RefusedError({
                    message: `${input.project} has no repo linked, so PR #${issue.pr_number} cannot be checked as merged.`,
                  })
                if (proof.state === "signed_out")
                  return yield* new RefusedError({
                    message: `GitHub is signed out, so PR #${issue.pr_number} cannot be checked as merged; ${ref} stays where it is.`,
                  })
                if (proof.state === "error")
                  return yield* new RefusedError({ message: `PR #${issue.pr_number} could not be read: ${proof.message}` })
                if (!proof.pr.merged)
                  return yield* new RefusedError({ message: `PR #${issue.pr_number} for ${ref} is not merged yet.` })
              }
              yield* BoardMoney.requireRoom(tx, project, issue, input.stage, ref)
~~~~


## B03 — Decisão durável, undo, nota e anexo

Vínculo: `body.md` §6; archive de evidência: `evidence.md`, seção `B03`.


### `packages/core/src/board/decision.ts`

Archive: `sources/packages/core/src/board/decision.ts` · bytes: 5365 · Git blob: `4b219f5b62517b2c4f9749a1a99e6257cfeff167` · SHA256: `7fdd5f2d2d0dfa0414b70b870e4ff75ca62fe7af36c62c90e583663af8833b43`.


Linhas **54–75**; SHA256 do intervalo `4624cb63c8ab9da5a9954a17bcabd126e7b140384e6c9c1d860f1df66bb94ce6`:

~~~~typescript
    .get()
  if (!old) return yield* new NotFoundError({ message: `Decision ${id} is not on ${key}.` })
  if (old.overturned_by_id)
    return yield* new RefusedError({ message: "That decision was already overturned; change the newer one instead." })
  if (!old.options.some((option) => option.id === input.option))
    return yield* new RefusedError({ message: `Pick one of: ${old.options.map((option) => option.id).join(", ")}.` })
  const text = input.text ?? null
  if (old.chosen === input.option && old.chosen_text === text)
    return yield* new RefusedError({ message: "That is already the answer." })
  const now = yield* Clock.currentTimeMillis
  const next = Board.DecisionID.create()
  yield* tx
    .insert(BoardDecisionTable)
    .values({
      id: next,
      project_id: project.id,
      issue_id: old.issue_id,
      epic_id: old.epic_id,
      question_id: old.question_id,
      question: old.question,
      options: old.options,
      recommended: old.recommended,
~~~~


Linhas **101–118**; SHA256 do intervalo `3ecd85c8a12fd38074c1d56a26e3f7633234ff84ff1176570ed585a0d6a59ee7`:

~~~~typescript
export const outcome = Effect.fnUntraced(function* (tx: Tx, input: Board.DecisionOutcomeInput) {
  const project = yield* loadProject(tx, input.project)
  const row = yield* tx
    .select()
    .from(BoardDecisionTable)
    .where(
      and(
        eq(BoardDecisionTable.project_id, project.id),
        isNull(BoardDecisionTable.overturned_by_id),
        or(eq(BoardDecisionTable.id, input.id as Board.DecisionID), eq(BoardDecisionTable.question_id, input.id as Board.QuestionID)),
      ),
    )
    .orderBy(desc(BoardDecisionTable.answered_at))
    .get()
  if (!row) return yield* new NotFoundError({ message: `No standing decision ${input.id} on ${project.key}.` })
  if (row.outcome === input.outcome) return yield* new RefusedError({ message: "That outcome is already recorded." })
  const now = yield* Clock.currentTimeMillis
  yield* tx.update(BoardDecisionTable).set({ outcome: input.outcome, outcome_at: now }).where(eq(BoardDecisionTable.id, row.id)).run()
~~~~


### `packages/core/src/board/board.ts`

Archive: `sources/packages/core/src/board/board.ts` · bytes: 83719 · Git blob: `0488f3819c967df78abd4d6a5a94805e48b3213e` · SHA256: `9b0f56eb1b4c8a78bec8b6af3ce16a71a25bfdcb4e3a3b581317b4126f99141d`.


Linhas **1421–1441**; SHA256 do intervalo `fcf6abe6bcb809623543fadebcc2dcae7cbdbd4650fa4f5a866a451269a6912d`:

~~~~typescript
              const project = yield* loadProject(tx, key)
              const target = yield* tx
                .select()
                .from(BoardActivityTable)
                .where(and(eq(BoardActivityTable.id, id as Board.ActivityID), eq(BoardActivityTable.project_id, project.id)))
                .get()
              if (!target) return yield* new NotFoundError({ message: `Activity ${id} is not on ${key}.` })
              const undoable =
                target.action === "github.overwrite" || (target.actor === "maestro" && UNDOABLE.includes(target.action))
              if (!undoable)
                return yield* new RefusedError({
                  message: "Only Maestro's plan changes and GitHub overwrites can be undone; reverse owner actions by doing the opposite.",
                })
              if (target.undone_by) return yield* new RefusedError({ message: "That change was already undone." })
              const later = yield* tx
                .select()
                .from(BoardActivityTable)
                .where(and(eq(BoardActivityTable.project_id, project.id), gt(BoardActivityTable.id, target.id)))
                .all()
              const keys = touched(target)
              const conflict = later.find(
~~~~


## B04 — Mirror GitHub tem semântica própria

Vínculo: `body.md` §7; archive de evidência: `evidence.md`, seção `B04`.


### `packages/core/src/board/github.ts`

Archive: `sources/packages/core/src/board/github.ts` · bytes: 32508 · Git blob: `7a29abd5907dfb6f0443756ad8b2a6f7e7cf133e` · SHA256: `15775b713425cb60f68003099198918a4b567431e426bd351c50ba4971d36702`.


Linhas **126–135**; SHA256 do intervalo `8aadddffaa7d99d54cb9522a9dfa7b2372e165d5b9ad6994cae158d08a12bc78`:

~~~~typescript
// GitHub's per-minute rates for hosted runners; public repositories bill nothing, which the timing endpoint reports as 0 ms.
const RATES: Record<string, number> = { UBUNTU: 0.008, WINDOWS: 0.016, MACOS: 0.08 }
/** CI minutes are refreshed at most this often unless the owner forces it. */
const CI_TTL = 10 * 60_000

const PAGE = 100
const MAX_PAGES = 5
const MARKER = /<!-- orchestra-board:([A-Z]+)-(\d+) -->/
const FOOTER = "\n\n---\nTracked on the Orchestra board as "
const COLORS = { stage: "5319e7", type: "0e8a16" }
~~~~


Linhas **323–341**; SHA256 do intervalo `d89f100bd92d5071d2c6fb1c0369bf4a4da025b2d93af1ba600e32501b8272b7`:

~~~~typescript
    const comments = yield* pages(repo, "issues/comments", "sort=updated&direction=asc", start, project.github_comments_etag, decodeComments)
    for (const item of comments.items) yield* comment(project, item)
    const newest = issues.items.reduce((high, item) => Math.max(high, Date.parse(item.updated_at) || 0), start)
    yield* deps.quiet((tx) =>
      tx
        .update(BoardProjectTable)
        .set({
          github_since: newest,
          github_issues_etag: issues.etag ?? project.github_issues_etag,
          github_comments_etag: comments.etag ?? project.github_comments_etag,
        })
        .where(eq(BoardProjectTable.id, project.id))
        .run(),
    )
  })

  /** Reads a list endpoint with `since` and the stored ETag; a 304 is an empty page. */
  const pages = <T extends { readonly updated_at: string }>(
    repo: string,
~~~~


Linhas **595–611**; SHA256 do intervalo `890502dbffb1f7e01a44f0160c2626604db773bb3e8b6515381be5ad3cc60ea4`:

~~~~typescript
          })
    // A new issue is created open with its labels; closing it, and every update, goes through PATCH.
    if (existing !== null || shut)
      yield* send("PATCH", `repos/${repo}/issues/${number}`, { ...content, ...state, labels: [...theirs, ...ours], milestone })
    yield* deps.quiet((tx) =>
      tx
        .update(BoardIssueTable)
        .set({
          github_number: number,
          github_node_id: created?.node_id ?? issue.github_node_id,
          // A write that landed while the push was in flight keeps the card dirty.
          github_dirty: sql`case when ${BoardIssueTable.time_updated} = ${issue.time_updated} then 0 else 1 end`,
        })
        .where(eq(BoardIssueTable.id, issue.id))
        .run(),
    )
  })
~~~~


## B05 — Medição parcial, orçamento e forecast

Vínculo: `body.md` §6, 7; archive de evidência: `evidence.md`, seção `B05`.


### `packages/core/src/board/money.ts`

Archive: `sources/packages/core/src/board/money.ts` · bytes: 9068 · Git blob: `2e898a1aaf5d8740ced0bcd0a8afe0baa3996bc9` · SHA256: `30254e118087b0f8ac51e48b0c1f4a5f2e7bfd7a4bf2907267fe37c13a8a582b`.


Linhas **163–169**; SHA256 do intervalo `2ef7090c698e3ef827e2a8c3cdc12c38b04a191a44688881ab5ce51eea5392d3`:

~~~~typescript
export const requireRoom = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, stage: Board.Stage, ref: string) {
  if (stage !== "building" || issue.stage === "building" || project.budget_usd === null) return
  const budget = (yield* spendOf(tx, project, null)).budget
  if (budget.state !== "paused") return
  return yield* new BudgetPausedError({
    message: `${project.key} has spent $${budget.spentUsd.toFixed(2)} of its $${project.budget_usd.toFixed(2)} budget, so no new work starts; ${ref} stays where it is. Work in progress continues. Ask the owner to raise the budget.`,
  })
~~~~


### `packages/core/src/board/spend.ts`

Archive: `sources/packages/core/src/board/spend.ts` · bytes: 6301 · Git blob: `c5c82e700282b4ba2fad710a5a87daae0328b6f9` · SHA256: `11d1284e196ac2f72708d88a47d7f839f5e380d0f4cc87e0a196d4b4c32d45ce`.


Linhas **30–49**; SHA256 do intervalo `26ef2f8eaebf6d6335d3e53da76a6aa6fa31c44016f0856bd38fccbff16bb214`:

~~~~typescript
export function card(input: { readonly sessions: readonly Session[]; readonly ci: Ci }): Board.Spend {
  const metered = input.sessions.filter((item) => item.cost > 0 && !subscription(item))
  const unmetered = input.sessions.filter((item) => item.tokens > 0 && !metered.includes(item))
  const byModel = Object.entries(
    metered.reduce<Record<string, number>>((all, item) => ({ ...all, [item.model ?? "unknown"]: (all[item.model ?? "unknown"] ?? 0) + item.cost }), {}),
  )
    .map(([model, usd]) => ({ model, usd }))
    .toSorted((a, b) => b.usd - a.usd || a.model.localeCompare(b.model))
  const models: Board.Meter =
    input.sessions.length === 0
      ? { kind: "not-metered", source: "no session linked" }
      : metered.length > 0 || unmetered.length === 0
        ? { kind: "usd", usd: sum(metered.map((item) => item.cost)) }
        : { kind: "not-metered", source: unmetered.some(subscription) ? "subscription engine, no per-token price" : "no price reported" }
  const infra: Board.Meter =
    input.ci.kind === "ok"
      ? { kind: "usd", usd: input.ci.usd }
      : { kind: "not-metered", source: input.ci.kind === "pending" ? "GitHub Actions not fetched yet" : "no PR linked" }
  return {
    models,
~~~~


### `packages/core/src/board/forecast.ts`

Archive: `sources/packages/core/src/board/forecast.ts` · bytes: 6656 · Git blob: `8c5aa204de45ec477861b3c5ea3c37aa1fe78eab` · SHA256: `4c30459dd7de865d5536d9a24a842b19a14bbeffd5ae4597a8df5f0b76fa06fd`.


Linhas **8–14**; SHA256 do intervalo `6c95730368bd0e73b52b90435eec1b52f9534a3393fd6f62742e5ff853ac7d7c`:

~~~~typescript
const DAY = 86_400_000
const NEEDED = 5
const TRIALS = 1000
const HORIZON = 3650
const SEED = 0x9e3779b9
const OPEN: readonly Board.Stage[] = ["backlog", "ready", "building", "review", "queue"]

~~~~


## B06 — CI do tree e correlação por heurística

Vínculo: `body.md` §7; archive de evidência: `evidence.md`, seção `B06`.


### `packages/core/src/board/ci.ts`

Archive: `sources/packages/core/src/board/ci.ts` · bytes: 25362 · Git blob: `77bc3370fc8a34249a2baf19ee10c7e8151cdc6b` · SHA256: `7a67b182097690e957ec40cf04f753e2695047f7b2fa5f19b792d8db9e38c7dd`.


Linhas **336–359**; SHA256 do intervalo `a308b3f559db72dc82f04d56b15e590847482d88fb0f0b0e5b63e3f9d0bb44ce`:

~~~~typescript
  const settle = Effect.fnUntraced(function* (repo: string, branch: string, row: typeof BoardCheckTable.$inferSelect) {
    const listed = yield* deps.gh([
      "run", "list", "-R", repo, "--workflow", row.command, "--branch", branch, "--event", "workflow_dispatch",
      "--json", "headSha,status,conclusion,url,createdAt", "--limit", "20",
    ])
    // A dispatch returns no run id: the run is the newest one on the dispatched commit created after the dispatch.
    const run = Option.getOrElse(decodeRuns(listed.stdout), () => []).find(
      (item) => item.headSha === row.commit_sha && Date.parse(item.createdAt) >= row.started_at - 60_000,
    )
    if (!run) return
    if (run.status !== "completed") {
      if (row.url !== run.url) yield* deps.quiet((tx) => tx.update(BoardCheckTable).set({ url: run.url }).where(eq(BoardCheckTable.id, row.id)).run())
      return
    }
    const outcome: Board.CheckOutcome =
      run.conclusion === "success" ? "pass" : run.conclusion === "failure" || run.conclusion === "timed_out" ? "fail" : "error"
    yield* deps.quiet((tx) =>
      tx
        .update(BoardCheckTable)
        .set({ outcome, url: run.url, failing: outcome === "pass" ? [] : [row.command], ended_at: Date.now() })
        .where(and(eq(BoardCheckTable.id, row.id), eq(BoardCheckTable.outcome, "pending")))
        .run(),
    )
  })
~~~~


Linhas **440–454**; SHA256 do intervalo `c2f9f407d1e28687c85c5366d4b9f065535b74dbc16684fd716f87ec36510752`:

~~~~typescript
/**
 * `scoped-red` when the latest result of any check on the tree failed; `scoped-green` when the contract requires
 * something and every required check passed on the tree. Rows must all be on the one tree.
 */
export function state(
  rows: ReadonlyArray<typeof BoardCheckTable.$inferSelect>,
  terms: Pick<Contract, "scoped">,
): Board.ScopedState {
  const latest = [...new Map(rows.toSorted((a, b) => a.started_at - b.started_at).map((row) => [`${row.kind}:${row.command}`, row])).values()]
  if (latest.some((row) => row.outcome === "fail")) return "scoped-red"
  if (terms.scoped.tests === null && terms.scoped.workflows.length === 0) return null
  const tests = terms.scoped.tests === null || latest.some((row) => row.kind === "scoped" && row.outcome === "pass")
  const flows = terms.scoped.workflows.every((file) => latest.some((row) => row.kind === "workflow" && row.command === file && row.outcome === "pass"))
  return tests && flows ? "scoped-green" : null
}
~~~~


## B07 — Admissão na fila e head exato

Vínculo: `body.md` §8; archive de evidência: `evidence.md`, seção `B07`.


### `packages/core/src/board/queue.ts`

Archive: `sources/packages/core/src/board/queue.ts` · bytes: 38106 · Git blob: `5194680fdf6bd598ececadf5f63c3339a945357d` · SHA256: `dd50c583530d4b6dd5de417fcd8b0e0abd0774e792ba7806c507b58e8386188f`.


Linhas **98–117**; SHA256 do intervalo `98ca2205c183960b350f8f3edbf32a0dc8be7b5aefea7f03f0ac2082e789fec6`:

~~~~typescript
    if (issue.stage !== "review") return yield* new RefusedError({ message: `${ref} is in ${issue.stage}; only a Review card is queued.` })
    if (!issue.pr_number) return yield* new RefusedError({ message: `${ref} has no PR to queue.` })
    if (!project.github_repo || !found.success.directory)
      return yield* new RefusedError({ message: `${input.project} needs a linked repository and its GitHub repo before cards queue.` })
    if (issue.paused) return yield* new RefusedError({ message: `${ref} is paused.` })
    if (found.success.attempt?.conflict_base)
      return yield* new RefusedError({
        message: `${ref} conflicts with base in ${(found.success.attempt.conflict_files ?? []).join(", ")}; merge base in its worktree first.`,
      })
    const waiting = found.success.waits.filter((dep) => dep.stage !== "shipped" && dep.stage !== "queue")
    if (waiting.length > 0)
      return yield* new RefusedError({
        message: `${ref} depends on ${waiting.map((dep) => `${input.project}-${dep.number}`).join(", ")}, which is neither shipped nor queued.`,
      })
    const missing = incomplete(issue.record)
    if (missing.length > 0)
      return yield* new RefusedError({ message: `${ref}'s PR record has no ${missing.join(", ")}; write it with board_issue first.` })
    const follow = issue.record?.follow_ups ?? []
    if (follow.length > 0) {
      const known = yield* deps.quiet((tx) =>
~~~~


Linhas **134–150**; SHA256 do intervalo `ba17230008c1b32f67c5bfd7448cd75a84cacac56fb913cddad2847db639d676`:

~~~~typescript
    const state = BoardCi.state(checks, contract)
    if (state === "scoped-red") return yield* new RefusedError({ message: `${ref} is scoped-red on its PR head; fix it before queueing.` })
    const required = contract.scoped.tests !== null || contract.scoped.workflows.length > 0
    if (required && state !== "scoped-green")
      return yield* new RefusedError({
        message: `${ref} is not scoped-green on its PR head ${pr.sha.slice(0, 10)}; run ci_run on that tree first.`,
      })
    const now = yield* Clock.currentTimeMillis
    const done = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const current = yield* loadIssue(tx, project, input.number)
        if (current.stage !== "review" || current.pr_number !== issue.pr_number)
          return yield* new RefusedError({ message: `${ref} changed while it was being checked; try again.` })
        yield* tx
          .insert(BoardQueueTable)
          .values({ issue_id: issue.id, project_id: project.id, head_sha: pr.sha, urgent: input.urgent ?? false, flush: input.flush ?? false, queued_at: now })
          .run()
~~~~


## B08 — Corte, lanes e full gate

Vínculo: `body.md` §8; archive de evidência: `evidence.md`, seção `B08`.


### `packages/core/src/board/queue.ts`

Archive: `sources/packages/core/src/board/queue.ts` · bytes: 38106 · Git blob: `5194680fdf6bd598ececadf5f63c3339a945357d` · SHA256: `dd50c583530d4b6dd5de417fcd8b0e0abd0774e792ba7806c507b58e8386188f`.


Linhas **271–287**; SHA256 do intervalo `712e28361338a54ac39d707fddaf568bb898f828efb974df170e8c69db9b8ee3`:

~~~~typescript
  // Projects settle concurrently, and a project still settling (a scoped run can take minutes) is skipped, never run twice.
  const busy = new Set<string>()

  /** One pass over every active project: settle the open bundles, then cut. The poll runs it every minute. */
  const tick = Effect.fnUntraced(function* () {
    const rows = yield* deps.quiet((tx) => tx.select().from(BoardProjectTable).where(ne(BoardProjectTable.status, "archived")).all())
    yield* Effect.forEach(
      rows,
      (row) =>
        Effect.gen(function* () {
          if (busy.has(row.id)) return
          busy.add(row.id)
          yield* project(row).pipe(Effect.ignore, Effect.ensuring(Effect.sync(() => busy.delete(row.id))))
        }),
      { concurrency: 2, discard: true },
    )
  })
~~~~


### `packages/core/src/board/queue-lanes.ts`

Archive: `sources/packages/core/src/board/queue-lanes.ts` · bytes: 4203 · Git blob: `f9d68042af8b19bf79e155818f940dbf5c828d08` · SHA256: `62429a1b7a77a627622ce5a9e7dd4d74c9b04b51cb1856058f6a124cb5c2cdb1`.


Linhas **25–44**; SHA256 do intervalo `106031dd7943d1c74f1f7676c704380673a9cdedd378d8f251b443c89a1e2164`:

~~~~typescript
export function lanes<Id>(cards: ReadonlyArray<Card<Id>>, flight: ReadonlyArray<Affected>, room = Infinity) {
  const sorted = cards.filter((card) => card.bundleable).toSorted(earlier)
  const going = sorted.reduce(
    (acc, card) => {
      const free =
        !flight.some((other) => overlaps(other, card.affected)) &&
        !acc.waiting.some((other) => overlaps(other, card.affected)) &&
        (card.affected === null
          ? acc.going.every((other) => other.affected === null)
          : !acc.going.some((other) => other.affected === null))
      if (free) return { going: [...acc.going, card], waiting: acc.waiting }
      return { going: acc.going, waiting: [...acc.waiting, card.affected] }
    },
    { going: [] as Array<Card<Id>>, waiting: [] as Affected[] },
  ).going
  // Cards with no affected package share one lane instead of one each.
  const linked = (a: Affected, b: Affected) => overlaps(a, b) || (a?.length === 0 && b?.length === 0)
  const first = (group: ReadonlyArray<Card<Id>>) => Math.min(...group.map((card) => sorted.indexOf(card)))
  return going
    .reduce(
~~~~


### `packages/core/src/board/queue-shared.ts`

Archive: `sources/packages/core/src/board/queue-shared.ts` · bytes: 11579 · Git blob: `108a40f374649e7498dad8f1d0033d3c8a984d41` · SHA256: `8382123484f1557dbff529a7c291d1aadf4b6ee435357a8a9e27db91e7d04cea`.


Linhas **54–74**; SHA256 do intervalo `30c1633439fa3aba20fb03a1b87f4e80890eb8eaca8984974a25dbac7d5eb354`:

~~~~typescript
/** `full.checks` names the checks that gate the bundle, matched by check or by the workflow that ran it; with none named, every reported check must pass. */
export function judge(rollup: typeof Rollup.Type["statusCheckRollup"], contract: BoardCi.Contract) {
  const gates = gating(rollup, contract)
  if (gates.some((check) => check.done && FAILED.has(check.result))) return "red"
  if (contract.full.checks.some((name) => !gates.some((check) => check.name === name || check.workflow === name))) return "pending"
  if (gates.length === 0) return contract.source === "no-ci" ? "green" : "pending"
  return gates.every((check) => check.done && PASSED.has(check.result)) ? "green" : "pending"
}

export function gating(rollup: typeof Rollup.Type["statusCheckRollup"], contract: BoardCi.Contract) {
  const checks = rollup.map((item) => ({
    name: item.name ?? item.context ?? "",
    done: item.state ? item.state !== "PENDING" && item.state !== "EXPECTED" : item.status === "COMPLETED",
    result: item.conclusion ?? item.state ?? "",
    workflow: item.workflowName ?? "",
    url: item.detailsUrl ?? "",
  }))
  return contract.full.checks.length > 0
    ? checks.filter((check) => contract.full.checks.includes(check.name) || contract.full.checks.includes(check.workflow))
    : checks
}
~~~~


## B09 — Red, infra, base e isolamento

Vínculo: `body.md` §8; archive de evidência: `evidence.md`, seção `B09`.


### `packages/core/src/board/queue-settle.ts`

Archive: `sources/packages/core/src/board/queue-settle.ts` · bytes: 27575 · Git blob: `a0165ce506ae7c07a7a79e9793e8b09f3cda0fcb` · SHA256: `3dac27cec16c0d5003485753de4a132110a6251f628e040f49304a357d7f4ae5`.


Linhas **99–110**; SHA256 do intervalo `3d7cdcb39e2d3549295cf77ed1ec399a2aa8ed07b1294b1bbfb21a0f3698dc72`:

~~~~typescript
      // An infrastructure red reruns only its failed jobs, in the same runs, so the green jobs stand and the bundle stays
      // open. A run already on its second attempt failed on infrastructure twice. A red whose runs cannot be read or
      // rerun falls back to rebuilding the bundle.
      const attempts = found.infra
        ? yield* Effect.forEach(found.runs, (run) =>
            deps
              .gh(["run", "view", run, "--repo", repo, "--json", "attempt,status"])
              .pipe(Effect.map((read) => (read.exitCode === 0 ? Option.getOrUndefined(decodeAttempt(read.stdout)) : undefined))),
          )
        : []
      const rerunnable = attempts.length > 0 && attempts.every((attempt) => attempt !== undefined)
      // GitHub can still report the last attempt's jobs for a moment after a rerun starts.
~~~~


Linhas **451–463**; SHA256 do intervalo `16e183e67753df9253f34bd234be93127035e0c62eaf20e6cd2c0a556e0ae5a7`:

~~~~typescript
  const hold = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    members: ReadonlyArray<{ readonly member: typeof BoardBundleMemberTable.$inferSelect; readonly issue: IssueRow }>,
    why: string,
  ) {
    yield* deps.quiet((tx) =>
      tx
        .update(BoardQueueTable)
        .set({ hold: "held" })
        .where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id)))
        .run(),
~~~~


### `packages/core/src/board/queue-red.ts`

Archive: `sources/packages/core/src/board/queue-red.ts` · bytes: 23316 · Git blob: `57bcf02fe9c1eea69282f53a0c97799a89aacb5f` · SHA256: `c9a29e07575731d8becdcfea5e2571c018b294c4c4e88b1de078a17c1d61e5c8`.


Linhas **48–82**; SHA256 do intervalo `1f852f823862a62a06c724d64e758869d4d65d02e994101c520ea8da4f7f2fe5`:

~~~~typescript
        const silent = control !== null && control.jobs.some((prefix) => check.name.startsWith(prefix)) && !text.includes(control.line)
        const stopped = /##\[error\](The action '.*' has timed out after \d+ minutes|The operation was canceled)/.test(text)
        return { files, groups: text ? BoardCi.packaged(text) : [], infra: (silent || stopped) && text !== "" && files.length === 0 }
      }),
    )
    return {
      files: [...new Set(read.flatMap((item) => item.files))],
      groups: read.flatMap((item) => item.groups),
      infra: read.length > 0 && read.every((item) => item.infra),
      // The Actions runs the failed jobs belong to, which an infrastructure red reruns in place.
      runs: [...new Set(failed.flatMap((check) => check.url.match(/\/actions\/runs\/(\d+)\//)?.[1] ?? []))],
    }
  })

  /**
   * Whether base was green or red at `sha`: a base probe on that commit decides first, then a green whole-suite run on
   * the same tree, then the commit's own checks. A base reached by an outside merge often has no runs; that is unknown,
   * never green.
   */
  const baseState = Effect.fnUntraced(function* (row: ProjectRow, repo: string, directory: string, sha: string, contract: BoardCi.Contract) {
    const probed = yield* deps.quiet((tx) =>
      tx
        .select({ status: BoardBundleTable.status })
        .from(BoardBundleTable)
        .where(and(eq(BoardBundleTable.project_id, row.id), eq(BoardBundleTable.base_sha, sha), inArray(BoardBundleTable.status, ["probe-green", "base-red"])))
        .orderBy(desc(BoardBundleTable.n))
        .get(),
    )
    if (probed) return probed.status === "probe-green" ? "green" : "red"
    if (yield* greenTree(row, directory, sha)) return "green"
    const read = yield* deps.gh(["api", `repos/${repo}/commits/${sha}/check-runs`, "--jq", "[.check_runs[] | {name, status: (.status | ascii_upcase), conclusion: ((.conclusion // \"\") | ascii_upcase)}]"])
    const runs = read.exitCode === 0 ? Option.getOrUndefined(decodeRuns(read.stdout)) : undefined
    const verdict = runs && runs.length > 0 ? judge(runs, contract) : "pending"
    return verdict === "pending" ? "unknown" : verdict
  })
~~~~


## B10 — Merge, recuperação e limite de revogação

Vínculo: `body.md` §8; archive de evidência: `evidence.md`, seção `B10`.


### `packages/core/src/board/queue-settle.ts`

Archive: `sources/packages/core/src/board/queue-settle.ts` · bytes: 27575 · Git blob: `a0165ce506ae7c07a7a79e9793e8b09f3cda0fcb` · SHA256: `3dac27cec16c0d5003485753de4a132110a6251f628e040f49304a357d7f4ae5`.


Linhas **238–271**; SHA256 do intervalo `dbbc9c90793a1627cb7fc335f20f3bcbff1ed1c66d7ebd2fb89499ff11e64a55`:

~~~~typescript
    // Section 6.6: a member head that moved since assembly dequeues that member and the bundle is rebuilt.
    const heads = yield* Effect.forEach(members, (item) =>
      head(directory, repo, item.issue.pr_number ?? 0).pipe(
        Effect.map((current) => ({ item, sha: current.sha as string | undefined })),
        Effect.orElseSucceed(() => ({ item, sha: undefined })),
      ),
    )
    const stale = heads.filter((entry) => entry.sha !== entry.item.member.head_sha)
    if (stale.length > 0) {
      yield* Effect.forEach(stale, (entry) => moved(row, entry.item.issue, entry.sha), { discard: true })
      return yield* dissolve(row, bundle, `${stale.map((entry) => `${row.key}-${entry.item.issue.number}`).join(", ")} moved after assembly.`)
    }
    yield* git(directory, ["fetch", "--quiet", "--no-tags", "origin", contract.base])
    const tip = (yield* git(directory, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${contract.base}`])).out
    if (!tip) return
    // Section 8.5: a host that died after pushing base but before writing the rows finds the bundle already in base,
    // so it only records the merge: no second push and no rebuilt bundle.
    const already = tip !== bundle.base_sha && (yield* git(directory, ["merge-base", "--is-ancestor", bundle.head_sha, tip])).code === 0
    const landed = already
      ? { target: tip, on: null }
      : tip === bundle.base_sha
        ? { target: bundle.head_sha, on: null }
        : yield* skew(directory, contract, bundle, tip, row)
    if (!landed) return yield* dissolve(row, bundle, `${contract.base} moved to ${tip.slice(0, 10)}; the bundle is rebuilt and retested.`)
    const pushed = already
      ? { code: 0 }
      : yield* git(directory, [
          "push",
          "--quiet",
          `--force-with-lease=refs/heads/${contract.base}:${landed.on ?? bundle.base_sha}`,
          "origin",
          `${landed.target}:refs/heads/${contract.base}`,
        ])
    if (pushed.code !== 0) return
~~~~


### `packages/core/src/board/queue.ts`

Archive: `sources/packages/core/src/board/queue.ts` · bytes: 38106 · Git blob: `5194680fdf6bd598ececadf5f63c3339a945357d` · SHA256: `dd50c583530d4b6dd5de417fcd8b0e0abd0774e792ba7806c507b58e8386188f`.


Linhas **315–335**; SHA256 do intervalo `1b383069ce69ad137d7ad5575063ac2f88bc4d691a4833f07be768adf410d8ab`:

~~~~typescript
  ) {
    yield* git(directory, ["fetch", "--quiet", "--no-tags", "origin", contract.base])
    const tip = (yield* git(directory, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${contract.base}`])).out
    if (!tip) return
    const found = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const open = yield* openBundles(tx, row.id)
        const members = open.length
          ? yield* tx
              .select({ issue: BoardBundleMemberTable.issue_id })
              .from(BoardBundleMemberTable)
              .where(inArray(BoardBundleMemberTable.bundle_id, open.map((bundle) => bundle.id)))
              .all()
          : []
        const stopped = yield* tx
          .select({ id: BoardBundleTable.id })
          .from(BoardBundleTable)
          .where(and(eq(BoardBundleTable.project_id, row.id), inArray(BoardBundleTable.status, ["paused", "flaky"])))
          .get()
        const closed = yield* tx
          .select()
~~~~


Linhas **584–595**; SHA256 do intervalo `3265802a77bd8427365ed7b1af1c899e757e0e9dcba0db3d9b981dba063df32a`:

~~~~typescript
    const members = yield* Effect.gen(function* () {
      const taken: Array<{ readonly issue: IssueRow; readonly head: string; readonly labels: ReadonlyArray<string> }> = []
      for (const card of fix ? [fix] : alone ? [alone] : queued.cards) {
        if (taken.length >= cap) break
        if (card.queue.hold === "held") continue
        if (card.issue.hold_before_merge || card.issue.paused) continue
        const attempt = queued.attempts.find((item) => item.issue_id === card.issue.id)
        if (attempt?.conflict_base) continue
        const ready = queued.waits
          .filter((dep) => dep.issue === card.issue.id)
          .every((dep) => dep.stage === "shipped" || taken.some((item) => item.issue.id === dep.on))
        if (!ready) continue
~~~~


## B11 — Snapshot e conflitos

Vínculo: `body.md` §9; archive de evidência: `evidence.md`, seção `B11`.


### `packages/core/src/board/snapshot.ts`

Archive: `sources/packages/core/src/board/snapshot.ts` · bytes: 15010 · Git blob: `cc39cdec652c05bf969da8543335da1703a663fc` · SHA256: `8939a3de7e1123e7e650144adb79dfe5828706c73e6b34ab942bcc2edb626012`.


Linhas **75–93**; SHA256 do intervalo `3e59c45a4ca740ced13176f39a76d87a9adab7d8553784101cd6a0a2b1621795`:

~~~~typescript
  const scan = Effect.fnUntraced(function* (cwd: string, range: string) {
    const scanner = yield* deps.scanner
    if (!scanner) return "no secret scanner (gitleaks) is available"
    const result = yield* deps.proc
      .run(
        ChildProcess.make(scanner[0], [...scanner.slice(1), "git", "--no-banner", "--redact", "--exit-code", "1", "--log-opts", range, cwd], {
          cwd,
          env: deps.env,
          extendEnv: true,
          stdin: "ignore",
        }),
        { combineOutput: true, maxOutputBytes: 1024 * 1024, timeout: "120 seconds" },
      )
      .pipe(Effect.result)
    if (result._tag === "Failure") return `the secret scanner could not run: ${result.failure.message}`
    if (result.success.exitCode === 0) return undefined
    if (result.success.exitCode === 1) return "the secret scanner found a secret in the changed files"
    return `the secret scanner could not run (exit ${result.success.exitCode})`
  })
~~~~


Linhas **208–220**; SHA256 do intervalo `e29646c08bdeb2e59e665f7aa8ad4a6c2be83c1ab315923a4402b334128884db`:

~~~~typescript
     * `pushed` when the worktree's tree equals the last pushed snapshot's tree, else `local`. Null with no open attempt
     * or no worktree to read. The host records a snapshot only after its push succeeded, so the row stands for the remote.
     */
    state: Effect.fnUntraced(function* (issue: Board.IssueID) {
      const found = yield* find(issue)
      if (!found?.attempt) return null satisfies Board.PushState
      const cwd = yield* locate(found.directory, found.issue, found.attempt)
      if (!cwd || !existsSync(cwd)) return null satisfies Board.PushState
      const current = yield* tree(cwd)
      return (current && current === found.attempt.snapshot_tree ? "pushed" : "local") satisfies Board.PushState
    }),
    /** Snapshots every Building card with an open attempt: the 10 minute timer. */
    sweep: Effect.fnUntraced(function* () {
~~~~


### `packages/core/src/board/conflicts.ts`

Archive: `sources/packages/core/src/board/conflicts.ts` · bytes: 8573 · Git blob: `06e450683e7c3428b8d466cd91696806c9ef5419` · SHA256: `c27c266af8e4461d76d253f6d13f8cc8ac4d1edeb7780e9726bb445fbab8a7ba`.


Linhas **35–43**; SHA256 do intervalo `72b4c99b953a0ee38fbf4cc3d533aa8bae1433c8f98e82f452e02a26c8d0d66b`:

~~~~typescript
// Review cards are about to queue and queued cards are about to be bundled: a conflict holds a queued card out of the
// next bundle until its worktree merges base.
const WATCHED: ReadonlyArray<Board.Stage> = ["review", "queue"]

// A project with no watched card has nobody to warn, so its fetch can wait. A later sweep diffs from the stored base
// SHA to the new head, so a delayed fetch loses no changed file; it only delays the note.
const IDLE_FETCH = 5 * 60_000
// Projects are checked two at a time: each check spawns git and writes the database.
const CONCURRENCY = 2
~~~~


## B12 — Record Atlas e replay de plano

Vínculo: `body.md` §9; archive de evidência: `evidence.md`, seção `B12`.


### `packages/core/src/board/queue-record.ts`

Archive: `sources/packages/core/src/board/queue-record.ts` · bytes: 15266 · Git blob: `7ade81c640d6524360161d2c018ba1038c471f2e` · SHA256: `1414c1df2d7b08fc0027fe108275d4b07e343a56a56ded5f2119f196101f92d4`.


Linhas **271–296**; SHA256 do intervalo `09447f1bc62d22d68e69c07e77ee0e85c7f2a7cee0abbcbb1aea1d3e30822d23`:

~~~~typescript
          packages: [],
          ownUnits: [],
        },
        evidence: {
          doneWhen: [],
          reviews: [],
          checks: found.checks.map((check) => ({
            name: `${check.kind} ${check.command}`,
            state: check.outcome,
            ...(check.url ? { url: check.url } : {}),
          })),
          used: "unseen",
        },
        cost: {
          attempts: found.attempts.map((attempt) => ({ n: attempt.n, cause: attempt.cause ?? "" })),
          ciRuns: found.checks.length,
          ciMinutes: Math.round(
            found.checks.reduce((sum, check) => sum + Math.max(0, (check.ended_at ?? check.started_at) - check.started_at), 0) / 60_000,
          ),
          wallMs: now - card.time_created,
        },
        lineage: {
          card: `${row.key}-${card.number}`,
          ...(found.epic ? { epic: `${row.key}-E${found.epic.number}` } : {}),
          dependsOn: found.depends.map((dep) => `${row.key}-${dep.number}`),
          seats: [...new Set(found.attempts.map((attempt) => attempt.seat).filter((seat) => seat !== null))],
~~~~


### `packages/core/src/board/tree.ts`

Archive: `sources/packages/core/src/board/tree.ts` · bytes: 19770 · Git blob: `9a14e96aa37e6135380b730025756b0e80bfe661` · SHA256: `68edc94c79b05a0225c269efd0a8550ba05def07d4b8f9492766676eef99a8ed`.


Linhas **21–24**; SHA256 do intervalo `a313be9cf9e4f495d77f1cb8673a2816e021be21a5f753c4b6426479eb734668`:

~~~~typescript
// The board log in the record tree (`.atlas/board`) and the import that rebuilds the board from it. Import restores
// projects, epics, issues, steps, dependencies, questions, decisions, notes and the activity log itself. The queue,
// bundles, attempts, checks and GitHub sync state are re-derived from git, GitHub and the card records, so import leaves
// them empty. Attachments are left out on purpose: their bytes and secrets never enter the log.
~~~~


Linhas **59–73**; SHA256 do intervalo `c1110e37a157591e8856078fe88ea4c9f1af96ad139e58f9e11ee02903685761`:

~~~~typescript
export const restore = Effect.fnUntraced(function* (tx: Tx, repoPath: string) {
  if (yield* tx.select({ id: BoardProjectTable.id }).from(BoardProjectTable).get())
    return yield* new ReplayError({ activity: "", message: "Import needs an empty board." })
  // Ids are minted in order within a millisecond, so they break ties inside one; across milliseconds they can wrap.
  const events = readBoard(repoPath).events.toSorted((a, b) => (a.at === b.at ? a.activity.localeCompare(b.activity) : a.at.localeCompare(b.at)))
  const cards = new Map<string, Board.IssueID>()
  for (const item of events) {
    const apply = APPLIERS[item.action as Board.Action]
    if (!apply) return yield* new UnknownActionError({ activity: item.activity, action: item.action })
    const redacted = item.text === undefined && item.textHash !== undefined
    const before = merge(item.before, item.text, "before")
    const after = merge(item.after, item.text, "after")
    const ctx = { tx, item, before, after, at: Date.parse(item.at), cards, project: yield* projectOf(tx, item) }
    yield* apply(ctx)
    const project = ctx.project ?? (yield* projectOf(tx, item))
~~~~


## B13 — Proof e ledger: origem de fatos e ausência

Vínculo: `body.md` §7, 9; archive de evidência: `evidence.md`, seção `B13`.


### `packages/core/src/board/proof.ts`

Archive: `sources/packages/core/src/board/proof.ts` · bytes: 2553 · Git blob: `6bd1374e707dd7f80975f37e2c03e02a9ee97a95` · SHA256: `6451c593372c579f0a2e116adc25fc824b1240519ad9110b6637d63935ba2608`.


Linhas **31–48**; SHA256 do intervalo `359d8a4cbf38030ea04bf0aaab741690d8c97ae9dcf2aeeb6abda6ac527f382e`:

~~~~typescript
export function build(key: string, loaded: Loaded, live: Board.Trail, summary: string | null) {
  const rule = loaded.row.guardrail_rule
  return {
    issue: loaded.row.number,
    ref: `${key}-${loaded.row.number}`,
    banner:
      loaded.project.github_state === "signed_out" || live.state === "signed_out"
        ? "GitHub sign-in expired. Sign in with gh to refresh pull request and CI status."
        : null,
    pr:
      live.state === "ok"
        ? {
            number: live.pr.number,
            state: live.pr.state,
            merged: live.pr.merged,
            commits: live.pr.commits.length,
            lastSha: live.pr.commits.at(-1)?.hash ?? null,
          }
~~~~


## S01 — Duas políticas e identidades persistidas

Vínculo: `body.md` §10; archive de evidência: `evidence.md`, seção `S01`.


### `packages/core/src/scheduled-task/sql.ts`

Archive: `sources/packages/core/src/scheduled-task/sql.ts` · bytes: 3559 · Git blob: `f7b58d09202d0eb4026623b587363798a0908874` · SHA256: `822bcafeaf764d56be959c3c5184e2e3e76bbca52ae6c678477728e0df3899a7`.


Linhas **70–75**; SHA256 do intervalo `7cec1d85454e0ca448210594cb2a56a6b45ae4ab9a81c02406db33b000f428fc`:

~~~~typescript
  },
  (table) => [
    uniqueIndex("scheduled_task_run_slot_idx").on(table.task_id, table.revision, table.slot),
    uniqueIndex("scheduled_task_run_manual_idx").on(table.task_id, table.manual_key),
    index("scheduled_task_run_state_idx").on(table.state, table.time_claimed),
  ],
~~~~


### `packages/core/src/scheduled-task/capability.ts`

Archive: `sources/packages/core/src/scheduled-task/capability.ts` · bytes: 21721 · Git blob: `ab0410651446d3d1d98d9d8028a3ad79bb46aecb` · SHA256: `d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e`.


Linhas **384–394**; SHA256 do intervalo `c0ef15fab7ce45caf1bf6f0ea12dbebff6a76cc0ca84476bcca8559bf9a2cbef`:

~~~~typescript
function sameOwner(task: Task, owner: Capability.Owner) {
  const stored = task.policy === "capability" ? task.owner : null
  return (
    stored !== null &&
    stored.sessionID === owner.sessionID &&
    stored.agentID === owner.agentID &&
    stored.projectID === owner.projectID &&
    stored.location.directory === owner.location.directory &&
    stored.location.workspaceID === owner.location.workspaceID
  )
}
~~~~


## S02 — Política legacy e DST

Vínculo: `body.md` §10, 11; archive de evidência: `evidence.md`, seção `S02`.


### `packages/core/src/scheduled-task/model.ts`

Archive: `sources/packages/core/src/scheduled-task/model.ts` · bytes: 6670 · Git blob: `a5560b15853e2941c31bf9e803560bbea0c24c4e` · SHA256: `f29962a40bd89bca23cff892d3ff01fcfa8e660b390c4831c88ca7cc695f0b5d`.


Linhas **25–36**; SHA256 do intervalo `396f8792f9d53d1756f739a8758740254ba64242ac227d906eec867c9d95187c`:

~~~~typescript
// What the scheduler owes a task at `now`. Only the latest due slot can run; older slots were overtaken
// and count as missed. A one-off or weekly slot more than a day late is skipped, never caught up. Hourly
// and daily slots are always within one cadence of the next slot.
export function plan(task: Timing, now: number): Plan {
  if (!task.enabled || task.next > now) return { type: "wait" }
  if (task.cadence === "once")
    return now - task.next > LATE ? { type: "skip", slot: task.next } : { type: "run", slot: task.next }
  const slot = previous(task, task.cadence, following(task, task.cadence, task.next, now))
  if (task.cadence === "weekly" && now - slot > LATE) return { type: "skip", slot }
  if (slot === task.next) return { type: "run", slot }
  return { type: "run", slot, missed: previous(task, task.cadence, slot) }
}
~~~~


Linhas **66–82**; SHA256 do intervalo `c9d3d54dd1b8bb114196dabd09175f3ee2f81e21e406ed9c29d623adf0ba7e93`:

~~~~typescript
// First slot after `now`, stepping from slot `from`. Hourly slots are absolute hours. Daily and weekly slots
// are calendar days at `minute` in the task's zone: a time that does not exist (spring-forward gap) runs at
// the same offset after the gap that day only, and an ambiguous time (fall-back) runs once, at its first
// occurrence.
export function following(zone: { minute: number; timezone: string }, cadence: Recurring, from: number, now: number) {
  if (from > now) return from
  if (cadence === "hourly") return from + (Math.floor((now - from) / HOUR) + 1) * HOUR
  const step = cadence === "daily" ? 1 : 7
  const start = Math.max(1, Math.floor((now - from) / (step * DAY)))
  const slots = Array.from({ length: 3 }, (_, index) => local(zone, from, (start + index) * step))
  return slots.find((slot) => slot > now) ?? local(zone, from, (start + 3) * step)
}

export function previous(zone: { minute: number; timezone: string }, cadence: Recurring, slot: number) {
  if (cadence === "hourly") return slot - HOUR
  return local(zone, slot, cadence === "daily" ? -1 : -7)
}
~~~~


## S03 — Capability: cron, intervalo e catch-up

Vínculo: `body.md` §10, 11; archive de evidência: `evidence.md`, seção `S03`.


### `packages/core/src/scheduled-task/capability-model.ts`

Archive: `sources/packages/core/src/scheduled-task/capability-model.ts` · bytes: 10649 · Git blob: `b92983cab05a5cff1ae32f459378192d07ddfc0b` · SHA256: `256620d07285f1e60c7e6023f4101e4f8738a565f43a6b859d8c1a7861230620`.


Linhas **42–58**; SHA256 do intervalo `90f9f24d6735968e84ff4c3d8a3d66adbe63e9a6d63986cad801c59bf1b3e927`:

~~~~typescript
/** Five Vixie fields separated by ASCII spaces or tabs, with `*`, lists, ranges and steps; names, macros and
 * seconds are rejected, as is a rule that can never fire. */
export function parseCron(expression: string): Cron | undefined {
  const fields = expression.split(/[ \t]+/).filter((field) => field !== "")
  if (fields.length !== 5) return undefined
  const sets = fields.map((field, index) => parseField(field, LOW[index], HIGH[index]))
  if (!sets.every((set): set is number[] => set !== undefined)) return undefined
  const cron = {
    minutes: new Set(sets[0]),
    hours: new Set(sets[1]),
    days: new Set(sets[2]),
    months: new Set(sets[3]),
    weekdays: new Set(sets[4].map((day) => day % 7)),
    // Vixie: a day field that starts with `*` is unrestricted, even with a step.
    dayRestricted: !fields[2].startsWith("*"),
    weekdayRestricted: !fields[4].startsWith("*"),
  }
~~~~


Linhas **83–105**; SHA256 do intervalo `42e180a8a3fbb208c1f84c68aa1cea1fffd6f4ab9e79a2d2c3f08f942945bc47`:

~~~~typescript
/** What a capability schedule owes at `now`. A once slot more than 24h late is skipped. */
export function plan(timing: Timing, now: number): Plan {
  if (!timing.enabled || timing.next > now) return { type: "wait" }
  if (timing.cadence.kind === "once")
    return now - timing.next > LATE ? { type: "skip", skipped: 1 } : { type: "run", slot: timing.next, skipped: 0 }
  const due = overdue(timing, now)
  if (timing.catchUp === "skip" && now - due.latest > TICK) return { type: "skip", skipped: due.count }
  return { type: "run", slot: due.latest, skipped: due.count - 1 }
}

// The latest due slot and the due count including the owed `next`; without a usable zone or rule, only `next`.
function overdue(timing: Timing, now: number) {
  const cadence = timing.cadence
  if (cadence.kind === "interval") {
    const step = cadence.minutes * MINUTE
    const count = Math.floor((now - timing.next) / step) + 1
    return { latest: timing.next + (count - 1) * step, count }
  }
  const clock = wallClock(timing)
  const latest = clock && inRange(now) ? latestSlot(clock, now) : undefined
  if (!clock || latest === undefined || latest <= timing.next) return { latest: timing.next, count: 1 }
  return { latest, count: 1 + countWalls(clock, localWall(clock.zone, timing.next), localWall(clock.zone, latest)) }
}
~~~~


Linhas **177–189**; SHA256 do intervalo `22f04c2fa6b2c7439332a70975dfeb3edc166b8134a8cb4f24be2748548bca0c`:

~~~~typescript
// The instant of a local wall time: the earlier one when the hour repeats, and the first instant after the gap
// when the wall time does not exist (02:30 on a spring-forward day runs at 03:00).
function resolve(zone: DateTime.TimeZone, wall: number) {
  const instant = DateTime.toEpochMillis(
    DateTime.makeZonedUnsafe(wall, { timeZone: zone, adjustForTimeZone: true, disambiguation: "earlier" }),
  )
  if (localWall(zone, instant) === wall) return instant
  // In a gap "earlier" lands before it; the gap ends at the first minute whose local time passes `wall`.
  return (
    Array.from({ length: 24 * 60 }, (_, index) => instant + (index + 1) * MINUTE).find(
      (candidate) => localWall(zone, candidate) > wall,
    ) ?? instant
  )
~~~~


## S04 — Admissão de prompt, lease e corrida de revogação

Vínculo: `body.md` §12; archive de evidência: `evidence.md`, seção `S04`.


### `packages/core/src/scheduled-task.ts`

Archive: `sources/packages/core/src/scheduled-task.ts` · bytes: 26123 · Git blob: `0a89bbdc576091ca01445e45e1500ed4008898a9` · SHA256: `8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b`.


Linhas **156–182**; SHA256 do intervalo `6faed758cfb62cba5f1849f441c03ad7cfa74204e5d877f0608e23b91f72089c`:

~~~~typescript
    const dispatch = (claimed: Claim, admitted = false) =>
      Effect.gen(function* () {
        const owner = claimed.task.policy === "capability" ? claimed.task.owner : undefined
        if (claimed.task.policy === "capability" && !(owner && (yield* cap.present(owner))))
          return { type: "revoked" } as const
        // Checked before the Session too, so a void claim leaves no empty Session behind.
        const checked = claimed.task.policy === "capability" && !admitted
        if (checked && !(yield* cap.holds(claimed))) return { type: "void" } as const
        const session = yield* sessions.create({
          id: claimed.sessionID,
          agent: owner?.agentID ?? AgentV2.defaultID,
          location: owner?.location ?? { directory: claimed.task.directory },
        })
        // An edit, pause or removal since the claim voids it before admission. What remains is the window from this
        // read to the durable admission inside `sessions.prompt` (its prompt hooks included); a claim revoked in it
        // still settles with an honest `started` receipt.
        if (checked && !(yield* cap.holds(claimed))) return { type: "void" } as const
        yield* sessions.prompt({ id: claimed.messageID, sessionID: session.id, prompt: { text: claimed.prompt } })
        return { type: "started", sessionID: session.id } as const
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            // A capability prompt that was admitted before the failure (a wake that failed, say) did start.
            const durable =
              claimed.task.policy === "capability" ? yield* SessionInput.find(db, claimed.messageID) : undefined
            if (durable) return { type: "started", sessionID: durable.sessionID } as const
            return { type: "failed", error: reason(cause) } as const
~~~~


Linhas **196–207**; SHA256 do intervalo `0dfbe91720b43cfe31c27eb5af8c3f8812ecb3332b97bc7d6b9db8310ed127d2`:

~~~~typescript
          // A claim an edit revoked while its prompt was being admitted keeps an honest receipt; it never counts
          // toward repeat or moves `next`, so this race can admit one run past the repeat limit.
          if (run?.state === "revoked" && outcome.type === "started")
            return yield* db
              .update(ScheduledTaskRunTable)
              .set({ state: "started", session_id: outcome.sessionID, error: null, time_settled: now })
              .where(eq(ScheduledTaskRunTable.id, run.id))
              .run()
          // Gone with its task, taken over after the lease ended (the new lease settles it), or revoked by an edit.
          if (run?.state !== "running" || run.owner !== lease) return
          if (outcome.type === "void")
            return yield* db.delete(ScheduledTaskRunTable).where(eq(ScheduledTaskRunTable.id, run.id)).run()
~~~~


Linhas **285–302**; SHA256 do intervalo `76bc5a87541218e37d4a882d6c8a1e7bfcaa89651409464deab1756074e33397`:

~~~~typescript
            .where(eq(ScheduledTaskRunTable.id, run.id))
            .run()
          return {
            id: run.id,
            task,
            sessionID: run.session_id,
            messageID: run.message_id,
            prompt: run.prompt,
          }
        }),
      )
      if (!claimed) return
      const admitted = yield* SessionInput.find(db, claimed.messageID)
      if (!admitted) return yield* settle(claimed, { type: "void" })
      const retried = yield* dispatch(claimed, true)
      if (retried.type !== "started") yield* Effect.logWarning("Scheduled run retry failed", retried)
      yield* settle(claimed, { type: "started", sessionID: admitted.sessionID })
    })
~~~~


### `packages/core/src/scheduled-task/capability.ts`

Archive: `sources/packages/core/src/scheduled-task/capability.ts` · bytes: 21721 · Git blob: `ab0410651446d3d1d98d9d8028a3ad79bb46aecb` · SHA256: `d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e`.


Linhas **137–145**; SHA256 do intervalo `d339c9448987bf0c71c326bfd0de45c58e29a91d369c77f3723cdd983e93bae2`:

~~~~typescript
        Effect.map(
          (row) =>
            row?.state === "running" &&
            row.lease === lease &&
            row.claimed === row.revision &&
            // A manual run may start while the schedule is paused.
            (row.enabled || row.slot === null),
        ),
      )
~~~~


Linhas **187–198**; SHA256 do intervalo `fb78aed49fc2f26818e0445282063659adc717e7cf339f9548adbf91358f66a0`:

~~~~typescript
      yield* Effect.forEach(
        pending,
        (run) =>
          Effect.gen(function* () {
            if (run.message_id && (yield* SessionInput.find(db, run.message_id))) return
            yield* db
              .update(ScheduledTaskRunTable)
              .set({ state: "revoked", error: "revoked by an edit", owner: null, time_settled: now })
              .where(eq(ScheduledTaskRunTable.id, run.id))
              .run()
          }),
        { discard: true },
~~~~


## S05 — Revisão, manual key e contabilização

Vínculo: `body.md` §12; archive de evidência: `evidence.md`, seção `S05`.


### `packages/core/src/scheduled-task/capability.ts`

Archive: `sources/packages/core/src/scheduled-task/capability.ts` · bytes: 21721 · Git blob: `ab0410651446d3d1d98d9d8028a3ad79bb46aecb` · SHA256: `d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e`.


Linhas **335–364**; SHA256 do intervalo `80b4fd0d5c92c88f745bca334b92821e854805d700df9c7294210feffa0cd0ea`:

~~~~typescript
    run: Effect.fn("ScheduledTask.capability.run")(function* (owner, id, manualKey) {
      const now = yield* Clock.currentTimeMillis
      const begun = yield* immediate(
        Effect.gen(function* () {
          const task = yield* owned(owner, id)
          if (!task) return { type: "missing" } as const
          const prior = yield* db
            .select()
            .from(ScheduledTaskRunTable)
            .where(and(eq(ScheduledTaskRunTable.task_id, id), eq(ScheduledTaskRunTable.manual_key, manualKey)))
            .get()
          if (prior) return { type: "prior", run: prior } as const
          return { type: "claimed", claim: yield* claim(task, undefined, now, manualKey) } as const
        }),
      )
      if (begun.type === "missing") return yield* new ScheduledTaskShared.NotFoundError({ id })
      if (begun.type === "prior") {
        // A revoked manual claim stays revoked: the same call never runs, a new call (new key) may.
        if (begun.run.state === "revoked")
          return yield* new ScheduledTaskShared.RunError({
            reason: `${begun.run.error ?? "revoked"}; retrying the same call will not run`,
          })
        // A claim still starting elsewhere (or stopped before its lease ended) is reused only once admitted.
        const admitted = begun.run.message_id && (yield* SessionInput.find(db, begun.run.message_id))
        if (begun.run.state === "running" && !admitted)
          return yield* new ScheduledTaskShared.RunError({ reason: "This run is still starting; retry shortly." })
        return { sessionID: begun.run.session_id, reused: true }
      }
      const outcome = yield* ops.dispatch(begun.claim)
      if (outcome.type === "started") {
~~~~


Linhas **455–466**; SHA256 do intervalo `293f0c3d7328a3a34be4fbb7553c3c3f23c667397a2ed78565946651ec9d734f`:

~~~~typescript
// A settled capability claim. Manual runs never move the schedule or count. A slot counts once its prompt was
// admitted; a failed slot is consumed, never retried. An edit since the claim already recomputed `next`.
export function settledCapability(task: Task, run: RunRow, outcome: Outcome): Partial<Task> {
  if (outcome.type === "revoked") return { enabled: false, disabled_reason: "owner-missing" }
  if (run.slot === null) return {}
  const runs = outcome.type === "started" ? task.runs + 1 : task.runs
  const moved =
    run.revision === task.revision && task.next <= run.slot ? following(capabilityTiming(task), run.slot) : {}
  if (task.repeat_limit !== null && runs >= task.repeat_limit)
    return { runs, ...moved, enabled: false, disabled_reason: "exhausted" }
  return { runs, ...moved }
}
~~~~


## S06 — Daemon, wake e inferência estática de create

Vínculo: `body.md` §12; archive de evidência: `evidence.md`, seção `S06`.


### `packages/core/src/scheduled-task.ts`

Archive: `sources/packages/core/src/scheduled-task.ts` · bytes: 26123 · Git blob: `0a89bbdc576091ca01445e45e1500ed4008898a9` · SHA256: `8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b`.


Linhas **85–95**; SHA256 do intervalo `acd69264fab22407c6a071a579a2d3c7ea9f4f04c7d593b913f90e75be50987f`:

~~~~typescript
    // At most one pending wake: the daemon needs to know that something was written, not how many times.
    const woken = yield* Queue.sliding<void>(1)
    const store = ScheduledTaskShared.store(db, crypto.randomUUID())
    // Every task write, legacy or capability, runs under `immediate`, so each one wakes a sleeping daemon.
    const tasks = {
      ...store,
      immediate: <A, E>(effect: Effect.Effect<A, E>) =>
        store.immediate(effect).pipe(Effect.tap(() => Queue.offer(woken, undefined))),
    }
    const { lease, immediate, find, lastRuns, advance, claim } = tasks
    const cap = ScheduledTaskCapability.make(tasks, sessions)
~~~~


Linhas **339–347**; SHA256 do intervalo `4bc19434c37a8375a5c59b753187934fddeb378585ccafe66eb038be0622bfeb`:

~~~~typescript
      // The next due slot, and the moment a running claim goes stale and can be taken over.
      const wanted = [next?.at, claimed?.at == null ? undefined : claimed.at + LEASE + 1].filter((at) => at != null)
      // Nothing is scheduled and nothing is running: only a task write can make a tick useful.
      if (wanted.length === 0) return yield* Queue.take(woken)
      const at = Math.min(...wanted)
      // A slot already due that the tick left alone (a held run, say) is retried at the old cadence, not in a spin.
      const delay = at > now ? Math.min(at - now, SLEEP_LIMIT) : TICK_MILLIS
      yield* Effect.race(Effect.sleep(delay), Queue.take(woken))
    })
~~~~


### `packages/core/src/scheduled-task/capability.ts`

Archive: `sources/packages/core/src/scheduled-task/capability.ts` · bytes: 21721 · Git blob: `ab0410651446d3d1d98d9d8028a3ad79bb46aecb` · SHA256: `d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e`.


Linhas **207–237**; SHA256 do intervalo `2f2fc041e6f5b956bb4dff5ef36d08a7ca0583c75eea95b04a8bf58040e5cee5`:

~~~~typescript
    create: Effect.fn("ScheduledTask.capability.create")(function* (owner, input) {
      const now = yield* Clock.currentTimeMillis
      const timezone = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
      const catchUp = input.catchUp ?? "latest"
      const enabled = input.enabled ?? true
      const next = firstSlot({ cadence: input.cadence, timezone, catchUp, enabled }, now)
      if (typeof next !== "number") return yield* next
      const id = ScheduledTask.ID.create()
      yield* db
        .insert(ScheduledTaskTable)
        .values({
          id,
          directory: owner.location.directory,
          name: input.name,
          prompt: input.prompt,
          ...encode(input.cadence),
          timezone,
          next,
          enabled,
          runs: 0,
          policy: "capability",
          owner,
          catch_up: catchUp,
          repeat_limit: input.repeat ?? null,
          time_created: now,
          time_updated: now,
        })
        .run()
        .pipe(Effect.orDie)
      return yield* getOwned(owner, id).pipe(Effect.orDie)
    }),
~~~~


## T01 — Testes existentes: intenção verificável, NOT_RUN

Vínculo: `body.md` §13; archive de evidência: `evidence.md`, seção `T01`.


### `packages/core/test/scheduled-task-capability.test.ts`

Archive: `sources/packages/core/test/scheduled-task-capability.test.ts` · bytes: 24066 · Git blob: `c96b90a80f985a84c74f8859c211b533f8600db6` · SHA256: `85eb84f706e0228bb8e4202c45d4b4c0ab8645bb2a04427b573cebd335b12af9`.


Linhas **337–359**; SHA256 do intervalo `4b1a6316d7464dcf41625142b1ed7727016c7b4455040b7d402d5a3f341046a1`:

~~~~typescript
  it.effect("a claim revoked while its prompt was admitted settles as started without counting", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const { db } = yield* Database.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, hourly)
      const slot = created.next!
      yield* TestClock.setTime(slot + MINUTE)
      // What an edit racing admission leaves behind: the claim revoked after the recheck.
      hook.onWake = db
        .update(ScheduledTaskRunTable)
        .set({ state: "revoked", owner: null })
        .where(eq(ScheduledTaskRunTable.task_id, created.id))
        .run()
        .pipe(Effect.asVoid, Effect.orDie)
      yield* tasks.tick
      const ids = slotIDs(created.id, 0, slot)
      expect((yield* inputs).map((row) => row.id)).toEqual([ids.message])
      expect((yield* runRows).map((row) => [row.state, row.session_id])).toEqual([["started", ids.session]])
      expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({ runs: 0, next: slot })
    }),
  )
~~~~
