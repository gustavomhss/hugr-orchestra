import { EOL } from "os"
import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"
import { Daemon } from "../../services/daemon"
import { clientUrl, fakeDaemon, stubServer, withCapturedStdout } from "./test-support"
import models from "./models"

const runWith = <A>(effect: Effect.Effect<A, unknown, Daemon.Service>, baseUrl: string) =>
  effect.pipe(Effect.provideService(Daemon.Service, fakeDaemon(baseUrl)), Effect.runPromise)

describe("models", () => {
  test("prints provider/model lines for every catalog model", async () => {
    const server = stubServer((request) => {
      if (request.method === "GET" && new URL(request.url).pathname === "/api/model")
        return Response.json(
          {
            location: { directory: "/work" },
            data: [
              { id: "gpt-4o", providerID: "openai", name: "GPT-4o" },
              { id: "claude-3-5-sonnet", providerID: "anthropic", name: "Claude 3.5 Sonnet" },
              { id: "gpt-4o-mini", providerID: "openai", name: "GPT-4o mini" },
            ],
          },
          { status: 200 },
        )
      return new Response("not found", { status: 404 })
    })
    try {
      const out = await withCapturedStdout(() => runWith(models({ provider: Option.none(), json: false }), clientUrl(server)))
      expect(out.trim().split(EOL)).toEqual([
        "anthropic/claude-3-5-sonnet",
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
      ])
    } finally {
      server.stop(true)
    }
  })

  test("filters by provider and rejects an unknown provider", async () => {
    const server = stubServer((request) => {
      if (request.method === "GET" && new URL(request.url).pathname === "/api/model")
        return Response.json(
          {
            location: { directory: "/work" },
            data: [
              { id: "gpt-4o", providerID: "openai", name: "GPT-4o" },
              { id: "claude-3-5-sonnet", providerID: "anthropic", name: "Claude 3.5 Sonnet" },
            ],
          },
          { status: 200 },
        )
      return new Response("not found", { status: 404 })
    })
    try {
      const filtered = await withCapturedStdout(() =>
        runWith(models({ provider: Option.some("openai"), json: false }), clientUrl(server)),
      )
      expect(filtered.trim().split("\n")).toEqual(["openai/gpt-4o"])
      await expect(runWith(models({ provider: Option.some("mistral"), json: false }), clientUrl(server))).rejects.toThrow(
        "Provider not found: mistral",
      )
    } finally {
      server.stop(true)
    }
  })

  test("emits raw records with --json", async () => {
    const server = stubServer((request) => {
      if (request.method === "GET" && new URL(request.url).pathname === "/api/model")
        return Response.json(
          {
            location: { directory: "/work" },
            data: [{ id: "gpt-4o", providerID: "openai", name: "GPT-4o" }],
          },
          { status: 200 },
        )
      return new Response("not found", { status: 404 })
    })
    try {
      const out = await withCapturedStdout(() => runWith(models({ provider: Option.none(), json: true }), clientUrl(server)))
      expect(JSON.parse(out)).toEqual([{ id: "gpt-4o", providerID: "openai", name: "GPT-4o" }])
    } finally {
      server.stop(true)
    }
  })
})