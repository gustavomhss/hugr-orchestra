// @atlas/adapter-io — src/pr-record.ts  (the Atlas record in a pull request body)
//
// The host writes Atlas's record into the body of the PR that lands a bundle (repo-layout design §8, step 5): one
// table row per attempt, and a hidden comment naming each `{card, attempt}`, so a reader of the PR finds the attempt
// files in `.atlas/cards/<CARD>/attempts/a<n>.jsonl`. The attempt files stay the record; the PR body only points back.
//
// The block sits between two markers and is replaced in place, so the rest of the body, written by people, is kept.
// On a public repository the row drops spend (design §6); the caller decides `redact` from `repo-visibility.ts`.

import type { AttemptEntry } from "./card-log.js"
import type { GetJson } from "./repo-visibility.js"

const START = "<!-- atlas-record:start -->"
const END = "<!-- atlas-record:end -->"
const REFS = /<!-- atlas-record:refs (.*?) -->/

export interface AttemptRef {
  readonly card: string
  readonly attempt: number
}

/** `body` with its Atlas record block replaced, or appended when it has none. */
export function withPrRecord(body: string, entries: readonly AttemptEntry[], opts: { readonly redact: boolean }): string {
  const block = renderBlock(entries, opts.redact)
  const start = body.indexOf(START)
  const end = body.indexOf(END, start)
  if (start >= 0 && end >= 0) return body.slice(0, start) + block + body.slice(end + END.length)
  return body.trimEnd() === "" ? block : `${body.trimEnd()}\n\n${block}`
}

/** The attempts a PR body's record names; none when it has no block or the block is malformed. */
export function readPrRecord(body: string): readonly AttemptRef[] {
  const start = body.indexOf(START)
  const match = REFS.exec(start < 0 ? "" : body.slice(start))
  if (match === null) return []
  const refs = parseJson(match[1] ?? "")
  if (!Array.isArray(refs)) return []
  return refs.filter(
    (ref): ref is AttemptRef =>
      typeof ref === "object" && ref !== null && typeof ref.card === "string" && Number.isInteger(ref.attempt),
  )
}

/** The one HTTP call that writes, injectable so a test can answer it. Defaults to the global `fetch`. */
export type SendJson = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ readonly status: number }>

/**
 * Write the record into GitHub PR `number` of `slug` (`owner/repo`): read the current body, replace the block, write it
 * back. The token comes from `GITHUB_TOKEN` or `GH_TOKEN`; without one, or on any status but 200, it throws.
 */
export async function writeGithubPrRecord(
  slug: string,
  number: number,
  entries: readonly AttemptEntry[],
  opts: { readonly redact: boolean; readonly get?: GetJson; readonly send?: SendJson },
): Promise<void> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  if (token === undefined || token === "") throw new Error("writing a PR record needs GITHUB_TOKEN or GH_TOKEN")
  const url = `https://api.github.com/repos/${slug}/pulls/${number}`
  const headers = { accept: "application/vnd.github+json", authorization: `Bearer ${token}` }
  const get = opts.get ?? ((target, h) => fetch(target, { headers: h }))
  const send = opts.send ?? ((target, init) => fetch(target, init))
  const read = await get(url, headers)
  if (read.status !== 200) throw new Error(`reading PR ${slug}#${number} answered ${read.status}`)
  const pr = (await read.json()) as { body?: unknown }
  const body = withPrRecord(typeof pr.body === "string" ? pr.body : "", entries, opts)
  const written = await send(url, { method: "PATCH", headers, body: JSON.stringify({ body }) })
  if (written.status !== 200) throw new Error(`writing PR ${slug}#${number} answered ${written.status}`)
}

function renderBlock(entries: readonly AttemptEntry[], redact: boolean): string {
  const rows = entries.map((entry) => {
    const m = entry.metering
    const cost = redact || m.costMicroUsd === undefined ? "" : `$${(m.costMicroUsd / 1e6).toFixed(4)}`
    return [
      entry.card,
      `a${entry.n}`,
      m.seat,
      m.engine,
      m.model,
      m.verdict,
      m.gates.join(", "),
      `${m.tokensIn} / ${m.tokensOut}`,
      `${Math.round(m.wallTime / 1000)}s`,
      cost,
      m.transcriptSha === "" ? "" : `\`${m.transcriptSha.slice(0, 12)}\``,
    ]
      .map(cell)
      .join(" | ")
  })
  const refs = JSON.stringify(entries.map((entry) => ({ card: entry.card, attempt: entry.n })))
  return [
    START,
    "### Atlas record",
    "",
    "| Card | Attempt | Seat | Engine | Model | Verdict | Gates | Tokens in / out | Wall | Cost | Transcript |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((row) => `| ${row} |`),
    "",
    // A card id is free text, so `--` goes out as a JSON escape and the comment cannot end early.
    `<!-- atlas-record:refs ${refs.replaceAll("--", "\\u002d\\u002d")} -->`,
    END,
  ].join("\n")
}

function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ")
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
