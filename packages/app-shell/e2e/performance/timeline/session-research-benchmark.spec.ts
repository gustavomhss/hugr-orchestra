import { createHash } from "node:crypto"
import { benchmark, benchmarkDiagnostics, expect } from "../benchmark"
import {
  buildInitialStreamEvent,
  buildStreamDeltaEvents,
  setupTimelineBenchmark,
  textPartID,
} from "./session-timeline-benchmark.fixture"
import { startTimelineProfile } from "./session-timeline-profile"
import {
  collectTimelineStreamMetrics,
  installTimelineStreamProbe,
  startTimelineStreamProbe,
} from "./session-timeline-stream-probe"
import {
  mockResearchArtifacts,
  researchDescription,
  researchDocument,
  researchEnvelope,
  researchPartID,
  researchSessionID,
  researchTask,
} from "../../regression/session-research-result.fixture"

benchmark("performance: common streaming then retained research result", async ({ page, report }) => {
  const renderer = process.env.RESEARCH_BENCH_RENDERER
  if (renderer !== "current" && renderer !== "legacy")
    throw new Error("Set RESEARCH_BENCH_RENDERER=current or legacy explicitly")
  const revision = process.env.RESEARCH_BENCH_REVISION
  if (!revision || revision.length !== 40 || !/^[0-9a-f]{40}$/.test(revision))
    throw new Error("Set RESEARCH_BENCH_REVISION to the full lowercase 40-hex production checkout SHA")
  const completionTimeoutMs = benchmarkNumber("TIMELINE_COMPLETION_TIMEOUT_MS", 420_000, { minimum: 1, integer: true })
  const historyTurns = benchmarkNumber("TIMELINE_HISTORY_TURNS", 320, { minimum: 0, integer: true })
  const deltaCount = benchmarkNumber("TIMELINE_DELTA_COUNT", 160, { minimum: 1, integer: true })
  const eventBatch = benchmarkNumber("TIMELINE_EVENT_BATCH", 1, { minimum: 1, integer: true })
  const cpuThrottle = benchmarkNumber("TIMELINE_CPU_THROTTLE", 30, { minimum: 1, integer: false })
  const profileCPU = benchmarkFlag("TIMELINE_CPU_PROFILE", "0")
  const minimal = benchmarkFlag("TIMELINE_MINIMAL", "0")
  const visualProfile = benchmarkFlag("TIMELINE_VISUAL_PROFILE", "1")
  const profileVisual = !minimal && profileCPU && visualProfile
  benchmark.setTimeout(completionTimeoutMs + 60_000)
  const fixture = await setupTimelineBenchmark(page, { historyTurns, eventBatch })
  fixture.transport.enqueue(buildInitialStreamEvent(deltaCount))
  await expect(fixture.text).toContainText("Implementation plan")
  await fixture.scrollToBottom()
  await fixture.waitForStableGeometry()
  const profile = await startTimelineProfile(page, { cpuThrottle, profileCPU })
  await installTimelineStreamProbe(page, { textPartID, finalIndex: deltaCount, profileVisual, minimal })
  await startTimelineStreamProbe(page)
  const deltas = buildStreamDeltaEvents(deltaCount)
  fixture.transport.enqueue(deltas)
  await page.waitForFunction(
    (index) =>
      (
        window as Window & { __timelineStreamBenchmark?: { applied: { index: number }[] } }
      ).__timelineStreamBenchmark?.applied.some((value) => value.index === index),
    deltaCount,
    { timeout: completionTimeoutMs },
  )
  await expect(fixture.text).toContainText("benchmark-complete")
  await fixture.waitForStableGeometry()
  const commonStream = await collectTimelineStreamMetrics(page, {
    textPartID,
    finalIndex: deltaCount,
    navigations: benchmarkDiagnostics(page).navigations,
  })
  expect(fixture.transport.pendingCount()).toBe(0)
  await profile.stop()
  await profile.reset()

  // Identical admitted payload in both checkouts. The original has no result renderer/open action.
  const document = researchDocument(
    [
      "# Benchmark retained document\n\n" + "Retained source text and bounded evidence.\n".repeat(300),
      "## Evidence table\n\n| Source | Finding |\n| --- | --- |\n" + "| source | supported |\n".repeat(500),
      "## Mixed text\n\nעברית العربية `src/report.ts`\n\n```ts\nconst answer = 42\n```\n\nDocument benchmark complete.\n",
    ],
    {
      directory: "C:/Orchestra/TimelineStateRegression",
      projectID: "proj_timeline_state_regression",
      authoritySessionID: "ses_timeline_state_regression",
    },
  )
  document.pages.forEach((value) => expect(Buffer.byteLength(value.text)).toBeLessThanOrEqual(16 * 1024))
  const workResult = researchEnvelope({
    answer: "## Benchmark qualified answer\n\n" + "Bounded answer with retained sources.\n\n".repeat(80),
    documents: [document.receipt],
  })
  // The research task arrives as the V2 tool events that open, call and settle it on the streamed message.
  const task = researchTask(workResult)
  if (task.state.status !== "completed") throw new Error("Research benchmark publishes a completed task")
  const call = {
    sessionID: "ses_timeline_state_regression",
    assistantMessageID: "msg_assistant_regression",
    callID: task.id,
  }
  const publication = [
    { type: "session.tool.input.started", properties: { ...call, name: task.tool } },
    { type: "session.tool.called", properties: { ...call, input: task.state.input, executed: false } },
    {
      type: "session.tool.success",
      properties: {
        ...call,
        content: [{ type: "text", text: task.state.output }],
        metadata: task.state.metadata,
        executed: false,
      },
    },
  ].map((payload) => ({ directory: "C:/Orchestra/TimelineStateRegression", payload }))
  const requests = await mockResearchArtifacts(page, [document])
  const publicationStarted = performance.now()
  fixture.transport.enqueue(publication)
  const taskRow = page.locator(`[data-timeline-part-id="${researchPartID}"]`)
  await expect(taskRow.getByRole("link", { name: new RegExp(researchDescription) })).toBeVisible()
  const taskObservedMs = performance.now() - publicationStarted
  const result = taskRow.locator('[data-component="research-result"]')
  const research =
    renderer === "legacy"
      ? null
      : await (async () => {
          await expect(result.getByRole("heading", { name: "Benchmark qualified answer", exact: true })).toBeVisible()
          await expect(result.getByText("Partial answer", { exact: true })).toBeVisible()
          const resultObservedMs = performance.now() - publicationStarted
          const openStarted = performance.now()
          await result.getByRole("button", { name: document.receipt.title, exact: true }).click()
          const region = result.getByRole("region", { name: document.receipt.title, exact: true })
          await expect(region.getByRole("heading", { name: "Benchmark retained document", exact: true })).toBeVisible()
          await expect(region.getByRole("table")).toHaveCount(1)
          await expect(region.locator("pre code")).toHaveText("const answer = 42\n")
          await expect(region.getByText("Document benchmark complete.", { exact: true })).toBeVisible()
          await expect(result.getByRole("status")).toBeEmpty()
          const documentObservedMs = performance.now() - openStarted
          expect(requests.map((request) => request.cursor)).toEqual([null, "research-page-1", "research-page-2"])
          expect(requests.every((request) => request.sessionID === researchSessionID && request.revision === "1")).toBe(
            true,
          )
          expect(Number.isFinite(resultObservedMs)).toBe(true)
          expect(Number.isFinite(documentObservedMs)).toBe(true)
          return { resultObservedMs, documentObservedMs, pages: requests.length, bytes: document.receipt.bytes }
        })()
  if (renderer === "legacy") {
    await expect(result).toHaveCount(0)
    expect(requests).toEqual([])
  }
  expect(Number.isFinite(taskObservedMs)).toBe(true)
  report(
    { commonStream, taskObservedMs, research },
    {
      revision,
      renderer,
      workload: "research-ui-v1",
      historyTurns,
      deltaCount,
      eventBatch,
      cpuThrottle,
      profileCPU,
      profileVisual,
      minimal,
      researchCpuThrottle: 1,
      workloadDigest: createHash("sha256")
        .update(JSON.stringify({ publication, pages: document.pages }))
        .digest("hex"),
      comparison: "commonStream comparable; research render/open unavailable on original baseline",
    },
  )
})

function benchmarkNumber(name: string, fallback: number, options: { minimum: number; integer: boolean }) {
  const raw = process.env[name] ?? String(fallback)
  const value = Number(raw)
  if (
    !raw.trim() ||
    !Number.isFinite(value) ||
    value < options.minimum ||
    (options.integer && !Number.isSafeInteger(value))
  )
    throw new Error(
      `${name} must be a nonblank finite ${options.integer ? "safe integer" : "number"} >= ${options.minimum}`,
    )
  return value
}

function benchmarkFlag(name: string, fallback: "0" | "1") {
  const value = process.env[name] ?? fallback
  if (value !== "0" && value !== "1") throw new Error(`${name} must be exactly 0 or 1`)
  return value === "1"
}
