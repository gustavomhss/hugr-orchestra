export type PullRequestFile = { file: string; additions?: number; deletions?: number }

export type PullRequestProposal = {
  title: string
  from: string
  base: string
  description: string
}

type Copy = {
  summary: string
  files: string
  noFiles: string
}

// The proposal starts from what the session really has: its title, its branches and the files the
// Review rail lists. Counts appear only when the diff measured them.
export function pullRequestProposal(input: {
  title?: string
  branch?: string | null
  base?: string | null
  files: PullRequestFile[]
  copy: Copy
}): PullRequestProposal {
  const files = [...new Map(input.files.map((item) => [item.file, item])).values()]
  const title = input.title?.trim() ?? ""
  const lines = files.map((item) => {
    const measured = [item.additions, item.deletions].every((value) => Number.isSafeInteger(value) && value! >= 0)
    return measured ? `- ${codeSpan(item.file)} (+${item.additions} −${item.deletions})` : `- ${codeSpan(item.file)}`
  })
  return {
    title,
    from: input.branch ?? "",
    base: input.base ?? "",
    description: [
      input.copy.summary,
      ...(title ? [`- ${title}`] : []),
      "",
      input.copy.files,
      ...(lines.length > 0 ? lines : [`- ${input.copy.noFiles}`]),
    ].join("\n"),
  }
}

export function pullRequestMarkdown(proposal: PullRequestProposal) {
  const branches =
    proposal.from.trim() && proposal.base.trim()
      ? `${codeSpan(proposal.from.trim())} → ${codeSpan(proposal.base.trim())}`
      : ""
  return [`# ${proposal.title.trim()}`, ...(branches ? ["", branches] : []), "", proposal.description.trim(), ""].join(
    "\n",
  )
}

export function pullRequestFilename(title: string) {
  const name = title
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim()
  return `${name || "pull-request"}-pr.md`
}

// An inline code span whose fence is longer than any backtick run inside the text, padded when the
// text itself starts or ends with a backtick (CommonMark).
export function codeSpan(text: string) {
  const fence = "`".repeat(Math.max(0, ...[...text.matchAll(/`+/g)].map((run) => run[0].length)) + 1)
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : ""
  return `${fence}${pad}${text}${pad}${fence}`
}
