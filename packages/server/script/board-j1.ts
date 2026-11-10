#!/usr/bin/env bun
// Repository-only J1 preview. Run the isolated recipe in docs/specs/projects-board/J1-PREVIEW.md.
import fs from "node:fs/promises"
import path from "node:path"
import { randomBytes } from "node:crypto"
import { parseArgs } from "node:util"

const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    root: { type: "string" },
    port: { type: "string", default: "4096" },
    "web-port": { type: "string", default: "3000" },
  },
})
if (!args.values.root || !path.isAbsolute(args.values.root)) {
  throw new Error("--root must name a new, empty, absolute directory created by mktemp.")
}
const root = await fs.realpath(args.values.root)
const repository = await fs.realpath(path.resolve(import.meta.dirname, "../../.."))
if (!path.basename(root).startsWith("orchestra-board-j1-") || (await fs.readdir(root)).length !== 0) {
  throw new Error("Refusing to seed: --root must be an empty orchestra-board-j1-* directory.")
}
const relative = path.relative(repository, root)
if (relative !== ".." && !relative.startsWith(".." + path.sep)) {
  throw new Error("The J1 data directory must be outside the checkout.")
}
const port = portNumber(args.values.port)
const webPort = portNumber(args.values["web-port"])
if (port === webPort) throw new Error("The API and frontend need different ports.")
await fs.chmod(root, 0o700)
await Promise.all(
  ["home", "data", "config", "cache", "state", "tmp", "work", "env"].map((name) =>
    fs.mkdir(path.join(root, name)),
  ),
)

// The recipe starts Bun with env -i in the new root. Also restrict JS-visible env
// before Core imports: Global and Database select their paths at module load.
const environment = {
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  HOME: path.join(root, "home"),
  TMPDIR: path.join(root, "tmp"),
  TMP: path.join(root, "tmp"),
  TEMP: path.join(root, "tmp"),
  ORCHESTRA_TEST_HOME: path.join(root, "home"),
  XDG_DATA_HOME: path.join(root, "data"),
  XDG_CONFIG_HOME: path.join(root, "config"),
  XDG_CACHE_HOME: path.join(root, "cache"),
  XDG_STATE_HOME: path.join(root, "state"),
  ORCHESTRA_DB: path.join(root, "board.sqlite"),
  ORCHESTRA_CREDENTIAL_KEY_FILE: path.join(root, "credential.key"),
  ORCHESTRA_INHERIT_CREDENTIALS: "0",
  ORCHESTRA_DISABLE_PROJECT_CONFIG: "1",
  ORCHESTRA_DISABLE_MODELS_FETCH: "1",
  ORCHESTRA_DISABLE_AUTOUPDATE: "1",
  ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "1",
  ...(process.env.HUGR_OMNI_ADDON ? { HUGR_OMNI_ADDON: path.resolve(process.env.HUGR_OMNI_ADDON) } : {}),
  ...(process.env.HUGR_OMNI_SUPERVISOR
    ? { HUGR_OMNI_SUPERVISOR: path.resolve(process.env.HUGR_OMNI_SUPERVISOR) }
    : {}),
}
Object.keys(process.env).forEach((key) => delete process.env[key])
Object.assign(process.env, environment)
process.chdir(path.join(root, "work"))

const webRoot = path.join(repository, "apps/web")
const vite = path.join(path.dirname(Bun.resolveSync("vite/package.json", webRoot)), "bin/vite.js")
if (!(await Bun.file(vite).exists())) throw new Error("Install the workspace dependencies before running the preview.")

const { NodeHttpServer, NodeRuntime, NodeServices } = await import("@effect/platform-node")
const { Context, Effect, Layer, Schema } = await import("effect")
const { HttpRouter, HttpServer } = await import("effect/unstable/http")
const { createServer } = await import("node:http")
const { Board } = await import("@orchestra/core/board/board")
const { ClaudeCodeAccount } = await import("@orchestra/core/claude-code-account")
const { Credential } = await import("@orchestra/core/credential")
const { Database } = await import("@orchestra/core/database/database")
const { AppNodeBuilder } = await import("@orchestra/core/effect/app-node-builder")
const { makeGlobalNode } = await import("@orchestra/core/effect/app-node")
const { LayerNode } = await import("@orchestra/core/effect/layer-node")
const { EventV2 } = await import("@orchestra/core/event")
const { Global } = await import("@orchestra/core/global")
const { PermissionSaved } = await import("@orchestra/core/permission/saved")
const { AppProcess } = await import("@orchestra/core/process")
const { Snapshot, IssuePage, ExecutionReport } = await import("@orchestra/schema/board")
const { createRoutes } = await import("../src/routes")

const branch = "j1-synthetic-" + "overviewconversationexecutionshistory".repeat(6)
const seed = Effect.gen(function* () {
  const board = yield* Board.Service
  yield* board.project({
    key: "UXV",
    name: "J1 — avaliação visual sintética",
    goal: "Dados sintéticos para julgar o Board. Não são evidência de execução, CI ou aceite humano.",
    reason: "Preparar uma sessão isolada para o dono julgar J1.",
  })
  const control = (yield* board.issue({
    project: "UXV",
    title: "[SINTÉTICO J1] Controle de troca de issue",
    body: "Issue auxiliar para observar navegação e troca de rascunho. Nenhum agente foi executado.",
    reason: "Permitir alternar entre duas issues durante a avaliação visual.",
  })).issue
  if (!control) return yield* Effect.die(new Error("Board did not return the control issue."))
  const issue = (yield* board.issue({
    project: "UXV",
    title: "[SINTÉTICO J1] Overview, conversa e branch longa",
    body: [
      "## Objetivo",
      "Julgar organização e acabamento em dark/light e narrow/wide.",
      "",
      "## Conteúdo de avaliação",
      "Esta issue contém descrição, passos, perguntas abertas, contexto e notas sintéticas.",
      "A branch longa é uma string de avaliação visual; não representa uma branch criada no Git.",
      "",
      "## Limites",
      "Nenhum modelo, sessão, tentativa, PR, commit ou resultado de CI foi criado por este seed.",
      "A presença destes dados não constitui aceite humano de J1.",
    ].join("\n"),
    type: "chore",
    branch,
    depends_on: [control.ref],
    reason: "Expor as seções reais do Overview e a quebra de strings longas.",
  })).issue
  if (!issue) return yield* Effect.die(new Error("Board did not return the visual issue."))
  yield* board.steps({
    project: "UXV",
    number: issue.number,
    steps: [
      { title: "[SINTÉTICO] Julgar Overview e rail de propriedades", status: "pending" },
      { title: "[SINTÉTICO] Julgar Conversation, Executions e History", status: "pending" },
      { title: "[SINTÉTICO] Julgar branch longa em janela estreita", status: "pending" },
    ],
    reason: "Dar conteúdo aos passos sem declarar trabalho concluído.",
  })
  yield* board.question({
    action: "ask",
    project: "UXV",
    issue: issue.number,
    text: "[SINTÉTICO J1] A organização do Overview está pronta para o julgamento?",
    options: [
      { id: "inspect", label: "Inspecionar as quatro visões", consequence: "A avaliação visual continua nesta sessão." },
      { id: "adjust", label: "Registrar ajuste necessário", consequence: "A avaliação permanece pendente." },
    ],
    recommended: "inspect",
    blocking: false,
    reason: "Expor uma pergunta aberta com opções e espaço para resposta.",
  })
  yield* board.question({
    action: "ask",
    project: "UXV",
    issue: issue.number,
    text: "[SINTÉTICO J1] O texto longo permanece legível na janela estreita?",
    options: [
      { id: "inspect", label: "Inspecionar a branch longa", consequence: "O dono observa a quebra no Git e nas propriedades." },
      { id: "adjust", label: "Registrar problema de contenção", consequence: "O acabamento continua pendente de correção." },
    ],
    recommended: "inspect",
    blocking: false,
    reason: "Expor uma segunda identidade de pergunta no Needs-you.",
  })
  yield* Effect.forEach(
    [
      "[SINTÉTICO J1] Nota de contexto: esta sessão existe apenas para julgamento visual.",
      "[SINTÉTICO J1] Nota longa para observar excerpt e abertura do conteúdo completo.\n\n" +
        "A descrição, os passos, as perguntas e o contexto devem manter uma hierarquia legível em janela estreita. ".repeat(12),
      "[SINTÉTICO J1] Nota para observar a separação entre conversa e histórico.",
      "[SINTÉTICO J1] Nota para observar o ritmo vertical das entradas.",
      "[SINTÉTICO J1] Nota adicional para tornar visível a paginação existente.",
      "[SINTÉTICO J1] Nota final: nenhum resultado de execução é afirmado por este conteúdo.",
    ],
    (body) => board.note("UXV", issue.number, { body }),
    { discard: true },
  )
  yield* board.attach("UXV", issue.number, {
    kind: "file",
    name: "j1-context.md",
    mime: "text/markdown",
    data: Buffer.from(
      "# Contexto sintético J1\n\nEste arquivo serve apenas para avaliação visual. Não contém prova de execução nem aceite humano.\n",
    ).toString("base64"),
  })
  const snapshot = yield* board.snapshot("UXV")
  return {
    synthetic: true,
    humanAcceptance: "pending",
    project: snapshot.project.key,
    issues: snapshot.issues.map((entry) => ({ number: entry.number, ref: entry.ref })),
    visualIssue: { number: issue.number, ref: issue.ref },
    questionIDs: snapshot.questions.map((question) => question.id),
    branch,
  }
}).pipe(
  Effect.provide(
    AppNodeBuilder.build(
      makeGlobalNode({
        service: Board.Service,
        layer: Board.layerWith({ poll: false }),
        deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node],
      }),
    ),
  ),
)

NodeRuntime.runMain(
  Effect.scoped(
    Effect.gen(function* () {
      const receipt = yield* seed
      const password = randomBytes(32).toString("hex")
      const server = createServer()
      const context = yield* Layer.build(
        HttpRouter.serve(createRoutes({ password }), { disableListenLog: true, disableLogger: true }).pipe(
          Layer.provideMerge(NodeHttpServer.layer(() => server, { host: "127.0.0.1", port })),
          Layer.provide(
            AppNodeBuilder.build(LayerNode.group([Credential.node, PermissionSaved.node, ClaudeCodeAccount.node])),
          ),
        ),
      )
      // Drop long-lived SSE connections before the HTTP layer's scoped shutdown.
      yield* Effect.addFinalizer(() => Effect.sync(() => server.closeAllConnections?.()))
      const api = HttpServer.formatAddress(Context.get(context, HttpServer.HttpServer).address)
      const token = Buffer.from("orchestra:" + password).toString("base64")
      yield* Effect.promise(async () => {
        const unauthorized = await fetch(api + "/api/board", { signal: AbortSignal.timeout(30_000) })
        if (unauthorized.status !== 401) throw new Error("The preview API did not refuse an unauthenticated Board read.")
        await unauthorized.arrayBuffer()
        const read = async (pathname: string) => {
          const response = await fetch(api + pathname, {
            headers: { Authorization: "Basic " + token },
            signal: AbortSignal.timeout(30_000),
          })
          if (!response.ok) throw new Error("J1 API read failed: " + pathname + " HTTP " + response.status)
          return response.json()
        }
        const snapshot = Schema.decodeUnknownSync(Snapshot)(await read("/api/board/UXV"))
        const page = Schema.decodeUnknownSync(IssuePage)(
          await read("/api/board/UXV/issue/" + receipt.visualIssue.number),
        )
        const execution = Schema.decodeUnknownSync(ExecutionReport)(
          await read("/api/board/UXV/issue/" + receipt.visualIssue.number + "/execution"),
        )
        if (
          snapshot.project.key !== receipt.project ||
          snapshot.issues.length !== 2 ||
          snapshot.questions.length !== 2 ||
          snapshot.questions.some((question) => question.status !== "open" || !receipt.questionIDs.includes(question.id)) ||
          page.issue.ref !== receipt.visualIssue.ref ||
          page.issue.steps.length !== 3 ||
          page.notes.length !== 6 ||
          page.attachments.length !== 1 ||
          page.trail.state !== "none" ||
          page.trail.branch !== branch ||
          execution.attempts.length !== 0 ||
          execution.metrics.tokens !== null ||
          execution.metrics.modelUsd !== null
        ) {
          throw new Error("The real HTTP API did not read back the requested J1 seed.")
        }
        const config = path.join(root, "vite.config.mjs")
        await fs.writeFile(
          config,
          [
            "import config from " + JSON.stringify(path.join(webRoot, "vite.config.ts")),
            "export default {",
            "  ...config,",
            "  root: " + JSON.stringify(webRoot) + ",",
            "  envDir: " + JSON.stringify(path.join(root, "env")) + ",",
            "  cacheDir: " + JSON.stringify(path.join(root, "vite-cache")) + ",",
            "  server: { ...config.server, host: '127.0.0.1', port: " + webPort + ", strictPort: true },",
            "}",
            "",
          ].join("\n"),
          { mode: 0o600 },
        )
        const frontend = path.join(root, "frontend.sh")
        const browser = new URL("http://127.0.0.1:" + webPort + "/orchestra/board")
        browser.searchParams.set("auth_token", token)
        await fs.writeFile(
          frontend,
          [
            "#!/bin/sh",
            "set -eu",
            "cd " + quote(root),
            [
              "exec env -i",
              ...Object.entries({
                PATH: environment.PATH,
                HOME: environment.HOME,
                TMPDIR: environment.TMPDIR,
                XDG_CACHE_HOME: environment.XDG_CACHE_HOME,
                VITE_ORCHESTRA_SERVER_HOST: "127.0.0.1",
                VITE_ORCHESTRA_SERVER_PORT: String(port),
                VITE_SENTRY_DSN: "",
              }).map(([key, value]) => quote(key + "=" + value)),
              quote(process.execPath),
              quote(vite),
              "--config",
              quote(config),
              "--host 127.0.0.1 --port " + webPort + " --strictPort",
            ].join(" "),
            "",
          ].join("\n"),
          { mode: 0o700 },
        )
        await fs.writeFile(path.join(root, "browser-url.txt"), browser.href + "\n", { mode: 0o600 })
        await fs.writeFile(
          path.join(root, "seed-receipt.json"),
          JSON.stringify({ ...receipt, api, database: environment.ORCHESTRA_DB, httpReadback: "matched" }, null, 2) + "\n",
          { mode: 0o600 },
        )
        console.log("J1 SEED READY — real API readback matched; human acceptance remains pending.")
        console.log("Data: " + root)
        console.log("Frontend (second terminal): sh " + quote(frontend))
        console.log("Open in a new private browser session: " + browser.href)
        console.log("Stop only this preview with Ctrl+C. Data is retained for the lead's inspection.")
      })
      yield* Effect.never
    }),
  ).pipe(Effect.provide(NodeServices.layer)),
)

function portNumber(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) throw new Error("Ports must be decimal integers.")
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Choose a port from 1024 to 65535.")
  return port
}

function quote(value: string) {
  return "'" + value.replaceAll("'", "'\\''") + "'"
}
