import { ClientError } from "@orchestra/client"
import type { RelayAuthoring } from "@orchestra/schema/relay-authoring"
import type { RelayHook } from "@orchestra/schema/relay-hook"
import type { RelayLedger } from "@orchestra/schema/relay-ledger"
import type { ServerClient } from "@/utils/server"

// The Relay authoring routes (`server.relay.document`, `server.relay.publish`, `server.relay.hook`), called through
// the generated V2 client. The types are the frozen schema contracts: the generator drops `NullOr` (an unpublished
// document's `activeVersionId`, a session decision's `tool`) and widens finite numbers, so values cross that boundary
// once, in `contract`. Runs are not in the API yet (WP17); see runs.ts.

export type RelayKind = "workflow" | "hook"

/** A stored document as the editor reads it (protocol `RelayDocumentView`). */
export type RelayDocumentView = Omit<RelayAuthoring.Document, "tags"> & {
  tags: ReadonlyArray<RelayAuthoring.Scope>
  checksum: string
  activeVersion: RelayAuthoring.Version | null
  runnable: boolean
  publishedBy?: string
  unpublishedBy?: string
}

/** The view with the optional fields defaulted and the published counter read from the published version. */
export type RelayDocument = RelayDocumentView & {
  description: string
  nodeGroups: ReadonlyArray<RelayAuthoring.NodeGroup>
  publishedCounter: number | undefined
  updated: number | undefined
}

export type RelayNodeType = RelayAuthoring.NodeTypeDescriptor
export type RelayInstall = RelayHook.Install
/** One `hook-decision` line of an install's ledger, with its chain sequence number. `ts` is epoch seconds. */
export type RelayDecision = RelayLedger.HookDecision & { seq: number }

/** The fields a save or a create sends (protocol `RelayDocumentCreate`). */
export type RelayDocumentFields = {
  name?: string
  description?: string
  nodes?: ReadonlyArray<RelayAuthoring.Node>
  connections?: RelayAuthoring.Connections
  nodeGroups?: ReadonlyArray<RelayAuthoring.NodeGroup>
  tags?: ReadonlyArray<RelayAuthoring.Tag>
  meta?: RelayAuthoring.Meta
}

/** A refusal: the HTTP status and, from the Relay routes, `{_tag, code, message}`. */
export class RelayError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly tag?: string,
  ) {
    super(message)
  }
}

/**
 * The server has no such Relay route: a 404, 405 or 501 that is not a Relay refusal, or a success that is not the
 * Relay API at all (status 0, for example the web app's fallback page).
 */
export function relayUnsupported(error: unknown) {
  if (!(error instanceof RelayError)) return false
  if (error.status === 0) return true
  return (error.status === 404 || error.status === 405 || error.status === 501) && !error.tag?.startsWith("Relay")
}

/**
 * What a failed write or reload means to the editor: the server could not be reached, the document no longer exists
 * there, someone saved a newer version first, or a refusal whose message is shown as it is.
 */
export function writeFailure(error: unknown) {
  if (!(error instanceof RelayError)) return "error" as const
  if (error.code === "transport") return "offline" as const
  if (error.status === 409) return "conflict" as const
  if (error.status === 404 && !relayUnsupported(error)) return "missing" as const
  return "error" as const
}

export type RelayClient = ReturnType<typeof createRelayClient>

export function createRelayClient(input: { orchestra: ServerClient; directory: string }) {
  const location = { directory: input.directory }
  const documents = input.orchestra.relayDocuments
  const publication = input.orchestra.relayPublish
  const hooks = input.orchestra.relayHooks

  return {
    documents: async () => (await body<RelayDocumentView[]>(documents.list({ location }))).map(decodeDocument),
    document: async (documentID: string) =>
      decodeDocument(await body<RelayDocumentView>(documents.get({ documentID, location }))),
    version: (documentID: string, versionID: string) =>
      body<RelayAuthoring.Version>(documents.version({ documentID, versionID, location })),
    versions: (documentID: string) => body<RelayAuthoring.Version[]>(documents.versions({ documentID, location })),
    create: async (fields: RelayDocumentFields) =>
      decodeDocument(
        await body<RelayDocumentView>(
          documents.create({ location, ...contract<Omit<Parameters<typeof documents.create>[0] & {}, "location">>(fields) }),
        ),
      ),
    // A save of the loaded version; a stale one is a 409 version-conflict. `force` writes over whatever is stored.
    save: async (document: RelayDocument, fields: RelayDocumentFields, options: { force?: boolean } = {}) =>
      decodeDocument(
        await body<RelayDocumentView>(
          documents.update({
            documentID: document.id,
            location,
            ...contract<Omit<Parameters<typeof documents.update>[0], "documentID" | "location">>({
              ...fields,
              versionId: document.versionId,
              expectedChecksum: document.checksum,
              // Sent only to overwrite: an ordinary save keeps the update body it always had.
              ...(options.force ? { force: true } : {}),
            }),
          }),
        ),
      ),
    remove: (documentID: string) => body<void>(documents.remove({ documentID, location }), true),
    definition: (documentID: string) => body<unknown>(documents.definition({ documentID, location })),
    nodeTypes: () => body<{ workflow: RelayNodeType[]; hook: RelayNodeType[] }>(documents.nodeTypes({ location })),
    publish: async (document: RelayDocument) =>
      decodeDocument(
        await body<RelayDocumentView>(
          publication.publish({
            documentID: document.id,
            location,
            versionId: document.versionId,
            expectedChecksum: document.checksum,
          }),
        ),
      ),
    // Withdraws the published version; the draft is kept.
    unpublish: async (document: RelayDocument) =>
      decodeDocument(
        await body<RelayDocumentView>(
          publication.unpublish({ documentID: document.id, location, expectedChecksum: document.checksum }),
        ),
      ),
    installs: async () => (await body<{ installs: RelayInstall[] }>(hooks.list({ location }))).installs,
    // The server pins the document's published version; `version` is left out so it never pins anything else.
    install: (documentID: string) => body<RelayInstall>(hooks.install({ location, document: documentID })),
    update: (installID: string) => body<RelayInstall>(hooks.update({ installID, location })),
    // The server moves a corrupt hooks.json aside and starts an empty install list; it refuses a valid or unreadable file.
    repair: () => body<{ backup: string; installs: RelayInstall[] }>(hooks.repair({ location, confirm: true })),
    // The evaluation order: every install exactly once, first to last. Answers the installs in their new order.
    order: async (installIDs: string[]) =>
      (await body<{ installs: RelayInstall[] }>(hooks.order({ location, installIDs }))).installs,
    enable: (installID: string, enabled: boolean) =>
      body<RelayInstall>(enabled ? hooks.enable({ installID, location }) : hooks.disable({ installID, location })),
    uninstall: (installID: string) => body<void>(hooks.uninstall({ installID, location }), true),
    decisions: (installID: string) => body<RelayDecision[]>(hooks.decisions({ installID, location })),
  }
}

// The generated types differ from the contract only where the generator loses precision (see the header).
function contract<T>(value: unknown) {
  return value as T
}

// A Location-scoped success is `{location, data}`; anything else from a 2xx is not the Relay API.
async function body<T>(call: Promise<unknown>, empty = false): Promise<T> {
  const result = await call.catch((cause: unknown) => {
    throw failure(cause)
  })
  if (empty) return contract<T>(undefined)
  if (!record(result) || !("data" in result)) throw new RelayError(0, "The server did not answer as Relay")
  return contract<T>(result.data)
}

// The generated client throws a declared refusal's body as it is, and a `ClientError` for everything else.
function failure(cause: unknown) {
  if (clientError(cause)) {
    // The request never reached the server, or the server never answered.
    if (cause.reason === "Transport")
      return new RelayError(-1, cause.cause instanceof Error ? cause.cause.message : cause.message, "transport")
    if (cause.reason === "UnexpectedStatus") {
      const status = record(cause.cause) && typeof cause.cause.status === "number" ? cause.cause.status : 0
      return new RelayError(status, `Request failed (HTTP ${status})`)
    }
    // A body that is not JSON (a server's embedded web app, a bare 404 page) is not the Relay API.
    return new RelayError(0, "The server did not answer as Relay")
  }
  if (!record(cause)) return new RelayError(-1, cause instanceof Error ? cause.message : String(cause), "transport")
  const tag = typeof cause._tag === "string" ? cause._tag : undefined
  const status = (tag && refusalStatus[tag]) || 400
  const message = typeof cause.message === "string" && cause.message ? cause.message : `Request failed (HTTP ${status})`
  return new RelayError(status, message, typeof cause.code === "string" ? cause.code : undefined, tag)
}

// Matched by name as well as class: the app can hold two copies of the client module (a bundler alias, a test
// loader), and a `ClientError` from the other copy would otherwise read as a declared refusal body.
function clientError(cause: unknown): cause is ClientError {
  return cause instanceof ClientError || (cause instanceof Error && cause.name === "ClientError" && "reason" in cause)
}

// The declared refusals' statuses (protocol `groups/relay-*.ts`, `errors.ts`); the body does not carry its status.
const refusalStatus: Record<string, number> = {
  RelayInvalidError: 400,
  UnauthorizedError: 401,
  RelayForbiddenError: 403,
  RelayNotFoundError: 404,
  RelayConflictError: 409,
  RelayUnavailableError: 503,
}

export function decodeDocument(view: RelayDocumentView): RelayDocument {
  const updated = Date.parse(view.updatedAt)
  return {
    ...view,
    description: view.description ?? "",
    nodeGroups: view.nodeGroups ?? [],
    publishedCounter: view.activeVersion?.versionCounter,
    updated: Number.isNaN(updated) ? undefined : updated,
  }
}

export function documentKind(document: Pick<RelayDocument, "meta" | "nodes">): RelayKind {
  const kind = document.meta.relay?.kind
  if (kind) return kind
  return document.nodes.some((node) => node.type.startsWith("relay.hook")) ? "hook" : "workflow"
}

export const documentDiagnostics = (document: Pick<RelayDocument, "meta">) => document.meta.relay?.diagnostics ?? []

/** The shipped profile a seeded document was projected from, if any. */
export const documentProfile = (document: Pick<RelayDocument, "meta">) => document.meta.relay?.profile

/** Ledger timestamps are epoch seconds. */
export const decisionTime = (decision: Pick<RelayDecision, "ts">) => decision.ts * 1000

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
