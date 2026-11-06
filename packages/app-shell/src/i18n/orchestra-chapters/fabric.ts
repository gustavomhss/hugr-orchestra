// English source copy; other locales intentionally inherit it until terminology is verified.
export const FABRIC_COPY = {
  "orchestra.fabric.title": "Fabric Studio",
  "orchestra.fabric.eyebrow": "Local context setup",
  "orchestra.fabric.description":
    "Choose an authorized local context on this Orchestra server. This does not connect to Microsoft Fabric.",
  "orchestra.fabric.noServer": "The selected Orchestra server is not available.",
  "orchestra.fabric.chooseServer": "Choose a server in Home",
  "orchestra.fabric.loading": "Loading local contexts…",
  "orchestra.fabric.active": "Local contexts",
  "orchestra.fabric.preparing": "Unfinished preparations",
  "orchestra.fabric.preparingHint":
    "These reservations have no usable Location. Cancelling only revokes the local reservation.",
  "orchestra.fabric.empty": "No local contexts yet",
  "orchestra.fabric.emptyHint":
    "Create a local context to continue without a Git project. Creating one does not sign in to Microsoft or start Fabric work.",
  "orchestra.fabric.noPreparations": "No unfinished preparations.",
  "orchestra.fabric.create": "Create local context",
  "orchestra.fabric.retryCreate": "Retry the same creation",
  "orchestra.fabric.ambiguous":
    "The request may already have completed. Retry keeps its original request key; leaving this context setup ends the local retry.",
  "orchestra.fabric.open": "Open",
  "orchestra.fabric.openContext": "Open context {{id}}",
  "orchestra.fabric.generation": "Generation {{generation}}",
  "orchestra.fabric.opening": "Resolving the selected context…",
  "orchestra.fabric.ready": "Local context resolved",
  "orchestra.fabric.readyHint":
    "This is an authorized local Location, not a Microsoft workspace or a ready Fabric connection. Studio composition and Fabric operations are still in development.",
  "orchestra.fabric.more": "Load more",
  "orchestra.fabric.retry": "Retry",
  "orchestra.fabric.retryResolve": "Retry this context",
  "orchestra.fabric.cancelPreparation": "Cancel preparation {{id}}",
  "orchestra.fabric.cancelPreparationLabel": "Cancel preparation",
  "orchestra.fabric.revoke": "Revoke local context {{id}}",
  "orchestra.fabric.revokeLabel": "Revoke",
  "orchestra.fabric.confirmTitle": "Revoke this local context?",
  "orchestra.fabric.confirmDescription":
    "This only revokes the local context. It does not delete files or Microsoft Fabric data.",
  "orchestra.fabric.confirm": "Revoke context",
  "orchestra.fabric.dismiss": "Keep context",
  "orchestra.fabric.retryRemove": "Retry the same revocation",
  "orchestra.fabric.error.authentication":
    "This Orchestra server did not accept the connection credentials. Review the connection in Home, then retry explicitly.",
  "orchestra.fabric.error.denied": "The current operator is not allowed to perform this local context action.",
  "orchestra.fabric.error.conflict":
    "The local reference changed, expired, or reached a limit. Refresh the list or retry the original request.",
  "orchestra.fabric.error.invalid":
    "The local context request was not accepted. Refresh the list and select a current reference.",
  "orchestra.fabric.error.unavailable":
    "The local context is unavailable. No context was opened or repaired; retry explicitly when the server is available.",
} as const
