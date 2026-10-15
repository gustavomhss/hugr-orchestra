import { useParams } from "@solidjs/router"
import { createStore } from "solid-js/store"
import { onCleanup } from "solid-js"
import { submitShellCommand } from "@/components/prompt-input/submit"
import { promptLength } from "@/components/prompt-input/history"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLocal } from "@/context/local"
import { type Prompt, usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { serverName } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useSync } from "@/context/sync"
import { formatServerError } from "@/utils/server-errors"
import type { EvidenceSource } from "../orchestra-evidence-data"
import { createSessionOwnership } from "../session-ownership"
import { agentKey } from "@/context/agent-identity"

export type ReplayBlock = "session" | "workdir" | "blocked" | "busy" | "pending" | "model"
export type EvidenceOwner = ReturnType<ReturnType<typeof createSessionOwnership>["capture"]>
export type PullRequestContext = { source: EvidenceSource; result?: string }
export type ReplayResult =
  | { status: "sent" }
  | { status: "blocked"; reason: ReplayBlock }
  | { status: "unknown"; detail: string }
export type EvidenceComposerActions = ReturnType<typeof createEvidenceComposerActions>
type EvidenceDiff = { file?: string; additions?: number; deletions?: number }

// Replay and pull-request preparation for execution evidence. Neither path calls the
// normal submit: the draft (text, attachments, context and mode) is never cleared.
// Replay requires confirmation; PR preparation requires a separate composer send.
export function createEvidenceComposerActions(input: {
  sessionKey: () => string
  blocked: () => boolean
  diffs: () => EvidenceDiff[]
}) {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const sync = useSync()
  const local = useLocal()
  const prompt = usePrompt()
  const command = useCommand()
  const language = useLanguage()
  const params = useParams()
  const ownership = createSessionOwnership(() => `${input.sessionKey()}\0${sdk().directory}`)
  const [state, setState] = createStore({ pending: {} as Record<string, boolean>, disposed: false })
  onCleanup(() => setState("disposed", true))
  const currentSession = () => ({
    scope: sdk().scope,
    directory: sync().session.get(params.id ?? "")?.directory === sdk().directory ? sdk().directory : "",
    sessionID: params.id,
  })

  const replayBlocked = (source: EvidenceSource) =>
    replayBlock({
      source,
      current: currentSession(),
      pending: !!state.pending[replayKey(source)],
      busy: sync().data.session_working(source.sessionID),
      blocked: input.blocked(),
      ready: !!local.agent.current() && !!local.model.current(),
    })
  const pullRequestState = (): "ready" | "draft" | "shell" => {
    if (command.options.some((option) => option.id === "prompt.mode.normal" && !option.disabled)) return "shell"
    const target = prompt.capture()
    return draftBlank(target.current()) && target.context.items().length === 0 ? "ready" : "draft"
  }

  return {
    capture: () => {
      const owner = ownership.capture()
      // Dialogs outlive a disposed session page. Publish invalidation reactively so
      // switching servers closes them even when the old context stops updating.
      return { ...owner, current: () => !state.disposed && owner.current() }
    },
    server: () => serverName(serverSDK().server),
    sessionTitle: (sessionID: string) => sync().session.get(sessionID)?.title,
    replayBlocked,
    async replay(source: EvidenceSource, owner: EvidenceOwner): Promise<ReplayResult> {
      const reason = owner.current() ? replayBlocked(source) : "session"
      const agent = local.agent.current()
      const model = local.model.current()
      if (reason || !agent || !model) return { status: "blocked", reason: reason ?? "model" }
      const key = replayKey(source)
      setState("pending", key, true)
      return submitShellCommand({
        api: sdk().api.session,
        sessionID: source.sessionID,
        command: source.command,
        agent: agentKey(agent),
        model: { providerID: model.provider.id, modelID: model.id },
      })
        .then(() => ({ status: "sent" as const }))
        .catch((error: unknown) => ({
          status: "unknown" as const,
          detail: formatServerError(error, language.t, language.t("common.requestFailed")),
        }))
        .finally(() => setState("pending", key, false))
    },
    // "shell": the composer would run the request as a command; "draft": ask before appending.
    pullRequestState,
    preparePullRequest(context: PullRequestContext, owner: EvidenceOwner) {
      if (
        !owner.current() ||
        !evidenceSessionMatches(context.source, currentSession()) ||
        pullRequestState() === "shell"
      )
        return false
      const session = sync().session.get(context.source.sessionID)
      const text = pullRequestRequest({
        title: session?.title,
        branch: sync().data.vcs?.branch,
        summary: session?.summary,
        diffs: input.diffs(),
        command: context.source.command,
        result: context.result,
        t: language.t,
      })
      // Re-read the draft at insertion time so edits made while a confirmation was open survive.
      const target = prompt.capture()
      const current = target.current()
      const next = draftBlank(current)
        ? [{ type: "text" as const, content: text, start: 0, end: text.length }]
        : appendText(current, text)
      target.set(next, promptLength(next))
      command.trigger("input.focus")
      return true
    },
  }
}

export function replayBlock(input: {
  source: EvidenceSource
  current: { scope: string; directory: string; sessionID?: string }
  busy: boolean
  pending?: boolean
  blocked: boolean
  ready: boolean
}): ReplayBlock | undefined {
  if (!evidenceSessionMatches(input.source, input.current)) return "session"
  // The shell request has no workdir: only runs that used the session directory can repeat exactly.
  if (input.source.workdir !== undefined && !sameDirectory(input.source.workdir, input.source.directory))
    return "workdir"
  if (input.blocked) return "blocked"
  if (input.pending) return "pending"
  if (input.busy) return "busy"
  if (!input.ready) return "model"
}

export function evidenceSessionMatches(
  source: EvidenceSource,
  current: { scope: string; directory: string; sessionID?: string },
) {
  return (
    !!source.scope &&
    !!source.sessionID &&
    directoryIdentity(source.directory) !== undefined &&
    source.scope === current.scope &&
    source.sessionID === current.sessionID &&
    source.directory === current.directory
  )
}

export function sameDirectory(workdir: string, directory: string) {
  const target = directoryIdentity(directory)
  return target !== undefined && (workdir === "." || directoryIdentity(workdir) === target)
}

// This is a spelling comparison, not filesystem canonicalization. Parent traversal
// can cross symlinks; repeated separators can change root kind; case can matter.
function directoryIdentity(path: string) {
  if (!path || /[\0\r\n]/.test(path)) return
  const windows = /^[A-Za-z]:[\\/]/.test(path)
  if (!windows && !path.startsWith("/")) return
  // Slash-rooted UNC spelling is opaque: do not infer Windows equivalence, but
  // reject traversal under either possible separator interpretation.
  if (
    path.split(windows || path.startsWith("//") ? /[\\/]/ : /\//).some((segment) => segment === "." || segment === "..")
  )
    return
  const value = windows ? path.replace(/\\/g, "/") : path
  const root = windows ? 3 : value.match(/^\/+/)![0].length
  return value.length > root && value.endsWith("/") ? value.slice(0, -1) : value
}

function replayKey(source: EvidenceSource) {
  return `${source.scope}\0${source.directory}\0${source.sessionID}`
}

export function draftBlank(prompt: Prompt) {
  return prompt.every((part) => part.type !== "image" && !part.content.trim())
}

// Appends after the last inline part so mentions, images and their order stay untouched.
export function appendText(prompt: Prompt, text: string): Prompt {
  const start = promptLength(prompt)
  const addition = `${start > 0 ? "\n\n" : ""}${text}`
  const index = prompt.findLastIndex((part) => part.type !== "image")
  const last = prompt[index]
  if (last?.type === "text")
    return prompt.map((part, position) =>
      position === index ? { ...last, content: last.content + addition, end: last.end + addition.length } : part,
    )
  return prompt.toSpliced(index + 1, 0, { type: "text", content: addition, start, end: start + addition.length })
}

export function pullRequestRequest(input: {
  title?: string
  branch?: string
  summary?: { files: number; additions: number; deletions: number; diffs?: { file?: string }[] }
  diffs?: EvidenceDiff[]
  command: string
  result?: string
  t: ReturnType<typeof useLanguage>["t"]
}) {
  const diffs = input.diffs?.length ? [...new Map(input.diffs.map((diff) => [diff.file, diff])).values()] : undefined
  const files = [...new Set((diffs ?? input.summary?.diffs ?? []).flatMap((diff) => (diff.file ? [diff.file] : [])))]
  const shown = files.slice(0, 20)
  const measured = diffs?.every((diff) =>
    [diff.additions, diff.deletions].every((value) => Number.isSafeInteger(value) && value! >= 0),
  )
  return [
    input.t("orchestra.pr.request"),
    "",
    input.title ? input.t("orchestra.pr.request.title", { title: input.title }) : undefined,
    input.branch ? input.t("orchestra.pr.request.branch", { branch: input.branch }) : undefined,
    diffs && measured
      ? input.t("orchestra.pr.request.review", {
          files: files.length,
          additions: diffs.reduce((sum, diff) => sum + diff.additions!, 0),
          deletions: diffs.reduce((sum, diff) => sum + diff.deletions!, 0),
        })
      : input.summary
        ? input.t("orchestra.pr.request.changes", {
            files: input.summary.files,
            additions: input.summary.additions,
            deletions: input.summary.deletions,
          })
        : undefined,
    shown.length > 0
      ? input.t("orchestra.pr.request.files", {
          files: shown.join(", ") + (files.length > shown.length ? ` (+${files.length - shown.length})` : ""),
        })
      : undefined,
    input.t(input.result ? "orchestra.pr.request.tests" : "orchestra.pr.request.command", {
      command: input.command,
      result: input.result ?? "",
    }),
    input.t("orchestra.evidence.revisionUnlinked"),
  ]
    .filter((line) => line !== undefined)
    .join("\n")
}
