// Copy owned by the Atlas overview view (A19). Keys: orchestra.atlas.overview.<name>, English verbatim from specs/atlas-ui/mock.
export const ATLAS_OVERVIEW_COPY = {
  "orchestra.atlas.overview.travel.title": "It travels with your repo",
  "orchestra.atlas.overview.travel.lead":
    "Atlas lives in git next to the code. A pull request changes it, a merge brings it along, and any machine that clones the repository gets it back.",
  "orchestra.atlas.overview.travel.committed": "Committed, pushed to the remote",
  "orchestra.atlas.overview.travel.memory":
    "What every agent saved. Append-only, one line per memory: two branches merge as a union, and duplicates fold by content id.",
  "orchestra.atlas.overview.travel.orientation": "Where the project stands, identical for every member.",
  "orchestra.atlas.overview.travel.policy": "Who may write what. Reviewed in pull requests like code.",
  "orchestra.atlas.overview.travel.skills": "The ownership skills, one SKILL.md per scope, with their coverage list.",
  "orchestra.atlas.overview.travel.origin": "origin",
  "orchestra.atlas.overview.travel.origin.detail": "branch · PR · merge",
  "orchestra.atlas.overview.travel.clone": "any clone",
  "orchestra.atlas.overview.travel.clone.detail": "a teammate, CI, a new laptop",
  "orchestra.atlas.overview.travel.rebuilt": "Rebuilt on each machine",
  "orchestra.atlas.overview.travel.cas":
    "The facts and their versions. Content-addressed, so the same claim gets the same name on every machine.",
  "orchestra.atlas.overview.travel.index": "The code index, regenerated from the code at that commit.",
  "orchestra.atlas.overview.travel.staging":
    "Suggestions waiting for review. Genesis mines them again; they are never committed, so nothing half-reviewed leaks into history.",
  "orchestra.atlas.overview.travel.step.pr": "Open a PR",
  "orchestra.atlas.overview.travel.step.pr.text": "Memories, policy and ownership skills change in the same diff as the code they describe.",
  "orchestra.atlas.overview.travel.step.merge": "Merge",
  "orchestra.atlas.overview.travel.step.merge.text": "Logs union line by line; ownership skills whose code changed hold until refreshed.",
  "orchestra.atlas.overview.travel.step.clone": "Clone anywhere",
  "orchestra.atlas.overview.travel.step.clone.text":
    "Run Genesis: the index and store come back from the code; memory and ownership skills are already there.",
  "orchestra.atlas.overview.travel.export":
    "To move a whole store in one piece, <code>atlas export</code> writes an <code>atlas-okf.json</code> bundle that imports into an empty store, all or nothing.",
  "orchestra.atlas.overview.travel.export.help":
    "modules/atlas/.gitignore: .atlas/* is ignored except memory.jsonl, orientation.jsonl and policy.json; staging is denied at any depth.",
  "orchestra.atlas.overview.keep.badge.runs": "Runs",
  "orchestra.atlas.overview.keep.badge.built": "Built",
  "orchestra.atlas.overview.keep.badge.designed": "Designed",
  "orchestra.atlas.overview.keep.title": "How Atlas stays free of drift",
  "orchestra.atlas.overview.keep.lead":
    "Every fact and every ownership skill is bound to the exact bytes of the code it describes. When that code changes, Atlas is either refreshed in the same pull request, or it stops being served until it is.",
  "orchestra.atlas.overview.keep.anchor":
    "<b>The anchor.</b> A fact carries the hash of the code under it (<code>path@subtreeHash</code>); an ownership skill carries the git blob of every file it covers. Change one byte and the hash no longer matches. That mismatch is what every step below looks for.",
  "orchestra.atlas.overview.keep.refreshed": "Refreshed in the pull request",
  "orchestra.atlas.overview.keep.refreshed.code": "Code changes",
  "orchestra.atlas.overview.keep.refreshed.code.text": "A pull request edits <code>packages/billing</code>.",
  "orchestra.atlas.overview.keep.refreshed.drift": "Atlas sees it",
  "orchestra.atlas.overview.keep.refreshed.drift.text":
    "Facts on the changed files show as changed in Review › Changed, with the commit that moved them.",
  "orchestra.atlas.overview.keep.refreshed.fact": "Refresh",
  "orchestra.atlas.overview.keep.refreshed.fact.text":
    "Rewrite or confirm those facts and re-materialize the ownership skill, in the same PR as the code.",
  "orchestra.atlas.overview.keep.refreshed.shield": "CI proves it",
  "orchestra.atlas.overview.keep.refreshed.shield.text":
    "<code>own-snapshot-guard</code> re-renders every ownership skill and re-hashes its files. Equal bytes: green.",
  "orchestra.atlas.overview.keep.merged": "Merged without refreshing",
  "orchestra.atlas.overview.keep.merged.code": "Code merges",
  "orchestra.atlas.overview.keep.merged.code.text": "Atlas was not touched, or CI did not run on that PR.",
  "orchestra.atlas.overview.keep.merged.lock": "Held, not served",
  "orchestra.atlas.overview.keep.merged.lock.text":
    "Stale facts travel marked stale. The ownership skill no longer matches its files, so Maestro holds instead of handing it to an agent.",
  "orchestra.atlas.overview.keep.merged.list": "Worklist",
  "orchestra.atlas.overview.keep.merged.list.text":
    "A deterministic list of the skills whose files changed, computed from hashes, no model.",
  "orchestra.atlas.overview.keep.merged.agents": "Rebuild",
  "orchestra.atlas.overview.keep.merged.agents.text":
    "A repair pull request refreshes exactly those skills, then the same CI check must pass. New capability · R9.",
  "orchestra.atlas.overview.keep.ci": "CI",
  "orchestra.atlas.overview.keep.ci.text":
    "The atlas job in <code>test.yml</code> runs 13 Atlas guards, <code>own-snapshot-guard</code> among them, on epic pull requests and on demand; there, a failing guard blocks the merge. Running it on every pull request is new capability · R10.",
  "orchestra.atlas.overview.keep.maintainer": "{{name}}, the maintainer",
  "orchestra.atlas.overview.keep.maintainer.text":
    "The team's maintenance seat: documentation freshness, stale claims, orphaned files. Built today for documentation changes; curating Atlas and repo hygiene is her designed scope.",
  "orchestra.atlas.overview.keep.sources":
    "Sources: harness/gates/own-snapshot-guard.mjs, .github/workflows/test.yml (Run Atlas guards), specs/hugr-maestro/own-protocol.md (CI freshness path), docs/CONVENTIONS.md, maestro/seats/rosie.ts.",
}
