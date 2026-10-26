import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { httpClient, llmClient } from "@orchestra/core/effect/app-node-platform"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { EventV2 } from "@orchestra/core/event"
import { ClaudeAccount } from "@orchestra/core/claude-account"
import { Credential } from "@orchestra/core/credential"
import { Board } from "@orchestra/core/board/board"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { Npm } from "@orchestra/core/npm"
import { GitCli } from "@orchestra/core/git-cli"
import { Global } from "@orchestra/core/global"
import { ProjectV2 } from "@orchestra/core/project"
import { Host } from "@orchestra/core/host"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { PtyTicket } from "@orchestra/core/pty/ticket"
import { ScheduledTask } from "@orchestra/core/scheduled-task"
import { SessionV2 } from "@orchestra/core/session"
import { SessionProcess } from "@orchestra/core/session-process"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SessionExecution } from "@orchestra/core/session/execution"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Layer, Option } from "effect"
import { Api } from "./api"
import { ServerAuth } from "./auth"
import { corsLayer } from "./cors"
import { handlers } from "./handlers"
import { authorizationLayer } from "./middleware/authorization"
import { schemaErrorLayer } from "./middleware/schema-error"
import { PtyEnvironment } from "@orchestra/core/host/pty-environment"
import { layer as locationLayer } from "./location"
import { sessionLocationLayer } from "./middleware/session-location"
import { capabilityAuthorizationLayer } from "./middleware/capability-authorization"
import { ServerOperator } from "./operator"
import { ServerContentTicket } from "./capability-content-ticket"
import { ServerCapabilityVerification } from "./capability-verification"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import type { CapabilityConnectionSetupContract } from "@orchestra/core/capability/connection/setup-contract"

const applicationServices = LayerNode.group([
  Database.node,
  EventV2.node,
  httpClient,
  ToolOutputStore.cleanupNode,
  ResearchArtifacts.node,
  SessionV2.node,
  SessionExecution.node,
  SessionSubagentModels.node,
  SessionProcess.node,
  ScheduledTask.node,
  ScheduledTask.daemonNode,
  PermissionSaved.node,
  PtyTicket.node,
  Credential.node,
  ClaudeAccount.node,
  PtyEnvironment.node,
  LocationServiceMap.node,
  FSUtil.node,
  AppProcess.node,
  Npm.node,
  llmClient,
  GitCli.node,
  Global.node,
  ProjectV2.node,
  Board.node,
])

export interface Options {
  readonly password?: string
  /** Product contributions the application composes (apps/cli `CliHost.contributions`); sdk-next passes none. */
  readonly host?: ReadonlyArray<Host.Contribution>
  /** Replaces the capability operator; tests and sdk-next embed their own. */
  readonly operator?: CapabilityOperatorContract.Interface
  /** Replaces the capability setup verifier; tests avoid vendor calls with it. */
  readonly verifier?: CapabilityConnectionSetupContract.Verifier
}

export function createRoutes(options: Options = {}) {
  return makeRoutes(
    options.password
      ? ServerAuth.Config.configLayer({ username: "orchestra", password: Option.some(options.password) })
      : ServerAuth.Config.layer,
    options,
  )
}

export function createEmbeddedRoutes(options: Omit<Options, "password"> = {}) {
  return makeRoutes(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() }), options)
}

function makeRoutes<AuthError, AuthServices>(
  auth: Layer.Layer<ServerAuth.Config, AuthError, AuthServices>,
  options: Omit<Options, "password">,
) {
  const merged = Host.merge(options.host ?? [])
  // Contributed global nodes add services and may not fail, so the root keeps the application services' types.
  const serviceLayer: Layer.Layer<LayerNode.Output<typeof applicationServices>, LayerNode.Error<typeof applicationServices>> =
    AppNodeBuilder.build(
      LayerNode.group([applicationServices, ...merged.nodes]),
      [[SessionExecution.node, SessionExecutionLocal.node], ...merged.replacements],
      merged.locationNodes,
    )

  return HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
    Layer.provide(handlers),
    Layer.provide(merged.references),
    Layer.provide(sessionLocationLayer),
    Layer.provide(locationLayer),
    Layer.provide(authorizationLayer),
    Layer.provide(capabilityAuthorizationLayer),
    Layer.provide(schemaErrorLayer),
    Layer.provide(auth),
    Layer.provide(options.operator ? Layer.succeed(ServerOperator.Service, options.operator) : ServerOperator.layer),
    Layer.provide(ServerContentTicket.layer),
    Layer.provide(options.verifier ? Layer.succeed(ServerCapabilityVerification.Service, options.verifier) : ServerCapabilityVerification.layer),
    Layer.provide(serviceLayer),
    // The desktop renderer (`oc://renderer`) calls a desktop-owned server cross-origin, as it does V1.
    Layer.provide(corsLayer()),
  )
}

export const routes = createRoutes()

export const webHandler = () =>
  HttpRouter.toWebHandler(routes.pipe(Layer.provide(HttpServer.layerServices)), { disableLogger: true })
