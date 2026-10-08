// V5: compiled Orchestra /mcp connects after 1 MiB stderr; last line in real debug logs and failure diagnostics.
// ORCHESTRA_LOCAL_TESTS=1 bun packages/omni/campaign/v5-mcp.ts [--mutation-legacy]
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { supervised, sweep, until, verdict } from "./lib.ts"
import { api, evidence, finalSweep, finish, fixture, hostLog, main, mcpFixture, processTable, start } from "./protocol-fixtures.ts"

export async function run(options: { mutation?: "legacy" } = {}) {
  const scratch = fixture("v5-mcp")
  const nonce = `omni-mcp-${randomUUID()}`
  const failureNonce = `${nonce}-failure`
  const metrics: Record<string, unknown> = {}
  let pass = false
  let error: string | undefined
  if (options.mutation === "legacy") scratch.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER = "0"
  try {
    processTable()
    const server = await start(scratch)
    const call = api(server.url, scratch.project)
    const before = Date.now()
    const connected = await call<Record<string, { status: string; error?: string }>>("POST", "/mcp", {
      name: "campaign", config: { type: "local", command: [scratch.node, mcpFixture(scratch, nonce), nonce], timeout: 10_000 },
    }, 25_000)
    metrics.connectMs = Date.now() - before
    metrics.connected = connected
    metrics.processTablePositive = (await sweep(nonce)).length
    metrics.supervised = supervised(nonce)
    if (connected.campaign?.status !== "connected") throw new Error(`MCP did not connect: ${JSON.stringify(connected)}`)
    const tools = await call<Record<string, string[]>>("GET", "/mcp/tools")
    metrics.tools = tools
    if (!tools.campaign?.includes("probe")) throw new Error("connected MCP did not list probe tool")
    const written = JSON.parse(readFileSync(path.join(scratch.home, `${nonce}.written.json`), "utf8")) as { bytes: number; marker: string; markerBytes: number }
    metrics.stderrBytesBeforeHandshake = written.bytes
    const lines = await until(10_000, "last stderr line in Orchestra debug log", () => {
      const rows = hostLog(scratch).split("\n").filter((line) => line.includes("MCP stderr"))
      return rows.some((line) => line.includes(`LAST-STDERR-${nonce}`)) ? rows : undefined
    })
    metrics.loggedStderrLines = lines.length
    metrics.lastLine = lines.find((line) => line.includes(`LAST-STDERR-${nonce}`))
    metrics.markerBytes = written.markerBytes
    metrics.uniqueMarkerLines = lines.filter((line) => line.endsWith(`line=${written.marker}`)).length
    metrics.handshakeRequests = readFileSync(path.join(scratch.home, `${nonce}.requests.jsonl`), "utf8")
    if (written.bytes !== 1024 * 1024 || written.marker !== `LAST-STDERR-${nonce}` ||
      written.markerBytes !== Buffer.byteLength(written.marker + "\n") || metrics.uniqueMarkerLines !== 1 ||
      !lines.at(-1)?.endsWith(`line=${written.marker}`) || !metrics.supervised || Number(metrics.processTablePositive) < 1)
      throw new Error("MCP payload/supervision positive control failed")
    const failed = await call<Record<string, { status: string; error?: string }>>("POST", "/mcp", {
      name: "failure", config: { type: "local", command: [scratch.node, mcpFixture(scratch, failureNonce, true), failureNonce], timeout: 10_000 },
    }, 25_000)
    metrics.failureDiagnostics = { status: failed.failure?.status, tail: failed.failure?.error?.slice(-350) }
    if (failed.failure?.status !== "failed" || !failed.failure.error?.includes(`LAST-STDERR-${failureNonce}`))
      throw new Error(`last stderr line absent from failed-connect diagnostics: ${JSON.stringify(failed.failure)}`)
    await call("POST", "/mcp/campaign/disconnect", {})
    await until(8_000, "MCP process gone after disconnect", async () => (await sweep(nonce)).length === 0 ? true : undefined)
    metrics.leftovers = (await sweep(nonce)).length
    pass = true
  } catch (cause) {
    error = String(cause)
  } finally {
    // Record leftovers before emergency cleanup; cleanup never changes a verdict to green.
    try { metrics.beforeCleanup = await finalSweep(nonce) }
    catch (cause) { pass = false; error = `${error ?? ""} oracle: ${String(cause)}` }
    finally { await finish(scratch).catch((cause) => { pass = false; error = `${error ?? ""} teardown: ${String(cause)}` }) }
  }
  const result = verdict("v5-mcp", { ...evidence(scratch), mutation: options.mutation ?? null, pass,
    status: pass ? "passed-local" : "failed-local", error, metrics,
    capability: { transport: "real Orchestra stdio MCP via compiled CLI", stderr: "1 MiB before initialize", skipped: [] },
  })
  return { ...result, pass }
}

if (main(import.meta.url)) {
  const result = await run(process.argv.includes("--mutation-legacy") ? { mutation: "legacy" } : {})
  process.exitCode = result.pass ? 0 : 1
}
