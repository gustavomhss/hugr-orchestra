// @atlas/cli — src/surface-mine.ts  (the Atlas screen's Genesis mining; @orchestra/atlas-boundary `./mine` — D39)
//
// The Orchestra host asks its models asynchronously and cannot import this package from the surface (the layer ring),
// so it mines in two synchronous calls around its own model calls. Both run the CLI's own governed pass
// (`driveMinePass`), advisory arm, with the history source `atlas mine` injects: `mineSites` with a proposer that
// records each visited site's prompt and abstains, `mineWith` with a proposer that answers each site from the replies
// the host collected, through the answer gate the command client applies. Candidates are staged, never promoted.
import {
  admitAnswerText,
  advisoryClaimParser,
  createHistorySource,
  createPromptFactory,
  createUnitSourceReader,
  PROPOSE_TEMPLATE,
} from "@atlas/adapter-io"
import { cappedBudget } from "@atlas/genesis"
import { driveMinePass } from "./mine.js"
import { mineOutcome, mineWhyEmpty } from "./mine-render.js"

export interface MineSite {
  /** The site's `qualifiedPath`, the key `mineWith` answers by. */
  readonly key: string
  /** The exact advisory prompt `atlas mine` would send for this site. */
  readonly prompt: string
}

export interface MineSites {
  readonly sites: readonly MineSite[]
  readonly promptDigest: string
}

export interface MineResult {
  /** Sites the pass completed against the ceiling. */
  readonly sites: number
  /** Candidate facts staged. */
  readonly facts: number
  readonly complete: boolean
  /** Why nothing was staged, read off the pass; null when something was. */
  readonly why: string | null
  readonly refusal: "contended" | "unreadable" | "untrusted" | null
}

export function mineSites(repoPath: string, ceiling: number): MineSites {
  const prompts = createPromptFactory({ source: createUnitSourceReader(repoPath), templateText: PROPOSE_TEMPLATE })
  const sites: MineSite[] = []
  driveMinePass(repoPath, {
    history: createHistorySource(repoPath, "HEAD"),
    slot: "advisory",
    budget: cappedBudget(ceiling),
    proposer: {
      propose: (cand) => {
        sites.push({ key: cand.site.qualifiedPath, prompt: prompts.build(cand) })
        return null
      },
    },
  })
  return { sites, promptDigest: String(prompts.digest) }
}

export function mineWith(
  repoPath: string,
  ceiling: number,
  answers: Readonly<Record<string, string>>,
  model: string,
): MineResult {
  const replies = new Map(Object.entries(answers))
  const pass = driveMinePass(repoPath, {
    history: createHistorySource(repoPath, "HEAD"),
    slot: "advisory",
    budget: cappedBudget(ceiling),
    modelIdentity: model,
    proposer: {
      propose: (cand) => {
        const reply = replies.get(cand.site.qualifiedPath)
        if (reply === undefined) return null
        const admitted = admitAnswerText(reply)
        if (admitted.claim === null)
          return admitted.abstainReason === undefined ? null : { abstain: admitted.abstainReason }
        return advisoryClaimParser(admitted.claim, cand, admitted.rawAnswer)
      },
    },
  })
  const outcome = mineOutcome(pass.report, true, ceiling)
  return {
    sites: outcome.sitesVisited,
    facts: outcome.facts,
    complete: outcome.complete,
    why: mineWhyEmpty(outcome),
    refusal: pass.refusal ?? null,
  }
}
