import { Effect, Scope } from "effect"
import { ChildProcess } from "effect/unstable/process"
import type { AgentV2 } from "../../agent"
import { FSUtil } from "../../fs-util"
import { Location } from "../../location"
import { LocationMutation } from "../../location-mutation"
import { PermissionV2 } from "../../permission"
import type { SessionSchema } from "../schema"
import { ToolSafety } from "../../tool-safety"
import { ToolSafetySandbox } from "../../tool-safety-sandbox"
import { AllowedDomains } from "../../tool/websearch"
import type { ExecutionHost } from "./execution-host"

/**
 * What Orchestra adds to a call the host's engine runs itself, inside ToolSafety's `run` so the profile is the one
 * narrowed to the Session's write roots: the dispatch's web domains and, for a shell command under a profile that
 * confines shells, the command wrapped in the jail (one the Location cannot provide refuses the call).
 */
export const hostedCall = Effect.fnUntraced(function* (
  call: { readonly tool: string; readonly args: Readonly<Record<string, unknown>> },
  directory: string,
  scope: Scope.Scope,
  fs: FSUtil.Interface,
) {
  const domains = yield* AllowedDomains
  const profile = yield* ToolSafety.RuntimeProfile
  const command = call.tool === "bash" && typeof call.args.command === "string" ? call.args.command : undefined
  const confined =
    command === undefined || !confines(profile)
      ? undefined
      : yield* ToolSafetySandbox.wrap(ChildProcess.make("/bin/sh", ["-c", command], { cwd: directory })).pipe(
          Effect.provideService(ToolSafety.RuntimeProfile, {
            ...profile,
            requireSandbox: true,
            sandbox: { ...profile?.sandbox, enabled: true, unconfinedFallback: false },
          }),
          Effect.provideService(FSUtil.Service, fs),
          Scope.provide(scope),
        )
  if (confined && confined._tag !== "StandardCommand") return yield* new ToolSafety.Denied({ reason: "sandbox-pipeline-unbound" })
  return {
    ...(confined ? { input: { command: shellLine(confined) } } : {}),
    ...(domains ? { domains } : {}),
  } satisfies ExecutionHost.Authorization
})

/** Bind installed Hook Approve to the live Session; its SDK transcript row may not have arrived yet. */
export function hostedHooks(
  permissions: PermissionV2.Interface,
  binding: {
    readonly sessionID: SessionSchema.ID
    readonly agent: AgentV2.ID
    readonly location: Location.Interface
    readonly fs: FSUtil.Interface
  },
): ToolSafety.HostedCallHooks {
  return {
    approve: Effect.fnUntraced(function* (request: ToolSafety.Approval) {
      const invocation = request.invocation
      if (
        invocation.sessionID !== binding.sessionID ||
        invocation.agent !== binding.agent ||
        invocation.directory !== binding.location.directory ||
        invocation.projectID !== binding.location.project.id ||
        !invocation.callID
      )
        return yield* new ToolSafety.Denied({ reason: "approval-v2-invocation-identity-missing" })
      const args = invocation.args
      const filePath = args && typeof args === "object" && "filePath" in args ? args.filePath : undefined
      const resolved = typeof filePath === "string" && ["read", "write", "edit", "multiedit"].includes(invocation.tool)
        ? yield* LocationMutation.Service.use((mutations) =>
            mutations.resolve({ path: filePath, kind: invocation.tool === "read" ? "directory" : "file" }),
          ).pipe(
            Effect.provide(LocationMutation.locationLayer),
            Effect.provideService(Location.Service, binding.location),
            Effect.provideService(FSUtil.Service, binding.fs),
            Effect.mapError(() => new ToolSafety.Denied({ reason: "approval-native-resources-invalid" })),
          )
        : undefined
      yield* permissions.askExplicit({
        sessionID: binding.sessionID,
        agent: binding.agent,
        action: "relay_hook",
        resources: resolved ? [resolved.resource] : [...request.resources],
        metadata: {
          nativeSafety: true, action: request.action, callID: invocation.callID, tool: invocation.tool, projectID: invocation.projectID,
          ...(request.message === undefined ? {} : { message: request.message }),
        },
      }).pipe(Effect.mapError((error) => new ToolSafety.Denied({
        reason: error instanceof PermissionV2.BlockedError ? "approval-native-policy-denied" : "approval-native-rejected",
      })))
    }),
  }
}

/** Any restriction on a shell requires the jail, whether or not the profile set `requireSandbox`. */
function confines(profile: ToolSafety.Profile | undefined) {
  return Boolean(
    profile?.requireSandbox ||
      profile?.sandbox?.enabled ||
      profile?.writeRoots !== undefined ||
      profile?.sandbox?.readRoots !== undefined ||
      profile?.neverTouch?.length ||
      profile?.managedPaths?.length ||
      profile?.protectedWrites?.length ||
      profile?.sandbox?.denyPaths?.length ||
      profile?.sandbox?.allowedUnixSockets?.length ||
      profile?.sandbox?.allowedLoopbackEndpoints?.length,
  )
}

/** The jailed command as one shell line, keeping the environment the jail built for it. */
function shellLine(command: ChildProcess.StandardCommand) {
  const env = command.options.env ?? {}
  const unset = Object.keys(process.env).filter((name) => !(name in env)).flatMap((name) => ["-u", name])
  const set = Object.entries(env).flatMap(([name, value]) =>
    value !== undefined && process.env[name] !== value ? [`${name}=${value}`] : [],
  )
  return ["/usr/bin/env", ...unset, ...set, command.command, ...command.args]
    .map((word) => `'${word.replaceAll("'", `'\\''`)}'`)
    .join(" ")
}
