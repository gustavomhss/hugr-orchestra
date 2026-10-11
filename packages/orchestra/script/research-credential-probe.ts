// Read-only pilot prerequisite probe. Never prints, persists, refreshes or updates credential values.
import os from "node:os"
import path from "node:path"
import { Effect, Option, Schema } from "effect"
import { Credential } from "@orchestra/core/credential"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Auth } from "../src/auth"

// Claude mode reads no credential: the Claude Agent SDK owns the machine's Claude Code login and Zen's key is public.
if (process.argv.includes("--engine")) {
  if (process.argv.slice(2).join(" ") !== "--engine claude-code") throw new Error("Usage: research-credential-probe [--models] | --engine claude-code")
  console.log(JSON.stringify({ engine: "claude-code", model: "anthropic/claude-opus-5-5", parentModel: "opencode/big-pickle",
    credentials: "not-read; the Claude Agent SDK authenticates with the machine's Claude Code login" }))
  process.exit(0)
}
// Preserve the historical OAuth directory and probe source identity.
const legacyName = ["open", "code"].join("")
const Legacy = Schema.Struct({ openai: Auth.Oauth })
const rows = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const credentials = yield* Credential.Service
  return (yield* credentials.all()).filter((credential) => credential.integrationID === "openai").map((credential) => ({
    source: "native-credential", type: credential.value.type,
    ...(credential.value.type === "oauth" ? { expires: credential.value.expires } : {}),
  }))
}).pipe(Effect.provide(AppNodeBuilder.build(Credential.node)))))
const legacy = await Bun.file(path.join(os.homedir(), ".local/share", legacyName, "auth.json")).json().then(
  (value: unknown) => Option.getOrUndefined(Schema.decodeUnknownOption(Legacy)(value)), () => undefined,
)
const native = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const auth = yield* Auth.Service
  const value = yield* auth.get("openai")
  return value ? { source: "orchestra-auth", type: value.type, ...(value.type === "oauth" ? { expires: value.expires } : {}) } : undefined
}).pipe(Effect.provide(AppNodeBuilder.build(Auth.node)))))
console.log(JSON.stringify({ credentials: [...rows, ...(native ? [native] : []), ...(legacy ? [{ source: `${legacyName}-auth`, type: "oauth", expires: legacy.openai.expires }] : [])] }))
if (process.argv.includes("--models")) {
  if (!legacy || legacy.openai.expires <= Date.now() + 60_000) throw new Error("Read-only OpenAI OAuth is unavailable or needs owner refresh")
  const child = Bun.spawn([process.execPath, "./src/index.ts", "models", "openai", "--pure"], {
    cwd: path.resolve(import.meta.dir, ".."), stdout: "inherit", stderr: "inherit",
    env: { ...process.env, ORCHESTRA_AUTH_CONTENT: JSON.stringify({ openai: legacy.openai }) },
  })
  process.exitCode = await child.exited
}
