# G57 — server.domain-surfaces: triagem semântica L1

Fonte fixa: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Delegação de `/root/producer_b` a `/root/producer_c`. Foram lidos integralmente os **51 membros exatos**, **157233 bytes**, **3620 linhas**, mais **16 arquivos de suporte** nos spans registrados. Nenhum produto foi executado. O estado atual é **evidência de produção não julgada**.

## O que esta revisão acrescenta

O grupo histórico dizia `L1_literal_surface`, `captured_literal_surface_indexed` e que os internals não haviam sido semanticamente revisados. Esse histórico está preservado integralmente em `historical-g57.json`. As entradas atuais registram propósito, dono delegado, decisões materiais locais, erros, autoridade e necessidades específicas. A leitura obrigatória local foi feita nesta revisão; não foi transferida genericamente para L2.

Não há membro G57 sem leitura nem dependência local de propósito/erro/autoridade ainda não lida. Isso não concede aceitação semântica: B ainda precisa integrar o suplemento à cobertura/corpo e os juízes independentes precisam avaliar o pacote. Os demais 139 membros históricos surface-only não são reclassificados por esta delegação.

## Limites materiais que a síntese deve preservar

- Auth comum depende de uma senha configurada não vazia; CapabilityAuthorization tem seu próprio fluxo Basic/bearer e private request frame. Principal é a conta do sistema operacional, não uma identidade remota individual.
- Content ticket é token aleatório opaco em memória, com cinco minutos por padrão e leitura novamente sob a autoridade mintadora. O comentário HMAC no middleware diverge da implementação.
- `health.get` retorna `healthy: true` sem sondagem de dependências. Config/trust persistem antes de reaplicar e ignoram falhas de reload/apply por Location.
- Session permission/question aplicam comparações locais de ownership; research artifact compara o binding retornado; os fluxos genéricos OAuth por attempt ID não têm a mesma comparação integrationID dos fluxos integration-scoped.
- Relay recusa checks executáveis por pertencerem ao Maestro; publica apenas após compilação/admissão, instala versões publicadas e reporta mudança já salva quando a gravação do recibo falha. Ledger íntegro externo continua `pending`/`external-self-reported`.
- RAG reidrata por Location e salva via delete/reinsert sem transaction local visível. Admissão chama extract antes de admit. Web UI mostra confinamento lexical, sem realpath/lstat; essas leituras não provam confinamento de symlinks ou ausência de races.

## Domínios e disposição dos 51 membros

| Domínio | Membros | Razão do grupo |
|---|---:|---|
| Actions bindings and operations | 9 | Shared Actions.Service, binding revision selection and a common typed error projection; each handwritten adapter and its local operation-selection branch was read. |
| Capability authority and management | 6 | Host-owned operator/verifier/ticket helpers and request-frame-backed operator, connection and schedule adapters; authentication and failure-boundary support were read explicitly. |
| Origin policy and public static UI | 2 | These modules own HTTP origin/header/static-file behavior rather than Core domain execution; API auth composition was read to keep the authority boundary explicit. |
| Agents, global settings, integrations and MCP | 7 | Configuration editing, trust propagation and external connection lifecycles have different local/global scopes and refusal behavior; each branch was inspected rather than classifying all as generic CRUD. |
| Atlas and Lean Location applications | 2 | Both expose Location-derived state through owned Core applications; Atlas also constructs chosen-model callbacks and Lean combines profile state with collector configuration. |
| Board application adapter | 1 | Board is a captured process service with its own mutation/refusal boundary and literal owner role argument; it is kept separate from Location-scoped handlers. |
| Catalog, status and maintenance adapters | 8 | Small adapters were read in full, with distinct read-only versus mutating/run purposes and their actual local error mappings; grouping does not assert shared Core implementation. |
| Projects, copies, Git and pull requests | 5 | Project/Location identity and filesystem/VCS delegation define these contracts; initialization, naming and activity scoping have explicit local behavior. |
| Session requests, research and schedules | 5 | Ownership checks, persisted Session placement and task/directory scoping were read separately; generic wrapper grouping does not erase the different authority rules. |
| RAG rehydration and API adapter | 2 | The two modules jointly own the SQL-to-memory-to-SQL request bridge and rejection projection. Their local persistence order and extraction boundary are material L1 facts. |
| Relay authoring, publication, hooks and external ledgers | 4 | Project storage, publication gates, pinned installs, receipt ordering and external self-reporting form a coherent boundary with Maestro-owned execution. |

## Actions bindings and operations

Mandatory now: purpose, delegated owner, local errors and authority/placement boundary for every member.

### packages/server/src/handlers/actions-binding.ts

Adapt binding CRUD, capability inspection, and binding-policy operations to Actions.Service.

**Autoridade/ownership:** Binding selection is the path bindingID plus query revision. Update refuses a conflicting payload expectedRevision and replaces it with the selected query revision.

**Erros:** Uses actions-common.result for ActionsError to ActionsApiError projection; stale update is constructed locally as kind binding_stale.

**Fatos materiais lidos:**

- List/create/get/remove delegate to bindings; capabilities and policy operations use the selected binding reference.
- Update checks the explicit revision disagreement before delegating, so a caller cannot select one revision and update using another through this adapter.

**Proveniência:** blob `7aa3bf6ff8d82ac41e35acb9ffbc4ec44acb07b7`; SHA-256 `e7fc29a45370ba8c4456e5c27ee0aaea2c4460b386be04ad5fcf3b91531f73d8`; leitura integral 1–43. Excertos: 9–19 (G57-E008), 21–29 (G57-E009), 31–41 (G57-E010). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-actions-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/actions-common.ts

Share the binding reference and typed error projection used by Actions handlers.

**Autoridade/ownership:** bindingRef combines the route binding ID with the query revision; it is an identifier, not a grant.

**Erros:** Copies kind, message, bindingID, provider, resourceID, retryAfter, operationID and disposition into ActionsApiError; wraps the effect in the Location response envelope.

**Fatos materiais lidos:**

- result maps only the typed ActionsError channel using apiError before response.
- No authorization or Actions execution is implemented by this helper.

**Proveniência:** blob `2b0ee980a3993effc238c54b685c3dbd90a184ba`; SHA-256 `fb84f207b325f69b222a5b45ba819f93c517acb3d1ad1b6c4c3e6a56198f8c5f`; leitura integral 1–21. Excertos: 7–20 (G57-E011). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-actions-core`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/actions-job.ts

Delegate retry/play/cancel/erase commands for a job through Actions.execute.

**Autoridade/ownership:** Each call supplies the selected binding revision, ctx.payload, and path jobID to Core.

**Erros:** All four handlers use actions-common.result; no separate local error rewrite.

**Fatos materiais lidos:**

- The operation literals are job.retry, job.play, job.cancel and job.erase; no job execution loop or provider API call is implemented here.

**Proveniência:** blob `3ac7250773470110baf53e02423c05e23fc18105`; SHA-256 `85f341e3e2cf019a10e584f4ed56c4ca8e450586d3a86ac38d14b527097e2774`; leitura integral 1–25. Excertos: 9–23 (G57-E012). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-actions-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/actions-operation.ts

Prepare, fetch, and reconcile Actions operations.

**Autoridade/ownership:** Operations are selected under bindingRef; get/reconcile forward path operationID.

**Erros:** Each result uses the shared Actions error projection.

**Fatos materiais lidos:**

- Preparation forwards ctx.payload to actions.prepare; retrieval and reconciliation are distinct Core methods.

**Proveniência:** blob `6a321cd67a6b8f063fab15e3447713086d1af6ab`; SHA-256 `9109722eed624929e576c90f906b1ad9ba3fa7becbcfba04d6b8071f62ae6408`; leitura integral 1–21. Excertos: 9–19 (G57-E013). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-actions-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/actions-pipeline.ts

Select and forward merge-request and trigger pipeline operations.

**Autoridade/ownership:** Uses bindingRef; mergeRequest supplies path mergeRequestID as resourceID and trigger supplies ctx.payload.input.ref.

**Erros:** Shared Actions result/error projection.

**Fatos materiais lidos:**

- The two operation kinds are pipeline.mergeRequest and pipeline.trigger; request data is delegated to Actions.execute.

**Proveniência:** blob `5f7dff4cabd0fede451fd7ec25a9028617a919c5`; SHA-256 `f31f6d4929009eb9d6d72d4d882dfa100fab8185d707f970e8fc738d35e18ea6`; leitura integral 1–17. Excertos: 9–15 (G57-E014). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-actions-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/actions-resource.ts

Translate resource listing filters and generic resource commands into Actions calls.

**Autoridade/ownership:** Resource commands keep bindingRef and send the resourceKind as operation context; optional list fields are included only when defined.

**Erros:** Shared Actions result/error projection; command mapping has a resource.update fallback.

**Fatos materiais lidos:**

- Commands select cache.clear for clear, artifact.keep for keep, deployment.review or schedule.play for play, runner.register or resource.create for create, runner.remove or resource.delete for delete; other actions map to resource.update.

**Proveniência:** blob `aa2fea3cc2877ce7ce42632768ec2afc7b23bf9d`; SHA-256 `a3da138d4f5f6321c18bc790da67debf1df622c9fd86563bfc80b683fe054797`; leitura integral 1–34. Excertos: 10–21 (G57-E015), 23–32 (G57-E016). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-actions-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/actions-run.ts

Delegate run queries, job listing, retry and run lifecycle commands to Actions.

**Autoridade/ownership:** Run and job queries carry the selected binding reference and path runID. No provider credential resolution occurs locally.

**Erros:** Shared Actions result/error projection.

**Fatos materiais lidos:**

- Run list forwards workflow/cursor/limit and ref/event/status/commit/actor/time filters; jobs forwards attempt and cursor.
- Retry selects run.retryFailed only for provider github with mode failed; otherwise run.retry. The other command kinds are explicit cancel, forceCancel, delete, approveFork and rename literals.

**Proveniência:** blob `598f6f3e0647fe53f6632bf78b66673b75bbbd24`; SHA-256 `6177fd44ef1e567f825c12a96e95bb304ee6183a0643267bc43f7d48be37881f`; leitura integral 1–51. Excertos: 9–24 (G57-E017), 26–29 (G57-E018), 31–49 (G57-E019). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-actions-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/actions-source.ts

Expose source base and draft/source validation, and translate source mutation commands.

**Autoridade/ownership:** All calls retain bindingRef; validation forwards the declared base/path/draft or source/draft inputs.

**Erros:** Shared Actions result/error projection.

**Fatos materiais lidos:**

- The command kind is source.branch for branch, source.review for review, and source.write otherwise. Core owns the actual validation and operation.

**Proveniência:** blob `319bb830d248814d20a27a94de91520be213d5c8`; SHA-256 `9194ce2bd2796955ba7d51c8c42af63c6b6f151679786067468bb736172a7dfa`; leitura integral 1–26. Excertos: 9–19 (G57-E020), 21–25 (G57-E021). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-actions-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/actions-workflow.ts

Delegate workflow listing/source/graph/dispatch and enabled-state operations.

**Autoridade/ownership:** Selection carries bindingRef; source and graph take path/ref query inputs and dispatch/state take path workflowID.

**Erros:** Shared Actions result/error projection.

**Fatos materiais lidos:**

- Dispatch uses workflow.dispatch. State chooses workflow.enable or workflow.disable from ctx.payload.input.enabled.

**Proveniência:** blob `09f777cf05508ebc344e81f47a8ccb61f2285051`; SHA-256 `5242b8c6457eec826e492f2cfa421058478822e83be41110cf50e8647da7cd28`; leitura integral 1–32. Excertos: 9–21 (G57-E022), 23–30 (G57-E023). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-actions-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.


## Capability authority and management

Mandatory now: purpose, delegated owner, local errors and authority/placement boundary for every member.

### packages/server/src/capability-content-ticket.ts

Issue and verify short-lived opaque content references bound to the minting authority, session, and artifact revision.

**Autoridade/ownership:** The claim stores authority; verification returns that stored authority and does not accept a replacement from the content URL.

**Erros:** Unknown or expired tickets return undefined; expiry removes the stored entry. The content consumer maps missing tickets to empty 401.

**Fatos materiais lidos:**

- The default TTL is five minutes. Mint cleans expired entries, creates 32 random bytes encoded base64url, stores the claim in a process-local Map, and returns /api/capability/content/<token>.
- Verification checks Date.now() against the stored expiry; it does not consume a still-valid ticket. Restart persistence is not supplied by this Map.
- The consumer first checks management.get before minting, requires RequestAuthority, then re-enters operators.withRequest with the stored authority when reading content.

**Proveniência:** blob `ac3409c69b8d5b283a316198498048cf7d817279`; SHA-256 `e054ec3a19e8dedf9bbf380636f9f0592c17e6a770e7b0eb53be0404ef661444`; leitura integral 1–51. Excertos: 9–18 (G57-E001), 25–25 (G57-E002), 33–48 (G57-E003). Perfil compartilhado de autoridade: `host_helper`.

**Necessidades condicionais:** `N-capability-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/capability-verification.ts

Supply the capability connection verifier as a host-constructed Effect service.

**Autoridade/ownership:** Production construction calls CapabilityConnectionVerification.make; route options can inject a verifier at host composition time, while the connect handler passes request payload to setup.connect.

**Erros:** Factory failure is converted with Effect.orDie; this facade declares no request-error policy of its own.

**Fatos materiais lidos:**

- Service is typed as CapabilityConnectionSetupContract.Verifier.
- The layer invokes the Core factory once as service construction rather than taking a verifier from a request payload.

**Proveniência:** blob `2ccb45657ac106cc605a715ce4d37b405f322746`; SHA-256 `0fe9c21339044189df48ee9d6e300f9131e6b89ddc7f46921fb35bf46cbe9876`; leitura integral 1–12. Excertos: 7–12 (G57-E004). Perfil compartilhado de autoridade: `host_helper`.

**Necessidades condicionais:** `N-capability-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/capability-connections.ts

Construct connection setup/binding/management adapters and expose their operations.

**Autoridade/ownership:** ServerOperator, the database and the trusted verifier are captured at handler construction; setup uses an operator-backed request ledger. Connect/list compute placement from current Location.

**Erros:** connectionResponse rewrites typed failures: Capability.Failure uses capabilityError; other typed failures become constant ForbiddenError(Request denied). Non-failure cause reasons and annotations are preserved.

**Fatos materiais lidos:**

- Management is constructed outside individual handlers with the database supplied; the comment assigns cursor encryption-key lifetime to that handler layer.
- Connection/target/binding mutations delegate payloads to Core management methods; server request payload does not replace the verifier or operators.

**Proveniência:** blob `9ca64346ea1c6511674199f2bf4fe05eca666f4a`; SHA-256 `fb21aa9975ceb975bedb3fe16cc85b367cd9a3f27691ea7eb9541f93574cbb91`; leitura integral 1–69. Excertos: 20–36 (G57-E034), 41–57 (G57-E035), 61–69 (G57-E036). Perfil compartilhado de autoridade: `capability`.

**Necessidades condicionais:** `N-capability-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/capability-operator.ts

Inspect the authenticated operator binding for the current placement.

**Autoridade/ownership:** Calls operator.require(action operator.inspect) with project ID and Location.Ref; returns only requestID, principal, origin and scopeHash.

**Erros:** Failure reasons are passed through capabilityError with annotations retained; non-Fail causes are preserved.

**Fatos materiais lidos:**

- Inspection is a Core require call, not a direct echo of caller-supplied identity or grant fields.

**Proveniência:** blob `e3054b31517cb6aac79153ea7926e3fa0f9831cb`; SHA-256 `c5e69c65cb5066136993dc01ddac5e9b3fd929b2903a0fb4c99976addfea53ee`; leitura integral 1–27. Excertos: 16–27 (G57-E037). Perfil compartilhado de autoridade: `capability`.

**Necessidades condicionais:** `N-capability-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/capability-schedules.ts

Operate agent capability schedules through CapabilityScheduleOperator.

**Autoridade/ownership:** The management facade receives ServerOperator and tasks.capability. Every list/pause/resume/run/remove call supplies current project/location placement.

**Erros:** Capability failures use capabilityError; ScheduledTask.InvalidError becomes ConflictError(Schedule cannot resume); other typed errors become ConflictError(Schedule run did not start). Non-Fail reasons and annotations remain.

**Fatos materiais lidos:**

- This handler has list/pause/resume/run/remove operations, not create/edit.
- The broad comment about a constant 403 is bounded by the executable mapError branches: authentication capability failures can become UnauthorizedError and schedule errors can become ConflictError.

**Proveniência:** blob `73da4c80420f4ae1339eaf45194497f5006caf5e`; SHA-256 `45b4fdc1b7c9d35d5d995523414dad446f968e667b73680ee2ca47ed883ab8f3`; leitura integral 1–48. Excertos: 14–31 (G57-E038), 35–48 (G57-E039). Perfil compartilhado de autoridade: `capability`.

**Necessidades condicionais:** `N-capability-core`, `N-schedule-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/operator.ts

Expose the host operator facade and create its default Core authority scope.

**Autoridade/ownership:** The default calls CapabilityOperator.make with Principal.account and scope placements instance, actions [*]. Routes can inject a different operator at host construction.

**Erros:** Core factory failure becomes a defect through Effect.orDie.

**Fatos materiais lidos:**

- The interface owns no authorization algorithm here; the Core factory owns authority and the private request frame. OS account attribution is not a per-person remote login model.

**Proveniência:** blob `36a1723eea73686796fe3917b42bfbfad6ed6386`; SHA-256 `061a54b7023425c5b0f9d78a9b41fcd84995a6553e2826725ff64245bcbc1199`; leitura integral 1–15. Excertos: 8–15 (G57-E130). Perfil compartilhado de autoridade: `host_helper`.

**Necessidades condicionais:** `N-capability-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.


## Origin policy and public static UI

Mandatory now: purpose, delegated owner, local errors and authority/placement boundary for every member.

### packages/server/src/cors.ts

Define CORS/request-origin predicates and repair the response Vary header for dynamically echoed origins.

**Autoridade/ownership:** Origin acceptance is an origin policy, separate from API credential or capability authority.

**Erros:** sameHost catches URL parsing failure and returns false; missing origin is allowed. No authentication error is created here.

**Fatos materiais lidos:**

- CORS accepts missing origin, literal localhost/127.0.0.1 and oc://renderer prefixes, three Tauri origins, or an exact configured extra origin.
- The request-origin predicate also allows a URL whose host equals the supplied host. Global CORS middleware sets maxAge 86400.
- Vary repair acts only for a non-wildcard access-control-allow-origin, preserving existing Origin or * tokens and otherwise adding Origin.

**Proveniência:** blob `767f94807b1c6437467f6f1e35bd784fbd004b16`; SHA-256 `d4f02ba7c886b1a0cc3f53863398b4e78eed59c9a94915bad38fa5ee24461dbb`; leitura integral 1–69. Excertos: 10–31 (G57-E005), 35–41 (G57-E006), 55–66 (G57-E007). Perfil compartilhado de autoridade: `origin_helper`.

**Necessidades condicionais:** `N-origin-hardening`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/web-ui.ts

Serve the built static UI with HTML CSP and SPA fallback outside API routing.

**Autoridade/ownership:** The web layer is merged separately from the API layer. It resolves requested paths lexically under the root and falls back to index.html for missing/outside paths.

**Erros:** exists swallows stat failure as false; file read/URI decode failures have no local protocol-error conversion.

**Fatos materiais lidos:**

- HTML CSP permits self scripts plus the SHA256 of a matching inline theme-preload script, wasm-unsafe-eval, inline styles and the other explicit directives.
- The function reads bytes with Bun.file; lexical containment is shown, but no realpath/lstat symlink check is implemented in this helper.

**Proveniência:** blob `6bdd0f2213ecb53ca74ac935c0a16da1198fae77`; SHA-256 `2b473ed1ba3f6de98f602a6f47af37715dc827f989b7b7233df1355568bd83dc`; leitura integral 1–55. Excertos: 9–23 (G57-E138), 30–46 (G57-E139), 52–55 (G57-E140). Perfil compartilhado de autoridade: `public_static`.

**Necessidades condicionais:** `N-web-files`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.


## Agents, global settings, integrations and MCP

Mandatory now: purpose, delegated owner, local errors and authority/placement boundary for every member.

### packages/server/src/handlers/agent.ts

List/annotate agents, present materialized tools and available skills, and edit configuration agent files.

**Autoridade/ownership:** Process-global FSUtil and AgentExecution.Annotate are captured at handler construction. Agent file reads/writes use the current Location.directory after ConfigAgentFile.validName; detail materializes tools using the selected agent permissions.

**Erros:** Unknown agent and invalid name become InvalidRequestError; write conflict becomes ConflictError; RejectedError becomes agent_file_<reason>; other file errors become UnknownError.

**Fatos materiais lidos:**

- agent.detail obtains the agent, materializes registry definitions under agent.permissions, filters skills through SkillV2.available, and includes toolkit engine information.
- File update writes before agents.reload; reload is awaited. A successful write is not evidence that a later reload cannot fail.
- Toolkit branches query BackendToolkit.status or ResearchToolkit.status and combine results with manifests; underlying status implementation is outside this adapter reading.

**Proveniência:** blob `640c9a2368bbe9d60c5921545fc52e9a9c649ed9`; SHA-256 `5ea8a0c52977d04e833edd5e6f8198062b494c1f5f0df50d06fbddc5b7650950`; leitura integral 1–144. Excertos: 20–29 (G57-E024), 34–55 (G57-E025), 75–88 (G57-E026), 129–144 (G57-E027). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-core-domain`, `N-filesystem`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/behavior.ts

Set the Location behavior selection through BehaviorV2.

**Autoridade/ownership:** Forwards ctx.payload.behaviors to the current BehaviorV2.Service.

**Erros:** BehaviorV2.DuplicateError becomes InvalidRequestError with kind duplicate and field behaviors.

**Fatos materiais lidos:**

- The only local semantic branch is the duplicate-error translation around behavior.set and the Location response envelope.

**Proveniência:** blob `8388d785f544120e4e9f36bce79d68f64b412b40`; SHA-256 `285b610ffb742ebc0e1f19a24b6eb0c0303552d1fe351cef6c6152bd8cc5d8a2`; leitura integral 1–20. Excertos: 8–18 (G57-E031). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-core-domain`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/config.ts

Read/update global configuration and request reload of agents and catalog in open Locations.

**Autoridade/ownership:** Captures process-global FSUtil, Global and LocationServiceMap; updates target global configuration rather than a caller-selected Location document.

**Erros:** Config write failures are not caught locally. Per-Location reload failures are explicitly ignored; the handler then returns NoContent.

**Fatos materiais lidos:**

- After Config.updateGlobal, each open reference is acquired in a scoped effect and its AgentV2 and Catalog services reload.
- NoContent after that loop does not establish that every open Location reloaded successfully.

**Proveniência:** blob `7c646dd72c47b4d58656a6111fbf0778f90b379d`; SHA-256 `8f0a504c3e526069e47d3a750a3b284da708a7383f25cc6a854e540b032808f9`; leitura integral 1–48. Excertos: 14–29 (G57-E041), 31–44 (G57-E042). Perfil compartilhado de autoridade: `global`.

**Necessidades condicionais:** `N-config-propagation`, `N-core-domain`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/credential.ts

Rename or remove a credential through Integration.connection.

**Autoridade/ownership:** Update forwards only label for path credentialID; remove forwards that credential ID.

**Erros:** Credential.InheritedError maps to ConflictError(resource credential); success returns NoContent.

**Fatos materiais lidos:**

- The handler does not implement storage, encryption, inherited-credential ownership or secret resolution.

**Proveniência:** blob `08007dd56e73cfeec007509e073613c1e528c2af`; SHA-256 `ed4d52333c3fdb307c1419728b290231ad91581223c05b652b75251d16b4ab4e`; leitura integral 1–34. Excertos: 13–17 (G57-E043), 23–33 (G57-E044). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-integration-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/integration.ts

Manage integration discovery, key/OAuth connections, attempts and disconnect.

**Autoridade/ownership:** Integration-scoped OAuth status/complete/cancel call requireOwner, which gets the attempt then checks ownedBy(attemptID,integrationID). Generic attempt routes delegate by attempt ID without that integration-ID comparison.

**Erros:** Authorization errors become a constant integration_authorization InvalidRequestError; code-required and absent-attempt use separate kinds; inherited disconnect becomes credential ConflictError.

**Fatos materiais lidos:**

- The owner check runs before integration-scoped complete/cancel.
- Key connect forwards integrationID, key, label and metadata; OAuth start forwards integrationID, methodID, inputs and label. The adapter does not prove Core secret storage or OAuth lifecycle semantics.

**Proveniência:** blob `0eb75bff9d589c22795ca235b7a6cb24cd95108a`; SHA-256 `f557b26f8f989ed47826c7ce4f26fd1ab2924b2fed7f7b73cd2e3e5e8e473751`; leitura integral 1–163. Excertos: 8–28 (G57-E050), 42–51 (G57-E051), 73–79 (G57-E052), 84–110 (G57-E053), 114–136 (G57-E054), 140–159 (G57-E055). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-integration-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/mcp.ts

Adapt MCP catalog/configuration/connections and OAuth actions.

**Autoridade/ownership:** All operations use Mcp.Service under the selected Location; path server identifies add/remove/connect/disconnect/debug/auth targets.

**Erros:** Mcp.NotFoundError becomes McpServerNotFoundError; configuration/auth errors become InvalidRequestError carrying their message.

**Fatos materiais lidos:**

- List/catalog/config/entries/tools are read adapters. Add/remove/config changes and connect/disconnect are delegated to Core.
- Auth start, callback with payload.code and remove are distinct Core calls; this adapter does not establish transport isolation or credential safety.

**Proveniência:** blob `70a6b0ba7d3b8a8ee71fb9ba42b55710d1b43a18`; SHA-256 `8b141ac204fe14e72a5576277a0c4c493a43b7921dfc4309b26d0b9fb08d5ad8`; leitura integral 1–95. Excertos: 10–21 (G57-E061), 25–45 (G57-E062), 61–84 (G57-E063), 89–95 (G57-E064). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-mcp-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/trust.ts

Read/approve/revoke global project trust and reapply it to MCP in open Locations.

**Autoridade/ownership:** Captures process-global FSUtil, Global and LocationServiceMap; approve/revoke use caller directory in ConfigTrust and then visit each cached Location.

**Erros:** Approve maps ConfigTrust.DirectoryError to InvalidRequestError; individual MCP applyTrust failures are ignored.

**Fatos materiais lidos:**

- Persistence occurs before applyTrust; success does not establish that every open MCP service applied the new trust state.

**Proveniência:** blob `c6ca8337aaaee3a64bc2b9dac74764edd9ee1975`; SHA-256 `8ad52039bad0345cbe1926be946a4d1642230f07abb536c5d5324df7741116f2`; leitura integral 1–64. Excertos: 14–29 (G57-E123), 41–49 (G57-E124), 55–60 (G57-E125). Perfil compartilhado de autoridade: `global`.

**Necessidades condicionais:** `N-config-propagation`, `N-mcp-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.


## Atlas and Lean Location applications

Mandatory now: purpose, delegated owner, local errors and authority/placement boundary for every member.

### packages/server/src/handlers/atlas.ts

Expose the Location-owned Atlas surface and supply chosen-model callbacks for delegate/mine.

**Autoridade/ownership:** Atlas.open receives process npm/process dependencies plus a root computed from the Location project/directory and project ID. Model selection comes from that Location catalog and integrations.

**Erros:** Atlas.Unavailable is mapped to ServiceUnavailableError(service atlas). The local model-selection branch creates Error when the requested provider/model is unavailable; a universal conversion of every LLM error is not established here.

**Fatos materiais lidos:**

- The model callback resolves catalog credentials, generates a fresh SessionID for headers, streams a plain LLM request with a supplied system prompt, and concatenates text-delta events.
- delegate supplies Atlas.DELEGATE_SYSTEM plus decodeReply; mine supplies Atlas.MINE_SYSTEM. These adapter calls are not a runtime Atlas qualification.

**Proveniência:** blob `692afb828dc5c896339adfebbb5e33ef39876347`; SHA-256 `5eacbbeeea4ae154b77523f0f3bb14bd6921816ad4ebbb7ee5145050ab874267`; leitura integral 1–117. Excertos: 21–36 (G57-E028), 40–68 (G57-E029), 92–114 (G57-E030). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-atlas-lean-core`, `N-llm-runtime`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/lean.ts

Expose Lean preferences, collector state, and history for a Location-derived owner.

**Autoridade/ownership:** Owner is {projectID, directory}; preferences capture global filesystem services and collector captures database. History uses the scope returned by the owner preferences.

**Erros:** LeanProfilePreferences.Unavailable maps to ServiceUnavailableError(service lean).

**Fatos materiais lidos:**

- get/update combine stored profile preferences with LeanOutput.configured before collector.read; history reads the preference scope before collector.history.

**Proveniência:** blob `3e1eb7e0e5e2215e28b9eed247e0f24d0477d97a`; SHA-256 `9b731bdeefe1059a653dbe03f2279f1a0f4e77de0eb162943ab32dd14bf2ed4f`; leitura integral 1–49. Excertos: 17–30 (G57-E056), 33–45 (G57-E057). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-atlas-lean-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.


## Board application adapter

Mandatory now: purpose, delegated owner, local errors and authority/placement boundary for every member.

### packages/server/src/handlers/board.ts

Expose Board queries and owner/action commands using the process service.

**Autoridade/ownership:** The handler captures Board.Service. The settings call supplies the literal role owner; this adapter does not resolve a per-person role from the request.

**Erros:** Read helpers map Board.NotFoundError to BoardNotFoundError; mutation helper maps that tag to not-found and every other Board.Error to BoardRefusedError.

**Fatos materiais lidos:**

- Queries include summary/snapshot/issue/activity/spend/decisions/proof. Mutation methods delegate decision/settings/answer/note/attachment/lifecycle/sync/issue decisions.
- The local literal owner argument is a delegation contract; it is not proof of a per-user authorization system.

**Proveniência:** blob `9b11b400cbcc5da7dfcd6dbd9a04a09425868bde`; SHA-256 `dfeb5365d7c500527e66e3c455a70e1e5fa1bf09c1b55f9ceceb739d65aa0ee5`; leitura integral 1–58. Excertos: 9–23 (G57-E032), 45–57 (G57-E033). Perfil compartilhado de autoridade: `global`.

**Necessidades condicionais:** `N-board-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.


## Catalog, status and maintenance adapters

Mandatory now: purpose, delegated owner, local errors and authority/placement boundary for every member.

### packages/server/src/handlers/command.ts

Expose the slash-command catalog.

**Autoridade/ownership:** Delegates to SlashCommand.list inside the Location response envelope.

**Erros:** No local catch or error conversion.

**Fatos materiais lidos:**

- This is a list adapter; it does not execute a slash command.

**Proveniência:** blob `c08e4f1218f1c7a33170069b8b116605ea598246`; SHA-256 `14ecfafbebb9e6bc79db2be87e5f9d64fd753d64f1166c8d1b41506ed60fcd33`; leitura integral 1–8. Excertos: 6–8 (G57-E040). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-core-domain`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/formatter.ts

Expose formatter status.

**Autoridade/ownership:** Uses the Location Format.Service and response envelope.

**Erros:** No local catch or error conversion.

**Fatos materiais lidos:**

- Calls format.status; it does not invoke formatting.

**Proveniência:** blob `b6bb087654048fec526a9980c595105ecc921989`; SHA-256 `463e3f34b673e5e7ffcf645245508750699e457df8ef5d5c3d9f6720241ce1dc`; leitura integral 1–8. Excertos: 6–8 (G57-E045). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-core-domain`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/guardrail.ts

Expose Guardrail rule discovery and requested engine runs.

**Autoridade/ownership:** Uses Guardrail.Service from the request Location and forwards run payload.

**Erros:** EngineError becomes protocol GuardrailError with data.kind and data.message.

**Fatos materiais lidos:**

- The adapter delegates rules and run; it does not independently establish rule enforcement by all other execution paths.

**Proveniência:** blob `b3348283ee22836d8ff08f2237574fd5b82931bc`; SHA-256 `d9669d237611181456858a8d0880392578f3b2432c1d5e0932fb70e6ecbbe9a5`; leitura integral 1–32. Excertos: 11–24 (G57-E046), 30–32 (G57-E047). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-guardrail-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/health.ts

Return a basic process/version liveness response.

**Autoridade/ownership:** Does not require Location services; API-wide credential policy still applies through composition.

**Erros:** Effect.succeed returns the object directly; no probe failure path.

**Fatos materiais lidos:**

- The response is healthy: true, process.pid and InstallationVersion. It is not a database/provider/engine readiness probe.

**Proveniência:** blob `2de8e84ad6fe8833aaf3843ff0d292de49bd825a`; SHA-256 `a45c1f389238590e7545fc35f83d5b48baa6f74062e028e95b11e6766c44ab3d`; leitura integral 1–10. Excertos: 6–9 (G57-E048). Perfil compartilhado de autoridade: `global`.

**Necessidades condicionais:** `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/installation.ts

Delegate an installation upgrade with an identified method and requested target.

**Autoridade/ownership:** Captures Installation.Service at handler construction; payload.target is passed to upgrade after method detection.

**Erros:** Unknown method becomes InvalidRequestError(installation_unknown); upgrade error.stderr becomes UnknownError; success returns requested target as version.

**Fatos materiais lidos:**

- The success object follows the service upgrade call; it is not an independently measured installed-version check.

**Proveniência:** blob `5f877ca7ccfc706ed9ca1e1c8cc9ac6971c698c2`; SHA-256 `3d5b63f50f030e884075152534e35400ae6ad91bf0f187a45bf1d13fce699842`; leitura integral 1–26. Excertos: 9–22 (G57-E049). Perfil compartilhado de autoridade: `global`.

**Necessidades condicionais:** `N-installation-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/lsp.ts

Expose LSP status.

**Autoridade/ownership:** Uses the Location LSP.Service and response envelope.

**Erros:** No local catch or error conversion.

**Fatos materiais lidos:**

- Calls lsp.status; it does not execute a language operation or start a server explicitly.

**Proveniência:** blob `08ad1abc8064d1f0868db1d74d67a3d653a8a19c`; SHA-256 `f8fc0e69a5aa0c7b35238aa3b1a901784be77bfc7f22008a7768cfab239cac18`; leitura integral 1–8. Excertos: 6–8 (G57-E060). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-core-domain`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/reference.ts

Expose the reference catalog.

**Autoridade/ownership:** Uses Reference.Service under the Location response envelope.

**Erros:** No local catch or error conversion.

**Fatos materiais lidos:**

- Calls reference.list; no reference resolution/execution mechanism is implemented here.

**Proveniência:** blob `ce39a2f3aa082549fd456f42773c2c4e59a2d69c`; SHA-256 `521ea525989df9cb283c92f78fefef28aec0dd4873a0dc223b83297dd42b411b`; leitura integral 1–8. Excertos: 6–8 (G57-E092). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-core-domain`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/skill.ts

List/save/remove skill files through the Location skill service.

**Autoridade/ownership:** Save passes Location.directory plus name/description/content, payload.path as location, and mtime; remove passes Location.directory and query.path.

**Erros:** Save conflict becomes ConflictError(resource skill); other write errors become InvalidRequestError. Remove always maps SkillWriteError to InvalidRequestError with field path.

**Fatos materiais lidos:**

- The API forwards optimistic mtime data, but filesystem path checks and write conflict enforcement are owned by the skill service.

**Proveniência:** blob `c06aa460901ac45fcfa0abee5b1d3833a9da8c88`; SHA-256 `e03ed59e0234bb6fd002db5a6e1ace5627ba1b0a70b1949ca934b2efd9d14a9c`; leitura integral 1–47. Excertos: 16–27 (G57-E120), 33–38 (G57-E121), 44–47 (G57-E122). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-filesystem`, `N-core-domain`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.


## Projects, copies, Git and pull requests

Mandatory now: purpose, delegated owner, local errors and authority/placement boundary for every member.

### packages/server/src/handlers/location.ts

Describe a requested Location and make its project known before Sessions exist.

**Autoridade/ownership:** Uses Location.Service and captures database/events; records project ID, project directory and VCS before returning Location.Info.

**Erros:** No local catch or error rewrite around ProjectV2.record.

**Fatos materiais lidos:**

- location.get has a recording side effect; location.paths returns Global.Path.home.

**Proveniência:** blob `fd37ae5eefd249b1f06db4a3057b6bd8970615e7`; SHA-256 `9c6224360c8bcfcfb3973f2b200c4bb8b9c57d2b32ef55c912a4784ed7a09a4e`; leitura integral 1–34. Excertos: 12–29 (G57-E058), 32–32 (G57-E059). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-project-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/project-copy.ts

Delegate copy lifecycle and supply optional LLM-generated copy names.

**Autoridade/ownership:** Create overlays route projectID and Location.project.directory onto the payload; remove/refresh carry route projectID. Name generation uses the Location catalog and integrations.

**Erros:** ProjectCopy errors map to ProjectCopyError with translated message and optional Git.WorktreeError.forceRequired; any name-generation cause is logged and falls back to Slug.create.

**Fatos materiais lidos:**

- Name generation returns a random slug without trimmed context or a default model, otherwise chooses the provider small model or default and resolves credentials.
- The LLM request carries a fresh session-routing header and ProjectCopy.NAME_SYSTEM. The handler catches all generation causes; it does not assert that a model response is always available.

**Proveniência:** blob `fa6258457253f29e7edb555079aac1565c2a9409`; SHA-256 `4dda2be957852dec674c9b87ab10d95d13f86eba9bd053c915739defb755ad90`; leitura integral 1–116. Excertos: 19–40 (G57-E071), 50–60 (G57-E072), 77–84 (G57-E073), 90–115 (G57-E074). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-project-core`, `N-llm-runtime`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/project.ts

List/update projects and initialize a Git project before Location services can exist.

**Autoridade/ownership:** Captures project/database/events/git services. initGit derives a ref from the request rather than Location middleware, initializes and resolves that directory.

**Erros:** Missing project on update becomes InvalidRequestError(field projectID); initGit has no local catch.

**Fatos materiais lidos:**

- initGit returns the resolved Location.Info and project result or null; update invokes ProjectV2.update with database/events.

**Proveniência:** blob `0c4bdacc001ec83007a4ad52f643f01e47d21164`; SHA-256 `2729612650a620155d83aa017ce98b15dfe1d36c5fff8a9da72bff14ad030b95`; leitura integral 1–49. Excertos: 15–28 (G57-E075), 31–45 (G57-E076). Perfil compartilhado de autoridade: `global`.

**Necessidades condicionais:** `N-project-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/pull-request.ts

List/create pull requests using the Location PullRequest service.

**Autoridade/ownership:** Create forwards payload to PullRequest.Service; host execution and credentials remain owned by that service.

**Erros:** HostError projects kind/message/host/branch/remote into protocol PullRequestError.

**Fatos materiais lidos:**

- The adapter returns the Location envelope around both list and create.

**Proveniência:** blob `20ab373169610e127ba50ef1313412c89e64783e`; SHA-256 `40f69e4bd3fdb357a0241bca3525cba3a3c677dd1dc277d2335204fb4fedc162`; leitura integral 1–41. Excertos: 11–24 (G57-E077), 30–40 (G57-E078). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-pull-request-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/vcs.ts

Expose Location Git status/diff/activity and scoped Session activity.

**Autoridade/ownership:** Uses Location.directory/project.directory and captured GitCli/database. Non-git global-project Session activity scopes by directory; repository projects scope by projectID.

**Erros:** Non-git branch/status/diff return empty structures; no local catch rewriting Git or activity errors.

**Fatos materiais lidos:**

- Current/default branch queries run with concurrency 2.
- Diff mode working maps to git, other supported mode to branch. Session activity adds current Clock time and the requested period.

**Proveniência:** blob `18356095e244f41eefe459a2213ae2263577d1a3`; SHA-256 `11eea74dd0da6ececd8e46f2a55d63f7ee318f5098ed4a931b4879e565e5efed`; leitura integral 1–91. Excertos: 17–21 (G57-E126), 27–39 (G57-E127), 46–54 (G57-E128), 76–86 (G57-E129). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-project-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.


## Session requests, research and schedules

Mandatory now: purpose, delegated owner, local errors and authority/placement boundary for every member.

### packages/server/src/handlers/meeting.ts

Adapt meeting capture, state edits, consolidation start and handoff.

**Autoridade/ownership:** Uses SessionMeeting.Service; handoff uses its HandoffService. No per-meeting owner comparison is implemented in these wrappers.

**Erros:** MeetingError is projected to protocol MeetingError(data.reason); append returns NoContent after the Core call.

**Fatos materiais lidos:**

- stop awaits meeting.stop, then consolidation.start(stopped.id), and returns stopped. The comment explicitly says the card is built in the background; the returned object is not evidence of completed consolidation.

**Proveniência:** blob `345c7592ea9625f0fcef9bf993693d1d1a017fae`; SHA-256 `c4100cefe2683ebbb91a21b6658f9eb26069eb4e53e1fd9ba31f330499c00566`; leitura integral 1–99. Excertos: 19–34 (G57-E065), 86–98 (G57-E066). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-meeting-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/permission.ts

Expose pending/saved permission requests and session-specific ask/read/reply routes.

**Autoridade/ownership:** Session get/reply fetch the request and require matching sessionID. Saved permission listing uses query.projectID or current project ID; remove delegates by saved ID.

**Erros:** Absent or foreign request uses PermissionNotFoundError; ask maps Session.NotFoundError to SessionNotFoundError; reply catches PermissionV2.NotFoundError.

**Fatos materiais lidos:**

- Ask forwards ID, path sessionID, action/resources/save/metadata/source/agent into PermissionV2.ask.
- The get/reply ownership check is local; saved remove policy and permission decision semantics remain delegated.

**Proveniência:** blob `e14f733c5cb7fdb9095fd041916b87a1e83a20d3`; SHA-256 `eccfedcd75825cfc8f02ec07e9f30af8c573a23f60ae9b41e58d777e21cf5438`; leitura integral 1–98. Excertos: 10–12 (G57-E067), 24–48 (G57-E068), 60–76 (G57-E069), 80–94 (G57-E070). Perfil compartilhado de autoridade: `session`.

**Necessidades condicionais:** `N-permission-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/question.ts

List questions and answer/reject a question belonging to the path Session.

**Autoridade/ownership:** withOwnedQuestion locates requestID in the service list and requires matching sessionID before calling reply or reject; session list filters by sessionID.

**Erros:** Absent/foreign requests and QuestionV2.NotFoundError map to QuestionNotFoundError.

**Fatos materiais lidos:**

- Reply/reject use the same local ownership helper; successful mutation returns NoContent.

**Proveniência:** blob `22b11e9cff3f9b2ba716af11d7873410c601a2b3`; SHA-256 `856f65aac9d6a9f2d96a7eba706922832eda1e4d7c671210ad0efca92f8ca555`; leitura integral 1–62. Excertos: 14–23 (G57-E079), 33–37 (G57-E080), 40–58 (G57-E081). Perfil compartilhado de autoridade: `session`.

**Necessidades condicionais:** `N-question-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/research-artifact.ts

Read a task-bound research artifact page for a Session.

**Autoridade/ownership:** Gets project ID from the stored Session, resolves ResearchBinding, requests read with audience task and rejects a receipt whose executionSessionID or taskId differs.

**Erros:** Missing/binding/reference failures collapse to ResearchArtifactNotFoundError; conflict, over_cap and remaining Research.Error codes become ConflictError, InvalidRequestError and ServiceUnavailableError respectively. SQL errors use orDie.

**Fatos materiais lidos:**

- This handler adds an explicit returned-receipt binding comparison; Core artifact verification and storage remain delegated.

**Proveniência:** blob `fe08e43a395c59631633353043bbd724adf03451`; SHA-256 `8a95ff6157c4b15afe8fbd69c37b1d250b635f5ac2819ba4170de070f1c45b38`; leitura integral 1–36. Excertos: 16–32 (G57-E113). Perfil compartilhado de autoridade: `session`.

**Necessidades condicionais:** `N-research-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/schedule.ts

List/create/update/remove/run regular schedules in the current directory.

**Autoridade/ownership:** Each ScheduledTask call supplies Location.directory. Create translates a conflict stating the task belongs to another directory.

**Erros:** Invalid task becomes InvalidRequestError; not-found becomes ScheduleNotFoundError; run error becomes ScheduleRunError(reason).

**Fatos materiais lidos:**

- This ordinary schedule surface is distinct from capability schedules: it includes create/update and delegates directly to ScheduledTask.Service.

**Proveniência:** blob `541d7c3d35fcd4ba3faaa08a0511bb3ecbcd1499`; SHA-256 `a767e41d0ad27f996ec89aed4829c3afec89cc3a9bc4fc7544cc0c19ee683ee9`; leitura integral 1–83. Excertos: 18–19 (G57-E114), 24–35 (G57-E115), 43–48 (G57-E116), 55–59 (G57-E117), 65–69 (G57-E118), 77–82 (G57-E119). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-schedule-core`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.


## RAG rehydration and API adapter

Mandatory now: purpose, delegated owner, local errors and authority/placement boundary for every member.

### packages/server/src/handlers/rag-studio-session.ts

Rehydrate a Location RAG memory store from SQL, execute a callback, then persist its state.

**Autoridade/ownership:** Location.directory is the locationId. Sources/chunks/pipeline/revisions are loaded under that ID; revision members/questions/traces follow the selected parent IDs. Store roots use project and Location directories.

**Erros:** SQL operations use Effect.orDie. File extraction and callback use Effect.promise; unknown stored source status is normalized to not_yet_read.

**Fatos materiais lidos:**

- Existing source paths are passed to extract; current text and no_text_layer data populate the memory store. Restored pipeline forces lexical true and embedding false.
- noteBytes runs before the callback. save runs after the callback returns.
- save deletes prior traces/questions/members and Location rows, then reinserts memory state. This file has no local transaction wrapper; atomicity or concurrent-request isolation is not established by these statements.

**Proveniência:** blob `42a0cb7a6250df1edc566fa0409dde0463f29639`; SHA-256 `bd3250e5604650f6f80133d3f4e5c86653eaf1f42eddb40799f40afe22aab94b`; leitura integral 1–282. Excertos: 18–29 (G57-E082), 36–60 (G57-E083), 61–75 (G57-E084), 132–135 (G57-E085), 147–177 (G57-E086), 279–282 (G57-E087). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-rag-storage`, `N-rag-files`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/rag-studio.ts

Expose RAG admission, parsing, revisions, query/proof operations and source views through the session adapter.

**Autoridade/ownership:** All exported operations run via session(db,...); admission invokes extract(payload.path) before admit and places extracted data in the session memory store.

**Erros:** Only an Error whose message equals rejected is converted to a refused sentinel inside the callback; after session persistence the sentinel becomes InvalidRequestError(rejected). Other thrown errors are rethrown.

**Fatos materiais lidos:**

- The rejected sentinel lets session complete save before the handler raises the protocol rejection.
- Source view finds the source in the current store, rejects if absent, and returns its content plus chunks matching its ID.
- retrieval/citation return the called package proof booleans; they are product responses, not independent Genesis semantic or runtime evidence.

**Proveniência:** blob `b91a9e061bb8f818a34756ea7e26e9f27dace4a7`; SHA-256 `3a3143d5b3243ac78bc87bd5f9dbb56ae9ab080730dd9ac7060700809de4ef0e`; leitura integral 1–123. Excertos: 30–46 (G57-E088), 55–67 (G57-E089), 85–102 (G57-E090), 103–118 (G57-E091). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-rag-storage`, `N-rag-files`, `N-rag-algorithms`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.


## Relay authoring, publication, hooks and external ledgers

Mandatory now: purpose, delegated owner, local errors and authority/placement boundary for every member.

### packages/server/src/handlers/relay-document.ts

Adapt Relay document authoring, preview, trial and publication, including installed-hook lifecycle coordination.

**Autoridade/ownership:** Uses the project RelayDocuments store. Create and publish require a repository. Update requires version/checksum unless force. Publish compiles and admits non-hook workflows; principal attribution uses the server OS-account helper.

**Erros:** Authoring refusals map through RelayDocuments. Executable check fails with RelayForbiddenError(maestro-execution-required). Trial maps untrusted project and unavailable shell. Hook changes can be saved before receipt recording fails.

**Fatos materiais lidos:**

- List omits individual documents that cannot be viewed after warning; it does not turn every invalid document into a failed list.
- Deleting a hook uninstalls it first, records retirement receipts, then removes its document; the code states filesystem installs and SQLite cannot share a transaction.
- Publishing/unpublishing updates installed hook state first only when the local freshness predicate holds, then commits store state and records receipts. Receipt failure is reported without claiming a clean success.
- relay.document.check explicitly reserves executable workflow checks to Maestro; preview compilation/lint is not that execution.

**Proveniência:** blob `de7ff959ced8b2d0b4a2947add0f1a9600ffc845`; SHA-256 `d0e7a217e76134cdd4699cf28fc1c5d4c792546326bc3450ad0602317643c889`; leitura integral 1–342. Excertos: 31–41 (G57-E093), 71–89 (G57-E094), 96–119 (G57-E095), 158–164 (G57-E096), 201–213 (G57-E097), 254–280 (G57-E098), 291–310 (G57-E099), 339–342 (G57-E100). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-relay-core`, `N-relay-atomicity`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/relay-hook.ts

Install/update/enable/disable/reorder/uninstall and inspect pinned Relay hooks.

**Autoridade/ownership:** Binding uses the project ID and data root derived from Relay paths. Install/update/enable require a repository; disable/uninstall remain available without that guard. Lifecycle principal is the OS-account attribution helper.

**Erros:** Refused reasons map to not-found, invalid, unavailable or conflict. Failure to record a completed lifecycle change produces RelayUnavailableError(receipt-unrecorded).

**Fatos materiais lidos:**

- pin requires a currently published version, rejects a different requested version and non-hook documents, compiles the stored published body and hashes compact JSON.
- decisions accepts only bounded install IDs, loads at most the last 500 hook-decision entries and schema-decodes them; missing ledger becomes an empty list.
- The recorded receipt follows the persisted install change; this adapter does not promise a cross-store transaction.

**Proveniência:** blob `4f0bd4304decbdd16878ef47ef07d4bd0231ea7a`; SHA-256 `a20b4bc4297264795c70ee669ec613d5704cc0f86c6e3929425ef80c64974ad0`; leitura integral 1–237. Excertos: 45–55 (G57-E101), 82–110 (G57-E102), 122–133 (G57-E103), 153–157 (G57-E104), 169–186 (G57-E105), 191–202 (G57-E106), 205–237 (G57-E107). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-relay-core`, `N-relay-atomicity`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/handlers/relay-run.ts

Read external Relay run ledgers, derive their displayed state, and expose a bounded audit result.

**Autoridade/ownership:** runID is validated; the run folder and ledger must not be symlinks, the ledger must be a file, and real paths must match the expected Location-relative path.

**Erros:** Missing/invalid path yields RelayNotFoundError; ledger decoding/read failures yield RelayConflictError. List skips loads that fail and readdir failure becomes an empty list.

**Fatos materiais lidos:**

- A broken chain produces a failed run with empty steps. A parked run whose waiting process is gone becomes failed; EPERM during process existence check counts as alive.
- An intact ledger audit returns pending with external-self-reported, not a verified execution verdict. The comment limits chain integrity to unchanged recorded data.

**Proveniência:** blob `9af748eb25d441d8ed3766b09ef9a610a915b731`; SHA-256 `a31caef959e54e26071c0d7d325f685fef6b12c176ab90fa3e7aee4c3f15cbb8`; leitura integral 1–127. Excertos: 21–28 (G57-E108), 39–78 (G57-E109), 83–90 (G57-E110), 94–108 (G57-E111), 111–127 (G57-E112). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-relay-core`, `N-filesystem`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

### packages/server/src/relay-documents.ts

Own the server-side project store adapter, document views, draft saving, skill compilation and refusal mapping.

**Autoridade/ownership:** Store cache keys are Relay paths, acquired under Effect.scoped with a ten-minute idle TTL. New authoring/publish/install paths use requireRepository to reject the global non-repository project.

**Erros:** Profile seed failure is warned and swallowed; authoring status 404/409/503 map to corresponding protocol errors and others to invalid. Invalid shape/typeVersion is refused; compilation failure can be saved as diagnostics.

**Fatos materiais lidos:**

- A per-process seeded set suppresses repeated profile seeding; own documents remain usable when seeding fails.
- Save overlays fields but restores active and activeVersionId from the old document, validates, records compile diagnostics, and delegates version/checksum guards to store.save. Saving does not publish.
- Skill resolution rejects absent, blank, NUL-containing or over-2-MiB content and computes SHA256; positions are rounded but fractional typeVersion is rejected.

**Proveniência:** blob `5554b1dc72906ecfc1f55462c2e4e8bf2dcce724`; SHA-256 `96141f654abd839de54f9668ded3efb2982c58b78929fe857c9247f257cafc0a`; leitura integral 1–245. Excertos: 43–63 (G57-E131), 105–129 (G57-E132), 143–155 (G57-E133), 166–173 (G57-E134), 181–200 (G57-E135), 203–204 (G57-E136), 233–244 (G57-E137). Perfil compartilhado de autoridade: `location`.

**Necessidades condicionais:** `N-relay-core`, `N-relay-atomicity`, `N-runtime`.

Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.

## Necessidades condicionais e claims bloqueadas

Estas classificações são **novas e explícitas**, associadas às observações desta triagem. Não apagam os gaps históricos nem transformam bloqueios em aceitação. Cada necessidade se torna obrigatória antes da claim dependente especificada.

### N-runtime

**Gatilho:** Any claim that these routes, services or constraints executed successfully in a host.

**Evidência faltante:** No product execution, integration test, CI result, provider call or runtime receipt was collected in this delegation.

**Claim bloqueada:** Runtime/CI/Atlas qualification, operational security, migration success, or whole-layer release.

### N-actions-core

**Gatilho:** A claim about Actions permissions, provider effects, idempotency, reconciliation outcome or resource mutation correctness.

**Evidência faltante:** The delegated Actions.Service implementations and provider policies are outside the captured server adapter observations.

**Claim bloqueada:** Binding IDs/revisions or HTTP success alone prove authorized/successful provider operations.

### N-capability-core

**Gatilho:** A claim proving Core authority issuance/revocation, exact placement policy, vendor identity verification, cursor secrecy or replay semantics.

**Evidência faltante:** Core operator/management/verification implementations are called here but were not read as part of the G57 server delegation.

**Claim bloqueada:** Server construction and withRequest/require calls independently prove every Core authorization or verifier guarantee.

### N-origin-hardening

**Gatilho:** A claim of strict parsed-origin equality or complete CSRF/origin protection.

**Evidência faltante:** The CORS allowlist contains string-prefix checks and is distinct from authorization; no adversarial runtime exercise was made.

**Claim bloqueada:** CORS acceptance predicates are a complete authentication/security boundary.

### N-core-domain

**Gatilho:** A claim about algorithms or policy inside the delegated agent/behavior/catalog/status/skill services.

**Evidência faltante:** Only the actual server calls, arguments, error mapping and composition were inspected; those Core bodies are not in this bounded delegation.

**Claim bloqueada:** A catalog/status response or adapter call certifies the delegated domain implementation.

### N-filesystem

**Gatilho:** A claim of race-safe path ownership, symlink resistance or filesystem operation correctness.

**Evidência faltante:** Delegated filesystem services and runtime races were not qualified. Relay run containment performs explicit checks but does not establish a race-free open.

**Claim bloqueada:** Local guards prove all filesystem effects remain safe under replacement/races or arbitrary host behavior.

### N-atlas-lean-core

**Gatilho:** A claim about Atlas decisions/mining semantics, Lean defaults/collection correctness or compatibility with the earlier runtime.

**Evidência faltante:** The Core applications, collector and preference implementation were not read here; explanatory comments do not establish equivalence.

**Claim bloqueada:** These adapters establish Atlas/Lean algorithmic correctness, legacy parity or runtime readiness.

### N-llm-runtime

**Gatilho:** A claim of successful model routing, credential validity, billing behavior or generated result quality.

**Evidência faltante:** Source shows model selection/request construction only; no request was executed and the provider/client resolution bodies were not reviewed here.

**Claim bloqueada:** The Atlas/project-copy helper constitutes a completed provider call or correct model output.

### N-board-core

**Gatilho:** A claim of per-person Board authorization or correctness of Board lifecycle decisions.

**Evidência faltante:** This adapter passes literal owner to settings and captures a shared Board service; the Board policy implementation was not read.

**Claim bloqueada:** The adapter proves a per-user role model or authorizes every Board command.

### N-config-propagation

**Gatilho:** A claim that a successful config/trust mutation immediately converges every open Location.

**Evidência faltante:** The visible reload/apply loops ignore per-Location failures; no convergence mechanism or runtime receipt was established.

**Claim bloqueada:** NoContent guarantees all open agents/catalogs/MCP instances have adopted the change.

### N-integration-core

**Gatilho:** A claim about generic attempt ownership, credential encryption/storage or OAuth protocol correctness.

**Evidência faltante:** Integration-scoped ownership checks are local and read; generic attempt calls and secret handling remain in Integration/Core.

**Claim bloqueada:** Every attempt route has the integration-ID owner comparison, or all credentials/OAuth state are secure by adapter inspection alone.

### N-guardrail-core

**Gatilho:** A claim of universal guardrail enforcement or correct engine results.

**Evidência faltante:** Guardrail.run/rules are delegated and no other execution path is proven to use them.

**Claim bloqueada:** The existence of these endpoints proves all product actions are guarded.

### N-installation-core

**Gatilho:** A claim about trusted package acquisition, correct upgrade or actual installed version.

**Evidência faltante:** The installer is delegated; the response echoes the requested target after upgrade and is not a version probe.

**Claim bloqueada:** The source-level success shape is an installation runtime receipt.

### N-project-core

**Gatilho:** A claim about transactional project registration, copy isolation, Git effects or activity correctness.

**Evidência faltante:** The project/copy/Git/activity implementations are delegated; only adapter selection and errors were read.

**Claim bloqueada:** Route project IDs and current directories establish complete repository/filesystem invariants.

### N-mcp-core

**Gatilho:** A claim about MCP server trust, transport isolation, auth storage or successful reconnection.

**Evidência faltante:** Mcp methods implement those mechanisms; no runtime evidence or Core implementation review was performed in this delegation.

**Claim bloqueada:** The management endpoints or ignored applyTrust loop prove MCP isolation/enforcement.

### N-meeting-core

**Gatilho:** A claim about meeting ownership, consolidated-card completion or handoff correctness.

**Evidência faltante:** Meeting services own these contracts; stop starts consolidation and returns stopped rather than a completed card.

**Claim bloqueada:** The stop response proves finished consolidation or adapter-level meeting ownership enforcement.

### N-permission-core

**Gatilho:** A claim about permission decisions, saved-entry authorization or durable save semantics.

**Evidência faltante:** Local get/reply session matching is read, but PermissionV2/PermissionSaved decision and saved-ID policies are delegated.

**Claim bloqueada:** A matched request ID alone proves correct permission policy or authorization of arbitrary saved entries.

### N-pull-request-core

**Gatilho:** A claim about remote PR authorization, creation success or provider side effects.

**Evidência faltante:** PullRequest.Service and provider implementations are delegated; no remote write or host call occurred.

**Claim bloqueada:** An HTTP create wrapper proves a PR was created or provider authorization was checked correctly.

### N-question-core

**Gatilho:** A claim about persistence, race behavior or answer validation inside QuestionV2.

**Evidência faltante:** The adapter checks list membership/session equality then delegates; service internals and concurrent deletion behavior were not qualified.

**Claim bloqueada:** The wrapper alone proves end-to-end question lifecycle correctness.

### N-rag-storage

**Gatilho:** A claim of atomic or concurrent-safe RAG rehydration/save.

**Evidência faltante:** The inspected session code reads a snapshot then issues sequential delete/reinsert operations without a local transaction wrapper; enclosing database behavior and concurrency were not established.

**Claim bloqueada:** RAG API calls preserve an atomic snapshot under concurrent requests or failures.

### N-rag-files

**Gatilho:** A claim that every RAG file read is restricted to an admitted Location/project path.

**Evidência faltante:** Admission calls extract(payload.path) before admit; rehydration extracts stored paths. The extract/admission path policy implementation was not read here.

**Claim bloqueada:** Location-indexed SQL rows alone prove confinement of all filesystem reads.

### N-rag-algorithms

**Gatilho:** A claim that RAG retrieval/citation proof, embedding or evaluation output is correct.

**Evidência faltante:** The package functions are delegated and their returned booleans are product outputs, not independent review evidence.

**Claim bloqueada:** Handler exposure of proof/evaluation endpoints constitutes external proof or runtime validation.

### N-relay-core

**Gatilho:** A claim about compiler/store invariants, Maestro admission/execution correctness or hook enforcement.

**Evidência faltante:** The server adapter has explicit local gates and calls the compiler/store/Core; those implementations and execution were not reviewed here.

**Claim bloqueada:** Server preview, publication, ledger integrity or exposed judge backend constitutes verified workflow execution.

### N-relay-atomicity

**Gatilho:** A claim of atomic state/receipt updates across hook files and SQLite, or guaranteed rollback on failure.

**Evidência faltante:** The code explicitly orders filesystem/install changes, store commit and receipt recording, and reports partial completion. No shared transaction or rollback guarantee is present in the inspected adapter.

**Claim bloqueada:** A receipt failure means no lifecycle change happened, or a successful store write atomically includes filesystem and ledger effects.

### N-research-core

**Gatilho:** A claim about artifact integrity, immutable storage, content bounds or full Core admission policy.

**Evidência faltante:** Local Session and returned-receipt binding checks are read; ResearchArtifacts storage/verification/admission internals are delegated.

**Claim bloqueada:** The binding comparison alone certifies artifact bytes and every access rule.

### N-schedule-core

**Gatilho:** A claim about schedule timing, repetition/idempotency, directory ownership or run success.

**Evidência faltante:** Adapters forward location/placement and map failures; ScheduledTask and capability operator implementations own scheduling behavior.

**Claim bloqueada:** A schedule run route proves a task fired, an idempotency guarantee held or all cross-directory operations were rejected.

### N-web-files

**Gatilho:** A claim that static-file access is symlink-safe or fully path-confined under malicious filesystem state.

**Evidência faltante:** WebUi checks a lexical resolved prefix and calls Bun.file.stat/read; no realpath/lstat gate or race-safe open is implemented in the inspected helper.

**Claim bloqueada:** The lexical traversal guard is a proof of symlink or TOCTOU confinement.

## Conferência dos excertos

`excerpt-selection.json` contém **175 spans**, totalizando **112021 bytes literais**. Cada span inclui pin, blob, SHA-256 do arquivo, linhas, offsets, tamanho, SHA-256 do excerpt e texto exato. O mapa cobre todos os 51 membros e todos os suportes. Nenhum arquivo-fonte é reproduzido integralmente. `read-log.json` distingue leitura completa de suporte parcialmente lido.

As strings dos excerpts foram reconstruídas dos bytes originais com finais de linha preservados e conferidas contra as capturas. Verificação de bytes não é teste do produto nem veredito semântico.
