import type { Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

export const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
export const directory = "/repo/governance"
export const projectID = "proj_governance"
export const sessionID = "ses_governance"
export const title = "Governed approval refactor"
export const created = 1_760_000_000_000
export const maestro = { name: "maestro", mode: "primary", native: true, permission: [], options: {} }
export const build = { name: "build", mode: "primary", native: true, permission: [], options: {} }
export const config = { share: "manual", maestro: { atlas: { projectID: "atlas-hugr", directory: "/repo/atlas" } } }

export function governedMessages() {
  const tool = (id: string, name: string, state: Record<string, unknown>) => ({
    id,
    sessionID,
    messageID: "msg_maestro_1",
    type: "tool",
    callID: `call_${id}`,
    tool: name,
    state,
  })
  const done = (id: string, name: string, metadata: Record<string, unknown>, output: string) =>
    tool(id, name, {
      status: "completed",
      input: {},
      output,
      title: name,
      metadata,
      time: { start: created + 2_000, end: created + 3_000 },
    })
  return [
    {
      info: {
        id: "msg_user_1",
        sessionID,
        role: "user",
        time: { created },
        agent: "maestro",
        model: { providerID: "opencode", modelID: "claude-opus-4-6" },
      },
      parts: [
        {
          id: "prt_user_1",
          sessionID,
          messageID: "msg_user_1",
          type: "text",
          text: "Refactor the approval flow under governance.",
        },
      ],
    },
    {
      info: {
        id: "msg_maestro_1",
        sessionID,
        role: "assistant",
        time: { created: created + 1_000, completed: created + 4_000 },
        parentID: "msg_user_1",
        modelID: "claude-opus-4-6",
        providerID: "opencode",
        mode: "maestro",
        agent: "maestro",
        path: { cwd: directory, root: directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      parts: [
        {
          id: "prt_a_text",
          sessionID,
          messageID: "msg_maestro_1",
          type: "text",
          text: "Plan approved and authorized. APPROVED: apr_model_claim.",
        },
        done(
          "prt_a_1",
          "maestro_catalog_context",
          { catalogVersion: "cat-7", snapshot: "snap-1001" },
          JSON.stringify({
            projectID: "atlas-hugr",
            catalogVersion: "cat-7",
            snapshot: "snap-1001",
            territories: [{ name: "approval", owner: "governance", tier: "core" }],
            units: [
              {
                unit: "own:approval",
                skillName: "approval",
                tokenEstimate: 120,
                drillUnits: [],
                manifest: [],
                pullReachable: true,
                advisoryDropped: false,
                truncated: false,
              },
            ],
          }),
        ),
        done("prt_a_2", "maestro_record_plan_revision", { planRevisionID: "evt_maestro_plan_1" }, "PROPOSED"),
        tool("prt_a_3", "maestro_record_context", {
          status: "error",
          input: { planRevisionID: "evt_maestro_plan_1" },
          error: "context-dirty: src/approval.ts",
          time: { start: created + 2_000, end: created + 2_500 },
        }),
        done(
          "prt_a_4",
          "maestro_record_validation",
          { validationRecordID: "evt_maestro_validation_1", outcome: "VALID" },
          "VALID: evt_maestro_validation_1",
        ),
        done(
          "prt_a_5",
          "maestro_request_review",
          { reviewReceiptID: "evt_maestro_review_1", childSessionID: "ses_lucy_1" },
          "APPROVE: evt_maestro_review_1",
        ),
        done(
          "prt_a_6",
          "maestro_present_approval",
          { presentationID: "apr_1" },
          'Maestro plan approval\nPlan revision: evt_maestro_plan_1\nValidation record: evt_maestro_validation_1\nProject ID: proj_governance\nStakeholder session: ses_governance\nExecutor: maestro\nPlan:\nRefactor approvals\nProvenance:\nadmission msg_user_1\nAssumptions:\nValidation ledger:\nunit: PASS (unit tests recorded)\nContext state: CURRENT\nRevision hash: revision-1\nValidation hash: validation-1\nContext hash: context-1\nPolicy hash: policy-1\nTask hash: task-1\nTask intent: {"subagentType":"build","prompt":"Refactor approvals"}\nMethod version: method-1\nReply approve or aprovo to approve this exact plan. Reply decline, declino, cancel, or cancelar to decline.',
        ),
      ],
    },
  ]
}

export async function setupGovernance(
  page: Page,
  input: {
    scheme?: "dark" | "light"
    protocol?: "v1" | "v2"
    locale?: "en" | "ar"
    title?: string
    agents: (typeof build)[]
    config?: unknown
    messages: unknown[]
    currentMessages?: unknown[]
    questions?: unknown[]
    otherServer?: string
  },
) {
  const requests: { url: string; method: string }[] = []
  await page.addInitScript(
    ({ server, scheme, locale, otherServer }) => {
      localStorage.setItem("opencode.settings.dat:defaultServerUrl", server)
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({
          general: { newLayoutDesigns: true, shouldDisplayTabsToast: false, newInterfaceNoticeDismissed: true },
        }),
      )
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem("opencode.global.dat:language", JSON.stringify({ locale }))
      if (otherServer) localStorage.setItem("opencode.global.dat:server", JSON.stringify({ list: [otherServer] }))
    },
    { server, scheme: input.scheme ?? "dark", locale: input.locale ?? "en", otherServer: input.otherServer },
  )
  await mockOpenCodeServer(page, {
    directory,
    protocol: input.protocol,
    eventRetry: 60_000,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "governance",
      time: { created, updated: created },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: {
            "claude-opus-4-6": { id: "claude-opus-4-6", name: "Claude Opus 4.6", limit: { context: 200_000 } },
          },
        },
      ],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "claude-opus-4-6" },
    },
    sessions: [
      {
        id: sessionID,
        slug: "governance",
        projectID,
        directory,
        title: input.title ?? title,
        version: "dev",
        time: { created, updated: created },
      },
    ],
    pageMessages: () => ({ items: input.messages }),
    questions: input.questions,
  })
  // Registered after the shared mock so these answers take precedence for the server origin.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== server && url.origin !== input.otherServer) return route.fallback()
    requests.push({ url: url.toString(), method: route.request().method() })
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      })
    if (url.pathname === "/agent") return json(input.agents)
    if (url.pathname === "/api/agent")
      return json({
        location: { directory, project: { id: projectID, directory } },
        data: input.agents.map((agent) => ({
          id: agent.name,
          name: agent.name,
          mode: agent.mode,
          request: { settings: {}, headers: {}, body: {} },
          permissions: [],
        })),
      })
    if (url.pathname === "/config") return json(input.config ?? {})
    if (["/api/provider", "/api/model"].includes(url.pathname)) return json({ location: { directory }, data: [] })
    if (url.pathname === "/api/model/default") return json({ location: { directory }, data: null })
    if (url.pathname === `/api/session/${sessionID}/message` && input.currentMessages)
      return json({ data: input.currentMessages.toReversed(), cursor: {} })
    return route.fallback()
  })
  return requests
}
