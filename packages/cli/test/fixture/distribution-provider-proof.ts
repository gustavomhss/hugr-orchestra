import { expect } from "bun:test"
import { Database } from "bun:sqlite"
import { randomBytes } from "node:crypto"
import { chmod, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"
import { Schema } from "effect"
import { ConfigV1 } from "@orchestra/core/v1/config/config"
import { sandbox, command, sha256 } from "./distribution-native"
import type { Sandbox } from "./distribution-native"
import { model } from "./distribution-provider-ollama"
import type { OwnedOllama } from "./distribution-provider-ollama"
import { captureInference, streamedCompletion } from "./distribution-provider-capture"
import { observeInstalledTool } from "./distribution-provider-process"

const Event = Schema.Struct({
  type: Schema.String, sessionID: Schema.String,
  part: Schema.optional(Schema.Struct({
    id: Schema.String, messageID: Schema.String, type: Schema.String,
    tool: Schema.optional(Schema.String), callID: Schema.optional(Schema.String),
    text: Schema.optional(Schema.String),
    state: Schema.optional(Schema.Struct({
      status: Schema.String, input: Schema.optional(Schema.Unknown),
      output: Schema.optional(Schema.String), error: Schema.optional(Schema.String),
    })),
  })),
})
const Message = Schema.Struct({ role: Schema.String, agent: Schema.optional(Schema.String),
  finish: Schema.optional(Schema.String) })
const Part = Schema.Struct({ type: Schema.String, text: Schema.optional(Schema.String),
  tool: Schema.optional(Schema.String), callID: Schema.optional(Schema.String),
  state: Schema.optional(Schema.Struct({ status: Schema.String, input: Schema.Unknown,
    output: Schema.optional(Schema.String), error: Schema.optional(Schema.String) })) })

// Frozen public `run` contract belongs to packages/orchestra/src/cli/cmd/run.ts.
// Baseline's packages/cli v2 command table does not expose it. This gate must fail
// there, rather than silently switching to source CLI, bare payload, or `api`.
export async function qualifyProvider(input: {
  payload: string; version: string; box: Sandbox; stage: string; evidence: string; ollama: OwnedOllama
}) {
  const modules = resolve(input.payload, "../..")
  const launcher = join(modules, ".bin/orchestra")
  const payload = await realpath(input.payload)
  const publicPath = await realpath(launcher)
  expect(publicPath).toBe(await realpath(join(modules, "@orchestra/cli/bin/orchestra.cjs")))
  if (!payload.startsWith((await realpath(input.box.directory)) + sep)) throw new Error("PROVIDER_PAYLOAD_OUTSIDE_OWNED_NPM_BOX")
  const stage = join(input.evidence, input.stage)
  await mkdir(stage)
  const box = await sandbox(join(input.box.directory, `provider-${input.stage}`))
  box.cwd = join(box.directory, "project")
  await mkdir(box.cwd)
  const strict = { ...box, env: { ...box.env, ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strict" } }
  const help = await command([launcher, "run", "--help"], strict, 30_000)
  await Bun.write(join(stage, "public-run-help.json"), JSON.stringify({ launcher, publicPath, payload, version: input.version, ...help }, null, 2))
  if (help.code !== 0 || !["--model", "--agent", "--format"].every((flag) => help.stdout.includes(flag)))
    throw new Error("DISTRIBUTION_PUBLIC_RUN_UNAVAILABLE: npm payload builds packages/cli/src/index.ts; requested run lives in packages/orchestra/src/cli/cmd/run.ts. Lead must reconcile public entrypoints.")
  const supervisor = join(payload, "bin/hugr-omni-supervisor")
  const original = await readFile(supervisor)
  const mode = (await lstat(supervisor)).mode & 0o777
  const proxy = captureInference(input.ollama.endpoint(), stage)
  try {
    for (const kind of ["positive", "fault", "restored"] as const) {
      const nonce = randomBytes(24).toString("hex")
      const file = join(box.directory, "outside", `${kind}-${randomBytes(12).toString("hex")}.nonce`)
      const faultMarker = join(box.directory, "outside", "supervisor-fault-used")
      const commands = [`printf '%s\\n' '${nonce}' > '${file}'`, "sleep 3", `cat '${file}'`]
      const shell = commands.join(" && ")
      expect(await absent(file)).toBe(true)
      const config = {
        model: `distribution/${model}`, small_model: `distribution/${model}`, default_agent: "distribution-proof",
        enabled_providers: ["distribution"], plugin: [], mcp: {}, snapshot: false,
        autoupdate: false, shell: "/bin/bash", lsp: false, formatter: false,
        compaction: { auto: false, prune: false }, continuity: { enabled: false },
        permission: { "*": "deny" },
        provider: { distribution: {
          name: "Owned CPU Ollama", npm: "@ai-sdk/openai-compatible", env: [],
          options: { baseURL: proxy.url, timeout: 240_000, maxRetries: 0 },
          models: { [model]: { name: model, tool_call: true, temperature: true,
            limit: { context: 8192, output: 1024 } } },
        } },
        agent: { "distribution-proof": {
          mode: "primary", engine: "orchestra", model: `distribution/${model}`, temperature: 0, steps: 3,
          prompt: "Use the bash tool exactly once to run the user command verbatim. Wait for its real result. Then reply with the nonce from that result. If the tool fails, report failure. Do not claim a file exists without successful tool execution. /no_think",
          permission: { "*": "deny", bash: { "*": "deny", [shell]: "allow",
            ...Object.fromEntries(commands.map((value) => [value, "allow"])) },
            external_directory: { "*": "deny", [`${dirname(file)}/*`]: "allow" } },
        } },
      }
      // Validate actual public schema; no fixture-only config dialect.
      Schema.decodeUnknownSync(ConfigV1.Info)(config)
      await Bun.write(join(stage, `${kind}-config.json`), JSON.stringify(config, null, 2))
      const env = { ...strict.env, ORCHESTRA_CONFIG_CONTENT: JSON.stringify(config) }
      const prompt = `Call bash once with command exactly: ${shell}\nUse workdir ${box.cwd} and timeout 10000. After the tool result, give a short final response containing the nonce from its output. /no_think`
      const monitor = await observeInstalledTool(payload, env.ORCHESTRA_DB, box.cwd, shell)
      proxy.arm(kind)
      if (kind === "fault") {
        // Existing executable path remains discoverable. Replacement never runs
        // a tool: marker proves this exact installed supervisor was attempted.
        await writeFile(supervisor, `#!/bin/sh\nprintf '%s\\n' 'installed-supervisor-fault' > '${faultMarker}'\nexit 97\n`)
        await chmod(supervisor, mode)
      }
      const observation: { chain?: Awaited<ReturnType<typeof monitor.stop>> } = {}
      const result = await command([launcher, "run", "--agent", "distribution-proof", "--model", `distribution/${model}`,
        "--format", "json", "--title", `Distribution provider ${input.stage} ${kind}`, prompt], { ...box, env }, 300_000)
        .finally(async () => {
          if (kind === "fault") { await writeFile(supervisor, original); await chmod(supervisor, mode) }
          observation.chain = await monitor.stop(false)
        })
      await Bun.write(join(stage, `${kind}-cli.json`), JSON.stringify(result, null, 2))
      const records = await proxy.drain()
      await input.ollama.cpu()
      const events = result.stdout.split(/\r?\n/).filter((line) => line.trim()).map((line) =>
        Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Event)))(line))
      const sessionIDs = [...new Set(events.map((event) => event.sessionID))]
      expect(sessionIDs).toHaveLength(1)
      const tools = events.filter((event) => event.type === "tool_use")
      expect(tools).toHaveLength(1)
      expect(tools[0].part).toMatchObject({ type: "tool", tool: "bash", state: { input: { command: shell } } })
      const callID = tools[0].part?.callID
      expect(typeof callID).toBe("string")
      expect(records.length).toBeGreaterThanOrEqual(2)
      expect(records.length).toBeLessThanOrEqual(4)
      records.forEach((record) => {
        expect(record.status).toBe(200)
        expect(record.request.model).toBe(model)
        expect((record.request.tools ?? []).map((tool) => tool.function.name).filter((name) => name !== "bash")).toEqual([])
      })
      const first = records.find((record) => record.request.messages.some((message) => message.role === "user" && String(message.content).includes(nonce)))
      if (!first) throw new Error("PROVIDER_USER_PROMPT_NOT_CAPTURED")
      expect(first.request.tools?.map((tool) => tool.function.name)).toEqual(["bash"])
      const inferred = streamedCompletion(first.response)
      expect(inferred.calls).toHaveLength(1)
      expect(inferred.calls[0]).toMatchObject({ id: callID, name: "bash" })
      expect(JSON.parse(inferred.calls[0].arguments)).toMatchObject({ command: shell })
      const continuation = records.find((record) => record.request.messages.some((message) => message.role === "tool" && message.tool_call_id === callID))
      if (!continuation) throw new Error("PROVIDER_REAL_TOOL_RESULT_NOT_CAPTURED")
      const sent = continuation.request.messages.find((message) => message.role === "tool" && message.tool_call_id === callID)!
      const terminal = streamedCompletion(records.at(-1)!.response)
      expect(terminal.calls).toHaveLength(0)
      expect(terminal.finishes).toContain("stop")
      expect(terminal.content.trim().length).toBeGreaterThan(0)
      const final = events.filter((event) => event.type === "text").at(-1)
      expect(final?.part?.text).toBe(terminal.content)
      const dbInfo = await lstat(env.ORCHESTRA_DB)
      expect(dbInfo.isFile() && !dbInfo.isSymbolicLink() && dbInfo.nlink === 1).toBe(true)
      const database = new Database(env.ORCHESTRA_DB, { readonly: true, strict: true })
      const projection = (() => {
        try {
          const messages = database.query<{ id: string; data: string }, [string]>(
            "SELECT id, data FROM message WHERE session_id = ? ORDER BY time_created, id").all(sessionIDs[0])
            .map((row) => ({ id: row.id, ...Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Message)))(row.data) }))
          const parts = database.query<{ message_id: string; data: string }, [string]>(
            "SELECT message_id, data FROM part WHERE session_id = ? ORDER BY time_created, id").all(sessionIDs[0])
            .map((row) => ({ messageID: row.message_id, ...Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Part)))(row.data) }))
          return { messages, parts }
        } finally { database.close() }
      })()
      expect(projection.messages.filter((message) => message.role === "user")).toHaveLength(1)
      const user = projection.messages.find((message) => message.role === "user")!
      expect(projection.parts.some((part) => part.messageID === user.id && part.type === "text" && part.text?.includes(nonce))).toBe(true)
      expect(projection.messages.filter((message) => message.role === "assistant").length).toBeGreaterThanOrEqual(2)
      expect(projection.messages.filter((message) => message.role === "assistant").every((message) => message.agent === "distribution-proof")).toBe(true)
      expect(projection.parts.filter((part) => part.type === "tool" && part.callID === callID)).toHaveLength(1)
      const durable = projection.parts.find((part) => part.type === "tool" && part.callID === callID)!
      expect(durable.state?.status).toBe(kind === "fault" ? "error" : "completed")
      await Bun.write(join(stage, `${kind}-projections.json`), JSON.stringify(projection, null, 2))
      if (kind === "fault") {
        expect(await absent(file)).toBe(true)
        expect(await readFile(faultMarker, "utf8")).toBe("installed-supervisor-fault\n")
        expect(tools[0].part?.state?.status).toBe("error")
        expect(durable.state?.error?.length).toBeGreaterThan(0)
        expect(JSON.stringify(sent.content)).toContain(durable.state!.error!)
      }
      if (kind !== "fault") {
        expect(result.code, result.stderr).toBe(0)
        expect(await readFile(file, "utf8")).toBe(`${nonce}\n`)
        expect((await lstat(file)).isFile()).toBe(true)
        expect(tools[0].part?.state?.status).toBe("completed")
        expect(tools[0].part?.state?.output).toContain(nonce)
        expect(JSON.stringify(sent.content)).toContain(nonce)
        expect(durable.state?.output).toContain(nonce)
        expect(terminal.content).toContain(nonce)
        expect(observation.chain!.length).toBeGreaterThan(0)
      }
      expect(sha256(await readFile(supervisor))).toBe(sha256(original))
      await Bun.write(join(stage, `${kind}-oracle.json`), JSON.stringify({ version: input.version, launcher, publicPath,
        payload, native: join(payload, "bin/orchestra"), supervisor, supervisorSHA256: sha256(original),
        nonce, file, kind, chain: observation.chain, sessionID: sessionIDs[0], callID,
        turns: records.length, fileCreated: kind !== "fault", strict: true }, null, 2))
      console.error(`DISTRIBUTION_PROVIDER_CONTROL ${JSON.stringify({ stage: input.stage, kind, version: input.version,
        turns: records.length, callID, fileCreated: kind !== "fault", evidence: stage })}`)
    }
  } finally { await proxy.stop(); await writeFile(supervisor, original); await chmod(supervisor, mode) }
}

async function absent(file: string) {
  return lstat(file).then(() => false, (error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return true
    throw error
  })
}
