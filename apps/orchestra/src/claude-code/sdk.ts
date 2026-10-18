export * as ClaudeCodeSDK from "./sdk"

import { Context, Layer } from "effect"
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { spawn } from "node:child_process"
import { ClaudeCodeExecutable } from "./executable"

type QueryOptions = NonNullable<Parameters<typeof query>[0]["options"]>

/** The owner's environment the host hands Claude Code; tests inject their own. */
export const Environment = Context.Reference<NonNullable<QueryOptions["env"]>>("@orchestra/ClaudeCodeSDK/Environment", {
  defaultValue: () => process.env,
})

/** Claude Code's own `claude_code` prompt preset. Claude mode only appends to it and never replaces it. */
type Preset = Extract<NonNullable<QueryOptions["systemPrompt"]>, { type: "preset" }>

/** A billing refusal from Anthropic, repeated verbatim so the owner sees exactly what was returned. Never retried. */
export function billingRejection(detail: string) {
  if (!/third-party app|extra usage|plan limits|billing_error/i.test(detail)) return
  return `Anthropic returned: ${detail}`
}

/** What the owner sees when Claude Code reports it is not signed in. Orchestra never signs in on the owner's behalf. */
export const SIGNED_OUT = "Claude Code is not signed in. Run `claude auth login` in a terminal, then send your message again."

/** True when Claude Code's documented SDK output says the request failed authentication. */
export function signedOut(message: SDKMessage) {
  return message.type === "assistant" && message.error === "authentication_failed"
}

/**
 * Starts the unmodified Claude Code binary with the owner's own environment. Claude Code signs in from its own
 * credential store (`claude auth login`) or the owner's `ANTHROPIC_API_KEY` / `apiKeyHelper`; Orchestra reads, adds and
 * removes no credential. SDK 0.3.289 Query.return races waitForExit against 2000ms, so it is not an exit receipt.
 */
export function processLifetime(options: QueryOptions & { systemPrompt: Preset }) {
  // Structural guard over every engine query, casts included: Claude mode keeps Claude Code's prompt (see Preset).
  const system: unknown = options.systemPrompt
  if (typeof system !== "object" || system === null || Array.isArray(system) ||
    !("type" in system) || system.type !== "preset" || !("preset" in system) || system.preset !== "claude_code")
    throw new Error("Claude Code turns must keep the claude_code system prompt preset")
  const source = options.env ?? process.env
  // Strip the retired rollout flag as compatibility metadata, not a credential or an activation requirement.
  const env = Object.fromEntries(Object.entries(source).filter(([key]) => key !== "ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED"))
  const exits: Promise<void>[] = []
  return {
    options: {
      ...options,
      // The canonical resolver honors the Desktop's staged executable env path before deployed-directory defaults.
      pathToClaudeCodeExecutable: ClaudeCodeExecutable.resolve({ executable: options.pathToClaudeCodeExecutable, env: source }),
      env,
      spawnClaudeCodeProcess: (input) => {
        const spawner = options.spawnClaudeCodeProcess ?? ((input) => {
          const child = spawn(input.command, input.args, {
            cwd: input.cwd, env: input.env, signal: input.signal,
            stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
          })
          child.stderr.on("data", (data: Buffer) => options.stderr?.(data.toString()))
          child.stderr.on("error", () => {})
          return child
        })
        const child = spawner(input)
        // Install before returning to the SDK, including its abort handling. Abort errors do not prove exit.
        exits.push(new Promise<void>((resolve, reject) => {
          const exited = () => { child.off("error", failed); resolve() }
          const failed = (error: Error) => {
            if (!("syscall" in error) || typeof error.syscall !== "string" || !error.syscall.startsWith("spawn")) return
            child.off("exit", exited)
            reject(error)
          }
          child.once("error", failed)
          child.once("exit", exited)
          if (child.exitCode !== null || child.signalCode != null) {
            child.off("exit", exited)
            exited()
          }
        }))
        // A failed spawn can precede query disposal; retain the rejection for join without an unhandled rejection.
        exits.at(-1)?.catch(() => {})
        return child
      },
    } satisfies QueryOptions,
    join: async (): Promise<void> => {
      const failed = (await Promise.allSettled(exits)).find((exit) => exit.status === "rejected")
      if (failed?.status === "rejected") throw failed.reason
    },
  }
}

/** The Claude Agent SDK entry point, behind a service so tests can script a session. */
export interface Interface {
  readonly query: typeof query
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ClaudeCodeSDK") {}

export const layer = Layer.succeed(Service, Service.of({ query }))

export const node = LayerNode.make({ service: Service, layer, deps: [] })
