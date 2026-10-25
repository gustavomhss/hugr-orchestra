export * as MaestroToolsV2 from "./tools"

import { Effect, Layer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { GitCli } from "@orchestra/core/git-cli"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationMutation } from "@orchestra/core/location-mutation"
import { PermissionV2 } from "@orchestra/core/permission"
import { SessionStore } from "@orchestra/core/session"
import { SkillV2 } from "@orchestra/core/skill"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tools } from "@orchestra/core/tool/tools"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { GovernanceBackgroundV2 } from "./governance/background"
import { MaestroSeats } from "./seats-service"
import { MaestroAdmissionTools } from "./tools/admission"
import { MaestroApprovalTools } from "./tools/approval"
import { MaestroToolGate } from "./tools/gate"
import { MaestroPlanningTools } from "./tools/planning"
import { MaestroResultTools } from "./tools/result"
import { MaestroReviewTools } from "./tools/review"
import { MaestroWorkflowTools } from "./tools/workflows"

/**
 * Maestro's native tools in every Location. Visibility stays with the rules `v2/seats.ts` gives every agent; each tool
 * also checks its caller itself. The Arsenal registers here only where the application has not bound it already: a
 * host that binds it as an application tool installs its runtime guard and governance observations there, and a
 * Location registration would shadow them.
 */
const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const agents = yield* AgentV2.Service
    const seats = yield* MaestroSeats.Service
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    const store = yield* SessionStore.Service
    const applications = yield* ApplicationTools.Service
    const gate = MaestroToolGate.make(agents, seats)
    const services = {
      db: database.db,
      store,
      events,
      atlas: {
        config: yield* Config.Service,
        git: yield* GitCli.Service,
        fs: yield* FSUtil.Service,
        skills: yield* SkillV2.Service,
      },
    }
    yield* tools
      .register({
        ...MaestroAdmissionTools.tools({ db: database.db, events, store, gate }),
        ...MaestroApprovalTools.tools({ db: database.db, events, store, gate }),
        ...MaestroPlanningTools.tools({ services, gate }),
        ...MaestroReviewTools.tools({
          services,
          gate,
          sessions: yield* GovernanceBackgroundV2.Sessions,
          execution: yield* MaestroReviewTools.Execution,
        }),
        ...MaestroResultTools.tools({ gate }),
        ...MaestroWorkflowTools.tools({ gate }),
      })
      .pipe(Effect.orDie)
    if (applications.entries().has(MaestroArsenal.names.catalog)) return
    yield* MaestroArsenal.registerScoped({
      nativeMaestro: (agent) => Effect.succeed(agent === AgentV2.defaultID),
      nativeUpstream: (agent) => Effect.succeed(agent === "archie" && seats.has("archie")),
    }).pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "maestro/tools",
  layer,
  deps: [
    ToolRegistry.node,
    ToolRegistry.toolsNode,
    AgentV2.node,
    MaestroSeats.node,
    Database.node,
    EventV2.node,
    Location.node,
    SessionStore.node,
    ApplicationTools.node,
    Global.node,
    FSUtil.node,
    LocationMutation.node,
    PermissionV2.node,
    ToolOutputStore.node,
    Config.node,
    GitCli.node,
    SkillV2.node,
    GovernanceBackgroundV2.sessionsNode,
    MaestroReviewTools.executionNode,
  ],
})
