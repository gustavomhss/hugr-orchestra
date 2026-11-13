// The event union the app-shell speaks internally (`ServerCurrentEvent`): the session event vocabulary plus the
// transitive closure of the types it names. It holds only what the V2 server publishes (`EventManifest.ServerDefinitions`)
// or what the app derives from it: `server-event-native.ts` translates `session.next.*`, and `adaptServerEvent` maps
// `permission.v2.*` and `question.v2.*` onto `permission.*` and `question.*`.
//
// It is NOT the local `Event` union in `@/v2-wire`: that one carries the server's `session.next.*` vocabulary and
// the `properties` payload, while this union carries the tags (`session.text.delta`, `session.tool.success`, ...)
// and the `data` payload that `server-event-native.ts` produces.

import type { ModelsDevRefreshed, IntegrationUpdated, IntegrationConnectionUpdated, CatalogUpdated, ReferenceUpdated, PluginAdded, ProjectDirectoriesUpdated, VcsBranchUpdated, V2EventServerConnected } from "./client-events/misc"
import type { SessionAgentSelected, SessionModelSelected, SessionMoved } from "./client-events/session-meta"
import type { SessionInputPromoted, SessionInputAdmitted, SessionSynthetic, SessionShellStarted, SessionShellEnded, SessionStepStarted, SessionStepEnded, SessionStepFailed, SessionRetryScheduled, SessionRevertStaged, SessionRevertCleared, SessionRevertCommitted } from "./client-events/session-run"
import type { SessionTextStarted, SessionTextDelta, SessionTextEnded, SessionReasoningStarted, SessionReasoningDelta, SessionReasoningEnded, SessionToolInputStarted, SessionToolInputDelta, SessionToolInputEnded, SessionToolCalled, SessionToolProgress, SessionToolSuccess, SessionToolFailed, SessionCompactionStarted, SessionCompactionDelta, SessionCompactionEnded, SessionCompactionFailed } from "./client-events/session-stream"
import type { PermissionV2Asked, PermissionV2Replied, PtyCreated, PtyUpdated, PtyExited, PtyDeleted, QuestionV2Asked, QuestionV2Replied, QuestionV2Rejected } from "./client-events/permission"

export type ClientEvent = ModelsDevRefreshed | IntegrationUpdated | IntegrationConnectionUpdated | CatalogUpdated | SessionAgentSelected | SessionModelSelected | SessionMoved | SessionInputPromoted | SessionInputAdmitted | SessionSynthetic | SessionShellStarted | SessionShellEnded | SessionStepStarted | SessionStepEnded | SessionStepFailed | SessionTextStarted | SessionTextDelta | SessionTextEnded | SessionReasoningStarted | SessionReasoningDelta | SessionReasoningEnded | SessionToolInputStarted | SessionToolInputDelta | SessionToolInputEnded | SessionToolCalled | SessionToolProgress | SessionToolSuccess | SessionToolFailed | SessionRetryScheduled | SessionCompactionStarted | SessionCompactionDelta | SessionCompactionEnded | SessionCompactionFailed | SessionRevertStaged | SessionRevertCleared | SessionRevertCommitted | ReferenceUpdated | PermissionV2Asked | PermissionV2Replied | PluginAdded | ProjectDirectoriesUpdated | PtyCreated | PtyUpdated | PtyExited | PtyDeleted | QuestionV2Asked | QuestionV2Replied | QuestionV2Rejected | VcsBranchUpdated | V2EventServerConnected;
