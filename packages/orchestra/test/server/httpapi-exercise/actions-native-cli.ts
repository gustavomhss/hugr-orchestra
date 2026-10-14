import { appendFile } from "node:fs/promises"
import path from "node:path"
import { Schema } from "effect"
import { Replies } from "./actions-native-data"

// Runs only as the disposable gh/glab executable. Importing scenarios never launches this program.
if (import.meta.main) {
  const directory = Bun.argv[2]
  const args = Bun.argv.slice(3)
  const fail = async (kind: string): Promise<never> => {
    // Never log stdin, argv, credentials, signed URLs or mutation values.
    await appendFile(path.join(directory, "fixture-errors.jsonl"), JSON.stringify({ kind }) + "\n")
    throw new Error(`ActionsFixtureError:${kind}`)
  }
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
    const payload = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(await Bun.stdin.text())
    if (JSON.stringify(payload) !== JSON.stringify(selected.payload)) await fail("native-json-stdin-mismatch")
  }
  if (!args.includes("--input") && selected.payload !== undefined) await fail("missing-native-json-stdin")
  const metadata = args.includes("--include")
  await appendFile(path.join(directory, "calls.jsonl"), JSON.stringify({ method, endpoint, metadata }) + "\n")
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
