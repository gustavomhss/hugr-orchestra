import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { compile, emitPromise } from "@opencode-ai/httpapi-codegen"
import { ClientApi, endpointNames, groupNames, omitEndpoints } from "../src/contract"

test("named Session outputs preserve the endpoint's encoded types", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url))
  const dir = await mkdtemp(join(root, "test/.type-conformance-"))
  const contract = compile(ClientApi, { groupNames, endpointNames, omitEndpoints })
  const structural = emitPromise({
    groups: contract.groups
      .filter((group) => group.identifier === "sessions")
      .map((group) => ({
        ...group,
        endpoints: group.endpoints.filter((endpoint) => ["events", "history"].includes(endpoint.operation.name)),
      })),
  }).files.find((file) => file.path === "types.ts")
  expect(structural).toBeDefined()
  if (!structural) throw new Error("Missing structural endpoint types")

  try {
    await Bun.write(join(dir, "structural.ts"), structural.content)
    await Bun.write(join(dir, "tsconfig.json"), JSON.stringify({ extends: "../../tsconfig.json", include: ["*.ts"] }))
    await Bun.write(
      join(dir, "proof.ts"),
      `import type { SessionsEventsOutput, SessionsHistoryOutput } from "../../src/generated/types"
import type { SessionEventEncoded } from "../../src/wire"
type Assert<T extends true> = T
type StructuralEvents = import("./structural").SessionsEventsOutput
type StructuralHistory = import("./structural").SessionsHistoryOutput
export type EventsForward = Assert<[SessionsEventsOutput] extends [StructuralEvents] ? true : false>
export type EventsBackward = Assert<[StructuralEvents] extends [SessionsEventsOutput] ? true : false>
export type EventsCanonical = Assert<[SessionsEventsOutput] extends [SessionEventEncoded] ? true : false>
export type HistoryForward = Assert<[SessionsHistoryOutput] extends [StructuralHistory] ? true : false>
export type HistoryBackward = Assert<[StructuralHistory] extends [SessionsHistoryOutput] ? true : false>
type EventStep = Extract<SessionsEventsOutput, { readonly type: "session.next.step.ended" }>["data"]
type HistoryStep = Extract<SessionsHistoryOutput["data"][number], { readonly type: "session.next.step.ended" }>["data"]
type Tool = Extract<SessionsHistoryOutput["data"][number], { readonly type: "session.next.tool.success" }>["data"]
export type EventTimestamp = Assert<EventStep["timestamp"] extends number ? true : false>
export type HistoryTimestamp = Assert<HistoryStep["timestamp"] extends number ? true : false>
export type EventUsageOptional = Assert<{} extends Pick<EventStep, "usageKnown"> ? true : false>
export type HistoryUsageOptional = Assert<{} extends Pick<HistoryStep, "usageKnown"> ? true : false>
export type EventUsageBoolean = Assert<Exclude<EventStep["usageKnown"], undefined> extends boolean ? true : false>
export type HistoryUsageBoolean = Assert<Exclude<HistoryStep["usageKnown"], undefined> extends boolean ? true : false>
export type EventTokens = Assert<EventStep["tokens"]["cache"]["read"] extends number ? true : false>
export type HistoryTokens = Assert<HistoryStep["tokens"]["cache"]["write"] extends number ? true : false>
export type HistoryNull = Assert<null extends Tool["structured"][string] ? true : false>
// @ts-expect-error Wire timestamps are numeric, not decoded DateTime or strings.
export type RejectTimestamp = Assert<string extends EventStep["timestamp"] ? true : false>
// @ts-expect-error Historical wire timestamps are numeric.
export type RejectHistoryTimestamp = Assert<string extends HistoryStep["timestamp"] ? true : false>
// @ts-expect-error usageKnown is boolean when present.
export type RejectUsage = Assert<string extends EventStep["usageKnown"] ? true : false>
// @ts-expect-error JSON history excludes non-JSON functions.
export type RejectFunction = Assert<(() => void) extends Tool["structured"][string] ? true : false>
`,
    )
    const result = Bun.spawn(["bun", "typecheck", "--project", join(dir, "tsconfig.json")], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    })
    const output = await Promise.all([new Response(result.stdout).text(), new Response(result.stderr).text()])
    expect(await result.exited, output.join("\n")).toBe(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)
