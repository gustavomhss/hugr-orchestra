export * as SessionDirectCommands from "./direct-commands"

import { Cause, DateTime, Duration, Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import type { Config } from "../../config"
import type { EventV2 } from "../../event"
import type { FSUtil } from "../../fs-util"
import type { Location } from "../../location"
import type { Mcp } from "../../mcp"
import { PermissionV2 } from "../../permission"
import { QuestionV2 } from "../../question"
import type { AppProcess } from "../../process"
import type { SkillV2 } from "../../skill"
import { BashTool } from "../../tool/bash"
import type { ReadToolFileSystem } from "../../tool/read-filesystem"
import { SkillTool } from "../../tool/skill"
import { SessionEvent } from "../event"
import { SessionMessage } from "../message"
import type { SessionSchema } from "../schema"
import type { SessionStore } from "../store"
import { SessionMentions } from "./mentions"

const SHELL_OUTPUT_BYTES = 1024 * 1024

/** The headers every provider call of a Session carries, so the provider keeps its calls on one affinity. */
export const affinity = (session: SessionSchema.Info) => ({
  headers: {
    "x-session-affinity": session.id,
    "X-Session-Id": session.id,
    ...(session.parentID ? { "x-parent-session-id": session.parentID } : {}),
  },
})

// Match V1: declining a user prompt halts the loop instead of becoming model-facing tool output.
export const isUserDeclined = (cause: Cause.Cause<unknown>) =>
  cause.reasons.some(
    (reason) =>
      Cause.isDieReason(reason) &&
      (reason.defect instanceof PermissionV2.DeclinedError || reason.defect instanceof QuestionV2.RejectedError),
  )

export const failInterruptedTools = Effect.fn("SessionRunner.failInterruptedTools")(function* (
  deps: { readonly events: EventV2.Interface; readonly store: SessionStore.Interface },
  sessionID: SessionSchema.ID,
) {
  for (const message of yield* deps.store.context(sessionID)) {
    if (message.type !== "assistant") continue
    for (const tool of message.content) {
      if (tool.type !== "tool" || (tool.state.status !== "pending" && tool.state.status !== "running")) continue
      yield* deps.events.publish(SessionEvent.Tool.Failed, {
        sessionID,
        timestamp: yield* DateTime.now,
        assistantMessageID: message.id,
        callID: tool.id,
        error: { type: "unknown", message: "Tool execution interrupted" },
        provider: {
          executed: tool.provider?.executed === true,
          ...(tool.provider?.metadata === undefined ? {} : { metadata: tool.provider.metadata }),
        },
      })
    }
  }
})

// Attachments are read once, as the inputs are promoted; an admitted prompt keeps its URIs.
export const readMentions = Effect.fnUntraced(function* (
  deps: { readonly reader: ReadToolFileSystem.Interface; readonly mcp: Mcp.Interface; readonly fs: FSUtil.Interface; readonly events: EventV2.Interface },
  sessionID: SessionSchema.ID,
  inputs: ReadonlyArray<{ readonly prompt: Parameters<typeof SessionMentions.read>[1] }>,
) {
  for (const input of inputs) {
    const mentions = yield* SessionMentions.read(deps, input.prompt)
    if (mentions.text)
      yield* deps.events.publish(SessionEvent.Synthetic, {
        sessionID,
        messageID: SessionMessage.ID.create(),
        timestamp: yield* DateTime.now,
        text: mentions.text,
        ...(mentions.files.length === 0 ? {} : { files: mentions.files }),
      })
  }
})

// A person's `!` command, run as V1 ran it: in the Location, with the configured shell, outside the agent's
// sandbox. An interrupt stops it and still records what it printed.
export const shell = Effect.fn("SessionRunner.shell")(function* (
  deps: { readonly events: EventV2.Interface; readonly location: Location.Interface; readonly config: Config.Interface; readonly appProcess: AppProcess.Interface },
  input: {
    readonly sessionID: SessionSchema.ID
    readonly command: string
    readonly callID?: string
  },
) {
  const callID = input.callID ?? `call_${crypto.randomUUID()}`
  yield* deps.events.publish(SessionEvent.Shell.Started, {
    sessionID: input.sessionID,
    messageID: SessionMessage.ID.create(),
    timestamp: yield* DateTime.now,
    callID,
    command: input.command,
  })
  const command = ChildProcess.make(input.command, [], {
    cwd: deps.location.directory,
    shell: BashTool.configuredShell(yield* deps.config.entries()),
    stdin: "ignore",
    detached: process.platform !== "win32",
    forceKillAfter: Duration.seconds(3),
  })
  const ended = (output: string) =>
    Effect.gen(function* () {
      yield* deps.events.publish(SessionEvent.Shell.Ended, {
        sessionID: input.sessionID,
        timestamp: yield* DateTime.now,
        callID,
        output,
      })
    })
  yield* deps.appProcess.run(command, { combineOutput: true, maxOutputBytes: SHELL_OUTPUT_BYTES }).pipe(
    Effect.map((result) => {
      const output = (result.output ?? result.stdout).toString("utf8")
      const truncated = result.outputTruncated ? "\n[output truncated]" : ""
      const exit = result.exitCode === 0 ? "" : `\n[exit code ${result.exitCode}]`
      return `${output}${truncated}${exit}`
    }),
    Effect.catchTag("AppProcessError", (error) => Effect.succeed(error.message)),
    Effect.onInterrupt(() => ended("User aborted the command")),
    Effect.flatMap(ended),
  )
})

export const skill = Effect.fn("SessionRunner.skill")(function* (
  deps: { readonly events: EventV2.Interface; readonly skills: SkillV2.Interface; readonly fs: FSUtil.Interface },
  input: {
    readonly sessionID: SessionSchema.ID
    readonly skill: string
  },
) {
  const found = (yield* deps.skills.list()).find((item) => item.name === input.skill)
  if (!found) return false
  yield* deps.events.publish(SessionEvent.Synthetic, {
    sessionID: input.sessionID,
    messageID: SessionMessage.ID.create(),
    timestamp: yield* DateTime.now,
    text: yield* SkillTool.load(deps.fs, found).pipe(Effect.orDie),
  })
  return true
})
