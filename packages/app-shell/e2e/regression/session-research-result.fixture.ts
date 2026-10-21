import { createHash } from "node:crypto"
import type { Page } from "@playwright/test"
import { SessionEvent } from "@orchestra/schema/session-event"
import { SessionMessage } from "@orchestra/schema/session-message"
import { Schema } from "effect"
import {
  assistantID,
  assistantMessage,
  directory,
  model,
  projectID,
  sessionID,
  setupTimeline,
  toolPart,
  userID,
  userMessage,
} from "../performance/timeline-stability/fixture"

export const researchPartID = "prt_research_result"
export const researchSessionID = "ses_research_child"
export const researchDescription = "Inspect retained research"

export function researchDocument(
  texts = ["# Retained evidence\n\n", "Exact retained body.\n"],
  input: {
    title?: string
    index?: number
    executionSessionID?: string
    authoritySessionID?: string
    directory?: string
    projectID?: string
  } = {},
) {
  const suffix = String(input.index ?? 1).padStart(26, "0")
  const receipt = {
    binding: {
      projectID: input.projectID ?? projectID,
      memberID: "jimmy",
      taskId: "research-browser-control",
      executionSessionID: input.executionSessionID ?? researchSessionID,
      authoritySessionID: input.authoritySessionID ?? sessionID,
      directory: input.directory ?? directory,
      worktree: input.directory ?? directory,
    },
    ref: { id: `rdoc_${suffix}`, revision: 1 },
    artifact: { id: `cart_${suffix}`, revision: 1 },
    digest: createHash("sha256").update(texts.join("")).digest("hex"),
    title: input.title ?? "Retained report",
    genre: "evidence-review",
    bytes: Buffer.byteLength(texts.join("")),
    publishedAt: 1700000002000,
    findingRefs: [],
    citations: {},
  }
  return {
    receipt,
    pages: texts.map((text, index) => ({
      ref: receipt.artifact,
      representation: "markdown",
      text,
      receipt,
      complete: index === texts.length - 1,
      ...(index === texts.length - 1 ? {} : { cursor: `research-page-${index + 1}` }),
    })),
  }
}

export function researchEnvelope(
  input: {
    reason?: "ended" | "blocked" | "failed" | "interrupted" | "running"
    sufficiency?: "answered" | "partial" | "blocked"
    checked?: boolean
    parsed?: boolean
    answer?: string
    documents?: ReturnType<typeof researchDocument>["receipt"][]
  } = {},
) {
  return {
    schema: "discovery-work-result-v1",
    referencesChecked: input.checked ?? true,
    card: { parsed: input.parsed ?? true },
    terminal: { reason: input.reason ?? "ended", hostDetail: "Host-only detail must not become answer status" },
    discovery: {
      answer: input.answer ?? "## Qualified answer\n\nRetained sources support this bounded answer.",
      profile: "research",
      depth: "focused",
      sufficiency: input.sufficiency ?? "partial",
      findingRefs: [],
      evidenceRefs: [],
      documentRefs: [],
      coverage: { examined: ["retained source"], excluded: [], failures: [] },
      limitations: ["Coverage excludes unavailable sources."],
      nextActions: [],
    },
    documents: input.documents ?? [],
  }
}

export function researchTask(value: ReturnType<typeof researchEnvelope>, status: "running" | "completed" = "completed") {
  if (status === "running")
    return toolPart(
      researchPartID,
      "task",
      "running",
      { description: researchDescription, subagent_type: "jimmy" },
      { metadata: { sessionId: researchSessionID, workResult: value } },
    )
  return toolPart(
    researchPartID,
    "task",
    "completed",
    { description: researchDescription, subagent_type: "jimmy" },
    { metadata: { sessionId: researchSessionID, workResult: value }, output: "Research dispatch completed" },
  )
}

export function nativeResearchSuccess(value: ReturnType<typeof researchEnvelope>) {
  const event = Schema.decodeUnknownSync(SessionEvent.Tool.Success)({
    id: "evt_research_native_success",
    type: SessionEvent.Tool.Success.type,
    location: { directory },
    data: {
      timestamp: 1700000003000,
      sessionID,
      assistantMessageID: assistantID,
      callID: researchPartID,
      structured: { sessionId: researchSessionID, workResult: value },
      content: [{ type: "text", text: "Native research dispatch completed" }],
      provider: { executed: false },
    },
  }, { errors: "all", onExcessProperty: "error" })
  // Preserve the native event name and encoded timestamp; the app must own any compatibility mapping.
  return Schema.encodeSync(SessionEvent.Tool.Success)(event)
}

export async function setupResearchTimeline(
  page: Page,
  input: {
    value: ReturnType<typeof researchEnvelope>
    protocol: "v2"
    status?: "running" | "completed"
  },
) {
  const status = input.status ?? "completed"
  const timeline = await setupTimeline(page, {
    protocol: input.protocol,
    messages: [
      userMessage(),
      assistantMessage(input.protocol === "v2" ? [] : [researchTask(input.value, status)], { completed: status === "completed" }),
    ],
  })
  if (input.protocol === "v1") return timeline
  const messages = [
    { id: userID, type: "user", text: "Inspect native retained research", time: { created: 1700000000000 } },
    {
      id: assistantID,
      type: "assistant",
      agent: "build",
      model: { id: model.modelID, providerID: model.providerID },
      time: { created: 1700000001000, ...(status === "completed" ? { completed: 1700000002000 } : {}) },
      content: [{
        type: "tool",
        id: researchPartID,
        name: "task",
        time: { created: 1700000001000, ran: 1700000001000, ...(status === "completed" ? { completed: 1700000002000 } : {}) },
        state: {
          status,
          input: { description: researchDescription, subagent_type: "jimmy" },
          structured: { sessionId: researchSessionID, workResult: input.value },
          content: [{ type: "text", text: "Native retained research" }],
        },
      }],
    },
  ].map((value) => Schema.encodeSync(SessionMessage.Message)(
    Schema.decodeUnknownSync(SessionMessage.Message)(value, { errors: "all", onExcessProperty: "error" }),
  ))
  await page.route(new RegExp(`/api/session/${sessionID}/message(?:\\?|$)`), (route) => route.fulfill({
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ data: messages.toReversed(), cursor: {} }),
  }))
  // The frozen shared mock registers its catch-all during setup; reload after installing canonical native REST data.
  await page.reload()
  await timeline.transport.waitForConnection()
  return timeline
}

export async function mockResearchArtifacts(
  page: Page,
  documents: ReturnType<typeof researchDocument>[],
  input: {
    beforeReply?: (request: { artifactID: string; cursor: string | null }) => Promise<void>
    reply?: (body: ReturnType<typeof researchDocument>["pages"][number]) => { status: number; body: unknown }
  } = {},
) {
  const requests: { sessionID: string; artifactID: string; revision: string | null; cursor: string | null }[] = []
  // Include the build's default backend authority used by the timeline benchmark bridge.
  const origins = new Set(
    [process.env.PLAYWRIGHT_SERVER_PORT ?? "4096", "4096"].map(
      (port) => new URL(`http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${port}`).origin,
    ),
  )
  // Install after the shared mock server so its catch-all cannot swallow this generated-client route.
  await page.route(/\/api\/session\/[^/]+\/research\/[^/?]+(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url())
    if (!origins.has(url.origin)) return route.fallback()
    const segments = url.pathname.split("/")
    const request = {
      sessionID: segments[3]!,
      artifactID: segments[5]!,
      revision: url.searchParams.get("revision"),
      cursor: url.searchParams.get("cursor"),
    }
    const document = documents.find(
      (value) =>
        value.receipt.binding.executionSessionID === request.sessionID &&
        value.receipt.artifact.id === request.artifactID &&
        String(value.receipt.artifact.revision) === request.revision,
    )
    const index = request.cursor === null ? 0 : document?.pages.findIndex((value) => value.cursor === request.cursor)
    const body = document?.pages[request.cursor === null ? 0 : (index ?? -1) + 1]
    const directoryHeader = route.request().headers()["x-orchestra-directory"]
    if (
      route.request().method() !== "GET" ||
      !document ||
      !body ||
      index === -1 ||
      (directoryHeader !== undefined && decodeURIComponent(directoryHeader) !== document.receipt.binding.directory)
    )
      throw new Error(`Unexpected research artifact request: ${url.href}`)
    // Native session lookup may omit the directory header; the receipt-bound session path still owns the request.
    requests.push(request)
    await input.beforeReply?.(request)
    if (route.request().failure()?.errorText === "net::ERR_ABORTED") return
    const reply = input.reply?.(body) ?? { status: 200, body }
    await route.fulfill({
      status: reply.status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(reply.body),
    })
  })
  return requests
}
