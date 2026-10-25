import assert from "node:assert/strict"
import path from "node:path"
import http from "node:http"
import { access, chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { LeanMetrics } from "../../../packages/schema/src/lean-metrics"
import { bounded, inside, until, type OwnedCandidate } from "./lean-candidate-runtime.fixture"
import type { CandidateRecorder } from "./lean-candidate-record.fixture"

// Adapted from packages/app/test-browser/lean-native-product.test.ts at
// 09a0ab11f2 (this repository, MIT). Modification: packaged Electron owns the backend;
// only public fixtures/loopback responses are seeded; no replacement renderer or server.
type Hit = { messages: { role: string; tool_call_id?: string; content: string }[] }
type Turn = { callID: string; command: string; directory: string }
// The slice of the V2 session wire shapes this fixture reads, not the full contract. A tool part has no call ID of its own:
// its `id` is the provider call ID, and the model-visible result is the tool's text content blocks.
type Session = { id: string; projectID: string }
type CompletedState = { status: "completed"; input: { command: string }; content: { type: string; text?: string }[];
  structured: { exit?: number; truncated: boolean }; metadata?: { lean?: unknown } }
type ToolState = CompletedState | { status: "pending" | "running" | "error" }
type ToolPart = { id: string; type: "tool"; name: string; state: ToolState }
type Part = ToolPart | { id?: string; type: string; name?: undefined }
type Message = { id: string; type: string; content?: Part[]; time: { completed?: number }; error?: { message: string } }
type Messages = { data: Message[] }

/** The text the model sees for a settled tool: its text content blocks, which providers join with a newline. */
export const modelText = (state: CompletedState) => state.content.flatMap((part) => part.type === "text" && part.text !== undefined ? [part.text] : []).join("\n")

export async function nativeFixture(candidate: OwnedCandidate, directory: string, recorder: CandidateRecorder) {
  inside(candidate.root, directory, "public fixture directory")
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, "go.mod"), "module example.test\n\ngo 1.20\n")
  await writeFile(path.join(directory, "native_test.go"), `package example\nimport "testing"\n${Array.from({ length: 30 }, (_, i) => `func TestCase${i}(t *testing.T) {}`).join("\n")}\n`)
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
    // The recording shell lives in a directory of its own rather than the owned root (Chromium's profile, caches, the live singleton links).
    const observerDirectory = path.join(candidate.root, "public-fixture-observer")
    await mkdir(observerDirectory, { recursive: true })
    // The bash tool runs its command through this shell, which records the command's exact combined output and exit
    // status (one pair of files per call) beside the owned root. It observes the child process itself, so the raw bytes
    // do not depend on anything Lean does to the tool result.
    const recordings = path.join(observerDirectory, "recordings")
    await mkdir(recordings, { recursive: true })
    const shell = path.join(observerDirectory, "observe-shell")
    await writeFile(shell, `#!/bin/sh
recording="${recordings}/$$"
{ /bin/sh "$@"; echo "$?" > "$recording.exit"; } 2>&1 | /usr/bin/tee "$recording.out"
read -r code < "$recording.exit"
exit "$code"
`)
    await chmod(shell, 0o755)
    // Project config is read once when a location opens, which the startup checks already did; the global document is
    // read again on every use, so the fixture's model, agent and Lean thresholds live there.
    const globalConfig = path.join(candidate.root, "config/orchestra")
    await mkdir(globalConfig, { recursive: true })
    await writeFile(path.join(globalConfig, "orchestra.json"), JSON.stringify({
      model: "test/test-model", default_agent: "lean-fixture", autoupdate: false, snapshots: false, shell,
      tool_output: { max_lines: 2000, max_bytes: 50000, lean: { enabled: true } },
      permissions: [{ action: "*", resource: "*", effect: "allow" }],
      providers: { test: { name: "Public loopback fixture",
        api: { type: "aisdk", package: "@ai-sdk/openai-compatible", url: `http://127.0.0.1:${address.port}/v1`, settings: { apiKey: "synthetic-key" } },
        models: { "test-model": { name: "Public fixture", capabilities: { tools: true, input: ["text"], output: ["text"] },
          limit: { context: 100000, output: 10000 } } } } },
      agents: { "lean-fixture": { mode: "primary", model: "test/test-model", steps: 4 } },
    }, null, 2))
    // Reloads the agents and catalog of every open location from the document just written.
    await candidate.request("api/config", "PATCH", { model: "test/test-model" })
    const session = (await candidate.request<{ data: Session }>("api/session", "POST", {
      agent: "lean-fixture", model: { providerID: "test", id: "test-model" }, location: { directory } }, directory)).data
    async function execute(callID: string, command = "go test -v .", workdir = directory) {
      assert.match(callID, /^call_[a-z_]+$/, "Unsafe public observation identity")
      turn.current = { callID, command, directory: workdir }
      const recorded = new Set(await readdir(recordings))
      const admitted = (await candidate.request<{ data: { id: string } }>(`api/session/${session.id}/prompt`, "POST", {
        prompt: { text: "Execute the public native fixture once, then finish." }, delivery: "steer", resume: true }, directory)).data
      // Admission is asynchronous: the turn is over once this prompt was promoted, nothing is running, and its last
      // assistant message completed.
      const messages = await settled(candidate, session.id, admitted.id)
      turn.current = undefined
      const tools = messages.flatMap((message) => (message.content ?? []).map((part) => ({ message, part })))
        .filter((entry): entry is { message: Message; part: ToolPart } => entry.part.type === "tool" && entry.part.id === callID)
      assert.equal(tools.length, 1, `Expected one durable actual native tool: ${callID}`)
      const found = tools[0]!
      const state = found.part.state
      if (state.status !== "completed") throw new Error(`Candidate native tool ${callID} failed: ${state.status}`, { cause: { privateResponse: state } })
      const output = modelText(state)
      assert.equal(state.input.command, command)
      assert.equal(state.structured.exit, 0, `${callID} exited ${state.structured.exit}: ${output.slice(-2000)}`)
      assert.equal(state.structured.truncated, false)
      const next = hits.flatMap((hit) => hit.messages).filter((message) => message.role === "tool" && message.tool_call_id === callID)
      assert.equal(next.length, 1, "Missing actual next HTTP model turn")
      assert.deepEqual(Buffer.from(next[0]!.content), Buffer.from(output), "Next HTTP result differs from durable whole UTF-8 bytes")
      const files = (await readdir(recordings)).filter((file) => !recorded.has(file))
      assert.equal(files.length, 2, `Observer shell recorded ${files.length} files for ${callID}`)
      const file = path.join(recordings, files.find((name) => name.endsWith(".out"))!)
      const stdout = await readFile(file, "utf8")
      const exit = Number((await readFile(path.join(recordings, files.find((name) => name.endsWith(".exit"))!), "utf8")).trim())
      assert.equal(exit, state.structured.exit, "Observed exit status differs from the durable one")
      // The tool's model view before Lean: the command output block, then its exit note.
      const raw = { file, stdout, output: `${stdout}\nCommand exited with code ${exit}.` }
      const metric = LeanMetrics.decode(state.metadata?.lean)
      assert.ok(metric, "Missing durable native Lean Decision")
      assert.equal(metric.engine, "hugr-lean@0.4.0:5ff983c58aa056d8", "Actual native boundary used the wrong archive engine")
      assert.equal(metric.producer, "native-shell")
      assert.equal(metric.eligible, true)
      assert.deepEqual(metric.owner, { projectID: session.projectID, location: directory, sessionID: session.id, callID })
      assert.deepEqual(metric.model, { provider: "test", id: "test-model" })
      assert.deepEqual(metric.bytes, { before: Buffer.byteLength(raw.output), after: Buffer.byteLength(output), saved: Buffer.byteLength(raw.output) - Buffer.byteLength(output) })
      assert.deepEqual(metric.tokens, { kind: "estimated", counter: "chars-per-token-4", before: Math.round(raw.output.length / 4), after: Math.round(output.length / 4), saved: Math.round(raw.output.length / 4) - Math.round(output.length / 4) })
      return { tool: { id: found.part.id, messageID: found.message.id, state }, output, metric, raw, session }
    }
    return { session, hits, execute, close }
  } catch (error) { await close(); throw error }
}

// The messages of a session once the prompt `admitted` was promoted, nothing is running and its last assistant message completed.
async function settled(candidate: OwnedCandidate, sessionID: string, admitted: string) {
  const state: { messages: Message[] } = { messages: [] }
  await until(`session ${sessionID} turn`, async () => {
    // Observe inactivity before the messages: reading them first lets a turn finish between the two calls.
    const active = (await candidate.request<{ data: Record<string, unknown> }>("api/session/active")).data
    state.messages = (await candidate.request<Messages>(`api/session/${sessionID}/message?order=asc&limit=200`)).data
    const from = state.messages.findIndex((message) => message.id === admitted)
    const replies = from < 0 ? [] : state.messages.slice(from + 1).filter((message) => message.type === "assistant")
    const failed = replies.find((message) => message.error)
    if (failed) throw new Error(`Session turn failed: ${failed.error?.message}`, { cause: { privateResponse: failed } })
    return !active[sessionID] && replies.at(-1)?.time.completed !== undefined
  }, 120000)
  return state.messages
}

export async function nativePtySmoke(candidate: OwnedCandidate, directory: string, recorder: CandidateRecorder) {
  const request = candidate.request
  const list = async () => (await request<{ data: { id: string; pid: number }[] }>("api/pty", "GET", undefined, directory)).data
  assert.deepEqual(await list(), [], "Default startup spawned native PTY tools")
  const output = path.join(candidate.root, "public-pty-smoke.json")
  // Real native PTY child records its actual environment and terminal identity inside owned ROOT.
  const script = `require('node:fs').writeFileSync(${JSON.stringify(output)},JSON.stringify({tty:process.stdout.isTTY,input:process.stdin.isTTY,env:process.env}));setTimeout(()=>process.exit(0),1500)`
  const pty = (await request<{ data: { id: string; pid: number } }>("api/pty", "POST", { command: "node", args: ["-e", script], cwd: directory, title: "Public native PTY fixture" }, directory)).data
  const before = recorder.failures.length
  try {
    assert.ok(pty.pid > 0, "Real native PTY child PID missing")
    const children = await list()
    assert.equal(children.filter((child) => child.id === pty.id && child.pid === pty.pid).length, 1, "Actual native PTY child counter did not increase")
    await until("native PTY child output", () => access(output).then(() => true, () => false))
    const observed = JSON.parse(await readFile(output, "utf8")) as { tty: boolean; input: boolean; env: Record<string, string> }
    assert.equal(observed.tty, true)
    assert.equal(observed.input, true)
    for (const key of ["HOME", "XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "ORCHESTRA_DB"]) {
      if (observed.env[key]) recorder.protectPath(observed.env[key]!, `native-PTY-${key}`)
      inside(candidate.root, observed.env[key]!, `native PTY ${key}`)
    }
    assert.equal(observed.env.ORCHESTRA_INHERIT_CREDENTIALS, "0")
    for (const key of Object.keys(observed.env)) assert.ok(!/^(OPENAI|ANTHROPIC|AWS|AZURE|GOOGLE|SENTRY|GH_|GITHUB_TOKEN|SSH_|NODE_OPTIONS)/.test(key), `Native PTY inherited host credentials: ${key}`)
    const get = async () => (await request<{ data: { status: string; exitCode?: number } }>(`api/pty/${pty.id}`, "GET", undefined, directory)).data
    await until("native PTY child exit", async () => (await get()).status === "exited")
    assert.equal((await get()).exitCode, 0)
  } catch (error) { recorder.fail("primary", "owned native PTY smoke", error) }
  try {
    await request(`api/pty/${pty.id}`, "DELETE", undefined, directory)
    assert.deepEqual(await list(), [], "Owned native PTY child remains")
  } catch (error) { recorder.fail("cleanup", "owned native PTY removal", error) }
  if (recorder.failures.length > before) throw recorder.publicError("Native PTY primary and cleanup diagnostics")
}

export type NativeRun = Awaited<ReturnType<Awaited<ReturnType<typeof nativeFixture>>["execute"]>>
