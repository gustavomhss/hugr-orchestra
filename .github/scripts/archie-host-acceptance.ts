#!/usr/bin/env bun
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { appendFileSync, existsSync, writeFileSync } from "node:fs"
import { appendFile, cp, lstat, mkdir, mkdtemp, readdir, readlink, realpath } from "node:fs/promises"
import { createRequire } from "node:module"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
import { isDeepStrictEqual, parseArgs } from "node:util"
import type { HookCallbackMatcher, HookEvent, Query, SpawnedProcess, query } from "../../packages/orchestra/node_modules/@anthropic-ai/claude-agent-sdk"

// Owner-run only. Preparation is the default; only --run sends one prompt. Claude env values/auth files are not read.
// bun .github/scripts/archie-host-acceptance.ts --run --out /tmp/archie-host-evidence
// Optional: --packet <revision-2 packet> --model anthropic/claude-haiku-5-5. Always use a fresh --out.
const args = parseArgs({ options: { "prepare-only": { type: "boolean" }, run: { type: "boolean" }, out: { type: "string" }, packet: { type: "string" }, model: { type: "string", default: "anthropic/claude-haiku-5-5" }, internal: { type: "string" } } }).values
const repo = resolve(import.meta.dir, "../..")
const entry = join(repo, ".github/scripts/archie-host-acceptance.ts")
const defaultPacket = resolve(repo, "../archie-state/archie-revision2-packet")
const deadlineMs = 25 * 60_000

function git(project: string, ...argv: string[]) {
  return execFileSync("git", ["-C", project, ...argv], {
    encoding: "utf8",
    timeout: 15_000,
    // Git setup in the scratch project must not run user hooks/signers or inherit another repository's index.
    env: { PATH: process.env.PATH, HOME: project, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  }).trim()
}
async function freePort() {
  const server = createServer()
  await new Promise<void>((done, fail) => {
    server.once("error", fail)
    server.listen(0, "127.0.0.1", done)
  })
  const address = server.address()
  requireFact(address && typeof address !== "string", "No localhost port")
  await new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done())))
  return address.port
}

async function main() {
  requireFact(!(args.run && args["prepare-only"]), "Choose --run or --prepare-only")
  requireFact(args.model && /^anthropic\/[A-Za-z0-9._-]+$/.test(args.model), "Invalid model")
  process.umask(0o077)
  const packet = await realpath(args.packet ?? defaultPacket)
  const out = args.out ? resolve(args.out) : await mkdtemp(join(tmpdir(), "archie-host-evidence-"))
  await mkdir(out, { recursive: true, mode: 0o700 })
  requireFact(!(await Bun.file(join(out, "plan.json")).exists()), "Use a fresh --out directory")
  const scratch = await realpath(await mkdtemp(join(tmpdir(), "archie-host-project-")))
  requireFact(relative(repo, scratch).startsWith(".."), "Scratch must be outside this worktree")
  const project = join(scratch, "project")
  await cp(join(packet, "pilot/project"), project, { recursive: true, dereference: false })
  requireFact(!(await Bun.file(join(project, "proposal.md")).exists()), "Packet already contains proposal.md")
  git(project, "init", "--initial-branch=acceptance")
  const files = Object.keys(await tree(project)).filter((file) => !file.endsWith("/"))
  requireFact(files.length > 0, "Empty pilot project")
  git(project, "add", "--", ...files)
  git(project, "-c", "user.name=Acceptance Harness", "-c", "user.email=acceptance@localhost", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "-m", "chore: seed scratch project")
  const env = Object.fromEntries(["XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME"].map((key) => [key, join(scratch, key.toLowerCase())]))
  await Promise.all(Object.values(env).map((dir) => mkdir(dir, { recursive: true, mode: 0o700 })))
  Object.assign(env, { ORCHESTRA_DB: join(scratch, "data/session.sqlite"), ORCHESTRA_CONFIG: join(scratch, "instance.json"), ORCHESTRA_TEST_HOME: scratch, ORCHESTRA_INHERIT_CREDENTIALS: "0", ORCHESTRA_DISABLE_PROJECT_CONFIG: "true", ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED: "1" })
  await mkdir(dirname(env.ORCHESTRA_DB), { recursive: true })
  await save(scratch, "instance.json", { model: args.model, default_agent: "maestro", agent: { maestro: { engine: "claude-code", model: args.model }, archie: { engine: "claude-code", model: args.model } } })
  const demand = await Bun.file(join(packet, "pilot/demand.txt")).text()
  await Bun.write(join(out, "demand.txt"), demand)
  const prompt = [
    "Perform exactly one proposal-only delegation; do not write any files yourself. No retries or substitute dispatches.",
    'First call mcp__orchestra__task_grant with seat "archie", writePaths ["proposal.md"], purpose "Archie migration acceptance: proposal-only authoring".',
    "If it fails or HOLDs, report the exact failure and stop. Do not invent a grant.",
    'Then call Agent exactly once with subagent_type "orchestra:archie", run_in_background false, no isolation.',
    "Put the returned grant id on its own line as `grantID: <id>` in the Agent prompt, and pass this FULL demand verbatim.",
    "Tell Archie the current project is the scratch project, write only proposal.md, and return the existing native upstream-result card.",
    "No implementation, tests, builds, child delegation, workflow execution, commits, credential reads or approval. Report the actual result and stop.",
    `CURRENT PROJECT: ${project}`,
    "FULL DEMAND:",
    demand,
  ].join("\n\n")
  // Enumerate names only. env -u removes inherited Claude markers without evaluating/printing their values.
  const plan: Plan = {
    repo,
    out: await realpath(out),
    scratch,
    project,
    packet,
    model: args.model,
    port: await freePort(),
    seed: git(project, "rev-parse", "HEAD"),
    seedTree: git(project, "rev-parse", "HEAD^{tree}"),
    before: await tree(project),
    env,
    removedEnvNames: Object.keys(process.env)
      .filter((name) => name === "CLAUDECODE" || name.startsWith("CLAUDE_CODE_") || name.startsWith("ORCHESTRA_"))
      .sort(),
    deadlineMs,
    prompt,
  }
  await save(out, "plan.json", plan)
  console.log(JSON.stringify({ mode: args.run ? "run" : "prepare-only", ...plan }))
  if (!args.run) return
  await run(plan)
}

function launch(plan: Plan, mode: "backend" | "verify") {
  // Normal environment/auth is inherited by env itself, never copied or inspected by this harness.
  const child = spawn(
    "env",
    [
      ...plan.removedEnvNames.flatMap((name) => ["-u", name]),
      ...Object.entries(plan.env)
        .filter(([key]) => mode === "backend" || key !== "ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED")
        .map(([key, value]) => `${key}=${value}`),
      process.execPath,
      "--tsconfig-override",
      join(repo, "packages/orchestra/tsconfig.json"),
      entry,
      "--internal",
      mode,
      "--out",
      plan.out,
      ...(mode === "backend" ? ["--run"] : []),
    ],
    { cwd: join(repo, "packages/orchestra"), stdio: ["ignore", "pipe", "pipe"] },
  )
  const exited = new Promise<number | null>((done) => {
    child.once("error", (error) => {
      void save(plan.out, `${mode}.spawn-error.json`, { error: String(error) })
      done(-1)
    })
    child.once("close", done)
  })
  const stdout = Bun.file(join(plan.out, `${mode}.stdout.log`)).writer()
  const stderr = Bun.file(join(plan.out, `${mode}.stderr.log`)).writer()
  child.stdout.on("data", (bytes: Buffer) => {
    stdout.write(bytes)
    stdout.flush()
  })
  const diagnostic = { pending: "" }
  child.stderr.on("data", (bytes: Buffer) => {
    stderr.write(bytes)
    stderr.flush()
    diagnostic.pending += bytes.toString()
    const messages = diagnostic.pending.split("\n")
    diagnostic.pending = messages.pop() ?? ""
    messages
      .filter((line) =>
        /billing_error|billing error|third-party apps now draw from your extra usage|(?:error|disabled|exhausted|insufficient).*extra[ -]usage|extra[ -]usage.*(?:error|disabled|exhausted|insufficient)|(?:HTTP|status|error)[: =]*400\b|isUsingOverage[^\n]*true/i.test(line),
      )
      .forEach((line) => {
        if (mode !== "backend") return
        void save(plan.out, "HALT.json", { reason: "backend billing/overage/400", stderr: line }).then(() => child.kill("SIGTERM"))
      })
  })
  const finished = exited.finally(async () => {
    await stdout.end()
    await stderr.end()
  })
  return { child, finished, mode }
}

async function run(plan: Plan) {
  const backend = launch(plan, "backend")
  const owned = [backend]
  await save(plan.out, "processes.json", [{ mode: backend.mode, pid: backend.child.pid }])
  const state: { sessionID?: string; idle: boolean; failure?: string; cancelled?: string } = { idle: false }
  const cancel = (signal: string) => {
    state.cancelled = signal
  }
  process.once("SIGINT", cancel)
  process.once("SIGTERM", cancel)
  const stop = async () => {
    await save(
      plan.out,
      "processes.json",
      owned.map((item) => ({ mode: item.mode, pid: item.child.pid })),
    )
    const stopped = await Promise.all(
      owned.map(async (item) => {
        if (item.child.exitCode === null && item.child.signalCode === null) item.child.kill("SIGTERM")
        const exit = await Promise.race([item.finished.then((code) => ({ code })), Bun.sleep(10_000).then(() => ({ timeout: true }))])
        return { pid: item.child.pid, mode: item.mode, ...exit }
      }),
    )
    await save(plan.out, "cleanup.json", { signal: "SIGTERM", stopped, scratchPreserved: plan.scratch })
    process.removeListener("SIGINT", cancel)
    process.removeListener("SIGTERM", cancel)
  }
  try {
    const healthDeadline = Date.now() + 90_000
    while (true) {
      requireFact(!state.cancelled, `Cancelled: ${state.cancelled}`)
      requireFact(backend.child.exitCode === null && backend.child.signalCode === null, "Backend exited before health")
      const health = await fetch(`http://127.0.0.1:${plan.port}/global/health`, { signal: AbortSignal.timeout(2000) }).catch(() => undefined)
      const banner = await Bun.file(join(plan.out, "backend.stdout.log")).text()
      if (health?.ok && banner.includes(`orchestra server listening on http://127.0.0.1:${plan.port}`)) break
      requireFact(Date.now() < healthDeadline, "Health deadline exceeded")
      await Bun.sleep(500)
    }
    const request = async (path: string, body?: unknown) => {
      const response = await fetch(`http://127.0.0.1:${plan.port}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", "x-orchestra-directory": plan.project },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15_000),
      })
      const text = await response.text()
      await appendFile(join(plan.out, "http.jsonl"), JSON.stringify({ path, status: response.status, text }) + "\n")
      requireFact(response.ok, `HTTP ${response.status}: ${text}`)
      return text ? record(JSON.parse(text)) : {}
    }
    const session = await request("/session", { agent: "maestro", title: "Archie host acceptance" })
    requireFact(typeof session.id === "string", "Session id missing")
    state.sessionID = session.id
    await save(plan.out, "session.json", session)
    const limit = Date.now() + deadlineMs
    const model = plan.model.split("/")
    await request(`/session/${session.id}/prompt_async`, { agent: "maestro", model: { providerID: model[0], modelID: model[1] }, parts: [{ type: "text", text: plan.prompt }] })
    while (Date.now() < limit) {
      requireFact(!state.cancelled, `Cancelled: ${state.cancelled}`)
      requireFact(!(await Bun.file(join(plan.out, "HALT.json")).exists()), "Observer halted; see HALT.json (verbatim evidence)")
      requireFact(backend.child.exitCode === null && backend.child.signalCode === null, "Backend exited while waiting")
      const status = await request("/session/status")
      // Absence is idle, but only after a native result prevents the admission/start race from passing.
      const frames = await lines(join(plan.out, "frames.jsonl"), true)
      if ((!status[session.id] || record(status[session.id]).type === "idle") && frames.some((frame) => frame.type === "result")) {
        state.idle = true
        break
      }
      await Bun.sleep(1000)
    }
    requireFact(state.idle, "Session deadline exceeded (25 minutes); no retry")
  } catch (error) {
    state.failure = String(error)
  } finally {
    // Stop the backend before offline service reads; stop only a child handle this invocation owns.
    if (backend.child.exitCode === null && backend.child.signalCode === null) backend.child.kill("SIGTERM")
    const settled = await Promise.race([backend.finished.then(() => true), Bun.sleep(10_000).then(() => false)])
    if (!settled) state.failure = `${state.failure ?? ""} Backend did not exit after SIGTERM`
    await save(plan.out, "run.json", state)
    try {
      requireFact(settled, "Offline verification requires backend exit")
      await Promise.all(
        ["", "-wal", "-shm"].map(async (suffix) => {
          if (await Bun.file(plan.env.ORCHESTRA_DB + suffix).exists()) await cp(plan.env.ORCHESTRA_DB + suffix, join(plan.out, `session.sqlite${suffix}`))
        }),
      )
      const verifier = launch(plan, "verify")
      owned.push(verifier)
      await save(
        plan.out,
        "processes.json",
        owned.map((item) => ({ mode: item.mode, pid: item.child.pid })),
      )
      const code = await Promise.race([verifier.finished, Bun.sleep(90_000).then(() => -1)])
      requireFact(code === 0, `Verification failed/exited ${code}; see verifier evidence`)
    } catch (error) {
      await save(plan.out, "verification-error.json", { error: String(error) })
      if (!(await Bun.file(join(plan.out, "report.json")).exists())) await save(plan.out, "report.json", { verdict: "FAIL", run: state, error: String(error) })
    } finally {
      await stop()
    }
    const report = await Bun.file(join(plan.out, "report.json")).json()
    console.log(JSON.stringify(report))
    if (report.verdict !== "PASS") process.exitCode = 1
  }
}

type Plan = {
  repo: string
  out: string
  scratch: string
  project: string
  packet: string
  model: string
  port: number
  seed: string
  seedTree: string
  before: Awaited<ReturnType<typeof tree>>
  env: Record<string, string>
  removedEnvNames: string[]
  deadlineMs: number
  prompt: string
}
function requireFact(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex")
const save = (out: string, name: string, value: unknown) => Bun.write(join(out, name), JSON.stringify(value, null, 2) + "\n")
async function lines(file: string, streaming = false): Promise<Record<string, unknown>[]> {
  if (!(await Bun.file(file).exists())) return []
  const text = await Bun.file(file).text()
  return (streaming ? text.slice(0, text.lastIndexOf("\n") + 1) : text)
    .split("\n")
    .filter(Boolean)
    .map((line) => record(JSON.parse(line)))
}

// Include ignored/untracked files, empty directories, modes and symlinks; git diff alone misses those writes.
async function tree(root: string, prefix = ""): Promise<Record<string, string>> {
  return Object.fromEntries(
    (
      await Promise.all(
        (await readdir(join(root, prefix)))
          .sort()
          .filter((name) => prefix || name !== ".git")
          .map(async (name) => {
            const file = join(prefix, name)
            const info = await lstat(join(root, file))
            if (info.isSymbolicLink()) return [[file, `link:${await readlink(join(root, file))}`]]
            if (info.isDirectory()) return [[`${file}/`, `dir:${info.mode & 0o777}`], ...Object.entries(await tree(root, file))]
            requireFact(info.isFile(), `Unexpected project node: ${file}`)
            return [[file, `file:${info.mode & 0o777}:${hash(await Bun.file(join(root, file)).bytes())}`]]
          }),
      )
    )
      .flat()
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

// Instrumentation only: wraps the installed real query and callbacks. No fabricated SDK frames or permissions.
async function observe(plan: Plan) {
  const { mock } = await import("bun:test")
  const sdkPath = createRequire(join(plan.repo, "packages/orchestra/package.json")).resolve("@anthropic-ai/claude-agent-sdk")
  const sdk = (await import(sdkPath)) as typeof import("../../packages/orchestra/node_modules/@anthropic-ai/claude-agent-sdk")
  const realQuery = sdk.query
  const write = (name: string, value: unknown) => appendFileSync(join(plan.out, name), JSON.stringify(value) + "\n")
  const halt = (reason: string, evidence: unknown, abort?: AbortController): never => {
    writeFileSync(join(plan.out, "HALT.json"), JSON.stringify({ reason, evidence }, null, 2))
    abort?.abort()
    throw new Error(`Acceptance guard stopped: ${reason}`)
  }
  const processes = new Set<SpawnedProcess>()
  process.once("SIGTERM", () => {
    processes.forEach((child) => {
      if (child.exitCode === null && child.signalCode == null) child.kill("SIGTERM")
    })
    write("sdk-processes.jsonl", { phase: "cleanup", signal: "SIGTERM", remaining: processes.size })
    setTimeout(() => process.exit(143), 2000)
  })
  const capturedQuery: typeof query = (input) => {
    if (existsSync(join(plan.out, "HALT.json"))) throw new Error("Acceptance already halted; no further query")
    write("queries.jsonl", { model: input.options?.model, timestamp: Date.now() })
    const hooks = Object.fromEntries(
      Object.entries(input.options?.hooks ?? {}).map(([name, matchers]) => [
        name,
        matchers.map((matcher) => ({
          ...matcher,
          hooks: matcher.hooks.map((callback) => async (...args: Parameters<typeof callback>) => {
            write("hooks.jsonl", { phase: "before", name, input: args[0], toolUseID: args[1] })
            const reason = stopReason({ name, input: args[0] })
            if (reason) halt(reason, { name, input: args[0] }, input.options?.abortController)
            const output = await callback(...args).catch((error: unknown) => {
              write("hooks.jsonl", { phase: "rejected", name, input: args[0], toolUseID: args[1], error: String(error) })
              throw error
            })
            write("hooks.jsonl", { phase: "after", name, input: args[0], toolUseID: args[1], output })
            return output
          }),
        })),
      ]),
    ) as Partial<Record<HookEvent, HookCallbackMatcher[]>>
    // These passive callbacks obtain only paths to transcripts of this query and its children. Never scan $HOME.
    hooks.SessionStart = [
      ...(hooks.SessionStart ?? []),
      {
        hooks: [
          async (input) => {
            write("hooks.jsonl", { phase: "observed", name: "SessionStart", input })
            return {}
          },
        ],
      },
    ]
    hooks.SubagentStop = [
      ...(hooks.SubagentStop ?? []),
      {
        hooks: [
          async (input) => {
            write("hooks.jsonl", { phase: "observed", name: "SubagentStop", input })
            return {}
          },
        ],
      },
    ]
    const spawnProcess = input.options?.spawnClaudeCodeProcess
    const result = realQuery({
      ...input,
      options: {
        ...input.options,
        hooks,
        ...(spawnProcess
          ? {
              spawnClaudeCodeProcess: (options) => {
                const child = spawnProcess(options)
                processes.add(child)
                write("sdk-processes.jsonl", { phase: "spawn", pid: record(child).pid })
                child.once("exit", (code, signal) => {
                  processes.delete(child)
                  write("sdk-processes.jsonl", { phase: "exit", pid: record(child).pid, code, signal })
                })
                return child
              },
            }
          : {}),
      },
    })
    return new Proxy(result, {
      get(target, key) {
        if (key === Symbol.asyncIterator)
          return async function* () {
            for await (const frame of target) {
              write("frames.jsonl", frame)
              const reason = stopReason(frame)
              if (reason) halt(reason, frame, input.options?.abortController)
              yield frame
            }
          }
        const value: unknown = Reflect.get(target, key, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    }) as Query
  }
  // Bun's module wrapper preserves the real SDK exports and invokes the real query exactly once per host query.
  mock.module(sdkPath, () => ({ ...sdk, query: capturedQuery }))
  console.error("ARCHIE-HOST-OBSERVER-READY")
}

function stopReason(value: unknown) {
  const frame = record(value)
  const rate = record(frame.rate_limit_info)
  const five = record(record(rate.unifiedWindows).five_hour).utilization ?? (rate.rateLimitType === "five_hour" ? rate.utilization : undefined)
  if (typeof five === "number" && five >= 0.98) return "five-hour utilization >=98%"
  if (rate.status === "rejected" || rate.isUsingOverage === true || rate.rateLimitType === "overage") return "rate-limit/overage"
  const line = JSON.stringify(frame)
  // Init advertises /extra-usage as a slash command; that benign listing is not a billing error.
  if (frame.type === "system" && frame.subtype === "init") return undefined
  const error = frame.error || frame.is_error || frame.type === "error" || frame.subtype === "api_retry" || frame.name === "PostToolUseFailure" || /"(?:is_error|isError)":true/.test(line)
  if (
    (error && /billing|extra[ -]usage|overage|\b400\b/i.test(line)) ||
    /third-party apps now draw from your extra usage|billing_error|billing error|extra usage.*(error|disabled|exhausted|insufficient)|(?:error|disabled|exhausted|insufficient).*extra usage/i.test(line) ||
    frame.api_error_status === 400 ||
    frame.status === 400 ||
    record(frame.error).status === 400
  )
    return "billing/overage/400"
  if (frame.type === "result" && frame.is_error) return "provider result error"
  if (frame.type === "assistant" && frame.error) return "provider assistant error"
  return undefined
}

async function verify(plan: Plan) {
  const frames = await lines(join(plan.out, "frames.jsonl"))
  const hooks = await lines(join(plan.out, "hooks.jsonl"))
  const queries = await lines(join(plan.out, "queries.jsonl"))
  const run = record(await Bun.file(join(plan.out, "run.json")).json())
  const after = await tree(plan.project)
  const changed = [...new Set([...Object.keys(plan.before), ...Object.keys(after)])].filter((file) => plan.before[file] !== after[file]).sort()
  const proposal = await lstat(join(plan.project, "proposal.md")).catch(() => undefined)
  const checks: Record<string, unknown> = {
    bTree: {
      pass: proposal?.isFile() === true && proposal.size > 0 && isDeepStrictEqual(changed, ["proposal.md"]),
      changed,
      seedCommit: plan.seed,
      seedGitTree: plan.seedTree,
      beforeHash: hash(JSON.stringify(plan.before)),
      afterHash: hash(JSON.stringify(after)),
      before: plan.before,
      after,
    },
  }
  const { Effect, Option, Schema } = (await import(createRequire(join(plan.repo, "packages/orchestra/package.json")).resolve("effect"))) as typeof import("effect")
  const { AppRuntime } = (await import(join(plan.repo, "packages/orchestra/src/effect/app-runtime.ts"))) as typeof import("../../packages/orchestra/src/effect/app-runtime")
  const { InstanceStore } = (await import(join(plan.repo, "packages/orchestra/src/project/instance-store.ts"))) as typeof import("../../packages/orchestra/src/project/instance-store")
  const { InstanceRef } = (await import(join(plan.repo, "packages/orchestra/src/effect/instance-ref.ts"))) as typeof import("../../packages/orchestra/src/effect/instance-ref")
  const { Agent } = (await import(join(plan.repo, "packages/orchestra/src/agent/agent.ts"))) as typeof import("../../packages/orchestra/src/agent/agent")
  const { Session } = (await import(join(plan.repo, "packages/orchestra/src/session/session.ts"))) as typeof import("../../packages/orchestra/src/session/session")
  const { SessionID } = (await import(join(plan.repo, "packages/orchestra/src/session/schema.ts"))) as typeof import("../../packages/orchestra/src/session/schema")
  const { LogicalTask } = (await import(join(plan.repo, "packages/orchestra/src/maestro/logical-task.ts"))) as typeof import("../../packages/orchestra/src/maestro/logical-task")
  const { WriteRoots } = (await import(join(plan.repo, "packages/orchestra/src/maestro/write-roots.ts"))) as typeof import("../../packages/orchestra/src/maestro/write-roots")
  const UpstreamProvenance = (await import(join(plan.repo, "packages/orchestra/src/maestro/upstream-provenance.ts"))) as typeof import("../../packages/orchestra/src/maestro/upstream-provenance")
  const { SessionMessage } = (await import(join(plan.repo, "packages/schema/src/session-message.ts"))) as typeof import("../../packages/schema/src/session-message")
  const { UpstreamAttribution } = (await import(join(plan.repo, "packages/schema/src/upstream-attribution.ts"))) as typeof import("../../packages/schema/src/upstream-attribution")
  const dispatchSchema = Schema.Struct({
    executor: UpstreamAttribution.ClaudeCodeAgentDispatch.fields.executor,
    toolName: UpstreamAttribution.ClaudeCodeAgentDispatch.fields.tool,
    toolUseID: Schema.NonEmptyString,
    agentID: UpstreamAttribution.ClaudeCodeAgentDispatch.fields.agentID,
    grantID: UpstreamAttribution.ClaudeCodeAgentDispatch.fields.grantID,
    subagentType: UpstreamAttribution.ClaudeCodeAgentDispatch.fields.subagentType,
    seat: Schema.Literal("archie"),
    writeRoots: Schema.Array(Schema.String),
    background: Schema.Boolean,
  })
  try {
    requireFact(typeof run.sessionID === "string", "No stored parent Session ID; dispatch was not reached")
    const loaded = await AppRuntime.runPromise(
      Effect.gen(function* () {
        const instances = yield* InstanceStore.Service
        return yield* instances.load({ directory: plan.project })
      }),
    )
    const evidence = await AppRuntime.runPromise(
      Effect.gen(function* () {
        const agents = yield* Agent.Service
        const maestro = yield* agents.get("maestro")
        const archie = yield* agents.get("archie")
        const sessions = yield* Session.Service
        const parent = yield* sessions.get(SessionID.make(String(run.sessionID)))
        const messages = yield* sessions.messages({ sessionID: parent.id })
        const children = yield* sessions.children(parent.id)
        const nativeCalls = messages.flatMap((message) => message.parts.filter((part) => part.type === "tool" && ["Agent", "Task"].includes(part.tool)))
        const calls = messages.flatMap((message) => message.parts.flatMap((part) => (part.type === "tool" && ["Agent", "Task"].includes(part.tool) && part.state.input.subagent_type === "orchestra:archie" ? [{ message, part }] : [])))
        const selected = calls.length === 1 ? calls[0] : undefined
        const metadata = selected && selected.part.state.status !== "pending" ? selected.part.state.metadata : undefined
        const decoded = Schema.decodeUnknownOption(dispatchSchema)(metadata?.claudeCodeDispatch, { onExcessProperty: "error" })
        const dispatch = Option.getOrUndefined(decoded)
        const child = children.find((item) => item.id === metadata?.sessionId)
        const history = child ? yield* sessions.messages({ sessionID: child.id }) : []
        const workResult = record(metadata?.workResult)
        const authorID = record(workResult.author).messageID ?? record(workResult.card).messageID
        const author = history.find((message) => message.info.id === authorID)
        const logical = child ? yield* LogicalTask.read(child.id).pipe(Effect.result) : undefined
        const observer =
          selected && child && author && logical?._tag === "Success" && logical.success
            ? yield* UpstreamProvenance.observe({
                projectID: parent.projectID,
                parentSessionID: parent.id,
                parentMessageID: SessionMessage.ID.make(selected.message.info.id),
                parentCallID: selected.part.callID,
                authorSessionID: child.id,
                authorMessageID: SessionMessage.ID.make(author.info.id),
                logicalTaskID: logical.success.taskId,
                dispatchKind: "claude-code-agent",
              }).pipe(Effect.match({ onSuccess: (attribution) => ({ attribution }), onFailure: (error) => ({ denied: { code: error.code, message: error.message } }) }))
            : { unavailable: "Missing unique stored dispatch, child, author or logical binding" }
        return { maestro, archie, nativeCalls, parent, messages, children, calls, selected, metadata, dispatch, child, history, author, logical, observer, childWriteRoots: child ? WriteRoots.read(child.permission) : undefined }
      }).pipe(Effect.provideService(InstanceRef, loaded)),
    )
    await save(plan.out, "stored-evidence.json", evidence)
    const selected = evidence.selected
    const dispatch = evidence.dispatch
    const input = selected?.part.state.input
    const pre = hooks.filter((hook) => hook.phase === "after" && hook.name === "PreToolUse" && hook.toolUseID === selected?.part.callID)
    const post = hooks.filter((hook) => hook.phase === "after" && hook.name === "PostToolUse" && hook.toolUseID === selected?.part.callID)
    const response = record(record(post[0]?.input).tool_response)
    const blocks = Array.isArray(response.content) ? response.content : []
    const outputTexts = blocks.flatMap((block) => (record(block).type === "text" && typeof record(block).text === "string" ? [String(record(block).text)] : []))
    const authorText = evidence.author?.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
    const outputText = outputTexts.join("\n")
    await Bun.write(join(plan.out, "author.txt"), authorText ?? "")
    await Bun.write(join(plan.out, "agent-output.txt"), outputText)
    checks.a = {
      pass:
        evidence.parent.agent === "maestro" &&
        !evidence.parent.parentID &&
        evidence.calls.length === 1 &&
        evidence.nativeCalls.length === 1 &&
        selected?.message.info.role === "assistant" &&
        selected.message.info.agent === "maestro" &&
        selected.message.info.time.completed !== undefined &&
        !selected.message.info.error &&
        selected.message.info.finish !== "error" &&
        selected.part.state.status === "completed" &&
        selected.part.metadata?.providerExecuted === true &&
        dispatch?.toolUseID === selected.part.callID &&
        dispatch?.toolName === selected.part.tool &&
        dispatch?.background === false &&
        evidence.metadata?.background === false &&
        input?.run_in_background === false &&
        pre.length === 1 &&
        post.length === 1 &&
        response.status === "completed" &&
        response.agentId === dispatch.agentID,
      calls: evidence.calls.length,
      nativeDispatches: evidence.nativeCalls.length,
      parentMessageID: selected?.message.info.id,
      parentCallID: selected?.part.callID,
      dispatch,
    }
    const proposalWrites = hooks.filter((hook) => {
      const value = record(hook.input)
      const input = record(value.tool_input)
      return hook.phase === "after" && hook.name === "PostToolUse" && ["Write", "Edit"].includes(String(value.tool_name)) && typeof input.file_path === "string" && resolve(plan.project, input.file_path) === join(plan.project, "proposal.md")
    })
    checks.b = {
      pass:
        proposalWrites.length > 0 &&
        proposalWrites.every((hook) => record(hook.input).agent_id === dispatch?.agentID) &&
        evidence.children.length === 1 &&
        evidence.child?.agent === "archie" &&
        evidence.child.parentID === evidence.parent.id &&
        evidence.child.projectID === evidence.parent.projectID &&
        evidence.child.directory === plan.project &&
        evidence.author?.info.role === "assistant" &&
        evidence.author.info.agent === "archie" &&
        !evidence.author.info.error &&
        evidence.author.info.time.completed !== undefined &&
        !["error", "tool-calls"].includes(evidence.author.info.finish ?? ""),
      childSessionID: evidence.child?.id,
      authorMessageID: evidence.author?.info.id,
      proposalWriteCalls: proposalWrites.map((hook) => hook.toolUseID),
    }
    checks.c = {
      pass: post.length === 1 && outputTexts.length > 0 && authorText !== undefined && Buffer.from(authorText).equals(Buffer.from(outputText)),
      source: "hooks.jsonl: after PostToolUse.tool_response.content (real AgentOutput)",
      authorBytes: authorText === undefined ? null : Buffer.byteLength(authorText),
      outputBytes: Buffer.byteLength(outputText),
      authorSha256: authorText === undefined ? null : hash(authorText),
      outputSha256: hash(outputText),
    }
    checks.d = { pass: "attribution" in evidence.observer && evidence.observer.attribution.schema === "maestro-upstream-attribution-v2", ...evidence.observer }
    const grants = evidence.messages.flatMap((message) =>
      message.parts.flatMap((part) => (part.type === "tool" && part.tool === "task_grant" && part.metadata?.claudeCodeTool === "mcp__orchestra__task_grant" && part.state.status === "completed" && part.state.metadata?.grantID === dispatch?.grantID ? [part] : [])),
    )
    const grant = grants[0]
    const grantMetadata = grant?.state.status === "completed" ? grant.state.metadata : undefined
    checks.e = {
      pass:
        grants.length === 1 &&
        grant?.state.input.seat === "archie" &&
        isDeepStrictEqual(grant?.state.input.writePaths, ["proposal.md"]) &&
        grantMetadata?.seat === "archie" &&
        isDeepStrictEqual(evidence.childWriteRoots, [join(plan.project, "proposal.md")]) &&
        isDeepStrictEqual(grantMetadata?.writeRoots, evidence.childWriteRoots) &&
        isDeepStrictEqual(dispatch?.writeRoots, evidence.childWriteRoots) &&
        typeof input?.prompt === "string" &&
        input.prompt.split("\n").includes(`grantID: ${dispatch?.grantID}`) &&
        input.prompt.includes(plan.prompt.split("FULL DEMAND:\n\n")[1]),
      childWriteRoots: evidence.childWriteRoots,
      grantWriteRoots: grantMetadata?.writeRoots,
      dispatchWriteRoots: dispatch?.writeRoots,
      grantID: dispatch?.grantID,
    }
    // SDK init does not expose entrypoint. Native transcript frames do; read only paths delivered by this run's hooks.
    const init = frames.filter((frame) => frame.type === "system" && frame.subtype === "init" && frame.cwd === plan.project)
    const sessionID = init[0]?.session_id
    const root = hooks.map((hook) => record(hook.input)).find((hook) => hook.hook_event_name === "SessionStart" && hook.session_id === sessionID && hook.cwd === plan.project)
    const native: { source: string; frame: Record<string, unknown> }[] = []
    if (root && typeof root.transcript_path === "string" && basename(root.transcript_path) === `${sessionID}.jsonl`) {
      const parentPath = await realpath(root.transcript_path)
      const paths = [
        parentPath,
        ...hooks.flatMap((hook) => {
          const value = record(hook.input)
          return value.hook_event_name === "SubagentStop" && value.session_id === sessionID && value.agent_id === dispatch?.agentID && typeof value.agent_transcript_path === "string" && basename(value.agent_transcript_path) === `agent-${dispatch?.agentID}.jsonl`
            ? [value.agent_transcript_path]
            : []
        }),
      ]
      for (const file of [...new Set(paths)]) {
        const path = await realpath(file)
        requireFact(path === parentPath || path.startsWith(join(dirname(parentPath), String(sessionID), "subagents") + "/"), "Native transcript path escaped this query")
        native.push(...(await lines(path)).map((frame) => ({ source: path, frame })))
      }
    }
    await save(plan.out, "native-transcript-frames.json", native)
    const entrypoints = [...new Set([...frames, ...native.map((item) => item.frame)].flatMap((frame) => (typeof frame.entrypoint === "string" ? [frame.entrypoint] : [])))]
    const parentModels = frames.flatMap((frame) => (frame.type === "assistant" && !frame.parent_tool_use_id && typeof record(frame.message).model === "string" ? [record(frame.message).model] : []))
    const childModels = frames.flatMap((frame) => (frame.type === "assistant" && frame.parent_tool_use_id === selected?.part.callID && typeof record(frame.message).model === "string" ? [record(frame.message).model] : []))
    checks.f = {
      pass:
        init.length === 1 &&
        queries.length === 1 &&
        queries[0].model === plan.model.split("/")[1] &&
        entrypoints.length === 1 &&
        entrypoints[0] === "sdk-ts" &&
        parentModels.length > 0 &&
        childModels.length > 0 &&
        evidence.maestro?.engine === "claude-code" &&
        evidence.archie?.engine === "claude-code" &&
        `${evidence.maestro.model?.providerID}/${evidence.maestro.model?.modelID}` === plan.model &&
        `${evidence.archie.model?.providerID}/${evidence.archie.model?.modelID}` === plan.model &&
        parentModels.every((model) => model === init[0].model) &&
        childModels.every((model) => model === init[0].model) &&
        (response.resolvedModel === undefined || childModels.includes(response.resolvedModel)),
      entrypoints,
      entrypointSource: "native transcript frames, or SDK frames when available; never inferred from config/env",
      requestedModel: plan.model,
      initModels: init.map((frame) => frame.model),
      parentModels: [...new Set(parentModels)],
      childModels: [...new Set(childModels)],
      resolvedChildModel: response.resolvedModel,
    }
  } catch (error) {
    checks.services = { pass: false, error: String(error) }
  } finally {
    await AppRuntime.dispose()
  }
  const halt = (await Bun.file(join(plan.out, "HALT.json")).exists()) ? await Bun.file(join(plan.out, "HALT.json")).json() : undefined
  const stops = frames.flatMap((frame) => (stopReason(frame) ? [{ reason: stopReason(frame), frame }] : []))
  const pass = ["a", "b", "bTree", "c", "d", "e", "f"].every((key) => record(checks[key]).pass === true) && run.idle === true && !run.failure && !halt && stops.length === 0
  await save(plan.out, "report.json", {
    verdict: pass ? "PASS" : "FAIL",
    scope: "PLAN §8 Maestro-to-Archie host acceptance; screenshot parity, S14 controls and credential filesystem audit require separate evidence",
    project: plan.project,
    db: plan.env.ORCHESTRA_DB,
    checks,
    run,
    halt,
    stops,
    evidence: plan.out,
  })
  if (!pass) process.exitCode = 1
}
async function dispatch() {
  if (!args.internal) {
    await main().catch((error: unknown) => {
      console.error(String(error))
      process.exitCode = 1
    })
    return
  }
  requireFact(args.out && ["backend", "verify"].includes(args.internal), "Invalid internal invocation")
  const out = await realpath(args.out)
  const plan = (await Bun.file(join(out, "plan.json")).json()) as Plan
  requireFact(plan.repo === repo && plan.out === out, "Internal plan placement mismatch")
  if (args.internal === "verify") {
    // Service disposal may leave idle platform handles; exit only after the evidence or failure settles.
    await verify(plan).then(
      () => process.exit(process.exitCode ?? 0),
      (error: unknown) => {
        console.error(String(error))
        process.exit(1)
      },
    )
  }
  if (args.internal === "backend") {
    requireFact(args.run, "Backend execution requires --run")
    await observe(plan)
    process.argv = [process.execPath, join(repo, "packages/orchestra/src/index.ts"), "serve", "--hostname", "127.0.0.1", "--port", String(plan.port), "--print-logs"]
    await import(join(repo, "packages/orchestra/src/index.ts"))
  }
}

await dispatch()
