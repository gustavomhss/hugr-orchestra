import { expect } from "bun:test"
import { Database } from "bun:sqlite"
import { randomBytes } from "node:crypto"
import { chmod, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import { DateTime, Schema } from "effect"
import { Config } from "@orchestra/core/config"
import { Session } from "../../../schema/src/session"
import { SessionMessage } from "../../../schema/src/session-message"
import { SessionInput } from "../../../schema/src/session-input"
import { SessionEvent } from "../../../schema/src/session-event"
import { Model } from "../../../schema/src/model"
import { Agent } from "../../../schema/src/agent"
import { Location } from "../../../schema/src/location"
import { sandbox, sha256 } from "./distribution-native"
import type { Sandbox } from "./distribution-native"
import { model } from "./distribution-provider-openrouter"
import type { OwnedOpenRouter } from "./distribution-provider-openrouter"
import { captureInference, streamedCompletion } from "./distribution-provider-capture"
import { observeInstalledTool } from "./distribution-provider-process"
import { providerDaemon } from "./distribution-provider-daemon"
import { calibrateSuccessfulBashResult, requireSuccessfulBashResult } from "./distribution-provider-tool-result"
import type { CompilerReceipts } from "./distribution-provider-sourcegraph"
import { withProviderCleanup } from "./distribution-provider-provenance"

const ContextResponse = Schema.Struct({ data: Schema.Array(SessionMessage.Message) })
const ActiveResponse = Schema.Struct({ data: Schema.Record(Schema.String, Schema.Struct({ type: Schema.Literal("running") })) })
const HistoryResponse = Schema.Struct({ data: Schema.Array(SessionEvent.Durable), hasMore: Schema.Boolean })

// All Session operations use the npm-installed public wrapper's api command.
// Actual Bun --compile receipt/source pins bind dispatch and selected composition
// to this binary; public V2 admission/projections below establish the live path.
export async function qualifyProvider(input: {
  payload: string; version: string; box: Sandbox; stage: string; evidence: string; remote: OwnedOpenRouter
  compiler: CompilerReceipts[number]
}) {
  const modules = resolve(input.payload, "../..")
  const launcher = join(modules, ".bin/orchestra")
  const payload = await realpath(input.payload)
  if (input.compiler.version !== input.version || sha256(await readFile(join(payload, "bin/orchestra"))) !== input.compiler.binarySHA256)
    throw new Error("PROVIDER_INSTALLED_COMPILER_BINARY_MISMATCH")
  const publicPath = await realpath(launcher)
  expect(publicPath).toBe(await realpath(join(modules, "@orchestra/cli/bin/orchestra.cjs")))
  if (!payload.startsWith((await realpath(input.box.directory)) + sep)) throw new Error("PROVIDER_PAYLOAD_OUTSIDE_OWNED_NPM_BOX")
  const stage = join(input.evidence, input.stage)
  await mkdir(stage)
  const supervisor = join(payload, "bin/hugr-omni-supervisor")
  const original = await readFile(supervisor)
  const mode = (await lstat(supervisor)).mode & 0o777
  const proxy = captureInference(input.remote.endpoint(), stage)
  await withProviderCleanup(async () => {
    for (const kind of ["positive", "fault", "restored"] as const) {
      const evidence = join(stage, kind)
      await mkdir(evidence)
      // Fresh daemon and Location per control: no surviving loaded supervisor or
      // cached config can hide replacement/restoration of installed bytes.
      const box = await sandbox(join(input.box.directory, `provider-${input.stage}-${kind}`))
      box.cwd = join(box.directory, "project")
      await mkdir(box.cwd)
      const env = { ...box.env, ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strict" }
      const nonce = randomBytes(24).toString("hex")
      const file = join(box.directory, "outside", "result.nonce")
      const faultMarker = join(box.directory, "outside", "supervisor-fault-used")
      const workdir = join(box.directory, "outside")
      expect((await lstat(workdir)).isDirectory()).toBe(true)
      const shell = join(workdir, "run-nonce.sh")
      await writeFile(shell, `#!/bin/sh\nset -eu\nprintf 'x=%s' '${nonce}' > '${file}'\nsleep 3\ncat '${file}'\n`)
      await chmod(shell, 0o700)
      const scriptDigest = sha256(await readFile(shell))
      expect(await absent(file)).toBe(true)
      const config = {
        model: `distribution/${model}`, default_agent: "distribution-proof", snapshots: false, autoupdate: false,
        shell: "/bin/sh", plugins: [], compaction: { auto: false, prune: false },
        permissions: [{ action: "*", resource: "*", effect: "deny" as const }],
        providers: { distribution: {
          name: "Hosted Nemotron",
          // Omit env: an empty env Integration would hide this provider in
          // Catalog.available. The harness proxy injects the hosted credential
          // so no key is written to config, projections or evidence.
          api: { type: "aisdk", package: "@ai-sdk/openai-compatible", url: proxy.url, settings: { generation: { temperature: 0 } } },
          models: { [model]: { name: model, capabilities: { tools: true, input: ["text"], output: ["text"] },
            limit: { context: 8192, output: 1024 },
            // With hosted reasoning enabled, this model narrates its plan and
            // occasionally emits the same native call twice in one turn (it
            // ignores parallel_tool_calls). The oracle requires exactly one call.
            request: { body: { reasoning: { enabled: false } } } } },
        } },
        agents: { "distribution-proof": {
          mode: "primary", model: `distribution/${model}`, steps: 3,
          // Describe only the native tool this request advertises. Naming a
          // literal framing string teaches the model to narrate the call as
          // text, which the runtime cannot execute and the oracle rejects.
          system: `Your first response must be a tool call to the bash tool advertised in this request, with arguments exactly ${JSON.stringify({ command: shell, workdir, timeout: 10000 })}. Emit no other text and no other tool call before the tool result. Do not narrate or invent an invocation or its result. The tool stdout defines x with an assignment x=<value>. After the actual tool result, do not call another tool: answer with the value of x and nothing else. Do not choose or invent a value. If the tool failed, report failure instead.`,
          permissions: [
            { action: "bash", resource: shell, effect: "allow" as const },
            { action: "external_directory", resource: `${workdir}/*`, effect: "allow" as const },
          ],
        } },
      }
      Schema.decodeUnknownSync(Config.Info, { onExcessProperty: "error" })(config)
      await Bun.write(join(box.cwd, "orchestra.json"), JSON.stringify(config, null, 2))
      await Bun.write(join(evidence, "location-config.json"), JSON.stringify(config, null, 2))
      const prompt = `Call bash exactly once with this JSON input, verbatim: ${JSON.stringify({ command: shell, workdir, timeout: 10000 })}\nThe tool stdout defines x. What is the value of x? Answer with its value only, after the actual tool result. If the tool fails, report failure.`
      proxy.arm(kind)
      const daemon = providerDaemon(launcher, payload, input.version, { ...box, env }, evidence)
      const state: { monitor?: Awaited<ReturnType<typeof observeInstalledTool>> } = {}
      await withProviderCleanup(async () => {
        if (kind === "fault") {
          // Keep discoverable executable path, but refuse every attempted native
          // supervisor start. This marker is fault evidence, never a completion.
          await writeFile(supervisor, `#!/bin/sh\nprintf '%s\\n' 'installed-supervisor-fault' > '${faultMarker}'\nexit 97\n`)
          await chmod(supervisor, mode)
        }
        const serving = await daemon.start()
        state.monitor = await observeInstalledTool(payload, env.ORCHESTRA_DB, workdir, shell, serving)
        const query = new URLSearchParams({ "location[directory]": box.cwd })
        const models = Schema.decodeUnknownSync(Location.response(Schema.Array(Model.Info)))(await daemon.api("GET", `/api/model?${query}`))
        const configuredModel = models.data.find((item) => item.providerID === "distribution" && item.id === model)
        if (!configuredModel) throw new Error("PROVIDER_LOCATION_MODEL_UNAVAILABLE")
        expect(configuredModel.api).toMatchObject({ type: "aisdk", id: model, package: "@ai-sdk/openai-compatible", url: proxy.url })
        expect(configuredModel.capabilities).toMatchObject({ tools: true })
        expect(configuredModel.limit).toMatchObject({ context: 8192, output: 1024 })
        const agents = Schema.decodeUnknownSync(Location.response(Schema.Array(Agent.Info)))(await daemon.api("GET", `/api/agent?${query}`))
        const configuredAgent = agents.data.find((item) => item.id === "distribution-proof")
        if (!configuredAgent) throw new Error("PROVIDER_LOCATION_PRIMARY_AGENT_UNAVAILABLE")
        expect(configuredAgent.mode).toBe("primary")
        expect(configuredAgent.steps).toBe(3)
        expect(configuredAgent.permissions).toEqual([...config.permissions, ...config.agents["distribution-proof"].permissions])
        const created = Schema.decodeUnknownSync(Schema.Struct({ data: Session.Info }))(await daemon.api("POST", "/api/session", {
          agent: "distribution-proof", model: { providerID: "distribution", id: model }, location: { directory: box.cwd },
        })).data
        expect(String(created.agent)).toBe("distribution-proof")
        expect(created.model).toMatchObject({ providerID: "distribution", id: model })
        expect(String(created.location.directory)).toBe(box.cwd)
        const admitted = Schema.decodeUnknownSync(Schema.Struct({ data: SessionInput.Admitted }))(await daemon.api(
          "POST", `/api/session/${created.id}/prompt`, { prompt: { text: prompt }, delivery: "steer", resume: true },
        )).data
        expect(admitted.sessionID).toBe(created.id)
        expect(admitted.prompt.text).toBe(prompt)
        expect(admitted.delivery).toBe("steer")
        await Bun.write(join(evidence, "admission.json"), Schema.encodeSync(Schema.fromJsonString(SessionInput.Admitted))(admitted))
        const polls: Array<{ active: boolean; context: typeof ContextResponse.Type }> = []
        const deadline = Date.now() + 240_000
        while (true) {
          const context = Schema.decodeUnknownSync(ContextResponse)(await daemon.api("GET", `/api/session/${created.id}/context`))
          const active = Schema.decodeUnknownSync(ActiveResponse)(await daemon.api("GET", "/api/session/active"))
          polls.push({ active: active.data[created.id] !== undefined, context })
          const terminal = context.data.filter((message) => message.type === "assistant").at(-1)
          if (!active.data[created.id] && terminal?.time.completed !== undefined) break
          if (Date.now() >= deadline) throw new Error("PROVIDER_SESSION_V2_TERMINAL_TIMEOUT")
          await Bun.sleep(500)
        }
        await Bun.write(join(evidence, "polls.json"), JSON.stringify(polls, null, 2))
        const context = polls.at(-1)?.context
        if (!context) throw new Error("PROVIDER_SESSION_V2_CONTEXT_UNOBSERVED")
        const users = context.data.filter((message) => message.type === "user")
        expect(users).toHaveLength(1)
        expect(users[0]).toMatchObject({ id: admitted.id, text: prompt })
        const assistants = context.data.filter((message) => message.type === "assistant")
        const failure = assistants.find((message) => message.error)?.error
        if (failure) throw new Error(`PROVIDER_DURABLE_ASSISTANT_FAILED: ${failure.message}`)
        expect(assistants.length).toBeGreaterThanOrEqual(2)
        expect(assistants.every((message) => message.agent === "distribution-proof" && message.model.id === model && message.model.providerID === "distribution")).toBe(true)
        const tools = assistants.flatMap((message) => message.content.filter((part) => part.type === "tool"))
        expect(tools).toHaveLength(1)
        const tool = tools[0]
        if (!tool || tool.state.status === "pending" || tool.state.status === "running") throw new Error("PROVIDER_DURABLE_TOOL_UNSETTLED")
        expect(tool.name).toBe("bash")
        expect(tool.provider?.executed ?? false).toBe(false)
        expect(tool.state.input).toMatchObject({ command: shell, workdir })
        expect(tool.state.status).toBe(kind === "fault" ? "error" : "completed")
        const records = await proxy.drain()
        expect(records.length).toBeGreaterThanOrEqual(2)
        expect(records.length).toBeLessThanOrEqual(3)
        records.forEach((record) => {
          Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Struct({ temperature: Schema.Literal(0), reasoning: Schema.Struct({ enabled: Schema.Literal(false) }) }))))(record.requestJSON)
          expect(record.status).toBe(200)
          expect(record.request.model).toBe(model)
          expect((record.request.tools ?? []).map((item) => item.function.name).filter((name) => name !== "bash")).toEqual([])
        })
        const first = records[0]
        expect(first.request.messages.some((message) => message.role === "user" && JSON.stringify(message.content)?.includes(shell))).toBe(true)
        expect(JSON.stringify(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(first.requestJSON)).includes(nonce)).toBe(false)
        expect(first.request.tools?.map((item) => item.function.name)).toEqual(["bash"])
        // Hosted identity plus a real native tool call is the proof that the
        // pinned model actually served this request and executed the tool.
        expect(first.upstreamProvider?.length).toBeGreaterThan(0)
        const inferred = streamedCompletion(first.response)
        expect(inferred.calls).toHaveLength(1)
        expect(inferred.calls[0]).toMatchObject({ id: tool.id, name: "bash" })
        expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(inferred.calls[0].arguments)).toMatchObject({ command: shell, workdir })
        const continuation = records.find((record) => record.request.messages.some((message) => message.role === "tool" && message.tool_call_id === tool.id))
        if (!continuation) throw new Error("PROVIDER_REAL_TOOL_RESULT_NOT_CAPTURED")
        const sent = continuation.request.messages.find((message) => message.role === "tool" && message.tool_call_id === tool.id)
        if (!sent || typeof sent.content !== "string") throw new Error("PROVIDER_WIRE_TOOL_RESULT_INVALID")
        expect(continuation.request.messages.flatMap((message) => message.role === "assistant" ? message.tool_calls ?? [] : [])
          .filter((call) => call.id === tool.id)).toHaveLength(1)
        const finalRecord = records.at(-1)
        if (!finalRecord) throw new Error("PROVIDER_TERMINAL_INFERENCE_MISSING")
        const terminal = streamedCompletion(finalRecord.response)
        expect(terminal.calls).toHaveLength(0)
        expect(terminal.finishes).toContain("stop")
        expect(terminal.content.trim().length).toBeGreaterThan(0)
        const final = assistants.at(-1)
        if (!final) throw new Error("PROVIDER_DURABLE_TERMINAL_ASSISTANT_MISSING")
        expect(final.error).toBeUndefined()
        expect(final.finish).toBe("stop")
        expect(final.content.filter((part) => part.type === "text").map((part) => part.text).join("")).toBe(terminal.content)
        // Public projections and actual isolated DB must agree. Only V2 tables
        // are evidence; legacy message/part rows cannot satisfy this oracle.
        const info = await lstat(env.ORCHESTRA_DB)
        expect(info.isFile() && !info.isSymbolicLink() && info.nlink === 1).toBe(true)
        const database = new Database(env.ORCHESTRA_DB, { readonly: true, strict: true })
        try {
          const projected = database.query<{ id: string; type: string; data: string }, [string]>(
            "SELECT id, type, data FROM session_message WHERE session_id = ? ORDER BY seq").all(created.id)
            .map((row) => Schema.decodeUnknownSync(SessionMessage.Message)({
              ...Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Record(Schema.String, Schema.Unknown))))(row.data),
              id: row.id, type: row.type,
            }))
          expect(projected).toEqual([...context.data])
          const inbox = database.query<{ id: string; prompt: string; delivery: string; admitted_seq: number; promoted_seq: number | null }, [string]>(
            "SELECT id, prompt, delivery, admitted_seq, promoted_seq FROM session_input WHERE session_id = ?").all(created.id)
          expect(inbox).toHaveLength(1)
          expect(inbox[0]).toMatchObject({ id: admitted.id, delivery: "steer", admitted_seq: admitted.admittedSeq })
          expect(typeof inbox[0].promoted_seq).toBe("number")
          expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(inbox[0].prompt)).toMatchObject({ text: prompt })
          await Bun.write(join(evidence, "durable-inbox.json"), JSON.stringify(inbox, null, 2))
        } finally { database.close() }
        const history = Schema.decodeUnknownSync(HistoryResponse)(await daemon.api("GET", `/api/session/${created.id}/history?limit=100`))
        expect(history.hasMore).toBe(false)
        expect(history.data.some((event) => event.type === "session.next.prompt.admitted")).toBe(true)
        expect(history.data.some((event) => event.type === "session.next.prompted")).toBe(true)
        await Bun.write(join(evidence, "durable-history.json"), Schema.encodeSync(Schema.fromJsonString(HistoryResponse))(history))
        const chain = await state.monitor.stop(kind !== "fault")
        state.monitor = undefined
        daemon.capture(chain.flatMap((row) => [row.native, row.supervisor, row.shell]))
        if (kind === "fault") {
          expect(await absent(file)).toBe(true)
          expect(await readFile(faultMarker, "utf8")).toBe("installed-supervisor-fault\n")
          if (tool.state.status !== "error") throw new Error("PROVIDER_SUPERVISOR_FAULT_NOT_BLOCKED")
          expect(tool.state.error.message.length).toBeGreaterThan(0)
          const result = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(
            Schema.Struct({ error: SessionMessage.UnknownError }),
          )))(sent.content)
          expect(result.error).toEqual(tool.state.error)
        }
        if (kind !== "fault") {
          const stdout = await readFile(file, "utf8")
          expect(stdout).toBe(`x=${nonce}`)
          const info = await lstat(file)
          expect(info.isFile() && !info.isSymbolicLink() && info.nlink === 1).toBe(true)
          expect(sha256(await readFile(shell))).toBe(scriptDigest)
          // File, DB projection and serving-daemon ancestry are genuine and stay
          // fixed while the copied request's tool-result view alone is mutated.
          records.slice(1).forEach((record) => requireSuccessfulBashResult(record.request, tool, stdout))
          await Bun.write(join(evidence, "tool-result-oracle-control.json"), JSON.stringify(
            await calibrateSuccessfulBashResult(continuation.requestJSON, tool, stdout, nonce), null, 2,
          ))
          expect(terminal.content).toContain(nonce)
        }
        await Bun.write(join(evidence, "oracle.json"), JSON.stringify({ version: input.version, launcher, publicPath, payload,
          native: join(payload, "bin/orchestra"), supervisor, supervisorSHA256: sha256(original), serving, chain,
          compiler: input.compiler,
          nonce, file, command: shell, scriptDigest, kind, sessionID: created.id, admissionID: admitted.id, callID: tool.id, turns: records.length,
          terminalCompletedAt: final.time.completed === undefined ? undefined : DateTime.toEpochMillis(final.time.completed),
          fileCreated: kind !== "fault", strict: true }, null, 2))
      }, [
        async () => {
          if (!state.monitor) return
          const chain = await state.monitor.stop(false)
          daemon.capture(chain.flatMap((row) => [row.native, row.supervisor, row.shell]))
        },
        () => daemon.stop(),
        () => writeFile(supervisor, original),
        () => chmod(supervisor, mode),
      ])
      expect(sha256(await readFile(supervisor))).toBe(sha256(original))
      console.error(`DISTRIBUTION_PROVIDER_CONTROL ${JSON.stringify({ stage: input.stage, kind, version: input.version, evidence })}`)
    }
  }, [() => proxy.stop(), () => writeFile(supervisor, original), () => chmod(supervisor, mode)])
}

async function absent(file: string) {
  return lstat(file).then(() => false, (error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return true
    throw error
  })
}
