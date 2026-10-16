#!/usr/bin/env bun
// Owner-machine driver for the Atlas → Relay live proof (specs/maestro-live-proof/RUNBOOK.md).
// It starts Orchestra from this checkout against an existing Atlas fixture, drives one Maestro Session over HTTP,
// pauses for the owner's own `aprovo`, and stops at the first HOLD/error with the evidence printed and saved.
//
//   export OPENROUTER_API_KEY=...            (never written to disk by this script)
//   bun script/live-proof.ts <fixture-dir> <step>
//
// Steps, in order: preflight, author, publish, plan, approve, report. State (Session ID, document) is kept in
// $LIVE_PROOF_OUT (default ~/orchestra-live-proof) so each step can be rerun after a fix.
import path from "node:path"
import os from "node:os"
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { randomBytes } from "node:crypto"
import { $ } from "bun"

const MODEL = process.env.LIVE_PROOF_MODEL ?? "thinkingmachines/inkling:free"
const WRITE_PATHS: string[] = JSON.parse(process.env.LIVE_PROOF_WRITE_PATHS ?? '["src/money.ts","src/checkout.ts"]')
const repo = path.resolve(import.meta.dir, "..")
const fixture = path.resolve(process.argv[2] ?? "")
const step = process.argv[3] ?? "preflight"
const out = process.env.LIVE_PROOF_OUT ?? path.join(os.homedir(), "orchestra-live-proof")
const statePath = path.join(out, "state.json")
mkdirSync(out, { recursive: true })
const state: Record<string, any> = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {}
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2))
const key = process.env.OPENROUTER_API_KEY ?? ""

function stop(message: string): never {
  console.error(`\nSTOP: ${message}\nPaste this output back to the Maestro session.`)
  process.exit(1)
}

if (!process.argv[2] || !existsSync(path.join(fixture, ".git"))) stop("usage: bun script/live-proof.ts <fixture git dir> <step>")
if (!key) stop("export OPENROUTER_API_KEY first (it is read from the environment only)")

const steps: Record<string, () => Promise<void>> = { preflight, author, publish, plan, approve, report }
if (!steps[step]) stop(`unknown step ${step}; use one of ${Object.keys(steps).join(", ")}`)
await steps[step]()
process.exit(0)

// ---------- steps ----------

async function preflight() {
  // The governed-chain fixes (#656) must be in the code under test.
  if ((await $`git -C ${repo} merge-base --is-ancestor 27cce3a4 HEAD`.nothrow().quiet()).exitCode !== 0)
    stop("this checkout lacks dev 27cce3a4 (#656); git pull origin dev first")
  const dirty = (await $`git -C ${fixture} status --porcelain`.text()).trim()
  if (dirty) stop(`fixture tree is not clean:\n${dirty}`)
  const config = path.join(fixture, "orchestra.json")
  const atlas = existsSync(config) ? JSON.parse(readFileSync(config, "utf8")).maestro?.atlas : undefined
  if (!atlas) stop("fixture orchestra.json has no maestro.atlas; this is not the ratified Atlas fixture")
  console.log(`fixture ${fixture}\n  HEAD ${(await $`git -C ${fixture} rev-parse HEAD`.text()).trim()}\n  atlas ${JSON.stringify(atlas)}`)
  const origin = await $`git -C ${fixture} rev-parse --verify origin/dev`.nothrow().quiet()
  if (origin.exitCode !== 0) stop("fixture has no origin/dev; the validation review base needs it (see the last run)")

  const models = (await (await fetch("https://openrouter.ai/api/v1/models")).json()) as { data: { id: string; supported_parameters?: string[] }[] }
  const found = models.data.find((model) => model.id === MODEL)
  if (!found) stop(`OpenRouter has no model ${MODEL}; inkling ids: ${models.data.filter((m) => /inkling/i.test(m.id)).map((m) => m.id).join(", ") || "none"}`)
  if (!found.supported_parameters?.includes("tools")) stop(`${MODEL} does not advertise tool calling on OpenRouter`)
  const probe = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 16, messages: [{ role: "user", content: "Reply with exactly: TRANSPORT_OK" }] }),
  })
  const text = await probe.text()
  if (!probe.ok) stop(`OpenRouter probe HTTP ${probe.status}: ${text.slice(0, 400)}`)
  console.log(`model ${MODEL}: HTTP ${probe.status} ${JSON.parse(text).choices?.[0]?.message?.content ?? ""}`)
  console.log("\nPREFLIGHT OK. Next: author")
}

async function author() {
  await withServer(async (api) => {
    const session = await api("POST", "/session", { title: "live proof: Maestro", agent: "maestro" })
    state.sessionID = session.id
    save()
    const brief = process.env.LIVE_PROOF_DEMAND ? readFileSync(process.env.LIVE_PROOF_DEMAND, "utf8") : DEFAULT_BRIEF
    await turn(api, [
      "Dispatch exactly one foreground `task` to subagent_type `archie` with writePaths [\"proposal.md\"] and the prompt between the markers, byte for byte.",
      "Do nothing else: no admission, plan, review or approval yet. When the task returns, report its terminal state and blockers and end the turn.",
      "<<<BRIEF", brief, "BRIEF>>>",
    ].join("\n"))
    const task = (await toolParts(api)).findLast((part) => part.tool === "task")
    if (!task || task.state.status !== "completed") stop("the archie task did not complete; see the transcript above")
    if (!existsSync(path.join(fixture, "proposal.md"))) stop("archie did not write proposal.md")
    await $`git -C ${fixture} add proposal.md`.quiet()
    await $`git -C ${fixture} commit -q -m ${"proposal: archie live proof"}`.quiet()
    console.log("\nAUTHOR OK (proposal.md committed in the fixture). Next: publish")
  })
}

async function publish() {
  // The proposal carries the native Relay document as one ```json block with nodes/connections.
  const proposal = readFileSync(path.join(fixture, "proposal.md"), "utf8")
  const block = [...proposal.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]).find((body) => /"nodes"\s*:/.test(body))
  if (!block) stop("proposal.md has no ```json block with a native Relay document (nodes/connections)")
  const document = JSON.parse(block)
  await withServer(async (api) => {
    const fields = Object.fromEntries(Object.entries(document).filter(([name]) =>
      ["name", "description", "nodes", "connections", "nodeGroups", "tags", "meta", "isArchived"].includes(name)))
    const created = (await api("POST", "/api/relay/document", fields)).data
    console.log(`created ${created.id} version ${created.versionId}`)
    await api("POST", `/api/relay/document/${created.id}/publish`, { versionId: created.versionId })
    state.documentID = created.id
    save()
    console.log(`\nPUBLISH OK: document ${created.id}. Next: plan`)
  })
}

async function plan() {
  if (!state.sessionID || !state.documentID) stop("run author and publish first")
  await withServer(async (api) => {
    await turn(api, [
      "Record the governed chain for the archie proposal in this Session, in this order, stopping at the first HOLD and quoting it exactly:",
      "1. maestro_record_admission for the original request.",
      "2. maestro_catalog_context.",
      "3. maestro_record_plan_revision with `upstream` taken from your own archie task call in this Session (parentMessageID, parentCallID, authorSessionID, authorMessageID, logicalTaskID)",
      `   and workflow ${JSON.stringify({ documentID: state.documentID, parameters: {}, writePaths: WRITE_PATHS })}.`,
      "4. maestro_record_context, 5. maestro_record_validation, 6. maestro_request_review.",
      "Do not present approval yet. End the turn with each Bindings line you received.",
    ].join("\n"))
    console.log("\nIf the review is APPROVE, next: approve. On FIX_FIRST, paste the output back.")
  })
}

async function approve() {
  if (!state.sessionID) stop("run the earlier steps first")
  state.methodVersion = (state.methodVersion ?? 0) + 1
  save()
  await withServer(async (api) => {
    // The whole tail is pre-loaded here: no message may sit between the presentation and the owner's approve.
    await turn(api, [
      `Call maestro_present_approval for the reviewed plan with methodVersion request-approval-v${state.methodVersion}, intent subagentType \`backend\`, and end the turn.`,
      "When my next message is exactly `aprovo`, in that same turn and without asking anything:",
      "maestro_record_approval; maestro_grant_authorization with its approvalMessageID;",
      "maestro_arsenal_describe relay-arm, then maestro_arsenal_execute relay-arm action arm with contract.sessionID = this Session;",
      `then task with the presented subagent_type, prompt and model byte for byte, the authorizationID, workflow {documentID, planRevisionID, parameters} and writePaths exactly ${JSON.stringify(WRITE_PATHS)}.`,
      "Stop at the first HOLD and quote it exactly.",
    ].join("\n"))
    const presented = (await toolParts(api)).findLast((part) => part.tool === "maestro_present_approval")
    if (presented?.state.status !== "completed") stop("no completed presentation; nothing to approve")
    console.log("\nThe presentation is above. Type exactly `aprovo` to approve, anything else to stop:")
    const answer = (prompt("> ") ?? "").trim()
    if (answer !== "aprovo") stop("not approved; nothing was sent")
    await turn(api, "aprovo")
    console.log("\nAPPROVE STEP DONE. Next: report")
  })
}

async function report() {
  if (!state.sessionID) stop("nothing to report")
  await withServer(async (api) => {
    await dump(api, Infinity)
    console.log(`\nfull JSON: ${path.join(out, "messages.json")}`)
  })
}

// ---------- server and session plumbing ----------

async function withServer(body: (api: Api) => Promise<void>) {
  const password = randomBytes(16).toString("hex")
  const config = {
    model: `openrouter/${MODEL}`,
    small_model: `openrouter/${MODEL}`,
    provider: { openrouter: { options: { apiKey: "{env:OPENROUTER_API_KEY}" }, models: { [MODEL]: { tool_call: true } } } },
    agent: Object.fromEntries(["maestro", "archie", "lucy", "backend"].map((id) => [id, { model: `openrouter/${MODEL}` }])),
  }
  const server = Bun.spawn(["bun", "run", path.join(repo, "packages/orchestra/src/index.ts"), "serve", "--port", "0", "--hostname", "127.0.0.1"], {
    cwd: fixture,
    env: { ...process.env, ORCHESTRA_SERVER_PASSWORD: password, ORCHESTRA_CONFIG_CONTENT: JSON.stringify(config),
      XDG_DATA_HOME: path.join(out, "data") },
    // Both streams go to files so the server never blocks or breaks on an unread pipe.
    stdout: Bun.file(path.join(out, "server.out")),
    stderr: Bun.file(path.join(out, "server.log")),
  })
  const base = await listening(path.join(out, "server.out"))
  const auth = `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}`
  const api: Api = async (method, route, body) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { authorization: auth, "content-type": "application/json", "x-orchestra-directory": encodeURIComponent(fixture) },
      body: body === undefined ? undefined : JSON.stringify(body),
      // The first request boots the project instance, which can take minutes.
      timeout: false,
    })
    const text = await response.text()
    if (!response.ok) stop(`${method} ${route} → HTTP ${response.status}: ${text.slice(0, 1500)}`)
    return text ? JSON.parse(text) : undefined
  }
  try {
    await body(api)
  } finally {
    server.kill()
  }
}
type Api = (method: string, route: string, body?: unknown) => Promise<any>

async function listening(file: string) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    await Bun.sleep(500)
    const match = existsSync(file) ? /listening on (http:\/\/\S+)/.exec(readFileSync(file, "utf8")) : null
    if (match) return match[1]
  }
  stop(`server did not start; see ${path.join(out, "server.log")}`)
}

// Sends one prompt, answers permission asks with the owner, waits for idle, then prints what happened in that turn.
async function turn(api: Api, text: string) {
  const before = (await api("GET", `/session/${state.sessionID}/message`)).length
  await api("POST", `/session/${state.sessionID}/prompt_async`, { agent: "maestro", parts: [{ type: "text", text }] })
  const started = Date.now()
  for (;;) {
    await Bun.sleep(3000)
    for (const ask of await api("GET", "/permission")) {
      if (ask.sessionID !== state.sessionID && !(await isChild(api, ask.sessionID))) continue
      console.log(`\nPERMISSION ${ask.permission} ${ask.patterns.join(" ")}`)
      const reply = (prompt("allow once? [y/N] ") ?? "").trim().toLowerCase() === "y" ? "once" : "reject"
      await api("POST", `/permission/${ask.id}/reply`, { reply })
    }
    const status = await api("GET", "/session/status")
    const busy = Object.entries(status).some(([, value]) => (value as { type: string }).type !== "idle")
    if (!busy && Date.now() - started > 8000) break
    if (Date.now() - started > 45 * 60_000) stop("turn ran over 45 minutes")
  }
  await dump(api, before)
}

async function isChild(api: Api, sessionID: string) {
  const session = await api("GET", `/session/${sessionID}`)
  return session.parentID === state.sessionID
}

async function toolParts(api: Api) {
  const messages = await api("GET", `/session/${state.sessionID}/message`)
  return messages.flatMap((message: any) => message.parts.filter((part: any) => part.type === "tool"))
}

async function dump(api: Api, from: number) {
  const messages = await api("GET", `/session/${state.sessionID}/message`)
  writeFileSync(path.join(out, "messages.json"), JSON.stringify(messages, null, 2))
  for (const message of messages.slice(Number.isFinite(from) ? from : 0)) {
    console.log(`\n── ${message.info.role} ${message.info.id}`)
    for (const part of message.parts) {
      if (part.type === "text" && part.text.trim()) console.log(clip(part.text, 1500))
      if (part.type !== "tool") continue
      const result = part.state.status === "error" ? `ERROR ${part.state.error}` : part.state.output ?? ""
      console.log(`  [${part.tool}] ${part.state.status}\n    ${clip(String(result), 1200).replaceAll("\n", "\n    ")}`)
    }
  }
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)} …(${text.length - max} more)` : text
}

const DEFAULT_BRIEF = `Proposal only: write proposal.md and nothing else.
Read the Atlas context yourself (atlas_context catalog first, then the units you choose) and load archie-work-package.
Propose making money handling exact: src/money.ts converts a decimal amount to integer cents without floating-point loss
(non-finite and fractional-cent inputs are explicit errors), and src/checkout.ts totals integer cents exactly.
Shape it as one linear work package with two relay.execute steps and disjoint write scopes: step 1 writes only
src/money.ts, step 2 writes only src/checkout.ts and is revealed only after step 1 settles.
Include the native Relay authoring document as exactly one \`\`\`json code block with nodes and connections
(a relay.startTrigger node plus the two relay.execute nodes), checklist items as objects with unique ids.
List every unknown; leave none for the owner to resolve silently.`
