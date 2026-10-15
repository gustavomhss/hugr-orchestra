import { appendFile } from "node:fs/promises"
import path from "node:path"
import { Option, Schema } from "effect"
import { Replies } from "./actions-native-data"
import { githubTokenKeys, RunnerConfig } from "./actions-native-scope"

// Runs only as the disposable gh/glab executable. Importing scenarios never launches this program.
if (import.meta.main) {
  const directory = Bun.argv[2]
  const args = Bun.argv.slice(4)
  const fail = async (kind: string): Promise<never> => {
    // Never log stdin, argv, credentials, signed URLs or mutation values.
    await appendFile(path.join(directory, "fixture-errors.jsonl"), JSON.stringify({ kind }) + "\n")
    throw new Error(`ActionsFixtureError:${kind}`)
  }
  const decoded = Schema.decodeUnknownOption(Schema.fromJsonString(RunnerConfig), { onExcessProperty: "error" })(
    await Bun.file(path.join(directory, "runner-config.json")).text(),
  )
  const config = Option.isSome(decoded) ? decoded.value : await fail("invalid-runner-config")
  // GitLab-only scenarios exercise GitHub dispatcher refusal, never a fake GitLab execution.
  if (Bun.argv[3] !== "gh") await fail("gitlab-config-contract-unqualified")
  if (config.environment.GH_CONFIG_DIR !== path.join(directory, "config")) await fail("fixture-config-not-owned")
  // The wrapper's absolute fixture root must not substitute for the native command's real Location/config.
  const scope = {
    location: process.cwd() === config.directory,
    configDirectory: process.env.GH_CONFIG_DIR === config.environment.GH_CONFIG_DIR,
    configCredentials: config.credentialSelection === "config" && !Object.entries(process.env).some(([key, value]) =>
      githubTokenKeys.some((name) => name === key.toUpperCase()) && !!value),
  }
  if (!scope.location) await fail("location-cwd-mismatch")
  if (!scope.configDirectory) await fail("config-directory-mismatch")
  if (!scope.configCredentials) await fail("unapproved-ambient-token")
  if (args[0] !== "api" || args[args.indexOf("--hostname") + 1] !== "github.com" || args.at(-2) !== "--")
    await fail("unsupported-cli-invocation")
  const method = args[args.indexOf("--method") + 1]
  const url = new URL(`https://fixture.invalid/${args.at(-1)}`)
  url.searchParams.sort()
  const endpoint = url.pathname.slice(1) + url.search
  const routes = Schema.decodeUnknownSync(Schema.fromJsonString(Replies))(
    await Bun.file(path.join(directory, "replies.json")).text(),
  )
  const reply = routes[`${method} ${endpoint}`]
  if (!reply) await fail("unrecorded-native-endpoint")
  const selected = reply ?? await fail("missing-native-reply")
  if (args.includes("--input")) {
    const payload = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(await Bun.stdin.text())
    if (Option.isNone(payload)) await fail("invalid-native-json-stdin")
    if (Option.isSome(payload) && JSON.stringify(payload.value) !== JSON.stringify(selected.payload)) await fail("native-json-stdin-mismatch")
  }
  if (!args.includes("--input") && selected.payload !== undefined) await fail("missing-native-json-stdin")
  const metadata = args.includes("--include")
  await appendFile(path.join(directory, "calls.jsonl"), JSON.stringify({ method, endpoint, metadata, scope }) + "\n")
  if (metadata) {
    process.stdout.write(`HTTP/2.0 ${selected.status} Fixture\r\n`)
    Object.entries(selected.headers ?? {}).forEach(([key, value]) => process.stdout.write(`${key}: ${value}\r\n`))
    process.stdout.write("\r\n")
  }
  const output = selected.raw ?? (selected.data === undefined ? undefined : JSON.stringify(selected.data))
  if (output === undefined) await fail("native-response-body-missing")
  process.stdout.write(output ?? await fail("missing-output"))
  process.exit(selected.status >= 400 ? 1 : 0)
}
