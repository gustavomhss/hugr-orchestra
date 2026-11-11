from pathlib import Path
import hashlib
import json
import re

ROOT = Path('/workspace/scratch/2b46fb541868/genesis-s1')
OUT = ROOT / 'revisions/b-l1-v3/delegates/server'
SRC = ROOT / 'producers/b/sources'
PIN = '1cde2ff7a71bcf7aecb5d030917b577165135d38'

# Authored semantic observations below; the program only projects captured bytes,
# checks identities, and assembles the records. It does not run product code.
rows = []
def row(name, group, purpose, profile, authority, errors, facts, spans, needs=()):
    path = 'packages/server/src/' + name
    rows.append(dict(path=path, group=group, purpose=purpose,
                     authority_profile=profile, local_authority=authority,
                     error_contract=errors, material_facts=facts,
                     selected_spans=spans, conditional_need_ids=list(needs)))

row('capability-content-ticket.ts', 'capability',
    'Issue and verify short-lived opaque content references bound to the minting authority, session, and artifact revision.',
    'host_helper', 'The claim stores authority; verification returns that stored authority and does not accept a replacement from the content URL.',
    'Unknown or expired tickets return undefined; expiry removes the stored entry. The content consumer maps missing tickets to empty 401.',
    ['The default TTL is five minutes. Mint cleans expired entries, creates 32 random bytes encoded base64url, stores the claim in a process-local Map, and returns /api/capability/content/<token>.',
     'Verification checks Date.now() against the stored expiry; it does not consume a still-valid ticket. Restart persistence is not supplied by this Map.',
     'The consumer first checks management.get before minting, requires RequestAuthority, then re-enters operators.withRequest with the stored authority when reading content.'],
    [(9,18),(25,25),(33,48)], ['N-capability-core','N-runtime'])
row('capability-verification.ts', 'capability',
    'Supply the capability connection verifier as a host-constructed Effect service.',
    'host_helper', 'Production construction calls CapabilityConnectionVerification.make; route options can inject a verifier at host composition time, while the connect handler passes request payload to setup.connect.',
    'Factory failure is converted with Effect.orDie; this facade declares no request-error policy of its own.',
    ['Service is typed as CapabilityConnectionSetupContract.Verifier.',
     'The layer invokes the Core factory once as service construction rather than taking a verifier from a request payload.'],
    [(7,12)], ['N-capability-core','N-runtime'])
row('cors.ts', 'http-edge',
    'Define CORS/request-origin predicates and repair the response Vary header for dynamically echoed origins.',
    'origin_helper', 'Origin acceptance is an origin policy, separate from API credential or capability authority.',
    'sameHost catches URL parsing failure and returns false; missing origin is allowed. No authentication error is created here.',
    ['CORS accepts missing origin, literal localhost/127.0.0.1 and oc://renderer prefixes, three Tauri origins, or an exact configured extra origin.',
     'The request-origin predicate also allows a URL whose host equals the supplied host. Global CORS middleware sets maxAge 86400.',
     'Vary repair acts only for a non-wildcard access-control-allow-origin, preserving existing Origin or * tokens and otherwise adding Origin.'],
    [(10,31),(35,41),(55,66)], ['N-origin-hardening','N-runtime'])

row('handlers/actions-binding.ts', 'actions',
    'Adapt binding CRUD, capability inspection, and binding-policy operations to Actions.Service.',
    'location', 'Binding selection is the path bindingID plus query revision. Update refuses a conflicting payload expectedRevision and replaces it with the selected query revision.',
    'Uses actions-common.result for ActionsError to ActionsApiError projection; stale update is constructed locally as kind binding_stale.',
    ['List/create/get/remove delegate to bindings; capabilities and policy operations use the selected binding reference.',
     'Update checks the explicit revision disagreement before delegating, so a caller cannot select one revision and update using another through this adapter.'],
    [(9,19),(21,29),(31,41)], ['N-actions-core','N-runtime'])
row('handlers/actions-common.ts', 'actions',
    'Share the binding reference and typed error projection used by Actions handlers.',
    'location', 'bindingRef combines the route binding ID with the query revision; it is an identifier, not a grant.',
    'Copies kind, message, bindingID, provider, resourceID, retryAfter, operationID and disposition into ActionsApiError; wraps the effect in the Location response envelope.',
    ['result maps only the typed ActionsError channel using apiError before response.',
     'No authorization or Actions execution is implemented by this helper.'],
    [(7,20)], ['N-actions-core'])
row('handlers/actions-job.ts', 'actions',
    'Delegate retry/play/cancel/erase commands for a job through Actions.execute.',
    'location', 'Each call supplies the selected binding revision, ctx.payload, and path jobID to Core.',
    'All four handlers use actions-common.result; no separate local error rewrite.',
    ['The operation literals are job.retry, job.play, job.cancel and job.erase; no job execution loop or provider API call is implemented here.'],
    [(9,23)], ['N-actions-core','N-runtime'])
row('handlers/actions-operation.ts', 'actions',
    'Prepare, fetch, and reconcile Actions operations.',
    'location', 'Operations are selected under bindingRef; get/reconcile forward path operationID.',
    'Each result uses the shared Actions error projection.',
    ['Preparation forwards ctx.payload to actions.prepare; retrieval and reconciliation are distinct Core methods.'],
    [(9,19)], ['N-actions-core','N-runtime'])
row('handlers/actions-pipeline.ts', 'actions',
    'Select and forward merge-request and trigger pipeline operations.',
    'location', 'Uses bindingRef; mergeRequest supplies path mergeRequestID as resourceID and trigger supplies ctx.payload.input.ref.',
    'Shared Actions result/error projection.',
    ['The two operation kinds are pipeline.mergeRequest and pipeline.trigger; request data is delegated to Actions.execute.'],
    [(9,15)], ['N-actions-core','N-runtime'])
row('handlers/actions-resource.ts', 'actions',
    'Translate resource listing filters and generic resource commands into Actions calls.',
    'location', 'Resource commands keep bindingRef and send the resourceKind as operation context; optional list fields are included only when defined.',
    'Shared Actions result/error projection; command mapping has a resource.update fallback.',
    ['Commands select cache.clear for clear, artifact.keep for keep, deployment.review or schedule.play for play, runner.register or resource.create for create, runner.remove or resource.delete for delete; other actions map to resource.update.'],
    [(10,21),(23,32)], ['N-actions-core','N-runtime'])
row('handlers/actions-run.ts', 'actions',
    'Delegate run queries, job listing, retry and run lifecycle commands to Actions.',
    'location', 'Run and job queries carry the selected binding reference and path runID. No provider credential resolution occurs locally.',
    'Shared Actions result/error projection.',
    ['Run list forwards workflow/cursor/limit and ref/event/status/commit/actor/time filters; jobs forwards attempt and cursor.',
     'Retry selects run.retryFailed only for provider github with mode failed; otherwise run.retry. The other command kinds are explicit cancel, forceCancel, delete, approveFork and rename literals.'],
    [(9,24),(26,29),(31,49)], ['N-actions-core','N-runtime'])
row('handlers/actions-source.ts', 'actions',
    'Expose source base and draft/source validation, and translate source mutation commands.',
    'location', 'All calls retain bindingRef; validation forwards the declared base/path/draft or source/draft inputs.',
    'Shared Actions result/error projection.',
    ['The command kind is source.branch for branch, source.review for review, and source.write otherwise. Core owns the actual validation and operation.'],
    [(9,19),(21,25)], ['N-actions-core','N-runtime'])
row('handlers/actions-workflow.ts', 'actions',
    'Delegate workflow listing/source/graph/dispatch and enabled-state operations.',
    'location', 'Selection carries bindingRef; source and graph take path/ref query inputs and dispatch/state take path workflowID.',
    'Shared Actions result/error projection.',
    ['Dispatch uses workflow.dispatch. State chooses workflow.enable or workflow.disable from ctx.payload.input.enabled.'],
    [(9,21),(23,30)], ['N-actions-core','N-runtime'])

row('handlers/agent.ts', 'configuration',
    'List/annotate agents, present materialized tools and available skills, and edit configuration agent files.',
    'location', 'Process-global FSUtil and AgentExecution.Annotate are captured at handler construction. Agent file reads/writes use the current Location.directory after ConfigAgentFile.validName; detail materializes tools using the selected agent permissions.',
    'Unknown agent and invalid name become InvalidRequestError; write conflict becomes ConflictError; RejectedError becomes agent_file_<reason>; other file errors become UnknownError.',
    ['agent.detail obtains the agent, materializes registry definitions under agent.permissions, filters skills through SkillV2.available, and includes toolkit engine information.',
     'File update writes before agents.reload; reload is awaited. A successful write is not evidence that a later reload cannot fail.',
     'Toolkit branches query BackendToolkit.status or ResearchToolkit.status and combine results with manifests; underlying status implementation is outside this adapter reading.'],
    [(20,29),(34,55),(75,88),(129,144)], ['N-core-domain','N-filesystem','N-runtime'])
row('handlers/atlas.ts', 'atlas-lean',
    'Expose the Location-owned Atlas surface and supply chosen-model callbacks for delegate/mine.',
    'location', 'Atlas.open receives process npm/process dependencies plus a root computed from the Location project/directory and project ID. Model selection comes from that Location catalog and integrations.',
    'Atlas.Unavailable is mapped to ServiceUnavailableError(service atlas). The local model-selection branch creates Error when the requested provider/model is unavailable; a universal conversion of every LLM error is not established here.',
    ['The model callback resolves catalog credentials, generates a fresh SessionID for headers, streams a plain LLM request with a supplied system prompt, and concatenates text-delta events.',
     'delegate supplies Atlas.DELEGATE_SYSTEM plus decodeReply; mine supplies Atlas.MINE_SYSTEM. These adapter calls are not a runtime Atlas qualification.'],
    [(21,36),(40,68),(92,114)], ['N-atlas-lean-core','N-llm-runtime','N-runtime'])
row('handlers/behavior.ts', 'configuration',
    'Set the Location behavior selection through BehaviorV2.',
    'location', 'Forwards ctx.payload.behaviors to the current BehaviorV2.Service.',
    'BehaviorV2.DuplicateError becomes InvalidRequestError with kind duplicate and field behaviors.',
    ['The only local semantic branch is the duplicate-error translation around behavior.set and the Location response envelope.'],
    [(8,18)], ['N-core-domain','N-runtime'])
row('handlers/board.ts', 'board',
    'Expose Board queries and owner/action commands using the process service.',
    'global', 'The handler captures Board.Service. The settings call supplies the literal role owner; this adapter does not resolve a per-person role from the request.',
    'Read helpers map Board.NotFoundError to BoardNotFoundError; mutation helper maps that tag to not-found and every other Board.Error to BoardRefusedError.',
    ['Queries include summary/snapshot/issue/activity/spend/decisions/proof. Mutation methods delegate decision/settings/answer/note/attachment/lifecycle/sync/issue decisions.',
     'The local literal owner argument is a delegation contract; it is not proof of a per-user authorization system.'],
    [(9,23),(45,57)], ['N-board-core','N-runtime'])

row('handlers/capability-connections.ts', 'capability',
    'Construct connection setup/binding/management adapters and expose their operations.',
    'capability', 'ServerOperator, the database and the trusted verifier are captured at handler construction; setup uses an operator-backed request ledger. Connect/list compute placement from current Location.',
    'connectionResponse rewrites typed failures: Capability.Failure uses capabilityError; other typed failures become constant ForbiddenError(Request denied). Non-failure cause reasons and annotations are preserved.',
    ['Management is constructed outside individual handlers with the database supplied; the comment assigns cursor encryption-key lifetime to that handler layer.',
     'Connection/target/binding mutations delegate payloads to Core management methods; server request payload does not replace the verifier or operators.'],
    [(20,36),(41,57),(61,69)], ['N-capability-core','N-runtime'])
row('handlers/capability-operator.ts', 'capability',
    'Inspect the authenticated operator binding for the current placement.',
    'capability', 'Calls operator.require(action operator.inspect) with project ID and Location.Ref; returns only requestID, principal, origin and scopeHash.',
    'Failure reasons are passed through capabilityError with annotations retained; non-Fail causes are preserved.',
    ['Inspection is a Core require call, not a direct echo of caller-supplied identity or grant fields.'],
    [(16,27)], ['N-capability-core','N-runtime'])
row('handlers/capability-schedules.ts', 'capability',
    'Operate agent capability schedules through CapabilityScheduleOperator.',
    'capability', 'The management facade receives ServerOperator and tasks.capability. Every list/pause/resume/run/remove call supplies current project/location placement.',
    'Capability failures use capabilityError; ScheduledTask.InvalidError becomes ConflictError(Schedule cannot resume); other typed errors become ConflictError(Schedule run did not start). Non-Fail reasons and annotations remain.',
    ['This handler has list/pause/resume/run/remove operations, not create/edit.',
     'The broad comment about a constant 403 is bounded by the executable mapError branches: authentication capability failures can become UnauthorizedError and schedule errors can become ConflictError.'],
    [(14,31),(35,48)], ['N-capability-core','N-schedule-core','N-runtime'])

row('handlers/command.ts', 'utility',
    'Expose the slash-command catalog.', 'location', 'Delegates to SlashCommand.list inside the Location response envelope.',
    'No local catch or error conversion.', ['This is a list adapter; it does not execute a slash command.'], [(6,8)], ['N-core-domain'])
row('handlers/config.ts', 'configuration',
    'Read/update global configuration and request reload of agents and catalog in open Locations.',
    'global', 'Captures process-global FSUtil, Global and LocationServiceMap; updates target global configuration rather than a caller-selected Location document.',
    'Config write failures are not caught locally. Per-Location reload failures are explicitly ignored; the handler then returns NoContent.',
    ['After Config.updateGlobal, each open reference is acquired in a scoped effect and its AgentV2 and Catalog services reload.',
     'NoContent after that loop does not establish that every open Location reloaded successfully.'],
    [(14,29),(31,44)], ['N-config-propagation','N-core-domain','N-runtime'])
row('handlers/credential.ts', 'configuration',
    'Rename or remove a credential through Integration.connection.',
    'location', 'Update forwards only label for path credentialID; remove forwards that credential ID.',
    'Credential.InheritedError maps to ConflictError(resource credential); success returns NoContent.',
    ['The handler does not implement storage, encryption, inherited-credential ownership or secret resolution.'],
    [(13,17),(23,33)], ['N-integration-core','N-runtime'])
row('handlers/formatter.ts', 'utility',
    'Expose formatter status.', 'location', 'Uses the Location Format.Service and response envelope.',
    'No local catch or error conversion.', ['Calls format.status; it does not invoke formatting.'], [(6,8)], ['N-core-domain'])
row('handlers/guardrail.ts', 'utility',
    'Expose Guardrail rule discovery and requested engine runs.', 'location', 'Uses Guardrail.Service from the request Location and forwards run payload.',
    'EngineError becomes protocol GuardrailError with data.kind and data.message.',
    ['The adapter delegates rules and run; it does not independently establish rule enforcement by all other execution paths.'],
    [(11,24),(30,32)], ['N-guardrail-core','N-runtime'])
row('handlers/health.ts', 'utility',
    'Return a basic process/version liveness response.', 'global', 'Does not require Location services; API-wide credential policy still applies through composition.',
    'Effect.succeed returns the object directly; no probe failure path.',
    ['The response is healthy: true, process.pid and InstallationVersion. It is not a database/provider/engine readiness probe.'],
    [(6,9)], ['N-runtime'])
row('handlers/installation.ts', 'utility',
    'Delegate an installation upgrade with an identified method and requested target.', 'global', 'Captures Installation.Service at handler construction; payload.target is passed to upgrade after method detection.',
    'Unknown method becomes InvalidRequestError(installation_unknown); upgrade error.stderr becomes UnknownError; success returns requested target as version.',
    ['The success object follows the service upgrade call; it is not an independently measured installed-version check.'],
    [(9,22)], ['N-installation-core','N-runtime'])
row('handlers/integration.ts', 'configuration',
    'Manage integration discovery, key/OAuth connections, attempts and disconnect.', 'location',
    'Integration-scoped OAuth status/complete/cancel call requireOwner, which gets the attempt then checks ownedBy(attemptID,integrationID). Generic attempt routes delegate by attempt ID without that integration-ID comparison.',
    'Authorization errors become a constant integration_authorization InvalidRequestError; code-required and absent-attempt use separate kinds; inherited disconnect becomes credential ConflictError.',
    ['The owner check runs before integration-scoped complete/cancel.',
     'Key connect forwards integrationID, key, label and metadata; OAuth start forwards integrationID, methodID, inputs and label. The adapter does not prove Core secret storage or OAuth lifecycle semantics.'],
    [(8,28),(42,51),(73,79),(84,110),(114,136),(140,159)], ['N-integration-core','N-runtime'])

row('handlers/lean.ts', 'atlas-lean',
    'Expose Lean preferences, collector state, and history for a Location-derived owner.', 'location',
    'Owner is {projectID, directory}; preferences capture global filesystem services and collector captures database. History uses the scope returned by the owner preferences.',
    'LeanProfilePreferences.Unavailable maps to ServiceUnavailableError(service lean).',
    ['get/update combine stored profile preferences with LeanOutput.configured before collector.read; history reads the preference scope before collector.history.'],
    [(17,30),(33,45)], ['N-atlas-lean-core','N-runtime'])
row('handlers/location.ts', 'repository',
    'Describe a requested Location and make its project known before Sessions exist.', 'location',
    'Uses Location.Service and captures database/events; records project ID, project directory and VCS before returning Location.Info.',
    'No local catch or error rewrite around ProjectV2.record.',
    ['location.get has a recording side effect; location.paths returns Global.Path.home.'],
    [(12,29),(32,32)], ['N-project-core','N-runtime'])
row('handlers/lsp.ts', 'utility',
    'Expose LSP status.', 'location', 'Uses the Location LSP.Service and response envelope.',
    'No local catch or error conversion.', ['Calls lsp.status; it does not execute a language operation or start a server explicitly.'], [(6,8)], ['N-core-domain'])
row('handlers/mcp.ts', 'configuration',
    'Adapt MCP catalog/configuration/connections and OAuth actions.', 'location',
    'All operations use Mcp.Service under the selected Location; path server identifies add/remove/connect/disconnect/debug/auth targets.',
    'Mcp.NotFoundError becomes McpServerNotFoundError; configuration/auth errors become InvalidRequestError carrying their message.',
    ['List/catalog/config/entries/tools are read adapters. Add/remove/config changes and connect/disconnect are delegated to Core.',
     'Auth start, callback with payload.code and remove are distinct Core calls; this adapter does not establish transport isolation or credential safety.'],
    [(10,21),(25,45),(61,84),(89,95)], ['N-mcp-core','N-runtime'])
row('handlers/meeting.ts', 'session-workflows',
    'Adapt meeting capture, state edits, consolidation start and handoff.', 'location',
    'Uses SessionMeeting.Service; handoff uses its HandoffService. No per-meeting owner comparison is implemented in these wrappers.',
    'MeetingError is projected to protocol MeetingError(data.reason); append returns NoContent after the Core call.',
    ['stop awaits meeting.stop, then consolidation.start(stopped.id), and returns stopped. The comment explicitly says the card is built in the background; the returned object is not evidence of completed consolidation.'],
    [(19,34),(86,98)], ['N-meeting-core','N-runtime'])
row('handlers/permission.ts', 'session-workflows',
    'Expose pending/saved permission requests and session-specific ask/read/reply routes.', 'session',
    'Session get/reply fetch the request and require matching sessionID. Saved permission listing uses query.projectID or current project ID; remove delegates by saved ID.',
    'Absent or foreign request uses PermissionNotFoundError; ask maps Session.NotFoundError to SessionNotFoundError; reply catches PermissionV2.NotFoundError.',
    ['Ask forwards ID, path sessionID, action/resources/save/metadata/source/agent into PermissionV2.ask.',
     'The get/reply ownership check is local; saved remove policy and permission decision semantics remain delegated.'],
    [(10,12),(24,48),(60,76),(80,94)], ['N-permission-core','N-runtime'])
row('handlers/project-copy.ts', 'repository',
    'Delegate copy lifecycle and supply optional LLM-generated copy names.', 'location',
    'Create overlays route projectID and Location.project.directory onto the payload; remove/refresh carry route projectID. Name generation uses the Location catalog and integrations.',
    'ProjectCopy errors map to ProjectCopyError with translated message and optional Git.WorktreeError.forceRequired; any name-generation cause is logged and falls back to Slug.create.',
    ['Name generation returns a random slug without trimmed context or a default model, otherwise chooses the provider small model or default and resolves credentials.',
     'The LLM request carries a fresh session-routing header and ProjectCopy.NAME_SYSTEM. The handler catches all generation causes; it does not assert that a model response is always available.'],
    [(19,40),(50,60),(77,84),(90,115)], ['N-project-core','N-llm-runtime','N-runtime'])
row('handlers/project.ts', 'repository',
    'List/update projects and initialize a Git project before Location services can exist.', 'global',
    'Captures project/database/events/git services. initGit derives a ref from the request rather than Location middleware, initializes and resolves that directory.',
    'Missing project on update becomes InvalidRequestError(field projectID); initGit has no local catch.',
    ['initGit returns the resolved Location.Info and project result or null; update invokes ProjectV2.update with database/events.'],
    [(15,28),(31,45)], ['N-project-core','N-runtime'])
row('handlers/pull-request.ts', 'repository',
    'List/create pull requests using the Location PullRequest service.', 'location',
    'Create forwards payload to PullRequest.Service; host execution and credentials remain owned by that service.',
    'HostError projects kind/message/host/branch/remote into protocol PullRequestError.',
    ['The adapter returns the Location envelope around both list and create.'],
    [(11,24),(30,40)], ['N-pull-request-core','N-runtime'])
row('handlers/question.ts', 'session-workflows',
    'List questions and answer/reject a question belonging to the path Session.', 'session',
    'withOwnedQuestion locates requestID in the service list and requires matching sessionID before calling reply or reject; session list filters by sessionID.',
    'Absent/foreign requests and QuestionV2.NotFoundError map to QuestionNotFoundError.',
    ['Reply/reject use the same local ownership helper; successful mutation returns NoContent.'],
    [(14,23),(33,37),(40,58)], ['N-question-core','N-runtime'])

row('handlers/rag-studio-session.ts', 'rag',
    'Rehydrate a Location RAG memory store from SQL, execute a callback, then persist its state.', 'location',
    'Location.directory is the locationId. Sources/chunks/pipeline/revisions are loaded under that ID; revision members/questions/traces follow the selected parent IDs. Store roots use project and Location directories.',
    'SQL operations use Effect.orDie. File extraction and callback use Effect.promise; unknown stored source status is normalized to not_yet_read.',
    ['Existing source paths are passed to extract; current text and no_text_layer data populate the memory store. Restored pipeline forces lexical true and embedding false.',
     'noteBytes runs before the callback. save runs after the callback returns.',
     'save deletes prior traces/questions/members and Location rows, then reinserts memory state. This file has no local transaction wrapper; atomicity or concurrent-request isolation is not established by these statements.'],
    [(18,29),(36,60),(61,75),(132,135),(147,177),(279,282)], ['N-rag-storage','N-rag-files','N-runtime'])
row('handlers/rag-studio.ts', 'rag',
    'Expose RAG admission, parsing, revisions, query/proof operations and source views through the session adapter.', 'location',
    'All exported operations run via session(db,...); admission invokes extract(payload.path) before admit and places extracted data in the session memory store.',
    'Only an Error whose message equals rejected is converted to a refused sentinel inside the callback; after session persistence the sentinel becomes InvalidRequestError(rejected). Other thrown errors are rethrown.',
    ['The rejected sentinel lets session complete save before the handler raises the protocol rejection.',
     'Source view finds the source in the current store, rejects if absent, and returns its content plus chunks matching its ID.',
     'retrieval/citation return the called package proof booleans; they are product responses, not independent Genesis semantic or runtime evidence.'],
    [(30,46),(55,67),(85,102),(103,118)], ['N-rag-storage','N-rag-files','N-rag-algorithms','N-runtime'])
row('handlers/reference.ts', 'utility',
    'Expose the reference catalog.', 'location', 'Uses Reference.Service under the Location response envelope.',
    'No local catch or error conversion.', ['Calls reference.list; no reference resolution/execution mechanism is implemented here.'], [(6,8)], ['N-core-domain'])

row('handlers/relay-document.ts', 'relay',
    'Adapt Relay document authoring, preview, trial and publication, including installed-hook lifecycle coordination.', 'location',
    'Uses the project RelayDocuments store. Create and publish require a repository. Update requires version/checksum unless force. Publish compiles and admits non-hook workflows; principal attribution uses the server OS-account helper.',
    'Authoring refusals map through RelayDocuments. Executable check fails with RelayForbiddenError(maestro-execution-required). Trial maps untrusted project and unavailable shell. Hook changes can be saved before receipt recording fails.',
    ['List omits individual documents that cannot be viewed after warning; it does not turn every invalid document into a failed list.',
     'Deleting a hook uninstalls it first, records retirement receipts, then removes its document; the code states filesystem installs and SQLite cannot share a transaction.',
     'Publishing/unpublishing updates installed hook state first only when the local freshness predicate holds, then commits store state and records receipts. Receipt failure is reported without claiming a clean success.',
     'relay.document.check explicitly reserves executable workflow checks to Maestro; preview compilation/lint is not that execution.'],
    [(31,41),(71,89),(96,119),(158,164),(201,213),(254,280),(291,310),(339,342)], ['N-relay-core','N-relay-atomicity','N-runtime'])
row('handlers/relay-hook.ts', 'relay',
    'Install/update/enable/disable/reorder/uninstall and inspect pinned Relay hooks.', 'location',
    'Binding uses the project ID and data root derived from Relay paths. Install/update/enable require a repository; disable/uninstall remain available without that guard. Lifecycle principal is the OS-account attribution helper.',
    'Refused reasons map to not-found, invalid, unavailable or conflict. Failure to record a completed lifecycle change produces RelayUnavailableError(receipt-unrecorded).',
    ['pin requires a currently published version, rejects a different requested version and non-hook documents, compiles the stored published body and hashes compact JSON.',
     'decisions accepts only bounded install IDs, loads at most the last 500 hook-decision entries and schema-decodes them; missing ledger becomes an empty list.',
     'The recorded receipt follows the persisted install change; this adapter does not promise a cross-store transaction.'],
    [(45,55),(82,110),(122,133),(153,157),(169,186),(191,202),(205,237)], ['N-relay-core','N-relay-atomicity','N-runtime'])
row('handlers/relay-run.ts', 'relay',
    'Read external Relay run ledgers, derive their displayed state, and expose a bounded audit result.', 'location',
    'runID is validated; the run folder and ledger must not be symlinks, the ledger must be a file, and real paths must match the expected Location-relative path.',
    'Missing/invalid path yields RelayNotFoundError; ledger decoding/read failures yield RelayConflictError. List skips loads that fail and readdir failure becomes an empty list.',
    ['A broken chain produces a failed run with empty steps. A parked run whose waiting process is gone becomes failed; EPERM during process existence check counts as alive.',
     'An intact ledger audit returns pending with external-self-reported, not a verified execution verdict. The comment limits chain integrity to unchanged recorded data.'],
    [(21,28),(39,78),(83,90),(94,108),(111,127)], ['N-relay-core','N-filesystem','N-runtime'])

row('handlers/research-artifact.ts', 'session-workflows',
    'Read a task-bound research artifact page for a Session.', 'session',
    'Gets project ID from the stored Session, resolves ResearchBinding, requests read with audience task and rejects a receipt whose executionSessionID or taskId differs.',
    'Missing/binding/reference failures collapse to ResearchArtifactNotFoundError; conflict, over_cap and remaining Research.Error codes become ConflictError, InvalidRequestError and ServiceUnavailableError respectively. SQL errors use orDie.',
    ['This handler adds an explicit returned-receipt binding comparison; Core artifact verification and storage remain delegated.'],
    [(16,32)], ['N-research-core','N-runtime'])
row('handlers/schedule.ts', 'session-workflows',
    'List/create/update/remove/run regular schedules in the current directory.', 'location',
    'Each ScheduledTask call supplies Location.directory. Create translates a conflict stating the task belongs to another directory.',
    'Invalid task becomes InvalidRequestError; not-found becomes ScheduleNotFoundError; run error becomes ScheduleRunError(reason).',
    ['This ordinary schedule surface is distinct from capability schedules: it includes create/update and delegates directly to ScheduledTask.Service.'],
    [(18,19),(24,35),(43,48),(55,59),(65,69),(77,82)], ['N-schedule-core','N-runtime'])
row('handlers/skill.ts', 'utility',
    'List/save/remove skill files through the Location skill service.', 'location',
    'Save passes Location.directory plus name/description/content, payload.path as location, and mtime; remove passes Location.directory and query.path.',
    'Save conflict becomes ConflictError(resource skill); other write errors become InvalidRequestError. Remove always maps SkillWriteError to InvalidRequestError with field path.',
    ['The API forwards optimistic mtime data, but filesystem path checks and write conflict enforcement are owned by the skill service.'],
    [(16,27),(33,38),(44,47)], ['N-filesystem','N-core-domain','N-runtime'])
row('handlers/trust.ts', 'configuration',
    'Read/approve/revoke global project trust and reapply it to MCP in open Locations.', 'global',
    'Captures process-global FSUtil, Global and LocationServiceMap; approve/revoke use caller directory in ConfigTrust and then visit each cached Location.',
    'Approve maps ConfigTrust.DirectoryError to InvalidRequestError; individual MCP applyTrust failures are ignored.',
    ['Persistence occurs before applyTrust; success does not establish that every open MCP service applied the new trust state.'],
    [(14,29),(41,49),(55,60)], ['N-config-propagation','N-mcp-core','N-runtime'])
row('handlers/vcs.ts', 'repository',
    'Expose Location Git status/diff/activity and scoped Session activity.', 'location',
    'Uses Location.directory/project.directory and captured GitCli/database. Non-git global-project Session activity scopes by directory; repository projects scope by projectID.',
    'Non-git branch/status/diff return empty structures; no local catch rewriting Git or activity errors.',
    ['Current/default branch queries run with concurrency 2.',
     'Diff mode working maps to git, other supported mode to branch. Session activity adds current Clock time and the requested period.'],
    [(17,21),(27,39),(46,54),(76,86)], ['N-project-core','N-runtime'])
row('operator.ts', 'capability',
    'Expose the host operator facade and create its default Core authority scope.', 'host_helper',
    'The default calls CapabilityOperator.make with Principal.account and scope placements instance, actions [*]. Routes can inject a different operator at host construction.',
    'Core factory failure becomes a defect through Effect.orDie.',
    ['The interface owns no authorization algorithm here; the Core factory owns authority and the private request frame. OS account attribution is not a per-person remote login model.'],
    [(8,15)], ['N-capability-core','N-runtime'])
row('relay-documents.ts', 'relay',
    'Own the server-side project store adapter, document views, draft saving, skill compilation and refusal mapping.', 'location',
    'Store cache keys are Relay paths, acquired under Effect.scoped with a ten-minute idle TTL. New authoring/publish/install paths use requireRepository to reject the global non-repository project.',
    'Profile seed failure is warned and swallowed; authoring status 404/409/503 map to corresponding protocol errors and others to invalid. Invalid shape/typeVersion is refused; compilation failure can be saved as diagnostics.',
    ['A per-process seeded set suppresses repeated profile seeding; own documents remain usable when seeding fails.',
     'Save overlays fields but restores active and activeVersionId from the old document, validates, records compile diagnostics, and delegates version/checksum guards to store.save. Saving does not publish.',
     'Skill resolution rejects absent, blank, NUL-containing or over-2-MiB content and computes SHA256; positions are rounded but fractional typeVersion is rejected.'],
    [(43,63),(105,129),(143,155),(166,173),(181,200),(203,204),(233,244)], ['N-relay-core','N-relay-atomicity','N-runtime'])
row('web-ui.ts', 'http-edge',
    'Serve the built static UI with HTML CSP and SPA fallback outside API routing.', 'public_static',
    'The web layer is merged separately from the API layer. It resolves requested paths lexically under the root and falls back to index.html for missing/outside paths.',
    'exists swallows stat failure as false; file read/URI decode failures have no local protocol-error conversion.',
    ['HTML CSP permits self scripts plus the SHA256 of a matching inline theme-preload script, wasm-unsafe-eval, inline styles and the other explicit directives.',
     'The function reads bytes with Bun.file; lexical containment is shown, but no realpath/lstat symlink check is implemented in this helper.'],
    [(9,23),(30,46),(52,55)], ['N-web-files','N-runtime'])

SUPPORT = {
    'packages/server/src/location.ts': {'read': [(1,96)], 'select': [(18,40),(49,50),(68,80),(87,93)]},
    'packages/server/src/middleware/authorization.ts': {'read': [(1,65)], 'select': [(10,14),(33,39),(45,61)]},
    'packages/server/src/middleware/capability-authorization.ts': {'read': [(1,85)], 'select': [(12,15),(25,47),(49,60),(67,84)]},
    'packages/server/src/auth.ts': {'read': [(1,63)], 'select': [(29,33),(40,49)]},
    'packages/server/src/principal.ts': {'read': [(1,20)], 'select': [(7,20)]},
    'packages/server/src/api.ts': {'read': [(1,8)], 'select': [(5,8)]},
    'packages/server/src/routes.ts': {'read': [(1,145)], 'select': [(81,105),(123,139)]},
    'packages/server/src/middleware/session-location.ts': {'read': [(1,62)], 'select': [(32,58)]},
    'packages/server/src/handlers/capability-artifacts.ts': {'read': [(1,133)], 'select': [(33,40),(61,75)]},
    'packages/protocol/src/api.ts': {'read': [(1,157)], 'select': [(71,90),(93,126),(134,135)]},
    'packages/protocol/src/groups/capability-operator.ts': {'read': [(1,16)], 'select': [(14,16)]},
    'packages/protocol/src/groups/capability-connections.ts': {'read': [(1,14),(77,95)], 'select': [(93,95)]},
    'packages/protocol/src/groups/capability-schedules.ts': {'read': [(1,14),(25,43)], 'select': [(41,43)]},
    'packages/protocol/src/groups/permission.ts': {'read': [(12,137)], 'select': [(60,64),(77,79),(89,94),(104,109),(119,128)]},
    'packages/protocol/src/groups/question.ts': {'read': [(9,84)], 'select': [(34,42),(52,58),(68,73)]},
    'packages/protocol/src/groups/research-artifact.ts': {'read': [(13,24)], 'select': [(13,24)]},
}

GROUPS = {
    'actions': ('Actions bindings and operations', 'Shared Actions.Service, binding revision selection and a common typed error projection; each handwritten adapter and its local operation-selection branch was read.'),
    'capability': ('Capability authority and management', 'Host-owned operator/verifier/ticket helpers and request-frame-backed operator, connection and schedule adapters; authentication and failure-boundary support were read explicitly.'),
    'http-edge': ('Origin policy and public static UI', 'These modules own HTTP origin/header/static-file behavior rather than Core domain execution; API auth composition was read to keep the authority boundary explicit.'),
    'configuration': ('Agents, global settings, integrations and MCP', 'Configuration editing, trust propagation and external connection lifecycles have different local/global scopes and refusal behavior; each branch was inspected rather than classifying all as generic CRUD.'),
    'atlas-lean': ('Atlas and Lean Location applications', 'Both expose Location-derived state through owned Core applications; Atlas also constructs chosen-model callbacks and Lean combines profile state with collector configuration.'),
    'board': ('Board application adapter', 'Board is a captured process service with its own mutation/refusal boundary and literal owner role argument; it is kept separate from Location-scoped handlers.'),
    'utility': ('Catalog, status and maintenance adapters', 'Small adapters were read in full, with distinct read-only versus mutating/run purposes and their actual local error mappings; grouping does not assert shared Core implementation.'),
    'repository': ('Projects, copies, Git and pull requests', 'Project/Location identity and filesystem/VCS delegation define these contracts; initialization, naming and activity scoping have explicit local behavior.'),
    'session-workflows': ('Session requests, research and schedules', 'Ownership checks, persisted Session placement and task/directory scoping were read separately; generic wrapper grouping does not erase the different authority rules.'),
    'rag': ('RAG rehydration and API adapter', 'The two modules jointly own the SQL-to-memory-to-SQL request bridge and rejection projection. Their local persistence order and extraction boundary are material L1 facts.'),
    'relay': ('Relay authoring, publication, hooks and external ledgers', 'Project storage, publication gates, pinned installs, receipt ordering and external self-reporting form a coherent boundary with Maestro-owned execution.'),
}

def need(key, trigger, missing, blocked, files=None):
    return dict(id=key, classification='new_explicit_conditional_need', status='open_for_dependent_claim',
                trigger=trigger, missing_evidence=missing, blocked_claim=blocked,
                dependent_artifact_keys=['s1.api.surface-disposition'],
                affected_paths=files if files is not None else [r['path'] for r in rows if key in r['conditional_need_ids']],
                local_L1_effect='The bounded purpose/delegation/error/authority statements above remain readable; this need blocks the expanded claim, not a postponed reading of this handler.')

NEEDS = [
    need('N-runtime', 'Any claim that these routes, services or constraints executed successfully in a host.',
         'No product execution, integration test, CI result, provider call or runtime receipt was collected in this delegation.',
         'Runtime/CI/Atlas qualification, operational security, migration success, or whole-layer release.', [r['path'] for r in rows]),
    need('N-actions-core', 'A claim about Actions permissions, provider effects, idempotency, reconciliation outcome or resource mutation correctness.',
         'The delegated Actions.Service implementations and provider policies are outside the captured server adapter observations.',
         'Binding IDs/revisions or HTTP success alone prove authorized/successful provider operations.'),
    need('N-capability-core', 'A claim proving Core authority issuance/revocation, exact placement policy, vendor identity verification, cursor secrecy or replay semantics.',
         'Core operator/management/verification implementations are called here but were not read as part of the G57 server delegation.',
         'Server construction and withRequest/require calls independently prove every Core authorization or verifier guarantee.'),
    need('N-origin-hardening', 'A claim of strict parsed-origin equality or complete CSRF/origin protection.',
         'The CORS allowlist contains string-prefix checks and is distinct from authorization; no adversarial runtime exercise was made.',
         'CORS acceptance predicates are a complete authentication/security boundary.'),
    need('N-core-domain', 'A claim about algorithms or policy inside the delegated agent/behavior/catalog/status/skill services.',
         'Only the actual server calls, arguments, error mapping and composition were inspected; those Core bodies are not in this bounded delegation.',
         'A catalog/status response or adapter call certifies the delegated domain implementation.'),
    need('N-filesystem', 'A claim of race-safe path ownership, symlink resistance or filesystem operation correctness.',
         'Delegated filesystem services and runtime races were not qualified. Relay run containment performs explicit checks but does not establish a race-free open.',
         'Local guards prove all filesystem effects remain safe under replacement/races or arbitrary host behavior.'),
    need('N-atlas-lean-core', 'A claim about Atlas decisions/mining semantics, Lean defaults/collection correctness or compatibility with the earlier runtime.',
         'The Core applications, collector and preference implementation were not read here; explanatory comments do not establish equivalence.',
         'These adapters establish Atlas/Lean algorithmic correctness, legacy parity or runtime readiness.'),
    need('N-llm-runtime', 'A claim of successful model routing, credential validity, billing behavior or generated result quality.',
         'Source shows model selection/request construction only; no request was executed and the provider/client resolution bodies were not reviewed here.',
         'The Atlas/project-copy helper constitutes a completed provider call or correct model output.'),
    need('N-board-core', 'A claim of per-person Board authorization or correctness of Board lifecycle decisions.',
         'This adapter passes literal owner to settings and captures a shared Board service; the Board policy implementation was not read.',
         'The adapter proves a per-user role model or authorizes every Board command.'),
    need('N-config-propagation', 'A claim that a successful config/trust mutation immediately converges every open Location.',
         'The visible reload/apply loops ignore per-Location failures; no convergence mechanism or runtime receipt was established.',
         'NoContent guarantees all open agents/catalogs/MCP instances have adopted the change.'),
    need('N-integration-core', 'A claim about generic attempt ownership, credential encryption/storage or OAuth protocol correctness.',
         'Integration-scoped ownership checks are local and read; generic attempt calls and secret handling remain in Integration/Core.',
         'Every attempt route has the integration-ID owner comparison, or all credentials/OAuth state are secure by adapter inspection alone.'),
    need('N-guardrail-core', 'A claim of universal guardrail enforcement or correct engine results.',
         'Guardrail.run/rules are delegated and no other execution path is proven to use them.',
         'The existence of these endpoints proves all product actions are guarded.'),
    need('N-installation-core', 'A claim about trusted package acquisition, correct upgrade or actual installed version.',
         'The installer is delegated; the response echoes the requested target after upgrade and is not a version probe.',
         'The source-level success shape is an installation runtime receipt.'),
    need('N-project-core', 'A claim about transactional project registration, copy isolation, Git effects or activity correctness.',
         'The project/copy/Git/activity implementations are delegated; only adapter selection and errors were read.',
         'Route project IDs and current directories establish complete repository/filesystem invariants.'),
    need('N-mcp-core', 'A claim about MCP server trust, transport isolation, auth storage or successful reconnection.',
         'Mcp methods implement those mechanisms; no runtime evidence or Core implementation review was performed in this delegation.',
         'The management endpoints or ignored applyTrust loop prove MCP isolation/enforcement.'),
    need('N-meeting-core', 'A claim about meeting ownership, consolidated-card completion or handoff correctness.',
         'Meeting services own these contracts; stop starts consolidation and returns stopped rather than a completed card.',
         'The stop response proves finished consolidation or adapter-level meeting ownership enforcement.'),
    need('N-permission-core', 'A claim about permission decisions, saved-entry authorization or durable save semantics.',
         'Local get/reply session matching is read, but PermissionV2/PermissionSaved decision and saved-ID policies are delegated.',
         'A matched request ID alone proves correct permission policy or authorization of arbitrary saved entries.'),
    need('N-pull-request-core', 'A claim about remote PR authorization, creation success or provider side effects.',
         'PullRequest.Service and provider implementations are delegated; no remote write or host call occurred.',
         'An HTTP create wrapper proves a PR was created or provider authorization was checked correctly.'),
    need('N-question-core', 'A claim about persistence, race behavior or answer validation inside QuestionV2.',
         'The adapter checks list membership/session equality then delegates; service internals and concurrent deletion behavior were not qualified.',
         'The wrapper alone proves end-to-end question lifecycle correctness.'),
    need('N-rag-storage', 'A claim of atomic or concurrent-safe RAG rehydration/save.',
         'The inspected session code reads a snapshot then issues sequential delete/reinsert operations without a local transaction wrapper; enclosing database behavior and concurrency were not established.',
         'RAG API calls preserve an atomic snapshot under concurrent requests or failures.'),
    need('N-rag-files', 'A claim that every RAG file read is restricted to an admitted Location/project path.',
         'Admission calls extract(payload.path) before admit; rehydration extracts stored paths. The extract/admission path policy implementation was not read here.',
         'Location-indexed SQL rows alone prove confinement of all filesystem reads.'),
    need('N-rag-algorithms', 'A claim that RAG retrieval/citation proof, embedding or evaluation output is correct.',
         'The package functions are delegated and their returned booleans are product outputs, not independent review evidence.',
         'Handler exposure of proof/evaluation endpoints constitutes external proof or runtime validation.'),
    need('N-relay-core', 'A claim about compiler/store invariants, Maestro admission/execution correctness or hook enforcement.',
         'The server adapter has explicit local gates and calls the compiler/store/Core; those implementations and execution were not reviewed here.',
         'Server preview, publication, ledger integrity or exposed judge backend constitutes verified workflow execution.'),
    need('N-relay-atomicity', 'A claim of atomic state/receipt updates across hook files and SQLite, or guaranteed rollback on failure.',
         'The code explicitly orders filesystem/install changes, store commit and receipt recording, and reports partial completion. No shared transaction or rollback guarantee is present in the inspected adapter.',
         'A receipt failure means no lifecycle change happened, or a successful store write atomically includes filesystem and ledger effects.'),
    need('N-research-core', 'A claim about artifact integrity, immutable storage, content bounds or full Core admission policy.',
         'Local Session and returned-receipt binding checks are read; ResearchArtifacts storage/verification/admission internals are delegated.',
         'The binding comparison alone certifies artifact bytes and every access rule.'),
    need('N-schedule-core', 'A claim about schedule timing, repetition/idempotency, directory ownership or run success.',
         'Adapters forward location/placement and map failures; ScheduledTask and capability operator implementations own scheduling behavior.',
         'A schedule run route proves a task fired, an idempotency guarantee held or all cross-directory operations were rejected.'),
    need('N-web-files', 'A claim that static-file access is symlink-safe or fully path-confined under malicious filesystem state.',
         'WebUi checks a lexical resolved prefix and calls Bun.file.stat/read; no realpath/lstat gate or race-safe open is implemented in the inspected helper.',
         'The lexical traversal guard is a proof of symlink or TOCTOU confinement.'),
]

def digest(data):
    return hashlib.sha256(data).hexdigest()

manifest_bytes = (ROOT / 'producers/b/source-manifest.json').read_bytes()
manifest = json.loads(manifest_bytes)
by_path = {x['path']: x for x in manifest['sources']}
projection_bytes = (ROOT / 'revisions/b-l1-evidence-v1/coverage-projection.json').read_bytes()
projection = json.loads(projection_bytes)
historical = next(x for x in projection['groups'] if x['id'] == 'G57')
assert historical == json.loads((OUT / 'historical-g57.json').read_text())
historical_by_path = {x['path']: x for x in historical['members']}
assert len(rows) == 51 and len({x['path'] for x in rows}) == 51
assert set(historical_by_path) == {x['path'] for x in rows}
assert {k for x in rows for k in x['conditional_need_ids']} == {x['id'] for x in NEEDS}

source_data = {}
read_records = []
for path in [x['path'] for x in rows] + list(SUPPORT):
    if path in source_data:
        continue
    raw = (SRC / path).read_bytes()
    record = by_path[path]
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    assert record['commit'] == PIN
    assert record['byte_length'] == len(raw)
    assert record['sha256'] == digest(raw)
    assert record['git_blob_sha'] == blob
    raw.decode('utf-8')
    lines = raw.splitlines(keepends=True)
    spans = [(1,len(lines))] if path in historical_by_path else SUPPORT[path]['read']
    if path in historical_by_path:
        old = historical_by_path[path]
        assert old['inventory_byte_length'] == len(raw)
        assert old['source_ref']['commit'] == PIN
        assert old['source_ref']['sha256'] == digest(raw)
        assert old['source_ref']['git_blob_sha'] == blob
    source_data[path] = {'raw':raw, 'lines':lines, 'record':record}
    read_records.append({
        'path':path, 'role':'assigned_G57' if path in historical_by_path else 'necessary_L1_support',
        'commit':PIN, 'git_blob_sha':blob, 'sha256':digest(raw), 'bytes':len(raw), 'line_count':len(lines),
        'capture_path':str(SRC / path), 'capture_method_verbatim':record['capture_method'],
        'inspected_spans':[{'start_line':a,'end_line':b} for a,b in spans],
        'read_status':'full_literal_capture_read' if spans == [(1,len(lines))] else 'selected_literal_spans_read',
        'identity_verified_against_manifest':True,
        'truncation_recovery':'The initially omitted middle of capability-connections was re-read at lines 18–59 before making these observations.' if path.endswith('/handlers/capability-connections.ts') else None,
    })

excerpts = []
path_to_refs = {}
def add_excerpts(path, spans, owner):
    data = source_data[path]
    lines = data['lines']
    manifest_record = data['record']
    result = []
    for a,b in spans:
        assert 1 <= a <= b <= len(lines)
        assert not (a == 1 and b == len(lines)), 'No whole-source excerpt is allowed'
        read = next(x for x in read_records if x['path'] == path)['inspected_spans']
        assert all(any(s['start_line'] <= n <= s['end_line'] for s in read) for n in range(a,b+1))
        piece = b''.join(lines[a-1:b])
        key = f'G57-E{len(excerpts)+1:03d}'
        excerpts.append({
            'id':key, 'supports':owner, 'path':path, 'commit':PIN,
            'git_blob_sha':manifest_record['git_blob_sha'], 'source_sha256':manifest_record['sha256'],
            'start_line':a,'end_line':b,
            'byte_start':sum(len(x) for x in lines[:a-1]),
            'byte_end_exclusive':sum(len(x) for x in lines[:b]),
            'excerpt_bytes':len(piece), 'excerpt_sha256':digest(piece),
            'text':piece.decode('utf-8'),
        })
        assert excerpts[-1]['text'].encode('utf-8') == piece
        result.append(key)
    path_to_refs[path] = result
    return result

for item in rows:
    item['evidence_refs'] = add_excerpts(item['path'], item.pop('selected_spans'), {'kind':'assigned_member','path':item['path']})
for path,selection in SUPPORT.items():
    add_excerpts(path, selection['select'], {'kind':'shared_authority_or_contract_support','path':path})

def refs(*paths):
    return [e for path in paths for e in path_to_refs[path]]

base_auth_refs = refs('packages/server/src/auth.ts','packages/server/src/middleware/authorization.ts',
                     'packages/protocol/src/api.ts','packages/server/src/api.ts','packages/server/src/routes.ts')
profiles = {
    'location': {
        'contract':'Protocol attaches Location middleware to these groups. Request ref chooses location[directory] or cwd and workspace query or x-orchestra-workspace header. The shared API Authorization middleware checks Basic credentials only when a nonempty configured password is required. response wraps data with actual Location.Info; this wrapper itself grants no authority.',
        'evidence_refs':base_auth_refs + refs('packages/server/src/location.ts'),
    },
    'global': {
        'contract':'These groups are added without Location middleware and capture process/global services as shown in each body. API-wide Authorization still applies; when configured password is absent/empty its ordinary middleware is identity. A per-person user/role model is not established by that credential policy.',
        'evidence_refs':base_auth_refs + refs('packages/server/src/principal.ts'),
    },
    'session': {
        'contract':'Permission/question request-list and saved permission endpoints use Location middleware; their session-specific routes use SessionLocation middleware. Research artifact routes also use SessionLocation. That middleware decodes the path Session ID, loads persisted directory/workspace from SessionTable, refuses missing Session, and supplies its Location services. The local handler adds the ownership/binding comparisons described in its row.',
        'evidence_refs':base_auth_refs + refs('packages/server/src/middleware/session-location.ts','packages/protocol/src/groups/permission.ts','packages/protocol/src/groups/question.ts','packages/protocol/src/groups/research-artifact.ts'),
    },
    'capability': {
        'contract':'The operator/connection/schedule factories attach CapabilityAuthorization as well as Location middleware. With a configured password it requires canonical Basic credentials and chooses operator.configured; without one it requires a 43-character bearer token and calls operator.authenticate. Idempotency key syntax is checked, a random request ID is created, and Core operator.withRequest receives the authority. Capability authentication-required/revoked failures map to constant UnauthorizedError, other capability failures to ForbiddenError; non-Fail reasons and annotations are preserved.',
        'evidence_refs':base_auth_refs + refs('packages/server/src/middleware/capability-authorization.ts','packages/protocol/src/groups/capability-operator.ts','packages/protocol/src/groups/capability-connections.ts','packages/protocol/src/groups/capability-schedules.ts'),
    },
    'host_helper': {
        'contract':'These are constructed service helpers, not independently routable grants. createRoutes takes host operator/verifier options; makeRoutes installs them as services or uses defaults. Default operator principal is the OS account (fallback local), scoped to instance placements and all action names. Content mint/read behavior is checked in the actual capability-artifacts consumer.',
        'evidence_refs':refs('packages/server/src/routes.ts','packages/server/src/principal.ts','packages/server/src/operator.ts','packages/server/src/handlers/capability-artifacts.ts','packages/server/src/middleware/capability-authorization.ts'),
    },
    'origin_helper': {
        'contract':'CORS middleware is provided during API layer composition. The origin predicates and Vary behavior do not replace API Authorization or CapabilityAuthorization. Their exact permissive prefix/allowlist rules are the bounded claim.',
        'evidence_refs':refs('packages/server/src/routes.ts','packages/server/src/cors.ts'),
    },
    'public_static': {
        'contract':'makeRoutes merges WebUi.layer separately from the constructed API. The static helper is public and applies HTML CSP while API endpoints retain their own middleware. No per-file authentication or symlink-safe open is established by the static helper.',
        'evidence_refs':refs('packages/server/src/routes.ts','packages/server/src/web-ui.ts'),
    },
}

special_support = {
    'packages/server/src/capability-content-ticket.ts': refs('packages/server/src/handlers/capability-artifacts.ts'),
    'packages/server/src/handlers/actions-binding.ts': refs('packages/server/src/handlers/actions-common.ts'),
    'packages/server/src/handlers/actions-job.ts': refs('packages/server/src/handlers/actions-common.ts'),
    'packages/server/src/handlers/actions-operation.ts': refs('packages/server/src/handlers/actions-common.ts'),
    'packages/server/src/handlers/actions-pipeline.ts': refs('packages/server/src/handlers/actions-common.ts'),
    'packages/server/src/handlers/actions-resource.ts': refs('packages/server/src/handlers/actions-common.ts'),
    'packages/server/src/handlers/actions-run.ts': refs('packages/server/src/handlers/actions-common.ts'),
    'packages/server/src/handlers/actions-source.ts': refs('packages/server/src/handlers/actions-common.ts'),
    'packages/server/src/handlers/actions-workflow.ts': refs('packages/server/src/handlers/actions-common.ts'),
    'packages/server/src/handlers/relay-document.ts': refs('packages/server/src/relay-documents.ts','packages/server/src/principal.ts'),
    'packages/server/src/handlers/relay-hook.ts': refs('packages/server/src/relay-documents.ts','packages/server/src/principal.ts'),
    'packages/server/src/handlers/rag-studio.ts': refs('packages/server/src/handlers/rag-studio-session.ts'),
}

for item in rows:
    p = item['path']
    record = source_data[p]['record']
    item['historical'] = {
        'group_id':'G57', 'depth':historical['common']['depth'],
        'source_read_status':historical['common']['source_read_status'],
        'semantic_acceptance':historical_by_path[p]['semantic_acceptance'],
        'execution_evidence':historical_by_path[p]['execution_evidence'],
        'note':'Original common justification and every original member remain in historical-g57.json; these fields are not overwritten in original coverage.',
    }
    item['current'] = {
        'family':'server.domain-surfaces', 'kind':'production', 'need':'entry',
        'artifact_key':'s1.api.surface-disposition', 'layer':1,
        'depth':'L1_purpose_delegation_errors_authority_read',
        'source_read_status':'full_literal_capture_read',
        'inspected_spans':[{'start_line':1,'end_line':len(source_data[p]['lines'])}],
        'semantic_acceptance':'unjudged', 'execution_evidence':'none',
        'mandatory_local_read_gap':None,
    }
    item['source_ref'] = {k:record[k] for k in ['commit','path','git_blob_sha','sha256','byte_length','capture_path','capture_method']}
    item['registered_handler_names_literal'] = re.findall(r'\.handle(?:Raw)?\(\s*"([^"]+)"',source_data[p]['raw'].decode())
    item['shared_contract_evidence_refs'] = special_support.get(p,[])
    item['authority_evidence_profile_ref'] = item['authority_profile']
    item['evidence_binding']='The cited exact excerpts, shared contract refs, authority profile refs and full inspected span support this row. No claim is inferred from the filename alone.'

group_records=[]
for key,(title,rationale) in GROUPS.items():
    members=[r['path'] for r in rows if r['group']==key]
    group_records.append({'id':key,'title':title,'count':len(members),'members':members,
                          'grouping_reason':rationale,
                          'L1_need':'Mandatory now: purpose, delegated owner, local errors and authority/placement boundary for every member.',
                          'disposition':'All member captures were read in full. The current contract statements are producer evidence awaiting independent judgment; underlying Core/runtime claims remain separately blocked.'})

surface_artifact = next(x for x in projection['artifact_inventory'] if x['key']=='s1.api.surface-disposition')
triage = {
    'schema':'genesis.s1.g57.semantic-triage.v1', 'task':'S1-L1-B-v3 / delegated server triage',
    'producer':'/root/producer_c', 'delegated_by':'/root/producer_b', 'scope':'orchestra.s1',
    'source_revision':PIN, 'artifact_key':'s1.api.surface-disposition',
    'population':{'historical_group':'G57','family':'server.domain-surfaces','assigned_members':51,'full_capture_members_read':51,'assigned_source_bytes':sum(len(source_data[r['path']]['raw']) for r in rows),'assigned_source_lines':sum(len(source_data[r['path']]['lines']) for r in rows),'necessary_support_files':len(SUPPORT)},
    'provenance':{
        'coverage_projection':{'path':'revisions/b-l1-evidence-v1/coverage-projection.json','sha256':digest(projection_bytes)},
        'source_manifest':{'path':'producers/b/source-manifest.json','sha256':digest(manifest_bytes)},
        'historical_projection':'historical-g57.json is a normalized JSON projection of the unchanged G57 object, checked equal to the original projection.',
        'read_method':'Numbered literal captured source displayed and read. The one truncated capability-connections region was explicitly recovered. No product code, tests or source modules were executed.',
        'evidence_method':'Excerpt text is a contiguous original-byte line slice, with source commit/blob/SHA256 and excerpt offsets/bytes/SHA256. Every selection was checked against the captured source.',
        'access_boundary':'Only the authorized coverage projection, B source manifest/captures and this exclusive delegate directory were read for this task. No oracle or A synthesis was read.',
    },
    'historical_common_verbatim':historical['common'],
    'historical_artifact_gaps_verbatim':surface_artifact['gaps_verbatim'],
    'historical_gap_interpretation':'The historical 190-surface statement is preserved as history. This delegation advances only the exact 51 G57 members; it neither silently rewrites other members nor recomputes whole-B acceptance.',
    'mandatory_L1_read_disposition':{
        'unread_assigned_members':[],
        'purpose_delegation_error_authority_read':True,
        'required_support_read':['API placement and Authorization','Location and SessionLocation ownership','Capability request authority and error projection','Content ticket actual mint/read consumer','Shared Actions result and Relay store helpers'],
        'open_local_read_blockers':[],
        'remaining_required_integration':'B must incorporate these exact dispositions and evidence into the corrected surface artifact/coverage and submit the complete packet to the existing independent judges. This delegate supplies no PASS or release.',
        'no_depth_deferral':'Mandatory local L1 reading was performed now. Conditional needs below are specific prerequisite evidence for additional Core/runtime/security claims; none is presented as acceptance of an unread local implementation.',
    },
    'authority_profiles':profiles,
    'groups':group_records,'entries':rows,'conditional_needs':NEEDS,
    'source_discrepancies':[
        {'id':'D-ticket-hmac-comment','path':'packages/server/src/middleware/authorization.ts','line':54,
         'observed':'Comment says the content handler verifies the HMAC ticket; the actual content-ticket module uses an opaque random token in a Map and the consumer calls tickets.verify.',
         'claim_limit':'Do not claim HMAC construction/verification. Preserve the historical comment as source text, with implementation-derived description.',
         'evidence_refs':refs('packages/server/src/middleware/authorization.ts','packages/server/src/capability-content-ticket.ts','packages/server/src/handlers/capability-artifacts.ts')},
        {'id':'D-capability-schedule-error-comment','path':'packages/server/src/handlers/capability-schedules.ts','line':35,
         'observed':'The constant-403 comment is broader than the executable mapError: capability authentication failures can become UnauthorizedError and schedule errors map to ConflictError.',
         'claim_limit':'Describe the executed branches rather than claiming every schedule failure is a constant 403.',
         'evidence_refs':refs('packages/server/src/handlers/capability-schedules.ts','packages/server/src/middleware/capability-authorization.ts')},
    ],
    'acceptance_limit':'Source-reading evidence only, unjudged. No runtime/CI/Atlas qualification, Core-wide policy acceptance or whole-layer release.',
}

selection = {'schema':'genesis.s1.exact-excerpt-selection.v1','source_revision':PIN,
             'artifact_key':'s1.api.surface-disposition','assigned_member_count':51,
             'excerpt_count':len(excerpts),'exact_excerpt_bytes':sum(x['excerpt_bytes'] for x in excerpts),
             'rule':'Every text value is an unchanged UTF-8 decoding of the stated original-byte line slice; no source file is reproduced in full.',
             'member_to_excerpt_map':{r['path']:r['evidence_refs'] for r in rows},
             'support_to_excerpt_map':{p:path_to_refs[p] for p in SUPPORT},'excerpts':excerpts}
read_log={'schema':'genesis.s1.literal-read-log.v1','source_revision':PIN,
          'assigned_count':51,'support_count':len(SUPPORT),'records':read_records}

def write_json(name,data):
    (OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
write_json('triage.json',triage)
write_json('excerpt-selection.json',selection)
write_json('read-log.json',read_log)

md=['# G57 — server.domain-surfaces: triagem semântica L1','',
    f'Fonte fixa: `{PIN}`. Delegação de `/root/producer_b` a `/root/producer_c`. Foram lidos integralmente os **51 membros exatos**, **{triage["population"]["assigned_source_bytes"]} bytes**, **{triage["population"]["assigned_source_lines"]} linhas**, mais **{len(SUPPORT)} arquivos de suporte** nos spans registrados. Nenhum produto foi executado. O estado atual é **evidência de produção não julgada**.','',
    '## O que esta revisão acrescenta','',
    'O grupo histórico dizia `L1_literal_surface`, `captured_literal_surface_indexed` e que os internals não haviam sido semanticamente revisados. Esse histórico está preservado integralmente em `historical-g57.json`. As entradas atuais registram propósito, dono delegado, decisões materiais locais, erros, autoridade e necessidades específicas. A leitura obrigatória local foi feita nesta revisão; não foi transferida genericamente para L2.','',
    'Não há membro G57 sem leitura nem dependência local de propósito/erro/autoridade ainda não lida. Isso não concede aceitação semântica: B ainda precisa integrar o suplemento à cobertura/corpo e os juízes independentes precisam avaliar o pacote. Os demais 139 membros históricos surface-only não são reclassificados por esta delegação.','',
    '## Limites materiais que a síntese deve preservar','',
    '- Auth comum depende de uma senha configurada não vazia; CapabilityAuthorization tem seu próprio fluxo Basic/bearer e private request frame. Principal é a conta do sistema operacional, não uma identidade remota individual.','- Content ticket é token aleatório opaco em memória, com cinco minutos por padrão e leitura novamente sob a autoridade mintadora. O comentário HMAC no middleware diverge da implementação.','- `health.get` retorna `healthy: true` sem sondagem de dependências. Config/trust persistem antes de reaplicar e ignoram falhas de reload/apply por Location.','- Session permission/question aplicam comparações locais de ownership; research artifact compara o binding retornado; os fluxos genéricos OAuth por attempt ID não têm a mesma comparação integrationID dos fluxos integration-scoped.','- Relay recusa checks executáveis por pertencerem ao Maestro; publica apenas após compilação/admissão, instala versões publicadas e reporta mudança já salva quando a gravação do recibo falha. Ledger íntegro externo continua `pending`/`external-self-reported`.','- RAG reidrata por Location e salva via delete/reinsert sem transaction local visível. Admissão chama extract antes de admit. Web UI mostra confinamento lexical, sem realpath/lstat; essas leituras não provam confinamento de symlinks ou ausência de races.','',
    '## Domínios e disposição dos 51 membros','',
    '| Domínio | Membros | Razão do grupo |','|---|---:|---|']
for g in group_records:
    md.append(f'| {g["title"]} | {g["count"]} | {g["grouping_reason"]} |')
for g in group_records:
    md += ['', '## '+g['title'], '', g['L1_need'], '']
    for item in [x for x in rows if x['group']==g['id']]:
        record=item['source_ref']
        md += ['### '+item['path'],'', item['purpose'],'',
               '**Autoridade/ownership:** '+item['local_authority'], '',
               '**Erros:** '+item['error_contract'], '',
               '**Fatos materiais lidos:**']
        md += ['', *['- '+text for text in item['material_facts']], '']
        selected=[e for e in excerpts if e['id'] in item['evidence_refs']]
        spans=', '.join(f'{e["start_line"]}–{e["end_line"]} ({e["id"]})' for e in selected)
        md += [f'**Proveniência:** blob `{record["git_blob_sha"]}`; SHA-256 `{record["sha256"]}`; leitura integral 1–{len(source_data[item["path"]]["lines"])}. Excertos: {spans}. Perfil compartilhado de autoridade: `{item["authority_profile"]}`.', '',
               '**Necessidades condicionais:** '+(', '.join('`'+n+'`' for n in item['conditional_need_ids']) or 'Nenhuma adicional além dos limites gerais de leitura.')+'.', '',
               'Estado histórico preservado: `L1_literal_surface` / `captured_literal_surface_indexed`. Estado atual: `L1_purpose_delegation_errors_authority_read`, `unjudged`, sem execução.','']
md += ['## Necessidades condicionais e claims bloqueadas','',
       'Estas classificações são **novas e explícitas**, associadas às observações desta triagem. Não apagam os gaps históricos nem transformam bloqueios em aceitação. Cada necessidade se torna obrigatória antes da claim dependente especificada.','']
for n in NEEDS:
    md += ['### '+n['id'],'', '**Gatilho:** '+n['trigger'], '', '**Evidência faltante:** '+n['missing_evidence'], '', '**Claim bloqueada:** '+n['blocked_claim'], '']
md += ['## Conferência dos excertos','',
       f'`excerpt-selection.json` contém **{len(excerpts)} spans**, totalizando **{selection["exact_excerpt_bytes"]} bytes literais**. Cada span inclui pin, blob, SHA-256 do arquivo, linhas, offsets, tamanho, SHA-256 do excerpt e texto exato. O mapa cobre todos os 51 membros e todos os suportes. Nenhum arquivo-fonte é reproduzido integralmente. `read-log.json` distingue leitura completa de suporte parcialmente lido.','',
       'As strings dos excerpts foram reconstruídas dos bytes originais com finais de linha preservados e conferidas contra as capturas. Verificação de bytes não é teste do produto nem veredito semântico.','']
(OUT/'triage.md').write_text('\n'.join(md))

steering='A principal exige registrar despachos e requests/responses reais: salve request.txt com a delegação recebida e response.md com sua resposta final em seu subdir server, sem raciocínio privado. Informe estado de leitura real e trechos efetivamente lidos. Quando terminar, encerre sua vez para liberar slot aos juízes; nenhum novo helper.'
(OUT/'request-steering.txt').write_text(steering)

verification={
    'source_revision':PIN,'assigned_paths_match_G57_exactly':True,'assigned_count':len(rows),
    'assigned_full_read_count':51,'support_count':len(SUPPORT),'all_capture_hashes_and_git_blobs_match_manifest':True,
    'historical_G57_object_unchanged':True,'every_assigned_member_has_semantic_row_and_excerpt':True,
    'excerpt_count':len(excerpts),'excerpt_bytes':selection['exact_excerpt_bytes'],
    'all_excerpts_match_original_capture_bytes':True,'all_excerpts_within_inspected_spans':True,
    'no_individual_excerpt_is_whole_source':True,'no_product_execution':True,
    'semantic_acceptance':'unjudged','local_mandatory_read_gap_count':0,
    'conditioned_claim_need_count':len(NEEDS),
}
write_json('verification.json',verification)
for name in ['triage.json','triage.md','excerpt-selection.json','read-log.json','verification.json']:
    b=(OUT/name).read_bytes()
    print(json.dumps({'path':name,'bytes':len(b),'sha256':digest(b)}))
print(json.dumps({'assigned':len(rows),'groups':len(group_records),'support_files':len(SUPPORT),
                  'excerpts':len(excerpts),'exact_excerpt_bytes':selection['exact_excerpt_bytes'],'conditional_needs':len(NEEDS)}))

