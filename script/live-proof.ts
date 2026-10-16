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
import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { randomBytes } from "node:crypto"
import { $ } from "bun"

const MODEL = process.env.LIVE_PROOF_MODEL ?? "thinkingmachines/inkling:free"
// preflight stores the model that actually answered; later steps use it.
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
  // Archie's atlas_context anchor and Relay knowledge consumption land with #658.
  if (!existsSync(path.join(repo, "packages/orchestra/src/maestro/atlas-knowledge.ts")))
    stop("this checkout lacks the Archie Atlas anchors (#658); use a checkout that contains it")
  const dirty = (await $`git -C ${fixture} status --porcelain`.text()).trim()
  if (dirty) stop(`fixture tree is not clean:\n${dirty}`)
  const config = path.join(fixture, "orchestra.json")
  const atlas = existsSync(config) ? JSON.parse(readFileSync(config, "utf8")).maestro?.atlas : undefined
  if (!atlas) stop("fixture orchestra.json has no maestro.atlas; this is not the ratified Atlas fixture")
  console.log(`fixture ${fixture}\n  HEAD ${(await $`git -C ${fixture} rev-parse HEAD`.text()).trim()}\n  atlas ${JSON.stringify(atlas)}`)
  const origin = await $`git -C ${fixture} rev-parse --verify origin/dev`.nothrow().quiet()
  if (origin.exitCode !== 0) stop("fixture has no origin/dev; the validation review base needs it (see the last run)")

  // Free models can be gated to listed agent apps. Probe as Orchestra identifies itself (provider.ts: X-Title
  // "Orchestra"), never as another app, and keep the first model that answers.
  const models = (await (await fetch("https://openrouter.ai/api/v1/models")).json()) as { data: { id: string; supported_parameters?: string[] }[] }
  const candidates = [MODEL, ...models.data.filter((model) => model.id.endsWith(":free") &&
    model.supported_parameters?.includes("tools")).map((model) => model.id)].filter((id, index, all) => all.indexOf(id) === index)
  // One at a time, stopping at the first that calls the tool: the free tier allows few requests per minute.
  const chosen = await candidates.reduce<Promise<string | undefined>>(async (previous, id) => {
    const found = await previous
    if (found) return found
    const probe = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "X-Title": "Orchestra" },
      // Orchestra tools take nested objects and arrays, and stored calls are re-read later, so a model that sends them
      // as JSON text fails the governed chain even if one tool tolerates it.
      body: JSON.stringify({ model: id, max_tokens: 512, tool_choice: "required",
        tools: [{ type: "function", function: { name: "ok", description: "Confirm", parameters: { type: "object",
          properties: { target: { type: "object", properties: { kind: { type: "string" } }, required: ["kind"] },
            units: { type: "array", items: { type: "string" } } }, required: ["target", "units"] } } }],
        messages: [{ role: "user", content: 'Call the ok tool with target.kind = "x" and units = ["a"].' }] }),
    }).catch((error: Error) => new Response(error.message, { status: 599 }))
    const body = await probe.text()
    const called = probe.ok && nestedArguments(body)
    console.log(`  ${called ? "OK " : "no "} ${id}: HTTP ${probe.status}${called ? "" : ` ${body.slice(0, 160).replaceAll("\n", " ")}`}`)
    if (!called) await Bun.sleep(3500)
    return called ? id : undefined
  }, Promise.resolve(undefined))
  if (!chosen) stop("no free OpenRouter model answered a tool call for Orchestra; a paid model or another provider is needed")
  state.model = chosen
  save()
  console.log(`model chosen: ${chosen} (override with LIVE_PROOF_MODEL)`)
  console.log("\nPREFLIGHT OK. Next: author")
}

// The proposal's single ```json block holding nodes; a parse failure is reported with the parser's own message.
function relayBlock(proposal: string): { ok: true; document: any } | { ok: false; error: string } {
  const body = [...proposal.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]).find((text) => /"nodes"\s*:/.test(text))
  if (!body) return { ok: false, error: "no ```json block with nodes" }
  try {
    return { ok: true, document: JSON.parse(body) }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

function nestedArguments(body: string) {
  const call = JSON.parse(body).choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
  const args = typeof call === "string" ? (() => { try { return JSON.parse(call) } catch { return undefined } })() : undefined
  return typeof args?.target === "object" && args.target !== null && !Array.isArray(args.target) && Array.isArray(args.units)
}

async function author() {
  await withServer(async (api) => {
    const session = await api("POST", "/session", { title: "live proof: Maestro", agent: "maestro" })
    // readAtlasSource holds provider-project-mismatch on exactly this comparison. The ID comes from the origin URL
    // (else the root commit), and TERRITORY-CATALOG.json is published for it, so editing orchestra.json alone is not a fix.
    const atlas = JSON.parse(readFileSync(path.join(fixture, "orchestra.json"), "utf8")).maestro.atlas
    if (atlas.projectID !== session.projectID)
      stop(`maestro.atlas.projectID ${atlas.projectID} is not this fixture's project ${session.projectID}; re-publish the Atlas catalog and snapshot for ${session.projectID} with the Atlas producer, commit, and rerun`)
    state.sessionID = session.id
    save()
    const brief = process.env.LIVE_PROOF_DEMAND ? readFileSync(process.env.LIVE_PROOF_DEMAND, "utf8") : defaultBrief()
    await turn(api, [
      "Dispatch exactly one foreground `task` to subagent_type `archie` with writePaths [\"proposal.md\"] and the prompt between the markers, byte for byte.",
      "Do nothing else: no admission, plan, review or approval yet. When the task returns, report its terminal state and blockers and end the turn.",
      "<<<BRIEF", brief, "BRIEF>>>",
    ].join("\n"))
    // As in ordinary use, Archie gets the exact problem back and fixes its own proposal, at most twice.
    for (const attempt of [1, 2, 3]) {
      const task = (await toolParts(api)).findLast((part) => part.tool === "task")
      if (!task || task.state.status !== "completed") stop("the archie task did not complete; see the transcript above")
      const file = path.join(fixture, "proposal.md")
      const block = existsSync(file) ? relayBlock(readFileSync(file, "utf8")) : { ok: false as const, error: "proposal.md does not exist on disk" }
      if (block.ok) break
      if (attempt === 3) stop(`proposal.md has no parseable native Relay document after two corrections: ${block.error}`)
      console.log(`\ncorrection ${attempt}: ${block.error}`)
      await turn(api, [
        `Resume the same archie task with task_id ${task.state.metadata?.sessionId} (foreground, writePaths ["proposal.md"]) and this prompt, byte for byte:`,
        "<<<FIX",
        `The host read proposal.md and found: ${block.error}. Rewrite proposal.md with the write tool so its single \`\`\`json block parses with JSON.parse and follows the exact shape from the brief. Keep the rest of the proposal.`,
        "FIX>>>",
        "Do nothing else. When it returns, report its terminal state and end the turn.",
      ].join("\n"))
    }
    await $`git -C ${fixture} add proposal.md`.quiet()
    await $`git -C ${fixture} commit -q -m ${"proposal: archie live proof"}`.quiet()
    console.log("\nAUTHOR OK (proposal.md committed in the fixture). Next: publish")
  })
}

async function publish() {
  // The proposal carries the native Relay document as one ```json block with nodes/connections.
  const block = relayBlock(readFileSync(path.join(fixture, "proposal.md"), "utf8"))
  if (!block.ok) stop(`proposal.md has no parseable native Relay document: ${block.error}`)
  const document = block.document
  // The proof is Archie's knowledge reaching the workers; a document without anchors proves nothing new.
  const references = (document.nodes as { parameters?: Record<string, unknown> }[]).flatMap((node) =>
    ["relayKnowledge", "knowledge"].flatMap((name) => {
      const value = node.parameters?.[name]
      return typeof value === "string" ? JSON.parse(value) : Array.isArray(value) ? value : []
    }))
  if (!references.some((reference) => /^[0-9a-f]{64}$/.test(String(reference))))
    stop("the Relay document carries no Atlas knowledge reference; archie did not anchor its context")
  console.log(`knowledge references: ${references.join(", ")}`)
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
  const model = process.env.LIVE_PROOF_MODEL ?? state.model ?? stop("run preflight first to pick a model")
  const password = randomBytes(16).toString("hex")
  const config = {
    model: `openrouter/${model}`,
    small_model: `openrouter/${model}`,
    provider: { openrouter: { options: { apiKey: "{env:OPENROUTER_API_KEY}" }, models: { [model]: { tool_call: true } } } },
    agent: Object.fromEntries(["maestro", "archie", "lucy", "backend"].map((id) => [id, { model: `openrouter/${model}` }])),
  }
  // A previous run's address must not be read as this server's.
  rmSync(path.join(out, "server.out"), { force: true })
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
  const log = path.join(out, "server.log")
  const tail = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter((line) => !/^\s+at /.test(line)).slice(-40).join("\n") : ""
  stop(`server did not start; last lines of ${log}:\n${tail}`)
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
      // LIVE_PROOF_PERMISSION=once answers unattended runs; every ask is still printed and saved in the transcript.
      const answer = process.env.LIVE_PROOF_PERMISSION ?? (prompt("allow once? [y/N] ") ?? "").trim().toLowerCase()
      const reply = answer === "y" || answer === "once" ? "once" : "reject"
      console.log(`  → ${reply}`)
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

// A function so it is hoisted above the top-level step dispatch.
function defaultBrief() {
  return `Proposal only: create proposal.md with the write tool; that file on disk is the deliverable, and text in your reply does not count.
Read the Atlas context yourself (atlas_context catalog first, then the units you choose) and load archie-work-package.
Propose making money handling exact: src/money.ts converts a decimal amount to integer cents without floating-point loss
(non-finite and fractional-cent inputs are explicit errors), and src/checkout.ts totals integer cents exactly.
Shape it as one linear work package with two relay.execute steps and disjoint write scopes: step 1 writes only
src/money.ts, step 2 writes only src/checkout.ts and is revealed only after step 1 settles.
Anchor the Atlas units each step needs with atlas_context action anchor (target kind work-package, id = the step's
work package id; units used by both steps go in one anchor with target kind assignment). Put each step's returned
reference in that relay.execute node's \`knowledge\` parameter and the shared one in the start node's
\`relayKnowledge\` parameter, both as JSON arrays of reference strings, and list every receipt in the proposal.
Include the native Relay authoring document as exactly one \`\`\`json code block in exactly this shape, filling the
<...> slots, copying the checklist values verbatim and keeping every key and brace. Parameter values that hold lists are
JSON text, as shown. The block must parse with JSON.parse; keep the <...> fill-ins to plain sentences without quotes:
{"name": "<title>",
 "nodes": [
  {"id": "start", "name": "Workflow start", "type": "relay.startTrigger", "position": [0, 0],
   "parameters": {"relayBrief": "<objective>", "relayRetryBudget": 2, "relayKnowledge": "[\\"<shared reference>\\"]"}},
  {"id": "step-1", "name": "Money", "type": "relay.execute", "position": [224, 0],
   "parameters": {"instructions": "<step 1 work>", "knowledge": "[\\"<step 1 reference>\\"]",
    "checklist": "[{\\"id\\": \\"money-scope\\", \\"host_check\\": \\"owned-files\\"}]"}},
  {"id": "step-2", "name": "Checkout", "type": "relay.execute", "position": [448, 0],
   "parameters": {"instructions": "<step 2 work>", "knowledge": "[\\"<step 2 reference>\\"]",
    "checklist": "[{\\"id\\": \\"checkout-scope\\", \\"host_check\\": \\"owned-files\\"}, {\\"id\\": \\"package\\", \\"host_check\\": \\"package-verification\\"}, {\\"id\\": \\"review\\", \\"host_check\\": \\"cold-review\\"}]"}}],
 "connections": {"Workflow start": {"main": [[{"node": "Money", "type": "main", "index": 0}]]},
                 "Money": {"main": [[{"node": "Checkout", "type": "main", "index": 0}]]}}}
List every unknown; leave none for the owner to resolve silently.`
}
