// Subprocess protocol fixture, not a provider compatibility oracle.
import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"

const root = process.argv[2]
const name = process.argv[3]
const argv = process.argv.slice(4)
const reply = JSON.parse(await fs.readFile(path.join(root, "reply.json"), "utf8"))
const selected = reply.routes?.[argv.at(-1) ?? ""] ?? reply
if (argv[0] === "version") {
  process.stdout.write(reply.version ?? "glab 1.118.0 (570955d42)\n")
  process.exit(0)
}
if (argv[0] === "config") {
  await fs.appendFile(path.join(root, "config-calls.jsonl"), JSON.stringify({ argv }) + "\n")
  if (reply.configCode) { process.stderr.write("synthetic-credential diagnostic"); process.exit(reply.configCode) }
  process.stdout.write((reply.settings?.[argv[2]] ?? "") + (reply.settings?.[argv[2]] ? "\n" : ""))
  process.exit(0)
}
if (name === "glab") { process.stderr.write("GitLab fixture forbids API/auth network helpers"); process.exit(90) }
await fs.writeFile(path.join(root, "ready"), String(process.pid))

if (argv.includes("--help")) {
  process.stdout.write(reply.help ?? "--form Add multipart form field; use file=@- to read stdin\n")
  process.exitCode = reply.helpCode ?? 0
} else {
  const hash = createHash("sha256")
  const captured: Buffer[] = []
  const input = { size: 0, chunks: 0 }
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk)
    hash.update(bytes)
    if (input.size < 64 * 1024) captured.push(bytes.subarray(0, 64 * 1024 - input.size))
    input.size += bytes.length
    input.chunks++
  }
  await fs.appendFile(path.join(root, "calls.jsonl"), JSON.stringify({
    argv, stdin: Buffer.concat(captured).toString("base64"), size: input.size,
    digest: hash.digest("hex"), chunks: input.chunks, cwd: process.cwd(),
    env: Object.fromEntries(["GH_PROMPT_DISABLED", "GLAB_NO_PROMPT", "NO_COLOR", "GH_NO_UPDATE_NOTIFIER",
      "GLAB_CHECK_UPDATE", "GLAB_DEBUG_HTTP", "GH_DEBUG", "GITLAB_API_HOST", "GLAB_API_PROTOCOL", "GITLAB_SUBFOLDER"]
      .map((key) => [key, process.env[key]])),
  }) + "\n")
  const write = (stream: NodeJS.WriteStream, data: string | Buffer) => new Promise<void>((resolve, reject) => {
    stream.write(data, (error) => error ? reject(error) : resolve())
  })
  await Promise.all([
    (async () => {
      if (selected.binary) await write(process.stdout, Buffer.from(selected.binary, "base64"))
      if (selected.stdout) await write(process.stdout, selected.stdout)
      const block = Buffer.from(Array.from({ length: 16 * 1024 }, (_, index) => index % 256))
      for (let index = 0; index < (selected.blocks ?? 0); index++) await write(process.stdout, block)
      if (selected.padding) await write(process.stdout, " ".repeat(selected.padding))
    })(),
    write(process.stderr, selected.stderr ?? ""),
  ])
  if (selected.stdoutEOF) {
    await new Promise<void>((resolve) => process.stdout.end(resolve))
    await fs.writeFile(path.join(root, "stdout-eof"), "closed")
  }
  if (selected.hold) await new Promise(() => setInterval(() => {}, 60_000))
  process.exitCode = selected.code ?? 0
}
