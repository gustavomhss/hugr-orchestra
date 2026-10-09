import { createHash } from "node:crypto"
import type { Page } from "@playwright/test"
import { directory, projectID, sessionID, toolPart } from "../performance/timeline-stability/fixture"

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

export function researchTask(value: ReturnType<typeof researchEnvelope>) {
  return toolPart(
    researchPartID,
    "task",
    "completed",
    { description: researchDescription, subagent_type: "jimmy" },
    { metadata: { sessionId: researchSessionID, workResult: value }, output: "Research dispatch completed" },
  )
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
  // Install after the shared mock server so its catch-all cannot swallow this generated-client route.
  await page.route(/\/api\/session\/[^/]+\/research\/[^/?]+(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url())
    const segments = url.pathname.split("/")
    const request = {
      sessionID: segments[3]!,
      artifactID: segments[5]!,
      revision: url.searchParams.get("revision"),
      cursor: url.searchParams.get("cursor"),
    }
    requests.push(request)
    const document = documents.find((value) => value.receipt.artifact.id === request.artifactID)
    const index = request.cursor === null ? 0 : document?.pages.findIndex((value) => value.cursor === request.cursor)
    const body = document?.pages[request.cursor === null ? 0 : (index ?? -1) + 1]
    if (
      route.request().method() !== "GET" ||
      !document ||
      !body ||
      index === -1 ||
      request.sessionID !== document.receipt.binding.executionSessionID ||
      request.revision !== "1"
    )
      throw new Error(`Unexpected research artifact request: ${url.href}`)
    await input.beforeReply?.(request)
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
