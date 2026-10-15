// Real stdio MCP peer for testing backend envelopes through the existing client.
import { appendFileSync } from "node:fs"

const mode = process.argv[2]
const marker = process.argv[3]
const secret = "private backend detail /secret/path token=private"
const error = mode?.endsWith("object")
  ? { message: secret }
  : mode?.endsWith("array")
    ? [secret]
    : mode?.endsWith("zero")
      ? 0
      : secret
const envelope = mode?.includes("envelope-ok")
  ? { ok: true, code: mode.includes("ok-code") ? "target-exists" : null, what_happened: secret, result: { files_written: [secret] } }
  : mode?.includes("coded")
  ? { ok: false, code: mode.includes("bad-coded") ? secret : "target-exists", what_happened: secret }
  : mode?.includes("error")
    ? { error }
    : { ok: false, error: secret }
// Canonical `hugr-owned-tool-v1` envelopes as the Composer emits them: the legacy fields stay, with free text that must
// never cross, plus the canonical fields. `kind` selects the case; `tool` follows the called backend tool.
const toolOf = (backend: string | undefined) => (backend === "fastapi_meta_scaffold" ? "hugr-scaffold" : "hugr-compose")
const created = (...paths: string[]) => paths.map((path) => ({ path, change: "created" }))
function canonical(kind: string, backend: string | undefined) {
  const tool = toolOf(backend)
  const base = { schema: "hugr-owned-tool-v1", tool, observed_changes: [], mode: "ad_hoc", artifact_kind: "skeleton" }
  const legacy = (ok: boolean, code: string | null) => ({ ok, code, what_happened: secret, result: { files_written: [secret] }, next_steps: [secret] })
  const generated = {
    ...legacy(true, null),
    ...base,
    status: "generated",
    effects: "observed",
    observed_changes: [...created("app/", "app/compositions/"), ...created("app/compositions/x.py", "app/compositions/__init__.py")],
  }
  const cases: Record<string, unknown> = {
    generated,
    previewed: { ...legacy(true, null), ...base, status: "previewed", effects: "none", artifacts: [{ kind: "source", path: "app/x.py", content: secret }], planned_files: ["app/x.py"] },
    blocked: { ...legacy(false, "target-exists"), ...base, status: "blocked", effects: "none", error: { code: "OUTPUT_CONFLICT", producer_code: "target-exists" } },
    // The Composer sends Python None as null: an absent `producer_code` or `mode` arrives as an explicit null.
    "blocked-delegate": { ...legacy(true, null), ...base, mode: "tool_delegate", artifact_kind: null, status: "blocked", effects: "none", error: { code: "UNSUPPORTED_OUTPUT", producer_code: null } },
    "blocked-pre-mode": { ...legacy(false, "missing-selection"), ...base, mode: null, artifact_kind: null, status: "blocked", effects: "none", error: { code: "INVALID_INPUT", producer_code: "missing-selection" } },
    partial: { ...legacy(false, "scaffold-failed"), ...base, status: "failed", effects: "partial", observed_changes: created("half.py"), error: { code: "PRODUCER_FAILED", producer_code: "scaffold-failed" } },
    "newer-code": { ...legacy(false, "scaffold-failed"), ...base, status: "blocked", effects: "none", error: { code: "INVALID_INPUT", producer_code: secret } },
    "illegal-effects": { ...generated, effects: "none" },
    "illegal-code": { ...generated, error: { code: "PRODUCER_FAILED" } },
    "empty-inventory": { ...generated, observed_changes: [] },
    "dirs-only": { ...generated, observed_changes: created("app/", "app/compositions/") },
    escape: { ...generated, observed_changes: created("../outside.py") },
    // One entry over MAX_OBSERVED_CHANGES: a larger inventory is not trusted as complete.
    oversize: { ...generated, observed_changes: created(...Array.from({ length: 5001 }, (_, index) => `app/f${index}.py`)) },
    absolute: { ...generated, observed_changes: created("/etc/passwd") },
    "unknown-status": { ...generated, status: "done" },
    "wrong-tool": { ...generated, tool: tool === "hugr-compose" ? "hugr-scaffold" : "hugr-compose" },
    "ok-false": { ...generated, ok: false },
    "excess-free-text": { ...generated, error: undefined, mode: secret },
  }
  return cases[kind]
}
const canonKind = mode?.includes("canon-") ? mode.slice(mode.indexOf("canon-") + "canon-".length) : undefined
// A Composer before the canonical envelope: ok:true for a material-less delegation (F4.24).
const delegateLegacy = { ok: true, code: null, what_happened: secret, result: { mode: "tool_delegate", delegate_tool: secret, files_written: [] } }
const success = {
  success: false,
  data: { error: secret, errors: [secret], ok: false, success: false },
}
const state = { buffer: "" }
process.stdin.setEncoding("utf8")
process.stdin.on("end", () => process.exit(0))
process.stdin.on("data", (chunk: string) => {
  state.buffer += chunk
  const complete = state.buffer.split("\n")
  state.buffer = complete.pop() ?? ""
  complete
    .filter((line) => line.trim())
    .forEach((line) => {
      const request = JSON.parse(line) as { id?: number; method: string; params?: { protocolVersion?: string; name?: string } }
      if (marker && ["initialize", "tools/call"].includes(request.method)) {
        appendFileSync(marker, request.method + "\n")
      }
      if (request.method === "initialize") {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: {
              protocolVersion: request.params?.protocolVersion ?? "2025-06-18",
              capabilities: { tools: {} },
              serverInfo: { name: "composer-envelope", version: "1" },
            },
          }) + "\n",
        )
        return
      }
      if (request.method !== "tools/call") return
      if (mode === "disconnect") process.exit(0)
      const backend = request.params?.name
      const payload = canonKind
        ? canonical(canonKind, backend)
        : mode?.includes("legacy-delegate")
          ? delegateLegacy
          : mode?.includes("success")
        ? success
        : mode?.startsWith("empty-")
          ? { error: JSON.parse(mode.slice("empty-".length)), data: "ok" }
          : envelope
      const result =
        mode === "flagged"
          ? { isError: true, content: [{ type: "text", text: secret }] }
          : mode?.startsWith("structured") || mode?.startsWith("empty-")
            ? { content: [{ type: "text", text: "result" }], structuredContent: payload }
            : { content: [{ type: "text", text: mode === "plain" ? "ok" : JSON.stringify(payload) }] }
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n")
    })
})
