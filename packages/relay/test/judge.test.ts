import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { Effect, Fiber, Redacted } from "effect"
import { TestClock } from "effect/testing"
import { JudgeApi } from "../src/judge/api"
import { JudgeBallot } from "../src/judge/ballot"
import { JudgeConfig } from "../src/judge/config"

// The judge's API backend against a fake Messages endpoint, porting `tests/test_judge_api.py`: the verdict comes from a
// forced tool call, a missing verdict or a transport failure is never a vote, a tie fails, and every cut of the
// artifact reaches the backend tag the ledger records.

interface Seen {
  readonly path: string
  readonly headers: Record<string, string>
  readonly body: Record<string, unknown>
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
        path: new URL(request.url).pathname,
        headers: Object.fromEntries(request.headers),
        body: (await request.json()) as Record<string, unknown>,
      })
      return Response.json(replies[Math.min(seen.length, replies.length) - 1], { status })
    },
  })
  servers.push(server)
  return { url: server.url.href, seen }
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
const empty = { content: [], stop_reason: "max_tokens" }
const big = (name = "big.diff") => ({ name: `/work/run/${name}`, text: "x".repeat(5000) })
const cut = { maxContext: 1000, votes: 3 }

describe("wire", () => {
  test("the verdict comes from the forced tool call", async () => {
    const fake = endpoint([tool("pass", "the artifact satisfies it")])
    expect(await judge(fake.url)).toEqual({
      verdict: "pass",
      reason: "the artifact satisfies it",
      backend: "llm:test-model",
      available: true,
    })
  })

  test("the request forces the tool, does not stream and carries the judge config", async () => {
    const fake = endpoint([tool("fail")])
    await judge(`${fake.url}//`)
    expect(fake.seen).toHaveLength(1)
    expect(fake.seen[0]!.path).toBe("/v1/messages")
    expect(fake.seen[0]!.headers).toMatchObject({
      "x-api-key": "local",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    })
    expect(fake.seen[0]!.body).toEqual({
      model: "test-model",
      max_tokens: 8192,
      system: expect.stringContaining("End your reply with a final line that is exactly 'VERDICT: PASS'"),
      tools: [
        {
          name: "submit_verdict",
          description: "Return the compliance verdict for the stated criterion.",
          input_schema: {
            type: "object",
            properties: {
              verdict: { type: "string", enum: ["pass", "fail"] },
              reason: { type: "string", description: "One or two sentences of justification." },
            },
            required: ["verdict", "reason"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_verdict" },
      stream: false,
      messages: [
        {
          role: "user",
          content:
            "CRITERION:\ncrit\n\nARTIFACT UNDER REVIEW:\n(no artifact provided)\n\n" +
            "Does the artifact satisfy the criterion? Reason briefly, then give the VERDICT line.",
        },
      ],
    })
  })

  test("max_tokens is generous by default and configurable", async () => {
    const fake = endpoint([tool("pass")])
    await judge(fake.url)
    await judge(fake.url, { maxTokens: 123 })
    expect(fake.seen.map((seen) => seen.body.max_tokens)).toEqual([8192, 123])
    expect(JudgeConfig.defaults.maxContext).toBeGreaterThanOrEqual(100_000)
  })

  test("each file is labelled by its basename and a missing one reads (file not found)", async () => {
    const fake = endpoint([tool("pass")])
    await judge(fake.url, {}, [{ name: "/work/run/review.md", text: "A review" }, { name: "/work/gone.md" }])
    const messages = fake.seen[0]!.body.messages as { content: string }[]
    expect(messages[0]!.content).toContain(
      "ARTIFACT UNDER REVIEW:\n--- review.md ---\nA review\n\n--- gone.md ---\n(file not found)\n\nDoes the artifact",
    )
  })

  test("a cut artifact is announced to the model and to the ledger", async () => {
    const fake = endpoint([tool("pass")])
    expect((await judge(fake.url, { maxContext: 1000 }, [big()])).backend).toBe("llm:test-model(truncated:big.diff)")
    const sent = (fake.seen[0]!.body.messages as { content: string }[])[0]!.content
    expect(sent).toContain(`--- big.diff ---\n${"x".repeat(1000)}\n\n[TRUNCATED at 1000 characters — the rest of`)
    expect(sent).toContain("big.diff was NOT shown to you. If the criterion cannot be decided")
    expect((await judge(fake.url, { maxContext: 100_000 }, [big()])).backend).toBe("llm:test-model")
  })

  test("the cut counts characters, not UTF-16 units", async () => {
    const fake = endpoint([tool("pass")])
    const astral = String.fromCodePoint(0x1f600)
    const files = [{ name: "emoji.txt", text: astral.repeat(10) }]
    expect((await judge(fake.url, { maxContext: 10 }, files)).backend).toBe("llm:test-model")
    expect((await judge(fake.url, { maxContext: 9 }, files)).backend).toBe("llm:test-model(truncated:emoji.txt)")
    const sent = (fake.seen[1]!.body.messages as { content: string }[])[0]!.content
    expect(sent).toContain(`--- emoji.txt ---\n${astral.repeat(9)}\n\n[TRUNCATED at 9 characters`)
  })
})

describe("verdicts", () => {
  test("a tool call with a bogus verdict does not pass", async () => {
    expect((await judge(endpoint([tool("maybe", "unsure")]).url)).verdict).toBe("fail")
  })

  test("the prose verdict still works where tool_choice is ignored, and keeps truncation", async () => {
    expect(await judge(endpoint([prose("looks fine\nVERDICT: PASS")]).url)).toEqual({
      verdict: "pass",
      reason: "VERDICT: PASS",
      backend: "llm:test-model",
      available: true,
    })
    const response = await judge(endpoint([prose("VERDICT: FAIL")]).url, { maxContext: 1000 }, [big()])
    expect(response.backend).toBe("llm:test-model(truncated:big.diff)")
  })

  test("a judge that never answered is tagged no-verdict, never recorded as a judgment", async () => {
    expect(await judge(endpoint([prose("I was still thinking about it")]).url)).toEqual({
      verdict: "fail",
      reason: "no VERDICT line in 29 chars of reply (truncated at max_tokens?): I was still thinking about it",
      backend: "llm:test-model(no-verdict)",
      available: false,
    })
    expect(await judge(endpoint([empty]).url)).toEqual({
      verdict: "fail",
      reason: "no VERDICT line in 0 chars of reply (truncated at max_tokens?): no response",
      backend: "llm:test-model(no-verdict)",
      available: false,
    })
  })

  test("the backend tag names the model that graded", async () => {
    expect((await judge(endpoint([tool("pass")]).url, { model: "some-other-model" })).backend).toBe(
      "llm:some-other-model",
    )
  })

  test.each([
    "VERDICT: FAIL (previous PASS was incorrect)",
    "VERDICT: PASS or FAIL",
    "VERDICT: NOTPASS",
    "VERDICT: UNKNOWN",
    "Result: VERDICT: PASS",
    "VERDICT: PASS\nVERDICT: FAIL (previous PASS was incorrect)",
    // Python's strip keeps a byte-order mark, so this line never declares a verdict.
    `${String.fromCharCode(0xfeff)}VERDICT: PASS`,
  ])("ambiguous prose is unavailable, not a vote: %j", async (line) => {
    const fake = endpoint([prose(line), tool("pass"), tool("pass")])
    const response = await judge(fake.url, { votes: 3 })
    expect([response.verdict, response.backend, fake.seen.length]).toEqual(["fail", "llm:test-model(no-verdict)", 1])
  })

  test.each(["pass", "fail"] as const)("an exact prose verdict accepts only case and outer whitespace: %s", async (v) => {
    const fake = endpoint([prose(`Explanation mentions PASS.\n \tVeRdIcT: ${v}\t \n`)])
    expect(await judge(fake.url)).toMatchObject({ verdict: v, backend: "llm:test-model" })
    expect(fake.seen).toHaveLength(1)
  })

  test("outer whitespace and line breaks follow Python's str.strip and str.splitlines", async () => {
    const separator = String.fromCharCode(0x2028)
    const text = `first${String.fromCharCode(0x1c)}VERDICT: PASS${String.fromCharCode(0x85)}`
    expect(await judge(endpoint([prose(text)]).url)).toMatchObject({ verdict: "pass", reason: "VERDICT: PASS" })
    expect(await judge(endpoint([prose(`VERDICT: FAIL${separator}said`)]).url)).toMatchObject({
      verdict: "fail",
      reason: "said",
      available: true,
    })
  })

  test.each([
    ["pass", "FAIL"],
    ["fail", "PASS"],
  ] as const)("the forced tool verdict %s takes priority over conflicting prose", async (verdict, other) => {
    const reply = tool(verdict, "tool judgment")
    const fake = endpoint([{ content: [{ type: "text", text: `VERDICT: ${other}` }, ...reply.content] }])
    expect(await judge(fake.url)).toEqual({
      verdict,
      reason: "tool judgment",
      backend: "llm:test-model",
      available: true,
    })
  })

  test("a tool reason is cut to 300 characters and an empty one is named", async () => {
    expect((await judge(endpoint([tool("pass", "r".repeat(400))]).url)).reason).toBe("r".repeat(300))
    expect((await judge(endpoint([tool("fail", "")]).url)).reason).toBe("(no reason given)")
  })
})

describe("votes", () => {
  test("a flapping judge is decided by majority", async () => {
    const fake = endpoint([tool("pass"), tool("fail"), tool("pass")])
    const response = await judge(fake.url, { votes: 3 })
    expect(response).toEqual({
      verdict: "pass",
      reason: "2/3 passed · because",
      backend: "llm:test-model(votes:2/3)",
      available: true,
    })
    expect(fake.seen).toHaveLength(3)
  })

  test("the minority does not win and a tie fails", async () => {
    const minority = await judge(endpoint([tool("fail"), tool("pass"), tool("fail")]).url, { votes: 3 })
    expect([minority.verdict, minority.backend]).toEqual(["fail", "llm:test-model(votes:1/3)"])
    const tie = await judge(endpoint([tool("pass", "yes"), tool("fail", "no")]).url, { votes: 2 })
    expect(tie).toEqual({ verdict: "fail", reason: "1/2 passed · no", backend: "llm:test-model(votes:1/2)", available: true })
  })

  test("the tally reaches the ledger, and one vote is the default and costs one call", async () => {
    expect((await judge(endpoint([tool("pass")]).url, { votes: 3 })).backend).toBe("llm:test-model(votes:3/3)")
    const fake = endpoint([tool("pass")])
    expect((await judge(fake.url)).backend).toBe("llm:test-model")
    expect(fake.seen).toHaveLength(1)
  })

  test("a missing verdict is not a vote: it aborts the ballot", async () => {
    const fake = endpoint([tool("pass"), { content: [] }, tool("pass")])
    expect(await judge(fake.url, { votes: 3 })).toMatchObject({
      verdict: "fail",
      backend: "llm:test-model(no-verdict)",
      available: false,
    })
    expect(fake.seen).toHaveLength(2)
  })

  test("an empty reply with a cut context aborts before later passes", async () => {
    const fake = endpoint([empty, tool("pass"), tool("pass")])
    const response = await judge(fake.url, cut, [big()])
    expect([response.verdict, response.backend]).toEqual(["fail", "llm:test-model(no-verdict)(truncated:big.diff)"])
    expect(response.reason).toContain("no VERDICT line")
    expect(fake.seen).toHaveLength(1)
  })

  test.each(["big.diff", "big(no-verdict).diff"])("a valid majority keeps model, tally and truncation: %s", async (name) => {
    const fake = endpoint([tool("pass", "first accepted judgment"), tool("fail"), tool("pass")])
    expect(await judge(fake.url, cut, [big(name)])).toEqual({
      verdict: "pass",
      reason: "2/3 passed · first accepted judgment",
      backend: `llm:test-model(votes:2/3)(truncated:${name})`,
      available: true,
    })
    expect(fake.seen).toHaveLength(3)
  })

  const MARKER_MODELS = [
    "alias(truncated:shadow)",
    "alias(no-verdict)",
    "alias(extra)",
    "alias(truncated:shadow(no-verdict))",
    "alias(no-verdict)(truncated:shadow)",
    "alias(api-error)(cli-error)(votes:0/3)",
  ]
  const artifact = big("large(no-verdict)(truncated:shadow(votes:9)).diff")

  test.each(MARKER_MODELS.flatMap((model) => [{ model, answer: tool("pass") }, { model, answer: prose("VERDICT: PASS") }]))(
    "model alias markers keep valid votes and exact identity: $model",
    async ({ model, answer }) => {
      const fake = endpoint([answer])
      const response = await judge(fake.url, { ...cut, model }, [artifact])
      expect(response).toMatchObject({
        verdict: "pass",
        available: true,
        backend: `llm:${model}(votes:3/3)(truncated:large(no-verdict)(truncated:shadow(votes:9)).diff)`,
      })
      expect(response.reason.startsWith("3/3 passed")).toBe(true)
      expect(fake.seen.map((seen) => seen.body.model)).toEqual([model, model, model])
    },
  )

  test.each(MARKER_MODELS)("model alias markers cannot hide an empty reply: %s", async (model) => {
    const fake = endpoint([empty, tool("pass"), tool("pass")])
    expect(await judge(fake.url, { ...cut, model }, [artifact])).toMatchObject({
      verdict: "fail",
      available: false,
      backend: `llm:${model}(no-verdict)(truncated:large(no-verdict)(truncated:shadow(votes:9)).diff)`,
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
})

describe("errors abort the ballot", () => {
  test.each([
    [["pass"], "submit_verdict input must be an object"],
    ["pass", "submit_verdict input must be an object"],
    [1, "submit_verdict input must be an object"],
    [null, "submit_verdict input must be an object"],
    [{}, "submit_verdict verdict must be pass or fail"],
    [{ verdict: ["pass"], reason: "bad verdict type" }, "submit_verdict verdict must be pass or fail"],
    [{ verdict: "pass", reason: ["bad reason type"] }, "submit_verdict reason must be a string"],
    [{ verdict: "pass" }, "submit_verdict reason must be a string"],
  ])("malformed tool input %j", async (input, message) => {
    const call = { type: "tool_use", name: "submit_verdict", input }
    const fake = endpoint([{ content: [{ type: "text", text: "VERDICT: PASS" }, call] }, tool("pass")])
    expect(await judge(fake.url, cut, [big()])).toEqual({
      verdict: "fail",
      reason: `api error: ${message}`,
      backend: "api-error:test-model(truncated:big.diff)",
      available: false,
    })
    expect(fake.seen).toHaveLength(1)
  })

  test.each([
    [null, "response must be an object"],
    [[], "response must be an object"],
    [{ content: null }, "response content must be a list of objects"],
    [{ content: {} }, "response content must be a list of objects"],
    [{ content: [null] }, "response content must be a list of objects"],
    [{ content: [{ type: "text", text: null }] }, "sequence item 0: expected str instance, NoneType found"],
    [{ content: [{ type: "text", text: "a" }, { text: 1.5 }] }, "sequence item 1: expected str instance, float found"],
  ])("malformed response %j", async (reply, message) => {
    const fake = endpoint([reply, tool("pass")])
    expect(await judge(fake.url, { votes: 3 })).toEqual({
      verdict: "fail",
      reason: `api error: ${message}`,
      backend: "api-error:test-model",
      available: false,
    })
    expect(fake.seen).toHaveLength(1)
  })

  test("an HTTP error keeps the transport, the model and the truncation", async () => {
    const fake = endpoint([tool("pass")], 503)
    expect(await judge(fake.url, cut, [big()])).toEqual({
      verdict: "fail",
      reason: "api error: HTTP Error 503: Service Unavailable",
      backend: "api-error:test-model(truncated:big.diff)",
      available: false,
    })
    expect(fake.seen).toHaveLength(1)
  })

  // PARITY-EXCEPTIONS J1: urllib follows a 301-303 as a GET; the TS judge never follows a redirect with its key.
  test("a redirect is an HTTP error and is never followed", async () => {
    const target = endpoint([tool("pass")])
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response(null, { status: 302, headers: { location: `${target.url}v1/messages` } }),
    })
    servers.push(server)
    expect(await judge(server.url.href)).toMatchObject({ reason: "api error: HTTP Error 302: Found", available: false })
    expect(target.seen).toEqual([])
  })

  // PARITY-EXCEPTIONS J3: the message after `api error: ` is the runtime's, not CPython's `json` or urllib's.
  test("a body that is not JSON is an api error", async () => {
    const server = Bun.serve({ port: 0, fetch: () => new Response("not json") })
    servers.push(server)
    const response = await judge(server.url.href, cut, [big()])
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
