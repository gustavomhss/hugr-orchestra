import path from "node:path"
import { Ripgrep } from "@orchestra/core/ripgrep"

export const captureDescription = [
  "Capture permitted file/URL evidence (kind \"file\" or \"url\", the URL under webfetch's permission), or Git state in the bound worktree (kind \"history\").",
  "History operations: log (full hashes of commits touching one path); show (one file at a commit); diff (one file between base and revision);",
  "blame (who last changed each line of one file at a commit, optional start/end lines: line, commit, authorTime, summary, content), for attributing current code;",
  "compare (range diff between base and revision over 1-16 worktree paths or directories, stat:true for per-file added/deleted counts only; refused when it touches over 100 files or any file the read policy denies), for what changed between two known commits;",
  "search (commits filtered by a case-insensitive message substring and/or a path, newest first, limit 1-50: commit, authorTime, summary), for regression archaeology when the introducing commit is unknown;",
  "resolve (one ref such as HEAD~1, a branch or a tag to its full commit hash); status (HEAD hash, current branch and dirty paths of the working tree).",
  "Other history operations take full commit hashes only (use resolve first), default revision to native HEAD, and report shallow/limited coverage and byte-bounded partial captures; no commands or process roots are accepted.",
  "Line numbers are always original-file lines, 1-based and inclusive: start/end select them, and a file capture returns lines {basis:\"original\", start, end}.",
  "A new capture returns its receipt (cite its ref) on the first line, then the captured text, so do not read the same span again. A capture whose bytes are already retained in this dispatch returns {ref, unchanged:true} and nothing else; a changed span returns the new capture with changed:true and the previous ref.",
  "Receipts mark partial captures. Use research_view for retained bytes; no owner, digest, body or storage path accepted as authority.",
].join(" ")

export const viewDescription = [
  "Reopen retained research: corpus lists bounded admitted source/record/document handles; attempts pages actual acquisition outcomes;",
  "records/source/document reopen exact revisions; find searches literal text in one admitted representation and gives each match its line.",
  "Use returned handles/revisions/cursors, never filesystem paths or guessed owner/root fields. Bounded pages and partial captures remain explicit.",
  "Line numbers are original-file lines, 1-based and inclusive (lines.basis \"original\"); basis \"retained\" means the source has no original line origin.",
  "A source or document page still in your context comes back as {ref, unchanged:true}, not its bytes again.",
  "Historical records do not prove present applicability.",
].join(" ")

export const recordDescription =
  "Retain a research question, evidenced finding, justified relation or cohesive Markdown document. Supply authored fields and exact admitted references only. Updates require id/baseRevision and findings require a material revision reason. Documents use citations mapped to EvidenceRef and Markdown links research:<label>. Returned IDs/receipts are host facts. Product files, approval and shared Knowledge are not edited. Simple source answers need not create a dossier."

export const inquiryDescription = [
  "This dispatch's investigation; the host keeps its state and returns it with every action.",
  "",
  "Actions:",
  "- close: sufficiency (answered, partial, blocked), answer, and claims [{proposition, nature, evidence, subquestion?, scope?}], numbered claim-1 on. It checks them with the answer before writing anything and names what to fix. At tier quick, pass question instead of opening first.",
  "- open: question, 1-6 subquestions, profile.",
  "- claim: one claim before close, same fields plus subquestion.",
  "- hypothesize, resolve (with evidence), drop (with reason), check, status.",
  "nature: extraction, observation or inference. evidence: {source, lines:{start,end}} or {source, quote}.",
  "",
  "Lines: original-file, 1-based, inclusive.",
  "Empty: zero claims or no resolved evidence is never answered.",
  "Retains: every write; the host builds the card.",
  "Budget: close is never refused by the deadline or any allowance; past the deadline the state says so and you close now.",
  "Fails: inquiry_state, binding_missing.",
].join("\n")

export const searchDescription = [
  "Ripgrep search of the working tree for exact text. For a symbol's definition or callers use code_query; to find where a behavior lives, code_locate. Batch several patterns in one regex or parallel calls.",
  "",
  "pattern: at most 512 characters. mode: literal (default), identifier (bounded by identifier characters) or regex. caseSensitive: false ignores case. paths: up to 16 globs, e.g. src/**/*.ts or !**/test/**. context: 0 to 5 lines. limit: default 50, max 200; next gives the offset. Hidden files are searched, .gitignore respected.",
  "",
  "Lines: rows are path:line text, 1-based, sorted by path.",
  "Empty: absent from this scope only when coverage.complete is true; otherwise it proves nothing.",
  "Retains: nothing; capture the range to cite it.",
  "Fails: index_unavailable (no ripgrep), unsupported (invalid pattern), source_unavailable.",
].join("\n")

export const locateDescription = [
  "Start here for where, how and why questions about code. One call runs many searches (ripgrep and the code index), fuses them, rereads every range on disk and returns ranked file:line ranges with their lines.",
  "",
  "Give everything you know in one call: terms (up to 16), symbols (up to 16, e.g. DiscoveryResult.assemble), question (plain words). paths (globs) narrows; limit defaults to 12, max 40.",
  "",
  "Lines: original 1-based, inclusive startLine and endLine; a long range shows its first 40 lines.",
  "Empty: no range matched; check searches and basis.coverage.complete before claiming absence.",
  "Retains: one snapshot of every range, citable by its ref and original lines, with no further capture.",
  "Fails: index_unavailable (no ripgrep), unsupported (no input, or outside a research dispatch).",
].join("\n")

export const queryDescription = [
  "Ask the prebuilt code index about a named symbol or file; one call answers what several greps would.",
  "",
  "op: definition (also first callers and file imports), references, callers, callees, implementations, imports and importers (need path), symbols (outline of path, or by name, kind, exported), map (files ranked by importance).",
  "Target: name (\"DiscoveryResult.assemble\") narrowed by path, or symbol id, or at {path, line, column}. An ambiguous name returns candidates only: repeat with symbol. limit max 200; next pages.",
  "",
  "Lines: 1-based, inclusive, as on disk.",
  "Empty: no match in the index; absence is claimed only when basis.coverage.complete and freshness allow.",
  "Retains: nothing; capture the file range to cite it.",
  "Fails: index_unavailable, index_building, reference_invalid.",
].join("\n")

export const probeDescription = [
  "Run one probe in a fresh read-only snapshot of the worktree or a commit: `typecheck` (a tsconfig), `test` (one test file, optional name) or `script` (ts, js or py, up to 16 KiB). No network, no writes outside its scratch. `expect` makes the verdict reproduced or not_reproduced; `hypothesis` lets the host record and resolve it. Charged in probe seconds.",
  "",
  "Lines: diagnostics carry the original file path with 1-based line and column.",
  "Empty: an empty stdout or stderr means the runner printed nothing; it proves nothing beyond this run.",
  "Retains: every result, failed or not, as structured JSON; cite its source with a JSON pointer such as /verdict.",
  "Fails: probe_timeout, probe_memory, probe_denied, budget_exhausted.",
].join("\n")
