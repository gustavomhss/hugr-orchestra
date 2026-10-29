import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm"
import { Effect, Option } from "effect"
import type { BoardCi } from "./ci"
import {
  BoardAttemptTable,
  BoardBundleMemberTable,
  BoardBundleTable,
  BoardIssueTable,
  BoardQueueTable,
} from "./sql"
import { BoardSnapshot } from "./snapshot"
import { changed, log } from "./shared"
import type { IssueRow, ProjectRow } from "./shared"
import { AUTHOR, affected, decodeRollup, insertNote, judge, place, release } from "./queue-shared"
import type { Context } from "./queue-shared"
import type { makeRecord } from "./queue-record"
import type { makeRed } from "./queue-red"

/** Settling and closing a bundle: merge when green, give the members back when red. The red path and the record helpers come in from their modules. */
export function makeSettle(
  ctx: Context &
    Pick<ReturnType<typeof makeRecord>, "head" | "moved" | "note" | "describe"> &
    Pick<ReturnType<typeof makeRed>, "failures" | "baseState" | "scope" | "tryOn" | "isolate" | "bisect" | "fixCard" | "probe" | "flaky">,
) {
  const deps = ctx.deps
  const git = ctx.git
  const head = ctx.head
  const moved = ctx.moved
  const note = ctx.note
  const describe = ctx.describe
  const failures = ctx.failures
  const baseState = ctx.baseState
  const scope = ctx.scope
  const tryOn = ctx.tryOn
  const isolate = ctx.isolate
  const bisect = ctx.bisect
  const fixCard = ctx.fixCard
  const probe = ctx.probe
  const flaky = ctx.flaky

  /** The open bundle's next step: wait, merge when green, or give its members back when red. */
  const settle = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    directory: string,
    contract: BoardCi.Contract,
    bundle: typeof BoardBundleTable.$inferSelect,
  ) {
    if (!bundle.pr_number) return yield* dissolve(row, bundle, "The bundle PR was not opened.")
    const viewed = yield* deps.gh(["pr", "view", String(bundle.pr_number), "--repo", repo, "--json", "statusCheckRollup,headRefOid"])
    const rollup = viewed.exitCode === 0 ? Option.getOrUndefined(decodeRollup(viewed.stdout)) : undefined
    if (!rollup) return
    if (rollup.headRefOid !== bundle.head_sha) return yield* dissolve(row, bundle, "Someone pushed to the bundle branch.")
    const judged = judge(rollup.statusCheckRollup, contract)
    if (judged === "pending") return
    // Section 6.8: the fix card rides alone and is judged only on F, so a gate red elsewhere on base does not block it.
    const fixed =
      judged === "red" && bundle.failing && bundle.fix_issue_id && contract.scoped.tests !== null
        ? yield* tryOn(directory, contract.scoped.tests, bundle, bundle.failing, [bundle.head_sha])
        : undefined
    if (judged === "red" && bundle.failing && bundle.fix_issue_id && contract.scoped.tests !== null && fixed === undefined) return
    // Section 6.4: Maestro accepted this flaky bundle, so its red gate ships as tested.
    const verdict = bundle.status === "accepted" || fixed === true ? "green" : judged
    const members = yield* deps.quiet((tx) =>
      tx
        .select({ member: BoardBundleMemberTable, issue: BoardIssueTable })
        .from(BoardBundleMemberTable)
        .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardBundleMemberTable.issue_id))
        .where(eq(BoardBundleMemberTable.bundle_id, bundle.id))
        .orderBy(asc(BoardBundleMemberTable.position))
        .all(),
    )
    // A bundle with no members is a base probe: it never merges, it only says whether base is green.
    if (members.length === 0)
      return yield* close(row, repo, bundle, `probed ${contract.base} at ${bundle.base_sha.slice(0, 10)}`, verdict === "green" ? "probe-green" : "base-red")
    if (fixed === false) {
      yield* eject(row, bundle, members.map((item) => item.issue), `Bundle ${row.key}-B${bundle.n} carried this fix alone and ${bundle.failing?.flatMap((group) => group.files).join(", ")} still fail; it is back in Review.`, "fix did not turn its tests green")
      return yield* close(row, repo, bundle, "is red; the fix did not turn its tests green", "base-red")
    }
    if (verdict === "red") {
      const found = yield* failures(repo, rollup.statusCheckRollup, contract)
      const cause = found.files.length > 0 ? ` Failing: ${found.files.join(", ")}.` : ""
      const previous = found.infra
        ? yield* deps.quiet((tx) =>
            tx
              .select({ status: BoardBundleTable.status })
              .from(BoardBundleTable)
              .where(and(eq(BoardBundleTable.project_id, row.id), ne(BoardBundleTable.status, "open"), ne(BoardBundleTable.id, bundle.id)))
              .orderBy(desc(BoardBundleTable.n))
              .get(),
          )
        : undefined
      if (found.infra && previous?.status === "infra") {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} failed on infrastructure twice; the ${row.key} queue is paused until Maestro retries it, and this card stays queued.`),
          { discard: true },
        )
        yield* Effect.logWarning(`integration: ${row.key} queue paused, bundle ${row.key}-B${bundle.n} failed on infrastructure twice`)
        return yield* close(row, repo, bundle, "failed on infrastructure twice; the queue is paused", "paused")
      }
      if (found.infra) {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} failed on infrastructure, not code; the queue reruns it once and this card stays queued.`),
          { discard: true },
        )
        yield* deps.quiet((tx) =>
          tx.update(BoardQueueTable).set({ flush: true }).where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id))).run(),
        )
        return yield* close(row, repo, bundle, "failed on infrastructure; the queue reruns it", "infra")
      }
      const sha10 = bundle.base_sha.slice(0, 10)
      // F runs scoped only when every failing file is a bun test file under a package group; otherwise base is judged by its checks or a probe.
      const runnable =
        contract.scoped.tests !== null &&
        found.groups.length > 0 &&
        found.files.every((file) => found.groups.some((group) => group.files.includes(file.replaceAll("\\", "/"))))
      const scoped = runnable && contract.scoped.tests !== null ? yield* scope(directory, contract.scoped.tests, bundle, found.groups) : undefined
      if (scoped === "flaky") return yield* flaky(row, bundle, members.map((item) => item.issue), found.groups.flatMap((group) => group.files))
      const based = scoped ? (scoped === "base" ? "red" : "green") : yield* baseState(row, repo, bundle.base_sha, contract)
      if (based === "unknown") {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red and ${contract.base} at ${sha10} has no checks; the queue tests ${contract.base} alone first and this card stays queued.`),
          { discard: true },
        )
        yield* deps.quiet((tx) =>
          tx.update(BoardQueueTable).set({ flush: true }).where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id))).run(),
        )
        yield* close(row, repo, bundle, `is red; the queue tests ${contract.base} alone first`, "probing")
        return yield* probe(row, repo, directory, contract, bundle)
      }
      if (based === "red") {
        // Section 6.8: F fails on base itself, so its culprit is bisected and a fix card opens; the bundle is not blamed.
        if (scoped === "base" && contract.scoped.tests !== null) {
          const culprit = yield* bisect(row, directory, contract.scoped.tests, bundle, found.groups)
          const fix = yield* fixCard(row, contract.base, culprit, found.groups)
          yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ culprit: culprit ?? null, failing: found.groups, fix_issue_id: fix }).where(eq(BoardBundleTable.id, bundle.id)).run())
          yield* Effect.logWarning(`integration: ${row.key} ${contract.base} is red at ${sha10}${culprit ? `, first failing at ${culprit.slice(0, 10)}` : ""}; only its fix card is cut until it is green`)
        }
        yield* Effect.forEach(
          members,
          (item) =>
            note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red, and so does ${contract.base} at ${sha10}; this card stays queued until ${contract.base} is green.`),
          { discard: true },
        )
        return yield* close(row, repo, bundle, `is red because ${contract.base} at ${sha10} is red`, "base-red")
      }
      // Section 6.3 steps 3-6: a code red that ran scoped is searched with scoped runs, not halved through full gates.
      if (scoped === "code" && members.length > 1 && contract.scoped.tests !== null) {
        if (bundle.rebuilds >= 2) return yield* hold(row, repo, bundle, members, "went red after two rebuilds")
        const isolated = yield* isolate(directory, contract.scoped.tests, bundle, found.groups, members)
        if (isolated?.culprits.length === 0) return yield* hold(row, repo, bundle, members, "went red and halving found no culprit")
        if (isolated) {
          const culprits = isolated.culprits
          const fileList = found.groups.flatMap((group) => group.files).join(", ")
          // A culprit found by halving fails only once merged after earlier members, never alone.
          const where =
            isolated.after.length > 0
              ? `once merged after ${isolated.after.map((issue) => `${row.key}-${issue.number}`).join(", ")}`
              : `on ${contract.base} alone`
          yield* eject(
            row,
            bundle,
            culprits,
            `Bundle ${row.key}-B${bundle.n} went red, and this card fails ${fileList} ${where}; it is back in Review.`,
            isolated.after.length > 0 ? "failed its scoped tests after earlier members" : "failed its scoped tests alone",
          )
          const keys = culprits.map((issue) => `${row.key}-${issue.number}`).join(", ")
          const rest = members.filter((item) => !culprits.some((culprit) => culprit.id === item.issue.id))
          yield* deps.quiet((tx) =>
            tx
              .update(BoardQueueTable)
              .set({ flush: true })
              .where(inArray(BoardQueueTable.issue_id, rest.map((item) => item.issue.id)))
              .run(),
          )
          yield* Effect.forEach(
            rest,
            (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red; ${keys} failed alone and left it, and the queue rebuilds it with this card.`),
            { discard: true },
          )
          return yield* close(row, repo, bundle, `is red; ${keys} ejected, the queue rebuilds it`, "isolated")
        }
      }
      if (members.length > 1) {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red on its full gate; the queue splits it to find the cause and this card stays queued.${cause}`),
          { discard: true },
        )
        // Flush keeps the surviving half due next tick, even after its first half merges and the rest is below full size.
        yield* deps.quiet((tx) =>
          tx.update(BoardQueueTable).set({ flush: true }).where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id))).run(),
        )
        return yield* close(row, repo, bundle, "is red; the queue splits it to find the cause", "red")
      }
      yield* eject(row, bundle, members.map((item) => item.issue), `Bundle ${row.key}-B${bundle.n} went red with only this card on ${contract.base} at ${sha10}; it is back in Review.${cause}`, "red alone on the full gate")
      return yield* close(row, repo, bundle, "is red", "red")
    }
    // Section 6.6: a member head that moved since assembly dequeues that member and the bundle is rebuilt.
    const heads = yield* Effect.forEach(members, (item) =>
      head(directory, repo, item.issue.pr_number ?? 0).pipe(
        Effect.map((current) => ({ item, sha: current.sha as string | undefined })),
        Effect.orElseSucceed(() => ({ item, sha: undefined })),
      ),
    )
    const stale = heads.filter((entry) => entry.sha !== entry.item.member.head_sha)
    if (stale.length > 0) {
      yield* Effect.forEach(stale, (entry) => moved(row, entry.item.issue, entry.sha), { discard: true })
      return yield* dissolve(row, bundle, `${stale.map((entry) => `${row.key}-${entry.item.issue.number}`).join(", ")} moved after assembly.`)
    }
    yield* git(directory, ["fetch", "--quiet", "--no-tags", "origin", contract.base])
    const tip = (yield* git(directory, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${contract.base}`])).out
    if (!tip) return
    // Section 8.5: a host that died after pushing base but before writing the rows finds the bundle already in base,
    // so it only records the merge: no second push and no rebuilt bundle.
    const already = tip !== bundle.base_sha && (yield* git(directory, ["merge-base", "--is-ancestor", bundle.head_sha, tip])).code === 0
    const landed = already
      ? { target: tip, on: null }
      : tip === bundle.base_sha
        ? { target: bundle.head_sha, on: null }
        : yield* skew(directory, contract, bundle, tip, row)
    if (!landed) return yield* dissolve(row, bundle, `${contract.base} moved to ${tip.slice(0, 10)}; the bundle is rebuilt and retested.`)
    const pushed = already
      ? { code: 0 }
      : yield* git(directory, [
          "push",
          "--quiet",
          `--force-with-lease=refs/heads/${contract.base}:${landed.on ?? bundle.base_sha}`,
          "origin",
          `${landed.target}:refs/heads/${contract.base}`,
        ])
    if (pushed.code !== 0) return
    const shipped = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        yield* tx
          .update(BoardBundleTable)
          .set({ status: "merged", merged_on: landed.on })
          .where(eq(BoardBundleTable.id, bundle.id))
          .run()
        return yield* Effect.forEach(members, (item) =>
          Effect.gen(function* () {
            yield* tx
              .update(BoardAttemptTable)
              .set({ outcome: "merged" })
              .where(and(eq(BoardAttemptTable.issue_id, item.issue.id), isNull(BoardAttemptTable.outcome)))
              .run()
            yield* tx.delete(BoardQueueTable).where(eq(BoardQueueTable.issue_id, item.issue.id)).run()
            const moving = yield* place(tx, row, item.issue, "shipped")
            const activity = yield* log(tx, {
              project: row.id,
              issue: item.issue.id,
              actor: "github",
              action: "bundle.merge",
              before: moving.before,
              after: { ...moving.after, bundle: bundle.n, merged: landed.target, ...(landed.on ? { on: landed.on } : {}) },
            })
            return changed(row.id, activity, item.issue.id)
          }),
        )
      }),
    )
    yield* Effect.forEach(shipped, deps.publish, { discard: true })
    yield* git(directory, ["push", "--quiet", "origin", "--delete", bundle.branch])
    // Snapshot refs go only once the merge is on the remote, and only for shipped cards.
    yield* Effect.forEach(
      members,
      (item) =>
        Effect.gen(function* () {
          const remote = contract.snapshots.remote
          const refs = (yield* git(directory, ["ls-remote", remote, `refs/orchestra/wip/${row.key}-${item.issue.number}/*`])).out
            .split("\n")
            .map((line) => line.split("\t")[1])
            .filter((name): name is string => Boolean(name))
          if (refs.length > 0) yield* git(directory, ["push", "--quiet", remote, "--delete", ...refs])
          yield* describe(row, item.issue.id, contract.base)
        }),
      { discard: true },
    )
  })

  /**
   * Section 6.5 `merge-if-disjoint`: the merge commit of the tested head onto the new tip, when the two merge clean and
   * what moved base does not overlap what the bundle changed. Undefined means retest.
   */
  const skew = Effect.fnUntraced(function* (
    directory: string,
    contract: BoardCi.Contract,
    bundle: typeof BoardBundleTable.$inferSelect,
    tip: string,
    row: ProjectRow,
  ) {
    if (contract.bundle.onBaseMoved !== "merge-if-disjoint") return undefined
    const merged = yield* git(directory, ["merge-tree", "--write-tree", tip, bundle.head_sha])
    if (merged.code !== 0) return undefined
    const theirs = (yield* git(directory, ["diff", "--name-only", `${bundle.base_sha}..${tip}`])).out.split("\n").filter(Boolean)
    const ours = (yield* git(directory, ["diff", "--name-only", `${bundle.base_sha}..${bundle.head_sha}`])).out.split("\n").filter(Boolean)
    if (theirs.some((file) => ours.includes(file))) return undefined
    const graph = (yield* git(directory, ["cat-file", "-e", `${tip}:turbo.json`])).code === 0
    if (graph) {
      const left = yield* affected(deps, directory, bundle.base_sha, tip)
      const right = yield* affected(deps, directory, bundle.base_sha, bundle.head_sha)
      if (!left || !right || left.some((name) => right.includes(name))) return undefined
    }
    const commit = yield* git(directory, [
      ...AUTHOR,
      "commit-tree",
      merged.out.split("\n")[0] ?? "",
      "-p",
      tip,
      "-p",
      bundle.head_sha,
      "-m",
      `Merge bundle ${row.key}-B${bundle.n} onto ${contract.base}\n\nTested on ${bundle.base_sha}, merged on ${tip}.`,
    ])
    if (commit.code !== 0 || !commit.out) return undefined
    return { target: commit.out, on: tip }
  })

  /** Closes the bundle PR and branch; its members stay queued and the next tick cuts again. */
  const dissolve = Effect.fnUntraced(function* (row: ProjectRow, bundle: typeof BoardBundleTable.$inferSelect, reason: string) {
    const published = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const members = yield* tx
          .select({ issue: BoardBundleMemberTable.issue_id })
          .from(BoardBundleMemberTable)
          .where(eq(BoardBundleMemberTable.bundle_id, bundle.id))
          .all()
        return yield* Effect.forEach(members, (member) =>
          log(tx, { project: row.id, issue: member.issue, actor: "github", action: "bundle.dissolve", reason, after: { bundle: bundle.n } }).pipe(
            Effect.map((activity) => changed(row.id, activity, member.issue)),
          ),
        )
      }),
    )
    yield* Effect.forEach(published, deps.publish, { discard: true })
    if (row.github_repo) yield* close(row, row.github_repo, bundle, "dissolved")
  })

  const close = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    why: string,
    status: typeof BoardBundleTable.$inferSelect.status = "dissolved",
  ) {
    yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ status }).where(eq(BoardBundleTable.id, bundle.id)).run())
    if (bundle.pr_number)
      yield* deps.gh(["pr", "close", String(bundle.pr_number), "--repo", repo, "--delete-branch", "--comment", `Bundle ${row.key}-B${bundle.n} ${why}.`])
  })

  /** Gives each issue back to Review with `text` and releases its queue row; the caller decides the bundle's fate. */
  const eject = Effect.fnUntraced(function* (row: ProjectRow, bundle: typeof BoardBundleTable.$inferSelect, issues: ReadonlyArray<IssueRow>, text: string, reason: string) {
    const back = yield* deps.quiet((tx) =>
      Effect.forEach(issues, (issue) =>
        Effect.gen(function* () {
          yield* insertNote(tx, row, issue, text)
          yield* tx
            .update(BoardAttemptTable)
            .set({ outcome: "ejected" })
            .where(and(eq(BoardAttemptTable.issue_id, issue.id), isNull(BoardAttemptTable.outcome)))
            .run()
          yield* BoardSnapshot.dispatch(tx, issue, { cause: `ejected:${row.key}-B${bundle.n}` })
          return yield* release(tx, row, issue, "github", "bundle.dissolve", reason)
        }),
      ),
    )
    yield* Effect.forEach(back, deps.publish, { discard: true })
  })

  /** Section 6.3: a dissolved bundle's cards stay held until Maestro releases them one at a time with `board_bundle`. */
  const hold = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    members: ReadonlyArray<{ readonly member: typeof BoardBundleMemberTable.$inferSelect; readonly issue: IssueRow }>,
    why: string,
  ) {
    yield* deps.quiet((tx) =>
      tx
        .update(BoardQueueTable)
        .set({ hold: "held" })
        .where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id)))
        .run(),
    )
    yield* Effect.forEach(
      members,
      (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} ${why}; it dissolved and this card is held until Maestro releases it with board_bundle.`),
      { discard: true },
    )
    yield* Effect.logWarning(`integration: ${row.key}-B${bundle.n} ${why}; its cards are held. Release them one at a time with board_bundle, dequeue a suspect, or send F to jimmy.`)
    return yield* close(row, repo, bundle, why)
  })

  return { settle, dissolve, close }
}
