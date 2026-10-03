import { useParams } from "@solidjs/router"
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

export type ReplayBlock = "session" | "workdir" | "blocked" | "busy" | "model"
export type EvidenceOwner = ReturnType<ReturnType<typeof createSessionOwnership>["capture"]>
export type PullRequestContext = { source: EvidenceSource; result?: string }
export type ReplayResult =
  | { status: "sent" }
  | { status: "blocked"; reason: ReplayBlock }
  | { status: "unknown"; detail: string }
export type EvidenceComposerActions = ReturnType<typeof createEvidenceComposerActions>

// Replay and pull-request preparation for execution evidence. Neither path calls the
// normal submit: the draft (text, attachments, context and mode) is never cleared, and
// nothing is sent until the user presses send in the composer.
export function createEvidenceComposerActions(input: { sessionKey: () => string; blocked: () => boolean }) {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const sync = useSync()
  const local = useLocal()
  const prompt = usePrompt()
  const command = useCommand()
  const language = useLanguage()
  const params = useParams()
  const ownership = createSessionOwnership(input.sessionKey)

  const replayBlocked = (source: EvidenceSource) =>
    replayBlock({
      source,
      current: { scope: sdk().scope, directory: sdk().directory, sessionID: params.id },
      busy: sync().data.session_working(source.sessionID),
      blocked: input.blocked(),
      ready: !!local.agent.current() && !!local.model.current(),
    })

  return {
    capture: () => ownership.capture(),
    server: () => serverName(serverSDK().server),
    sessionTitle: (sessionID: string) => sync().session.get(sessionID)?.title,
    replayBlocked,
    async replay(source: EvidenceSource, owner: EvidenceOwner): Promise<ReplayResult> {
      const reason = owner.current() ? replayBlocked(source) : "session"
      const agent = local.agent.current()
      const model = local.model.current()
      if (reason || !agent || !model) return { status: "blocked", reason: reason ?? "model" }
      return submitShellCommand({
        api: sdk().api.session,
        sessionID: source.sessionID,
        command: source.command,
        agent: agent.name,
        model: { providerID: model.provider.id, modelID: model.id },
      })
        .then(() => ({ status: "sent" as const }))
        .catch((error: unknown) => ({
          status: "unknown" as const,
          detail: formatServerError(error, language.t, language.t("common.requestFailed")),
        }))
    },
    // "shell": the composer would run the request as a command; "draft": ask before appending.
    pullRequestState(): "ready" | "draft" | "shell" {
      if (command.options.some((option) => option.id === "prompt.mode.normal" && !option.disabled)) return "shell"
      const target = prompt.capture()
      return draftBlank(target.current()) && target.context.items().length === 0 ? "ready" : "draft"
    },
    preparePullRequest(context: PullRequestContext, owner: EvidenceOwner) {
      if (!owner.current() || params.id !== context.source.sessionID) return false
      const session = sync().session.get(context.source.sessionID)
      const text = pullRequestRequest({
        title: session?.title,
        branch: sync().data.vcs?.branch,
        summary: session?.summary,
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
  blocked: boolean
  ready: boolean
}): ReplayBlock | undefined {
  const current = input.current
  if (input.source.scope !== current.scope || input.source.sessionID !== current.sessionID) return "session"
  if (input.source.directory !== current.directory) return "session"
  // The shell request has no workdir: only runs that used the session directory can repeat exactly.
  if (input.source.workdir !== undefined && !sameDirectory(input.source.workdir, input.source.directory))
    return "workdir"
  if (input.blocked) return "blocked"
  if (input.busy) return "busy"
  if (!input.ready) return "model"
}

export function sameDirectory(left: string, right: string) {
  const a = canonicalDirectory(left)
  return a !== undefined && a === canonicalDirectory(right)
}

// Relative or dot-segment paths are not resolved here; they never count as the same directory.
function canonicalDirectory(path: string) {
  const value = path.replace(/\\/g, "/").replace(/\/{2,}/g, "/")
  const windows = /^[A-Za-z]:\//.test(value)
  if (!windows && !value.startsWith("/")) return
  if (value.split("/").some((segment) => segment === "." || segment === "..")) return
  const trimmed = value.length > 1 ? value.replace(/\/+$/, "") : value
  return windows ? trimmed.toLowerCase() : trimmed
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
  command: string
  result?: string
  t: ReturnType<typeof useLanguage>["t"]
}) {
  const files = [...new Set((input.summary?.diffs ?? []).flatMap((diff) => (diff.file ? [diff.file] : [])))]
  const shown = files.slice(0, 20)
  return [
    input.t("orchestra.pr.request"),
    "",
    input.title ? input.t("orchestra.pr.request.title", { title: input.title }) : undefined,
    input.branch ? input.t("orchestra.pr.request.branch", { branch: input.branch }) : undefined,
    input.summary
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
  ]
    .filter((line) => line !== undefined)
    .join("\n")
}
