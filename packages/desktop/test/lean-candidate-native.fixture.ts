import assert from "node:assert/strict"
import path from "node:path"
import http from "node:http"
import { mkdir } from "node:fs/promises"
import type { Message, Part, Session, ToolPart } from "@orchestra/sdk/v2/client"
import { LeanMetrics } from "../../schema/src/lean-metrics"
import { bounded, inside, until, type OwnedCandidate } from "./lean-candidate-runtime.fixture"
import type { CandidateRecorder } from "./lean-candidate-record.fixture"

// Adapted from packages/app/test-browser/lean-native-product.test.ts at
// 09a0ab11f2 (this repository, MIT). Modification: packaged Electron owns the backend;
// only public fixtures/loopback responses are seeded; no replacement renderer or server.
type Hit = { messages: { role: string; tool_call_id?: string; content: string }[] }
type Turn = { callID: string; command: string; directory: string }
type Saved = { info: Message; parts: Part[] }[]

export async function nativeFixture(candidate: OwnedCandidate, directory: string, recorder: CandidateRecorder) {
  inside(candidate.root, directory, "public fixture directory")
  await mkdir(directory, { recursive: true })
  await Bun.write(path.join(directory, "go.mod"), "module example.test\n\ngo 1.20\n")
  await Bun.write(path.join(directory, "native_test.go"), `package example\nimport "testing"\n${Array.from({ length: 30 }, (_, i) => `func TestCase${i}(t *testing.T) {}`).join("\n")}\n`)
  const hits: Hit[] = []
  const turn: { current?: Turn } = {}
  const provider = http.createServer(async (req, res) => {
    req.setTimeout(10000, () => req.destroy(new Error("Loopback model request deadline")))
    try {
      assert.ok(turn.current, "Default startup must not request a model completion")
      assert.ok(hits.length < 12, "Loopback model turn limit exceeded")
      assert.ok(req.url?.endsWith("/chat/completions"), `Unexpected loopback model route: ${req.url}`)
      assert.equal(req.headers.authorization, "Bearer synthetic-key")
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk))
        assert.ok(chunks.reduce((sum, chunk) => sum + chunk.length, 0) <= 2 * 1024 * 1024, "Loopback model body too large")
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Hit
      hits.push(body)
      const active = turn.current
      const complete = body.messages.some((message) => message.role === "tool" && message.tool_call_id === active.callID)
      const delta = complete ? { content: "Public native fixture complete." } : { tool_calls: [{ index: 0, id: active.callID, type: "function", function: {
        name: "bash", arguments: JSON.stringify({ command: active.command, workdir: active.directory, timeout: 120000 }),
      } }] }
      const stream = [{ role: "assistant", ...delta }, {}].map((delta, index) => `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1,
        model: "test-model", choices: [{ index: 0, delta, finish_reason: index ? (complete ? "stop" : "tool_calls") : null }] })}\n\n`)
      res.writeHead(200, { "content-type": "text/event-stream" })
      res.end(stream.join("") + "data: [DONE]\n\n")
    } catch (error) { recorder.fail("primary", "owned loopback model request", error); res.destroy() }
  })
  provider.headersTimeout = 10000
  provider.requestTimeout = 10000
  const close = async () => {
    try {
      await bounded("owned loopback model close", new Promise<void>((resolve, reject) => {
        if (!provider.listening) return resolve()
        provider.close((error) => error ? reject(error) : resolve())
        provider.closeAllConnections()
      }), 10000)
    } catch (error) { recorder.fail("cleanup", "owned loopback model close", error); provider.closeAllConnections() }
  }
  try {
    await bounded("owned loopback model listen", new Promise<void>((resolve, reject) => {
      provider.once("error", reject)
      provider.listen(0, "127.0.0.1", resolve)
    }))
    const address = provider.address()
    assert.ok(address && typeof address !== "string", "Missing loopback fixture port")
    const observer = path.join(candidate.root, "public-fixture-observer.mjs")
    await Bun.write(observer, `import { writeFile } from "node:fs/promises";
export default async () => ({ "tool.execute.after": async (input, output) => {
  if (input.tool === "bash") await writeFile(${JSON.stringify(candidate.root)} + "/" + input.callID + ".json", JSON.stringify({ output: output.output, metadata: output.metadata }));
} });`)
    await candidate.request("global/config", "PATCH", {
      model: "test/test-model", autoupdate: false, plugin: [observer], shell: "/bin/sh",
      tool_output: { max_lines: 2000, max_bytes: 50000, lean: { enabled: true } },
      provider: { test: { id: "test", name: "Public loopback fixture", env: [], npm: "@ai-sdk/openai-compatible",
        options: { apiKey: "synthetic-key", baseURL: `http://127.0.0.1:${address.port}/v1` },
        models: { "test-model": { id: "test-model", name: "Public fixture", tool_call: true,
          limit: { context: 100000, output: 10000 }, cost: { input: 0, output: 0 } } } } },
    }, directory)
    await candidate.request("global/dispose", "POST")
    const session = await candidate.request<Session>("session", "POST", { title: "Public synthetic native fixture",
      permission: [{ permission: "*", pattern: "*", action: "allow" }] }, directory)
    async function execute(callID: string, command = "go test -v .", workdir = directory) {
      assert.match(callID, /^call_[a-z_]+$/, "Unsafe public observation identity")
      turn.current = { callID, command, directory: workdir }
      await candidate.request(`session/${session.id}/message`, "POST", { agent: "maestro", model: { providerID: "test", modelID: "test-model" },
        parts: [{ type: "text", text: "Execute the public native fixture once, then finish." }] }, directory)
      turn.current = undefined
      const messages = await candidate.request<Saved>(`session/${session.id}/message`, "GET", undefined, directory)
      const tools = messages.flatMap((message) => message.parts).filter((part): part is ToolPart => part.type === "tool" && part.callID === callID)
      assert.equal(tools.length, 1, `Expected one durable actual native tool: ${callID}`)
      const tool = tools[0]!
      if (tool.state.status !== "completed") throw new Error(`Candidate native tool ${callID} failed: ${tool.state.status}`, { cause: { privateResponse: tool.state } })
      assert.equal(tool.state.input.command, command)
      assert.equal(tool.state.metadata.exit, 0)
      assert.equal(tool.state.metadata.truncated, false)
      const next = hits.flatMap((hit) => hit.messages).filter((message) => message.role === "tool" && message.tool_call_id === callID)
      assert.equal(next.length, 1, "Missing actual next HTTP model turn")
      assert.deepEqual(Buffer.from(next[0]!.content), Buffer.from(tool.state.output), "Next HTTP result differs from durable whole UTF-8 bytes")
      const raw = await Bun.file(path.join(candidate.root, `${callID}.json`)).json() as { output: string; metadata: { output: string } }
      const metric = LeanMetrics.decode(tool.state.metadata.lean)
      assert.ok(metric, "Missing durable native Lean Decision")
      assert.equal(metric.engine, "hugr-lean@0.2.0:369206cd0a468904", "Actual native boundary used the wrong archive engine")
      assert.equal(metric.producer, "native-shell")
      assert.equal(metric.eligible, true)
      assert.deepEqual(metric.owner, { projectID: session.projectID, location: directory, sessionID: session.id, callID })
      assert.deepEqual(metric.model, { provider: "test", id: "test-model" })
      assert.deepEqual(metric.bytes, { before: Buffer.byteLength(raw.output), after: Buffer.byteLength(tool.state.output), saved: Buffer.byteLength(raw.output) - Buffer.byteLength(tool.state.output) })
      assert.deepEqual(metric.tokens, { kind: "estimated", counter: "chars-per-token-4", before: Math.round(raw.output.length / 4), after: Math.round(tool.state.output.length / 4), saved: Math.round(raw.output.length / 4) - Math.round(tool.state.output.length / 4) })
      assert.deepEqual(Buffer.from(raw.metadata.output), Buffer.from(raw.output), "Raw producer metadata differs from observed whole output")
      return { tool, metric, raw, session }
    }
    return { session, hits, execute, close }
  } catch (error) { await close(); throw error }
}

export async function nativePtySmoke(candidate: OwnedCandidate, directory: string, recorder: CandidateRecorder) {
  const request = candidate.request
  assert.deepEqual(await request("pty", "GET", undefined, directory), [], "Default startup spawned native PTY tools")
  const output = path.join(candidate.root, "public-pty-smoke.json")
  // Real native PTY child records its actual environment and terminal identity inside owned ROOT.
  const script = `require('node:fs').writeFileSync(${JSON.stringify(output)},JSON.stringify({tty:process.stdout.isTTY,input:process.stdin.isTTY,env:process.env}));setTimeout(()=>process.exit(0),1500)`
  const pty = await request<{ id: string; pid: number }>("pty", "POST", { command: "node", args: ["-e", script], cwd: directory, title: "Public native PTY fixture" }, directory)
  const before = recorder.failures.length
  try {
    assert.ok(pty.pid > 0, "Real native PTY child PID missing")
    const children = await request<{ id: string; pid: number }[]>("pty", "GET", undefined, directory)
    assert.equal(children.filter((child) => child.id === pty.id && child.pid === pty.pid).length, 1, "Actual native PTY child counter did not increase")
    await until("native PTY child output", () => Bun.file(output).exists())
    const observed = await Bun.file(output).json() as { tty: boolean; input: boolean; env: Record<string, string> }
    assert.equal(observed.tty, true)
    assert.equal(observed.input, true)
    for (const key of ["HOME", "XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "ORCHESTRA_DB"]) {
      if (observed.env[key]) recorder.protectPath(observed.env[key]!, `native-PTY-${key}`)
      inside(candidate.root, observed.env[key]!, `native PTY ${key}`)
    }
    assert.equal(observed.env.ORCHESTRA_INHERIT_CREDENTIALS, "0")
    for (const key of Object.keys(observed.env)) assert.ok(!/^(OPENAI|ANTHROPIC|AWS|AZURE|GOOGLE|SENTRY|GH_|GITHUB_TOKEN|SSH_|NODE_OPTIONS)/.test(key), `Native PTY inherited host credentials: ${key}`)
    await until("native PTY child exit", async () => (await request<{ status: string; exitCode?: number }>(`pty/${pty.id}`, "GET", undefined, directory)).status === "exited")
    assert.equal((await request<{ exitCode: number }>(`pty/${pty.id}`, "GET", undefined, directory)).exitCode, 0)
  } catch (error) { recorder.fail("primary", "owned native PTY smoke", error) }
  try {
    await request(`pty/${pty.id}`, "DELETE", undefined, directory)
    assert.deepEqual(await request("pty", "GET", undefined, directory), [], "Owned native PTY child remains")
  } catch (error) { recorder.fail("cleanup", "owned native PTY removal", error) }
  if (recorder.failures.length > before) throw recorder.publicError("Native PTY primary and cleanup diagnostics")
}

export type NativeRun = Awaited<ReturnType<Awaited<ReturnType<typeof nativeFixture>>["execute"]>>
