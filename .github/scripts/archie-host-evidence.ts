import { lstat, realpath } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { isDeepStrictEqual } from "node:util"
import type { Plan } from "./archie-host-plan"

export function assignmentMatches(input: { stored: Record<string, unknown>; tool: string; pre: Record<string, unknown>[]; post: Record<string, unknown>[]; briefs: string[]; demand: string }) {
  if (input.pre.length !== 1 || input.post.length !== 1 || input.briefs.length !== 1 || !input.demand) return false
  const pre = record(input.pre[0].input)
  const post = record(input.post[0].input)
  const prompt = input.stored.prompt
  if (pre.tool_name !== input.tool || post.tool_name !== input.tool || !isDeepStrictEqual(pre.tool_input, input.stored) || !isDeepStrictEqual(post.tool_input, input.stored) || typeof prompt !== "string" || input.briefs[0] !== prompt) return false
  const blocks: string[] = []
  const state: { fence?: { delimiter: string; start: number; owner: boolean } } = {}
  for (const line of prompt.matchAll(/[^\n]*(?:\n|$)/g)) {
    const fence = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)(?:\r?\n|$)/.exec(line[0])
    if (!fence) continue
    if (state.fence) {
      if (fence[1][0] !== state.fence.delimiter[0] || fence[1].length < state.fence.delimiter.length || !/^[ \t]*$/.test(fence[2])) continue
      if (state.fence.owner) blocks.push(prompt.slice(state.fence.start, line.index))
      state.fence = undefined
      continue
    }
    if (fence[1][0] === "`" && fence[2].includes("`")) continue
    state.fence = { delimiter: fence[1], start: line.index + line[0].length, owner: fence[1][0] === "`" && fence[2].trim() === "owner-demand" && fence[1].length >= demandFence(input.demand).length }
  }
  return !state.fence && blocks.length === 1 && Buffer.from(blocks[0]).equals(Buffer.from(input.demand))
}

export function demandFence(demand: string) {
  return "`".repeat([...demand.matchAll(/`+/g)].reduce((length, match) => Math.max(length, match[0].length), 2) + 1)
}

export function requestedModelsMatch(requested: string, init: unknown, parents: readonly unknown[], children: readonly unknown[], resolved: unknown) {
  // Qualification requires explicit canonical IDs; unknown shorthand aliases cannot establish the requested identity.
  return requested.startsWith("claude-") && init === requested && parents.length > 0 && children.length > 0 && parents.every((model) => model === requested) && children.every((model) => model === requested) && (resolved === undefined || resolved === requested)
}

export async function nativeEvidence(plan: Plan, hooks: Record<string, unknown>[], frames: Record<string, unknown>[], agentID: string | undefined) {
  const init = frames.find((frame) => frame.type === "system" && frame.subtype === "init" && frame.cwd === plan.project)
  const sessionID = init?.session_id
  const root = hooks.map((hook) => record(hook.input)).find((hook) => hook.session_id === sessionID && hook.cwd === plan.project && typeof hook.transcript_path === "string")
  const native: { source: string; frame: Record<string, unknown> }[] = []
  if (!root || typeof sessionID !== "string" || typeof root.transcript_path !== "string") return { native, entrypoints: [] }
  if (basename(root.transcript_path) !== `${sessionID}.jsonl` || (await lstat(root.transcript_path)).isSymbolicLink()) throw new Error("NATIVE_ROOT_TRANSCRIPT_IDENTITY_INVALID")
  const parentPath = await realpath(root.transcript_path)
  if (basename(parentPath) !== `${sessionID}.jsonl`) throw new Error("NATIVE_ROOT_TRANSCRIPT_IDENTITY_INVALID")
  const paths = [parentPath, ...hooks.flatMap((hook) => {
    const value = record(hook.input)
    return value.hook_event_name === "SubagentStop" && value.session_id === sessionID && value.agent_id === agentID && typeof value.agent_transcript_path === "string" && basename(value.agent_transcript_path) === `agent-${agentID}.jsonl` ? [value.agent_transcript_path] : []
  })]
  for (const file of [...new Set(paths)]) {
    if ((await lstat(file)).isSymbolicLink()) throw new Error("NATIVE_CHILD_TRANSCRIPT_SYMLINK")
    const path = await realpath(file)
    if (path !== parentPath && (!path.startsWith(join(dirname(parentPath), sessionID, "subagents") + "/") || basename(path) !== `agent-${agentID}.jsonl`)) throw new Error("NATIVE_TRANSCRIPT_ESCAPED_QUERY")
    native.push(...(await Bun.file(path).text()).trim().split("\n").filter(Boolean).map((line) => ({ source: path, frame: record(JSON.parse(line)) })))
  }
  const current = new Map(frames.filter((frame) => frame.type === "assistant" && !frame.parent_tool_use_id && frame.session_id === sessionID && typeof frame.uuid === "string" && frame.uuid.length > 0 && typeof record(frame.message).id === "string" && String(record(frame.message).id).length > 0 && typeof record(frame.message).model === "string" && String(record(frame.message).model).length > 0).map((frame) => [frame.uuid, frame]))
  const owned = native.filter((item) => {
    const sdk = current.get(item.frame.uuid)
    return item.source === parentPath && item.frame.type === "assistant" && item.frame.sessionId === sessionID && item.frame.cwd === plan.project && sdk && record(item.frame.message).id === record(sdk.message).id && record(item.frame.message).model === record(sdk.message).model
  })
  const entrypoints = [...new Set(owned.flatMap((item) => typeof item.frame.entrypoint === "string" ? [item.frame.entrypoint] : []))]
  return { native, entrypoints }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
