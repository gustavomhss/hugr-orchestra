export * as RelayJudge from "./relay-judge"

import { createHash } from "node:crypto"
import { realpath } from "node:fs/promises"
import path from "node:path"
import { LLM, LLMClient, ReasoningEfforts } from "@orchestra/llm"
import { JudgeConfig } from "@orchestra/relay/judge/config"
import { SessionID } from "@orchestra/schema/session-id"
import { Context, Effect, Layer, Redacted } from "effect"
import { Siwc } from "./auth/siwc"
import { Catalog } from "./catalog"
import { Config } from "./config"
import type { ConfigRelay } from "./config/relay"
import { ConfigTrust } from "./config/trust"
import { makeLocationNode } from "./effect/app-node"
import { LayerNodePlatform } from "./effect/app-node-platform"
import { FSUtil } from "./fs-util"
import { Global } from "./global"
import { Integration } from "./integration"
import { Location } from "./location"
import { ModelV2 } from "./model"
import { ProviderV2 } from "./provider"
import { SessionRunnerModel } from "./session/runner/model"
import { PhysicalPath } from "./util/physical-path"

const openai = Integration.ID.make("openai")

type Binding = {
  readonly projectDirectory: string
  readonly credentialID: string
  readonly model: string
  readonly variant: string
}

type Selected = { readonly config: JudgeConfig.Config; readonly binding?: Binding }

export class Service extends Context.Service<
  Service,
  {
    readonly config: JudgeConfig.Config
    readonly service: JudgeConfig.Interface
  }
>()("@orchestra/RelayJudge") {}

export const settings = Effect.fn("RelayJudge.settings")(function* (
  entries: readonly Config.Entry[],
  globalConfig: string,
  projectID: string,
  projectDirectory: string,
): Effect.fn.Return<Selected, never, FSUtil.Service> {
  const fs = yield* FSUtil.Service
  const canonical = (directory: string) => fs.realPath(directory).pipe(Effect.orElseSucceed(() => undefined))
  const globalRoot = yield* canonical(globalConfig)
  const worktree = yield* canonical(projectDirectory)
  const userDocuments = globalRoot && (!worktree || !ConfigTrust.within(worktree, globalRoot))
    ? yield* Effect.filter(entries, (entry) => {
        if (
          entry.type !== "document" ||
          entry.path === undefined ||
          path.dirname(entry.path) !== globalConfig ||
          !["orchestra.json", "orchestra.jsonc"].includes(path.basename(entry.path))
        ) return Effect.succeed(false)
        const expected = path.join(globalRoot, path.basename(entry.path))
        return canonical(entry.path).pipe(Effect.map((physical) => physical === expected))
      })
    : []
  const merge = (documents: readonly Config.Entry[]) =>
    documents
      .flatMap((entry) => (entry.type === "document" && entry.info.relay?.judge ? [entry.info.relay.judge] : []))
      .reduce<Partial<ConfigRelay.Judge>>((result, current) => ({ ...result, ...current }), {})
  const owner = merge(userDocuments)
  const bound =
    owner.backend === "orchestra" &&
    owner.projectID === projectID &&
    worktree !== undefined &&
    path.isAbsolute(worktree) &&
    path.parse(worktree).root !== worktree &&
    owner.projectDirectory === worktree
  const configured = bound ? owner : merge(entries)
  const backend = configured.backend ?? JudgeConfig.defaults.backend
  const binding =
    bound &&
    worktree &&
    owner.credentialID &&
    owner.model &&
    owner.variant &&
    ReasoningEfforts.some((effort) => effort !== "max" && effort === owner.variant)
      ? { projectDirectory: worktree, credentialID: owner.credentialID, model: owner.model, variant: owner.variant }
      : undefined
  return {
    config: {
      backend,
      model: binding ? `openai/${binding.model}@${binding.variant}` : configured.model ?? JudgeConfig.defaults.model,
      baseURL: backend === "orchestra" ? undefined : configured.baseURL,
      apiKey: backend !== "orchestra" && configured.apiKey !== undefined ? Redacted.make(configured.apiKey) : undefined,
      votes: configured.votes ?? JudgeConfig.defaults.votes,
      maxContext: configured.maxContext ?? JudgeConfig.defaults.maxContext,
      maxTokens: configured.maxTokens ?? JudgeConfig.defaults.maxTokens,
    },
    binding,
  }
})

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const global = yield* Global.Service
    const location = yield* Location.Service
    const catalog = yield* Catalog.Service
    const integrations = yield* Integration.Service
    const llm = yield* LLMClient.Service
    const fs = yield* FSUtil.Service
    const load = () => config.entries().pipe(
      Effect.flatMap((entries) => settings(entries, global.config, location.project.id, location.project.directory)),
      Effect.provideService(FSUtil.Service, fs),
    )
    const chosen = yield* load()
    const selection = chosen.binding
    const native = selection && Effect.fn("RelayJudge.vote")(function* (input: Parameters<JudgeConfig.NativeCall>[0]) {
      const current = yield* load()
      // Recheck global opt-in on every sample, including samples in a multi-vote ballot.
      if (
        !current.binding ||
        current.binding.projectDirectory !== selection.projectDirectory ||
        current.binding.credentialID !== selection.credentialID ||
        current.binding.model !== selection.model ||
        current.binding.variant !== selection.variant ||
        current.config.votes !== chosen.config.votes ||
        current.config.maxContext !== chosen.config.maxContext
      )
        return yield* Effect.fail("the user-configured Orchestra judge binding changed")

      const connection = yield* integrations.connection.active(openai)
      if (connection?.type !== "credential" || connection.id !== selection.credentialID)
        return yield* Effect.fail("the configured ChatGPT plan OAuth connection is not active")
      const credential = yield* integrations.connection.resolve(connection).pipe(
        Effect.mapError(() => "the configured ChatGPT plan OAuth connection could not be resolved"),
      )
      if (credential?.type !== "oauth" || credential.methodID !== Siwc.methodID || !Siwc.permits(credential, selection.model))
        return yield* Effect.fail("the ChatGPT plan OAuth connection is expired or lacks the configured model")

      const catalogModel = (yield* catalog.model.available()).find(
        (model) =>
          model.providerID === ProviderV2.ID.openai && model.id === selection.model && model.api.id === selection.model,
      )
      const variant = catalogModel?.variants.find((item) => item.id === selection.variant)
      if (!catalogModel || !variant || catalogModel.api.type !== "aisdk" || catalogModel.api.package !== "@ai-sdk/openai")
        return yield* Effect.fail("the configured OpenAI judge model or variant is unavailable")
      // The catalog confirms identity and availability. Project request overlays may never select where
      // the OAuth credential goes or modify the owner's judge request.
      const isolated = ModelV2.Info.make({
        ...catalogModel,
        api: { type: "aisdk", id: catalogModel.api.id, package: catalogModel.api.package },
        request: { headers: {}, body: {} },
      })
      const model = yield* SessionRunnerModel.fromCatalogModel(isolated, credential, {
        id: variant.id,
        headers: {},
        body: {},
        providerOptions: { openai: { reasoningEffort: selection.variant } },
      }).pipe(Effect.mapError(() => "the configured OpenAI judge route is unsupported"))
      const response = yield* llm
        .generate(
          LLM.request({
            model,
            http: { headers: SessionRunnerModel.sessionHeaders(model, SessionID.descending()) },
            system: input.system,
            prompt: input.prompt,
            tools: [{ name: input.tool.name, description: input.tool.description, inputSchema: input.tool.input_schema }],
            toolChoice: input.tool.name,
          }),
        )
        .pipe(Effect.mapError(() => "the OpenAI judge request failed"))
      const calls = response.toolCalls
      const call = calls[0]
      if (response.finishReason !== "tool-calls" || calls.length !== 1 || call?.name !== input.tool.name)
        return yield* Effect.fail("the OpenAI judge did not complete one verdict")
      return call.input
    })
    const service = yield* JudgeConfig.Service.pipe(Effect.provide(JudgeConfig.layer(
      chosen.config,
      selection && native ? { call: native, read: (evidence) => readEvidence(selection.projectDirectory, evidence) } : undefined,
    )))
    return Service.of({ config: chosen.config, service })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Config.node, Global.node, Location.node, Catalog.node, Integration.node, LayerNodePlatform.llmClient, FSUtil.node],
})

export function readEvidence(projectDirectory: string, evidence: JudgeConfig.WorktreeEvidence) {
  return Effect.tryPromise({
    try: async () => {
      if (evidence.directory !== projectDirectory || (await realpath(projectDirectory)) !== projectDirectory)
        throw new Error("worktree does not match the owner binding")
      const scopePaths = evidence.scopePaths ?? []
      // The context and its digest use the same bytes, even when a path appears in both lists.
      const bytes = new Map<string, Uint8Array>()
      for (const name of new Set([...evidence.paths, ...scopePaths]))
        bytes.set(name, await readContextFile(projectDirectory, name))
      const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
      const files = evidence.paths.map((name) => ({
        name: path.basename(name),
        text: utf8.decode(bytes.get(name)!).replace(/\r\n?/g, "\n"),
      }))
      const scope = scopePaths.map((name) => `${name}:${createHash("sha256").update(bytes.get(name)!).digest("hex")}\n`)
      return {
        files,
        ...(scope.length ? { artifact: createHash("sha256").update(scope.join("")).digest("hex") } : {}),
      }
    },
    catch: () => "worktree evidence is missing or outside the user-configured judge boundary",
  })
}

function readContextFile(directory: string, name: string) {
  const segments = name.split("/")
  if (/[\\:\u0000]/.test(name) || segments.some((part) => !part || part === "." || part === ".." || part === ".git"))
    throw new Error("expected an exact relative worktree file path")
  return PhysicalPath.readPhysicalFile(path.join(directory, ...segments))
}
