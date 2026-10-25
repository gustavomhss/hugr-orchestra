// Actual product HTTP admission drives write/LSP, bash, MCP stdio and two terminals.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { BUN, FIXTURES, control, fakeLLM, fileTree, isolated, provider, table, until, win, writeConfig } from "@orchestra/omni-campaign/lib"

export async function fixtures() {
  const scratch = isolated("actual-desktop", {})
  const trees = { main: fileTree(scratch.home), shell: fileTree(scratch.home), terminal: fileTree(scratch.home), terminal2: fileTree(scratch.home), mcpTree: fileTree(scratch.home, 1) }
  const lspNonce = `desktop-lsp-${trees.main.nonce.slice(10)}`
  const mcpNonce = `desktop-mcp-${trees.main.nonce.slice(10)}`
  const llm = await fakeLLM([
    { name: "write", args: { filePath: "b.ts", content: "export const b = 2\n" } },
    { name: "bash", args: { command: win ? `& ${trees.shell.line}` : trees.shell.line, timeout: 600_000, description: "Hold actual desktop proof tree" } },
  ])
  const config = { plugin: [], formatter: false, share: "disabled", shell: win ? "powershell.exe" : "/bin/bash", model: "test/test-model",
    default_agent: "campaign", agent: { campaign: { mode: "primary", permission: { "*": "allow" } } },
    permission: { "*": "allow", bash: "allow", edit: "allow", external_directory: "allow" }, provider: provider(llm.url),
    lsp: { ...Object.fromEntries(["typescript", "deno", "eslint", "oxlint", "biome"].map((id) => [id, { disabled: true }])),
      campaign: { command: [BUN, path.join(FIXTURES, "lsp/fake-lsp-server.js"), lspNonce], extensions: [".ts"] } },
    // Only the project's Location reads this file, so the renderer's own default Location never starts a duplicate fixture peer.
    mcp: { campaign: { type: "local", command: [BUN, path.join(FIXTURES, "mcp-omni-stdio.ts"), mcpNonce],
      environment: { MCP_OMNI_TREE: JSON.stringify({ command: trees.mcpTree.command, args: trees.mcpTree.args }) }, timeout: 30_000 } } }
  writeConfig(scratch.project, config)
  const report = path.join(scratch.home, "smoke.json")
  const env: Record<string, string> = { ...scratch.env, ORCHESTRA_TEST_ONBOARDING: "1",
    ORCHESTRA_DB: ":memory:", ORCHESTRA_DISABLE_DEFAULT_PLUGINS: "1", ORCHESTRA_DESKTOP_OMNI_SMOKE: report,
    ORCHESTRA_DESKTOP_OMNI_SMOKE_NONCE: trees.main.nonce, ORCHESTRA_DESKTOP_OMNI_SMOKE_ARGV: JSON.stringify([trees.main.command, ...trees.main.args]) }
  delete env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER
  return { ...scratch, env, trees, lspNonce, mcpNonce, llm, report,
    specs: [...Object.entries(trees).map(([name, tree]) => ({ name, nonce: tree.nonce, size: tree.size })), { name: "lsp", nonce: lspNonce, size: 1 }, { name: "mcp", nonce: mcpNonce, size: 1 }] }
}

export type Report = { url: string; username: string; password: string; pid: number; utilityPID: number; quit: string; token: string;
  main: { pid: number; line: string; bytes: boolean }; packaged: boolean; resources: string; versions: { electron?: string; node?: string };
  home: string; db: string; nonce: string; userData: string }

export function events(report: string) {
  return existsSync(`${report}.events`) ? readFileSync(`${report}.events`, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { name: string; pid: number; at: number; code?: number; windows?: { visible: boolean }[]; displays?: unknown[] }) : []
}

export async function activate(scratch: Awaited<ReturnType<typeof fixtures>>, server: Report, skipTerminal2 = false) {
  const call = async <T>(method: string, route: string, body?: unknown): Promise<T> => {
    const url = new URL(route, server.url)
    url.searchParams.set("location[directory]", scratch.project)
    const response = await fetch(url, { method, headers: { authorization: `Basic ${Buffer.from(`${server.username}:${server.password}`).toString("base64")}`,
      "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${text.slice(0, 2000)}`)
    return (text ? JSON.parse(text) : undefined) as T
  }
  const session = (await call<{ data: { id: string } }>("POST", "/api/session", { agent: "campaign", model: { providerID: "test", id: "test-model" }, location: { directory: scratch.project } })).data
  // Answers NoContent once the server is connected (or failed, which the status poll below reports).
  await call("POST", "/api/mcp/campaign/connect")
  await call("POST", `/api/session/${session.id}/prompt`, { prompt: { text: "Write b.ts and hold bash tree." }, delivery: "steer", resume: true })
  const terminals = await Promise.all([scratch.trees.terminal, ...(skipTerminal2 ? [] : [scratch.trees.terminal2])].map(async (tree) =>
    (await call<{ data: { id: string; pid: number } }>("POST", "/api/pty", { command: tree.command, args: tree.args, cols: 100, rows: 30 })).data))
  const protocols = await until(90_000, "actual bash running, LSP/MCP connected, write persisted", async () => {
    const messages = (await call<{ data: { content?: { type: string; name?: string; state?: { status: string } }[] }[] }>("GET", `/api/session/${session.id}/message?order=asc&limit=200`)).data
    const lsp = (await call<{ data: { id: string; status: string }[] }>("GET", "/api/lsp")).data
    const mcp = (await call<{ data: { name: string; status: { status: string } }[] }>("GET", "/api/mcp")).data
    const running = messages.flatMap((message) => message.content ?? []).some((part) => part.type === "tool" && part.name === "bash" && part.state?.status === "running")
    return running && lsp.some((server) => server.id === "campaign" && server.status === "connected") && mcp.some((server) => server.name === "campaign" && server.status.status === "connected") &&
      existsSync(path.join(scratch.project, "b.ts")) && readFileSync(path.join(scratch.project, "b.ts"), "utf8") === "export const b = 2\n" ? { running, lsp, mcp, terminals, session } : undefined
  })
  writeFileSync(path.join(scratch.home, "protocols.json"), JSON.stringify(protocols))
  return protocols
}

export function controls(scratch: Awaited<ReturnType<typeof fixtures>>, main: Parameters<typeof control>[2][0], utility: Parameters<typeof control>[2][0], rows = table()) {
  return Object.fromEntries(scratch.specs.map((spec) => [spec.name, control(spec.nonce, spec.size, [spec.name === "main" ? main : utility], rows)]))
}
