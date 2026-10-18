import { createMemo, type Accessor } from "solid-js"
import { createQuery, skipToken, useQueryClient } from "@tanstack/solid-query"
import { debounce } from "@solid-primitives/scheduled"
import type { VcsFileDiff } from "../../compat/sdk-v2"
import { Button } from "@orchestra/ui/button"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { sessionRecoveryLanguage } from "@/i18n/session-recovery"
import { formatServerError } from "@/utils/server-errors"
import { reviewDiffDirectory, reviewDiffNeedsLoad, reviewRootDirectory } from "./v2/review-diff-kinds"

type VcsMode = "git" | "branch"

export function createSessionVcsReview(input: {
  mode: Accessor<"git" | "branch" | "turn">
  wantsReview: Accessor<boolean>
}) {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const sync = useSync()
  const language = sessionRecoveryLanguage(useLanguage())
  const queryClient = useQueryClient()
  const mode = createMemo<VcsMode | undefined>(() => {
    const value = input.mode()
    if (value === "git" || value === "branch") return value
  })
  const key = createMemo(
    () =>
      [
        serverSDK().scope,
        "session-vcs",
        sdk().directory,
        sync().data.vcs?.branch ?? "",
        sync().data.vcs?.default_branch ?? "",
      ] as const,
  )
  const query = createQuery(() => {
    const value = mode()
    const client = sdk()
    const enabled = input.wantsReview() && sync().project?.vcs === "git"

    return {
      queryKey: [...key(), value] as const,
      enabled,
      queryFn: value
        ? () =>
            client.api.vcs
              .diff({ location: { directory: client.directory }, mode: value === "git" ? "working" : value })
              .then((result) => result.data)
        : skipToken,
    }
  })
  const retry = () => void queryClient.invalidateQueries({ queryKey: key() })
  const failed = () => !!mode() && query.isError
  const diffs = () => {
    if (failed()) return []
    // Avoid reading a pending query's data and suspending the session route.
    return query.isFetched ? (query.data ?? []) : []
  }
  const loadDiff = async (file: string, version?: number): Promise<VcsFileDiff | undefined> => {
    const value = mode()
    if (!value) return
    const client = sdk()
    const requestKey = [...key(), value] as const
    const root = reviewRootDirectory(sync().project?.worktree ?? client.directory)
    const directory = reviewDiffDirectory(root, file)
    const source = diffs().find((diff) => diff.file === file)
    const valid = (diff: VcsFileDiff | undefined) => {
      if (!diff || !source) return
      if (diff.additions !== source.additions || diff.deletions !== source.deletions) return
      if (reviewDiffNeedsLoad(diff)) return
      return diff
    }
    const request = (scope: string, context?: number) =>
      queryClient
        .fetchQuery({
          queryKey: [...requestKey, "directory", scope, context, version] as const,
          staleTime: Number.POSITIVE_INFINITY,
          retry: 2,
          queryFn: () =>
            client.api.vcs
              .diff({
                location: { directory: scope },
                mode: value === "git" ? "working" : value,
                context,
              })
              .then((result) => result.data),
        })
        .then((items) => items.find((diff) => diff.file === file))

    if (directory !== root) {
      try {
        const scoped = valid(await request(directory))
        if (scoped) return scoped
      } catch (error) {
        console.debug("[session-review] failed to load scoped vcs diff", { mode: value, file, directory, error })
      }
    }
    const bounded = valid(await request(root, 3))
    if (bounded) return bounded
    await queryClient.invalidateQueries({ queryKey: [...requestKey, "directory"], refetchType: "none" })
    throw new Error(language.t("session.review.detailFailed", { file }))
  }

  return {
    query,
    diffs,
    failed,
    loadDiff,
    ready: () => !mode() || !query.isPending,
    refresh: debounce(retry, 100),
    error: () => <SessionVcsReviewError error={query.error} pending={query.isFetching} onRetry={retry} />,
  }
}

function SessionVcsReviewError(props: { error: unknown; pending: boolean; onRetry: () => void }) {
  const language = sessionRecoveryLanguage(useLanguage())
  return (
    <div role="alert" class="flex flex-col items-center gap-3 px-6 py-4 text-text-weak">
      <div>{language.t("common.requestFailed")}</div>
      <div>{formatServerError(props.error, language.t, language.t("common.requestFailed"))}</div>
      <Button disabled={props.pending} onClick={props.onRetry}>
        {language.t("common.retry")}
      </Button>
    </div>
  )
}
