import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { Effect, Fiber, Redacted } from "effect"
import { TestClock } from "effect/testing"
import { JudgeApi } from "../src/judge/api"
import { JudgeBallot } from "../src/judge/ballot"
import { JudgeConfig } from "../src/judge/config"

// The judge's API backend against a fake Messages endpoint. The G1 goldens replay `benchmark/judge.py` against the same
// fake: the verdict comes from a forced tool call, a missing verdict or a transport failure is never a vote, a tie
// fails, and every cut of the artifact reaches the backend tag the ledger records. The tests after them pin what the
// goldens cannot reach.

interface Seen {
  readonly method: string
  readonly path: string
  readonly headers: Record<string, string>
  readonly body: Record<string, unknown>
}

interface Case {
  readonly name: string
  readonly criterion: string
  readonly files: ReadonlyArray<{ readonly name: string; readonly text: string | null }>
  readonly env: Record<string, string>
  readonly status: number
  readonly replies: ReadonlyArray<unknown>
}

const servers: ReturnType<typeof Bun.serve>[] = []
afterEach(() => servers.splice(0).forEach((server) => server.stop(true)))

// Replies are consumed one per request; the last one repeats.
function endpoint(replies: ReadonlyArray<unknown>, status = 200) {
  const seen: Seen[] = []
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      seen.push({
        method: request.method,
        path: new URL(request.url).pathname,
        headers: Object.fromEntries(request.headers),
        body: (await request.json()) as Record<string, unknown>,
      })
      return Response.json(replies[Math.min(seen.length, replies.length) - 1], { status })
    },
  })
  servers.push(server)
  return { url: server.url.href.replace(/\/$/, ""), seen }
}

const config = (url: string | undefined, overrides: Partial<JudgeConfig.Config> = {}): JudgeConfig.Config => ({
  ...JudgeConfig.defaults,
  backend: "api",
  model: "test-model",
  baseURL: url,
  apiKey: Redacted.make("local"),
  ...overrides,
})

const judge = (url: string | undefined, overrides: Partial<JudgeConfig.Config> = {}, files: JudgeConfig.File[] = []) =>
  Effect.runPromise(JudgeApi.judge(config(url, overrides), { criterion: "crit", files }))

const tool = (verdict: unknown, reason: unknown = "because") => ({
  content: [{ type: "tool_use", name: "submit_verdict", input: { verdict, reason } }],
})
const prose = (text: unknown) => ({ content: [{ type: "text", text }] })
const big = { name: "/work/run/big.diff", text: "x".repeat(5000) }

const GOLDEN = path.join(import.meta.dir, "golden", "judge")
const cases: Case[] = await Promise.all(
  [...new Bun.Glob("*/case.json").scanSync(GOLDEN)].sort().map(async (file) => ({
    name: path.dirname(file),
    ...(await Bun.file(path.join(GOLDEN, file)).json()),
  })),
)
// The stub cases belong to the gate core's stub (WP3); every other case drives this backend.
const api = cases.filter((golden) => golden.env.RELAY_JUDGE_BACKEND === "api")

// Declared divergences (PARITY-EXCEPTIONS.md), applied to the golden's expected response.
const EXCEPTIONS: Record<string, (expected: JudgeBallot.Response) => JudgeBallot.Response> = {
  // J2: the TS judge names its own setting, not a provider variable it never reads.
  "no-base-url-no-key": (expected) => ({ ...expected, reason: "api: judge API key not set" }),
}

describe("goldens", () => {
  test("every golden is an api or stub case, and the api cases are all here", () => {
    expect(cases.filter((golden) => !["api", "stub"].includes(golden.env.RELAY_JUDGE_BACKEND))).toEqual([])
    expect(api.length).toBeGreaterThanOrEqual(60)
    expect(Object.keys(EXCEPTIONS).filter((name) => !api.some((golden) => golden.name === name))).toEqual([])
  })

  test.each(api.map((golden) => [golden.name, golden] as const))("%s", async (name, golden) => {
    const fake = endpoint(golden.replies, golden.status)
    const env = Object.fromEntries(
      Object.entries(golden.env).map(([key, value]) => [key, value.replace("{server}", fake.url)]),
    )
    const settings: JudgeConfig.Config = {
      ...JudgeConfig.defaults,
      backend: "api",
      model: env.RELAY_JUDGE_MODEL ?? JudgeConfig.defaults.model,
      baseURL: env.RELAY_JUDGE_BASE_URL,
      apiKey: env.RELAY_JUDGE_API_KEY === undefined ? undefined : Redacted.make(env.RELAY_JUDGE_API_KEY),
      votes: Number(env.RELAY_JUDGE_VOTES ?? JudgeConfig.defaults.votes),
      maxContext: Number(env.RELAY_JUDGE_MAX_CTX ?? JudgeConfig.defaults.maxContext),
      maxTokens: Number(env.RELAY_JUDGE_MAX_TOKENS ?? JudgeConfig.defaults.maxTokens),
    }
    // judge.py was handed full paths; the label is the basename.
    const files = golden.files.map((file) =>
      file.text === null ? { name: `/work/run/${file.name}` } : { name: `/work/run/${file.name}`, text: file.text },
    )
    const response = await Effect.runPromise(JudgeApi.judge(settings, { criterion: golden.criterion, files }))

    const exchange = await Bun.file(path.join(GOLDEN, name, "exchange.json")).json()
    const expected = JSON.parse(await Bun.file(path.join(GOLDEN, name, "response.jsonl")).text())
    expect(
      fake.seen.map((seen) => ({
        method: seen.method,
        path: seen.path,
        headers: Object.fromEntries(
          ["anthropic-version", "content-type", "x-api-key"].map((header) => [header, seen.headers[header] ?? null]),
        ),
        body: seen.body,
      })),
    ).toEqual(exchange.requests)
    expect(response).toEqual((EXCEPTIONS[name] ?? ((same) => same))(expected))
  })

  test("the defaults are judge.py's", () => {
    expect(JudgeConfig.defaults).toEqual({
      backend: "stub",
      model: "claude-sonnet-4-6",
      votes: 1,
      maxContext: 120_000,
      maxTokens: 8192,
    })
  })
})

describe("beyond the goldens", () => {
  test("the cut counts characters, not UTF-16 units", async () => {
    const fake = endpoint([tool("pass")])
    const astral = String.fromCodePoint(0x1f600)
    const files = [{ name: "emoji.txt", text: astral.repeat(10) }]
    expect((await judge(fake.url, { maxContext: 10 }, files)).backend).toBe("llm:test-model")
    expect((await judge(fake.url, { maxContext: 9 }, files)).backend).toBe("llm:test-model(truncated:emoji.txt)")
    const sent = (fake.seen[1]!.body.messages as { content: string }[])[0]!.content
    expect(sent).toContain(`--- emoji.txt ---\n${astral.repeat(9)}\n\n[TRUNCATED at 9 characters`)
  })

  test("outer whitespace and line breaks follow Python's str.strip and str.splitlines", async () => {
    const text = `first${String.fromCharCode(0x1c)}VERDICT: PASS${String.fromCharCode(0x85)}`
    expect(await judge(endpoint([prose(text)]).url)).toMatchObject({ verdict: "pass", reason: "VERDICT: PASS" })
    const split = `VERDICT: FAIL${String.fromCharCode(0x2028)}said`
    expect(await judge(endpoint([prose(split)]).url)).toMatchObject({ verdict: "fail", reason: "said", available: true })
    // Python's strip keeps a byte-order mark, so this line never declares a verdict.
    const marked = `${String.fromCharCode(0xfeff)}VERDICT: PASS`
    expect(await judge(endpoint([prose(marked)]).url)).toMatchObject({
      verdict: "fail",
      backend: "llm:test-model(no-verdict)",
    })
  })

  test("a non-string text names its block and Python's type", async () => {
    const fake = endpoint([{ content: [{ type: "text", text: "a" }, { text: 1.5 }] }, tool("pass")])
    expect(await judge(fake.url, { votes: 3 })).toEqual({
      verdict: "fail",
      reason: "api error: sequence item 1: expected str instance, float found",
      backend: "api-error:test-model",
      available: false,
    })
    expect(fake.seen).toHaveLength(1)
  })

  test("distinct cut sets are tagged once each, in Python's tuple order", async () => {
    const astral = String.fromCodePoint(0x1f600)
    const high = String.fromCharCode(0xff5e)
    const sample = (cuts: string[]): JudgeBallot.Sample => ({
      verdict: "pass",
      reason: "ok",
      state: "answered",
      backend: "llm",
      model: "m",
      cuts,
    })
    const queue = [[astral], [], ["b"], [high], ["a", "z"], ["b"]].map(sample)
    const response = await Effect.runPromise(JudgeBallot.collect(6, Effect.sync(() => queue.shift()!)))
    // Code point order puts U+FF5E before U+1F600, where UTF-16 order would not.
    expect(response.backend).toBe(`llm:m(votes:6/6)(truncated:a,z)(truncated:b)(truncated:${high})(truncated:${astral})`)
  })

  // PARITY-EXCEPTIONS J1: urllib follows a 301-303 as a GET; the TS judge never follows a redirect with its key.
  test("a redirect is an HTTP error and is never followed", async () => {
    const target = endpoint([tool("pass")])
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response(null, { status: 302, headers: { location: `${target.url}/v1/messages` } }),
    })
    servers.push(server)
    expect(await judge(server.url.href)).toMatchObject({ reason: "api error: HTTP Error 302: Found", available: false })
    expect(target.seen).toEqual([])
  })

  // PARITY-EXCEPTIONS J3: the message after `api error: ` is the runtime's, not CPython's `json` or urllib's.
  test("a body that is not JSON is an api error", async () => {
    const server = Bun.serve({ port: 0, fetch: () => new Response("not json") })
    servers.push(server)
    const response = await judge(server.url.href, { maxContext: 1000 }, [big])
    expect(response).toMatchObject({
      verdict: "fail",
      backend: "api-error:test-model(truncated:big.diff)",
      available: false,
    })
    expect(response.reason.startsWith("api error: ")).toBe(true)
  })

  test("a reply that never comes is an api error after 60 seconds", async () => {
    const arrived = Promise.withResolvers<void>()
    const server = Bun.serve({
      port: 0,
      fetch: () => {
        arrived.resolve()
        return new Promise<Response>(() => {})
      },
    })
    servers.push(server)
    const response = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* JudgeApi.judge(config(server.url.href), { criterion: "crit", files: [] }).pipe(
          Effect.forkChild,
        )
        yield* Effect.promise(() => arrived.promise)
        yield* TestClock.adjust("60 seconds")
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(response).toEqual({
      verdict: "fail",
      reason: "api error: timed out",
      backend: "api-error:test-model",
      available: false,
    })
  })
})

describe("environment", () => {
  // Owner decision: no Orchestra provider credential ever reaches the judge. Every variable the Python judge read, and
  // every provider key, is set to a sentinel; the judge must behave exactly as its config says and never read them.
  const SENTINELS = {
    ANTHROPIC_API_KEY: "sk-ant-sentinel",
    ANTHROPIC_BASE_URL: "http://127.0.0.1:9/sentinel",
    OPENAI_API_KEY: "sk-openai-sentinel",
    RELAY_JUDGE_BACKEND: "stub",
    RELAY_JUDGE_API_KEY: "relay-sentinel",
    RELAY_JUDGE_BASE_URL: "http://127.0.0.1:9/relay-sentinel",
    RELAY_JUDGE_MODEL: "sentinel-model",
    RELAY_JUDGE_VOTES: "3",
    RELAY_JUDGE_MAX_TOKENS: "7",
    RELAY_JUDGE_MAX_CTX: "1",
    RELAY_JUDGE_STUB: "pass",
  }

  test("no provider or legacy judge variable is read, sent or obeyed", async () => {
    const fake = endpoint([tool("fail", "config only")])
    const environment = process.env
    const previous = Object.keys(SENTINELS).map((key) => [key, environment[key]] as const)
    const reads: string[] = []
    Object.assign(environment, SENTINELS)
    // Records every read through `process.env`, which is also where Effect's default ConfigProvider looks.
    process.env = new Proxy(environment, {
      get: (target, key) => (reads.push(String(key)), Reflect.get(target, key)),
      has: (target, key) => (reads.push(String(key)), Reflect.has(target, key)),
      ownKeys: (target) => (reads.push("(keys)"), Reflect.ownKeys(target)),
      getOwnPropertyDescriptor: (target, key) => (reads.push(String(key)), Reflect.getOwnPropertyDescriptor(target, key)),
    })
    const results = await Promise.all([
      Effect.runPromise(
        JudgeConfig.Service.use((service) => service.judge({ criterion: "crit", files: [{ name: "a.md", text: "ab" }] })).pipe(
          Effect.provide(JudgeConfig.layer(config(fake.url, { apiKey: undefined }))),
        ),
      ),
      judge(undefined, { apiKey: undefined }),
    ]).finally(() => {
      process.env = environment
      previous.forEach(([key, value]) => (value === undefined ? delete environment[key] : (environment[key] = value)))
    })

    expect(reads).toEqual([])
    expect(results).toEqual([
      { verdict: "fail", reason: "config only", backend: "llm:test-model", available: true },
      // Python fell back to ANTHROPIC_API_KEY here. PARITY-EXCEPTIONS J2.
      { verdict: "fail", reason: "api: judge API key not set", backend: "api-error:test-model", available: false },
    ])
    expect(fake.seen).toHaveLength(1)
    expect(fake.seen[0]!.headers["x-api-key"]).toBe("")
    expect(fake.seen[0]!.body).toMatchObject({ model: "test-model", max_tokens: 8192 })
    expect(JSON.stringify(fake.seen)).not.toContain("sentinel")
  })

  test("the judge modules name no environment alias the proxy above cannot see", async () => {
    // `Bun.env` and `import.meta.env` are the same store as `process.env` but bypass a replaced `process.env`.
    const ALIAS = /\b(?:Bun|globalThis|process|require)\b|\bimport\s*\.\s*meta\b/
    const transpiler = new Bun.Transpiler({ loader: "ts" })
    const code = (source: string) => transpiler.transformSync(source)
    expect(ALIAS.test(code("export const key = () => Bun.env.ANTHROPIC_API_KEY"))).toBe(true)
    expect(ALIAS.test(code("export const key = () => import.meta.env.ANTHROPIC_API_KEY"))).toBe(true)
    expect(ALIAS.test(code("// Bun.env in a comment is not a read\nexport const x = 1"))).toBe(false)
    const dir = path.join(import.meta.dir, "..", "src", "judge")
    const sources = await Promise.all(
      ["api", "ballot", "config"].map(async (name) => ({
        name,
        code: code(await Bun.file(path.join(dir, `${name}.ts`)).text()),
      })),
    )
    expect(sources.every((source) => source.code.includes("export"))).toBe(true)
    expect(sources.filter((source) => ALIAS.test(source.code)).map((source) => source.name)).toEqual([])
  })
})
