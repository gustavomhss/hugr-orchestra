import type { RelayAuthoring } from "@orchestra/schema/relay-authoring"
import type { RelayHook } from "@orchestra/schema/relay-hook"
import type { RelayLedger } from "@orchestra/schema/relay-ledger"
import type { OrchestraClient } from "@orchestra/sdk/v2/client"

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

export type RelayClient = ReturnType<typeof createRelayClient>

type Answer = { data?: unknown; error?: unknown; response?: Response }

export function createRelayClient(input: { sdk: OrchestraClient; directory: string }) {
  const location = { directory: input.directory }
  const relay = input.sdk.v2.relay
  const off = { throwOnError: false } as const

  return {
    documents: async () =>
      (await body<RelayDocumentView[]>(relay.document.list({ location }, off))).map(decodeDocument),
    document: async (documentID: string) =>
      decodeDocument(await body<RelayDocumentView>(relay.document.get({ documentID, location }, off))),
    version: (documentID: string, versionID: string) =>
      body<RelayAuthoring.Version>(relay.document.version({ documentID, versionID, location }, off)),
    create: async (fields: RelayDocumentFields) =>
      decodeDocument(
        await body<RelayDocumentView>(relay.document.create({ location, relayDocumentCreate: contract(fields) }, off)),
      ),
    // A save of the loaded version; a stale one is a 409 version-conflict.
    save: async (document: RelayDocument, fields: RelayDocumentFields) =>
      decodeDocument(
        await body<RelayDocumentView>(
          relay.document.update(
            {
              documentID: document.id,
              location,
              relayDocumentUpdate: contract({
                ...fields,
                versionId: document.versionId,
                expectedChecksum: document.checksum,
              }),
            },
            off,
          ),
        ),
      ),
    remove: (documentID: string) => body<void>(relay.document.remove({ documentID, location }, off), true),
    definition: (documentID: string) => body<unknown>(relay.document.export({ documentID, location }, off)),
    nodeTypes: () =>
      body<{ workflow: RelayNodeType[]; hook: RelayNodeType[] }>(relay.document.nodeTypes({ location }, off)),
    publish: async (document: RelayDocument) =>
      decodeDocument(
        await body<RelayDocumentView>(
          relay.publish.publish(
            {
              documentID: document.id,
              location,
              relayPublishInput: { versionId: document.versionId, expectedChecksum: document.checksum },
            },
            off,
          ),
        ),
      ),
    installs: async () => (await body<{ installs: RelayInstall[] }>(relay.hook.list({ location }, off))).installs,
    // The server pins the document's published version; `version` is left out so it never pins anything else.
    install: (documentID: string) =>
      body<RelayInstall>(relay.hook.install({ location, relayHookInstallInput: { document: documentID } }, off)),
    update: (installID: string) =>
      body<RelayInstall>(relay.hook.update({ installID, location, relayHookUpdateInput: {} }, off)),
    enable: (installID: string, enabled: boolean) =>
      body<RelayInstall>(
        enabled ? relay.hook.enable({ installID, location }, off) : relay.hook.disable({ installID, location }, off),
      ),
    uninstall: (installID: string) => body<void>(relay.hook.uninstall({ installID, location }, off), true),
    decisions: (installID: string) => body<RelayDecision[]>(relay.hook.decisions({ installID, location }, off)),
  }
}

// The generated types differ from the contract only where the generator loses precision (see the header).
function contract<T>(value: unknown) {
  return value as T
}

// A Location-scoped success is `{location, data}`; anything else from a 2xx is not the Relay API.
async function body<T>(call: Promise<Answer>, empty = false): Promise<T> {
  const result = await call.catch((cause: unknown) => {
    // The SDK rejects a bare `text/html` answer (a server's embedded web app) before the body can be read.
    if (cause instanceof Error && cause.message.includes("Server responded with text/html"))
      throw new RelayError(0, "The server did not answer as Relay")
    throw new RelayError(-1, cause instanceof Error ? cause.message : String(cause), "transport")
  })
  const status = result.response?.status ?? -1
  if (!result.response?.ok || result.error !== undefined) throw refusal(status, result.error)
  if (empty) return contract<T>(undefined)
  if (!record(result.data) || !("data" in result.data)) throw new RelayError(0, "The server did not answer as Relay")
  return contract<T>(result.data.data)
}

function refusal(status: number, value: unknown) {
  if (!record(value)) return new RelayError(status, `${status}`)
  const message = typeof value.message === "string" && value.message ? value.message : `${status}`
  const code = typeof value.code === "string" ? value.code : undefined
  const tag = typeof value._tag === "string" ? value._tag : undefined
  return new RelayError(status, message, code, tag)
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
