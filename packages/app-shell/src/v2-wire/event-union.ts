import type {
  EventCatalogUpdated,
  EventFileEdited,
  EventFileWatcherUpdated,
  EventIntegrationConnectionUpdated,
  EventIntegrationUpdated,
  EventModelsDevRefreshed,
  EventPluginAdded,
  EventProjectDirectoriesUpdated,
  EventReferenceUpdated,
  EventRelayHookDecided,
  EventServerConnected,
  EventTodoUpdated,
  EventVcsBranchUpdated,
} from "./event-other"

import type {
  EventMaestroAdmissionDecided,
  EventMaestroApprovalConsumed,
  EventMaestroApprovalDecided,
  EventMaestroApprovalPresented,
  EventMaestroApprovalReserved,
  EventMaestroAuthorizationGranted,
  EventMaestroClarificationDecided,
  EventMaestroContextRecorded,
  EventMaestroDispatchReserved,
  EventMaestroHeldEntered,
  EventMaestroPlanRevisionRecorded,
  EventMaestroScopeDecided,
  EventMaestroTaskBound,
  EventMaestroTaskWorkflowBound,
  EventMaestroValidationRecorded,
  EventMaestroWorkResultDecided,
} from "./event-maestro"

import type { EventMaestroReviewReceived } from "../v2-wire-review"

import type {
  EventPermissionV2Asked,
  EventPermissionV2Replied,
  EventPtyCreated,
  EventPtyDeleted,
  EventPtyExited,
  EventPtyUpdated,
  EventQuestionV2Asked,
  EventQuestionV2Rejected,
  EventQuestionV2Replied,
} from "./event-permission"

import type {
  EventSessionNextCreated,
  EventSessionNextDeleted,
  EventSessionNextRenamed,
  EventSessionNextAgentSwitched,
  EventSessionNextArchiveChanged,
  EventSessionNextCompactionDelta,
  EventSessionNextCompactionEnded,
  EventSessionNextCompactionFailed,
  EventSessionNextCompactionStarted,
  EventSessionNextContextUpdated,
  EventSessionNextModelSwitched,
  EventSessionNextMoved,
  EventSessionNextPromptAdmitted,
  EventSessionNextPrompted,
  EventSessionNextReasoningDelta,
  EventSessionNextReasoningEnded,
  EventSessionNextReasoningStarted,
  EventSessionNextRetried,
  EventSessionNextRevertCleared,
  EventSessionNextRevertCommitted,
  EventSessionNextRevertStaged,
  EventSessionNextShellEnded,
  EventSessionNextShellStarted,
  EventSessionNextStepEnded,
  EventSessionNextStepFailed,
  EventSessionNextStepStarted,
  EventSessionNextSubagentModelsChanged,
  EventSessionNextSynthetic,
  EventSessionNextTextDelta,
  EventSessionNextTextEnded,
  EventSessionNextTextStarted,
  EventSessionNextToolCalled,
  EventSessionNextToolFailed,
  EventSessionNextToolInputDelta,
  EventSessionNextToolInputEnded,
  EventSessionNextToolInputStarted,
  EventSessionNextToolProgress,
  EventSessionNextToolSuccess,
} from "./event-session"

export type Event =
  | EventModelsDevRefreshed
  | EventIntegrationUpdated
  | EventIntegrationConnectionUpdated
  | EventCatalogUpdated
  | EventSessionNextCreated
  | EventSessionNextRenamed
  | EventSessionNextDeleted
  | EventSessionNextAgentSwitched
  | EventSessionNextModelSwitched
  | EventSessionNextSubagentModelsChanged
  | EventSessionNextArchiveChanged
  | EventSessionNextMoved
  | EventSessionNextPrompted
  | EventSessionNextPromptAdmitted
  | EventSessionNextContextUpdated
  | EventSessionNextSynthetic
  | EventSessionNextShellStarted
  | EventSessionNextShellEnded
  | EventSessionNextStepStarted
  | EventSessionNextStepEnded
  | EventSessionNextStepFailed
  | EventSessionNextTextStarted
  | EventSessionNextTextDelta
  | EventSessionNextTextEnded
  | EventSessionNextReasoningStarted
  | EventSessionNextReasoningDelta
  | EventSessionNextReasoningEnded
  | EventSessionNextToolInputStarted
  | EventSessionNextToolInputDelta
  | EventSessionNextToolInputEnded
  | EventSessionNextToolCalled
  | EventSessionNextToolProgress
  | EventSessionNextToolSuccess
  | EventSessionNextToolFailed
  | EventSessionNextRetried
  | EventSessionNextCompactionStarted
  | EventSessionNextCompactionDelta
  | EventSessionNextCompactionEnded
  | EventSessionNextCompactionFailed
  | EventSessionNextRevertStaged
  | EventSessionNextRevertCleared
  | EventSessionNextRevertCommitted
  | EventMaestroApprovalPresented
  | EventMaestroApprovalDecided
  | EventMaestroApprovalConsumed
  | EventMaestroApprovalReserved
  | EventMaestroAdmissionDecided
  | EventMaestroPlanRevisionRecorded
  | EventMaestroContextRecorded
  | EventMaestroClarificationDecided
  | EventMaestroScopeDecided
  | EventMaestroHeldEntered
  | EventMaestroValidationRecorded
  | EventMaestroReviewReceived
  | EventMaestroAuthorizationGranted
  | EventMaestroDispatchReserved
  | EventMaestroTaskBound
  | EventMaestroTaskWorkflowBound
  | EventMaestroWorkResultDecided
  | EventFileEdited
  | EventReferenceUpdated
  | EventPermissionV2Asked
  | EventPermissionV2Replied
  | EventPluginAdded
  | EventProjectDirectoriesUpdated
  | EventFileWatcherUpdated
  | EventPtyCreated
  | EventPtyUpdated
  | EventPtyExited
  | EventPtyDeleted
  | EventQuestionV2Asked
  | EventQuestionV2Replied
  | EventQuestionV2Rejected
  | EventRelayHookDecided
  | EventTodoUpdated
  | EventVcsBranchUpdated
  | EventServerConnected
