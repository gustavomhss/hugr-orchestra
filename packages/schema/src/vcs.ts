export * as Vcs from "./vcs"

// The version-control answers the server gives about a working directory: its branch, changed files, diffs and commit
// activity.

import { Schema } from "effect"

export const Mode = Schema.Literals(["git", "branch"])
export type Mode = Schema.Schema.Type<typeof Mode>

export const Info = Schema.Struct({
  branch: Schema.optional(Schema.String),
  default_branch: Schema.optional(Schema.String),
}).annotate({ identifier: "VcsInfo" })
export type Info = Schema.Schema.Type<typeof Info>

export const FileDiff = Schema.Struct({
  file: Schema.String,
  // Mirrors Snapshot.FileDiff (see #26574). The current producer always
  // populates patch, but loosening matches the sibling schema so a
  // future code path that omits it can't crash /instance/vcs/diff.
  patch: Schema.optional(Schema.String),
  additions: Schema.Finite,
  deletions: Schema.Finite,
  status: Schema.optional(Schema.Literals(["added", "deleted", "modified"])),
}).annotate({ identifier: "VcsFileDiff" })
export type FileDiff = Schema.Schema.Type<typeof FileDiff>

export const FileStatus = Schema.Struct({
  file: Schema.String,
  additions: Schema.Finite,
  deletions: Schema.Finite,
  status: Schema.Literals(["added", "deleted", "modified"]),
}).annotate({ identifier: "VcsFileStatus" })
export type FileStatus = Schema.Schema.Type<typeof FileStatus>

export const ApplyInput = Schema.Struct({
  patch: Schema.String,
})
export type ApplyInput = Schema.Schema.Type<typeof ApplyInput>

export const ApplyResult = Schema.Struct({
  applied: Schema.Boolean,
})
export type ApplyResult = Schema.Schema.Type<typeof ApplyResult>

export type ActivityInput = {
  readonly since: number
  readonly until: number
}

export const ActivityTotals = Schema.Struct({
  commits: Schema.Finite,
  merges: Schema.Finite,
  authors: Schema.Finite,
  additions: Schema.Finite,
  deletions: Schema.Finite,
  filesChanged: Schema.Finite,
}).annotate({ identifier: "VcsActivityTotals" })

export const ActivityDay = Schema.Struct({
  day: Schema.String.annotate({ description: "Server-local YYYY-MM-DD of the commit author time" }),
  commits: Schema.Finite,
  merges: Schema.Finite,
  additions: Schema.Finite,
  deletions: Schema.Finite,
}).annotate({ identifier: "VcsActivityDay" })

export const ActivityPath = Schema.Struct({
  path: Schema.String,
  changes: Schema.Finite,
}).annotate({ identifier: "VcsActivityPath" })

export const ActivityCommit = Schema.Struct({
  hash: Schema.String,
  subject: Schema.String,
  time: Schema.Finite,
}).annotate({ identifier: "VcsActivityCommit" })

export const Activity = Schema.Struct({
  repository: Schema.Boolean,
  since: Schema.Finite,
  until: Schema.Finite,
  totals: ActivityTotals,
  days: Schema.Array(ActivityDay),
  topPaths: Schema.Array(ActivityPath),
  recent: Schema.Array(ActivityCommit),
  ahead: Schema.NullOr(Schema.Finite),
  behind: Schema.NullOr(Schema.Finite),
  truncated: Schema.Boolean.annotate({ description: "True when a commit, output or time bound cut any scan short" }),
  partial: Schema.Struct({
    commits: Schema.Boolean,
    lines: Schema.Boolean,
  }).annotate({ identifier: "VcsActivityPartial" }),
}).annotate({ identifier: "VcsActivity" })
export type Activity = Schema.Schema.Type<typeof Activity>
