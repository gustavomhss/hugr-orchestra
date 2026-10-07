import { makeDefaultApi } from "@opencode-ai/protocol/api"
import { InvalidRequestError, SessionNotFoundError } from "@opencode-ai/protocol/errors"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

class LocationMiddleware extends HttpApiMiddleware.Service<LocationMiddleware>()(
  "@opencode-ai/client/LocationMiddleware",
) {}

class SessionLocationMiddleware extends HttpApiMiddleware.Service<SessionLocationMiddleware>()(
  "@opencode-ai/client/SessionLocationMiddleware",
  { error: [InvalidRequestError, SessionNotFoundError] },
) {}

export const ClientApi = makeDefaultApi({
  locationMiddleware: LocationMiddleware,
  sessionLocationMiddleware: SessionLocationMiddleware,
})

export const groupNames = {
  "server.health": "health",
  "server.location": "location",
  "server.agent": "agents",
  "server.session": "sessions",
  "server.message": "messages",
  "server.model": "models",
  "server.provider": "providers",
  "server.integration": "integrations",
  "server.credential": "credentials",
  "server.permission": "permissions",
  "server.fs": "files",
  "server.command": "commands",
  "server.skill": "skills",
  "server.behavior": "behaviors",
  "server.event": "events",
  "server.pty": "ptys",
  "server.question": "questions",
  "server.reference": "references",
  "server.projectCopy": "projectCopies",
  "server.relay.document": "relayDocuments",
  "server.relay.publish": "relayPublish",
  "server.relay.hook": "relayHooks",
  "server.pullRequest": "pullRequests",
  "server.schedule": "schedules",
} as const

export const endpointNames = {
  "agent.file.get": "getFile",
  "agent.file.update": "updateFile",
  "session.messages": "list",
  "integration.connect.key": "connectKey",
  "integration.connect.oauth": "connectOauth",
  "integration.attempt.status": "attemptStatus",
  "integration.attempt.complete": "attemptComplete",
  "integration.attempt.cancel": "attemptCancel",
  "permission.request.list": "listRequests",
  "permission.saved.list": "listSaved",
  "permission.saved.remove": "removeSaved",
  "question.request.list": "listRequests",
  "relay.document.export": "definition",
  "relay.scope.list": "listScopes",
  "relay.scope.create": "createScope",
  "relay.scope.update": "updateScope",
  "relay.scope.remove": "removeScope",
} as const

export const omitEndpoints = new Set(["fs.read", "pty.connect", "pty.connectToken"])
